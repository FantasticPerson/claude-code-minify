import { z } from 'zod'
import { ToolSpec } from './base.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import { checkFileSecurity } from './security.js'
// DEFAULT_WRITE_MAX_FILE_SIZE = Infinity, no import needed

export const fileWriteTool: ToolSpec = {
  name: 'file_write',
  description: 'Write content to a file. Creates parent directories if needed. Overwrites existing files.',
  schema: z.object({
    file_path: z.string().describe('Absolute path to the file'),
    content: z.string().describe('Content to write'),
  }),
  execute: async (params, ctx) => {
    const filePath = path.resolve(ctx.workingDir, params.file_path)
    const secErr = checkFileSecurity(filePath, ctx.workingDir, ctx.security?.file)
    if (secErr) return { output: secErr, isError: true }
    const secLimit = ctx.security?.file?.maxFileSize ?? Infinity
    const toolLimit = ctx.tools?.write?.maxFileSize ?? Infinity
    const maxFileSize = Math.min(secLimit, toolLimit)
    if (params.content.length > maxFileSize) return { output: `Error: 内容超过大小限制 (${maxFileSize} bytes)`, isError: true }
    try {
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, params.content, 'utf-8')
      return { output: `Successfully wrote ${params.content.length} bytes to ${filePath}`, metadata: { filePath, size: params.content.length } }
    } catch (err: any) {
      return { output: `Error writing file: ${err.message}`, isError: true }
    }
  },
}
