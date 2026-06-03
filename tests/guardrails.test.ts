import { describe, it, expect } from 'vitest'
import { Nudge, NudgeKind, NudgeTemplates, ErrorTracker } from '../src/guardrails/index.js'

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
