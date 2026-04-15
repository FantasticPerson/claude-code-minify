import { z } from 'zod'
import { ToolSpec } from './base.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const fileWriteTool: ToolSpec = {
  name: 'file_write',
  description: 'Write content to a file. Creates parent directories if needed. Overwrites existing files.',
  schema: z.object({
    file_path: z.string().describe('Absolute path to the file'),
    content: z.string().describe('Content to write'),
  }),
  execute: async (params, ctx) => {
    const filePath = path.resolve(ctx.workingDir, params.file_path)
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
