import { z } from 'zod'
import { ToolSpec } from './base.js'
import { exec } from 'child_process'
import path from 'path'
import { DEFAULT_BASH_TIMEOUT, DEFAULT_BASH_MAX_TIMEOUT, DEFAULT_BASH_MAX_BUFFER, DEFAULT_BASH_TRUNCATE_LIMIT } from '../core/defaults.js'

export const bashTool: ToolSpec = {
  name: 'bash',
  description: 'Execute a shell command. Returns stdout and stderr. Working directory is the project root.',
  schema: z.object({
    command: z.string().describe('The shell command to execute'),
    timeout: z.number().optional().describe(`Timeout in milliseconds (max ${DEFAULT_BASH_MAX_TIMEOUT})`),
    description: z.string().optional().describe('Brief description of what the command does'),
  }),
  execute: async (params, ctx) => {
    const bashSec = ctx.security?.bash
    const protectedPorts = bashSec?.protectedPorts ?? []
    const blockedPaths = bashSec?.blockedSystemPaths ?? []
    const restrictToProjectDir = bashSec?.restrictToProjectDir ?? false

    const rawCmd = params.command
    if (protectedPorts.length > 0) {
      const killPortMatch = rawCmd.match(/(?:kill|lsof\s+-ti:?|fuser\s+-k)\D*(\d+)/g)
      if (killPortMatch) {
        for (const m of killPortMatch) {
          const ports = m.match(/\d+/g)
          if (ports && ports.some((p: string) => protectedPorts.includes(parseInt(p)))) {
            return { output: `Error: Killing processes on protected ports (${protectedPorts.join(', ')}) is not allowed.`, isError: true }
          }
        }
      }
    }
    const maxTimeout = ctx.tools?.bash?.maxTimeout ?? DEFAULT_BASH_MAX_TIMEOUT
    const defaultTimeout = Math.min(ctx.tools?.bash?.defaultTimeout ?? DEFAULT_BASH_TIMEOUT, maxTimeout)
    const timeout = Math.min(params.timeout ?? defaultTimeout, maxTimeout)
    const maxBuffer = ctx.tools?.bash?.maxBuffer ?? DEFAULT_BASH_MAX_BUFFER
    const truncateLimit = ctx.tools?.bash?.outputTruncateLimit ?? DEFAULT_BASH_TRUNCATE_LIMIT
    const workDir = ctx.workingDir
    let execCwd = workDir
    let cmd = rawCmd
    if (restrictToProjectDir) {
      const cdParsed = cmd.match(/^cd\s+([^&;\s]+)\s*&&\s*([\s\S]+)$/)
      if (cdParsed) {
        const target = cdParsed[1].replace(/^['"]|['"]$/g, '')
        const resolved = path.resolve(workDir, target)
        if (!resolved.startsWith(workDir)) {
          return { output: `Error: 不允许访问项目目录外的路径: ${target}`, isError: true }
        }
        execCwd = resolved
        cmd = cdParsed[2]
      }
    }
    if (blockedPaths.length > 0) {
      const pattern = new RegExp(`(?:^|\\s)(?:${blockedPaths.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`)
      if (pattern.test(cmd)) {
        return { output: `Error: 不允许访问受限制目录 (${blockedPaths.join(', ')})`, isError: true }
      }
    }
    return new Promise((resolve) => {
      exec(cmd, { cwd: execCwd, timeout, maxBuffer, env: { ...process.env } }, (error, stdout, stderr) => {
        if (error && !stdout && !stderr) { resolve({ output: `Exit code ${error.code}\n${error.message}`, isError: true }); return }
        let output = ''
        if (stdout) output += stdout
        if (stderr) output += (output ? '\n' : '') + stderr
        if (error && error.code) output += `\n[Exit code: ${error.code}]`
        if (output.length > truncateLimit) {
          const half = Math.floor(truncateLimit / 2)
          output = output.slice(0, half) + '\n\n... [truncated] ...\n' + output.slice(-half)
        }
        resolve({ output, isError: !!error })
      })
    })
  },
}
