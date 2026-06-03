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

export function createBuiltinTools(disabled: string[] = []): Map<string, ToolSpec> {
  const allTools = [
    fileReadTool, fileWriteTool, fileEditTool, bashTool,
    grepTool, globTool, todoWriteTool, askUserTool,
  ]
  const tools = new Map<string, ToolSpec>()
  for (const tool of allTools) {
    if (!disabled.includes(tool.name)) {
      registerTool(tools, tool)
    }
  }
  return tools
}

export { registerTool, createToolDefinition } from './base.js'
