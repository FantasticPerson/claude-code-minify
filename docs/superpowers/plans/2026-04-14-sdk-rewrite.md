# Claude Code SDK 重写实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 从零重写一个轻量 Node.js SDK，支持 OpenAI + Anthropic 双格式 LLM，保留核心工具/Skills/CLAUDE.md 功能。

**Architecture:** SDK 入口暴露 `ClaudeSDK` 类 → 内部 Engine 驱动对话循环 → Provider 适配层对接不同 LLM API → Tool 注册表管理工具调用 → Skills/CLAUDE.md 注入系统提示词。

**Tech Stack:** TypeScript, Node.js >= 18, openai SDK, @anthropic-ai/sdk, zod

---

## Task 1: 项目初始化

**Files:**
- Create: `claude-code-sdk/package.json`
- Create: `claude-code-sdk/tsconfig.json`
- Create: `claude-code-sdk/src/index.ts`

- [ ] **Step 1: 创建项目目录和 package.json**

```bash
mkdir -p /Users/wudandan/Downloads/claude-code/claude-code-sdk/src
```

```json
{
  "name": "claude-code-sdk",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest"
  },
  "dependencies": {
    "openai": "^4.78.0",
    "@anthropic-ai/sdk": "^0.39.0",
    "zod": "^3.24.0",
    "zod-to-json-schema": "^3.24.0",
    "glob": "^10.3.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建空入口文件**

```typescript
// src/index.ts - placeholder, will be filled in later tasks
export {}
```

- [ ] **Step 4: 安装依赖**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npm install
```

- [ ] **Step 5: 验证构建**

```bash
npx tsc --noEmit
```

---

## Task 2: 核心类型定义

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/message.ts`

- [ ] **Step 1: 创建 src/core/types.ts**

```typescript
import { z } from 'zod'

// ============ Messages ============

export interface Message {
  role: 'user' | 'assistant'
  content: ContentBlock[]
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock

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
```

- [ ] **Step 2: 创建 src/core/message.ts**

```typescript
import { ContentBlock, Message, TextBlock, ToolResultBlock, ToolUseBlock } from './types.js'

export function userMessage(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }] }
}

export function assistantTextMessage(text: string): Message {
  return { role: 'assistant', content: [{ type: 'text', text }] }
}

export function assistantToolUseMessage(blocks: ToolUseBlock[]): Message {
  return { role: 'assistant', content: blocks }
}

export function toolResultMessage(results: ToolResultBlock[]): Message {
  return { role: 'user', content: results }
}

