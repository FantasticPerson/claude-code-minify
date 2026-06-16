# 会话中断功能设计

## 概述

为 ClaudeSDK 添加**即时中断**进行中会话的能力：宿主应用触发中断后，立即断开 HTTP 流式连接、停止后续工具调用，并保留中断前已生成的内容。

## 背景与现状

中断能力当前是「半成品」，四层都缺一半：

| 层 | 现状 |
|---|---|
| `Engine` | 已有 `abortSignal` 字段，但仅在**每轮 loop 开头**检查（`engine.ts:110`）。当前轮的流式输出、工具执行必须跑完才停 |
| `ClaudeSDK` / `Session` | 完全未暴露中断入口，`createEngine()` 没有传 `abortSignal`（也没传 `onText` 等回调） |
| `Provider` | `ChatParams` 无 `signal` 字段，`chatStream()` 不接收 signal，**无法断开 HTTP 连接** |
| `EngineEvent` | 无专门的 `interrupted` 类型，中断只能复用 `error` 事件 |

结果：宿主应用目前**没有任何办法**中断一个进行中的会话。

## 需求

1. signal 一路透传到 Provider，`abort()` 时真正断开 HTTP 流式连接（停止消耗 token）
2. 流式输出中途、loop 头、工具执行前/中（bash）的检查点都能即时响应中断
3. 中断后保留已生成的文本和已完成的工具调用结果
4. 同时提供两种 API：一次性调用的传入式 signal，与 Session 级命令式 `abort()`
5. bash 工具可被可靠中断——杀掉整个子进程树，不残留 `npm run`、后台 `&` 等子进程
6. 完全向后兼容，所有新增字段/参数可选

## 设计决策

| 决策点 | 选定方案 | 取舍 |
|---|---|---|
| 中断粒度 | 完整中断，透传 signal 到 Provider | 改动覆盖 4 层 + Provider 接口，但中断真正即时 |
| API 形态 | 两种都给 | 一次性场景用 `options.signal`，长会话用 `Session.abort()` |
| 中断后语义 | 保留内容 + 新增 `interrupted` 事件 | 调用方能拿到中断前已输出文本，事件语义明确 |
| bash 中断 | `spawn` + 进程组，`process.kill(-pid)` | 重写 bash 执行核心约 40 行；中断彻底，子进程树不残留 |

## 设计

### 类型变更（`src/core/types.ts`）

```typescript
export interface ChatParams {
  // ... 现有字段
  signal?: AbortSignal
}

export interface ToolContext {
  // ... 现有字段
  abortSignal?: AbortSignal
}

export type EngineEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; name: string; params: any }
  | { type: 'tool_end'; name: string; result: ToolResult }
  | { type: 'error'; error: Error }
  | { type: 'interrupted'; partialText: string; completedToolCalls: ToolCallRecord[]; usage: UsageInfo }  // 新增
  | { type: 'complete'; result: EngineResult }

export interface EngineResult {
  // ... 现有字段
  interrupted?: boolean  // 新增
}

// SDK 调用选项
export interface ChatOptions {
  signal?: AbortSignal
}
```

### Provider 层（`src/providers/openai.ts` / `anthropic.ts`）

透传 signal 到 SDK 第二参数，abort 时静默 return（不 yield `message_end`）：

```typescript
// OpenAI
const stream = await this.client.chat.completions.create(
  { /* ... */ stream: true },
  params.signal ? { signal: params.signal } : undefined,
)
try {
  for await (const chunk of stream) { /* ... 现有逻辑 ... */ }
  yield { type: 'message_end', usage, stopReason }
} catch (err) {
  // signal.abort 触发时 OpenAI SDK 抛 APIUserAbortError，静默结束
  if (params.signal?.aborted) return
  throw err
}

// Anthropic
const stream = this.client.messages.stream(
  { /* ... */ },
  params.signal ? { signal: params.signal } : {},
)
// 同样 try/catch，aborted 时 return
```

效果：`controller.abort()` 触发时底层 fetch 立即断开，**停止消耗 token**。

