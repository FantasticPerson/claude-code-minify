import { Message, TextBlock, ToolResultBlock, ToolUseBlock } from './types.js'

export function userMessage(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }] }
}

export function assistantTextMessage(text: string): Message {
  return { role: 'assistant', content: [{ type: 'text', text }] }
}

export function assistantToolUseMessage(blocks: ToolUseBlock[]): Message {
  return { role: 'assistant', content: blocks }
}

export function toolResultMessage(results: ToolResultBlock[]): Message {
  return { role: 'user', content: results }
}

export function getTextContent(message: Message): string {
  return message.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

export function getToolUses(message: Message): ToolUseBlock[] {
  return message.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')
}
