import { ChatParams, ChatResponse, StreamEvent, UsageInfo, Message } from '../../src/core/types.js'
import { LLMProvider } from '../../src/providers/base.js'

export interface MockResponse {
  text?: string
  toolUses?: Array<{ id: string; name: string; input: Record<string, any> }>
  usage?: UsageInfo
}

export class MockProvider implements LLMProvider {
  private responses: MockResponse[]
  private delayMs: number

  callCount = 0
  lastParams: ChatParams | null = null

  constructor(responses: MockResponse[], delayMs = 0) {
    this.responses = responses
    this.delayMs = delayMs
  }

  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
    this.callCount++
    this.lastParams = params

    const response = this.responses[this.callCount - 1]
    if (!response) {
      yield {
        type: 'message_end',
        usage: { inputTokens: 0, outputTokens: 0 },
        stopReason: 'end_turn',
      }
      return
    }

    const delay = () => new Promise<void>(r => setTimeout(r, this.delayMs))

    // Yield text deltas (check signal before each, delay to let abort land mid-stream)
    if (response.text) {
      if (params.signal?.aborted) return
      await delay()
      yield { type: 'text_delta', text: response.text }
    }

    // Yield tool use events
    if (response.toolUses) {
      for (const tu of response.toolUses) {
        if (params.signal?.aborted) return
        await delay()
        yield { type: 'tool_use_start', id: tu.id, name: tu.name }
        if (params.signal?.aborted) return
        await delay()
        yield { type: 'tool_use_end', id: tu.id, name: tu.name, input: tu.input }
      }
    }

    // Always end with message_end
    if (params.signal?.aborted) return
    await delay()
    yield {
      type: 'message_end',
      usage: response.usage ?? { inputTokens: 100, outputTokens: 50 },
      stopReason: response.toolUses?.length ? 'tool_use' : 'end_turn',
    }
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    this.callCount++
    this.lastParams = params

    const response = this.responses[this.callCount - 1]
    if (!response) {
      return {
        text: '',
        toolUses: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        stopReason: 'end_turn',
      }
    }

    return {
      text: response.text ?? '',
      toolUses: (response.toolUses ?? []).map(tu => ({
        type: 'tool_use' as const,
        id: tu.id,
        name: tu.name,
        input: tu.input,
      })),
      usage: response.usage ?? { inputTokens: 100, outputTokens: 50 },
      stopReason: response.toolUses?.length ? 'tool_use' : 'end_turn',
    }
  }

  async countTokens(messages: Message[]): Promise<number> {
    return Math.ceil(JSON.stringify(messages).length / 4)
  }
}
