import { describe, it, expect } from 'vitest'
import { Nudge, NudgeKind, NudgeTemplates, ErrorTracker, ResponseValidator, GuardrailsMiddleware } from '../src/guardrails/index.js'
import { Engine } from '../src/core/engine.js'
import { LLMProvider } from '../src/providers/base.js'
import { StreamEvent } from '../src/core/types.js'
import { ToolSpec } from '../src/tools/base.js'
import { z } from 'zod'

function createMockProvider(responses: StreamEvent[][]): LLMProvider & { getCallCount: () => number } {
  let callIndex = 0
  return {
    getCallCount() { return callIndex },
    async *chatStream(_params: any): AsyncGenerator<StreamEvent> {
      const events = responses[callIndex++] || []
      for (const event of events) {
        yield event
      }
    },
    async chat(_params: any) {
      return { text: '', toolUses: [], usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'end_turn' }
    },
    async countTokens(messages: any[]) { return Math.ceil(JSON.stringify(messages).length / 4) },
  }
}

function createMockTool(name: string): ToolSpec {
  return {
    name,
    description: `Mock tool ${name}`,
    schema: z.object({}),
    execute: async (_params: any) => ({ output: `executed ${name}`, isError: false }),
  }
}

describe('Nudge', () => {
  it('constructs with correct properties', () => {
    const nudge = new Nudge('user', 'msg', NudgeKind.Retry)
    expect(nudge.role).toBe('user')
    expect(nudge.content).toBe('msg')
    expect(nudge.kind).toBe(NudgeKind.Retry)
  })

  it('properties are immutable', () => {
    const nudge = new Nudge('user', 'msg', NudgeKind.Retry)
    expect(nudge.role).toBe('user')
    expect(nudge.kind).toBe(NudgeKind.Retry)
  })
})

describe('NudgeKind', () => {
  it('has the four required values', () => {
    expect(NudgeKind.Retry).toBe('retry')
    expect(NudgeKind.UnknownTool).toBe('unknown_tool')
    expect(NudgeKind.ToolArgValidation).toBe('tool_arg_validation')
    expect(NudgeKind.Step).toBe('step')
  })
})

describe('NudgeTemplates', () => {
  it('retry returns prompt containing "tool call"', () => {
    const result = NudgeTemplates.retry('some raw response')
    expect(result).toContain('tool call')
  })

  it('unknownTool returns prompt containing the tool name and available tools', () => {
    const result = NudgeTemplates.unknownTool('bad_tool', ['tool_a', 'tool_b'])
    expect(result).toContain('bad_tool')
    expect(result).toContain('tool_a, tool_b')
  })

  it('toolArgValidation returns prompt containing tool name and "JSON object"', () => {
    const result = NudgeTemplates.toolArgValidation('my_tool', 'bad_args')
    expect(result).toContain('my_tool')
    expect(result).toContain('JSON object')
  })
})

describe('ErrorTracker', () => {
  it('initial state has retriesExhausted=false and toolErrorsExhausted=false', () => {
    const tracker = new ErrorTracker()
    expect(tracker.retriesExhausted).toBe(false)
    expect(tracker.toolErrorsExhausted).toBe(false)
  })

  it('retriesExhausted becomes true after maxRetries (default=3) retries', () => {
    const tracker = new ErrorTracker()
    expect(tracker.retriesExhausted).toBe(false)

    tracker.recordRetry()
    tracker.recordRetry()
    expect(tracker.retriesExhausted).toBe(false)

    tracker.recordRetry()
    expect(tracker.retriesExhausted).toBe(true)
  })

  it('toolErrorsExhausted becomes true after maxToolErrors (default=2) tool errors', () => {
    const tracker = new ErrorTracker()
    expect(tracker.toolErrorsExhausted).toBe(false)

    tracker.recordToolError()
    expect(tracker.toolErrorsExhausted).toBe(false)

    tracker.recordToolError()
    expect(tracker.toolErrorsExhausted).toBe(true)
  })

  it('reset clears all counters and flags', () => {
    const tracker = new ErrorTracker()
    tracker.recordRetry()
    tracker.recordRetry()
    tracker.recordRetry()
    tracker.recordToolError()
    tracker.recordToolError()

    expect(tracker.retriesExhausted).toBe(true)
    expect(tracker.toolErrorsExhausted).toBe(true)

    tracker.reset()

    expect(tracker.retriesExhausted).toBe(false)
    expect(tracker.toolErrorsExhausted).toBe(false)
  })

  it('supports custom maxRetries', () => {
    const tracker = new ErrorTracker(5, 2)

    for (let i = 0; i < 4; i++) {
      tracker.recordRetry()
    }
    expect(tracker.retriesExhausted).toBe(false)

    tracker.recordRetry()
    expect(tracker.retriesExhausted).toBe(true)
  })

  it('retry and tool error counters are independent', () => {
    const tracker = new ErrorTracker(3, 2)

    tracker.recordRetry()
    tracker.recordRetry()
    tracker.recordToolError()

    expect(tracker.retriesExhausted).toBe(false)
    expect(tracker.toolErrorsExhausted).toBe(false)
  })
})

