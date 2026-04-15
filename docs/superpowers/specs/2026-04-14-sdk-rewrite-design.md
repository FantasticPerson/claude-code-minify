# Claude Code SDK 重写设计文档

**日期**: 2026-04-14
**目标**: 基于 Claude Code CLI v2.1.88 源码，提取核心逻辑重写为轻量 Node.js SDK，支持 OpenAI + Anthropic 双格式 LLM API，保留核心功能（工具、Skills、CLAUDE.md、记忆系统），移除所有 UI 和非必要模块。

---

## 1. 项目定位

一个可编程调用的 Node.js SDK，能够在后端通过 AI 对话 + 工具调用生成完整的前后端项目。

**核心场景**:
```typescript
const sdk = new ClaudeSDK({ provider: 'openai', ... })
const result = await sdk.chat('帮我创建一个 Express + React 全栈项目')
// SDK 自动：读取/创建文件 → 执行命令 → 生成完整项目
```

---

## 2. 架构设计

```
claude-code-sdk/
├── src/
│   ├── index.ts                  # SDK 入口，暴露核心 API
│   ├── core/
│   │   ├── engine.ts             # 主引擎：对话循环、工具调度、消息管理
│   │   ├── message.ts            # 消息类型定义和转换
│   │   ├── context.ts            # 上下文窗口管理（token 计数、裁剪）
│   │   └── system-prompt.ts      # 系统提示词构建
│   ├── providers/
│   │   ├── base.ts               # LLM Provider 抽象接口
│   │   ├── openai.ts             # OpenAI Chat Completions 适配器
│   │   └── anthropic.ts          # Anthropic Messages 适配器
│   ├── tools/
│   │   ├── base.ts               # Tool 基类和注册机制
│   │   ├── file-read.ts          # 文件读取
│   │   ├── file-write.ts         # 文件写入
│   │   ├── file-edit.ts          # 文件编辑（精确字符串替换）
│   │   ├── bash.ts               # Shell 命令执行
│   │   ├── grep.ts               # 内容搜索（ripgrep）
│   │   ├── glob.ts               # 文件名模式搜索
│   │   ├── agent.ts              # 子代理工具
│   │   ├── todo-write.ts         # 任务列表管理
│   │   ├── skill.ts              # Skill 调用
│   │   ├── ask-user.ts           # 向用户提问（回调方式）
│   │   └── index.ts              # 工具注册表
│   ├── skills/
│   │   ├── loader.ts             # Skills 加载器（文件系统 + 内置）
│   │   ├── executor.ts           # Skill 执行引擎
│   │   └── builtin/              # 内置 skills
│   │       ├── brainstorming.md
│   │       ├── frontend-design.md
│   │       ├── debugging.md
│   │       ├── tdd.md
│   │       ├── simplify.md
│   │       └── verify.md
│   ├── memory/
│   │   ├── manager.ts            # 记忆管理器
│   │   └── types.ts              # 记忆类型定义
│   ├── config/
│   │   ├── claude-md.ts          # CLAUDE.md 解析和加载
│   │   └── settings.ts           # 全局配置管理
│   └── utils/
│       ├── token.ts              # Token 估算
│       ├── stream.ts             # 流式处理工具
│       └── fs.ts                 # 文件系统工具
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. SDK API 设计

```typescript
import { ClaudeSDK } from 'claude-code-sdk'

// 初始化 - OpenAI 兼容格式
const sdk = new ClaudeSDK({
  provider: 'openai',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: 'sk-xxx',
  model: 'deepseek-chat',
  workingDir: '/path/to/project',
})

// 初始化 - Anthropic 格式
const sdk2 = new ClaudeSDK({
  provider: 'anthropic',
  apiKey: 'sk-ant-xxx',
  model: 'claude-sonnet-4-6',
  workingDir: '/path/to/project',
})

// 单次对话
const result = await sdk.chat('帮我创建一个 Express + React 的全栈项目')

// 流式对话
const stream = sdk.chatStream('添加用户认证功能')
for await (const event of stream) {
  if (event.type === 'text') console.log(event.content)
  if (event.type === 'tool_use') console.log(`执行工具: ${event.name}`)
  if (event.type === 'tool_result') console.log(`工具结果: ${event.output}`)
}

// 多轮会话
const session = sdk.createSession()
await session.chat('创建项目结构')
await session.chat('添加登录页面')
await session.chat('写测试用例')

// CLAUDE.md
sdk.loadClaudeMD()  // 自动从 workingDir 查找
sdk.setInstructions('项目使用 TypeScript...')

// Skills
await sdk.invokeSkill('frontend-design', { description: '...' })

