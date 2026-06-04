import { z } from 'zod'
import { ToolSpec } from './base.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import { checkFileSecurity } from './security.js'
import { DEFAULT_GLOB_MAX_RESULTS, DEFAULT_GLOB_SKIP_DIRS } from '../core/defaults.js'

function matchGlob(pattern: string, filename: string): boolean {
  // Convert simple glob patterns to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{DOUBLESTAR}}/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${regexStr}$`).test(filename)
}

async function walkDir(dir: string, pattern: string, results: string[], limit: number, skipDirs: string[], prefix: string = '', depth: number = 0): Promise<void> {
  if (results.length >= limit || depth > 20) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (results.length >= limit) return
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (skipDirs.includes(entry.name)) continue
      await walkDir(path.join(dir, entry.name), pattern, results, limit, skipDirs, relPath, depth + 1)
    } else if (entry.isFile()) {
      if (matchGlob(pattern, relPath)) {
        results.push(relPath)
      }
    }
  }
}

export const globTool: ToolSpec = {
  name: 'glob',
  description: 'Find files by name pattern. Returns matching file paths.',
  schema: z.object({
    pattern: z.string().describe('Glob pattern (e.g. "**/*.ts")'),
    path: z.string().optional().describe('Directory to search in'),
  }),
  execute: async (params, ctx) => {
    const searchPath = params.path ? path.resolve(ctx.workingDir, params.path) : ctx.workingDir
    const secErr = await checkFileSecurity(searchPath, ctx.workingDir, ctx.security?.file)
    if (secErr) return { output: secErr, isError: true }
    try {
      const limit = ctx.tools?.glob?.maxResults ?? DEFAULT_GLOB_MAX_RESULTS
      const baseSkipDirs = ctx.tools?.glob?.skipDirs ?? DEFAULT_GLOB_SKIP_DIRS
      const extraSkipDirs = ctx.tools?.glob?.extraSkipDirs ?? []
      const skipDirs = [...baseSkipDirs, ...extraSkipDirs]
      const files: string[] = []
      await walkDir(searchPath, params.pattern, files, limit, skipDirs)
      const truncated = files.length >= limit
      return {
        output: files.length > 0
          ? files.join('\n') + (truncated ? `\n... and more files` : '')
          : 'No files found',
        metadata: { numFiles: files.length, truncated },
      }
    } catch (err: any) {
      return { output: `Error: ${err.message}`, isError: true }
    }
  },
}
