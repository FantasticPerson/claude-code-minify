import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Message, StreamEvent } from '../src/core/types.js'
import { OpenAIProvider } from '../src/providers/openai.js'
import { AnthropicProvider } from '../src/providers/anthropic.js'

// ============================================================================
// Helpers
// ============================================================================

/** Collect all events from an async generator */
async function collectStreamEvents(gen: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = []
  for await (const event of gen) {
    events.push(event)
  }
  return events
}

// ============================================================================
// OpenAI Provider — convertMessages (private, accessed via (any))
// ============================================================================

describe('OpenAIProvider: convertMessages', () => {
  let provider: OpenAIProvider

  beforeEach(() => {
    // Create provider with dummy credentials; we never call real APIs
    provider = new OpenAIProvider('https://api.openai.com/v1', 'test-key')
  })

  it('converts a plain user text message', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'Hello world' }] },
    ]
    const result = (provider as any).convertMessages([], messages)
    expect(result).toEqual([
      { role: 'user', content: 'Hello world' },
    ])
  })

  it('prepends system messages as a single system message', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
    ]
    const result = (provider as any).convertMessages(
      [{ text: 'You are helpful.' }, { text: 'Be concise.' }],
      messages,
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ role: 'system', content: 'You are helpful.\n\nBe concise.' })
    expect(result[1]).toEqual({ role: 'user', content: 'Hi' })
  })

  it('omits system message when system text is empty', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
    ]
    const result = (provider as any).convertMessages([], messages)
    expect(result).toEqual([{ role: 'user', content: 'Hi' }])
  })

  it('converts assistant message with text to OpenAI format', () => {
    const messages: Message[] = [
      { role: 'assistant', content: [{ type: 'text', text: 'Sure!' }] },
    ]
    const result = (provider as any).convertMessages([], messages)
    expect(result).toEqual([
      { role: 'assistant', content: 'Sure!' },
    ])
  })

  it('converts assistant message with tool_use to OpenAI tool_calls format', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'call_1', name: 'file_read', input: { file_path: '/tmp/a.txt' } },
        ],
      },
    ]
    const result = (provider as any).convertMessages([], messages)
    expect(result).toHaveLength(1)
    const msg = result[0] as any
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBe('Let me check.')
    expect(msg.tool_calls).toHaveLength(1)
    expect(msg.tool_calls[0].id).toBe('call_1')
    expect(msg.tool_calls[0].type).toBe('function')
    expect(msg.tool_calls[0].function.name).toBe('file_read')
    expect(msg.tool_calls[0].function.arguments).toBe(JSON.stringify({ file_path: '/tmp/a.txt' }))
  })

  it('converts assistant message with multiple tool_use blocks', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call_1', name: 'file_read', input: { file_path: '/tmp/a.txt' } },
          { type: 'tool_use', id: 'call_2', name: 'bash', input: { command: 'ls' } },
        ],
      },
    ]
    const result = (provider as any).convertMessages([], messages)
    const msg = result[0] as any
    expect(msg.content).toBeNull()
    expect(msg.tool_calls).toHaveLength(2)
    expect(msg.tool_calls[0].function.name).toBe('file_read')
    expect(msg.tool_calls[1].function.name).toBe('bash')
  })

  it('converts user message with tool_result to OpenAI tool role messages', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'call_1', content: 'file contents here' },
        ],
      },
    ]
    const result = (provider as any).convertMessages([], messages)
    expect(result).toEqual([
      { role: 'tool', tool_call_id: 'call_1', content: 'file contents here' },
    ])
  })

  it('converts user message with tool_result + text to separate messages', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'call_1', content: 'result data' },
          { type: 'text', text: 'Now please summarize' },
        ],
      },
    ]
    const result = (provider as any).convertMessages([], messages)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: 'result data' })
    expect(result[1]).toEqual({ role: 'user', content: 'Now please summarize' })
  })

  it('converts multiple tool_results in a single user message', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'call_1', content: 'result 1' },
          { type: 'tool_result', toolUseId: 'call_2', content: 'result 2' },
        ],
      },
    ]
    const result = (provider as any).convertMessages([], messages)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: 'result 1' })
    expect(result[1]).toEqual({ role: 'tool', tool_call_id: 'call_2', content: 'result 2' })
  })

  it('converts multi-turn conversation correctly', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'Read the file' }] },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'call_1', name: 'file_read', input: { file_path: '/tmp/x' } }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', toolUseId: 'call_1', content: 'file data' }],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'The file says hello.' }] },
    ]
    const result = (provider as any).convertMessages([], messages)
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual({ role: 'user', content: 'Read the file' })
    expect((result[1] as any).tool_calls).toHaveLength(1)
    expect(result[2]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: 'file data' })
    expect(result[3]).toEqual({ role: 'assistant', content: 'The file says hello.' })
  })
})