export function getTextContent(message: Message): string {
  return message.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

export function getToolUses(message: Message): ToolUseBlock[] {
  return message.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')
}

export function messageToJSON(message: Message): object {
  return {
    role: message.role,
    content: message.content.map(block => {
      switch (block.type) {
        case 'text': return { type: 'text', text: block.text }
        case 'tool_use': return { type: 'tool_use', id: block.id, name: block.name, input: block.input }
        case 'tool_result': return { type: 'tool_result', tool_use_id: block.toolUseId, content: block.content, ...(block.isError ? { is_error: true } : {}) }
      }
    })
  }
}
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc --noEmit
```

---

## Task 3: LLM Provider 基类和 OpenAI 适配器

**Files:**
- Create: `src/providers/base.ts`
- Create: `src/providers/openai.ts`

- [ ] **Step 1: 创建 src/providers/base.ts**

```typescript
import { ChatParams, ChatResponse, StreamEvent, Message, UsageInfo } from '../core/types.js'

export interface LLMProvider {
  chat(params: ChatParams): Promise<ChatResponse>
  chatStream(params: ChatParams): AsyncIterable<StreamEvent>
  countTokens(messages: Message[]): Promise<number>
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0
  for (const msg of messages) {
    total += 4 // role overhead
    for (const block of msg.content) {
      if (block.type === 'text') total += estimateTokens(block.text)
      else if (block.type === 'tool_use') total += estimateTokens(JSON.stringify(block.input))
      else if (block.type === 'tool_result') total += estimateTokens(block.content)
    }
  }
  return total
}
```

- [ ] **Step 2: 创建 src/providers/openai.ts**

```typescript
import OpenAI from 'openai'
import { LLMProvider } from './base.js'
import { ChatParams, ChatResponse, StreamEvent, Message, ContentBlock, ToolUseBlock, ToolResultBlock, UsageInfo } from '../core/types.js'

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI

  constructor(baseURL: string, apiKey: string) {
    this.client = new OpenAI({ baseURL, apiKey })
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const oaiMessages = this.convertMessages(params.system, params.messages)
    const tools = this.convertTools(params.tools)

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages: oaiMessages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
    })

    const choice = response.choices[0]
    const text = choice.message.content || ''
    const toolUses = this.extractToolUses(choice.message)
    
    return {
      text,
      toolUses,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : (choice.finish_reason ?? 'end_turn'),
    }
  }

  async *chatStream(params: ChatParams): AsyncIterable<StreamEvent> {
    const oaiMessages = this.convertMessages(params.system, params.messages)
    const tools = this.convertTools(params.tools)

    const stream = await this.client.chat.completions.create({
      model: params.model,
      messages: oaiMessages,
      tools: tools.length > 0 ? tools : undefined,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      stream: true,
    })

    const toolBuffers = new Map<number, { id: string; name: string; input: string }>()
    let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 }
    let stopReason = 'end_turn'

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) continue

      // Text content
      if (delta.content) {
        yield { type: 'text_delta', text: delta.content }
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) {
            // New tool call starting
            const buf = { id: tc.id || '', name: tc.function.name, input: '' }
            toolBuffers.set(tc.index, buf)
            yield { type: 'tool_use_start', id: buf.id, name: buf.name }
          }
          if (tc.function?.arguments) {
            const buf = toolBuffers.get(tc.index)
            if (buf) {
              buf.input += tc.function.arguments
              yield { type: 'tool_use_delta', input: tc.function.arguments }
            }
          }
        }
      }

      // Usage from streaming chunk
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        }
      }

      // Finish reason
      const finish = chunk.choices[0]?.finish_reason
      if (finish) {
        stopReason = finish === 'tool_calls' ? 'tool_use' : finish
      }
    }

    // Emit tool_use_end for each buffered tool
    for (const [, buf] of toolBuffers) {
      let parsed: Record<string, any> = {}
      try { parsed = JSON.parse(buf.input) } catch {}
      yield { type: 'tool_use_end', id: buf.id, name: buf.name, input: parsed }
    }

    yield { type: 'message_end', usage, stopReason }
  }

  async countTokens(messages: Message[]): Promise<number> {
    // Rough estimation for OpenAI
    let total = 0
    for (const msg of messages) {
      total += 4
      for (const block of msg.content) {
        if (block.type === 'text') total += Math.ceil(block.text.length / 4)
        else total += 20
      }
    }
    return total
  }

  // ---- Conversion helpers ----

  private convertMessages(system: { text: string }[], messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = []

    // System messages
    const systemText = system.map(s => s.text).join('\n\n')
    if (systemText) {
      result.push({ role: 'system', content: systemText })
    }

    // User/Assistant messages
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        const textParts = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text)
        const toolParts = msg.content.filter(b => b.type === 'tool_use').map(b => {
          const tu = b as ToolUseBlock
          return { id: tu.id, type: 'function' as const, function: { name: tu.name, arguments: JSON.stringify(tu.input) } }
        })
        result.push({
          role: 'assistant',
          content: textParts.join('') || null,
          ...(toolParts.length > 0 ? { tool_calls: toolParts } : {}),
        })
      } else {
        // User message - may contain text and tool_results
        const parts: OpenAI.ChatCompletionMessageParam[] = []
        const textParts = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text)
        const toolResults = msg.content.filter(b => b.type === 'tool_result') as ToolResultBlock[]

        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            result.push({
              role: 'tool',
              tool_call_id: tr.toolUseId,
              content: tr.content,
            })
          }
          if (textParts.length > 0) {
            result.push({ role: 'user', content: textParts.join('') })
          }
        } else {
          result.push({ role: 'user', content: textParts.join('') })
        }
      }
    }

    return result
  }

  private convertTools(tools: { name: string; description: string; inputSchema: Record<string, any> }[]): OpenAI.ChatCompletionTool[] {
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }))
  }

  private extractToolUses(message: OpenAI.ChatCompletionAssistantMessageParam): ToolUseBlock[] {
    if (!message.tool_calls) return []
    return message.tool_calls.map(tc => ({
      type: 'tool_use' as const,
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments || '{}'),
    }))
  }
}
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc --noEmit
```

---

## Task 4: Anthropic 适配器

**Files:**
- Create: `src/providers/anthropic.ts`

- [ ] **Step 1: 创建 src/providers/anthropic.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { LLMProvider } from './base.js'
import { ChatParams, ChatResponse, StreamEvent, Message, ToolUseBlock, ToolResultBlock, UsageInfo } from '../core/types.js'

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) })
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: params.model,
      system: params.system.map(s => ({ type: 'text' as const, text: s.text })),
      messages: this.convertMessages(params.messages),
      tools: this.convertTools(params.tools),
      max_tokens: params.maxTokens,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    })

    const textBlocks = response.content.filter(b => b.type === 'text')
    const toolBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
    
    return {
      text: textBlocks.map(b => b.text).join(''),
      toolUses: toolBlocks.map(b => ({
        type: 'tool_use' as const,
        id: b.id,
        name: b.name,
        input: b.input as Record<string, any>,
      })),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
    }
  }

  async *chatStream(params: ChatParams): AsyncIterable<StreamEvent> {
    const stream = this.client.messages.stream({
      model: params.model,
      system: params.system.map(s => ({ type: 'text' as const, text: s.text })),
      messages: this.convertMessages(params.messages),
      tools: this.convertTools(params.tools),
      max_tokens: params.maxTokens,
      ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    })

    const toolBuffers = new Map<number, { id: string; name: string; input: string }>()
    let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 }
    let stopReason = 'end_turn'

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolBuffers.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            input: '',
          })
          yield { type: 'tool_use_start', id: event.content_block.id, name: event.content_block.name }
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text }
        } else if (event.delta.type === 'input_json_delta') {
          const buf = toolBuffers.get(event.index)
          if (buf) {
            buf.input += event.delta.partial_json
            yield { type: 'tool_use_delta', input: event.delta.partial_json }
          }
        }
      } else if (event.type === 'content_block_stop') {
        const buf = toolBuffers.get(event.index)
        if (buf) {
          let parsed: Record<string, any> = {}
          try { parsed = JSON.parse(buf.input) } catch {}
          yield { type: 'tool_use_end', id: buf.id, name: buf.name, input: parsed }
        }
      } else if (event.type === 'message_delta') {
        if (event.usage) {
          usage = { inputTokens: event.usage.input_tokens ?? usage.inputTokens, outputTokens: event.usage.output_tokens ?? usage.outputTokens }
        }
        if (event.delta?.stop_reason) {
          stopReason = event.delta.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn'
        }
      } else if (event.type === 'message_start') {
        if (event.message?.usage) {
          usage = { inputTokens: event.message.usage.input_tokens, outputTokens: event.message.usage.output_tokens }
        }
      }
    }

    yield { type: 'message_end', usage, stopReason }
  }

  async countTokens(messages: Message[]): Promise<number> {
    // Rough estimation
    let total = 0
    for (const msg of messages) {
      total += 4
      for (const block of msg.content) {
        if (block.type === 'text') total += Math.ceil(block.text.length / 4)
        else total += 20
      }
    }
    return total
  }

  // ---- Conversion helpers ----

  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = []
    
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        const content: Anthropic.ContentBlockParam[] = []
        for (const block of msg.content) {
          if (block.type === 'text') {
            content.push({ type: 'text', text: block.text })
          } else if (block.type === 'tool_use') {
            content.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input })
          }
        }
        result.push({ role: 'assistant', content })
      } else {
        const content: Anthropic.ContentBlockParam[] = []
        for (const block of msg.content) {
          if (block.type === 'text') {
            content.push({ type: 'text', text: block.text })
          } else if (block.type === 'tool_result') {
            content.push({
              type: 'tool_result',
              tool_use_id: block.toolUseId,
              content: block.content,
              ...(block.isError ? { is_error: true } : {}),
            })
          }
        }
        result.push({ role: 'user', content })
      }
    }

    return result
  }

  private convertTools(tools: { name: string; description: string; inputSchema: Record<string, any> }[]): Anthropic.Tool[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as any,
    }))
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc --noEmit
```

---

## Task 5: 工具系统

**Files:**
- Create: `src/tools/base.ts`
- Create: `src/tools/file-read.ts`
- Create: `src/tools/file-write.ts`
- Create: `src/tools/file-edit.ts`
- Create: `src/tools/bash.ts`
- Create: `src/tools/grep.ts`
- Create: `src/tools/glob.ts`
- Create: `src/tools/todo-write.ts`
- Create: `src/tools/ask-user.ts`
- Create: `src/tools/index.ts`

- [ ] **Step 1: 创建 src/tools/base.ts**

