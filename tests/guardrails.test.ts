import { describe, it, expect } from 'vitest'
import { Nudge, NudgeKind, NudgeTemplates, ErrorTracker, ResponseValidator, ValidationResult, GuardrailsMiddleware, CheckAction, GuardrailsConfig } from '../src/guardrails/index.js'

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
