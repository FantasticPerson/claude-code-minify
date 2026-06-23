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
- **Guardrails** — Response validation, rescue parsing for malformed tool calls, retry nudges, and error budget tracking to make tool-calling reliable
- **Tiered Context Compression** — Three-phase progressive compression (NoCompact / BasicCompact / TieredCompact) as pluggable strategies
- **8 Core Tools** — File read/write/edit, shell execution, content search, file search, etc.
- **Skills System** — 6 built-in skills + custom skill extensions
- **CLAUDE.md** — Auto-loads project-level instructions (also supports GEMINI.md, AGENTS.md, .cursorrules)
- **Memory System** — Persistent user preferences and project context
- **Eval Harness** — 10 preset scenarios, metrics collection, ASCII/JSONL reports, real LLM provider support
- **Streaming** — Full SSE streaming event support via AsyncGenerator
- **Interruptible** — Abort in-flight turns via `AbortSignal` (passed to `chat`/`chatStream`) or `Session.abort()`; the signal propagates to the provider to drop the HTTP connection and kills the whole `bash` process tree
- **Debug Logging** — Configurable category-based debug logging (engine, provider, tools, context, guardrails, memory, config, skills)
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

### Interruption

Abort an in-flight turn two ways. The signal propagates down to the provider (dropping the streaming HTTP connection) and to running tools — the `bash` tool kills its whole process tree. Already-generated text and completed tool calls are preserved.

```typescript
// 1) Pass an AbortSignal to chat / chatStream
const controller = new AbortController()
const result = await sdk.chat('Long-running task', { signal: controller.signal })
// result.interrupted === true if the turn was aborted

// 2) Command-style abort on a persistent Session
const session = sdk.createSession()
for await (const event of session.chatStream('Generate a lot of code')) {
  if (shouldStop()) session.abort()   // interrupts now, resets for the next turn
  if (event.type === 'interrupted') {
    console.log('Stopped. Partial text:', event.partialText)
  }
}
```

## Configuration

```typescript
interface ClaudeSDKConfig {
  provider: 'openai' | 'anthropic'  // Required
  apiKey: string                     // Required
  model: string                      // Required
  workingDir: string                 // Required
  baseURL?: string                   // For compatible APIs
  mode?: 'coding' | 'general'       // Default: 'coding'
  maxTokens?: number                 // Default: 4096
  contextWindow?: number             // Default: 200000
  maxToolRounds?: number             // Default: 50
  autoLoadClaudeMD?: boolean         // Default: true
  instructions?: string              // Extra system instructions
  skillsDir?: string                 // Custom skills directory
  security?: SecurityConfig          // Tool security policies
  context?: ContextConfig            // Context compression tuning
  tools?: ToolsConfig                // Tool behavior configuration
  guardrails?: GuardrailsConfig      // Guardrails error protection
  debug?: DebugConfig                // Debug logging configuration
}
```

### Context Configuration

Fine-tune the context window compression behavior.

```typescript
interface ContextConfig {
  compressionTriggerRatio?: number   // Trigger at this usage ratio, default 0.8
  compressionTargetRatio?: number    // Compress down to this ratio, default 0.6
  compressRecentRounds?: number      // Protect recent N rounds, default 6
  toolResultCompressThreshold?: number // Compress tool results over this size, default 500
}
```

The SDK now supports **pluggable compression strategies**. Three built-in strategies:

| Strategy | Description |
|----------|-------------|
| `NoCompact` | No compression (debugging) |
| `BasicCompact` | Default — same behavior as before (compress tool results + truncate) |
| `TieredCompact` | Three-phase progressive compression for long conversations |

```typescript
import { TieredCompact } from 'claude-code-minify'

// Use TieredCompact for long conversations
const ctx = new ContextManager(8000, undefined, new TieredCompact({ keepRecent: 2 }))
```

### Tool Configuration

Customize individual tool behavior. All fields are optional with sensible defaults.

