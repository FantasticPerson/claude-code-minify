import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

export interface ClaudeMDOptions {
  workingDir: string
  customInstructions?: string
}

export async function loadClaudeMD(options: ClaudeMDOptions): Promise<string> {
  const parts: string[] = []
  parts.push(await tryReadFile(path.join(os.homedir(), '.claude', 'CLAUDE.md')))
  parts.push(await tryReadFile(path.join(options.workingDir, 'CLAUDE.md')))
  parts.push(await tryReadFile(path.join(options.workingDir, '.claude', 'CLAUDE.md')))
  try {
    const rulesDir = path.join(options.workingDir, '.claude', 'rules')
    const files = await fs.readdir(rulesDir)
    for (const file of files.sort()) {
      if (file.endsWith('.md')) parts.push(await tryReadFile(path.join(rulesDir, file)))
    }
  } catch {}
  for (const name of ['GEMINI.md', 'AGENTS.md', '.cursorrules']) {
    parts.push(await tryReadFile(path.join(options.workingDir, name)))
  }
  if (options.customInstructions) parts.push(options.customInstructions)
  return parts.filter(Boolean).join('\n\n')
}

async function tryReadFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return content.replace(/^---[\s\S]*?---\n*/, '').trim()
  } catch { return '' }
}
