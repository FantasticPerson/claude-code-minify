import { describe, it, expect } from 'vitest'
import { Engine, EngineOptions } from '../src/core/engine.js'
import { createBuiltinTools } from '../src/tools/index.js'
import { MockProvider, MockResponse } from './helpers/mock-provider.js'

function createTestEngine(responses: MockResponse[], options?: Partial<EngineOptions>, delayMs = 0): Engine {
  const provider = new MockProvider(responses, delayMs)
  const tools = createBuiltinTools([])
  return new Engine({
    provider: provider as any,
    tools,
    model: 'test-model',
    maxTokens: 1024,
    maxToolRounds: 10,
    workingDir: '/tmp/test',
    systemPromptOptions: {
      workingDir: '/tmp/test',
      enabledTools: Array.from(tools.keys()),
    },
    ...options,
  })
}

/** Collect all events from an async generator */
async function collectEvents(gen: AsyncGenerator<any>): Promise<any[]> {
  const events: any[] = []
  for await (const event of gen) {
    events.push(event)
  }
  return events
}

// ============================================================================
// 1. Single-round text response
// ============================================================================

describe('Engine: single-round text response', () => {
  it('returns text and empty toolCalls', async () => {
    const engine = createTestEngine([{ text: 'Hello!' }])
    const events = await collectEvents(engine.runStream('hi'))

    const complete = events.find(e => e.type === 'complete')
    expect(complete).toBeDefined()
    expect(complete.result.text).toBe('Hello!')
    expect(complete.result.toolCalls).toEqual([])
    expect(complete.result.filesWritten).toEqual([])

    // Provider called once
    const provider = engine['provider'] as MockProvider
    expect(provider.callCount).toBe(1)
  })
})

// ============================================================================
// 2. Single-round tool call
// ============================================================================

describe('Engine: single-round tool call', () => {
  it('executes file_read tool and returns toolCalls', async () => {
    // Create a temporary file for file_read to read
    const tmpFile = '/tmp/test-engine-read.txt'
    const fs = await import('fs')
    fs.writeFileSync(tmpFile, 'file content here')

    try {
      const engine = createTestEngine([{
        toolUses: [{
          id: 'tu_1',
          name: 'file_read',
          input: { file_path: tmpFile },
        }],
      }])
      const events = await collectEvents(engine.runStream('read the file'))

      const complete = events.find(e => e.type === 'complete')
      expect(complete).toBeDefined()
      expect(complete.result.text).toBe('')
      expect(complete.result.toolCalls.length).toBe(1)
      expect(complete.result.toolCalls[0].name).toBe('file_read')
      expect(complete.result.toolCalls[0].output).toContain('file content here')
      expect(complete.result.toolCalls[0].isError).toBe(false)

      // Check stream events
      const toolStart = events.find(e => e.type === 'tool_start')
      expect(toolStart).toBeDefined()
      expect(toolStart.name).toBe('file_read')

      const toolEnd = events.find(e => e.type === 'tool_end')
      expect(toolEnd).toBeDefined()
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })
})

// ============================================================================
// 3. Multi-round tool calls
// ============================================================================

describe('Engine: multi-round tool calls', () => {
  it('calls provider twice and completes full cycle', async () => {
    const tmpFile = '/tmp/test-engine-multi.txt'
    const fs = await import('fs')
    fs.writeFileSync(tmpFile, 'multi content')

    try {
      // Round 1: provider returns a tool call
      // Round 2: provider returns text (no tool calls)
      const engine = createTestEngine([
        {
          toolUses: [{
            id: 'tu_1',
            name: 'file_read',
            input: { file_path: tmpFile },
          }],
        },
        { text: 'Done reading the file.' },
      ])
      const events = await collectEvents(engine.runStream('read then summarize'))

      const complete = events.find(e => e.type === 'complete')
      expect(complete).toBeDefined()
      expect(complete.result.text).toBe('Done reading the file.')
      expect(complete.result.toolCalls.length).toBe(1)
      expect(complete.result.toolCalls[0].name).toBe('file_read')

      // Provider was called twice (round 1: tool call, round 2: text response)
      const provider = engine['provider'] as MockProvider
      expect(provider.callCount).toBe(2)
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })
})

// ============================================================================
// 4. Tool execution error (unknown tool)
// ============================================================================

describe('Engine: tool execution error', () => {
  it('returns isError=true for unknown tool name', async () => {
    const engine = createTestEngine([{
      toolUses: [{
        id: 'tu_1',
        name: 'nonexistent_tool_xyz',
        input: {},
      }],
    }])
    const events = await collectEvents(engine.runStream('use unknown tool'))

    const complete = events.find(e => e.type === 'complete')
    expect(complete).toBeDefined()
    expect(complete.result.toolCalls.length).toBe(1)
    expect(complete.result.toolCalls[0].name).toBe('nonexistent_tool_xyz')
    expect(complete.result.toolCalls[0].isError).toBe(true)
    expect(complete.result.toolCalls[0].output).toContain('Unknown tool')
  })
})

// ============================================================================
// 5. Abort signal
// ============================================================================

describe('Engine: abort signal', () => {
  it('yields interrupted event when signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const engine = createTestEngine([{ text: 'should not see this' }], {
      abortSignal: controller.signal,
    })
    const events = await collectEvents(engine.runStream('test'))

    const interrupted = events.find(e => e.type === 'interrupted')
    expect(interrupted).toBeDefined()
    expect(interrupted.partialText).toBe('')

    // No complete event on interruption
    const complete = events.find(e => e.type === 'complete')
    expect(complete).toBeUndefined()
  })

  it('run() returns interrupted result when signal already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const engine = createTestEngine([{ text: 'should not see this' }], {
      abortSignal: controller.signal,
    })
    const result = await engine.run('test')

    expect(result.interrupted).toBe(true)
    expect(result.text).toBe('')
  })
})

