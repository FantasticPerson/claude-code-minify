import { describe, it, expect } from 'vitest'
import { Nudge, NudgeKind, NudgeTemplates } from '../src/guardrails/index.js'

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
