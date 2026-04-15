import { z } from 'zod'
import { ToolSpec } from './base.js'
import { exec } from 'child_process'

export const bashTool: ToolSpec = {
  name: 'bash',
  description: 'Execute a shell command. Returns stdout and stderr. Working directory is the project root.',
  schema: z.object({
    command: z.string().describe('The shell command to execute'),
    timeout: z.number().optional().describe('Timeout in milliseconds (max 600000)'),
    description: z.string().optional().describe('Brief description of what the command does'),
  }),
  execute: async (params, ctx) => {
    const timeout = Math.min(params.timeout ?? 120000, 600000)
    return new Promise((resolve) => {
      exec(params.command, { cwd: ctx.workingDir, timeout, maxBuffer: 10 * 1024 * 1024, env: { ...process.env } }, (error, stdout, stderr) => {
        if (error && !stdout && !stderr) { resolve({ output: `Exit code ${error.code}\n${error.message}`, isError: true }); return }
        let output = ''
        if (stdout) output += stdout
        if (stderr) output += (output ? '\n' : '') + stderr
        if (error && error.code) output += `\n[Exit code: ${error.code}]`
        if (output.length > 50000) output = output.slice(0, 25000) + '\n\n... [truncated] ...\n' + output.slice(-25000)
        resolve({ output, isError: !!error })
      })
    })
  },
}
