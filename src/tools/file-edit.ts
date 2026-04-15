import { z } from 'zod'
import { ToolSpec } from './base.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const fileEditTool: ToolSpec = {
  name: 'file_edit',
  description: 'Replace exact string matches in a file. Use replace_all to replace all occurrences.',
  schema: z.object({
    file_path: z.string().describe('Absolute path to the file'),
    old_string: z.string().describe('Text to find (must be unique in file unless replace_all is true)'),
    new_string: z.string().describe('Text to replace with'),
    replace_all: z.boolean().default(false).optional().describe('Replace all occurrences'),
  }),
  execute: async (params, ctx) => {
    const filePath = path.resolve(ctx.workingDir, params.file_path)
    if (params.old_string === params.new_string) return { output: 'Error: old_string and new_string are identical', isError: true }
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      if (!content.includes(params.old_string)) return { output: `Error: old_string not found in ${filePath}`, isError: true }
      if (!params.replace_all) {
        const firstIdx = content.indexOf(params.old_string)
        const secondIdx = content.indexOf(params.old_string, firstIdx + 1)
        if (secondIdx !== -1) return { output: `Error: old_string appears multiple times. Add more context or use replace_all: true`, isError: true }
      }
      const newContent = params.replace_all ? content.replaceAll(params.old_string, params.new_string) : content.replace(params.old_string, params.new_string)
      await fs.writeFile(filePath, newContent, 'utf-8')
      const replacements = params.replace_all ? (content.split(params.old_string).length - 1) : 1
      return { output: `Successfully replaced ${replacements} occurrence(s) in ${filePath}`, metadata: { filePath, replacements } }
    } catch (err: any) {
      if (err.code === 'ENOENT') return { output: `Error: File not found: ${filePath}`, isError: true }
      return { output: `Error editing file: ${err.message}`, isError: true }
    }
  },
}
