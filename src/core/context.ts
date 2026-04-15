import { Message } from './types.js'
import { estimateMessagesTokens } from '../providers/base.js'

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
