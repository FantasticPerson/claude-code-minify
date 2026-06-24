import OpenAI from 'openai'
import { LLMProvider, estimateMessagesTokens } from './base.js'
import { ChatParams, ChatResponse, StreamEvent, Message, ToolUseBlock, UsageInfo } from '../core/types.js'
import { logger } from '../core/logger.js'

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI

  constructor(baseURL: string, apiKey: string, options?: { timeout?: number; maxRetries?: number }) {
    this.client = new OpenAI({ baseURL, apiKey, ...(options ?? {}) })
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    logger.log('provider', 'OpenAI chat() called', { model: params.model, messageCount: params.messages.length })
    const oaiMessages = this.convertMessages(params.system, params.messages)
    const tools = this.convertTools(params.tools)

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: oaiMessages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
    }, params.signal ? { signal: params.signal } : undefined)

    const choice = response.choices?.[0]
    if (!choice?.message) {
      return { text: '', toolUses: [], usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'end_turn' }
    }
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
    logger.log('provider', 'OpenAI chatStream() started', { model: params.model, messageCount: params.messages.length, toolCount: params.tools.length })
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
    }, params.signal ? { signal: params.signal } : undefined)

    const toolBuffers = new Map<number, { id: string; name: string; input: string }>()
    let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 }
    let stopReason = 'end_turn'

    try {
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
      // 兼容智谱 GLM 等带 reasoning_content 的模型：作为独立 thinking 事件，不作为最终文本输出
      const reasoning = (delta as Record<string, unknown>).reasoning_content
      if (typeof reasoning === 'string') {
        yield { type: 'thinking_delta', text: reasoning }
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
    } catch (err) {
      if (params.signal?.aborted) return
      throw err
    }

    for (const [, buf] of toolBuffers) {
      let parsed: Record<string, any> = {}
      try { parsed = JSON.parse(buf.input) } catch { logger.error('provider', 'Failed to parse tool input JSON', { name: buf.name }) }
      yield { type: 'tool_use_end', id: buf.id, name: buf.name, input: parsed }
    }

    yield { type: 'message_end', usage, stopReason }
  }

  async countTokens(messages: Message[]): Promise<number> {
    return estimateMessagesTokens(messages)
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
    const sanitize = (s: any): any => {
      if (!s || typeof s !== 'object') return s
      if (Array.isArray(s)) return s.map(sanitize)
      const out: Record<string, any> = {}
      for (const k of Object.keys(s)) {
        if (k === 'exclusiveMinimum' && typeof s[k] === 'boolean') {
          if (s[k] === true && typeof s.minimum === 'number') {
            // OpenAPI3 -> JSON Schema 7: 'exclusiveMinimum: true + minimum: N' → 'minimum: N+1'(近似) ，安全起见只保留 minimum
          }
          continue
        }
        if (k === 'exclusiveMaximum' && typeof s[k] === 'boolean') {
          continue
        }
        out[k] = sanitize(s[k])
      }
      return out
    }
    return tools.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: sanitize(t.inputSchema) } }))
  }

  private extractToolUses(message: OpenAI.ChatCompletionAssistantMessageParam): ToolUseBlock[] {
    if (!message.tool_calls) return []
    return message.tool_calls.map(tc => {
      let input: Record<string, any> = {}
      try { input = JSON.parse(tc.function.arguments || '{}') } catch { input = {} }
      return { type: 'tool_use' as const, id: tc.id, name: tc.function.name, input }
    })
  }
}
