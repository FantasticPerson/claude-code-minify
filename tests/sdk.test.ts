import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { ClaudeSDK } from '../src/index.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('ClaudeSDK', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sdk-test-'))
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true }).catch(() => {})
  })

  it('creates SDK with OpenAI provider', () => {
    const sdk = new ClaudeSDK({
      provider: 'openai',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'test-key',
      model: 'test-model',
      workingDir: tmpDir,
    })
    expect(sdk).toBeDefined()
  })

  it('creates SDK with Anthropic provider', () => {
    const sdk = new ClaudeSDK({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      workingDir: tmpDir,
    })
    expect(sdk).toBeDefined()
  })

  it('loads CLAUDE.md', async () => {
    await fs.writeFile(path.join(tmpDir, 'CLAUDE.md'), '# Test\nUse TypeScript')
    const sdk = new ClaudeSDK({
      provider: 'openai',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'test-key',
      model: 'test-model',
      workingDir: tmpDir,
    })
    const content = await sdk.loadClaudeMD()
    expect(content).toContain('Use TypeScript')
  })

  it('lists available skills', async () => {
    const sdk = new ClaudeSDK({
      provider: 'openai',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'test-key',
      model: 'test-model',
      workingDir: tmpDir,
    })
    const skills = await sdk.getSkills()
    expect(skills.length).toBeGreaterThanOrEqual(6)
    expect(skills.find(s => s.name === 'brainstorming')).toBeDefined()
    expect(skills.find(s => s.name === 'debugging')).toBeDefined()
    expect(skills.find(s => s.name === 'verify')).toBeDefined()
  })

  it('registers custom tools', () => {
    const sdk = new ClaudeSDK({
      provider: 'openai',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'test-key',
      model: 'test-model',
      workingDir: tmpDir,
    })
    const { z } = require('zod')
    sdk.registerTool({
      name: 'custom_tool',
      description: 'A custom test tool',
      schema: z.object({ input: z.string() }),
      execute: async (params) => ({ output: `Processed: ${params.input}` }),
    })
  })

  it('creates sessions', () => {
    const sdk = new ClaudeSDK({
      provider: 'openai',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'test-key',
      model: 'test-model',
      workingDir: tmpDir,
    })
    const session = sdk.createSession()
    expect(session).toBeDefined()
    expect(session.chat).toBeDefined()
    expect(session.chatStream).toBeDefined()
    expect(session.reset).toBeDefined()
  })

  it('sets instructions', () => {
    const sdk = new ClaudeSDK({
      provider: 'openai',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'test-key',
      model: 'test-model',
      workingDir: tmpDir,
    })
    sdk.setInstructions('Always use TypeScript strict mode')
  })
})

describe('Tools', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sdk-tools-'))
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true }).catch(() => {})
  })

  it('file_read reads files', async () => {
    const filePath = path.join(tmpDir, 'test.txt')
    await fs.writeFile(filePath, 'line1\nline2\nline3')
    const { fileReadTool } = await import('../src/tools/file-read.js')
    const result = await fileReadTool.execute({ file_path: filePath }, { workingDir: tmpDir, sessionId: 'test' })
    expect(result.output).toContain('line1')
    expect(result.output).toContain('line3')
    expect(result.isError).toBeFalsy()
  })

  it('file_read with offset/limit', async () => {
    const filePath = path.join(tmpDir, 'test-offset.txt')
    await fs.writeFile(filePath, 'a\nb\nc\nd\ne')
    const { fileReadTool } = await import('../src/tools/file-read.js')
    const result = await fileReadTool.execute({ file_path: filePath, offset: 1, limit: 2 }, { workingDir: tmpDir, sessionId: 'test' })
    expect(result.output).toContain('b')
    expect(result.output).toContain('c')
    expect(result.output).not.toContain('a')
  })

  it('file_write writes files', async () => {
    const { fileWriteTool } = await import('../src/tools/file-write.js')
    const filePath = path.join(tmpDir, 'subdir', 'new-file.txt')
    const result = await fileWriteTool.execute({ file_path: filePath, content: 'hello world' }, { workingDir: tmpDir, sessionId: 'test' })
    expect(result.isError).toBeFalsy()
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('hello world')
  })

  it('file_edit replaces strings', async () => {
    const filePath = path.join(tmpDir, 'edit-test.txt')
    await fs.writeFile(filePath, 'foo bar baz')
    const { fileEditTool } = await import('../src/tools/file-edit.js')
    const result = await fileEditTool.execute({ file_path: filePath, old_string: 'bar', new_string: 'BAR' }, { workingDir: tmpDir, sessionId: 'test' })
    expect(result.isError).toBeFalsy()
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('foo BAR baz')
  })

  it('file_edit rejects non-unique match', async () => {
    const filePath = path.join(tmpDir, 'edit-dup.txt')
    await fs.writeFile(filePath, 'aaa aaa aaa')
    const { fileEditTool } = await import('../src/tools/file-edit.js')
    const result = await fileEditTool.execute({ file_path: filePath, old_string: 'aaa', new_string: 'bbb' }, { workingDir: tmpDir, sessionId: 'test' })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('multiple times')
  })

  it('file_edit with replace_all', async () => {
    const filePath = path.join(tmpDir, 'edit-all.txt')
    await fs.writeFile(filePath, 'aaa aaa aaa')
    const { fileEditTool } = await import('../src/tools/file-edit.js')
    const result = await fileEditTool.execute({ file_path: filePath, old_string: 'aaa', new_string: 'bbb', replace_all: true }, { workingDir: tmpDir, sessionId: 'test' })
    expect(result.isError).toBeFalsy()
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('bbb bbb bbb')
  })
})

describe('Memory', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sdk-memory-'))
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true }).catch(() => {})
  })

  it('saves and loads memories', async () => {
    const { MemoryManager } = await import('../src/memory/manager.js')
    const mgr = new MemoryManager(tmpDir)
    await mgr.save('user', 'test-memory', '# Test Memory\nUser prefers TypeScript')
    const memories = await mgr.load('user')
    expect(memories.length).toBe(1)
    expect(memories[0].name).toBe('test-memory')
    expect(memories[0].content).toContain('TypeScript')
  })

  it('loads all memories as text', async () => {
    const { MemoryManager } = await import('../src/memory/manager.js')
    const mgr = new MemoryManager(tmpDir)
    await mgr.save('project', 'arch', '# Architecture\nUses Express')
    const text = await mgr.loadAllAsText()
    expect(text).toContain('Architecture')
  })

  it('deletes memories', async () => {
    const { MemoryManager } = await import('../src/memory/manager.js')
    const mgr = new MemoryManager(tmpDir)
    await mgr.save('feedback', 'to-delete', 'some feedback')
    await mgr.delete('to-delete')
    const memories = await mgr.load('feedback')
    expect(memories.find(m => m.name === 'to-delete')).toBeUndefined()
  })
})