// ============================================================================
// OpenAI Provider — stream parsing (mocked client)
// ============================================================================

describe('OpenAIProvider: chatStream parsing', () => {
  it('yields text_delta for streamed text content', async () => {
    const provider = new OpenAIProvider('https://api.openai.com/v1', 'test-key')
    const client = (provider as any).client

    // Mock chat.completions.create to return an async iterable
    vi.spyOn(client.chat.completions, 'create').mockResolvedValue({
      [Symbol.asyncIterator]() {
        const chunks = [
          {
            choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
          },
          {
            choices: [{ delta: { content: ' world' }, finish_reason: null }],
          },
          {
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          },
        ]
        let i = 0
        return {
          async next() {
            if (i < chunks.length) return { value: chunks[i++], done: false }
            return { value: undefined, done: true }
          },
        }
      },
    } as any)

    const events = await collectStreamEvents(
      provider.chatStream({
        model: 'gpt-4',
        system: [],
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        tools: [],
        maxTokens: 1024,
      }),
    )

    const textDeltas = events.filter(e => e.type === 'text_delta')
    expect(textDeltas).toHaveLength(2)
    expect(textDeltas[0].text).toBe('Hello')
    expect(textDeltas[1].text).toBe(' world')

    const end = events.find(e => e.type === 'message_end')!
    expect(end.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
  })

  it('yields tool_use events for streamed tool calls', async () => {
    const provider = new OpenAIProvider('https://api.openai.com/v1', 'test-key')
    const client = (provider as any).client

    vi.spyOn(client.chat.completions, 'create').mockResolvedValue({
      [Symbol.asyncIterator]() {
        const chunks = [
          {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call_abc',
                  function: { name: 'file_read', arguments: '' },
                }],
              },
              finish_reason: null,
            }],
          },
          {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  function: { arguments: '{"file_path":"/tmp/t"}' },
                }],
              },
              finish_reason: null,
            }],
          },
          {
            choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          },
        ]
        let i = 0
        return {
          async next() {
            if (i < chunks.length) return { value: chunks[i++], done: false }
            return { value: undefined, done: true }
          },
        }
      },
    } as any)

    const events = await collectStreamEvents(
      provider.chatStream({
        model: 'gpt-4',
        system: [],
        messages: [{ role: 'user', content: [{ type: 'text', text: 'read file' }] }],
        tools: [],
        maxTokens: 1024,
      }),
    )

    const starts = events.filter(e => e.type === 'tool_use_start')
    expect(starts).toHaveLength(1)
    expect(starts[0].name).toBe('file_read')

    const ends = events.filter(e => e.type === 'tool_use_end')
    expect(ends).toHaveLength(1)
    expect(ends[0].id).toBe('call_abc')
    expect(ends[0].input).toEqual({ file_path: '/tmp/t' })

    const messageEnd = events.find(e => e.type === 'message_end')!
    expect(messageEnd.stopReason).toBe('tool_use')
  })
})

// ============================================================================
// Anthropic Provider — convertMessages (private, accessed via (any))
// ============================================================================

