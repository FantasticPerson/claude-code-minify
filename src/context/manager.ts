import { Message, ContextConfig } from '../core/types.js'
import { CompactStrategy, CompactResult, BasicCompact } from './strategy.js'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from '../core/defaults.js'

export class ContextManager {
  private messages: Message[] = []
  private strategy: CompactStrategy
  private maxTokens: number

  constructor(maxTokens?: number, config?: ContextConfig, strategy?: CompactStrategy) {
    this.maxTokens = maxTokens ?? DEFAULT_CONTEXT_WINDOW - DEFAULT_MAX_TOKENS
    this.strategy = strategy ?? new BasicCompact(config)
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
   * 根据实际 token 使用量决定是否压缩
   * 返回 CompactResult（包含 phase 信息）
   */
  compressIfNeeded(realInputTokens: number): CompactResult {
    if (realInputTokens <= this.maxTokens * 0.8) {
      return { messages: this.messages, phase: 0 }
    }
    const result = this.strategy.compact(this.messages, this.maxTokens)
    if (result.phase > 0) {
      this.messages = result.messages
    }
    return result
  }

  setStrategy(strategy: CompactStrategy): void {
    this.strategy = strategy
  }
}
