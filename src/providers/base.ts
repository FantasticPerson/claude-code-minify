import { ChatParams, ChatResponse, StreamEvent, Message } from '../core/types.js'

export interface LLMProvider {
  chat(params: ChatParams): Promise<ChatResponse>
  chatStream(params: ChatParams): AsyncIterable<StreamEvent>
  countTokens(messages: Message[]): Promise<number>
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0
  for (const msg of messages) {
    total += 4
    for (const block of msg.content) {
      if (block.type === 'text') total += estimateTokens(block.text)
      else if (block.type === 'tool_use') total += estimateTokens(JSON.stringify(block.input))
      else if (block.type === 'tool_result') total += estimateTokens(block.content)
    }
  }
  return total
}