### Engine 层（`src/core/engine.ts`）

`run()` / `runStream()` 新增可选 `signal` 参数，内部 `const sig = signal ?? this.abortSignal`。ClaudeSDK 一次性场景用构造时传入的 `abortSignal`；Session 长会话场景每次调用传当前 `controller.signal`（abort 后 controller 重建，下次传新的，避免长期持有的 Engine 绑死在旧 signal 上）。

三处检查点 + interrupted 事件（均判断 `sig`）：

```typescript
for (let round = 0; round < this.maxToolRounds; round++) {
  // ① loop 头检查（已有）
  if (this.abortSignal?.aborted) {
    yield { type: 'interrupted', partialText: totalText, completedToolCalls: toolCalls, usage: totalUsage }
    return
  }

  const params: ChatParams = { /* ... */ signal: this.abortSignal }

  // ② 流式循环内检查
  for await (const event of this.provider.chatStream(params)) {
    if (this.abortSignal?.aborted) break
    // ... 现有 event 处理 ...
  }
  if (this.abortSignal?.aborted) {
    yield { type: 'interrupted', partialText: totalText, completedToolCalls: toolCalls, usage: totalUsage }
    return
  }

  // ③ 工具执行前检查
  for (const tu of toolUses) {
    if (this.abortSignal?.aborted) {
      yield { type: 'interrupted', partialText: totalText, completedToolCalls: toolCalls, usage: totalUsage }
      return
    }
    // ... 执行工具，ToolContext 传 abortSignal ...
    const toolCtx: ToolContext = { /* ... */ abortSignal: this.abortSignal }
  }
}
```

`run()` 收集到 `interrupted` 事件时返回带标志的结果：

```typescript
const interrupted = events.find(e => e.type === 'interrupted') as { type: 'interrupted'; ... } | undefined
if (interrupted) {
  return { text: interrupted.partialText, toolCalls: interrupted.completedToolCalls,
           filesWritten, usage: interrupted.usage, interrupted: true }
}
// 否则走原有 complete 逻辑
```

### SDK / Session 层（`src/index.ts`）

**ClaudeSDK（无状态）** —— 传入式：

```typescript
async chat(prompt: string, options?: ChatOptions): Promise<EngineResult> {
  const engine = this.createEngine(options)
  return engine.run(prompt)
}
async *chatStream(prompt: string, options?: ChatOptions): AsyncGenerator<EngineEvent> {
  yield* this.createEngine(options).runStream(prompt)
}
private createEngine(options?: ChatOptions): Engine {
  return new Engine({ /* ...现有... */ abortSignal: options?.signal })
}
```

**Session（有状态）** —— 命令式，对应原版按 ESC：

```typescript
export class Session {
  private controller = new AbortController()
  constructor(private engine: Engine) {}

  async chat(prompt: string): Promise<EngineResult> {
    return this.engine.run(prompt, this.controller.signal)
  }
  async *chatStream(prompt: string): AsyncGenerator<EngineEvent> {
    yield* this.engine.runStream(prompt, this.controller.signal)
  }
  /** 中断当前会话；下次调用自动复位 */
  abort(): void {
    this.controller.abort()
    this.controller = new AbortController()  // 重建供下次使用
  }
  get signal(): AbortSignal { return this.controller.signal }
}
```

> Engine 由 Session 长期持有（共享多轮 context），但 signal 不在构造时绑定——每次 `chat()` 通过 `run()` 参数传当前 `controller.signal`。`abort()` 触发旧 controller 后立即重建，进行中的请求持有的是已 aborted 的旧 signal（正确中断），新 controller 服务于下次调用。

### bash 工具重写（`src/tools/bash.ts`）

`exec` → `spawn` + 进程组，支持可靠中断。保留现有 security/truncate/maxBuffer 语义：

