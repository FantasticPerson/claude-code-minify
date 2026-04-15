# claude-code-minify

**[中文](https://github.com/FantasticPerson/claude-code-minify/blob/main/docs/README.zh-CN.md)** | English

> A lightweight SDK extracted from [Claude Code](https://github.com/anthropics/claude-code) CLI (v2.1.88). Stripped of terminal UI, CLI framework, daemon, WebSocket bridging, IDE integration and all non-essential modules — keeping only the core AI coding assistant capabilities: multi-turn conversation, tool use, streaming, skills, and memory.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Full Usage Guide (Chinese)](https://github.com/FantasticPerson/claude-code-minify/blob/main/docs/README.zh-CN.md) | Complete API reference, configuration, examples, FAQ, and comparison with the original Claude Code |
| [Comparison & Use Cases](https://github.com/FantasticPerson/claude-code-minify/blob/main/docs/README.zh-CN.md#与原版-claude-code-的对比) | Detailed comparison table between Claude Code CLI and claude-code-minify |
| [Core API Reference](https://github.com/FantasticPerson/claude-code-minify/blob/main/docs/README.zh-CN.md#核心-api) | ClaudeSDK, Session, streaming, custom tools, skills, memory |
| [Built-in Tools](https://github.com/FantasticPerson/claude-code-minify/blob/main/docs/README.zh-CN.md#内置工具) | file_read, file_write, file_edit, bash, grep, glob, todo_write, ask_user |
| [Provider Guide](https://github.com/FantasticPerson/claude-code-minify/blob/main/docs/README.zh-CN.md#provider-详解) | OpenAI, Anthropic, and custom providers |
| [Type Reference](https://github.com/FantasticPerson/claude-code-minify/blob/main/docs/README.zh-CN.md#类型定义参考) | Full TypeScript type definitions |
| [Build & Publish](https://github.com/FantasticPerson/claude-code-minify/blob/main/docs/README.zh-CN.md#构建与发布) | Build commands, npm publishing, dual-format output |

---

## Features

- **Dual LLM Provider** — OpenAI Chat Completions (compatible with DeepSeek, Ollama, vLLM, LM Studio) and Anthropic Messages API
- **8 Core Tools** — File read/write/edit, shell execution, content search, file search, etc.
- **Skills System** — 6 built-in skills + custom skill extensions
- **CLAUDE.md** — Auto-loads project-level instructions (also supports GEMINI.md, AGENTS.md, .cursorrules)
- **Memory System** — Persistent user preferences and project context
- **Streaming** — Full SSE streaming event support via AsyncGenerator
- **Minimal Dependencies** — Only **4** runtime dependencies (down from 305 in the original)
- **Dual Format** — ESM (`import`) + CommonJS (`require`) with full TypeScript declarations

## Comparison with Claude Code CLI

| Dimension | Claude Code CLI | claude-code-minify |
|-----------|----------------|-------------------|
| Form factor | Interactive terminal CLI | Programmable Node.js SDK |
| Source files | ~1,970 | **~25** |
| Runtime deps | 305 npm packages | **4** npm packages |
| Install size | ~200+ MB | **~2 MB** |
| LLM providers | Anthropic only | **Anthropic + OpenAI** (all compatible APIs) |
| File tools | 8 built-in | **Same 8 built-in** |
| Agentic loop | Built-in | **Same logic** |
| Terminal UI | Full (Ink + React) | None (host app controls display) |
| IDE integration | VS Code / JetBrains | Not included |
| MCP servers | Supported | Not included |
| Plugins | Marketplace | Custom tools via API |
| License | Requires Claude subscription | **Use your own API key** |

> See the [full comparison table](https://github.com/FantasticPerson/claude-code-minify/blob/main/docs/README.zh-CN.md#与原版-claude-code-的对比) for 25+ dimensions.

## Use Cases

| When to use claude-code-minify | When to use Claude Code CLI |
|-------------------------------|---------------------------|
| CI/CD automation | Daily interactive coding |
| Code review bots | IDE integration |
| Batch refactoring scripts | MCP server support |
| Custom AI agents | Plugin ecosystem |
| Multi-provider support (OpenAI, DeepSeek, Ollama) | Out-of-the-box experience |
| Embedding AI coding in your own product | Team collaboration features |

> See [detailed use cases](https://github.com/FantasticPerson/claude-code-minify/blob/main/docs/README.zh-CN.md#适用场景).

---

## Install

```bash
npm install claude-code-minify
```

Requirements: Node.js >= 18, [ripgrep](https://github.com/BurntSushi/ripgrep) (`brew install ripgrep`).

## Quick Start

```typescript
import { ClaudeSDK } from 'claude-code-minify'

const sdk = new ClaudeSDK({
  provider: 'openai',
  baseURL: 'http://localhost:11434/v1',  // Ollama
  apiKey: 'ollama',
  model: 'qwen3:30b',
  workingDir: '/tmp/my-project',
})

const result = await sdk.chat('Create an Express REST API project with user CRUD')
console.log(result.text)
console.log('Files created:', result.filesWritten)
```

### Streaming

```typescript
for await (const event of sdk.chatStream('Add JWT auth middleware')) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.content)
      break
    case 'tool_start':
      console.log(`\n[Tool] ${event.name}`)
      break
    case 'complete':
      console.log('\n=== Done ===')
      console.log('Usage:', event.result.usage)
      console.log('Files:', event.result.filesWritten)
      break
  }
}
```

### Multi-turn Session

```typescript
const session = sdk.createSession()

await session.chat('Create project structure and package.json')
await session.chat('Add Express routes and controllers')
await session.chat('Write test cases')

session.reset()  // Clear context
```

## Configuration

```typescript
interface ClaudeSDKConfig {
  provider: 'openai' | 'anthropic'  // Required
  apiKey: string                     // Required
  model: string                      // Required
  workingDir: string                 // Required
  baseURL?: string                   // For compatible APIs
  maxTokens?: number                 // Default: 4096
  maxToolRounds?: number             // Default: 50
  autoLoadClaudeMD?: boolean         // Default: true
  instructions?: string              // Extra system instructions
  skillsDir?: string                 // Custom skills directory
}
```

### Connecting Different LLM Services

```typescript
// OpenAI
{ provider: 'openai', apiKey: 'sk-xxx', model: 'gpt-4o', workingDir: '.' }

// DeepSeek
{ provider: 'openai', baseURL: 'https://api.deepseek.com/v1', apiKey: 'sk-xxx', model: 'deepseek-chat', workingDir: '.' }

// Ollama (local)
{ provider: 'openai', baseURL: 'http://localhost:11434/v1', apiKey: 'ollama', model: 'qwen3:30b', workingDir: '.' }

// vLLM / LM Studio
{ provider: 'openai', baseURL: 'http://localhost:8000/v1', apiKey: 'not-needed', model: 'your-model', workingDir: '.' }

// Anthropic Claude
{ provider: 'anthropic', apiKey: 'sk-ant-xxx', model: 'claude-sonnet-4-6', workingDir: '.' }
```

## Core Features

### CLAUDE.md Project Instructions

Auto-loaded from (later entries override earlier):

```
~/.claude/CLAUDE.md              # Global
<workingDir>/CLAUDE.md           # Project root
<workingDir>/.claude/CLAUDE.md   # Hidden directory
<workingDir>/.claude/rules/*.md  # Rules (alphabetical)
```

Also supports `GEMINI.md`, `AGENTS.md`, `.cursorrules`.

### Skills

6 built-in skills: `brainstorming`, `frontend-design`, `debugging`, `tdd`, `simplify`, `verify`.

```typescript
await sdk.invokeSkill('frontend-design', 'Create a login page with React + Tailwind')
const skills = await sdk.getSkills()
```

### Memory System

```typescript
import { MemoryManager } from 'claude-code-minify'

const memory = new MemoryManager('./project')
await memory.save('user', 'style', 'Prefer TypeScript strict mode')
await memory.save('project', 'stack', 'Express + Prisma + React')
```

### Custom Tools

```typescript
import { z } from 'zod'

sdk.registerTool({
  name: 'database_query',
  description: 'Execute SQL queries',
  schema: z.object({
    sql: z.string().describe('SQL query (SELECT only)'),
  }),
  execute: async (params, ctx) => {
    const rows = await db.query(params.sql)
    return { output: JSON.stringify(rows, null, 2) }
  },
})
```

## Built-in Tools

| Tool | Purpose | Key Params |
|------|---------|------------|
| `file_read` | Read file content | `file_path`, `offset`, `limit` |
| `file_write` | Create/overwrite file | `file_path`, `content` |
| `file_edit` | Find & replace text | `file_path`, `old_string`, `new_string`, `replace_all` |
| `bash` | Execute shell command | `command`, `timeout` |
| `grep` | Search file content (ripgrep) | `pattern`, `path`, `glob`, `output_mode` |
| `glob` | Search file names | `pattern`, `path` |
| `todo_write` | Task list management | `todos` |
| `ask_user` | Ask user a question | `question` |

## API Reference

### `ClaudeSDK`

| Method | Returns |
|--------|---------|
| `chat(prompt)` | `Promise<EngineResult>` |
| `chatStream(prompt)` | `AsyncGenerator<EngineEvent>` |
| `createSession()` | `Session` |
| `loadClaudeMD()` | `Promise<string>` |
| `setInstructions(text)` | `void` |
| `registerTool(tool)` | `void` |
| `invokeSkill(name, args?)` | `Promise<EngineResult>` |
| `getSkills()` | `Promise<Skill[]>` |

### `Session`

| Method | Description |
|--------|-------------|
| `chat(prompt)` | Chat with context persistence |
| `chatStream(prompt)` | Streaming chat |
| `reset()` | Clear conversation history |

### `EngineResult`

```typescript
{
  text: string              // Final AI response
  toolCalls: ToolCallRecord[]  // All tool invocations
  filesWritten: string[]    // Files created/modified
  usage: { inputTokens: number; outputTokens: number }
}
```

### `EngineEvent`

| Type | Data | Description |
|------|------|-------------|
| `text` | `content: string` | Text chunk |
| `tool_start` | `name, params` | Tool execution started |
| `tool_end` | `name, result` | Tool execution completed |
| `error` | `error: Error` | Error occurred |
| `complete` | `result: EngineResult` | Conversation complete |

## Project Structure

```
claude-code-minify/
├── src/
│   ├── index.ts              # SDK entry point
│   ├── core/
│   │   ├── types.ts          # Type definitions
│   │   ├── engine.ts         # Conversation loop engine
│   │   ├── context.ts        # Context window management
│   │   ├── system-prompt.ts  # System prompt builder
│   │   └── message.ts        # Message utilities
│   ├── providers/
│   │   ├── base.ts           # Provider interface
│   │   ├── openai.ts         # OpenAI adapter
│   │   └── anthropic.ts      # Anthropic adapter
│   ├── tools/                # 8 core tools
│   ├── skills/               # Skills system
│   ├── config/               # CLAUDE.md loader
│   └── memory/               # Memory system
├── docs/
│   └── README.zh-CN.md       # Full Chinese documentation
├── tests/
├── package.json              # 4 runtime deps
├── tsconfig.json
└── tsup.config.ts            # Dual-format build
```

## Build

```bash
npm run build    # Build ESM + CJS + types
npm run test     # Run tests
npm run dev      # Development mode
```

## Module Format

| Format | Entry | Types |
|--------|-------|-------|
| **ESM** | `dist/index.js` | `dist/index.d.ts` |
| **CommonJS** | `dist/index.cjs` | `dist/index.d.cts` |

## Requirements

- Node.js >= 18
- [ripgrep](https://github.com/BurntSushi/ripgrep) (`brew install ripgrep` on macOS)

## License

SEE LICENSE IN README.md
