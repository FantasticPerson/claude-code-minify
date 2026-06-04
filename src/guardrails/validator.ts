import { ToolUseBlock } from '../core/types.js'
import { Nudge, NudgeKind } from './nudge.js'
import { NudgeTemplates } from './nudge-templates.js'

export interface ValidationResult {
  toolCalls: ToolUseBlock[] | null
  nudge: Nudge | null
  needsRetry: boolean
}

export class ResponseValidator {
  private toolNames: Set<string>

  constructor(toolNames: string[], private rescueEnabled = true) {
    this.toolNames = new Set(toolNames)
  }

  validate(toolCalls: ToolUseBlock[] | null, rawContent?: string): ValidationResult {
    // Step 1: If toolCalls is null or empty, attempt rescue
    if (!toolCalls || toolCalls.length === 0) {
      if (rawContent && this.rescueEnabled) {
        const rescued = this.rescueParse(rawContent)
        if (rescued) {
          toolCalls = rescued
        } else {
          // No malformed tool calls found — valid text-only response
          return { toolCalls: null, nudge: null, needsRetry: false }
        }
      } else {
        // No tool calls and no rescue needed — valid text-only response
        return { toolCalls: null, nudge: null, needsRetry: false }
      }
    }

    // Step 2: Check for unknown tools (report first only)
    for (const tc of toolCalls) {
      if (!this.toolNames.has(tc.name)) {
        return {
          toolCalls: null,
          nudge: new Nudge('user', NudgeTemplates.unknownTool(tc.name, [...this.toolNames]), NudgeKind.UnknownTool),
          needsRetry: true,
        }
      }
    }

    // Step 3: Check for invalid arguments (report first only)
    for (const tc of toolCalls) {
      if (typeof tc.input !== 'object' || tc.input === null) {
        return {
          toolCalls: null,
          nudge: new Nudge('user', NudgeTemplates.toolArgValidation(tc.name, tc.input), NudgeKind.ToolArgValidation),
          needsRetry: true,
        }
      }
    }

    // Step 4: All checks passed
    return { toolCalls, nudge: null, needsRetry: false }
  }

  /** Extract tool calls from malformed text */
  private rescueParse(rawContent: string): ToolUseBlock[] | null {
    // Try to extract JSON from markdown code blocks
    const jsonBlockMatch = rawContent.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
    if (jsonBlockMatch) {
      try {
        const parsed = JSON.parse(jsonBlockMatch[1])
        if (Array.isArray(parsed)) {
          const toolCalls = this.parseToolCallArray(parsed)
          if (toolCalls) return toolCalls
        }
      } catch {
        // JSON parse failed, try next strategy
      }
    }

    // All rescue strategies failed
    return null
  }

  /** Validate parsed array items and convert to ToolUseBlock[] */
  private parseToolCallArray(arr: any[]): ToolUseBlock[] | null {
    for (const item of arr) {
      if (!item || typeof item !== 'object' || !('name' in item) || !('input' in item)) {
        return null
      }
    }
    return arr.map((item) => ({
      type: 'tool_use' as const,
      id: crypto.randomUUID(),
      name: item.name,
      input: item.input ?? {},
    }))
  }
}
