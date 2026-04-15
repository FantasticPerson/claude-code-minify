import { z } from 'zod'
import { ToolContext, ToolResult, ToolDefinition } from '../core/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'

export interface ToolSpec {
  name: string
  description: string
  schema: z.ZodType<any>
  execute: (params: any, context: ToolContext) => Promise<ToolResult>
}

export function createToolDefinition(tool: ToolSpec): ToolDefinition {
  const jsonSchema = zodToJsonSchema(tool.schema, { target: 'openApi3' }) as Record<string, any>
  delete jsonSchema.$schema
  return { name: tool.name, description: tool.description, inputSchema: jsonSchema }
}

export function registerTool(tools: Map<string, ToolSpec>, tool: ToolSpec): void {
  tools.set(tool.name, tool)
}