```typescript
import { z } from 'zod'
import { ToolContext, ToolResult, ToolRegistration, ToolDefinition } from '../core/types.js'
import zodToJsonSchema from 'zod-to-json-schema'

export interface ToolSpec {
  name: string
  description: string
  schema: z.ZodType<any>
  execute: (params: any, context: ToolContext) => Promise<ToolResult>
}

export function createToolDefinition(tool: ToolSpec): ToolDefinition {
  const jsonSchema = zodToJsonSchema(tool.schema, { target: 'openApi3' }) as Record<string, any>
  // Remove $schema field
  delete jsonSchema.$schema
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: jsonSchema,
  }
}

export function registerTool(tools: Map<string, ToolSpec>, tool: ToolSpec): void {
  tools.set(tool.name, tool)
}
```

- [ ] **Step 2: 创建 src/tools/file-read.ts**

```typescript
import { z } from 'zod'
import { ToolSpec } from './base.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const fileReadTool: ToolSpec = {
  name: 'file_read',
  description: 'Read file contents. Use absolute paths. Supports offset/limit for large files.',
  schema: z.object({
    file_path: z.string().describe('Absolute path to the file'),
    offset: z.number().int().nonnegative().optional().describe('Line number to start reading from (0-indexed)'),
    limit: z.number().int().positive().optional().describe('Number of lines to read'),
  }),
  execute: async (params, ctx) => {
    const filePath = path.resolve(ctx.workingDir, params.file_path)
    
    // Security: block device files
    if (filePath.startsWith('/dev/')) {
      return { output: `Error: Cannot read device files`, isError: true }
    }

    try {
      const stat = await fs.stat(filePath)
      if (stat.isDirectory()) {
        return { output: `Error: ${filePath} is a directory, not a file`, isError: true }
      }
      // Size limit: 1MB
      if (stat.size > 1024 * 1024) {
        return { output: `Error: File too large (${Math.round(stat.size / 1024)}KB). Use offset/limit to read portions.`, isError: true }
      }

      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n')
      
      const offset = params.offset ?? 0
      const limit = params.limit ?? lines.length
      const selectedLines = lines.slice(offset, offset + limit)
      
      // Format with line numbers
      const numbered = selectedLines
        .map((line, i) => `${offset + i + 1}\t${line}`)
        .join('\n')

      return {
        output: numbered,
        metadata: { filePath, totalLines: lines.length, startLine: offset + 1, linesRead: selectedLines.length },
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return { output: `Error: File not found: ${filePath}`, isError: true }
      }
      if (err.code === 'EACCES') {
        return { output: `Error: Permission denied: ${filePath}`, isError: true }
      }
      return { output: `Error reading file: ${err.message}`, isError: true }
    }
  },
}
```

- [ ] **Step 3: 创建 src/tools/file-write.ts**

```typescript
import { z } from 'zod'
import { ToolSpec } from './base.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const fileWriteTool: ToolSpec = {
  name: 'file_write',
  description: 'Write content to a file. Creates parent directories if needed. Overwrites existing files.',
  schema: z.object({
    file_path: z.string().describe('Absolute path to the file'),
    content: z.string().describe('Content to write'),
  }),
  execute: async (params, ctx) => {
    const filePath = path.resolve(ctx.workingDir, params.file_path)
    
    try {
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, params.content, 'utf-8')
      
      const isNew = true // simplified - in production check if file existed before
      
      return {
        output: `Successfully wrote ${params.content.length} bytes to ${filePath}`,
        metadata: { filePath, isNew, size: params.content.length },
      }
    } catch (err: any) {
      return { output: `Error writing file: ${err.message}`, isError: true }
    }
  },
}
```

- [ ] **Step 4: 创建 src/tools/file-edit.ts**

```typescript
import { z } from 'zod'
import { ToolSpec } from './base.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export const fileEditTool: ToolSpec = {
  name: 'file_edit',
  description: 'Replace exact string matches in a file. Use replace_all to replace all occurrences.',
  schema: z.object({
    file_path: z.string().describe('Absolute path to the file'),
    old_string: z.string().describe('Text to find (must be unique in file unless replace_all is true)'),
    new_string: z.string().describe('Text to replace with'),
    replace_all: z.boolean().default(false).optional().describe('Replace all occurrences'),
  }),
  execute: async (params, ctx) => {
    const filePath = path.resolve(ctx.workingDir, params.file_path)
    
    if (params.old_string === params.new_string) {
      return { output: 'Error: old_string and new_string are identical', isError: true }
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      
      if (!content.includes(params.old_string)) {
        return { output: `Error: old_string not found in ${filePath}. Make sure the string matches exactly.`, isError: true }
      }

      if (!params.replace_all) {
        const firstIdx = content.indexOf(params.old_string)
        const secondIdx = content.indexOf(params.old_string, firstIdx + 1)
        if (secondIdx !== -1) {
          return { output: `Error: old_string appears multiple times in file. Add more context to make it unique, or use replace_all: true`, isError: true }
        }
      }

      const newContent = params.replace_all
        ? content.replaceAll(params.old_string, params.new_string)
        : content.replace(params.old_string, params.new_string)

      await fs.writeFile(filePath, newContent, 'utf-8')

      const replacements = params.replace_all
        ? (content.split(params.old_string).length - 1)
        : 1

      return {
        output: `Successfully replaced ${replacements} occurrence(s) in ${filePath}`,
        metadata: { filePath, replacements },
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return { output: `Error: File not found: ${filePath}`, isError: true }
      }
      return { output: `Error editing file: ${err.message}`, isError: true }
    }
  },
}
```

- [ ] **Step 5: 创建 src/tools/bash.ts**

```typescript
import { z } from 'zod'
import { ToolSpec } from './base.js'
import { exec } from 'child_process'

export const bashTool: ToolSpec = {
  name: 'bash',
  description: 'Execute a shell command. Returns stdout and stderr. Working directory is the project root.',
  schema: z.object({
    command: z.string().describe('The shell command to execute'),
    timeout: z.number().optional().describe('Timeout in milliseconds (max 600000)'),
    description: z.string().optional().describe('Brief description of what the command does'),
  }),
  execute: async (params, ctx) => {
    const timeout = Math.min(params.timeout ?? 120000, 600000)
    
    return new Promise((resolve) => {
      exec(
        params.command,
        {
          cwd: ctx.workingDir,
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: { ...process.env },
        },
        (error, stdout, stderr) => {
          if (error && !stdout && !stderr) {
            resolve({
              output: `Exit code ${error.code}\n${error.message}`,
              isError: true,
            })
            return
          }

          let output = ''
          if (stdout) output += stdout
          if (stderr) output += (output ? '\n' : '') + stderr
          if (error && error.code) {
            output += `\n[Exit code: ${error.code}]`
          }

          // Truncate if too long
          if (output.length > 50000) {
            output = output.slice(0, 25000) + '\n\n... [truncated] ...\n' + output.slice(-25000)
          }

          resolve({ output, isError: !!error })
        }
      )
    })
  },
}
```

