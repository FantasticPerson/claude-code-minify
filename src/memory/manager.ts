import * as fs from 'fs/promises'
import * as path from 'path'
import { Memory, MemoryType } from '../core/types.js'

export class MemoryManager {
  private memoryDir: string

  constructor(workingDir: string) {
    this.memoryDir = path.join(workingDir, '.claude', 'memory')
  }

  async init(): Promise<void> {
    await fs.mkdir(this.memoryDir, { recursive: true })
  }

  async save(type: MemoryType, name: string, content: string): Promise<void> {
    await this.init()
    const filePath = this.getFilePath(type, name)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async load(type?: MemoryType): Promise<Memory[]> {
    await this.init()
    const memories: Memory[] = []
    const types = type ? [type] : (['user', 'feedback', 'project', 'reference'] as MemoryType[])
    for (const t of types) {
      const dir = path.join(this.memoryDir, t)
      try {
        const files = await fs.readdir(dir)
        for (const file of files) {
          if (!file.endsWith('.md')) continue
          const content = await fs.readFile(path.join(dir, file), 'utf-8')
          const stat = await fs.stat(path.join(dir, file))
          memories.push({ type: t, name: file.replace('.md', ''), content, updatedAt: stat.mtime })
        }
      } catch {}
    }
    return memories
  }

  async delete(name: string): Promise<void> {
    for (const type of ['user', 'feedback', 'project', 'reference'] as MemoryType[]) {
      try { await fs.unlink(this.getFilePath(type, name)); return } catch {}
    }
  }

  async loadAllAsText(): Promise<string> {
    const memories = await this.load()
    if (memories.length === 0) return ''
    return memories.map(m => `## [${m.type}] ${m.name}\n${m.content}`).join('\n\n')
  }

  private getFilePath(type: MemoryType, name: string): string {
    return path.join(this.memoryDir, type, `${name}.md`)
  }
}
