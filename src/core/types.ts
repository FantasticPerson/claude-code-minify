import { z } from 'zod'

// ============ Messages ============

export interface Message {
  role: 'user' | 'assistant'
  content: ContentBlock[]
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, any>
}

export interface ToolResultBlock {
  type: 'tool_result'
  toolUseId: string
  content: string
  isError?: boolean
}

// ============ Provider ============

export interface SystemBlock {
  type: 'text'
  text: string
  cacheControl?: { type: 'ephemeral' }
}

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, any>
}

export interface ChatParams {
  model: string
  system: SystemBlock[]
  messages: Message[]
  tools: ToolDefinition[]
  maxTokens: number
  temperature?: number
}

export interface ChatResponse {
  text: string
  toolUses: ToolUseBlock[]
  usage: UsageInfo
  stopReason: string
}

export interface UsageInfo {
  inputTokens: number
  outputTokens: number
}

// ============ Stream Events ============

export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; input: string }
  | { type: 'tool_use_end'; id: string; name: string; input: Record<string, any> }
  | { type: 'message_end'; usage: UsageInfo; stopReason: string }

// ============ Security ============

export interface BashSecurityConfig {
  protectedPorts?: number[]
  blockedSystemPaths?: string[]
  restrictToProjectDir?: boolean
}

export interface FileSecurityConfig {
  restrictToProjectDir?: boolean
  blockedPaths?: string[]
  maxFileSize?: number
}

export interface SecurityConfig {
  bash?: BashSecurityConfig
  file?: FileSecurityConfig
}

// ============ Context ============

export interface ContextConfig {
  /** 触发压缩的上下文使用率，默认 0.8 */
  compressionTriggerRatio?: number
  /** 压缩后的目标上下文使用率，默认 0.6 */
  compressionTargetRatio?: number
  /** 压缩时保留的最近对话轮数，默认 6 */
  compressRecentRounds?: number
  /** 工具结果超过此字符数时进行压缩，默认 500 */
  toolResultCompressThreshold?: number
}

// ============ Tools ============

export interface ToolBashConfig {
  /** 默认命令超时（毫秒），默认 120000 */
  defaultTimeout?: number
  /** 命令超时上限（毫秒），默认 600000 */
  maxTimeout?: number
  /** 输出缓冲区最大字节数，默认 10485760 (10MB) */
  maxBuffer?: number
  /** 输出截断阈值（字符数），默认 50000 */
  outputTruncateLimit?: number
}

export interface ToolGrepConfig {
  /** 命令超时（毫秒），默认 30000 */
  timeout?: number
  /** 最大列宽，默认 500 */
  maxColumns?: number
  /** 输出缓冲区最大字节数，默认 5242880 (5MB) */
  maxBuffer?: number
  /** 排除的目录名，默认 ['.git'] */
  skipDirs?: string[]
  /** 追加排除的目录名，会与 skipDirs 合并 */
  extraSkipDirs?: string[]
}

export interface ToolGlobConfig {
  /** 最大返回结果数，默认 100 */
  maxResults?: number
  /** 跳过的目录名，默认 ['node_modules', '.git'] */
  skipDirs?: string[]
  /** 追加跳过的目录名，会与 skipDirs 合并 */
  extraSkipDirs?: string[]
}

export interface ToolReadConfig {
  /** 默认最大文件大小（字节），默认 1048576 (1MB) */
  maxFileSize?: number
}

export interface ToolWriteConfig {
  /** 最大写入内容大小（字节），默认 Infinity（不限制） */
  maxFileSize?: number
}

export interface ToolEditConfig {
  /** 可编辑文件的最大大小（字节），默认 10485760 (10MB) */
  maxFileSize?: number
}

export interface ToolsConfig {
  /** 禁用的内置工具名称列表，如 ['bash', 'file_edit'] */
  disabled?: string[]
  bash?: ToolBashConfig
  grep?: ToolGrepConfig
  glob?: ToolGlobConfig
  read?: ToolReadConfig
  write?: ToolWriteConfig
  edit?: ToolEditConfig
}

// ============ Tool ============

export interface ToolContext {
  workingDir: string
  sessionId: string
  security?: SecurityConfig
  tools?: ToolsConfig
  onProgress?: (msg: string) => void
}

export interface ToolResult {
  output: string
  isError?: boolean
  metadata?: Record<string, any>
}

export interface ToolRegistration {
  name: string
  description: string
  schema: z.ZodType<any>
  execute: (params: any, context: ToolContext) => Promise<ToolResult>
}

// ============ Engine ============

export interface EngineResult {
  text: string
  toolCalls: ToolCallRecord[]
  filesWritten: string[]
  usage: UsageInfo
}

export interface ToolCallRecord {
  name: string
  input: Record<string, any>
  output: string
  isError: boolean
}

export type EngineEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; name: string; params: any }
  | { type: 'tool_end'; name: string; result: ToolResult }
  | { type: 'error'; error: Error }
  | { type: 'complete'; result: EngineResult }

// ============ Memory ============

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export interface Memory {
  type: MemoryType
  name: string
  content: string
  updatedAt: Date
}

// ============ Skill ============

export interface Skill {
  name: string
  description: string
  content: string
  triggerPatterns: string[]
}

// ============ Guardrails ============

export interface GuardrailsConfig {
  maxRetries?: number;       // default 3
  maxToolErrors?: number;    // default 2
  rescueEnabled?: boolean;   // default true
}

// ============ Config ============

export interface ClaudeSDKConfig {
  provider: 'openai' | 'anthropic'
  baseURL?: string
  apiKey: string
  model: string
  workingDir: string
  /** 运行模式：'coding' 开发助手（默认），'general' 通用对话 */
  mode?: 'coding' | 'general'
  maxTokens?: number
  contextWindow?: number
  maxToolRounds?: number
  security?: SecurityConfig
  context?: ContextConfig
  tools?: ToolsConfig
  autoLoadClaudeMD?: boolean
  instructions?: string
  skillsDir?: string
  askUserCallback?: (question: string) => Promise<string>
}
