import { ToolSpec, registerTool } from './base.js'
import { fileReadTool } from './file-read.js'
import { fileWriteTool } from './file-write.js'
import { fileEditTool } from './file-edit.js'
import { bashTool } from './bash.js'
import { grepTool } from './grep.js'
import { globTool } from './glob.js'
import { todoWriteTool } from './todo-write.js'
import { askUserTool } from './ask-user.js'

export type { ToolSpec } from './base.js'

export function createBuiltinTools(): Map<string, ToolSpec> {
  const tools = new Map<string, ToolSpec>()
  registerTool(tools, fileReadTool)
  registerTool(tools, fileWriteTool)
  registerTool(tools, fileEditTool)
  registerTool(tools, bashTool)
  registerTool(tools, grepTool)
  registerTool(tools, globTool)
  registerTool(tools, todoWriteTool)
  registerTool(tools, askUserTool)
  return tools
}

export { registerTool, createToolDefinition } from './base.js'
