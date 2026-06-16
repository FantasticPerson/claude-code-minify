# 会话中断功能 实现计划

> 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。

**目标：** 让宿主应用能即时中断进行中的会话——断开 HTTP 流式连接、停止后续工具调用、保留中断前已生成内容。

**架构：** `AbortSignal` 从 SDK 层一路透传到 Provider（真正断开 fetch）；Engine 在 loop 头/流式内/工具前三处检查 signal，命中时产出 `interrupted` 事件并保留 `partialText`；bash 从 `exec` 重写为 `spawn` + 进程组以支持可靠中断。

**技术栈：** TypeScript (ESM)、vitest、`@anthropic-ai/sdk`、`openai`、Node `child_process.spawn`

**设计依据：** `docs/superpowers/specs/2026-06-16-session-interruption-design.md`

---

## 文件结构

| 文件 | 职责 | 改动类型 |
|---|---|---|
| `src/core/types.ts` | 新增 `ChatParams.signal`、`ToolContext.abortSignal`、`EngineEvent.interrupted`、`EngineResult.interrupted`、`ChatOptions` | 修改 |
| `src/core/engine.ts` | `run/runStream` 加可选 signal；三处检查点；`interrupted` 事件；`run()` 返回 | 修改 |
| `src/providers/openai.ts` | 透传 signal 到 `create`；catch abort | 修改 |
| `src/providers/anthropic.ts` | 透传 signal 到 `stream`；catch abort | 修改 |
| `src/tools/bash.ts` | `exec` → `spawn` + 进程组；接 `ctx.abortSignal` | 重写 |
| `src/index.ts` | `ClaudeSDK.chat/chatStream` 加 `options`；`Session.controller/abort()/signal` | 修改 |
| `tests/helpers/mock-provider.ts` | 加可选 `delayMs` + signal 感知（默认兼容） | 修改 |
| `tests/engine.test.ts` | 更新现有 abort 测试；新增三处检查点测试 | 修改 |
| `tests/providers.test.ts` | 新增 signal 透传 + abort 行为测试 | 修改 |
| `tests/tools.test.ts` | 新增 bash 中断测试 | 修改 |
| `tests/sdk.test.ts` | 新增 `options.signal` 与 `Session.abort()` 测试 | 修改 |

**任务依赖：** 1 → 2（同改 engine）；3、4 依赖 1（类型）；5 依赖 1+2。建议按 1→2→3→4→5 顺序，3 与 4 可并行。

---

## 任务 1：类型变更 + Engine `interrupted` 事件（loop 头检查点）

**文件：**
- 修改：`src/core/types.ts`、`src/core/engine.ts`
- 测试：`tests/engine.test.ts`

- [ ] **编写测试并验证失败**

  先更新 `tests/engine.test.ts` 第 164 行的现有用例（当前断言中断产出 `error` 事件，新设计改为 `interrupted`）：

  - 场景 A（signal 已 aborted）：`controller.abort()` 后 `engine.runStream('test')` → events 含 `interrupted`，`interrupted.partialText === ''`，**不含** `complete` 事件，**不含** `error` 事件
  - 场景 B（`run()` 返回值）：signal 已 aborted 时 `engine.run('test')` → 返回 `{ interrupted: true, text: '', toolCalls: [], usage: {inputTokens:0,outputTokens:0} }`

  运行：`npx vitest run tests/engine.test.ts`
  预期：FAIL（`interrupted` 事件不存在，类型也未定义）

- [ ] **实现功能并验证通过**

  **类型变更（`src/core/types.ts`）** — public API，需精确：
  ```typescript
  // ChatParams 末尾追加
  signal?: AbortSignal

  // ToolContext 末尾追加
  abortSignal?: AbortSignal

  // EngineResult 末尾追加
  interrupted?: boolean

  // EngineEvent 联合类型新增成员
  | { type: 'interrupted'; partialText: string; completedToolCalls: ToolCallRecord[]; usage: UsageInfo }

  // 新增导出
  export interface ChatOptions {
    signal?: AbortSignal
  }
  ```

  **Engine 改动（`src/core/engine.ts`）**：
  - `run(prompt: string, signal?: AbortSignal)`：收集事件后，优先匹配 `interrupted` 事件，返回 `{ text: partialText, toolCalls: completedToolCalls, filesWritten, usage, interrupted: true }`；否则走原 `complete` 逻辑
  - `runStream(prompt: string, signal?: AbortSignal)`：方法体内 `const sig = signal ?? this.abortSignal`
  - loop 头检查（`engine.ts:110`）：把现有的
    ```typescript
    if (this.abortSignal?.aborted) { yield { type: 'error', error: new Error('Aborted') }; return }
    ```
    改为 `sig`，并 yield `interrupted` 事件：
    ```typescript
    if (sig?.aborted) {
      yield { type: 'interrupted', partialText: totalText, completedToolCalls: toolCalls, usage: totalUsage }
      return
    }
    ```

  运行：`npx vitest run tests/engine.test.ts`
  预期：PASS（含更新后的 abort 用例 + 新增 run() 用例）