```typescript
interface ToolsConfig {
  disabled?: string[]               // Disable builtin tools, e.g. ['bash', 'file_edit']
  wrapExecute?: (name: string, execute: ToolExecute) => ToolExecute  // Wrap each tool's execute (audit/log/throttle). Built-in file_edit/file_write are already wrapped with an in-process file lock.
  bash?: {
    defaultTimeout?: number          // Default command timeout (ms), default 120000
    maxTimeout?: number              // Maximum allowed timeout (ms), default 600000
    maxBuffer?: number               // Output buffer size (bytes), default 10485760
    outputTruncateLimit?: number     // Truncate output at this length, default 50000
  }
  grep?: {
    timeout?: number                 // Command timeout (ms), default 30000
    maxColumns?: number              // Max column width, default 500
    maxBuffer?: number               // Output buffer size (bytes), default 5242880
    skipDirs?: string[]              // Directories to exclude, default ['.git']
    extraSkipDirs?: string[]         // Additional dirs to exclude (appended to skipDirs)
  }
  glob?: {
    maxResults?: number              // Max file results, default 100
    skipDirs?: string[]              // Directories to skip, default ['node_modules', '.git']
    extraSkipDirs?: string[]         // Additional dirs to skip (appended to skipDirs)
  }
  read?: {
    maxFileSize?: number             // Max file size to read (bytes), default 1048576
  }
  write?: {
    maxFileSize?: number             // Max content size to write (bytes), default Infinity
  }
  edit?: {
    maxFileSize?: number             // Max file size to edit (bytes), default 10485760
  }
}
```

### Mode & Tool Filtering

The `mode` option switches between built-in prompt presets, and `tools.disabled` allows fine-grained tool control.

**`mode: 'coding'`** (default) — Full development assistant prompt with all 8 tools.

**`mode: 'general'`** — Generic conversation prompt. Automatically keeps only `file_read` and `ask_user` tools.

```typescript
// General mode — Q&A, knowledge, content generation
const sdk = new ClaudeSDK({
  provider: 'openai',
  apiKey: 'sk-xxx',
  model: 'gpt-4o',
  workingDir: '.',
  mode: 'general',
})
```

**`tools.disabled`** — Blacklist specific tools (works in any mode):

```typescript
const sdk = new ClaudeSDK({
  provider: 'anthropic',
  apiKey: 'sk-ant-xxx',
  model: 'claude-sonnet-4-6',
  workingDir: '.',
  tools: {
    disabled: ['bash', 'file_edit'],  // Disable dangerous tools
  },
})
```

When both `mode: 'general'` and `tools.disabled` are set, `tools.disabled` takes precedence.

**`tools.wrapExecute`** — Wrap each tool's `execute` (audit, logging, throttling, etc.):

```typescript
const sdk = new ClaudeSDK({
  provider: 'anthropic',
  apiKey: 'sk-ant-xxx',
  model: 'claude-sonnet-4-6',
  workingDir: '.',
  tools: {
    wrapExecute: (name, execute) => async (params, ctx) => {
      console.log(`[audit] ${name}`, params)
      return execute(params, ctx)
    },
  },
})
```

`file_edit`/`file_write` are already wrapped with an in-process per-file lock (innermost), so concurrent calls to the same file within one process are serialized automatically. User `wrapExecute` is applied on top and cannot bypass it.

### Security Configuration

All built-in tools support configurable security policies. No restrictions are applied by default.

```typescript
interface SecurityConfig {
  bash?: BashSecurityConfig
  file?: FileSecurityConfig
}

interface BashSecurityConfig {
  protectedPorts?: number[]           // Ports that cannot be killed
  blockedSystemPaths?: string[]       // Blocked absolute paths
  restrictToProjectDir?: boolean      // Restrict cd to project dir
}

interface FileSecurityConfig {
  restrictToProjectDir?: boolean      // Restrict file ops to project dir
  blockedPaths?: string[]             // Blocked path prefixes
  maxFileSize?: number                // Max file size in bytes
}
```

#### Example

