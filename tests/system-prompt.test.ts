import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildSystemPrompt } from '../src/core/system-prompt.js'
import { Skill } from '../src/core/types.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const tmpDir = path.join(os.tmpdir(), `test-system-prompt-${Date.now()}`)

beforeAll(async () => {
  await fs.mkdir(tmpDir, { recursive: true })
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('buildSystemPrompt', () => {
  it('generates a prompt with tool descriptions when enabledTools provided', async () => {
    const prompt = await buildSystemPrompt({
      workingDir: tmpDir,
      enabledTools: ['file_read', 'file_write', 'bash'],
    })
    expect(prompt).toContain('Available tools')
    expect(prompt).toContain('file_read: Read file contents')
    expect(prompt).toContain('file_write: Write/create files')
    expect(prompt).toContain('bash: Execute shell commands')
  })

  it('includes custom instructions in the prompt', async () => {
    const custom = 'Always respond in French.'
    const prompt = await buildSystemPrompt({
      workingDir: tmpDir,
      customInstructions: custom,
    })
    expect(prompt).toContain(custom)
  })

  it('mode="general" produces a general assistant prompt', async () => {
    const prompt = await buildSystemPrompt({
      workingDir: tmpDir,
      mode: 'general',
    })
    expect(prompt).toContain('helpful AI assistant')
    expect(prompt).not.toContain('software development assistant')
  })

  it('mode="coding" (default) produces a coding assistant prompt', async () => {
    const prompt = await buildSystemPrompt({ workingDir: tmpDir })
    expect(prompt).toContain('software development assistant')
    expect(prompt).toContain('Read files before modifying them')
  })

  it('enabledTools filters tool list to only specified tools', async () => {
    const prompt = await buildSystemPrompt({
      workingDir: tmpDir,
      enabledTools: ['file_read'],
    })
    expect(prompt).toContain('file_read: Read file contents')
    expect(prompt).not.toContain('file_write: Write/create files')
    expect(prompt).not.toContain('bash: Execute shell commands')
  })

  it('empty enabledTools list omits tool section entirely', async () => {
    const prompt = await buildSystemPrompt({
      workingDir: tmpDir,
      enabledTools: [],
    })
    expect(prompt).not.toContain('Available tools')
  })

  it('does not crash with empty workingDir string', async () => {
    const prompt = await buildSystemPrompt({ workingDir: '' })
    expect(prompt).toContain('Working directory: ')
    expect(typeof prompt).toBe('string')
  })

  it('includes active skill content when provided', async () => {
    const activeSkill: Skill = {
      name: 'debug-skill',
      description: 'Debug things',
      content: '# Debug\n1. Reproduce\n2. Fix',
      triggerPatterns: ['debug'],
    }
    const prompt = await buildSystemPrompt({
      workingDir: tmpDir,
      activeSkill,
    })
    expect(prompt).toContain('Active Skill: debug-skill')
    expect(prompt).toContain('1. Reproduce')
    expect(prompt).toContain('2. Fix')
  })

  it('separates sections with separator', async () => {
    const prompt = await buildSystemPrompt({ workingDir: tmpDir })
    expect(prompt).toContain('\n---\n')
  })

  it('includes environment section with platform info', async () => {
    const prompt = await buildSystemPrompt({ workingDir: tmpDir })
    expect(prompt).toContain('# Environment')
    expect(prompt).toContain(`Working directory: ${tmpDir}`)
    expect(prompt).toContain(`Platform: ${process.platform}`)
    expect(prompt).toContain(`Node.js: ${process.version}`)
  })
})