- [ ] **Commit**

  ```bash
  git add src/core/types.ts src/core/engine.ts tests/engine.test.ts
  git commit -m "feat(engine): signal 中断产出 interrupted 事件并保留已生成内容"
  ```

---

## 任务 2：Engine 流式内 + 工具前检查点

**文件：**
- 修改：`src/core/engine.ts`、`tests/helpers/mock-provider.ts`
- 测试：`tests/engine.test.ts`

- [ ] **编写测试并验证失败**

  先扩展 `MockProvider` 以支持流式中断测试（保持现有调用方兼容）：构造函数加可选 `delayMs = 0`；`chatStream` 在每次 yield 前 `if (params.signal?.aborted) return`（不 yield `message_end`），并在 delta 间 `await new Promise(r => setTimeout(r, this.delayMs))`。

  - 场景 A（流式内中断）：mock provider 配置长文本 + `delayMs: 5`；手动迭代 `engine.runStream('test', controller.signal)`，收到第 1 个 `text` 事件后 `controller.abort()` → 最终 events 含 `interrupted`，`interrupted.partialText` 包含已产出的文本片段，不含 `complete`
  - 场景 B（工具前中断）：第一轮 mock 返回 `file_read` tool_use（指向真实临时文件），在迭代中收到 `tool_start` 之前/之时 `controller.abort()` → events 含 `interrupted`，`completedToolCalls` 为空或不含被中断的工具

  运行：`npx vitest run tests/engine.test.ts`
  预期：FAIL（流式内/工具前尚无检查点）

- [ ] **实现功能并验证通过**

  **Engine 改动（`src/core/engine.ts`）**：
  - `ChatParams` 传入 `signal: sig`（让 provider 能感知）
  - 流式循环：在 `for await (const event of this.provider.chatStream(params))` 循环体开头加 `if (sig?.aborted) break`；循环结束后 `if (sig?.aborted) { yield interrupted; return }`
  - 工具执行循环（`for (const tu of toolUses)`）开头加检查：`if (sig?.aborted) { yield interrupted; return }`
  - `ToolContext` 构造（`engine.ts:238`）追加 `abortSignal: sig`，供 bash 等工具消费

  实现要点：抽一个 `yieldInterrupted()` 闭包避免三处重复拼装 `interrupted` 事件。

  运行：`npx vitest run tests/engine.test.ts`
  预期：PASS

- [ ] **Commit**

  ```bash
  git add src/core/engine.ts tests/helpers/mock-provider.ts tests/engine.test.ts
  git commit -m "feat(engine): 流式内与工具执行前的中断检查点"
  ```

---

## 任务 3：Provider 透传 signal（openai + anthropic）

**文件：**
- 修改：`src/providers/openai.ts`、`src/providers/anthropic.ts`
- 测试：`tests/providers.test.ts`

- [ ] **编写测试并验证失败**

  - 场景 A（OpenAI 透传）：`vi.spyOn(client.chat.completions, 'create').mockResolvedValue(asyncIterable)`，`provider.chatStream({ ..., signal })` 后断言 `create.mock.calls[0][1]?.signal === signal`
  - 场景 B（OpenAI abort 行为）：mock 的 async iterator 在 `signal.aborted` 时 `throw`；`provider.chatStream({ signal })` + 收集前 `controller.abort()` → events **不含** `message_end`，且不抛出未捕获错误
  - 场景 C（Anthropic 透传）：同理断言 `stream.mock.calls[0][1]?.signal === signal`
  - 场景 D（Anthropic abort 行为）：同理，abort 后不含 `message_end`

  运行：`npx vitest run tests/providers.test.ts`
  预期：FAIL（透传参数未加）