- [ ] **Step 6: 创建 src/tools/grep.ts**

```typescript
import { z } from 'zod'
import { ToolSpec } from './base.js'
import { exec } from 'child_process'
import * as path from 'path'

export const grepTool: ToolSpec = {
  name: 'grep',
  description: 'Search file contents using regex patterns (ripgrep). Supports content, files_with_matches, and count output modes.',
  schema: z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('Directory to search in'),
    glob: z.string().optional().describe('File pattern filter (e.g. "*.ts")'),
    output_mode: z.enum(['content', 'files_with_matches', 'count']).optional().describe('Output mode'),
    '-i': z.boolean().optional().describe('Case insensitive'),
    '-n': z.boolean().optional().describe('Show line numbers'),
    '-C': z.number().optional().describe('Context lines before and after'),
    head_limit: z.number().optional().describe('Limit output lines'),
  }),
  execute: async (params, ctx) => {
    const searchPath = path.resolve(ctx.workingDir, params.path || '.')
    const outputMode = params.output_mode ?? 'files_with_matches'
    
    const args: string[] = ['rg', '--hidden']
    // Exclude VCS dirs
    args.push('--glob', '!.git')
    
    if (params['-i']) args.push('-i')
    if (params['-n'] || outputMode === 'content') args.push('-n')
    if (params['-C']) args.push('-C', String(params['-C']))
    if (params.glob) args.push('--glob', params.glob)
    
    if (outputMode === 'files_with_matches') args.push('-l')
    else if (outputMode === 'count') args.push('-c')
    
    // Max columns to avoid base64 clutter
    args.push('--max-columns', '500')
    args.push('--', params.pattern, searchPath)

    return new Promise((resolve) => {
      exec(args.join(' '), { cwd: ctx.workingDir, timeout: 30000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error && error.code === 1 && !stdout) {
          resolve({ output: 'No matches found' })
          return
        }
        
        let output = stdout || ''
        
        // Relativize paths
        output = output.replace(new RegExp(ctx.workingDir + '/', 'g'), '')
        
        // Apply head_limit
        if (params.head_limit && params.head_limit > 0) {
          const lines = output.split('\n')
          if (lines.length > params.head_limit) {
            output = lines.slice(0, params.head_limit).join('\n') + '\n... [truncated]'
          }
        }
        
        resolve({ output: output || 'No matches found' })
      })
    })
  },
}
```

- [ ] **Step 7: 创建 src/tools/glob.ts**

```typescript
import { z } from 'zod'
import { ToolSpec } from './base.js'
import { glob as globFn } from 'glob'
import * as path from 'path'

export const globTool: ToolSpec = {
  name: 'glob',
  description: 'Find files by name pattern. Returns matching file paths sorted by modification time.',
  schema: z.object({
    pattern: z.string().describe('Glob pattern (e.g. "**/*.ts", "src/**/*.tsx")'),
    path: z.string().optional().describe('Directory to search in'),
  }),
  execute: async (params, ctx) => {
    const searchPath = params.path
      ? path.resolve(ctx.workingDir, params.path)
      : ctx.workingDir

    try {
      const files = await globFn(params.pattern, {
        cwd: searchPath,
        absolute: false,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
      })

      const limit = 100
      const truncated = files.length > limit
      const result = files.slice(0, limit)

      return {
        output: result.length > 0
          ? result.join('\n') + (truncated ? `\n... and ${files.length - limit} more files` : '')
          : 'No files found matching pattern',
        metadata: { numFiles: files.length, truncated },
      }
    } catch (err: any) {
      return { output: `Error searching files: ${err.message}`, isError: true }
    }
  },
}
```

- [ ] **Step 8: 创建 src/tools/todo-write.ts**

```typescript
import { z } from 'zod'
import { ToolSpec } from './base.js'

const TodoItemSchema = z.object({
  content: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed']),
  activeForm: z.string().min(1),
})

export const todoWriteTool: ToolSpec = {
  name: 'todo_write',
  description: 'Update the task list. Use this to track progress on multi-step tasks.',
  schema: z.object({
    todos: z.array(TodoItemSchema).describe('Updated todo list'),
  }),
  execute: async (params, ctx) => {
    // In SDK mode, todos are just returned as confirmation
    const completed = params.todos.filter(t => t.status === 'completed').length
    const total = params.todos.length
    const inProgress = params.todos.find(t => t.status === 'in_progress')

    return {
      output: `Task list updated: ${completed}/${total} completed${inProgress ? `, working on: ${inProgress.activeForm}` : ''}`,
      metadata: { todos: params.todos },
    }
  },
}
```

- [ ] **Step 9: 创建 src/tools/ask-user.ts**

```typescript
import { z } from 'zod'
import { ToolSpec } from './base.js'

export const askUserTool: ToolSpec = {
  name: 'ask_user',
  description: 'Ask the user a question and wait for their response.',
  schema: z.object({
    question: z.string().describe('The question to ask the user'),
  }),
  execute: async (params, ctx) => {
    // In SDK mode, this requires a callback
    if (!ctx.onProgress) {
      return { output: 'No user callback configured. Please configure askUserCallback in SDK config.', isError: true }
    }
    // The actual user interaction is handled by the engine via the callback
    return { output: params.question, metadata: { needsUserResponse: true } }
  },
}
```

- [ ] **Step 10: 创建 src/tools/index.ts**

```typescript
import { ToolSpec, registerTool } from './base.js'
import { fileReadTool } from './file-read.js'
import { fileWriteTool } from './file-write.js'
import { fileEditTool } from './file-edit.js'
import { bashTool } from './bash.js'
import { grepTool } from './grep.js'
import { globTool } from './glob.js'
import { todoWriteTool } from './todo-write.js'
import { askUserTool } from './ask-user.js'

export type { ToolSpec } from './base.js'

export function createBuiltinTools(): Map<string, ToolSpec> {
  const tools = new Map<string, ToolSpec>()
  registerTool(tools, fileReadTool)
  registerTool(tools, fileWriteTool)
  registerTool(tools, fileEditTool)
  registerTool(tools, bashTool)
  registerTool(tools, grepTool)
  registerTool(tools, globTool)
  registerTool(tools, todoWriteTool)
  registerTool(tools, askUserTool)
  return tools
}

export { registerTool, createToolDefinition } from './base.js'
```

- [ ] **Step 11: 验证编译**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc --noEmit
```

---

## Task 6: CLAUDE.md 加载器

**Files:**
- Create: `src/config/claude-md.ts`

- [ ] **Step 1: 创建 src/config/claude-md.ts**

```typescript
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

export interface ClaudeMDOptions {
  workingDir: string
  customInstructions?: string
}