describe('ResponseValidator', () => {
  // --- Normal validation ---

  it('valid tool call passes validation', () => {
    const v = new ResponseValidator(['read', 'write'])
    const result = v.validate([{ type: 'tool_use', id: '1', name: 'read', input: { file_path: '/a' } }])
    expect(result.needsRetry).toBe(false)
    expect(result.toolCalls).not.toBeNull()
    expect(result.nudge).toBeNull()
  })

  it('unknown tool returns UnknownTool nudge', () => {
    const v = new ResponseValidator(['read', 'write'])
    const result = v.validate([{ type: 'tool_use', id: '1', name: 'hack', input: {} }])
    expect(result.needsRetry).toBe(true)
    expect(result.nudge).not.toBeNull()
    expect(result.nudge!.kind).toBe(NudgeKind.UnknownTool)
  })

  it('non-object input returns ToolArgValidation nudge', () => {
    const v = new ResponseValidator(['read'])
    const result = v.validate([{ type: 'tool_use', id: '1', name: 'read', input: 'bad' as any }])
    expect(result.needsRetry).toBe(true)
    expect(result.nudge).not.toBeNull()
    expect(result.nudge!.kind).toBe(NudgeKind.ToolArgValidation)
  })

  it('null input returns ToolArgValidation nudge', () => {
    const v = new ResponseValidator(['read'])
    const result = v.validate([{ type: 'tool_use', id: '1', name: 'read', input: null as any }])
    expect(result.needsRetry).toBe(true)
    expect(result.nudge).not.toBeNull()
    expect(result.nudge!.kind).toBe(NudgeKind.ToolArgValidation)
  })

  it('empty toolCalls array returns Retry nudge', () => {
    const v = new ResponseValidator(['read', 'write'])
    const result = v.validate([])
    expect(result.needsRetry).toBe(true)
    expect(result.nudge).not.toBeNull()
    expect(result.nudge!.kind).toBe(NudgeKind.Retry)
  })

  // --- Rescue parsing ---

  it('rescues JSON wrapped in markdown code block', () => {
    const v = new ResponseValidator(['read', 'write'], true)
    const rawContent = '```json\n[{"name":"read","input":{"file_path":"/a"}}]\n```'
    const result = v.validate(null, rawContent)
    expect(result.needsRetry).toBe(false)
    expect(result.toolCalls).not.toBeNull()
    expect(result.toolCalls!.length).toBe(1)
    expect(result.toolCalls![0].name).toBe('read')
    expect(result.toolCalls![0].input).toEqual({ file_path: '/a' })
  })

  it('does not attempt rescue when rescueEnabled=false', () => {
    const v = new ResponseValidator(['read', 'write'], false)
    const rawContent = '```json\n[{"name":"read","input":{"file_path":"/a"}}]\n```'
    const result = v.validate(null, rawContent)
    expect(result.needsRetry).toBe(true)
  })
})

