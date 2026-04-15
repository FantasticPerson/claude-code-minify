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

// ============ Tool ============

export interface ToolContext {
  workingDir: string
  sessionId: string
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

// ============ Config ============

export interface ClaudeSDKConfig {
  provider: 'openai' | 'anthropic'
  baseURL?: string
  apiKey: string
  model: string
  workingDir: string
  maxTokens?: number
  maxToolRounds?: number
  autoLoadClaudeMD?: boolean
  instructions?: string
  skillsDir?: string
  askUserCallback?: (question: string) => Promise<string>
}