// 自定义工具
sdk.registerTool({
  name: 'database_query',
  description: 'Execute SQL queries',
  schema: z.object({ sql: z.string() }),
  execute: async (params, ctx) => ({ output: JSON.stringify(await db.query(params.sql)) })
})

// 获取生成的文件列表
const files = await sdk.getGeneratedFiles()
```

### SDK 构造参数

```typescript
interface ClaudeSDKConfig {
  provider: 'openai' | 'anthropic'
  baseURL?: string               // API 地址（OpenAI 兼容服务必填）
  apiKey: string
  model: string
  workingDir: string             // 工作目录
  maxTokens?: number             // 最大输出 token，默认 4096
  maxToolRounds?: number         // 最大工具轮数，默认 50
  autoLoadClaudeMD?: boolean     // 自动加载 CLAUDE.md，默认 true
  instructions?: string          // 手动补充系统指令
  skillsDir?: string             // 自定义 skills 目录
  askUserCallback?: (question: string) => Promise<string>  // 用户提问回调
}
```

---

## 4. LLM Provider 适配层

### 统一接口

```typescript
interface LLMProvider {
  chat(params: ChatParams): Promise<ChatResponse>
  chatStream(params: ChatParams): AsyncIterable<StreamEvent>
  countTokens(messages: Message[]): Promise<number>
}

interface ChatParams {
  model: string
  system: SystemBlock[]
  messages: Message[]
  tools: ToolDefinition[]
  maxTokens: number
  temperature?: number
}
```

### 统一消息格式

```typescript
interface Message {
  role: 'user' | 'assistant'
  content: ContentBlock[]
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
```

### 统一流式事件

```typescript
type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; input: string }
  | { type: 'tool_use_end'; id: string; name: string; input: Record<string, any> }
  | { type: 'message_end'; usage: UsageInfo }
```

### 差异适配

| 差异点 | OpenAI | Anthropic | 适配策略 |
|--------|--------|-----------|----------|
| 工具调用 | `tool_calls` 在 assistant message | `tool_use` content block | 统一为 content block |
| 工具结果 | `role: "tool"` 单独消息 | `tool_result` 在 user message | 转换时合并/拆分 |
| 系统提示 | `messages[0].role="system"` | 独立 `system` 参数 | 分别处理 |
| 流式格式 | `choices[0].delta` | `content_block_delta` | 统一为 StreamEvent |

---

## 5. 工具系统

### 工具基类

```typescript
abstract class Tool {
  name: string
  description: string
  abstract schema: ZodSchema
  abstract execute(params: any, context: ToolContext): Promise<ToolResult>
}

interface ToolContext {
  workingDir: string
  sessionId: string
  onProgress?: (msg: string) => void
}

interface ToolResult {
  output: string
  isError?: boolean
  metadata?: Record<string, any>
}
```

### 保留的 10 个核心工具

| 工具 | 作用 | 原项目对应 |
|------|------|-----------|
| `file_read` | 读取文件 | FileReadTool |
| `file_write` | 写入文件 | FileWriteTool |
| `file_edit` | 精确字符串替换编辑 | FileEditTool |
| `bash` | 执行 Shell 命令 | BashTool |
| `grep` | 内容搜索 | GrepTool |
| `glob` | 文件名模式搜索 | GlobTool |
| `agent` | 子代理（并行研究） | AgentTool |
| `todo_write` | 任务列表管理 | TodoWriteTool |
| `skill` | Skill 调用 | SkillTool |
| `ask_user` | 向用户提问 | AskUserQuestionTool |

工具自动转换为对应 Provider 的 function calling 格式。

### 自定义工具注册

```typescript
sdk.registerTool({
  name: 'database_query',
  description: 'Execute SQL queries',
  schema: z.object({ sql: z.string() }),
  execute: async (params, ctx) => {
    const result = await db.query(params.sql)
    return { output: JSON.stringify(result) }
  }
})
```

---

## 6. Skills 系统

### Skill 定义

```typescript
interface Skill {
  name: string
  description: string
  content: string               // 完整 skill 指令（Markdown）
  triggerPatterns: string[]
}
```

### 加载来源（按优先级）

1. `.claude/skills/` 目录下的自定义 skills
2. 内置 skills（打包在 SDK 中）
3. 调用方通过 API 注册

### 内置 Skills（6 个核心）

| Skill | 作用 |
|-------|------|
| `brainstorming` | 需求分析和方案设计 |
| `frontend-design` | 前端界面生成 |
| `debugging` | 系统化调试 |
| `tdd` | 测试驱动开发 |
| `simplify` | 代码简化审查 |
| `verify` | 完成前验证 |

### 执行流程

```
用户调用 skill → 加载 skill 内容 → 注入到 system prompt → LLM 按 skill 指令工作 → 正常工具调用循环
```

---

## 7. CLAUDE.md 支持

### 搜索路径（按优先级，后者覆盖前者）

1. `~/.claude/CLAUDE.md` — 全局
2. `<workingDir>/CLAUDE.md` — 项目根目录
3. `<workingDir>/**/CLAUDE.md` — 子目录

也支持 `GEMINI.md`、`AGENTS.md`、`.cursorrules` 等文件名。

### 集成方式

CLAUDE.md 内容合并后注入系统提示词，影响 LLM 行为。通过 `autoLoadClaudeMD` 配置自动加载。

---

## 8. 核心引擎

### 对话循环

```
用户输入
  → 构建 messages（历史 + 当前 + system prompt）
  → 调用 LLM Provider
  → 收到响应
  ├─ 纯文本 → 返回结果，结束
  └─ 包含 tool_use → 执行工具 → 构建 tool_result → 继续循环
