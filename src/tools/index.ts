import * as path from 'path'
import { ToolSpec, registerTool } from './base.js'
import { ToolExecute } from '../core/types.js'
import { withFileLock } from './file-lock.js'
import { fileReadTool } from './file-read.js'
import { fileWriteTool } from './file-write.js'
import { fileEditTool } from './file-edit.js'
import { bashTool } from './bash.js'
import { grepTool } from './grep.js'
import { globTool } from './glob.js'
import { todoWriteTool } from './todo-write.js'
import { askUserTool } from './ask-user.js'

export type { ToolSpec } from './base.js'

/** 受进程内文件级互斥锁保护的内置工具。 */
const FILE_LOCKED_TOOLS = new Set(['file_edit', 'file_write'])

/**
 * 对工具 execute 应用 wrap：内置文件级互斥锁（仅 file_edit/file_write，最内层）
 * + 用户 wrapExecute（外层叠加）。顺序：userWrap(外) → builtinLock(内) → 原execute。
 */
function applyWrap(
  name: string,
  execute: ToolExecute,
  userWrap?: (name: string, execute: ToolExecute) => ToolExecute,
): ToolExecute {
  let wrapped = execute
  if (FILE_LOCKED_TOOLS.has(name)) {
    const original = wrapped
    // 整个 read-modify-write 在锁内，杜绝跨实例并发丢更新
    wrapped = (params, ctx) =>
      withFileLock(
        path.resolve(ctx.workingDir, params.file_path),
        () => original(params, ctx),
        ctx.abortSignal,
      )
  }
  if (userWrap) wrapped = userWrap(name, wrapped)
  return wrapped
}

export function createBuiltinTools(
  disabled: string[] = [],
  wrapExecute?: (name: string, execute: ToolExecute) => ToolExecute,
): Map<string, ToolSpec> {
  const allTools = [
    fileReadTool, fileWriteTool, fileEditTool, bashTool,
    grepTool, globTool, todoWriteTool, askUserTool,
  ]
  const tools = new Map<string, ToolSpec>()
  for (const tool of allTools) {
    if (!disabled.includes(tool.name)) {
      registerTool(tools, { ...tool, execute: applyWrap(tool.name, tool.execute, wrapExecute) })
    }
  }
  return tools
}

export { registerTool, createToolDefinition } from './base.js'