/**
 * Load and merge CLAUDE.md files from multiple locations.
 * Priority (later overrides earlier):
 * 1. ~/.claude/CLAUDE.md (global)
 * 2. <workingDir>/CLAUDE.md (project root)
 * 3. <workingDir>/.claude/CLAUDE.md
 * 4. <workingDir>/.claude/rules/*.md
 * 5. Custom instructions from config
 * 
 * Also supports: GEMINI.md, AGENTS.md, .cursorrules
 */
export async function loadClaudeMD(options: ClaudeMDOptions): Promise<string> {
  const parts: string[] = []

  // 1. Global ~/.claude/CLAUDE.md
  const globalPath = path.join(os.homedir(), '.claude', 'CLAUDE.md')
  parts.push(await tryReadFile(globalPath))

  // 2. Project CLAUDE.md
  parts.push(await tryReadFile(path.join(options.workingDir, 'CLAUDE.md')))
  
  // 3. .claude/CLAUDE.md
  parts.push(await tryReadFile(path.join(options.workingDir, '.claude', 'CLAUDE.md')))

  // 4. .claude/rules/*.md
  try {
    const rulesDir = path.join(options.workingDir, '.claude', 'rules')
    const files = await fs.readdir(rulesDir)
    for (const file of files.sort()) {
      if (file.endsWith('.md')) {
        parts.push(await tryReadFile(path.join(rulesDir, file)))
      }
    }
  } catch {}

  // 5. Alternative file names
  for (const name of ['GEMINI.md', 'AGENTS.md', '.cursorrules']) {
    parts.push(await tryReadFile(path.join(options.workingDir, name)))
  }

  // 6. Custom instructions
  if (options.customInstructions) {
    parts.push(options.customInstructions)
  }

  const merged = parts.filter(Boolean).join('\n\n')
  return merged
}

async function tryReadFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    // Strip YAML frontmatter
    return content.replace(/^---[\s\S]*?---\n*/, '').trim()
  } catch {
    return ''
  }
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc --noEmit
```

---

## Task 7: Skills 加载器

**Files:**
- Create: `src/skills/loader.ts`

- [ ] **Step 1: 创建 src/skills/loader.ts**

```typescript
import * as fs from 'fs/promises'
import * as path from 'path'
import { Skill } from '../core/types.js'

/**
 * Load skills from:
 * 1. Built-in skills (bundled with SDK)
 * 2. Custom skills directory (.claude/skills/)
 * 
 * Skill format: directory with SKILL.md containing frontmatter + instruction content
 */
export async function loadSkills(skillsDir?: string): Promise<Skill[]> {
  const skills: Skill[] = []

  // Load from custom directory
  if (skillsDir) {
    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFile = path.join(skillsDir, entry.name, 'SKILL.md')
          const skill = await loadSkillFile(skillFile, entry.name)
          if (skill) skills.push(skill)
        }
      }
    } catch {}
  }

  // Load from .claude/skills/ in working dir
  // This is handled by the caller passing skillsDir

  return skills
}

/**
 * Load a skill from a SKILL.md file.
 * Format:
 * ---
 * name: skill-name
 * description: When to use this skill
 * triggers: keyword1, keyword2
 * ---
 * 
 * Skill instructions content here...
 */
async function loadSkillFile(filePath: string, defaultName: string): Promise<Skill | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(content)
    
    return {
      name: frontmatter.name || defaultName,
      description: frontmatter.description || '',
      content: body.trim(),
      triggerPatterns: (frontmatter.triggers || '').split(',').map((s: string) => s.trim()).filter(Boolean),
    }
  } catch {
    return null
  }
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, body: content }
  }

  const frontmatter: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      frontmatter[key] = value
    }
  }

  return { frontmatter, body: match[2] }
}

/**
 * Find skills matching a query string
 */
export function findMatchingSkills(skills: Skill[], query: string): Skill[] {
  const lower = query.toLowerCase()
  return skills.filter(s => 
    lower.includes(s.name.toLowerCase()) ||
    s.triggerPatterns.some(p => lower.includes(p.toLowerCase())) ||
    lower.includes(s.description.toLowerCase())
  )
}
```

- [ ] **Step 2: 创建内置 Skills 目录 src/skills/builtin/**

创建 6 个内置 skill 文件：

**src/skills/builtin/brainstorming.md:**
```markdown
---
name: brainstorming
description: Requirements analysis and solution design before implementation
triggers: brainstorm, design, plan, requirements
---

# Brainstorming

Before implementing any feature or making changes, explore requirements:

1. Understand the user's goal and constraints
2. Ask clarifying questions one at a time
3. Propose 2-3 approaches with trade-offs
4. Get user approval before proceeding

Only start coding after the user has approved a specific approach.
```

**src/skills/builtin/frontend-design.md:**
```markdown
---
name: frontend-design
description: Generate production-grade frontend interfaces
triggers: frontend, UI, component, page, layout, react, vue
---

# Frontend Design

When generating frontend code:
1. Use modern frameworks and patterns (React, Vue, etc.)
2. Follow responsive design principles
3. Ensure accessibility (semantic HTML, ARIA labels)
4. Use CSS-in-JS or utility classes consistently
5. Generate complete, runnable components - no placeholders
6. Include proper TypeScript types
```

**src/skills/builtin/debugging.md:**
```markdown
---
name: debugging
description: Systematic debugging before proposing fixes
triggers: debug, fix, error, bug, crash, failure
---

# Systematic Debugging

When encountering bugs:
1. Reproduce the error first
2. Read the full error message and stack trace
3. Identify the root cause before fixing
4. Make minimal, targeted fixes
5. Verify the fix resolves the issue
6. Don't guess - investigate systematically
```

**src/skills/builtin/tdd.md:**
```markdown
---
name: tdd
description: Test-driven development workflow
triggers: test, TDD, spec, testing
---

# Test-Driven Development

1. Write the failing test first
2. Run it to confirm it fails
3. Write minimal code to pass
4. Run tests to confirm they pass
5. Refactor if needed
6. Repeat
```

**src/skills/builtin/simplify.md:**
```markdown
---
name: simplify
description: Code review for reuse, quality, and efficiency
triggers: simplify, review, refactor, cleanup
---

# Code Simplification

Review changed code for:
1. **Reuse**: Can existing code/patterns be used instead of new code?
2. **Quality**: Are there bugs, edge cases, or security issues?
3. **Efficiency**: Can it be faster or use less memory?
Fix any issues found.
```

**src/skills/builtin/verify.md:**
```markdown
---
name: verify
description: Verify work is complete before claiming success
triggers: verify, check, done, complete, finished
---

# Verification

