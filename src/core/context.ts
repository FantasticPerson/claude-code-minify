import { Message, ContextConfig } from './types.js'
import { estimateMessagesTokens } from '../providers/base.js'
import {
  DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS,
  DEFAULT_COMPRESS_TRIGGER_RATIO, DEFAULT_COMPRESS_TARGET_RATIO,
  DEFAULT_COMPRESS_RECENT_ROUNDS, DEFAULT_TOOL_RESULT_COMPRESS_THRESHOLD,
} from './defaults.js'

const COMPACTABLE_TOOLS = new Set([
  'file_read',
  'bash',
  'grep',
  'glob',
  'web_search',
  'web_fetch',
])

export class ContextManager {
  private messages: Message[] = []
  private maxTokens: number
  private compressTriggerRatio: number
  private compressTargetRatio: number
  private compressRecentRounds: number
  private toolResultCompressThreshold: number

  constructor(maxTokens: number = DEFAULT_CONTEXT_WINDOW - DEFAULT_MAX_TOKENS, config?: ContextConfig) {
    this.maxTokens = maxTokens
    this.compressTriggerRatio = Math.max(0.1, Math.min(1, config?.compressionTriggerRatio ?? DEFAULT_COMPRESS_TRIGGER_RATIO))
    this.compressTargetRatio = Math.max(0.1, Math.min(this.compressTriggerRatio, config?.compressionTargetRatio ?? DEFAULT_COMPRESS_TARGET_RATIO))
    this.compressRecentRounds = config?.compressRecentRounds ?? DEFAULT_COMPRESS_RECENT_ROUNDS
    this.toolResultCompressThreshold = config?.toolResultCompressThreshold ?? DEFAULT_TOOL_RESULT_COMPRESS_THRESHOLD
  }

  add(message: Message): void {
    this.messages.push(message)
  }

  getMessages(): Message[] {
    return this.messages
  }

  reset(): void {
    this.messages = []
  }

  getLength(): number {
    return this.messages.length
  }

  /**
   * Compress context based on actual API token usage.
   * Called after each API response with the real inputTokens from the provider.
   * This is more reliable than any estimation-based approach.
   */
  compressIfNeeded(realInputTokens: number): boolean {
    // Trigger at 80% of context window, aggressive trim to 60%
    if (realInputTokens <= this.maxTokens * this.compressTriggerRatio) return false

    console.log(`[Context] compress triggered by actual usage: ${realInputTokens} > ${Math.round(this.maxTokens * this.compressTriggerRatio)} (${Math.round(this.compressTriggerRatio * 100)}% of ${this.maxTokens})`)

    this.compressOldToolResults()

    // Re-check with estimation after compressing tool results
    // Use a conservative estimate: if we freed enough, skip truncation
    const estimated = estimateMessagesTokens(this.messages)
    const target = this.maxTokens * this.compressTargetRatio

    if (estimated <= target) return true

    this.truncateMessages(target)
    return true
  }

  private compressOldToolResults(): void {
    const protectedStart = Math.max(0, this.messages.length - this.compressRecentRounds * 2)

    const compactableIds = new Set<string>()
    for (let i = 0; i < protectedStart; i++) {
      const msg = this.messages[i]
      if (msg.role === 'assistant') {
        for (const block of msg.content) {
          if (block.type === 'tool_use' && COMPACTABLE_TOOLS.has(block.name)) {
            compactableIds.add(block.id)
          }
        }
      }
    }

    for (let i = 0; i < protectedStart; i++) {
      const msg = this.messages[i]
      if (msg.role === 'user') {
        for (const block of msg.content) {
          if (
            block.type === 'tool_result'
            && compactableIds.has(block.toolUseId)
            && typeof block.content === 'string'
            && block.content.length > this.toolResultCompressThreshold
          ) {
            block.content = `[Compressed: original ${block.content.split('\n').length} lines]`
          }
        }
      }
    }
  }

  private truncateMessages(target: number): void {
    const result: Message[] = []
    let used = 0

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessagesTokens([this.messages[i]])
      if (used + msgTokens > target && result.length >= 2) break
      used += msgTokens
      result.unshift(this.messages[i])
    }

    // Ensure tool_use/tool_result pairing is complete after truncation
    while (result.length > 0) {
      const first = result[0]
      if (first.role === 'assistant' && first.content.some(b => b.type === 'tool_use')) {
        const toolUseIds = new Set(
          first.content.filter(b => b.type === 'tool_use').map(b => b.id)
        )
        if (result.length >= 2 && result[1].role === 'user') {
          const resultIds = new Set(
            (result[1].content || [])
              .filter(b => b.type === 'tool_result')
              .map(b => b.toolUseId)
          )
          if ([...toolUseIds].some(id => resultIds.has(id))) break
        }
        result.shift()
        if (result.length > 0 && result[0].role === 'user' && result[0].content.some(b => b.type === 'tool_result')) {
          result.shift()
        }
        continue
      }
      if (first.role === 'user' && first.content.some(b => b.type === 'tool_result')) {
        result.shift()
        continue
      }
      break
    }

    // Ensure first message is from user
    if (result.length > 0 && result[0].role === 'assistant') {
      result.unshift({ role: 'user', content: [{ type: 'text', text: '[Context trimmed]' }] })
    }

    this.messages = result
  }
}
