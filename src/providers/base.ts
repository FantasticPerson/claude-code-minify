import { ChatParams, ChatResponse, StreamEvent, Message } from '../core/types.js'

export interface LLMProvider {
  chat(params: ChatParams): Promise<ChatResponse>
  chatStream(params: ChatParams): AsyncIterable<StreamEvent>
  countTokens(messages: Message[]): Promise<number>
}

const MESSAGE_OVERHEAD = 4
const BLOCK_OVERHEAD = 3
const TOOL_USE_EXTRA = 5
const TOOL_RESULT_EXTRA = 3

export function estimateTokens(text: string): number {
  let ascii = 0
  let cjk = 0
  let other = 0

  for (const char of text) {
    const code = char.codePointAt(0)!
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||   // CJK Unified Ideographs
      (code >= 0x3040 && code <= 0x30ff) ||   // Hiragana + Katakana
      (code >= 0xac00 && code <= 0xd7af) ||   // Hangul
      (code >= 0x3000 && code <= 0x303f) ||   // CJK punctuation
      (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
      (code >= 0x2a700 && code <= 0x2b73f) || // CJK Extension C
      (code >= 0x2b740 && code <= 0x2b81f) || // CJK Extension D
      (code >= 0xf900 && code <= 0xfaff)      // CJK Compatibility Ideographs
    ) {
      cjk++
    } else if (code < 0x80) {
      ascii++
    } else {
      other++
    }
  }

  // ASCII: BPE ~4 chars/token (proven by old length/4 being only 28% low)
  // CJK: ~1.3 tokens/char (up from 0.25 with length/4, main fix)
  // Other non-ASCII: ~2 chars/token
  return Math.ceil(ascii / 4 + cjk * 1.3 + other / 2) || 1
}

export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0
  for (const msg of messages) {
    total += MESSAGE_OVERHEAD
    for (const block of msg.content) {
      total += BLOCK_OVERHEAD
      if (block.type === 'text') {
        total += estimateTokens(block.text)
      } else if (block.type === 'tool_use') {
        total += TOOL_USE_EXTRA
        total += estimateTokens(block.name)
        total += estimateTokens(JSON.stringify(block.input))
      } else if (block.type === 'tool_result') {
        total += TOOL_RESULT_EXTRA
        total += estimateTokens(block.content)
      }
    }
  }
  return total
}

export function estimateToolDefsTokens(tools: { name: string; description: string; inputSchema: Record<string, any> }[]): number {
  let total = 0
  for (const tool of tools) {
    total += 8
    total += estimateTokens(tool.name)
    total += estimateTokens(tool.description)
    total += estimateTokens(JSON.stringify(tool.inputSchema))
  }
  return total
}

export function estimateSystemPromptTokens(system: { text: string }[]): number {
  let total = 0
  for (const s of system) {
    total += BLOCK_OVERHEAD
    total += estimateTokens(s.text)
  }
  return total
}