Before claiming work is done:
1. Run the build/compile step
2. Run existing tests
3. Check for TypeScript/lint errors
4. Verify the core functionality works
5. Only report success with evidence
```

- [ ] **Step 3: 创建 src/skills/index.ts**

```typescript
import { Skill } from '../core/types.js'
import { loadSkills, findMatchingSkills } from './loader.js'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Inline built-in skills (loaded from the markdown files at build time)
const BUILTIN_SKILLS: Skill[] = [
  {
    name: 'brainstorming',
    description: 'Requirements analysis and solution design before implementation',
    content: `# Brainstorming\n\nBefore implementing any feature or making changes, explore requirements:\n\n1. Understand the user's goal and constraints\n2. Ask clarifying questions one at a time\n3. Propose 2-3 approaches with trade-offs\n4. Get user approval before proceeding\n\nOnly start coding after the user has approved a specific approach.`,
    triggerPatterns: ['brainstorm', 'design', 'plan', 'requirements'],
  },
  {
    name: 'frontend-design',
    description: 'Generate production-grade frontend interfaces',
    content: `# Frontend Design\n\nWhen generating frontend code:\n1. Use modern frameworks and patterns (React, Vue, etc.)\n2. Follow responsive design principles\n3. Ensure accessibility (semantic HTML, ARIA labels)\n4. Use CSS-in-JS or utility classes consistently\n5. Generate complete, runnable components - no placeholders\n6. Include proper TypeScript types`,
    triggerPatterns: ['frontend', 'UI', 'component', 'page', 'layout'],
  },
  {
    name: 'debugging',
    description: 'Systematic debugging before proposing fixes',
    content: `# Systematic Debugging\n\nWhen encountering bugs:\n1. Reproduce the error first\n2. Read the full error message and stack trace\n3. Identify the root cause before fixing\n4. Make minimal, targeted fixes\n5. Verify the fix resolves the issue\n6. Don't guess - investigate systematically`,
    triggerPatterns: ['debug', 'fix', 'error', 'bug', 'crash'],
  },
  {
    name: 'tdd',
    description: 'Test-driven development workflow',
    content: `# Test-Driven Development\n\n1. Write the failing test first\n2. Run it to confirm it fails\n3. Write minimal code to pass\n4. Run tests to confirm they pass\n5. Refactor if needed\n6. Repeat`,
    triggerPatterns: ['test', 'TDD', 'spec'],
  },
  {
    name: 'simplify',
    description: 'Code review for reuse, quality, and efficiency',
    content: `# Code Simplification\n\nReview changed code for:\n1. **Reuse**: Can existing code/patterns be used instead of new code?\n2. **Quality**: Are there bugs, edge cases, or security issues?\n3. **Efficiency**: Can it be faster or use less memory?\nFix any issues found.`,
    triggerPatterns: ['simplify', 'review', 'refactor', 'cleanup'],
  },
  {
    name: 'verify',
    description: 'Verify work is complete before claiming success',
    content: `# Verification\n\nBefore claiming work is done:\n1. Run the build/compile step\n2. Run existing tests\n3. Check for TypeScript/lint errors\n4. Verify the core functionality works\n5. Only report success with evidence`,
    triggerPatterns: ['verify', 'check', 'done', 'complete'],
  },
]

export async function getAllSkills(customSkillsDir?: string): Promise<Skill[]> {
  const customSkills = await loadSkills(customSkillsDir)
  return [...BUILTIN_SKILLS, ...customSkills]
}

export { findMatchingSkills }
```

- [ ] **Step 4: 验证编译**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc --noEmit
```

---

## Task 8: 记忆系统

**Files:**
- Create: `src/memory/manager.ts`

- [ ] **Step 1: 创建 src/memory/manager.ts**

```typescript
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
    
    try {
      const types = type ? [type] : ['user', 'feedback', 'project', 'reference'] as MemoryType[]
      for (const t of types) {
        const dir = path.join(this.memoryDir, t)
        try {
          const files = await fs.readdir(dir)
          for (const file of files) {
            if (!file.endsWith('.md')) continue
            const content = await fs.readFile(path.join(dir, file), 'utf-8')
            const stat = await fs.stat(path.join(dir, file))
            memories.push({
              type: t,
              name: file.replace('.md', ''),
              content,
              updatedAt: stat.mtime,
            })
          }
        } catch {}
      }
    } catch {}
    
    return memories
  }

  async delete(name: string): Promise<void> {
    for (const type of ['user', 'feedback', 'project', 'reference'] as MemoryType[]) {
      const filePath = this.getFilePath(type, name)
      try {
        await fs.unlink(filePath)
        return
      } catch {}
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
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc --noEmit
```

---

## Task 9: 系统提示词构建器

**Files:**
- Create: `src/core/system-prompt.ts`

- [ ] **Step 1: 创建 src/core/system-prompt.ts**

```typescript
import { ClaudeMDOptions, loadClaudeMD } from '../config/claude-md.js'
import { MemoryManager } from '../memory/manager.js'
import { Skill } from '../core/types.js'
import { getAllSkills, findMatchingSkills } from '../skills/index.js'

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
  const memoryManager = new MemoryManager(options.workingDir)
  const memoryText = await memoryManager.loadAllAsText()
  if (memoryText) {
    parts.push(`# Memory\n\n${memoryText}`)
  }

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
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc --noEmit
```

---

## Task 10: 核心引擎

**Files:**
- Create: `src/core/engine.ts`
- Create: `src/core/context.ts`

- [ ] **Step 1: 创建 src/core/context.ts**

```typescript
import { Message, UsageInfo } from './types.js'
import { estimateMessagesTokens } from '../providers/base.js'

export class ContextManager {
  private messages: Message[] = []
  private maxTokens: number

  constructor(maxTokens: number = 200000) {
    this.maxTokens = maxTokens
  }

  add(message: Message): void {
    this.messages.push(message)
  }

  getMessages(): Message[] {
    return this.trimMessages()
  }

  reset(): void {
    this.messages = []
  }

  getLength(): number {
    return this.messages.length
  }

  private trimMessages(): Message[] {
    const estimated = estimateMessagesTokens(this.messages)
    if (estimated <= this.maxTokens * 0.8) {
      return this.messages
    }

    // Keep the last N messages to fit within budget
    // Always keep at least the last 2 messages (latest user + assistant)
    const result: Message[] = []
    let budget = 0
    const target = this.maxTokens * 0.6 // Target 60% to leave room for response

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessagesTokens([this.messages[i]])
      if (budget + msgTokens > target && result.length >= 2) break
      budget += msgTokens
      result.unshift(this.messages[i])
    }

