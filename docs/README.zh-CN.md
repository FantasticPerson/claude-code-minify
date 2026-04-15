# claude-code-minify

中文 | **[English](https://github.com/FantasticPerson/claude-code-minify/blob/minify/README.md)**

> [Claude Code](https://github.com/anthropics/claude-code) 的轻量级 SDK 版本。从原版 Claude Code CLI（v2.1.88）的源码中提取并重写了核心逻辑，去除了终端 UI、CLI 框架、守护进程、WebSocket 桥接、IDE 集成等非核心模块，保留了 AI 编码助手的核心能力——多轮对话、工具调用、流式输出、技能系统和记忆管理。

---

## 与原版 Claude Code 的对比

| 维度 | Claude Code CLI（原版） | claude-code-minify |
|------|----------------------|-------------------|
| **形态** | 终端交互式 CLI 工具 | 可编程的 Node.js SDK / 库 |
| **定位** | 面向开发者的交互式 AI 编码助手 | 面向开发者的 AI 编码能力集成包 |
| **源码规模** | ~1,970 个文件 | ~25 个文件 |
| **运行时依赖** | 305 个 npm 包 | **4 个** npm 包 |
| **安装体积** | ~200+ MB（含原生模块） | **~2 MB** |
| **模块格式** | 单一 ESM（打包为单一 cli.js） | **ESM + CommonJS** 双格式 |
| **LLM 提供商** | 仅 Anthropic | **Anthropic + OpenAI**（含所有兼容 API） |
| **交互方式** | 终端 TUI（Ink + React） | 纯 API 调用（可嵌入任何应用） |
| **终端 UI** | 完整（进度条、彩色输出、vim 模式） | 无（由宿主应用自行控制展示） |
| **权限系统** | 复杂的交互式权限提示 | 无（宿主应用自行管理） |
| **MCP 服务器** | 支持 | 不支持 |
| **IDE 集成** | VS Code / JetBrains | 不支持 |
| **远程会话** | SSH / 桥接模式 | 不支持 |
| **语音模式** | 支持 | 不支持 |
| **文件操作** | 内置（8 个工具） | 内置（8 个工具，逻辑相同） |
| **工具调用循环** | 内置（Agentic Loop） | 内置（逻辑相同） |
| **CLAUDE.md** | 支持 | 支持（加载逻辑相同） |
| **技能系统** | 内置 + 插件技能 | 内置 6 个技能 + 自定义技能 |
| **记忆管理** | 自动记忆 | 手动 API 调用 |
| **上下文管理** | 自动裁剪 | 自动裁剪（逻辑相同） |
| **流式输出** | 终端渲染 | AsyncGenerator 事件流 |
| **自定义工具** | 通过插件/Agent | `registerTool()` API |
| **自定义 Provider** | 不支持 | 支持实现 `LLMProvider` 接口 |
| **插件系统** | 支持（Marketplace） | 不支持（用自定义工具替代） |
| **许可证** | 需订阅 Claude Pro/Max/Team | 使用你自己的 API Key |

### 保留了什么

从原版 Claude Code 中完整保留的核心能力：

- **Agentic Loop（工具调用循环）** — AI 自主决定何时调用工具、调用哪个工具、如何处理结果，循环直到任务完成
- **8 个内置工具** — `file_read`、`file_write`、`file_edit`、`bash`、`grep`、`glob`、`todo_write`、`ask_user`
- **CLAUDE.md 项目指令加载** — 完整的多文件加载、合并、优先级逻辑
- **系统提示词构建** — 核心提示词 + 项目指令 + 记忆 + 技能 + 环境信息
- **上下文窗口管理** — 自动估算 token 用量，超限时智能裁剪历史消息
- **技能系统** — 6 个内置技能（brainstorming、debugging、tdd 等）

### 去掉了什么

为了极致轻量化，去除了以下非核心模块：

- 终端 TUI 框架（Ink + React、彩色输出、进度条、Spinner）
- CLI 命令行框架（Commander、子命令系统）
- VS Code / JetBrains IDE 集成
- MCP（Model Context Protocol）服务器支持
- WebSocket / HTTP 桥接与远程会话
- 认证系统（OAuth、JWT、设备信任）
- 权限提示系统
- 插件市场
- 语音模式
- 桌面应用桥接
- 自动更新机制
- Sentry 错误上报与 Datadog 分析

---

## 适用场景

### 适合使用 claude-code-minify

| 场景 | 说明 |
|------|------|
| **CI/CD 自动化** | 在 GitHub Actions / GitLab CI 中自动生成代码、执行重构、修复 lint 错误 |
| **CLI 工具增强** | 在你自己的 CLI 工具中集成 AI 编码能力，无需依赖完整的 Claude Code |
| **代码审查机器人** | 搭建 PR 自动审查服务，在代码提交时自动分析并给出建议 |
| **文档生成** | 自动读取代码并生成 API 文档、README、变更日志 |
| **测试生成** | 自动为现有代码生成单元测试、集成测试 |
| **批量重构** | 编写脚本对大量文件执行 AI 驱动的批量重构 |
| **内部工具平台** | 在企业内部平台中集成 AI 编码能力，支持自定义 LLM 后端 |
| **自定义 AI Agent** | 作为 Agent 框架的编码能力层，支持 OpenAI / Anthropic / 自定义 Provider |
| **教育/研究** | 学习 AI 编码助手的工作原理，研究 Agentic Loop 模式 |
| **多 Provider 支持** | 需要同时支持 OpenAI 和 Anthropic，或使用 DeepSeek / Ollama 等兼容服务 |

### 适合使用原版 Claude Code

| 场景 | 说明 |
|------|------|
| **日常编码辅助** | 开发者在终端中交互式使用 AI 编码助手 |
| **需要 IDE 集成** | 在 VS Code / JetBrains 中使用 AI 编码 |
| **需要 MCP 服务器** | 连接外部 MCP 工具服务器 |
| **需要插件生态** | 使用 Claude Code 插件市场的扩展 |
| **团队协作** | 需要完整的权限管理、会话共享 |
| **不想写代码** | 开箱即用，无需编程即可使用 |

---

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [模块格式支持](#模块格式支持)
- [配置项](#配置项)
- [核心 API](#核心-api)
  - [ClaudeSDK 类](#claudesdk-类)
  - [Session 类](#session-类)
  - [流式输出](#流式输出)
  - [自定义工具](#自定义工具)
  - [技能系统](#技能系统)
  - [记忆管理](#记忆管理)
  - [CLAUDE.md 项目指令](#claudemd-项目指令)
- [内置工具](#内置工具)
  - [file_read - 读取文件](#file_read---读取文件)
  - [file_write - 写入文件](#file_write---写入文件)
  - [file_edit - 编辑文件](#file_edit---编辑文件)
  - [bash - 执行命令](#bash---执行命令)
  - [grep - 内容搜索](#grep---内容搜索)
  - [glob - 文件搜索](#glob---文件搜索)
  - [todo_write - 任务列表](#todo_write---任务列表)
  - [ask_user - 询问用户](#ask_user---询问用户)
- [Provider 详解](#provider-详解)
  - [OpenAI Provider](#openai-provider)
  - [Anthropic Provider](#anthropic-provider)
  - [自定义 Provider](#自定义-provider)
- [系统提示词](#系统提示词)
- [上下文管理](#上下文管理)
- [类型定义参考](#类型定义参考)
- [构建与发布](#构建与发布)
- [常见问题](#常见问题)

---

## 安装

```bash
# npm
npm install claude-code-minify

# pnpm
pnpm add claude-code-minify

# yarn
yarn add claude-code-minify
```

### 对等依赖

SDK 依赖以下运行时包（安装时自动拉取）：

| 包名 | 用途 |
|------|------|
| `openai` | OpenAI Chat Completions API 客户端 |
| `@anthropic-ai/sdk` | Anthropic Messages API 客户端 |
| `zod` | 工具参数 Schema 定义与校验 |
| `zod-to-json-schema` | Zod Schema 转 JSON Schema |

### 系统要求

- **Node.js** >= 18.0.0
- **ripgrep (`rg`)** - `grep` 工具依赖，需在系统 PATH 中可用。macOS 可通过 `brew install ripgrep` 安装。

---

## 快速开始

### ESM 项目

```typescript
// example.mts
import { ClaudeSDK } from 'claude-code-minify'

const sdk = new ClaudeSDK({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-4-6',
  workingDir: process.cwd(),
})

const result = await sdk.chat('在当前目录下创建一个 Express Hello World 服务器')
console.log(result.text)
console.log('写入的文件:', result.filesWritten)
```

### CommonJS 项目

```javascript
// example.cjs
const { ClaudeSDK } = require('claude-code-minify')

async function main() {
  const sdk = new ClaudeSDK({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
    workingDir: process.cwd(),
  })

  const result = await sdk.chat('写一个冒泡排序算法')
  console.log(result.text)
}

main()
```

### 设置环境变量

```bash
# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI
export OPENAI_API_KEY="sk-..."
```

---

## 模块格式支持

SDK 同时发布 CommonJS 和 ESM 两种格式，Node.js 通过 `exports` 条件自动选择：

| 格式 | 入口文件 | 类型声明 |
|------|---------|---------|
| **ESM** | `dist/index.js` | `dist/index.d.ts` |
| **CommonJS** | `dist/index.cjs` | `dist/index.d.cts` |

```jsonc
// package.json exports 字段（已内置，无需手动配置）
{
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  }
}
```

---

## 配置项

`ClaudeSDKConfig` 接口定义：

```typescript
interface ClaudeSDKConfig {
  /** LLM 提供商，必填 */
  provider: 'openai' | 'anthropic'

  /** API 密钥，必填 */
  apiKey: string

  /** 模型标识符，必填。例如 'gpt-4o', 'claude-sonnet-4-6' */
  model: string

  /** 工作目录，必填。所有文件操作的相对路径基准 */
  workingDir: string

  /** API 基础 URL，可选。用于兼容 API 的第三方服务 */
  baseURL?: string

  /** 最大输出 token 数，默认 4096 */
  maxTokens?: number

  /** 最大工具调用轮次，默认 50 */
  maxToolRounds?: number

  /** 是否自动加载 CLAUDE.md 项目指令，默认 true */
  autoLoadClaudeMD?: boolean

  /** 附加到系统提示词的自定义指令 */
  instructions?: string

  /** 自定义技能目录路径 */
  skillsDir?: string

  /** 用户交互回调函数，用于处理 ask_user 工具的提问 */
  askUserCallback?: (question: string) => Promise<string>
}
```

### 使用示例

```typescript
const sdk = new ClaudeSDK({
  provider: 'anthropic',
  apiKey: 'sk-ant-xxx',
  model: 'claude-sonnet-4-6',
  workingDir: '/home/user/my-project',
  maxTokens: 8192,
  maxToolRounds: 100,
  instructions: '所有代码注释使用中文。优先使用函数式编程风格。',
  autoLoadClaudeMD: true,
})
```

### 连接第三方兼容服务

SDK 支持任何兼容 OpenAI/Anthropic API 的服务：

```typescript
// DeepSeek
const sdk = new ClaudeSDK({
  provider: 'openai',
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: 'sk-xxx',
  model: 'deepseek-chat',
  workingDir: process.cwd(),
})

// 本地 Ollama
const sdk = new ClaudeSDK({
  provider: 'openai',
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',  // Ollama 不需要真实 key
  model: 'codellama',
  workingDir: process.cwd(),
})

// Amazon Bedrock（通过兼容代理）
const sdk = new ClaudeSDK({
  provider: 'anthropic',
  baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com',
  apiKey: 'xxx',
  model: 'anthropic.claude-3-sonnet',
  workingDir: process.cwd(),
})
```

---

## 核心 API

### ClaudeSDK 类

SDK 的主入口类，提供一次性对话、流式对话、会话管理、工具注册、技能调用等能力。

#### 构造函数

```typescript
const sdk = new ClaudeSDK(config: ClaudeSDKConfig)
```

自动初始化：
- 根据 `provider` 创建对应的 `LLMProvider` 实例
- 加载 8 个内置工具（`file_read`, `file_write`, `file_edit`, `bash`, `grep`, `glob`, `todo_write`, `ask_user`）
- 设置默认配置值

#### chat() - 一次性对话

发送一条消息并获取完整结果。每次调用会创建独立的引擎实例，不保留上下文。

```typescript
const result: EngineResult = await sdk.chat('帮我创建一个 REST API 项目')
```

返回值结构：

```typescript
interface EngineResult {
  /** AI 的最终文本回复 */
  text: string
  /** 本轮所有工具调用记录 */
  toolCalls: ToolCallRecord[]
  /** 被写入的文件路径列表 */
  filesWritten: string[]
  /** Token 使用统计 */
  usage: UsageInfo
}

interface ToolCallRecord {
  /** 工具名称 */
  name: string
  /** 工具输入参数 */
  input: Record<string, any>
  /** 工具执行输出 */
  output: string
  /** 是否执行出错 */
  isError: boolean
}

interface UsageInfo {
  inputTokens: number
  outputTokens: number
}
```

#### createSession() - 创建持久会话

创建一个多轮对话会话，会话内部维护消息历史，支持上下文连续对话。

```typescript
const session = sdk.createSession()

// 第一轮
const r1 = await session.chat('创建一个 Express 应用')
console.log(r1.text)

// 第二轮（会记住上一轮的上下文）
const r2 = await session.chat('给它加上 CORS 支持')
console.log(r2.text)

// 重置会话，清除所有历史
session.reset()
```

#### setInstructions() - 设置自定义指令

向系统提示词追加自定义指令。通常用于指定编码规范、语言偏好等。

```typescript
sdk.setInstructions(`
  1. 所有代码注释使用中文
  2. 使用 TypeScript strict 模式
  3. 优先使用 async/await
`)
```

#### loadClaudeMD() - 加载项目指令

手动加载项目 CLAUDE.md 文件内容。当 `autoLoadClaudeMD` 为 `true`（默认）时，每次对话会自动加载。

```typescript
const claudeMdContent = await sdk.loadClaudeMD()
console.log(claudeMdContent)
```

#### registerTool() - 注册自定义工具

在运行时注册一个自定义工具，扩展 AI 可用的工具集。

```typescript
import { z } from 'zod'

sdk.registerTool({
  name: 'weather',
  description: '查询指定城市的天气信息',
  schema: z.object({
    city: z.string().describe('城市名称'),
    unit: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
  }),
  execute: async (params, ctx) => {
    const { city, unit } = params
    // 调用天气 API...
    return {
      output: `${city} 当前温度: 25°C, 晴天`,
      metadata: { city, unit },
    }
  },
})

// AI 现在可以调用 weather 工具了
const result = await sdk.chat('北京今天天气怎么样？')
```

#### invokeSkill() - 调用技能

按名称调用一个已注册的技能。技能会被注入到系统提示词中，影响 AI 的行为模式。

```typescript
const result = await sdk.invokeSkill('brainstorming', '设计一个用户认证系统')
console.log(result.text)

const result2 = await sdk.invokeSkill('tdd', '为计算器模块编写测试')
```

#### getSkills() - 获取技能列表

获取所有可用技能（包括内置技能和自定义技能）。

```typescript
const skills = await sdk.getSkills()
skills.forEach(s => {
  console.log(`- ${s.name}: ${s.description}`)
})
```

---

### Session 类

持久化的多轮对话会话。内部使用同一个 `Engine` 实例，消息历史在多次调用间保留。

```typescript
class Session {
  /** 发送消息并获取完整结果 */
  chat(prompt: string): Promise<EngineResult>

  /** 流式发送消息 */
  chatStream(prompt: string): AsyncGenerator<EngineEvent>

  /** 重置会话，清除所有消息历史 */
  reset(): void
}
```

#### 多轮对话示例

```typescript
const session = sdk.createSession()

// 连续对话，AI 会记住之前的上下文
await session.chat('在 src/utils.ts 中创建一个日期格式化函数')
await session.chat('给它加上相对时间格式化（如"3分钟前"）')
await session.chat('为这些函数编写单元测试')

// 如果对话太长，可以重置
session.reset()

// 重置后开始新的对话
await session.chat('创建一个全新的项目结构')
```

---

### 流式输出

通过 `chatStream()` 实时获取 AI 的响应事件，适合需要实时显示进度的场景。

```typescript
// 方式一：通过 SDK 实例（无状态）
for await (const event of sdk.chatStream('解释一下 Promise 的工作原理')) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.content)
      break
    case 'tool_start':
      console.log(`\n[工具调用] ${event.name}`)
      break
    case 'tool_end':
      console.log(`[工具完成] ${event.name}: ${event.result.output.slice(0, 100)}...`)
      break
    case 'error':
      console.error('出错了:', event.error.message)
      break
    case 'complete':
      console.log('\n--- 对话完成 ---')
      console.log('Token 用量:', event.result.usage)
      break
  }
}
```

```typescript
// 方式二：通过 Session（有状态，保留上下文）
const session = sdk.createSession()

for await (const event of session.chatStream('创建 package.json')) {
  if (event.type === 'text') {
    process.stdout.write(event.content)
  }
}
```

#### EngineEvent 类型

```typescript
type EngineEvent =
  | { type: 'text'; content: string }               // 文本增量
  | { type: 'tool_start'; name: string; params: any } // 工具开始执行
  | { type: 'tool_end'; name: string; result: ToolResult } // 工具执行完成
  | { type: 'error'; error: Error }                  // 发生错误
  | { type: 'complete'; result: EngineResult }        // 对话完成
```

---

### 自定义工具

通过 `registerTool()` 注册自定义工具，让 AI 能够调用你的业务逻辑。

#### 工具定义结构

```typescript
interface ToolRegistration {
  /** 工具名称，全局唯一 */
  name: string

  /** 工具描述，AI 根据此描述决定何时使用该工具 */
  description: string

  /** 参数 Schema，使用 Zod 定义 */
  schema: z.ZodType<any>

  /** 执行函数 */
  execute: (params: any, context: ToolContext) => Promise<ToolResult>
}
```

#### ToolContext 结构

```typescript
interface ToolContext {
  /** 当前工作目录 */
  workingDir: string

  /** 会话 ID */
  sessionId: string

  /** 进度回调（可选） */
  onProgress?: (msg: string) => void
}
```

#### ToolResult 结构

```typescript
interface ToolResult {
  /** 工具执行输出文本 */
  output: string

  /** 是否为错误结果 */
  isError?: boolean

  /** 额外元数据 */
  metadata?: Record<string, any>
}
```

#### 完整示例：数据库查询工具

```typescript
import { z } from 'zotenv'

sdk.registerTool({
  name: 'query_database',
  description: '执行 SQL 查询并返回结果。仅支持 SELECT 语句。',
  schema: z.object({
    sql: z.string().describe('SQL 查询语句，仅支持 SELECT'),
    database: z.string().optional().describe('数据库名称，默认为 main'),
  }),
  execute: async (params, ctx) => {
    const { sql, database = 'main' } = params

    // 安全检查
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      return {
        output: '错误：仅支持 SELECT 查询',
        isError: true,
      }
    }

    try {
      // 执行查询...
      const rows = await db.query(sql)
      return {
        output: JSON.stringify(rows, null, 2),
        metadata: { database, rowCount: rows.length },
      }
    } catch (err: any) {
      return {
        output: `查询失败: ${err.message}`,
        isError: true,
      }
    }
  },
})
```

#### 完整示例：HTTP 请求工具

```typescript
sdk.registerTool({
  name: 'http_request',
  description: '发送 HTTP 请求并返回响应',
  schema: z.object({
    url: z.string().describe('请求 URL'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
  }),
  execute: async (params) => {
    const response = await fetch(params.url, {
      method: params.method,
      headers: params.headers,
      body: params.body,
    })
    const text = await response.text()
    return {
      output: `状态: ${response.status}\n${text}`,
      metadata: { status: response.status },
    }
  },
})
```

---

### 技能系统

技能是一组预定义的系统提示词模板，可以引导 AI 以特定的工作方式完成任务。

#### 内置技能

SDK 包含 6 个内置技能：

| 技能名称 | 描述 | 触发关键词 |
|---------|------|-----------|
| `brainstorming` | 在编码前进行需求分析和方案设计 | brainstorm, design, plan, requirements |
| `frontend-design` | 生成生产级的前端界面 | frontend, UI, component, page, layout |
| `debugging` | 系统化的调试流程 | debug, fix, error, bug, crash |
| `tdd` | 测试驱动开发工作流 | test, TDD, spec |
| `simplify` | 代码审查与优化 | simplify, review, refactor, cleanup |
| `verify` | 在声称完成前验证工作结果 | verify, check, done, complete |

#### 调用技能

```typescript
// 按名称调用
const result = await sdk.invokeSkill('brainstorming', '设计一个微服务架构')

// 查看所有可用技能
const skills = await sdk.getSkills()
for (const skill of skills) {
  console.log(`[${skill.name}] ${skill.description}`)
  console.log(`  触发词: ${skill.triggerPatterns.join(', ')}`)
}
```

#### 自定义技能

在指定目录下创建技能。每个技能是一个子目录，包含 `SKILL.md` 文件：

```
skills/
├── code-review/
│   └── SKILL.md
├── api-design/
│   └── SKILL.md
└── deploy/
    └── SKILL.md
```

`SKILL.md` 文件格式（支持 YAML frontmatter）：

```markdown
---
name: code-review
description: 代码审查技能，检查安全性、性能和可维护性
triggers: review, audit, security
---

你是一个专业的代码审查专家。在审查代码时，请关注以下方面：

1. **安全性** - SQL 注入、XSS、CSRF 等常见漏洞
2. **性能** - N+1 查询、内存泄漏、不必要的计算
3. **可维护性** - 命名规范、函数长度、耦合度
4. **错误处理** - 边界情况、异常捕获
```

使用自定义技能目录：

```typescript
const sdk = new ClaudeSDK({
  provider: 'anthropic',
  apiKey: 'sk-ant-xxx',
  model: 'claude-sonnet-4-6',
  workingDir: process.cwd(),
  skillsDir: '/path/to/skills',  // 指定自定义技能目录
})

// 自定义技能会与内置技能合并
const allSkills = await sdk.getSkills()
```

---

### 记忆管理

SDK 提供持久化的记忆存储系统，可以跨会话保存和读取信息。

#### MemoryManager API

```typescript
import { MemoryManager } from 'claude-code-minify'

const memory = new MemoryManager(process.cwd())

// 初始化（确保目录结构存在）
await memory.init()

// 保存记忆
await memory.save('user', 'coding-style', '偏好使用 TypeScript，函数式编程风格')
await memory.save('project', 'architecture', '使用 Clean Architecture 分层')
await memory.save('feedback', 'test-preference', '用户要求所有函数必须有单元测试')

// 加载指定类型的记忆
const userMemories = await memory.load('user')
// [{ type: 'user', name: 'coding-style', content: '...', updatedAt: Date }]

// 加载所有记忆
const allMemories = await memory.load()

// 加载为文本格式
const text = await memory.loadAllAsText()
// ## [user] coding-style
// 偏好使用 TypeScript，函数式编程风格
//
// ## [project] architecture
// 使用 Clean Architecture 分层

// 删除记忆
await memory.delete('architecture')
```

#### 记忆类型

| 类型 | 用途 | 示例 |
|------|------|------|
| `user` | 用户偏好和个人设置 | 编码风格、常用语言 |
| `feedback` | 用户的反馈和纠正 | "不要使用 var", "测试必须用 Jest" |
| `project` | 项目相关的上下文信息 | 架构决策、技术选型 |
| `reference` | 外部资源的引用和链接 | API 文档地址、设计稿链接 |

#### 存储位置

记忆文件存储在 `<workingDir>/.claude/memory/<type>/<name>.md`：

```
project-root/
└── .claude/
    └── memory/
        ├── user/
        │   └── coding-style.md
        ├── feedback/
        │   └── test-preference.md
        ├── project/
        │   └── architecture.md
        └── reference/
            └── api-docs.md
```

#### 记忆与系统提示词

当 `autoLoadClaudeMD` 为 `true` 时，记忆内容会自动注入到系统提示词的 `# Memory` 部分，AI 会参考这些信息进行回复。

---

### CLAUDE.md 项目指令

CLAUDE.md 是项目级的 AI 指令文件，SDK 会按优先级自动加载并合并。

#### 加载顺序（后者覆盖前者）

| 优先级 | 文件路径 | 说明 |
|--------|---------|------|
| 1 | `~/.claude/CLAUDE.md` | 全局用户指令 |
| 2 | `<workingDir>/CLAUDE.md` | 项目根目录指令 |
| 3 | `<workingDir>/.claude/CLAUDE.md` | 项目隐藏目录指令 |
| 4 | `<workingDir>/.claude/rules/*.md` | 规则文件（按文件名字母序） |
| 5 | `<workingDir>/GEMINI.md` | Gemini 兼容指令 |
| 6 | `<workingDir>/AGENTS.md` | 通用 Agent 指令 |
| 7 | `<workingDir>/.cursorrules` | Cursor 兼容指令 |
| 8 | `config.instructions` | 代码中通过 `setInstructions` 设置 |

#### CLAUDE.md 示例

```markdown
# 项目规范

## 技术栈
- 前端: React 18 + TypeScript + Tailwind CSS
- 后端: Node.js + Express + Prisma
- 数据库: PostgreSQL

## 编码规范
- 使用函数式组件和 hooks
- 所有 API 响应使用统一的 Result 类型
- 错误处理使用自定义 AppError 类
- 测试覆盖率要求 >= 80%

## 目录结构
- src/routes/ - 路由定义
- src/services/ - 业务逻辑
- src/repositories/ - 数据访问层
- src/types/ - TypeScript 类型定义
```

#### .claude/rules/ 示例

```
.claude/rules/
├── 01-security.md    # 安全规范
├── 02-testing.md     # 测试规范
└── 03-api-design.md  # API 设计规范
```

---

## 内置工具

SDK 内置 8 个工具，AI 在对话过程中自动调用。

### file_read - 读取文件

读取指定文件的内容，返回带行号的文本。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file_path` | string | 是 | 文件绝对路径 |
| `offset` | number | 否 | 起始行号（0-based） |
| `limit` | number | 否 | 读取行数 |

**行为规则：**
- 路径相对于 `workingDir` 解析
- 禁止读取 `/dev/*` 路径
- 不支持读取目录
- 文件大小超过 1 MB 时返回错误
- 返回格式为 `行号\t内容`

**示例：**

```typescript
// AI 可能会这样调用
{ "file_path": "/project/src/index.ts", "offset": 10, "limit": 20 }
```

**错误码：**
- `ENOENT` → "File not found"
- `EACCES` → "Permission denied"

---

### file_write - 写入文件

将内容写入指定文件，自动创建父目录。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file_path` | string | 是 | 文件绝对路径 |
| `content` | string | 是 | 要写入的内容 |

**行为规则：**
- 自动递归创建所有父目录
- 如果文件已存在则覆盖
- 写入成功后，文件路径会被记录到 `EngineResult.filesWritten`

---

### file_edit - 编辑文件

在文件中查找并替换文本片段，支持单次替换和全部替换。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file_path` | string | 是 | 文件绝对路径 |
| `old_string` | string | 是 | 要查找的文本 |
| `new_string` | string | 是 | 替换后的文本 |
| `replace_all` | boolean | 否 | 是否替换所有匹配（默认 `false`） |

**行为规则：**
- `old_string` 必须在文件中存在
- `replace_all` 为 `false` 时，`old_string` 必须在文件中唯一，否则报错
- `old_string` 和 `new_string` 不能相同
- 替换完成后返回替换的次数

---

### bash - 执行命令

在工作目录中执行 shell 命令。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command` | string | 是 | 要执行的 shell 命令 |
| `timeout` | number | 否 | 超时时间（毫秒），默认 120000，上限 600000 |
| `description` | string | 否 | 命令的描述说明 |

**行为规则：**
- 工作目录为 `workingDir`
- 继承当前进程的环境变量 (`process.env`)
- `maxBuffer`: 10 MB
- 输出超过 50,000 字符时自动截断（保留前 25K 和后 25K）
- 合并 stdout 和 stderr 输出
- 非零退出码会被标记为错误

---

### grep - 内容搜索

使用 ripgrep (`rg`) 搜索文件内容。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pattern` | string | 是 | 正则表达式 |
| `path` | string | 否 | 搜索目录 |
| `glob` | string | 否 | 文件名过滤模式 |
| `output_mode` | string | 否 | 输出模式：`content` / `files_with_matches` / `count`（默认） |
| `-i` | boolean | 否 | 忽略大小写 |
| `head_limit` | number | 否 | 输出行数限制 |

**行为规则：**
- 系统需安装 `rg`（ripgrep）
- 默认搜索隐藏文件，排除 `.git` 目录
- `--max-columns 500`（避免 base64 等长行干扰）
- 超时 30 秒，`maxBuffer` 5 MB
- 输出路径相对于 `workingDir` 显示

---

### glob - 文件搜索

按 glob 模式搜索文件路径。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pattern` | string | 是 | Glob 模式，如 `**/*.ts` |
| `path` | string | 否 | 搜索目录 |

**行为规则：**
- 内置 glob 匹配引擎（不依赖外部工具）
- `**` 匹配任意子目录
- `*` 匹配不含路径分隔符的任意字符
- `?` 匹配单个字符
- 自动跳过 `node_modules` 和 `.git` 目录
- 结果上限 100 个文件

---

### todo_write - 任务列表

维护任务列表状态。在 SDK 模式下为纯信息性工具。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `todos` | Array | 是 | 任务列表 |

**todos 数组元素结构：**

```typescript
{
  content: string          // 任务内容
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string       // 进行中的描述文本
}
```

**返回示例：**

```
Task list updated: 3/5 completed, working on: Implementing auth middleware
```

---

### ask_user - 询问用户

当 AI 需要向用户提问时使用。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question` | string | 是 | 向用户提出的问题 |

**行为规则：**
- 返回问题文本，并在元数据中标记 `needsUserResponse: true`
- 配合 `ClaudeSDKConfig.askUserCallback` 使用，宿主应用可以拦截并处理提问

```typescript
const sdk = new ClaudeSDK({
  // ...
  askUserCallback: async (question) => {
    // 在你的应用 UI 中展示问题，获取用户回答
    const answer = await presentToUser(question)
    return answer
  },
})
```

---

## Provider 详解

### OpenAI Provider

支持 OpenAI Chat Completions API 及所有兼容服务。

```typescript
import { OpenAIProvider } from 'claude-code-minify'

const provider = new OpenAIProvider(
  'https://api.openai.com/v1',  // baseURL
  'sk-xxx'                       // apiKey
)
```

**特性：**
- 支持流式和非流式调用
- 自动将 SDK 的消息格式转换为 OpenAI 格式
- 工具调用使用 OpenAI `function calling` 格式
- `chatStream()` 使用 `stream_options: { include_usage: true }` 获取 token 用量

**消息格式转换：**
- System blocks → `{ role: 'system', content }` 消息
- ToolUse blocks → `{ role: 'assistant', tool_calls: [...] }` 消息
- ToolResult blocks → `{ role: 'tool', tool_call_id, content }` 消息

---

### Anthropic Provider

支持 Anthropic Messages API。

```typescript
import { AnthropicProvider } from 'claude-code-minify'

const provider = new AnthropicProvider('sk-ant-xxx')  // apiKey
// 或指定自定义 baseURL
const provider = new AnthropicProvider('sk-ant-xxx', 'https://custom-proxy.example.com')
```

**特性：**
- 系统提示词通过 `system` 参数传递（不嵌入消息列表）
- 原生支持 `tool_use` 和 `tool_result` 内容块
- 流式使用 `client.messages.stream()` API
- `stopReason` 映射：`'tool_use'` 保持不变，其余映射为 `'end_turn'`

---

### 自定义 Provider

实现 `LLMProvider` 接口以支持其他 LLM 服务：

```typescript
import type { LLMProvider, ChatParams, ChatResponse, StreamEvent, Message } from 'claude-code-minify'

class MyCustomProvider implements LLMProvider {
  async chat(params: ChatParams): Promise<ChatResponse> {
    // 实现非流式调用
    // 将 params.messages 发送到你的 LLM 服务
    // 返回 ChatResponse
    return {
      text: '...',
      toolUses: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      stopReason: 'end_turn',
    }
  }

  async *chatStream(params: ChatParams): AsyncIterable<StreamEvent> {
    // 实现流式调用
    yield { type: 'text_delta', text: 'Hello' }
    yield { type: 'message_end', usage: { inputTokens: 10, outputTokens: 5 }, stopReason: 'end_turn' }
  }

  async countTokens(messages: Message[]): Promise<number> {
    // Token 计数（可使用 estimateMessagesTokens 工具函数）
    return messages.reduce((sum, m) => {
      return sum + Math.ceil(JSON.stringify(m).length / 4)
    }, 0)
  }
}
```

---

## 系统提示词

系统提示词由多个部分自动组装，按以下顺序拼接（用 `\n\n---\n\n` 分隔）：

| 部分 | 内容 | 来源 |
|------|------|------|
| **核心提示词** | AI 角色定义（软件开发专家）、行为准则、可用工具列表 | 内置硬编码 |
| **项目指令** | CLAUDE.md 加载的指令内容 | `loadClaudeMD()` |
| **记忆** | 历史记忆内容 | `MemoryManager.loadAllAsText()` |
| **活跃技能** | 当前激活的技能内容 | `sdk.invokeSkill()` |
| **环境信息** | 工作目录、平台、Node.js 版本 | 运行时自动获取 |

### 自定义系统提示词

通过 `instructions` 配置项或 `setInstructions()` 方法追加内容：

```typescript
const sdk = new ClaudeSDK({
  // ...
  instructions: '你是一个 Python 后端专家，只使用 FastAPI 框架。',
})

// 或在运行时修改
sdk.setInstructions('从现在开始，所有回复使用英文。')
```

---

## 上下文管理

SDK 内置上下文窗口管理器（`ContextManager`），自动在消息过长时进行裁剪。

### 工作机制

| 参数 | 值 | 说明 |
|------|-----|------|
| 默认上下文大小 | 200,000 tokens | 模拟的上下文窗口大小 |
| 裁剪触发阈值 | 80%（160,000 tokens） | 超过此值开始裁剪 |
| 裁剪目标 | 60%（120,000 tokens） | 裁剪到此比例 |
| 最少保留 | 2 条消息 | 保证基本上下文 |

### Token 估算方式

SDK 使用简单启发式估算，不依赖 tiktoken：

- 文本内容：`ceil(text.length / 4)` tokens
- 每条消息开销：4 tokens
- 非文本块：20 tokens/块

> 注意：这是估算值，实际 token 数可能有偏差。对于精确计费场景，请参考 Provider 返回的 `usage` 数据。

---

## 类型定义参考

### 消息类型

```typescript
/** 一条对话消息 */
interface Message {
  role: 'user' | 'assistant'
  content: ContentBlock[]
}

/** 内容块联合类型 */
type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

/** 文本块 */
interface TextBlock {
  type: 'text'
  text: string
}

/** 工具调用块 */
interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, any>
}

/** 工具结果块 */
interface ToolResultBlock {
  type: 'tool_result'
  toolUseId: string
  content: string
  isError?: boolean
}
```

### 引擎类型

```typescript
/** 引擎运行结果 */
interface EngineResult {
  text: string              // AI 最终文本回复
  toolCalls: ToolCallRecord[]  // 工具调用记录
  filesWritten: string[]    // 写入的文件路径
  usage: UsageInfo          // Token 使用量
}

/** 工具调用记录 */
interface ToolCallRecord {
  name: string
  input: Record<string, any>
  output: string
  isError: boolean
}

/** Token 使用信息 */
interface UsageInfo {
  inputTokens: number
  outputTokens: number
}
```

### 流事件类型

```typescript
/** 引擎事件 */
type EngineEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; name: string; params: any }
  | { type: 'tool_end'; name: string; result: ToolResult }
  | { type: 'error'; error: Error }
  | { type: 'complete'; result: EngineResult }

/** Provider 原始流事件 */
type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; input: string }
  | { type: 'tool_use_end'; id: string; name: string; input: Record<string, any> }
  | { type: 'message_end'; usage: UsageInfo; stopReason: string }
```

### 工具类型

```typescript
/** 工具执行上下文 */
interface ToolContext {
  workingDir: string
  sessionId: string
  onProgress?: (msg: string) => void
}

/** 工具执行结果 */
interface ToolResult {
  output: string
  isError?: boolean
  metadata?: Record<string, any>
}

/** 工具注册信息 */
interface ToolRegistration {
  name: string
  description: string
  schema: z.ZodType<any>
  execute: (params: any, context: ToolContext) => Promise<ToolResult>
}

/** 工具 JSON 定义（发送给 LLM 的格式） */
interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, any>
}
```

### 其他类型

```typescript
/** 技能定义 */
interface Skill {
  name: string
  description: string
  content: string
  triggerPatterns: string[]
}

/** 记忆条目 */
interface Memory {
  type: MemoryType
  name: string
  content: string
  updatedAt: Date
}

/** 记忆类型 */
type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

/** 聊天参数（Provider 层） */
interface ChatParams {
  model: string
  system: SystemBlock[]
  messages: Message[]
  tools: ToolDefinition[]
  maxTokens: number
  temperature?: number
}

/** 聊天响应（Provider 层） */
interface ChatResponse {
  text: string
  toolUses: ToolUseBlock[]
  usage: UsageInfo
  stopReason: string
}

/** 系统提示块 */
interface SystemBlock {
  type: 'text'
  text: string
  cacheControl?: { type: 'ephemeral' }
}
```

---

## 构建与发布

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 运行测试
npm run test

# 构建产物
npm run build
```

### 构建产物

运行 `npm run build` 后在 `dist/` 目录生成以下文件：

```
dist/
├── index.js         # ESM 格式
├── index.js.map     # ESM Source Map
├── index.d.ts       # ESM 类型声明
├── index.cjs        # CommonJS 格式
├── index.cjs.map    # CJS Source Map
└── index.d.cts      # CJS 类型声明
```

### TypeScript 项目引用

SDK 提供完整的类型声明，TypeScript 项目可直接获得类型提示：

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "bundler",  // 或 "node16" / "nodenext"
    "module": "ES2022",
    "target": "ES2022"
  }
}
```

```typescript
// 自动获得类型提示
import { ClaudeSDK, type EngineResult, type ClaudeSDKConfig } from 'claude-code-minify'

const config: ClaudeSDKConfig = {
  provider: 'anthropic',
  apiKey: 'xxx',
  model: 'claude-sonnet-4-6',
  workingDir: '.',
}

const sdk = new ClaudeSDK(config)
const result: EngineResult = await sdk.chat('Hello')
```

---

## 常见问题

### Q: 如何选择 Provider？

- **Anthropic (`anthropic`)**: 推荐，原生支持工具调用，响应质量高
- **OpenAI (`openai`)**: 适合已有 OpenAI API 的场景，也支持 DeepSeek、Ollama 等兼容服务

### Q: 如何限制工具调用次数？

通过 `maxToolRounds` 配置，默认 50 轮：

```typescript
const sdk = new ClaudeSDK({
  // ...
  maxToolRounds: 10,  // 最多 10 轮工具调用
})
```

### Q: 如何取消正在进行的对话？

当前版本的 Engine 支持 `AbortSignal`（内部接口）。可以通过 Session 的 `reset()` 方法提前终止。

### Q: 输出被截断了怎么办？

增大 `maxTokens` 配置：

```typescript
const sdk = new ClaudeSDK({
  // ...
  maxTokens: 8192,  // 增大输出 token 限制
})
```

### Q: 如何禁用 CLAUDE.md 自动加载？

```typescript
const sdk = new ClaudeSDK({
  // ...
  autoLoadClaudeMD: false,
})
```

### Q: ripgrep 未安装会怎样？

`grep` 工具会执行失败并返回错误。其他工具不受影响。可以通过 `brew install ripgrep`（macOS）或 `apt install ripgrep`（Ubuntu）安装。

### Q: 记忆数据存在哪里？可以版本控制吗？

记忆存储在 `<workingDir>/.claude/memory/` 目录下。建议将此目录添加到 `.gitignore`。

### Q: 支持浏览器环境吗？

当前仅支持 Node.js 环境。`bash`、`file_read`、`file_write` 等工具依赖 Node.js 的 `fs` 和 `child_process` 模块。

### Q: 如何处理大量文件操作？

工具调用按顺序串行执行。如果需要并行操作，可以注册自定义工具来批量处理：

```typescript
sdk.registerTool({
  name: 'batch_write',
  description: '批量写入多个文件',
  schema: z.object({
    files: z.array(z.object({
      path: z.string(),
      content: z.string(),
    })),
  }),
  execute: async (params) => {
    const results = await Promise.all(
      params.files.map(f => fs.writeFile(f.path, f.content, 'utf-8'))
    )
    return { output: `成功写入 ${results.length} 个文件` }
  },
})
```

### Q: 如何调试工具调用？

使用流式输出可以实时观察工具调用过程：

```typescript
for await (const event of sdk.chatStream('...')) {
  if (event.type === 'tool_start') {
    console.log('调用工具:', event.name, JSON.stringify(event.params))
  }
  if (event.type === 'tool_end') {
    console.log('工具结果:', event.result.output)
  }
}
```

### Q: 多个 SDK 实例之间共享工具吗？

不共享。每个 `ClaudeSDK` 实例有独立的工具注册表。如果需要共享，可以在创建后注册相同的工具。

---

## 完整示例

### 自动化代码审查工具

```typescript
import { ClaudeSDK } from 'claude-code-minify'
import * as fs from 'fs'

const sdk = new ClaudeSDK({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-4-6',
  workingDir: process.cwd(),
  instructions: `你是一个专业的代码审查专家。审查代码时关注：
    1. 安全漏洞（OWASP Top 10）
    2. 性能问题
    3. 代码可维护性
    4. 最佳实践
  `,
})

async function reviewFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const result = await sdk.invokeSkill(
    'simplify',
    `审查文件 ${filePath} 的代码质量：\n\`\`\`\n${content}\n\`\`\``
  )
  return result.text
}

// 审查所有 TypeScript 文件
const files = fs.readdirSync('./src').filter(f => f.endsWith('.ts'))
for (const file of files) {
  console.log(`\n=== ${file} ===`)
  const review = await reviewFile(`./src/${file}`)
  console.log(review)
}
```

### 多轮对话代码生成

```typescript
import { ClaudeSDK } from 'claude-code-minify'

const sdk = new ClaudeSDK({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o',
  workingDir: process.cwd(),
})

const session = sdk.createSession()

// 第一轮：创建项目结构
const r1 = await session.chat('创建一个 Express + TypeScript 的 REST API 项目')
console.log('创建结果:', r1.text)
console.log('写入文件:', r1.filesWritten)

// 第二轮：添加认证
const r2 = await session.chat('添加 JWT 认证中间件')
console.log('添加认证:', r2.text)

// 第三轮：编写测试
const r3 = await session.chat('为所有路由编写集成测试')
console.log('测试结果:', r3.text)

console.log('所有文件:', [...r1.filesWritten, ...r2.filesWritten, ...r3.filesWritten])
```

### 流式对话 CLI

```typescript
import { ClaudeSDK } from 'claude-code-minify'
import * as readline from 'readline'

const sdk = new ClaudeSDK({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-4-6',
  workingDir: process.cwd(),
})

const session = sdk.createSession()
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

async function chat() {
  rl.question('你: ', async (prompt) => {
    if (prompt === 'exit') {
      rl.close()
      return
    }

    process.stdout.write('AI: ')
    for await (const event of session.chatStream(prompt)) {
      switch (event.type) {
        case 'text':
          process.stdout.write(event.content)
          break
        case 'tool_start':
          process.stdout.write(`\n[调用 ${event.name}]`)
          break
        case 'tool_end':
          process.stdout.write(`[完成 ${event.name}]\n`)
          break
        case 'complete':
          console.log(`\n(用量: ${event.result.usage.inputTokens}in / ${event.result.usage.outputTokens}out)`)
          break
      }
    }

    chat() // 继续下一轮
  })
}

chat()
```

---