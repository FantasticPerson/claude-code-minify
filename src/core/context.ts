import { Message } from './types.js'
import { estimateMessagesTokens } from '../providers/base.js'

const COMPRESS_RECENT_ROUNDS = 6
const TOOL_RESULT_COMPRESS_THRESHOLD = 500

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

  constructor(maxTokens: number = 200000) {
    this.maxTokens = maxTokens
  }

  add(message: Message): void {
    this.messages.push(message)
  }

  getMessages(): Message[] {
    this.trimMessages()
    return this.messages
  }

  reset(): void {
    this.messages = []
  }

  getLength(): number {
    return this.messages.length
  }

  private trimMessages(): void {
    const estimated = estimateMessagesTokens(this.messages)
    if (estimated <= this.maxTokens * 0.8) return

    const protectedStart = Math.max(0, this.messages.length - COMPRESS_RECENT_ROUNDS * 2)

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
            && block.content.length > TOOL_RESULT_COMPRESS_THRESHOLD
          ) {
            block.content = `[Compressed: original ${block.content.split('\n').length} lines]`
          }
        }
      }
    }

    const reestimated = estimateMessagesTokens(this.messages)
    if (reestimated <= this.maxTokens * 0.8) return

    const result: Message[] = []
    let budget = 0
    const target = this.maxTokens * 0.6

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessagesTokens([this.messages[i]])
      if (budget + msgTokens > target && result.length >= 2) break
      budget += msgTokens
      result.unshift(this.messages[i])
    }

    this.messages = result
  }
}