describe('AnthropicProvider: convertMessages', () => {
  let provider: AnthropicProvider

  beforeEach(() => {
    provider = new AnthropicProvider('test-key')
  })

  it('converts a plain user text message', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ]
    const result = (provider as any).convertMessages(messages)
    expect(result).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    ])
  })

  it('converts assistant message with text to Anthropic format', () => {
    const messages: Message[] = [
      { role: 'assistant', content: [{ type: 'text', text: 'Sure!' }] },
    ]
    const result = (provider as any).convertMessages(messages)
    expect(result).toEqual([
      { role: 'assistant', content: [{ type: 'text', text: 'Sure!' }] },
    ])
  })

  it('converts assistant message with tool_use to Anthropic content blocks', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking...' },
          { type: 'tool_use', id: 'tu_1', name: 'file_read', input: { file_path: '/tmp/a' } },
        ],
      },
    ]
    const result = (provider as any).convertMessages(messages)
    expect(result).toHaveLength(1)
    const msg = result[0]
    expect(msg.role).toBe('assistant')
    expect(msg.content).toHaveLength(2)
    expect(msg.content[0]).toEqual({ type: 'text', text: 'Checking...' })
    expect(msg.content[1]).toEqual({ type: 'tool_use', id: 'tu_1', name: 'file_read', input: { file_path: '/tmp/a' } })
  })

  it('converts assistant message with multiple tool_use blocks', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'file_read', input: { file_path: '/tmp/a' } },
          { type: 'tool_use', id: 'tu_2', name: 'bash', input: { command: 'ls' } },
        ],
      },
    ]
    const result = (provider as any).convertMessages(messages)
    const msg = result[0]
    expect(msg.content).toHaveLength(2)
    expect(msg.content[0].type).toBe('tool_use')
    expect(msg.content[1].type).toBe('tool_use')
  })

  it('converts user message with tool_result to Anthropic tool_result block', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'tu_1', content: 'result data' },
        ],
      },
    ]
    const result = (provider as any).convertMessages(messages)
    expect(result).toHaveLength(1)
    expect(result[0].content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu_1', content: 'result data' },
    ])
  })

  it('includes is_error flag when tool_result has isError=true', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'tu_1', content: 'Error occurred', isError: true },
        ],
      },
    ]
    const result = (provider as any).convertMessages(messages)
    expect(result[0].content).toEqual([
      { type: 'tool_result', tool_use_id: 'tu_1', content: 'Error occurred', is_error: true },
    ])
  })

  it('does not include is_error flag when tool_result isError is false/undefined', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'tu_1', content: 'OK' },
        ],
      },
    ]
    const result = (provider as any).convertMessages(messages)
    expect(result[0].content[0]).toEqual(
      expect.not.objectContaining({ is_error: expect.anything() }),
    )
  })

  it('converts user message with mixed text and tool_result', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'tu_1', content: 'data' },
          { type: 'text', text: 'Now summarize' },
        ],
      },
    ]
    const result = (provider as any).convertMessages(messages)
    expect(result).toHaveLength(1)
    expect(result[0].content).toHaveLength(2)
    expect(result[0].content[0]).toEqual({ type: 'tool_result', tool_use_id: 'tu_1', content: 'data' })
    expect(result[0].content[1]).toEqual({ type: 'text', text: 'Now summarize' })
  })

  it('converts multi-turn conversation correctly', () => {
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'Read file' }] },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu_1', name: 'file_read', input: { file_path: '/tmp/x' } }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', toolUseId: 'tu_1', content: 'file data' }],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
    ]
    const result = (provider as any).convertMessages(messages)
    expect(result).toHaveLength(4)
    expect(result[0].role).toBe('user')
    expect(result[1].role).toBe('assistant')
    expect(result[1].content[0].type).toBe('tool_use')
    expect(result[2].role).toBe('user')
    expect(result[2].content[0].type).toBe('tool_result')
    expect(result[3].role).toBe('assistant')
    expect(result[3].content[0].type).toBe('text')
  })
})

// ============================================================================
// Anthropic Provider — stream parsing (mocked client)
// ============================================================================

describe('AnthropicProvider: chatStream parsing', () => {
  it('yields text_delta for streamed text content', async () => {
    const provider = new AnthropicProvider('test-key')
    const client = (provider as any).client

    vi.spyOn(client.messages, 'stream').mockReturnValue({
      [Symbol.asyncIterator]() {
        const events = [
          { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
          { type: 'content_block_stop', index: 0 },
          { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
        ]
        let i = 0
        return {
          async next() {
            if (i < events.length) return { value: events[i++], done: false }
            return { value: undefined, done: true }
          },
        }
      },
    } as any)

    const events = await collectStreamEvents(
      provider.chatStream({
        model: 'claude-3',
        system: [],
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        tools: [],
        maxTokens: 1024,
      }),
    )

    const textDeltas = events.filter(e => e.type === 'text_delta')
    expect(textDeltas).toHaveLength(2)
    expect(textDeltas[0].text).toBe('Hello')
    expect(textDeltas[1].text).toBe(' world')

    const end = events.find(e => e.type === 'message_end')!
    expect(end.usage).toEqual({ inputTokens: 10, outputTokens: 5 })
    expect(end.stopReason).toBe('end_turn')
  })

  it('yields tool_use events for streamed tool calls', async () => {
    const provider = new AnthropicProvider('test-key')
    const client = (provider as any).client

    vi.spyOn(client.messages, 'stream').mockReturnValue({
      [Symbol.asyncIterator]() {
        const events = [
          { type: 'message_start', message: { usage: { input_tokens: 20, output_tokens: 0 } } },
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'tu_1', name: 'file_read' },
          },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"file' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '_path":"/tmp/t"}' } },
          { type: 'content_block_stop', index: 0 },
          {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use' },
            usage: { output_tokens: 50 },
          },
        ]
        let i = 0
        return {
          async next() {
            if (i < events.length) return { value: events[i++], done: false }
            return { value: undefined, done: true }
          },
        }
      },
    } as any)

    const events = await collectStreamEvents(
      provider.chatStream({
        model: 'claude-3',
        system: [],
        messages: [{ role: 'user', content: [{ type: 'text', text: 'read file' }] }],
        tools: [],
        maxTokens: 1024,
      }),
    )

    const starts = events.filter(e => e.type === 'tool_use_start')
    expect(starts).toHaveLength(1)
    expect(starts[0].name).toBe('file_read')
    expect(starts[0].id).toBe('tu_1')

    const ends = events.filter(e => e.type === 'tool_use_end')
    expect(ends).toHaveLength(1)
    expect(ends[0].input).toEqual({ file_path: '/tmp/t' })

    const end = events.find(e => e.type === 'message_end')!
    expect(end.stopReason).toBe('tool_use')
  })
})

