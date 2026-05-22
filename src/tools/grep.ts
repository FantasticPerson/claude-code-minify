import { z } from 'zod'
import { ToolSpec } from './base.js'
import { exec } from 'child_process'
import * as path from 'path'
import { checkFileSecurity } from './security.js'
import { DEFAULT_GREP_TIMEOUT, DEFAULT_GREP_MAX_COLUMNS, DEFAULT_GREP_MAX_BUFFER, DEFAULT_GREP_SKIP_DIRS } from '../core/defaults.js'

export const grepTool: ToolSpec = {
  name: 'grep',
  description: 'Search file contents using regex patterns (ripgrep).',
  schema: z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('Directory to search in'),
    glob: z.string().optional().describe('File pattern filter'),
    output_mode: z.enum(['content', 'files_with_matches', 'count']).optional(),
    '-i': z.boolean().optional().describe('Case insensitive'),
    head_limit: z.number().optional().describe('Limit output'),
  }),
  execute: async (params, ctx) => {
    const searchPath = path.resolve(ctx.workingDir, params.path || '.')
    const secErr = checkFileSecurity(searchPath, ctx.workingDir, ctx.security?.file)
    if (secErr) return { output: secErr, isError: true }
    const outputMode = params.output_mode ?? 'files_with_matches'
    const timeout = ctx.tools?.grep?.timeout ?? DEFAULT_GREP_TIMEOUT
    const maxColumns = ctx.tools?.grep?.maxColumns ?? DEFAULT_GREP_MAX_COLUMNS
    const maxBuffer = ctx.tools?.grep?.maxBuffer ?? DEFAULT_GREP_MAX_BUFFER
    const baseSkipDirs = ctx.tools?.grep?.skipDirs ?? DEFAULT_GREP_SKIP_DIRS
    const extraSkipDirs = ctx.tools?.grep?.extraSkipDirs ?? []
    const skipDirs = [...baseSkipDirs, ...extraSkipDirs]
    const args: string[] = ['rg', '--hidden']
    for (const d of skipDirs) args.push('--glob', `!${d}`)
    if (params['-i']) args.push('-i')
    if (params.glob) args.push('--glob', params.glob)
    if (outputMode === 'files_with_matches') args.push('-l')
    else if (outputMode === 'count') args.push('-c')
    else args.push('-n')
    args.push('--max-columns', String(maxColumns), '--', params.pattern, searchPath)
    return new Promise((resolve) => {
      exec(args.join(' '), { cwd: ctx.workingDir, timeout, maxBuffer }, (error, stdout) => {
        if (error && !stdout) { resolve({ output: 'No matches found' }); return }
        let output = (stdout || '').replace(new RegExp(ctx.workingDir + '/', 'g'), '')
        if (params.head_limit && params.head_limit > 0) {
          const lines = output.split('\n')
          if (lines.length > params.head_limit) output = lines.slice(0, params.head_limit).join('\n') + '\n... [truncated]'
        }
        resolve({ output: output || 'No matches found' })
      })
    })
  },
}
