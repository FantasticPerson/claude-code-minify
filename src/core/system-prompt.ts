import { loadClaudeMD } from '../config/claude-md.js'
import { MemoryManager } from '../memory/manager.js'
import { Skill } from './types.js'

export interface SystemPromptOptions {
  workingDir: string
  customInstructions?: string
  skills?: Skill[]
  activeSkill?: Skill
  /** 运行模式：'coding'（默认）或 'general' */
  mode?: 'coding' | 'general'
  /** 实际注册的工具名称列表，用于动态生成 Available tools 段 */
  enabledTools?: string[]
}

export async function buildSystemPrompt(options: SystemPromptOptions): Promise<string> {
  const parts: string[] = []

  // 1. Core system prompt
  parts.push(getCorePrompt(options.mode ?? 'coding', options.enabledTools ?? []))

  // 2. CLAUDE.md content
  const claudeMD = await loadClaudeMD({
    workingDir: options.workingDir,
    customInstructions: options.customInstructions,
  })
  if (claudeMD) {
    parts.push(`# Project Instructions\n\n${claudeMD}`)
  }

  // 3. Memory
  try {
    const memoryManager = new MemoryManager(options.workingDir)
    const memoryText = await memoryManager.loadAllAsText()
    if (memoryText) {
      parts.push(`# Memory\n\n${memoryText}`)
    }
  } catch (err) {
    console.error('[Memory] Failed to load memory:', err instanceof Error ? err.message : err)
  }

  // 4. Active skill (if invoked)
  if (options.activeSkill) {
    parts.push(`# Active Skill: ${options.activeSkill.name}\n\n${options.activeSkill.content}`)
  }

  // 5. Environment info
  parts.push(getEnvironmentSection(options.workingDir))

  return parts.join('\n\n---\n\n')
}

function getCorePrompt(mode: string, enabledTools: string[]): string {
  const toolList = enabledTools
    .map(name => TOOL_DESCRIPTIONS[name])
    .filter(Boolean)
    .join('\n')

  const toolSection = toolList ? `\n\nAvailable tools:\n${toolList}` : ''

  if (mode === 'general') {
    return `You are a helpful AI assistant. You can answer questions, analyze information, and assist with various tasks.${toolSection}`
  }

  // coding 模式（默认）
  return `You are an expert software development assistant. You have access to tools for reading, writing, and editing files, executing commands, and searching code.

Key guidelines:
- Read files before modifying them
- Make precise, minimal edits rather than rewriting entire files
- Use the bash tool for running commands (npm install, build, test, etc.)
- Write production-quality code with proper error handling
- Follow existing code patterns and conventions in the project
- When generating a full project, create all necessary files including config files${toolSection}`
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
  file_read: '- file_read: Read file contents',
  file_write: '- file_write: Write/create files',
  file_edit: '- file_edit: Make precise string replacements in files',
  bash: '- bash: Execute shell commands',
  grep: '- grep: Search file contents',
  glob: '- glob: Find files by pattern',
  todo_write: '- todo_write: Track task progress',
  ask_user: '- ask_user: Ask the user questions',
}

function getEnvironmentSection(workingDir: string): string {
  return `# Environment
- Working directory: ${workingDir}
- Platform: ${process.platform}
- Node.js: ${process.version}`
}
