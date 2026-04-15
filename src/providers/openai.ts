import OpenAI from 'openai'
import { LLMProvider } from './base.js'
import { ChatParams, ChatResponse, StreamEvent, Message, ToolUseBlock, UsageInfo } from '../core/types.js'

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI

  constructor(baseURL: string, apiKey: string) {
    this.client = new OpenAI({ baseURL, apiKey })
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const oaiMessages = this.convertMessages(params.system, params.messages)
    const tools = this.convertTools(params.tools)

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: oaiMessages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
    })

    const choice = response.choices[0]
    const text = choice.message.content || ''
    const toolUses = this.extractToolUses(choice.message)

    return {
      text,
      toolUses,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : (choice.finish_reason ?? 'end_turn'),
    }
  }

  async *chatStream(params: ChatParams): AsyncIterable<StreamEvent> {
    const oaiMessages = this.convertMessages(params.system, params.messages)
    const tools = this.convertTools(params.tools)

    const stream = await this.client.chat.completions.create({
      model: params.model,
      messages: oaiMessages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      stream: true,
      stream_options: { include_usage: true },
    })

    const toolBuffers = new Map<number, { id: string; name: string; input: string }>()
    let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 }
    let stopReason = 'end_turn'

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) {
        // Usage-only chunk at the end
        if (chunk.usage) {
          usage = { inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 }
        }
        continue
      }

      if (delta.content) {
        yield { type: 'text_delta', text: delta.content }
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) {
            const buf = { id: tc.id || '', name: tc.function.name, input: '' }
            toolBuffers.set(tc.index, buf)
            yield { type: 'tool_use_start', id: buf.id, name: buf.name }
          }
          if (tc.function?.arguments) {
            const buf = toolBuffers.get(tc.index)
            if (buf) {
              buf.input += tc.function.arguments
              yield { type: 'tool_use_delta', input: tc.function.arguments }
            }
          }
        }
      }

      if (chunk.usage) {
        usage = { inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 }
      }

      const finish = chunk.choices[0]?.finish_reason
      if (finish) {
        stopReason = finish === 'tool_calls' ? 'tool_use' : finish
      }
    }

    for (const [, buf] of toolBuffers) {
      let parsed: Record<string, any> = {}
      try { parsed = JSON.parse(buf.input) } catch {}
      yield { type: 'tool_use_end', id: buf.id, name: buf.name, input: parsed }
    }

    yield { type: 'message_end', usage, stopReason }
  }

  async countTokens(messages: Message[]): Promise<number> {
    let total = 0
    for (const msg of messages) {
      total += 4
      for (const block of msg.content) {
        if (block.type === 'text') total += Math.ceil(block.text.length / 4)
        else total += 20
      }
    }
    return total
  }

  private convertMessages(system: { text: string }[], messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = []
    const systemText = system.map(s => s.text).join('\n\n')
    if (systemText) result.push({ role: 'system', content: systemText })

    for (const msg of messages) {
      if (msg.role === 'assistant') {
        const textParts = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text)
        const toolParts = msg.content.filter(b => b.type === 'tool_use').map(b => {
          const tu = b as ToolUseBlock
          return { id: tu.id, type: 'function' as const, function: { name: tu.name, arguments: JSON.stringify(tu.input) } }
        })
        result.push({
          role: 'assistant',
          content: textParts.join('') || null,
          ...(toolParts.length > 0 ? { tool_calls: toolParts } : {}),
        })
      } else {
        const textParts = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text)
        const toolResults = msg.content.filter(b => b.type === 'tool_result') as Extract<typeof msg.content[number], { type: 'tool_result' }>[]
        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            result.push({ role: 'tool', tool_call_id: tr.toolUseId, content: tr.content })
          }
          if (textParts.length > 0) result.push({ role: 'user', content: textParts.join('') })
        } else {
          result.push({ role: 'user', content: textParts.join('') })
        }
      }
    }
    return result
  }

  private convertTools(tools: { name: string; description: string; inputSchema: Record<string, any> }[]): OpenAI.ChatCompletionTool[] {
    return tools.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } }))
  }

  private extractToolUses(message: OpenAI.ChatCompletionAssistantMessageParam): ToolUseBlock[] {
    if (!message.tool_calls) return []
    return message.tool_calls.map(tc => ({ type: 'tool_use' as const, id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments || '{}') }))
  }
}
