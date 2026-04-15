// Types
export type {
  ClaudeSDKConfig, Message, ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock,
  EngineResult, EngineEvent, ToolResult, ToolContext, ToolRegistration, Skill, Memory,
  MemoryType, UsageInfo, StreamEvent, ChatParams, ChatResponse, ToolDefinition,
} from './core/types.js'

// SDK
import { ClaudeSDKConfig, EngineResult, EngineEvent, Skill, ToolRegistration } from './core/types.js'
import { OpenAIProvider } from './providers/openai.js'
import { AnthropicProvider } from './providers/anthropic.js'
import { LLMProvider } from './providers/base.js'
import { Engine } from './core/engine.js'
import { createBuiltinTools, ToolSpec, registerTool } from './tools/index.js'
import { getAllSkills } from './skills/index.js'
import { loadClaudeMD } from './config/claude-md.js'

export class ClaudeSDK {
  private config: Required<Pick<ClaudeSDKConfig, 'provider' | 'apiKey' | 'model' | 'workingDir' | 'maxTokens' | 'maxToolRounds' | 'autoLoadClaudeMD'>> & Omit<ClaudeSDKConfig, 'provider' | 'apiKey' | 'model' | 'workingDir' | 'maxTokens' | 'maxToolRounds' | 'autoLoadClaudeMD'>
  private provider: LLMProvider
  private tools: Map<string, ToolSpec>
  private activeSkill?: Skill

  constructor(config: ClaudeSDKConfig) {
    this.config = {
      ...config,
      maxTokens: config.maxTokens ?? 4096,
      maxToolRounds: config.maxToolRounds ?? 50,
      autoLoadClaudeMD: config.autoLoadClaudeMD ?? true,
    }

    if (config.provider === 'openai') {
      this.provider = new OpenAIProvider(config.baseURL || 'https://api.openai.com/v1', config.apiKey)
    } else {
      this.provider = new AnthropicProvider(config.apiKey, config.baseURL)
    }

    this.tools = createBuiltinTools()
  }

  /** Single-shot chat */
  async chat(prompt: string): Promise<EngineResult> {
    const engine = this.createEngine()
    return engine.run(prompt)
  }

  /** Streaming chat */
  async *chatStream(prompt: string): AsyncGenerator<EngineEvent> {
    const engine = this.createEngine()
    yield* engine.runStream(prompt)
  }

  /** Create a persistent session for multi-turn conversations */
  createSession(): Session {
    return new Session(this.createEngine())
  }

  /** Load CLAUDE.md files from project directory */
  async loadClaudeMD(): Promise<string> {
    return loadClaudeMD({ workingDir: this.config.workingDir })
  }

  /** Set additional instructions for the system prompt */
  setInstructions(text: string): void {
    this.config.instructions = text
  }

  /** Register a custom tool */
  registerTool(tool: ToolRegistration): void {
    registerTool(this.tools, {
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      execute: tool.execute,
    })
  }

  /** Invoke a skill by name */
  async invokeSkill(name: string, args?: string): Promise<EngineResult> {
    const skills = await getAllSkills(this.config.skillsDir)
    const skill = skills.find(s => s.name === name)
    if (!skill) throw new Error(`Skill not found: ${name}`)
    this.activeSkill = skill
    const prompt = args || `Using skill: ${name}. ${skill.description}`
    const result = await this.chat(prompt)
    this.activeSkill = undefined
    return result
  }

  /** Get all available skills */
  async getSkills(): Promise<Skill[]> {
    return getAllSkills(this.config.skillsDir)
  }

  private createEngine(): Engine {
    return new Engine({
      provider: this.provider,
      tools: this.tools,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      maxToolRounds: this.config.maxToolRounds,
      workingDir: this.config.workingDir,
      systemPromptOptions: {
        workingDir: this.config.workingDir,
        customInstructions: this.config.instructions,
        activeSkill: this.activeSkill,
      },
    })
  }
}

/** Persistent session for multi-turn conversations */
export class Session {
  constructor(private engine: Engine) {}

  async chat(prompt: string): Promise<EngineResult> {
    return this.engine.run(prompt)
  }

  async *chatStream(prompt: string): AsyncGenerator<EngineEvent> {
    yield* this.engine.runStream(prompt)
  }

  reset(): void {
    this.engine.resetContext()
  }
}

// Additional exports
export { OpenAIProvider } from './providers/openai.js'
export { AnthropicProvider } from './providers/anthropic.js'
export { MemoryManager } from './memory/manager.js'
