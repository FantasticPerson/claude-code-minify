import { Message } from '../core/types.js'
import { estimateMessagesTokens } from '../providers/base.js'
import {
  DEFAULT_COMPRESS_TRIGGER_RATIO,
  DEFAULT_COMPRESS_TARGET_RATIO,
  DEFAULT_COMPRESS_RECENT_ROUNDS,
  DEFAULT_TOOL_RESULT_COMPRESS_THRESHOLD,
} from '../core/defaults.js'

export interface CompactResult {
  messages: Message[]
  /** 0 = 未压缩, 1 = 轻度, 2 = 中度, 3 = 重度 */
  phase: number
}

export interface CompactStrategy {
  compact(messages: Message[], budgetTokens: number): CompactResult
}

// ============ NoCompact ============

export class NoCompact implements CompactStrategy {
  compact(messages: Message[], _budgetTokens: number): CompactResult {
    return { messages, phase: 0 }
  }
}

// ============ BasicCompact ============

const COMPACTABLE_TOOLS = new Set([
  'file_read',
  'bash',
  'grep',
  'glob',
  'web_search',
  'web_fetch',
])

export class BasicCompact implements CompactStrategy {
  private compressTriggerRatio: number
  private compressTargetRatio: number
  private compressRecentRounds: number
  private toolResultCompressThreshold: number

  constructor(
    options?: {
      compressTriggerRatio?: number
      compressTargetRatio?: number
      compressRecentRounds?: number
      toolResultCompressThreshold?: number
    },
  ) {
    this.compressTriggerRatio = Math.max(0.1, Math.min(1, options?.compressTriggerRatio ?? DEFAULT_COMPRESS_TRIGGER_RATIO))
    this.compressTargetRatio = Math.max(0.1, Math.min(this.compressTriggerRatio, options?.compressTargetRatio ?? DEFAULT_COMPRESS_TARGET_RATIO))
    this.compressRecentRounds = options?.compressRecentRounds ?? DEFAULT_COMPRESS_RECENT_ROUNDS
    this.toolResultCompressThreshold = options?.toolResultCompressThreshold ?? DEFAULT_TOOL_RESULT_COMPRESS_THRESHOLD
  }

  compact(messages: Message[], budgetTokens: number): CompactResult {
    const triggerThreshold = budgetTokens * this.compressTriggerRatio

    if (estimateMessagesTokens(messages) <= triggerThreshold) {
      return { messages, phase: 0 }
    }

    // Work on a deep copy to avoid mutating input
    const working = JSON.parse(JSON.stringify(messages)) as Message[]

    this.compressOldToolResults(working)

    // Re-check after compressing tool results
    const estimated = estimateMessagesTokens(working)
    const target = budgetTokens * this.compressTargetRatio

    if (estimated <= target) {
      return { messages: working, phase: 1 }
    }

    this.truncateMessages(working, target)
    return { messages: working, phase: 1 }
  }

  private compressOldToolResults(messages: Message[]): void {
    const protectedStart = Math.max(0, messages.length - this.compressRecentRounds * 2)

    const compactableIds = new Set<string>()
    for (let i = 0; i < protectedStart; i++) {
      const msg = messages[i]
      if (msg.role === 'assistant') {
        for (const block of msg.content) {
          if (block.type === 'tool_use' && COMPACTABLE_TOOLS.has(block.name)) {
            compactableIds.add(block.id)
          }
        }
      }
    }

    for (let i = 0; i < protectedStart; i++) {
      const msg = messages[i]
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

  private truncateMessages(messages: Message[], target: number): void {
    const result: Message[] = []
    let used = 0

    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessagesTokens([messages[i]])
      if (used + msgTokens > target && result.length >= 2) break
      used += msgTokens
      result.unshift(messages[i])
    }

    // Ensure tool_use/tool_result pairing is complete after truncation
    while (result.length > 0) {
      const first = result[0]
      if (first.role === 'assistant' && first.content.some(b => b.type === 'tool_use')) {
        const toolUseIds = new Set(
          first.content.filter((b): b is import('../core/types.js').ToolUseBlock => b.type === 'tool_use').map(b => b.id),
        )
        if (result.length >= 2 && result[1].role === 'user') {
          const resultIds = new Set(
            (result[1].content || [])
              .filter((b): b is import('../core/types.js').ToolResultBlock => b.type === 'tool_result')
              .map(b => b.toolUseId),
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

    messages.length = 0
    messages.push(...result)
  }
}

// ============ TieredCompact ============

export interface TieredCompactOptions {
  keepRecent?: number               // 默认 2
  phaseThresholds?: [number, number, number]  // 默认 [0.75, 0.85, 0.95]
  toolResultTruncateLen?: number    // Phase 1 截断长度，默认 2000
}

export class TieredCompact implements CompactStrategy {
  private keepRecent: number
  private phaseThresholds: [number, number, number]
  private toolResultTruncateLen: number

  constructor(options?: TieredCompactOptions) {
    this.keepRecent = options?.keepRecent ?? 2
    this.phaseThresholds = options?.phaseThresholds ?? [0.75, 0.85, 0.95]
    this.toolResultTruncateLen = options?.toolResultTruncateLen ?? 2000
  }

  compact(messages: Message[], budgetTokens: number): CompactResult {
    const tokens = estimateMessagesTokens(messages)

    // Phase 0: below first threshold
    if (tokens < budgetTokens * this.phaseThresholds[0]) {
      return { messages, phase: 0 }
    }

    // Work on a deep copy
    const working = JSON.parse(JSON.stringify(messages)) as Message[]

    // Phase 1: truncate long tool results
    this.phase1TruncateToolResults(working)

    const afterPhase1 = estimateMessagesTokens(working)
    if (afterPhase1 < budgetTokens * this.phaseThresholds[1]) {
      return { messages: working, phase: 1 }
    }

    // Phase 2: remove tool results entirely
    this.phase2RemoveToolResults(working)

    const afterPhase2 = estimateMessagesTokens(working)
    if (afterPhase2 < budgetTokens * this.phaseThresholds[2]) {
      return { messages: working, phase: 2 }
    }

    // Phase 3: keep only first user message + last N rounds
    this.phase3KeepRecent(working)
    return { messages: working, phase: 3 }
  }

  private phase1TruncateToolResults(messages: Message[]): void {
    for (const msg of messages) {
      if (msg.role === 'user') {
        for (const block of msg.content) {
          if (
            block.type === 'tool_result'
            && typeof block.content === 'string'
            && block.content.length > this.toolResultTruncateLen
          ) {
            const originalLen = block.content.length
            block.content = `[Truncated: original ${originalLen} characters]`
          }
        }
      }
    }
  }

  private phase2RemoveToolResults(messages: Message[]): void {
    for (const msg of messages) {
      if (msg.role === 'user') {
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            block.content = '[Result removed]'
          }
        }
      }
    }
  }

  private phase3KeepRecent(messages: Message[]): void {
    if (messages.length === 0) return

    // Find the first user message to preserve
    let firstUserIdx = -1
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        firstUserIdx = i
        break
      }
    }

    const recentCount = this.keepRecent * 2
    const recentMessages = messages.slice(-recentCount)

    // If first user message is already in recent messages, just use recent
    if (firstUserIdx >= 0 && firstUserIdx >= messages.length - recentCount) {
      messages.length = 0
      messages.push(...recentMessages)
      return
    }

    // Combine: first user message + recent messages
    const result: Message[] = []
    if (firstUserIdx >= 0) {
      result.push(messages[firstUserIdx])
    }
    result.push(...recentMessages)

    messages.length = 0
    messages.push(...result)
  }
}
