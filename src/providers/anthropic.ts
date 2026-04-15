import Anthropic from '@anthropic-ai/sdk'
import { LLMProvider } from './base.js'
import { ChatParams, ChatResponse, StreamEvent, Message, ToolUseBlock, UsageInfo } from '../core/types.js'

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) })
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: params.model,
      system: params.system.map(s => ({ type: 'text' as const, text: s.text })),
      messages: this.convertMessages(params.messages),
      tools: this.convertTools(params.tools),
      max_tokens: params.maxTokens,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    })

    const textBlocks = response.content.filter(b => b.type === 'text')
    const toolBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]

    return {
      text: textBlocks.map(b => b.text).join(''),
      toolUses: toolBlocks.map(b => ({ type: 'tool_use' as const, id: b.id, name: b.name, input: b.input as Record<string, any> })),
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
    }
  }

  async *chatStream(params: ChatParams): AsyncIterable<StreamEvent> {
    const stream = this.client.messages.stream({
      model: params.model,
      system: params.system.map(s => ({ type: 'text' as const, text: s.text })),
      messages: this.convertMessages(params.messages),
      tools: this.convertTools(params.tools),
      max_tokens: params.maxTokens,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    })

    const toolBuffers = new Map<number, { id: string; name: string; input: string }>()
    let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 }
    let stopReason = 'end_turn'

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolBuffers.set(event.index, { id: event.content_block.id, name: event.content_block.name, input: '' })
          yield { type: 'tool_use_start', id: event.content_block.id, name: event.content_block.name }
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text }
        } else if (event.delta.type === 'input_json_delta') {
          const buf = toolBuffers.get(event.index)
          if (buf) {
            buf.input += event.delta.partial_json
            yield { type: 'tool_use_delta', input: event.delta.partial_json }
          }
        }
      } else if (event.type === 'content_block_stop') {
        const buf = toolBuffers.get(event.index)
        if (buf) {
          let parsed: Record<string, any> = {}
          try { parsed = JSON.parse(buf.input) } catch {}
          yield { type: 'tool_use_end', id: buf.id, name: buf.name, input: parsed }
        }
      } else if (event.type === 'message_delta') {
        if (event.usage) usage = { inputTokens: usage.inputTokens, outputTokens: event.usage.output_tokens ?? usage.outputTokens }
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn'
      } else if (event.type === 'message_start') {
        if (event.message?.usage) usage = { inputTokens: event.message.usage.input_tokens, outputTokens: event.message.usage.output_tokens }
      }
    }

    yield { type: 'message_end', usage, stopReason }
  }

  async countTokens(messages: Message[]): Promise<number> {
    let total = 0
    for (const msg of messages) { total += 4; for (const block of msg.content) { if (block.type === 'text') total += Math.ceil(block.text.length / 4); else total += 20 } }
    return total
  }

  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = []
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        const content: Anthropic.ContentBlockParam[] = []
        for (const block of msg.content) {
          if (block.type === 'text') content.push({ type: 'text', text: block.text })
          else if (block.type === 'tool_use') content.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input })
        }
        result.push({ role: 'assistant', content })
      } else {
        const content: Anthropic.ContentBlockParam[] = []
        for (const block of msg.content) {
          if (block.type === 'text') content.push({ type: 'text', text: block.text })
          else if (block.type === 'tool_result') content.push({ type: 'tool_result', tool_use_id: block.toolUseId, content: block.content, ...(block.isError ? { is_error: true } : {}) })
        }
        result.push({ role: 'user', content })
      }
    }
    return result
  }

  private convertTools(tools: { name: string; description: string; inputSchema: Record<string, any> }[]): Anthropic.Tool[] {
    return tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema as any }))
  }
}