- [ ] **实现功能并验证通过**

  **openai.ts**：
  ```typescript
  const stream = await this.client.chat.completions.create(
    { /* 现有字段 */ stream: true, stream_options: { include_usage: true } },
    params.signal ? { signal: params.signal } : undefined,
  )
  ```
  `for await` 包裹 `try/catch`：捕获到错误时 `if (params.signal?.aborted) return`（静默，不 yield `message_end`），否则 `throw`。
  `chat()` 同样透传 `params.signal`（第二参数）+ try/catch。

  **anthropic.ts**：
  ```typescript
  const stream = this.client.messages.stream(
    { /* 现有字段 */ },
    params.signal ? { signal: params.signal } : {},
  )
  ```
  同样 `try/catch` 包裹 `for await`，aborted 时 `return`。`chat()` 同样透传。

  实现要点：abort 时 SDK 抛 `APIUserAbortError`（OpenAI）/ 被 signal 中断的错误（Anthropic），统一用 `params.signal?.aborted` 判断而非匹配错误类型，避免 SDK 版本耦合。

  运行：`npx vitest run tests/providers.test.ts`
  预期：PASS

- [ ] **Commit**

  ```bash
  git add src/providers/openai.ts src/providers/anthropic.ts tests/providers.test.ts
  git commit -m "feat(provider): 透传 AbortSignal 真正断开流式连接"
  ```

---

## 任务 4：bash 工具改用 spawn + 进程组（支持可靠中断）

**文件：**
- 修改：`src/tools/bash.ts`
- 测试：`tests/tools.test.ts`

- [ ] **编写测试并验证失败**

  新增中断测试（用 `ctx({ abortSignal })` 注入 signal）：
  - 场景 A（中断长命令）：`controller = new AbortController()`；启动 `bashTool.execute({ command: 'sleep 10' }, ctx({ abortSignal: controller.signal }))`，`setTimeout(() => controller.abort(), 100)` 后 await → 在 ~200ms 内返回（不是 10s）；`isError === true`；`output` 含 `[aborted]` 或类似标注
  - 场景 B（无残留进程）：中断后用 `pgrep`/进程检查确认没有 `sleep 10` 子进程残留（验证进程组 kill 生效）

  运行：`npx vitest run tests/tools.test.ts`
  预期：FAIL（exec 不读 ctx.abortSignal，sleep 会跑满 10s 且超时）

- [ ] **实现功能并验证通过**

  **bash.ts 改动**：把 `exec` 回调式实现替换为 `spawn` + 进程组，保留全部现有 security/truncate/timeout/maxBuffer 逻辑（前半段解析 `protectedPorts`/`blockedPaths`/`restrictToProjectDir`/`timeout`/`maxBuffer`/`truncateLimit` 完全不动）。

  核心实现要点：
  - 执行前检查：`if (ctx.abortSignal?.aborted) return { output: 'Error: aborted before execution', isError: true }`
  - `spawn(cmd, { cwd: execCwd, shell: true, detached: true, env: {...process.env} })` — `detached: true` 使子进程成为新进程组 leader
  - `killTree = (sig) => { try { process.kill(-child.pid, sig) } catch {} }` — 负 pid 杀整个进程组
  - `ctx.abortSignal.addEventListener('abort', () => { aborted = true; killTree('SIGKILL') })`，结束前 `removeEventListener`
  - `setTimeout(() => { timedOut = true; killTree('SIGKILL') }, timeout)` 复刻超时
  - `child.stdout/stderr.on('data')` 累积；累积长度超 `maxBuffer` 时 `killTree('SIGKILL')` 复刻 maxBuffer 行为
  - `child.on('close', code)` 拼装 output：aborted 追加 `[aborted]`，timedOut 追加 `[timed out]`（保持现有 `/timeout|killed|signal/i` 测试通过），再走原 truncate 逻辑（含 `[truncated]` 字样）；`isError = aborted || timedOut || !!code`
  - 用 `resolved` 标志防止 close 重复 resolve

  关键约束（必须回归通过现有 `tests/tools.test.ts` 的 bash 用例）：
  - `echo hello` → output 含 'hello'，非 error
  - `exit 1` → isError true
  - `node -e "setTimeout"` + `timeout:200` → isError true，output 匹配 `/timeout|killed|signal/i`
  - `yes a | head -60000` + `truncateLimit:1000` → 含 `[truncated]`，长度 < 60000
  - `ls /etc` + blockedPaths → isError，含 'Error'

  运行：`npx vitest run tests/tools.test.ts`
  预期：PASS（新增中断用例 + 全部现有 bash 回归用例）

