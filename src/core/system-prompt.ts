import { loadClaudeMD } from '../config/claude-md.js'
import { MemoryManager } from '../memory/manager.js'
import { Skill } from './types.js'

export interface SystemPromptOptions {
  workingDir: string
  customInstructions?: string
  skills?: Skill[]
  activeSkill?: Skill
}

export async function buildSystemPrompt(options: SystemPromptOptions): Promise<string> {
  const parts: string[] = []

  // 1. Core system prompt
  parts.push(getCorePrompt())

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
  } catch {}

  // 4. Active skill (if invoked)
  if (options.activeSkill) {
    parts.push(`# Active Skill: ${options.activeSkill.name}\n\n${options.activeSkill.content}`)
  }

  // 5. Environment info
  parts.push(getEnvironmentSection(options.workingDir))

  return parts.join('\n\n---\n\n')
}

function getCorePrompt(): string {
  return `You are an expert software development assistant. You have access to tools for reading, writing, and editing files, executing commands, and searching code.

Key guidelines:
- Read files before modifying them
- Make precise, minimal edits rather than rewriting entire files
- Use the bash tool for running commands (npm install, build, test, etc.)
- Write production-quality code with proper error handling
- Follow existing code patterns and conventions in the project
- When generating a full project, create all necessary files including config files

Available tools:
- file_read: Read file contents
- file_write: Write/create files
- file_edit: Make precise string replacements in files
- bash: Execute shell commands
- grep: Search file contents
- glob: Find files by pattern
- todo_write: Track task progress
- ask_user: Ask the user questions`
}

function getEnvironmentSection(workingDir: string): string {
  return `# Environment
- Working directory: ${workingDir}
- Platform: ${process.platform}
- Node.js: ${process.version}`
}
