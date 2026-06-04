// Types
export type {
  ClaudeSDKConfig, Message, ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock,
  EngineResult, EngineEvent, ToolResult, ToolContext, ToolRegistration, Skill, Memory,
  MemoryType, UsageInfo, StreamEvent, ChatParams, ChatResponse, ToolDefinition,
  ContextConfig, ToolsConfig, ToolBashConfig, ToolGrepConfig, ToolGlobConfig, ToolReadConfig, ToolWriteConfig, ToolEditConfig,
  GuardrailsConfig,
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
import { DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOOL_ROUNDS, DEFAULT_AUTO_LOAD_CLAUDE_MD } from './core/defaults.js'

export class ClaudeSDK {
  private config: Required<Pick<ClaudeSDKConfig, 'provider' | 'apiKey' | 'model' | 'workingDir' | 'maxTokens' | 'maxToolRounds' | 'autoLoadClaudeMD'>> & Omit<ClaudeSDKConfig, 'provider' | 'apiKey' | 'model' | 'workingDir' | 'maxTokens' | 'maxToolRounds' | 'autoLoadClaudeMD'>
  private provider: LLMProvider
  private tools: Map<string, ToolSpec>
  private activeSkill?: Skill

  constructor(config: ClaudeSDKConfig) {
    this.config = {
      ...config,
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      maxToolRounds: config.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS,
      autoLoadClaudeMD: config.autoLoadClaudeMD ?? DEFAULT_AUTO_LOAD_CLAUDE_MD,
    }

    if (config.provider === 'openai') {
      this.provider = new OpenAIProvider(config.baseURL || 'https://api.openai.com/v1', config.apiKey)
    } else {
      this.provider = new AnthropicProvider(config.apiKey, config.baseURL)
    }

    // general 模式默认只保留 file_read 和 ask_user
    const isGeneralMode = this.config.mode === 'general'
    const disabled = this.config.tools?.disabled ?? (
      isGeneralMode
        ? ['file_write', 'file_edit', 'bash', 'grep', 'glob', 'todo_write']
        : []
    )
    this.tools = createBuiltinTools(disabled)
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
    const enabledTools = Array.from(this.tools.keys())
    return new Engine({
      provider: this.provider,
      tools: this.tools,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      contextWindow: this.config.contextWindow,
      maxToolRounds: this.config.maxToolRounds,
      workingDir: this.config.workingDir,
      security: this.config.security,
      contextConfig: this.config.context,
      toolsConfig: this.config.tools,
      guardrailsConfig: this.config.guardrails,
      systemPromptOptions: {
        workingDir: this.config.workingDir,
        customInstructions: this.config.instructions,
        activeSkill: this.activeSkill,
        mode: this.config.mode,
        enabledTools,
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
export * as Defaults from './core/defaults.js'

// Guardrails
export { GuardrailsMiddleware } from './guardrails/middleware.js'
export type { CheckAction, CheckResult } from './guardrails/middleware.js'
export { NudgeKind } from './guardrails/nudge.js'
export { NudgeTemplates } from './guardrails/nudge-templates.js'
export { ResponseValidator } from './guardrails/validator.js'
export { ErrorTracker } from './guardrails/error-tracker.js'

// Context strategies
export { ContextManager } from './context/manager.js'
export { CompactStrategy, NoCompact, BasicCompact, TieredCompact } from './context/index.js'
export type { CompactResult, TieredCompactOptions } from './context/index.js'