```typescript
const sdk = new ClaudeSDK({
  provider: 'openai',
  apiKey: 'sk-xxx',
  model: 'gpt-4o',
  workingDir: '/home/user/my-project',
  security: {
    bash: {
      protectedPorts: [4999, 5173],
      blockedSystemPaths: ['/usr', '/etc', '/var'],
      restrictToProjectDir: true,
    },
    file: {
      restrictToProjectDir: true,
      blockedPaths: ['/etc/passwd'],
      maxFileSize: 1024 * 1024,  // 1MB
    },
  },
  context: {
    compressionTriggerRatio: 0.7,  // Compress earlier
    compressionTargetRatio: 0.5,   // More aggressive compression
  },
  tools: {
    bash: {
      defaultTimeout: 60000,       // 1 minute default
      outputTruncateLimit: 30000,  // Truncate at 30K chars
    },
    grep: {
      extraSkipDirs: ['dist', 'coverage'],  // Skip additional dirs
    },
  },
})
```

When `security` / `context` / `tools` are not configured, all tools operate with sensible defaults.

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

### Guardrails

The Guardrails middleware wraps around the Engine's tool-calling loop to catch and recover from malformed LLM responses before they reach tool execution.

**What it protects against:**
- **Unknown tool names** — catches calls to non-existent tools and sends a corrective nudge
- **Malformed arguments** — rejects non-object parameters and asks the model to fix them
- **Malformed JSON in text** — rescue-parses tool calls embedded in markdown code blocks or other non-standard formats
- **Retry exhaustion** — budgets retries (default 3) and tool errors (default 2) to prevent infinite loops

```typescript
import { ClaudeSDK } from 'claude-code-minify'

const sdk = new ClaudeSDK({
  provider: 'openai',
  apiKey: 'sk-xxx',
  model: 'gpt-4o',
  workingDir: '.',
  guardrails: {
    maxRetries: 3,        // Max retry attempts for invalid responses
    maxToolErrors: 2,     // Max consecutive tool errors before fatal
    rescueEnabled: true,  // Enable rescue parsing (default: true)
  },
})
```

When `guardrails` is not configured, the middleware is disabled and the Engine behaves as before.

### Debug Logging

Enable structured debug logging to trace SDK internals. Logs are tagged by category with timestamps.

```typescript
const sdk = new ClaudeSDK({
  // ... required config
  debug: {
    enabled: true,                              // Enable debug output
    categories: ['engine', 'tools', 'provider'], // Filter by category (omit for all)
  }
})
```

**Categories:**

| Category | What it logs |
|----------|-------------|
| `engine` | Conversation rounds, context tracking, stream lifecycle |
| `provider` | API requests, streaming events, token usage |
| `tools` | Tool execution params, results, errors, timing |
| `context` | Compression decisions, token estimation |
| `guardrails` | Validation results, retries, exhaustion |
| `memory` | Save/load operations |
| `config` | CLAUDE.md file loading |
| `skills` | Skill discovery and registration |

**Example output:**

```
[09:04:12.345][engine] runStream() started { "promptLength": 42, "sessionId": "sess_m3k8a2_x9f1b2" }
[09:04:12.346][config] CLAUDE.md loaded { "totalLength": 1234, "partCount": 3 }
[09:04:12.347][provider] sending chat request { "model": "gpt-4o", "messageCount": 1, "maxTokens": 4096 }
[09:04:13.891][provider] stream event: message_end { "usage": { "inputTokens": 2500, "outputTokens": 150 } }
[09:04:13.892][context] round=0 msgs=1 est=2650 (msg=2500+sys=80+tools=70)
[09:04:14.102][tools] executing file_write { "input": { "file_path": "/tmp/hello.ts", "content": "..." } }
[09:04:14.115][tools] file_write done { "isError": false, "outputLength": 25 }
```

When `debug` is not configured or `enabled` is `false`, logging has near-zero overhead.

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

> In `general` mode, only `file_read` and `ask_user` are registered. In `coding` mode (default), all 8 tools are available. Use `tools.disabled` to customize. `file_edit`/`file_write` are protected by an in-process per-file lock: concurrent calls to the same file within one process are serialized (different files stay parallel; cross-process is not guarded).

