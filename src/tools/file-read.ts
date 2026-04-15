import { z } from 'zod'
import { ToolSpec } from './base.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const fileReadTool: ToolSpec = {
  name: 'file_read',
  description: 'Read file contents. Use absolute paths. Supports offset/limit for large files.',
  schema: z.object({
    file_path: z.string().describe('Absolute path to the file'),
    offset: z.number().int().nonnegative().optional().describe('Line number to start reading from (0-indexed)'),
    limit: z.number().int().positive().optional().describe('Number of lines to read'),
  }),
  execute: async (params, ctx) => {
    const filePath = path.resolve(ctx.workingDir, params.file_path)
    if (filePath.startsWith('/dev/')) return { output: `Error: Cannot read device files`, isError: true }
    try {
      const stat = await fs.stat(filePath)
      if (stat.isDirectory()) return { output: `Error: ${filePath} is a directory, not a file`, isError: true }
      if (stat.size > 1024 * 1024) return { output: `Error: File too large (${Math.round(stat.size / 1024)}KB). Use offset/limit to read portions.`, isError: true }
      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n')
      const offset = params.offset ?? 0
      const limit = params.limit ?? lines.length
      const selectedLines = lines.slice(offset, offset + limit)
      const numbered = selectedLines.map((line, i) => `${offset + i + 1}\t${line}`).join('\n')
      return { output: numbered, metadata: { filePath, totalLines: lines.length, startLine: offset + 1, linesRead: selectedLines.length } }
    } catch (err: any) {
      if (err.code === 'ENOENT') return { output: `Error: File not found: ${filePath}`, isError: true }
      if (err.code === 'EACCES') return { output: `Error: Permission denied: ${filePath}`, isError: true }
      return { output: `Error reading file: ${err.message}`, isError: true }
    }
  },
}