// ============================================================================
// OpenAI Provider — countTokens
// ============================================================================

describe('OpenAIProvider: countTokens', () => {
  it('estimates tokens for messages with text', async () => {
    const provider = new OpenAIProvider('https://api.openai.com/v1', 'test-key')
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'Hello world, this is a test message' }] },
    ]
    const count = await provider.countTokens(messages)
    expect(count).toBeGreaterThan(0)
  })

  it('estimates tokens for messages with tool_use', async () => {
    const provider = new OpenAIProvider('https://api.openai.com/v1', 'test-key')
    const messages: Message[] = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'bash', input: { cmd: 'ls' } }] },
    ]
    const count = await provider.countTokens(messages)
    expect(count).toBeGreaterThan(0)
  })
})

// ============================================================================
// Anthropic Provider — countTokens
// ============================================================================

describe('AnthropicProvider: countTokens', () => {
  it('estimates tokens for messages with text', async () => {
    const provider = new AnthropicProvider('test-key')
    const messages: Message[] = [
      { role: 'user', content: [{ type: 'text', text: 'Hello world, this is a test message' }] },
    ]
    const count = await provider.countTokens(messages)
    expect(count).toBeGreaterThan(0)
  })

  it('estimates tokens for messages with tool_use', async () => {
    const provider = new AnthropicProvider('test-key')
    const messages: Message[] = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'bash', input: { cmd: 'ls' } }] },
    ]
    const count = await provider.countTokens(messages)
    expect(count).toBeGreaterThan(0)
  })
})

// ============================================================================
// OpenAI Provider — signal passthrough & abort
// ============================================================================

describe('OpenAIProvider: signal passthrough & abort', () => {
  it('passes signal as request option to client create', async () => {
    const provider = new OpenAIProvider('https://api.openai.com/v1', 'test-key')
    const client = (provider as any).client
    const controller = new AbortController()

    vi.spyOn(client.chat.completions, 'create').mockResolvedValue({
      [Symbol.asyncIterator]() {
        return { async next() { return { value: undefined, done: true } } }
      },
    } as any)

    await collectStreamEvents(provider.chatStream({
      model: 'gpt-4',
      system: [],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [],
      maxTokens: 1024,
      signal: controller.signal,
    }))

    expect(client.chat.completions.create.mock.calls[0][1]).toEqual({ signal: controller.signal })
  })

  it('stops silently without message_end when signal already aborted', async () => {
    const provider = new OpenAIProvider('https://api.openai.com/v1', 'test-key')
    const client = (provider as any).client
    const controller = new AbortController()

    vi.spyOn(client.chat.completions, 'create').mockResolvedValue({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (controller.signal.aborted) throw new Error('aborted')
            return { value: undefined, done: true }
          },
        }
      },
    } as any)

    controller.abort()
    const events = await collectStreamEvents(provider.chatStream({
      model: 'gpt-4',
      system: [],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [],
      maxTokens: 1024,
      signal: controller.signal,
    }))

    expect(events.find(e => e.type === 'message_end')).toBeUndefined()
  })
})

// ============================================================================
// Anthropic Provider — signal passthrough & abort
// ============================================================================

describe('AnthropicProvider: signal passthrough & abort', () => {
  it('passes signal as request option to client stream', async () => {
    const provider = new AnthropicProvider('test-key')
    const client = (provider as any).client
    const controller = new AbortController()

    vi.spyOn(client.messages, 'stream').mockReturnValue({
      [Symbol.asyncIterator]() {
        return { async next() { return { value: undefined, done: true } } }
      },
    } as any)

    await collectStreamEvents(provider.chatStream({
      model: 'claude-3',
      system: [],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [],
      maxTokens: 1024,
      signal: controller.signal,
    }))

    expect(client.messages.stream.mock.calls[0][1]).toEqual({ signal: controller.signal })
  })

  it('stops silently without message_end when signal already aborted', async () => {
    const provider = new AnthropicProvider('test-key')
    const client = (provider as any).client
    const controller = new AbortController()

    vi.spyOn(client.messages, 'stream').mockReturnValue({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (controller.signal.aborted) throw new Error('aborted')
            return { value: undefined, done: true }
          },
        }
      },
    } as any)

    controller.abort()
    const events = await collectStreamEvents(provider.chatStream({
      model: 'claude-3',
      system: [],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [],
      maxTokens: 1024,
      signal: controller.signal,
    }))

    expect(events.find(e => e.type === 'message_end')).toBeUndefined()
  })
})
