import { ChatParams, ChatResponse, StreamEvent, Message } from '../core/types.js'

export interface LLMProvider {
  chat(params: ChatParams): Promise<ChatResponse>
  chatStream(params: ChatParams): AsyncIterable<StreamEvent>
  countTokens(messages: Message[]): Promise<number>
}

// Per-message overhead: role marker, content array wrapper, formatting tokens
const MESSAGE_OVERHEAD = 8
// Per-block overhead: type discriminator, field names, boundary tokens
const BLOCK_OVERHEAD = 6
// tool_use block extra overhead: id, name fields
const TOOL_USE_EXTRA = 10
// tool_result block extra overhead: tool_use_id, is_error
const TOOL_RESULT_EXTRA = 6

export function estimateTokens(text: string): number {
  let tokens = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK Unified Ideographs: ~1.5-2 tokens per character
      tokens += 2
    } else if (
      (code >= 0x3040 && code <= 0x30ff) || // Hiragana + Katakana
      (code >= 0xac00 && code <= 0xd7af) || // Hangul
      (code >= 0x3000 && code <= 0x303f)     // CJK punctuation
    ) {
      tokens += 1.5
    } else if (code >= 0x80) {
      // Other non-ASCII (emoji, extended Latin, etc.): ~1.3 tokens per char
      tokens += 1.3
    } else if (code === 0x20) {
      // Spaces are often merged
      tokens += 0.2
    } else if (
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a)    // a-z
    ) {
      // ASCII letters: BPE typically groups 3-4 chars per token
      tokens += 0.3
    } else if (code >= 0x30 && code <= 0x39) {
      // Digits: often 1-2 tokens per digit
      tokens += 0.5
    } else {
      // Punctuation, symbols: often their own token
      tokens += 0.7
    }
  }
  return Math.ceil(tokens) || 1
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
    // Each tool definition: name + description + schema JSON + framing
    total += 12
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
