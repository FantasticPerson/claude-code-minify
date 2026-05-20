import { z } from 'zod'
import { ToolSpec } from './base.js'
import { exec } from 'child_process'
import path from 'path'

export const bashTool: ToolSpec = {
  name: 'bash',
  description: 'Execute a shell command. Returns stdout and stderr. Working directory is the project root.',
  schema: z.object({
    command: z.string().describe('The shell command to execute'),
    timeout: z.number().optional().describe('Timeout in milliseconds (max 600000)'),
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
    const timeout = Math.min(params.timeout ?? 120000, 600000)
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
      exec(cmd, { cwd: execCwd, timeout, maxBuffer: 10 * 1024 * 1024, env: { ...process.env } }, (error, stdout, stderr) => {
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
