import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { logger } from '../core/logger.js'

export interface ClaudeMDOptions {
  workingDir: string
  customInstructions?: string
}

export async function loadClaudeMD(options: ClaudeMDOptions): Promise<string> {
  logger.log('config', 'loading CLAUDE.md files', { workingDir: options.workingDir })
  const parts: string[] = []
  const paths = [
    path.join(os.homedir(), '.claude', 'CLAUDE.md'),
    path.join(options.workingDir, 'CLAUDE.md'),
    path.join(options.workingDir, '.claude', 'CLAUDE.md'),
  ]
  for (const p of paths) {
    const content = await tryReadFile(p)
    if (content) logger.log('config', `loaded ${path.basename(p)}`, { path: p, length: content.length })
    parts.push(content)
  }
  try {
    const rulesDir = path.join(options.workingDir, '.claude', 'rules')
    const files = await fs.readdir(rulesDir)
    for (const file of files.sort()) {
      if (file.endsWith('.md')) {
        const content = await tryReadFile(path.join(rulesDir, file))
        if (content) logger.log('config', `loaded rule ${file}`, { length: content.length })
        parts.push(content)
      }
    }
  } catch (err) {
    if ((err as any).code !== 'ENOENT' && (err as any).code !== 'ENOTDIR') {
      logger.error('config', 'failed to load rules', { error: (err as Error).message })
    }
  }
  for (const name of ['GEMINI.md', 'AGENTS.md', '.cursorrules']) {
    const content = await tryReadFile(path.join(options.workingDir, name))
    if (content) logger.log('config', `loaded ${name}`, { length: content.length })
    parts.push(content)
  }
  if (options.customInstructions) parts.push(options.customInstructions)
  const result = parts.filter(Boolean).join('\n\n')
  logger.log('config', 'CLAUDE.md loaded', { totalLength: result.length, partCount: parts.filter(Boolean).length })
  return result
}

async function tryReadFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return content.replace(/^---\n([\s\S]*?)\n---\n/, '').trim()
  } catch { return '' }
}