    this.messages = result
    return result
  }
}
```

- [ ] **Step 2: 创建 src/core/engine.ts**

```typescript
import { v4 as uuidv4 } from 'crypto'
import {
  Message, ToolUseBlock, ToolResultBlock, EngineResult, EngineEvent,
  ToolContext, ToolResult, ChatParams, SystemBlock, UsageInfo,
} from './types.js'
import { LLMProvider } from '../providers/base.js'
import { ToolSpec, createToolDefinition } from '../tools/base.js'
import { buildSystemPrompt, SystemPromptOptions } from './system-prompt.js'
import { ContextManager } from './context.js'
import { userMessage, toolResultMessage } from './message.js'

export interface EngineOptions {
  provider: LLMProvider
  tools: Map<string, ToolSpec>
  model: string
  maxTokens: number
  maxToolRounds: number
  workingDir: string
  systemPromptOptions: SystemPromptOptions
  abortSignal?: AbortSignal
  onText?: (text: string) => void
  onToolStart?: (name: string, params: any) => void
  onToolEnd?: (name: string, result: ToolResult) => void
}

export class Engine {
  private provider: LLMProvider
  private tools: Map<string, ToolSpec>
  private model: string
  private maxTokens: number
  private maxToolRounds: number
  private workingDir: string
  private systemPromptOptions: SystemPromptOptions
  private context: ContextManager
  private abortSignal?: AbortSignal
  private onText?: (text: string) => void
  private onToolStart?: (name: string, params: any) => void
  private onToolEnd?: (name: string, result: ToolResult) => void

  constructor(options: EngineOptions) {
    this.provider = options.provider
    this.tools = options.tools
    this.model = options.model
    this.maxTokens = options.maxTokens
    this.maxToolRounds = options.maxToolRounds
    this.workingDir = options.workingDir
    this.systemPromptOptions = options.systemPromptOptions
    this.context = new ContextManager()
    this.abortSignal = options.abortSignal
    this.onText = options.onText
    this.onToolStart = options.onToolStart
    this.onToolEnd = options.onToolEnd
  }

  async run(prompt: string): Promise<EngineResult> {
    const events: EngineEvent[] = []
    for await (const event of this.runStream(prompt)) {
      events.push(event)
    }
    const complete = events.find(e => e.type === 'complete')
    return (complete as { type: 'complete'; result: EngineResult })?.result ?? {
      text: '',
      toolCalls: [],
      filesWritten: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  }

  async *runStream(prompt: string): AsyncGenerator<EngineEvent> {
    // Add user message
    this.context.add(userMessage(prompt))

    const systemText = await buildSystemPrompt(this.systemPromptOptions)
    const toolDefs = Array.from(this.tools.values()).map(t => createToolDefinition(t))

    let totalText = ''
    const toolCalls: { name: string; input: any; output: string; isError: boolean }[] = []
    const filesWritten: string[] = []
    let totalUsage: UsageInfo = { inputTokens: 0, outputTokens: 0 }

    for (let round = 0; round < this.maxToolRounds; round++) {
      if (this.abortSignal?.aborted) {
        yield { type: 'error', error: new Error('Aborted') }
        return
      }

      const messages = this.context.getMessages()
      const params: ChatParams = {
        model: this.model,
        system: [{ type: 'text', text: systemText }],
        messages,
        tools: toolDefs,
        maxTokens: this.maxTokens,
      }

      // Stream from provider
      let responseText = ''
      const toolUses: ToolUseBlock[] = []
      let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 }

      for await (const event of this.provider.chatStream(params)) {
        switch (event.type) {
          case 'text_delta':
            responseText += event.text
            this.onText?.(event.text)
            yield { type: 'text', content: event.text }
            break
          case 'tool_use_end':
            toolUses.push({
              type: 'tool_use',
              id: event.id,
              name: event.name,
              input: event.input,
            })
            break
          case 'message_end':
            usage = event.usage
            break
        }
      }

      totalUsage.inputTokens += usage.inputTokens
      totalUsage.outputTokens += usage.outputTokens

      // If no tool calls, we're done
      if (toolUses.length === 0) {
        totalText += responseText
        this.context.add({ role: 'assistant', content: [{ type: 'text', text: responseText }] })
        break
      }

      // Add assistant message with text + tool_use
      const assistantContent: any[] = []
      if (responseText) assistantContent.push({ type: 'text', text: responseText })
      assistantContent.push(...toolUses)
      this.context.add({ role: 'assistant', content: assistantContent })
      totalText += responseText

      // Execute tools
      const results: ToolResultBlock[] = []
      for (const tu of toolUses) {
        const tool = this.tools.get(tu.name)
        if (!tool) {
          const result: ToolResultBlock = {
            type: 'tool_result',
            toolUseId: tu.id,
            content: `Error: Unknown tool '${tu.name}'`,
            isError: true,
          }
          results.push(result)
          toolCalls.push({ name: tu.name, input: tu.input, output: result.content, isError: true })
          continue
        }

        this.onToolStart?.(tu.name, tu.input)
        yield { type: 'tool_start', name: tu.name, params: tu.input }

        const toolCtx: ToolContext = {
          workingDir: this.workingDir,
          sessionId: 'session',
        }

        let result: ToolResult
        try {
          result = await tool.execute(tu.input, toolCtx)
        } catch (err: any) {
          result = { output: `Tool execution error: ${err.message}`, isError: true }
        }

        this.onToolEnd?.(tu.name, result)
        yield { type: 'tool_end', name: tu.name, result }

        results.push({
          type: 'tool_result',
          toolUseId: tu.id,
          content: result.output,
          isError: result.isError,
        })

        toolCalls.push({ name: tu.name, input: tu.input, output: result.output, isError: !!result.isError })

        // Track files written
        if ((tu.name === 'file_write' || tu.name === 'file_edit') && result.metadata?.filePath) {
          filesWritten.push(result.metadata.filePath)
        }
      }

      // Add tool results to context
      this.context.add(toolResultMessage(results))
    }

    const engineResult: EngineResult = {
      text: totalText,
      toolCalls,
      filesWritten,
      usage: totalUsage,
    }

    yield { type: 'complete', result: engineResult }
  }

  getContext(): ContextManager {
    return this.context
  }

  resetContext(): void {
    this.context.reset()
  }
}
```

- [ ] **Step 3: 修复 uuid 导入 - 在 engine.ts 中移除 crypto 依赖，改用简单 ID 生成**

将 `import { v4 as uuidv4 } from 'crypto'` 替换为简单的 ID 生成。engine.ts 中实际没用到 uuidv4，直接删除那行 import。

- [ ] **Step 4: 验证编译**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc --noEmit
```

---

## Task 11: SDK 入口

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 重写 src/index.ts**

