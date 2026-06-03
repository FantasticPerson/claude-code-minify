import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import { bashTool } from '../src/tools/bash.js'
import { grepTool } from '../src/tools/grep.js'
import { globTool } from '../src/tools/glob.js'
import { todoWriteTool } from '../src/tools/todo-write.js'
import { askUserTool } from '../src/tools/ask-user.js'
import { ToolContext } from '../src/core/types.js'

// ============================================================================
// Shared setup: temporary directory
// ============================================================================

let tmpDir: string
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tools-test-'))
})
afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
})

function ctx(overrides?: Partial<ToolContext>): ToolContext {
  return { workingDir: tmpDir, sessionId: 'test-session', ...overrides }
}

// Check if ripgrep is available for grep tests
let hasRg = false
try {
  execSync('rg --version', { stdio: 'pipe' })
  hasRg = true
} catch {
  hasRg = false
}

// ============================================================================
// Bash tool tests
// ============================================================================

describe('bash tool', () => {
  it('echo hello returns output containing "hello"', async () => {
    const result = await bashTool.execute({ command: 'echo hello' }, ctx())
    expect(result.output).toContain('hello')
    expect(result.isError).toBeFalsy()
  })

  it('exit 1 returns isError=true', async () => {
    const result = await bashTool.execute({ command: 'exit 1' }, ctx())
    expect(result.isError).toBe(true)
  })

  it('times out when command exceeds timeout', async () => {
    const result = await bashTool.execute(
      { command: 'node -e "setTimeout(()=>{},10000)"', timeout: 200 },
      ctx(),
    )
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/timeout|killed|signal/i)
  }, 10_000)

  it('truncates large output', async () => {
    // Generate a lot of output with a small truncate limit
    const result = await bashTool.execute(
      { command: 'yes a | head -60000' },
      ctx({
        tools: {
          bash: { outputTruncateLimit: 1000 },
        },
      }),
    )
    expect(result.output).toContain('[truncated]')
    expect(result.output.length).toBeLessThan(60000)
  }, 15_000)

  it('restrictToProjectDir blocks access to paths outside working dir via blocked paths', async () => {
    const result = await bashTool.execute(
      { command: 'ls /etc' },
      ctx({
        security: {
          bash: { blockedSystemPaths: ['/etc', '/usr', '/var', '/System', '/Library'] },
        },
      }),
    )
    expect(result.isError).toBe(true)
    expect(result.output).toContain('Error')
  })
})

// ============================================================================
// Grep tool tests
// ============================================================================

describe.skipIf(!hasRg)('grep tool', () => {
  beforeAll(async () => {
    // Create test files for grep
    await fs.writeFile(path.join(tmpDir, 'grep-test.txt'), 'Hello World\nfoo bar\nbaz qux')
    await fs.writeFile(path.join(tmpDir, 'grep-test2.txt'), 'hello again\nno match here')
  })

  it('searches file content and returns matching lines', async () => {
    const result = await grepTool.execute(
      { pattern: 'Hello', path: '.', output_mode: 'content' },
      ctx(),
    )
    expect(result.output).toContain('Hello World')
    expect(result.isError).toBeFalsy()
  })

  it('returns no results message when nothing matches', async () => {
    const result = await grepTool.execute(
      { pattern: 'zzz_nonexistent_pattern_zzz' },
      ctx(),
    )
    expect(result.output).toContain('No matches found')
    expect(result.isError).toBeFalsy()
  })

  it('returns error for non-existent path outside project dir when restricted', async () => {
    const result = await grepTool.execute(
      { pattern: 'test', path: '/nonexistent/path/xyz' },
      ctx({
        security: {
          file: { restrictToProjectDir: true },
        },
      }),
    )
    expect(result.isError).toBe(true)
    expect(result.output).toContain('Error')
  })

  it('finds matches with case insensitive flag', async () => {
    const result = await grepTool.execute(
      { pattern: 'hello', '-i': true, output_mode: 'content' },
      ctx(),
    )
    // Should match "Hello World" and "hello again"
    expect(result.output.toLowerCase()).toContain('hello')
  })
})

// ============================================================================
// Glob tool tests
// ============================================================================

describe('glob tool', () => {
  beforeAll(async () => {
    await fs.writeFile(path.join(tmpDir, 'file1.txt'), 'content1')
    await fs.writeFile(path.join(tmpDir, 'file2.txt'), 'content2')
    await fs.writeFile(path.join(tmpDir, 'file3.md'), 'content3')
  })

  it('matches existing files with *.txt pattern', async () => {
    const result = await globTool.execute({ pattern: '*.txt' }, ctx())
    expect(result.output).toContain('file1.txt')
    expect(result.output).toContain('file2.txt')
    expect(result.output).not.toContain('file3.md')
    expect(result.isError).toBeFalsy()
  })

  it('returns empty result for non-matching pattern', async () => {
    const result = await globTool.execute({ pattern: '*.nonexistent' }, ctx())
    expect(result.output).toContain('No files found')
    expect(result.isError).toBeFalsy()
  })

  it('truncates results when exceeding maxResults', async () => {
    // Create many files
    for (let i = 0; i < 20; i++) {
      await fs.writeFile(path.join(tmpDir, `many-${String(i).padStart(3, '0')}.dat`), `data${i}`)
    }
    const result = await globTool.execute(
      { pattern: 'many-*.dat' },
      ctx({ tools: { glob: { maxResults: 5 } } }),
    )
    expect(result.output).toContain('... and more files')
    expect(result.metadata?.numFiles).toBe(5)
    expect(result.metadata?.truncated).toBe(true)
  })
})

// ============================================================================
// Todo-write tool tests
// ============================================================================

describe('todo_write tool', () => {
  it('returns success with task summary', async () => {
    const result = await todoWriteTool.execute({
      todos: [
        { content: 'Task 1', status: 'completed', activeForm: 'Doing task 1' },
        { content: 'Task 2', status: 'in_progress', activeForm: 'Doing task 2' },
        { content: 'Task 3', status: 'pending', activeForm: 'Doing task 3' },
      ],
    })
    expect(result.output).toContain('1/3 completed')
    expect(result.output).toContain('working on: Doing task 2')
    expect(result.isError).toBeFalsy()
    expect(result.metadata?.todos).toHaveLength(3)
  })

  it('handles empty todos array', async () => {
    const result = await todoWriteTool.execute({ todos: [] })
    expect(result.output).toContain('0/0 completed')
    expect(result.isError).toBeFalsy()
  })
})

// ============================================================================
// Ask-user tool tests
// ============================================================================

describe('ask_user tool', () => {
  it('returns the question as output', async () => {
    const question = 'What is your favorite color?'
    const result = await askUserTool.execute({ question })
    expect(result.output).toBe(question)
    expect(result.metadata?.needsUserResponse).toBe(true)
    expect(result.isError).toBeFalsy()
  })
})