- [ ] **Commit**

  ```bash
  git add src/tools/bash.ts tests/tools.test.ts
  git commit -m "feat(bash): 改用 spawn+进程组支持可靠中断，杀干净子进程树"
  ```

---

## 任务 5：ClaudeSDK `options.signal` + `Session.abort()`

**文件：**
- 修改：`src/index.ts`
- 测试：`tests/sdk.test.ts`

- [ ] **编写测试并验证失败**

  现有 `tests/sdk.test.ts` 用真实 provider（无网络调用不到 chat），需注入可中断的 provider。方案：构造 `ClaudeSDK` 后通过 `(sdk as any).provider = mockProvider` 注入 `MockProvider`（与 engine 测试一致），或直接测 `Session` 的 controller 行为。

  - 场景 A（SDK options.signal）：注入 `MockProvider([{ text: 'hi' }])`；`controller.abort()` 后 `await sdk.chat('test', { signal: controller.signal })` → 返回 `{ interrupted: true }`
  - 场景 B（Session.abort 中断进行中）：`session = sdk.createSession()`，启动 `session.chatStream('test')` 迭代（mock provider 配 `delayMs`），中途 `session.abort()` → events 含 `interrupted`
  - 场景 C（中断后复位）：B 中断后再次 `session.chat('again')`（mock 第二条响应）→ 正常返回 `interrupted: false`，证明 controller 已重建

  运行：`npx vitest run tests/sdk.test.ts`
  预期：FAIL（chat 不接 options，Session 无 abort）

- [ ] **实现功能并验证通过**

  **`src/index.ts` 改动**：
  - `import { ChatOptions } from './core/types.js'` 并在类型 export 区追加 `ChatOptions`
  - `ClaudeSDK.chat(prompt: string, options?: ChatOptions)` / `chatStream(prompt, options?)`：调 `this.createEngine(options)`
  - `createEngine(options?: ChatOptions): Engine`：传 `abortSignal: options?.signal`
  - `Session` 改造：
    ```typescript
    export class Session {
      private controller = new AbortController()
      constructor(private engine: Engine) {}
      async chat(prompt: string) { return this.engine.run(prompt, this.controller.signal) }
      async *chatStream(prompt: string) { yield* this.engine.runStream(prompt, this.controller.signal) }
      abort(): void { this.controller.abort(); this.controller = new AbortController() }
      get signal(): AbortSignal { return this.controller.signal }
      reset(): void { this.engine.resetContext() }
    }
    ```

  运行：`npx vitest run tests/sdk.test.ts`
  预期：PASS

- [ ] **Commit**

  ```bash
  git add src/index.ts tests/sdk.test.ts
  git commit -m "feat(sdk): 暴露 chat options.signal 与 Session.abort() 命令式中断"
  ```

---

## 全量验证（全部任务完成后）

- [ ] `npm test` — 全部测试通过（含所有现有回归）
- [ ] `npm run build` — tsup 构建无类型错误，`dist/` 产物正常
- [ ] `git log --oneline` 确认 5 个任务 commit + 无遗漏未提交改动

---

## 风险与注意事项

- **现有 `engine.test.ts` abort 用例必须随任务 1 更新**（`error` → `interrupted`），否则测试红
- **MockProvider 扩展保持默认 `delayMs=0` 且无 signal 时行为不变**，避免破坏 engine/providers 既有测试
- **bash 重写是本次最高风险改动**：spawn 的 buffer 收集、exit code、truncate 字样、timeout 标注必须逐项对齐现有断言；改完先单独跑 `tests/tools.test.ts` 的 bash 用例
- 非 bash 工具（file_read/grep/glob 等）**不做**进程级中断，仅靠 Engine 工具前检查点覆盖（设计边界，见 spec「范围边界」）
