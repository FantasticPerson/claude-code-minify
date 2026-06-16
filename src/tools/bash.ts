import { z } from 'zod'
import { ToolSpec } from './base.js'
import { spawn } from 'child_process'
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
      // Already aborted before execution
      if (ctx.abortSignal?.aborted) {
        resolve({ output: 'Error: aborted before execution', isError: true })
        return
      }

      const child = spawn(cmd, {
        cwd: execCwd,
        shell: true,
        detached: true, // new process group → kill(-pid) kills the whole tree
        env: { ...process.env },
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let aborted = false
      let bufferOverflow = false
      let resolved = false

      const killTree = (signal: NodeJS.Signals = 'SIGTERM') => {
        try {
          if (child.pid) process.kill(-child.pid, signal)
        } catch {}
      }
      const onAbort = () => {
        aborted = true
        killTree('SIGKILL')
      }
      const timer = setTimeout(() => {
        timedOut = true
        killTree('SIGKILL')
      }, timeout)
      const cleanup = () => {
        ctx.abortSignal?.removeEventListener('abort', onAbort)
        clearTimeout(timer)
      }
      const finish = (code: number | null) => {
        if (resolved) return
        resolved = true
        cleanup()

        let output = ''
        if (stdout) output += stdout
        if (stderr) output += (output ? '\n' : '') + stderr
        if (aborted) output += (output ? '\n' : '') + '[aborted]'
        else if (timedOut) output += (output ? '\n' : '') + '[killed: timeout]'
        else if (bufferOverflow) output += (output ? '\n' : '') + '[output limit exceeded]'
        else if (code && code !== 0) output += (output ? '\n' : '') + `[Exit code: ${code}]`

        if (output.length > truncateLimit) {
          const half = Math.floor(truncateLimit / 2)
          output = output.slice(0, half) + '\n\n... [truncated] ...\n' + output.slice(-half)
        }
        resolve({ output, isError: aborted || timedOut || bufferOverflow || !!code })
      }

      ctx.abortSignal?.addEventListener('abort', onAbort)
      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString()
        if (stdout.length + stderr.length > maxBuffer) {
          bufferOverflow = true
          killTree('SIGKILL')
        }
      })
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
        if (stdout.length + stderr.length > maxBuffer) {
          bufferOverflow = true
          killTree('SIGKILL')
        }
      })
      child.on('error', (err) => {
        if (resolved) return
        resolved = true
        cleanup()
        resolve({ output: `Error: ${err.message}`, isError: true })
      })
      child.on('close', (code) => finish(code))
    })
  },
}