// ============================================================================
// 6. filesWritten tracking
// ============================================================================

describe('Engine: filesWritten tracking', () => {
  it('tracks files written by file_write tool', async () => {
    const tmpFile = '/tmp/test-engine-write.txt'

    const engine = createTestEngine([{
      toolUses: [{
        id: 'tu_1',
        name: 'file_write',
        input: {
          file_path: tmpFile,
          content: 'written content',
        },
      }],
    }])
    const events = await collectEvents(engine.runStream('write a file'))

    const complete = events.find(e => e.type === 'complete')
    expect(complete).toBeDefined()
    expect(complete.result.filesWritten).toContain(tmpFile)

    // Cleanup
    const fs = await import('fs')
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  })
})

// ============================================================================
// 7. Stream event ordering
// ============================================================================

describe('Engine: stream event ordering', () => {
  it('yields events in correct order: text, tool_start, tool_end, complete', async () => {
    const tmpFile = '/tmp/test-engine-events.txt'
    const fs = await import('fs')
    fs.writeFileSync(tmpFile, 'event order content')

    try {
      // Round 1: tool call with text + tool use
      // Round 2: final text
      const engine = createTestEngine([
        {
          text: 'Reading file...',
          toolUses: [{
            id: 'tu_1',
            name: 'file_read',
            input: { file_path: tmpFile },
          }],
        },
        { text: 'Done.' },
      ])
      const events = await collectEvents(engine.runStream('test'))

      const types = events.map(e => e.type)

      // First round: text, then tool_start, then tool_end
      const textIdx = types.indexOf('text')
      const toolStartIdx = types.indexOf('tool_start')
      const toolEndIdx = types.indexOf('tool_end')

      expect(textIdx).toBeGreaterThanOrEqual(0)
      expect(toolStartIdx).toBeGreaterThan(textIdx)
      expect(toolEndIdx).toBeGreaterThan(toolStartIdx)

      // Complete should be last
      expect(types[types.length - 1]).toBe('complete')
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })
})

// ============================================================================
// 8. Interrupt mid-stream
// ============================================================================

describe('Engine: interrupt mid-stream', () => {
  it('yields interrupted with partialText when aborted during streaming', async () => {
    const controller = new AbortController()
    const engine = createTestEngine(
      [{ text: 'Hello world this is a long response' }],
      {},
      5,
    )

    const events: any[] = []
    for await (const event of engine.runStream('test', controller.signal)) {
      events.push(event)
      // Abort right after the first text chunk lands
      if (event.type === 'text') controller.abort()
    }

    const interrupted = events.find(e => e.type === 'interrupted')
    expect(interrupted).toBeDefined()
    expect(interrupted.partialText).toContain('Hello world')

    const complete = events.find(e => e.type === 'complete')
    expect(complete).toBeUndefined()
  })
})

// ============================================================================
// 9. Interrupt before next tool execution
// ============================================================================

describe('Engine: interrupt before next tool', () => {
  it('keeps completed tool calls and yields interrupted', async () => {
    const tmpFile = '/tmp/test-engine-interrupt-tool.txt'
    const fs = await import('fs')
    fs.writeFileSync(tmpFile, 'content')

    try {
      const controller = new AbortController()
      // Two tool calls; abort after the first completes, before the second runs
      const engine = createTestEngine([{
        toolUses: [
          { id: 'tu_1', name: 'file_read', input: { file_path: tmpFile } },
          { id: 'tu_2', name: 'file_read', input: { file_path: tmpFile } },
        ],
      }])

      const events: any[] = []
      for await (const event of engine.runStream('test', controller.signal)) {
        events.push(event)
        if (event.type === 'tool_end') controller.abort()
      }

      const interrupted = events.find(e => e.type === 'interrupted')
      expect(interrupted).toBeDefined()
      expect(interrupted.completedToolCalls).toHaveLength(1)
      expect(interrupted.completedToolCalls[0].name).toBe('file_read')

      const complete = events.find(e => e.type === 'complete')
      expect(complete).toBeUndefined()
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })
})

// ============================================================================
// 10. Interrupted turn keeps the context message sequence legal
// ============================================================================

describe('Engine: interrupted context consistency', () => {
  it('checkpoint ③ pairs every tool_use with a tool_result after interrupting between tools', async () => {
    const tmpFile = '/tmp/test-engine-ctx-seq.txt'
    const fs = await import('fs')
    fs.writeFileSync(tmpFile, 'content')
    try {
      const controller = new AbortController()
      // Round 1: two tool calls, abort after the first completes (before the second)
      // Round 2: plain text so the provider is called again with the post-interrupt context
      const engine = createTestEngine([
        {
          toolUses: [
            { id: 'tu_1', name: 'file_read', input: { file_path: tmpFile } },
            { id: 'tu_2', name: 'file_read', input: { file_path: tmpFile } },
          ],
        },
        { text: 'ok' },
      ])

      for await (const event of engine.runStream('round1', controller.signal)) {
        if (event.type === 'tool_end') controller.abort()
      }
      // Second turn drives a provider call that reveals the persisted context
      await collectEvents(engine.runStream('round2'))

      const messages = (engine['provider'] as MockProvider).lastParams!.messages
      const toolUseIds: string[] = []
      const toolResultIds: string[] = []
      for (const m of messages) {
        for (const b of m.content) {
          if (b.type === 'tool_use') toolUseIds.push(b.id)
          if (b.type === 'tool_result') toolResultIds.push(b.toolUseId)
        }
      }
      // Every tool_use must have a matching tool_result, else Anthropic rejects the request
      expect(toolUseIds.sort()).toEqual(toolResultIds.sort())
      expect(toolUseIds).toEqual(expect.arrayContaining(['tu_1', 'tu_2']))
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  it('checkpoint ② persists partial assistant text so roles still alternate', async () => {
    const controller = new AbortController()
    const engine = createTestEngine(
      [{ text: 'Hello partial text' }, { text: 'ok' }],
      {},
      5,
    )
    for await (const event of engine.runStream('round1', controller.signal)) {
      if (event.type === 'text') controller.abort()
    }
    await collectEvents(engine.runStream('round2'))

    const messages = (engine['provider'] as MockProvider).lastParams!.messages
    const roles = messages.map((m: any) => m.role)
    for (let i = 1; i < roles.length; i++) {
      expect(roles[i]).not.toBe(roles[i - 1])
    }
    const asst = messages.find((m: any) => m.role === 'assistant')
    expect(asst).toBeDefined()
    expect(JSON.stringify(asst.content)).toContain('Hello partial text')
  })
})