```

### 上下文管理

- 维护消息历史，跟踪 token 用量
- 接近上限时自动裁剪：保留 system prompt + 最近 N 轮对话 + 重要工具结果
- Token 估算使用字符数/4 简单估算（轻量，不依赖 tiktoken）

### 会话管理

```typescript
class Session {
  chat(prompt: string): Promise<EngineResult>
  chatStream(prompt: string): AsyncIterable<EngineEvent>
  getHistory(): Message[]
  reset(): void
}
```

---

## 9. 记忆系统

```typescript
class MemoryManager {
  // 存储在 <workingDir>/.claude/memory/ 目录
  save(type: MemoryType, name: string, content: string): void
  load(type?: MemoryType): Memory[]
  search(query: string): Memory[]
  delete(name: string): void
}

type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

interface Memory {
  type: MemoryType
  name: string
  content: string
  updatedAt: Date
}
```

记忆在对话开始时自动加载到系统提示词。

---

## 10. 依赖清单

仅保留 5-8 个核心依赖（原项目 305 个）：

| 依赖 | 用途 | 必要性 |
|------|------|--------|
| `openai` | OpenAI API SDK | 必要 |
| `@anthropic-ai/sdk` | Anthropic API SDK | 必要 |
| `zod` | 工具参数 schema 定义和校验 | 必要 |
| `zod-to-json-schema` | Zod 转 JSON Schema（发给 LLM） | 必要 |
| `glob` | 文件名模式匹配 | 必要 |

开发依赖：`typescript`, `tsx`（运行 TS）, `vitest`（测试）, `esbuild`（打包）

---

## 11. 移除的功能模块

| 模块 | 原因 |
|------|------|
| 终端 UI（Ink/React 组件） | SDK 无需 UI |
| Anthropic OAuth 认证 | SDK 使用 API Key 认证 |
| Bridge/远程控制 | SDK 直接调用 |
| Chrome 集成 | 无关 |
| Daemon 模式 | 无关 |
| Voice 语音输入 | 无关 |
| Vim 模式 | 无关 |
| 键绑定系统 | 无关 |
| LSP 集成 | 非核心 |
| 分析统计 | 非核心 |
| MCP 服务器 | 非核心（后续可扩展） |
| Swarm 多代理 | 非核心（后续可扩展） |
| 插件系统 | 非核心（通过自定义工具替代） |
| Commander.js CLI | SDK 无需 CLI 框架 |
| 38 个非核心工具 | 精简为 10 个 |

---

## 12. 使用方式

### 安装

```bash
npm install claude-code-sdk
```

### 最小示例

```typescript
import { ClaudeSDK } from 'claude-code-sdk'

const sdk = new ClaudeSDK({
  provider: 'openai',
  baseURL: 'http://localhost:11434/v1',  // Ollama 本地
  apiKey: 'ollama',
  model: 'qwen3:30b',
  workingDir: '/tmp/my-project',
})

const result = await sdk.chat('创建一个 Express REST API 项目，包含用户 CRUD')
console.log(result.text)
console.log('生成的文件:', result.filesWritten)
```

### 流式集成

```typescript
const stream = sdk.chatStream('添加 JWT 认证')
for await (const event of stream) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.content)
      break
    case 'tool_start':
      console.log(`\n[工具] ${event.name}:`, JSON.stringify(event.params))
      break
    case 'tool_end':
      console.log(`[结果] ${event.name}: ${event.result.output.slice(0, 100)}...`)
      break
    case 'complete':
      console.log('\n完成! Token 用量:', event.result.usage)
      break
  }
}
```