describe('GuardrailsMiddleware', () => {
  // --- Normal flow ---

  it('valid tool call returns action=execute with toolCalls', () => {
    const mw = new GuardrailsMiddleware(['read', 'write'])
    const toolCalls = [{ type: 'tool_use' as const, id: '1', name: 'read', input: { file_path: '/a' } }]
    const result = mw.check(toolCalls)
    expect(result.action).toBe('execute')
    expect(result.toolCalls).toEqual(toolCalls)
    expect(result.nudge).toBeUndefined()
    expect(result.reason).toBeUndefined()
  })

  it('recordSuccess does not throw after valid tool call', () => {
    const mw = new GuardrailsMiddleware(['read', 'write'])
    const toolCalls = [{ type: 'tool_use' as const, id: '1', name: 'read', input: { file_path: '/a' } }]
    mw.check(toolCalls)
    expect(() => mw.recordSuccess()).not.toThrow()
  })

  // --- Retry flow ---

  it('unknown tool returns action=tool_error with nudge', () => {
    const mw = new GuardrailsMiddleware(['read'])
    const toolCalls = [{ type: 'tool_use' as const, id: '1', name: 'hack', input: {} }]
    const result = mw.check(toolCalls)
    expect(result.action).toBe('tool_error')
    expect(result.nudge).toBeDefined()
    expect(result.nudge!.kind).toBe(NudgeKind.UnknownTool)
  })

  // --- Budget exhausted ---

  it('exhausts retries after maxRetries empty toolCalls and returns fatal', () => {
    const mw = new GuardrailsMiddleware(['read', 'write'], { maxRetries: 2 })
    // Retry 1
    let result = mw.check([])
    expect(result.action).toBe('retry')
    // Retry 2
    result = mw.check([])
    expect(result.action).toBe('retry')
    // Retry 3 — exhausted
    result = mw.check([])
    expect(result.action).toBe('fatal')
    expect(result.reason).toContain('retries')
  })

  it('recordSuccess resets tool error count so maxToolErrors is not exceeded', () => {
    const mw = new GuardrailsMiddleware(['read'], { maxToolErrors: 1 })
    const unknownTool = [{ type: 'tool_use' as const, id: '1', name: 'hack', input: {} }]
    // First unknown tool → tool_error
    let result = mw.check(unknownTool)
    expect(result.action).toBe('tool_error')
    // recordSuccess resets counters
    mw.recordSuccess()
    // Second unknown tool → tool_error (not fatal, because reset cleared the count)
    result = mw.check(unknownTool)
    expect(result.action).toBe('tool_error')
  })

  // --- recordSuccess reset ---

  it('recordSuccess resets retry count allowing more retries', () => {
    const mw = new GuardrailsMiddleware(['read'], { maxRetries: 2 })
    // Retry 1
    let result = mw.check([])
    expect(result.action).toBe('retry')
    // recordSuccess resets
    mw.recordSuccess()
    // Retry 1 again (not exhausted because reset cleared the count)
    result = mw.check([])
    expect(result.action).toBe('retry')
  })
})

// ============================================================================
// Engine Guardrails Integration
// ============================================================================

describe('Engine Guardrails Integration', () => {
  it('Engine constructs with guardrailsConfig without error', () => {
    const provider = createMockProvider([[]])
    const tools = new Map<string, ToolSpec>([['bash', createMockTool('bash')]])
    expect(() => new Engine({
      provider,
      tools,
      model: 'test',
      maxTokens: 1024,
      maxToolRounds: 5,
      workingDir: '/tmp',
      systemPromptOptions: { workingDir: '/tmp', enabledTools: ['bash'] },
      guardrailsConfig: { maxRetries: 2 },
    })).not.toThrow()
  })

  it('Engine constructs without guardrailsConfig (guardrails is null, skipped)', () => {
    const provider = createMockProvider([[]])
    const tools = new Map<string, ToolSpec>([['bash', createMockTool('bash')]])
    expect(() => new Engine({
      provider,
      tools,
      model: 'test',
      maxTokens: 1024,
      maxToolRounds: 5,
      workingDir: '/tmp',
      systemPromptOptions: { workingDir: '/tmp', enabledTools: ['bash'] },
    })).not.toThrow()
  })

  it('unknown tool name triggers guardrails nudge and provider is called twice', async () => {
    // Call 1: provider returns an unknown tool call
    const call1Events: StreamEvent[] = [
      { type: 'tool_use_end', id: 'tu_1', name: 'nonexistent_tool', input: {} },
      { type: 'message_end', usage: { inputTokens: 100, outputTokens: 50 }, stopReason: 'tool_use' },
    ]
    // Call 2: provider returns a valid response (text only, no tools)
    const call2Events: StreamEvent[] = [
      { type: 'text_delta', text: 'fixed response' },
      { type: 'message_end', usage: { inputTokens: 200, outputTokens: 50 }, stopReason: 'end_turn' },
    ]

    const provider = createMockProvider([call1Events, call2Events])
    const tools = new Map<string, ToolSpec>([['bash', createMockTool('bash')]])

    const engine = new Engine({
      provider,
      tools,
      model: 'test',
      maxTokens: 1024,
      maxToolRounds: 10,
      workingDir: '/tmp',
      systemPromptOptions: { workingDir: '/tmp', enabledTools: ['bash'] },
      guardrailsConfig: { maxRetries: 3 },
    })

    const events: any[] = []
    for await (const event of engine.runStream('hello')) {
      events.push(event)
    }

    // Provider should have been called twice: first with unknown tool, then after nudge retry
    expect(provider.getCallCount()).toBe(2)

    // No tool_start/tool_end events for the unknown tool (guardrails intercepted it)
    const toolStartEvents = events.filter(e => e.type === 'tool_start')
    expect(toolStartEvents.length).toBe(0)

    // Final result should contain the text from the second call
    const completeEvent = events.find(e => e.type === 'complete')
    expect(completeEvent).toBeDefined()
    expect(completeEvent.result.text).toBe('fixed response')

    // No tool calls in result (unknown tool was never executed)
    expect(completeEvent.result.toolCalls.length).toBe(0)
  })
})