```typescript
// Types
export type { ClaudeSDKConfig, Message, ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock, EngineResult, EngineEvent, ToolResult, ToolContext, ToolRegistration, Skill, Memory, MemoryType, UsageInfo } from './core/types.js'

// SDK class
import { ClaudeSDKConfig, EngineResult, EngineEvent, Skill, ToolRegistration, ToolResult, ToolContext } from './core/types.js'
import { OpenAIProvider } from './providers/openai.js'
import { AnthropicProvider } from './providers/anthropic.js'
import { LLMProvider } from './providers/base.js'
import { Engine, EngineOptions } from './core/engine.js'
import { createBuiltinTools, ToolSpec, registerTool, createToolDefinition } from './tools/index.js'
import { getAllSkills, findMatchingSkills } from './skills/index.js'
import { loadClaudeMD } from './config/claude-md.js'
import { MemoryManager } from './memory/manager.js'

export class ClaudeSDK {
  private config: ClaudeSDKConfig
  private provider: LLMProvider
  private tools: Map<string, ToolSpec>
  private skills: Skill[] = []
  private activeSkill?: Skill
  private engines: Map<string, Engine> = new Map()

  constructor(config: ClaudeSDKConfig) {
    this.config = {
      maxTokens: 4096,
      maxToolRounds: 50,
      autoLoadClaudeMD: true,
      ...config,
    }

    // Create provider
    if (config.provider === 'openai') {
      this.provider = new OpenAIProvider(config.baseURL || 'https://api.openai.com/v1', config.apiKey)
    } else {
      this.provider = new AnthropicProvider(config.apiKey, config.baseURL)
    }

    // Load builtin tools
    this.tools = createBuiltinTools()
  }

  /**
   * Single-shot chat - no session persistence
   */
  async chat(prompt: string): Promise<EngineResult> {
    const engine = this.createEngine()
    return engine.run(prompt)
  }

  /**
   * Streaming chat - yields events
   */
  async *chatStream(prompt: string): AsyncGenerator<EngineEvent> {
    const engine = this.createEngine()
    yield* engine.runStream(prompt)
  }

  /**
   * Create a persistent session for multi-turn conversations
   */
  createSession(): Session {
    const id = `session-${Date.now()}`
    const engine = this.createEngine()
    this.engines.set(id, engine)
    return new Session(engine)
  }

  /**
   * Load CLAUDE.md files from project directory
   */
  async loadClaudeMD(): Promise<string> {
    return loadClaudeMD({ workingDir: this.config.workingDir })
  }

  /**
   * Set additional instructions for the system prompt
   */
  setInstructions(text: string): void {
    this.config.instructions = text
  }

  /**
   * Register a custom tool
   */
  registerTool(tool: ToolRegistration): void {
    const spec: ToolSpec = {
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      execute: tool.execute,
    }
    registerTool(this.tools, spec)
  }

  /**
   * Invoke a skill by name
   */
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

  /**
   * Load and return all available skills
   */
  async getSkills(): Promise<Skill[]> {
    return getAllSkills(this.config.skillsDir)
  }

  /**
   * Get list of files written in recent operations
   */
  async getGeneratedFiles(): Promise<string[]> {
    // This would track files across sessions in a real implementation
    return []
  }

  private createEngine(): Engine {
    return new Engine({
      provider: this.provider,
      tools: this.tools,
      model: this.config.model,
      maxTokens: this.config.maxTokens!,
      maxToolRounds: this.config.maxToolRounds!,
      workingDir: this.config.workingDir,
      systemPromptOptions: {
        workingDir: this.config.workingDir,
        customInstructions: this.config.instructions,
        skills: this.skills,
        activeSkill: this.activeSkill,
      },
    })
  }
}

/**
 * Persistent session for multi-turn conversations
 */
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

// Convenience exports
export { OpenAIProvider } from './providers/openai.js'
export { AnthropicProvider } from './providers/anthropic.js'
export { MemoryManager } from './memory/manager.js'
export { registerTool, createToolDefinition } from './tools/index.js'
```

- [ ] **Step 2: 验证编译并修复错误**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc --noEmit 2>&1 | head -30
```

修复所有编译错误直到通过。

---

## Task 12: 集成测试

**Files:**
- Create: `tests/integration.test.ts`

- [ ] **Step 1: 创建 tests/integration.test.ts**

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { ClaudeSDK } from '../src/index.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('ClaudeSDK', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-sdk-test-'))
  })

  it('should create SDK instance with OpenAI provider', () => {
    const sdk = new ClaudeSDK({
      provider: 'openai',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'test-key',
      model: 'test-model',
      workingDir: tmpDir,
    })
    expect(sdk).toBeDefined()
  })

  it('should create SDK instance with Anthropic provider', () => {
    const sdk = new ClaudeSDK({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      workingDir: tmpDir,
    })
    expect(sdk).toBeDefined()
  })

  it('should load CLAUDE.md', async () => {
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

  it('should list available skills', async () => {
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
  })

  it('should register custom tools', () => {
    const sdk = new ClaudeSDK({
      provider: 'openai',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'test-key',
      model: 'test-model',
      workingDir: tmpDir,
    })
    
    sdk.registerTool({
      name: 'custom_tool',
      description: 'A custom test tool',
      schema: (() => { const z = require('zod'); return z.object({ input: z.string() }) })(),
      execute: async (params) => ({ output: `Processed: ${params.input}` }),
    })
  })

  it('should create and use sessions', () => {
    const sdk = new ClaudeSDK({
      provider: 'openai',
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'test-key',
      model: 'test-model',
      workingDir: tmpDir,
    })
    const session = sdk.createSession()
    expect(session).toBeDefined()
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx vitest run 2>&1
```

修复任何错误直到测试通过。

---

## Task 13: 最终构建和验证

- [ ] **Step 1: 完整构建**

```bash
cd /Users/wudandan/Downloads/claude-code/claude-code-sdk && npx tsc
```

- [ ] **Step 2: 创建使用示例 examples/demo.ts**

```typescript
import { ClaudeSDK } from '../src/index.js'

async function main() {
  const sdk = new ClaudeSDK({
    provider: 'openai',
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    model: 'qwen3:30b',
    workingDir: '/tmp/demo-project',
  })

  console.log('Skills:', (await sdk.getSkills()).map(s => s.name))

  // Streaming chat
  const stream = sdk.chatStream('Create a simple Express.js hello world server')
  for await (const event of stream) {
    switch (event.type) {
      case 'text':
        process.stdout.write(event.content)
        break
      case 'tool_start':
        console.log(`\n[Tool] ${event.name}`)
        break
      case 'tool_end':
        console.log(`[Done] ${event.name}: ${event.result.output.slice(0, 80)}...`)
        break
      case 'complete':
        console.log('\n=== Complete ===')
        console.log('Files written:', event.result.filesWritten)
        break
    }
  }
}

main().catch(console.error)
```

- [ ] **Step 3: 验证完整项目结构**

```bash
find /Users/wudandan/Downloads/claude-code/claude-code-sdk/src -type f | sort
```

Expected output should list all created source files.