```typescript
import { spawn } from 'child_process'

return new Promise((resolve) => {
  if (ctx.abortSignal?.aborted) {
    resolve({ output: 'Error: aborted before execution', isError: true }); return
  }

  const child = spawn(cmd, {
    cwd: execCwd, shell: true, detached: true,   // 新进程组 → kill(-pid) 杀整个树
    env: { ...process.env },
  })

  let stdout = '', stderr = '', timedOut = false, aborted = false, resolved = false
  const killTree = (sig: NodeJS.Signals = 'SIGTERM') => {
    try { process.kill(-child.pid!, sig) } catch {}
  }
  const onAbort = () => { aborted = true; killTree('SIGKILL') }
  ctx.abortSignal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => { timedOut = true; killTree('SIGKILL') }, timeout)

  child.stdout.on('data', (d) => {
    stdout += d
    if (stdout.length + stderr.length > maxBuffer) killTree('SIGKILL')  // 复刻 maxBuffer 行为
  })
  child.stderr.on('data', (d) => { stderr += d })
  child.on('close', (code) => {
    if (resolved) return; resolved = true
    clearTimeout(timer); ctx.abortSignal?.removeEventListener('abort', onAbort)
    // 拼装 output（aborted/timeout 标注 + truncate，与现有逻辑一致）
    resolve({ output, isError: aborted || timedOut || !!code })
  })
})
```

关键约束：
- `detached: true` + `process.kill(-pid)` 杀整个进程组，`npm run dev`、`sleep 100 &` 等子进程树不残留
- `maxBuffer`、`timeout`、`outputTruncateLimit` 语义与现有 exec 实现一致
- abort 时返回 `isError: true` 并在 output 标注 `[aborted]`

## 改动范围

| 文件 | 改动 |
|---|---|
| `src/core/types.ts` | `ChatParams.signal`、`ToolContext.abortSignal`、`EngineEvent.interrupted`、`EngineResult.interrupted`、新增 `ChatOptions` |
| `src/providers/openai.ts` | `chatStream`/`chat` 透传 signal + try/catch |
| `src/providers/anthropic.ts` | `chatStream`/`chat` 透传 signal + try/catch |
| `src/core/engine.ts` | 3 处检查点 + `interrupted` 事件 + `run()` 返回 + ToolContext 传 signal |
| `src/index.ts` | `chat/chatStream` 加 `options` 参数；`Session` 加 `controller`/`abort()`/`signal` |
| `src/tools/bash.ts` | `exec` → `spawn` + 进程组，接 `ctx.abortSignal` |

## 测试计划

| 层 | 用例 |
|---|---|
| engine | mock provider 支持中断，覆盖流式中途/loop 头/工具前三处检查点 → 产出 `interrupted` 事件且 `partialText` 正确保留 |
| engine | `run()` 中断后返回 `{ interrupted: true, text: <已生成> }` |
| provider | `signal.abort()` 后 `chatStream` 提前 return、不 yield `message_end` |
| bash | `signal.abort()` 中断 `sleep 10` → 立即返回 isError + `[aborted]`；无残留进程 |
| bash | 现有行为回归：`echo hello`、`exit 1`、truncate、blocked paths、timeout、maxBuffer |
| sdk | `sdk.chat(prompt, { signal })` 在响应中途中断 → 返回 interrupted 结果 |
| session | `session.abort()` 中断进行中的 chat → 返回 interrupted 结果；中断后再次 chat 正常 |

## 向后兼容

- 所有新增字段（`ChatParams.signal`、`ToolContext.abortSignal`、`EngineResult.interrupted`）、新参数（`ChatOptions`）均为可选
- 不传 signal 时行为与现状完全一致
- bash 重写保持 stdout/stderr/exitCode/truncate/timeout/maxBuffer 语义不变，现有测试回归通过

## 范围边界（本次不做）

- **非 bash 工具的可中断**：`file_read`/`file_write`/`grep` 等只在执行前后检查 signal，不中断正在执行的 IO。这些工具执行快，无需进程级中断
- **`onText`/`onToolStart`/`onToolEnd` 回调暴露到 SDK 层**：与本次需求无关，遵循 YAGNI 不顺手做