| Tool | Purpose | Key Params | Security Config |
|------|---------|------------|----------------|
| `file_read` | Read file content | `file_path`, `offset`, `limit` | `file.restrictToProjectDir`, `file.blockedPaths`, `file.maxFileSize` |
| `file_write` | Create/overwrite file | `file_path`, `content` | `file.restrictToProjectDir`, `file.blockedPaths`, `file.maxFileSize` |
| `file_edit` | Find & replace text | `file_path`, `old_string`, `new_string`, `replace_all` | `file.restrictToProjectDir`, `file.blockedPaths` |
| `bash` | Execute shell command | `command`, `timeout` | `bash.protectedPorts`, `bash.blockedSystemPaths`, `bash.restrictToProjectDir` |
| `grep` | Search file content (ripgrep) | `pattern`, `path`, `glob`, `output_mode` | `file.restrictToProjectDir`, `file.blockedPaths` |
| `glob` | Search file names | `pattern`, `path` | `file.restrictToProjectDir`, `file.blockedPaths` |
| `todo_write` | Task list management | `todos` | — |
| `ask_user` | Ask user a question | `question` | — |

## API Reference

### `ClaudeSDK`

| Method | Returns |
|--------|---------|
| `chat(prompt, options?)` | `Promise<EngineResult>` |
| `chatStream(prompt, options?)` | `AsyncGenerator<EngineEvent>` |
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
| `abort()` | Abort the in-flight turn, then reset for the next one |
| `signal` | `AbortSignal` governing the current turn (readonly) |
| `reset()` | Clear conversation history |

### `EngineResult`

```typescript
{
  text: string              // Final AI response
  toolCalls: ToolCallRecord[]  // All tool invocations
  filesWritten: string[]    // Files created/modified
  usage: { inputTokens: number; outputTokens: number }
  interrupted?: boolean     // True if the turn was aborted
}
```

### `EngineEvent`

| Type | Data | Description |
|------|------|-------------|
| `text` | `content: string` | Text chunk |
| `tool_start` | `name, params` | Tool execution started |
| `tool_end` | `name, result` | Tool execution completed |
| `error` | `error: Error` | Error occurred |
| `interrupted` | `partialText, completedToolCalls, filesWritten, usage` | Turn aborted; partial results preserved |
| `complete` | `result: EngineResult` | Conversation complete |

## Project Structure

```
claude-code-minify/
├── src/
│   ├── index.ts              # SDK entry point
│   ├── core/
│   │   ├── types.ts          # Type definitions
│   │   ├── defaults.ts       # Default configuration constants
│   │   ├── logger.ts         # Debug logging (category-based)
│   │   ├── engine.ts         # Conversation loop engine
│   │   ├── system-prompt.ts  # System prompt builder
│   │   └── message.ts        # Message utilities
│   ├── guardrails/           # Guardrails middleware
│   │   ├── nudge.ts          # Nudge data structure
│   │   ├── nudge-templates.ts # Corrective prompt templates
│   │   ├── error-tracker.ts  # Retry & error budget tracking
│   │   ├── validator.ts      # Response validation + rescue parsing
│   │   └── middleware.ts     # GuardrailsMiddleware facade
│   ├── context/              # Context management (pluggable strategies)
│   │   ├── strategy.ts       # CompactStrategy interface + 3 implementations
│   │   └── manager.ts        # ContextManager
│   ├── providers/
│   │   ├── base.ts           # Provider interface
│   │   ├── openai.ts         # OpenAI adapter
│   │   └── anthropic.ts      # Anthropic adapter
│   ├── tools/                # 8 core tools
│   │   ├── security.ts       # Shared security checks
│   │   └── ...               # Individual tool files
│   ├── eval/                 # Eval harness
│   │   ├── types.ts          # Scenario & metric types
│   │   ├── scenarios.ts      # 10 preset scenarios
│   │   ├── runner.ts         # EvalRunner engine
│   │   ├── metrics.ts        # Metrics aggregation
│   │   ├── report.ts         # ASCII table & JSONL reports
│   │   └── cli.ts            # CLI entry point
│   ├── skills/               # Skills system
│   ├── config/               # CLAUDE.md loader
│   └── memory/               # Memory system
├── docs/
│   ├── README.zh-CN.md       # Full Chinese documentation
│   └── decisions/            # Architecture Decision Records (ADRs)
├── tests/                    # 179 tests (9 files)
├── package.json              # 4 runtime deps
├── tsconfig.json
└── tsup.config.ts            # Dual-format build
```

## Build

```bash
npm run build    # Build ESM + CJS + types
npm run test     # Run 179 tests
npm run dev      # Development mode
npm run eval     # Run eval harness (mock provider)
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
