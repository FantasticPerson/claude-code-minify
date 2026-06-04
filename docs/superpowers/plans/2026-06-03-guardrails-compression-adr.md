# Guardrails + 分级压缩 + ADR 实现计划

> 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。

**目标：** 为 SDK 引入 Guardrails 错误防护中间件和分级上下文压缩策略，提升工具调用可靠性和长对话支持。
**架构：** Guardrails 作为独立中间件层注入 Engine；压缩逻辑重构为可插拔策略模式。Engine 核心循环不变。
**技术栈：** TypeScript, Vitest, Zod

**分支：** `feat/guardrails-compression-adr`
**规格文档：** `docs/superpowers/specs/2026-06-03-guardrails-compression-adr-design.md`
**前置 commit：** ADR 文档已完成 (`cd6af0e`)

---

## 文件结构

```
新增文件：
  src/guardrails/index.ts              # 公共导出
  src/guardrails/nudge.ts              # Nudge 数据结构 + NudgeKind 枚举
  src/guardrails/nudge-templates.ts    # 纠错提示模板
  src/guardrails/error-tracker.ts      # ErrorTracker 错误预算管理
  src/guardrails/validator.ts          # ResponseValidator 校验 + 救援解析
  src/guardrails/middleware.ts         # GuardrailsMiddleware 门面
  src/context/index.ts                 # 公共导出
  src/context/strategy.ts              # CompactStrategy 接口 + 三种实现
  src/context/manager.ts               # 重构后的 ContextManager
  tests/guardrails.test.ts             # Guardrails 测试
  tests/context-strategy.test.ts       # 压缩策略测试

修改文件：
  src/core/engine.ts                   # 注入 GuardrailsMiddleware（~20 行改动）
  src/core/context.ts                  # 删除（逻辑迁移到 src/context/）
  src/core/types.ts                    # 新增 GuardrailsConfig 类型
  src/core/defaults.ts                 # 新增 Guardrails 默认常量
  src/index.ts                         # 导出新模块
```

---

## 任务 1：Nudge 数据结构 + 纠错模板

**文件：**
- 创建：`src/guardrails/nudge.ts`
- 创建：`src/guardrails/nudge-templates.ts`
- 创建：`src/guardrails/index.ts`（初始导出）
- 测试：`tests/guardrails.test.ts`

- [ ] **编写测试并验证失败**

`tests/guardrails.test.ts` — Nudge + NudgeTemplates 部分：

- Nudge 构造：`new Nudge('user', 'msg', NudgeKind.Retry)` → 属性正确
- Nudge 不变性：`nudge.role === 'user'`, `nudge.kind === NudgeKind.Retry`
- NudgeKind 枚举：验证四个值存在（Retry / UnknownTool / ToolArgValidation / Step）
- NudgeTemplates.retry：传入任意字符串 → 返回包含"tool call"的纠错提示
- NudgeTemplates.unknownTool：传入 `'bad_tool'` 和 `['tool_a', 'tool_b']` → 返回包含 `'bad_tool'` 和 `'tool_a, tool_b'` 的提示
- NudgeTemplates.toolArgValidation：传入 `'my_tool'` 和 `'bad_args'` → 返回包含 `'my_tool'` 和 `'JSON object'` 的提示

运行：`npx vitest run tests/guardrails.test.ts`
预期：FAIL（文件不存在）

- [ ] **实现功能并验证通过**

`src/guardrails/nudge.ts` 关键接口：

```typescript
export const enum NudgeKind {
  Retry = "retry",
  UnknownTool = "unknown_tool",
  ToolArgValidation = "tool_arg_validation",
}

export class Nudge {
  constructor(
    public readonly role: "user" | "tool",
    public readonly content: string,
    public readonly kind: NudgeKind,
  ) {}
}
```

`src/guardrails/nudge-templates.ts` 关键签名：

```typescript
export const NudgeTemplates = {
  retry(rawResponse: string): string,
  unknownTool(attempted: string, available: string[]): string,
  toolArgValidation(toolName: string, gotArgs: unknown): string,
}
```

模板内容参考 forge 的 nudge 模板：retry 提示模型必须返回工具调用；unknownTool 列出可用工具名；toolArgValidation 说明参数必须是 JSON object。

`src/guardrails/index.ts` 导出 Nudge、NudgeKind、NudgeTemplates。

运行：`npx vitest run tests/guardrails.test.ts`
预期：PASS

- [ ] **Commit**

```bash
git add src/guardrails/ tests/guardrails.test.ts
git commit -m "feat: add Nudge data structure and nudge templates for guardrails"
```

---

## 任务 2：ErrorTracker 错误预算管理

**文件：**
- 创建：`src/guardrails/error-tracker.ts`
- 测试：`tests/guardrails.test.ts`（追加 ErrorTracker 部分）

- [ ] **编写测试并验证失败**

追加到 `tests/guardrails.test.ts` — ErrorTracker 部分：

- 初始状态：`retriesExhausted === false`, `toolErrorsExhausted === false`
- recordRetry ×3（maxRetries=3）→ `retriesExhausted === true`
- recordToolError ×2（maxToolErrors=2）→ `toolErrorsExhausted === true`
- reset() 后所有计数归零，`retriesExhausted === false`
- 自定义 maxRetries=5：recordRetry ×5 → `retriesExhausted === true`

运行：`npx vitest run tests/guardrails.test.ts`
预期：ErrorTracker 测试 FAIL

- [ ] **实现功能并验证通过**

`src/guardrails/error-tracker.ts` 关键接口：

```typescript
export class ErrorTracker {
  private consecutiveRetries = 0;
  private consecutiveToolErrors = 0;

  constructor(
    public readonly maxRetries = 3,
    public readonly maxToolErrors = 2,
  ) {}

  recordRetry(): void   // consecutiveRetries++
  recordToolError(): void  // consecutiveToolErrors++
  reset(): void  // 两个计数归零
  get retriesExhausted(): boolean  // consecutiveRetries >= maxRetries
  get toolErrorsExhausted(): boolean  // consecutiveToolErrors >= maxToolErrors
}
```

更新 `src/guardrails/index.ts` 导出 ErrorTracker。

运行：`npx vitest run tests/guardrails.test.ts`
预期：PASS

- [ ] **Commit**

```bash
git add src/guardrails/ tests/guardrails.test.ts
git commit -m "feat: add ErrorTracker for retry and tool error budget management"
```

---

## 任务 3：ResponseValidator 校验 + 救援解析

**文件：**
- 创建：`src/guardrails/validator.ts`
- 测试：`tests/guardrails.test.ts`（追加 Validator 部分）

- [ ] **编写测试并验证失败**

追加到 `tests/guardrails.test.ts` — ResponseValidator 部分：

**正常校验：**
- 合法工具调用 `[{name:'read', input:{file_path:'/a'}}]` + toolNames=`['read','write']` → `needsRetry=false, toolCalls` 不为 null
- 未知工具 `[{name:'hack', input:{}}]` → `needsRetry=true, nudge.kind === NudgeKind.UnknownTool`
- 参数非 object `[{name:'read', input:'bad'}]` → `needsRetry=true, nudge.kind === NudgeKind.ToolArgValidation`
- 空 toolCalls（纯文本响应）→ `needsRetry=true, nudge.kind === NudgeKind.Retry`

**Rescue 解析（rescueEnabled=true）：**
- JSON 包在 markdown 代码块中：rawContent=`'\`\`\`json\n[{"name":"read","input":{"file_path":"/a"}}]\n\`\`\`'` → 成功解析出 toolCalls
- rescueEnabled=false 时：同样输入 → `needsRetry=true`（不尝试 rescue）

运行：`npx vitest run tests/guardrails.test.ts`
预期：ResponseValidator 测试 FAIL

- [ ] **实现功能并验证通过**

`src/guardrails/validator.ts` 关键接口：

```typescript
export interface ValidationResult {
  toolCalls: ToolUseBlock[] | null;
  nudge: Nudge | null;
  needsRetry: boolean;
}

export class ResponseValidator {
  private toolNames: Set<string>;

  constructor(toolNames: string[], private rescueEnabled = true) {
    this.toolNames = new Set(toolNames);
  }

  validate(toolCalls: ToolUseBlock[] | null, rawContent?: string): ValidationResult;

  /** 从格式错误的文本中提取工具调用 */
  private rescueParse(rawContent: string): ToolUseBlock[] | null;
}
```

**validate 逻辑：**
1. `toolCalls` 为 null 或空 → 尝试 rescueParse → 失败则返回 retry nudge
2. 遍历 toolCalls，检查 `!this.toolNames.has(tc.name)` → 返回 unknownTool nudge
3. 检查 `typeof tc.input !== 'object' || tc.input === null` → 返回 toolArgValidation nudge
4. 全部通过 → `needsRetry=false`

**rescueParse 逻辑（按优先级尝试）：**
1. 提取 markdown 代码块内容 `\`\`\`json\n...\n\`\`\`` → JSON.parse → 验证是否为 ToolUseBlock[]
2. 匹配 `[TOOL_CALLS]name{args}` 模式
3. 都失败 → 返回 null

更新 `src/guardrails/index.ts` 导出 ResponseValidator、ValidationResult。

运行：`npx vitest run tests/guardrails.test.ts`
预期：PASS

- [ ] **Commit**

```bash
git add src/guardrails/ tests/guardrails.test.ts
git commit -m "feat: add ResponseValidator with rescue parsing for malformed tool calls"
```

---

## 任务 4：GuardrailsMiddleware 门面

**文件：**
- 创建：`src/guardrails/middleware.ts`
- 测试：`tests/guardrails.test.ts`（追加 Middleware 部分）

- [ ] **编写测试并验证失败**

追加到 `tests/guardrails.test.ts` — GuardrailsMiddleware 部分：

**正常流程：**
- 合法工具调用 → `action === 'execute'`, `toolCalls` 不为空
- 执行成功后 `recordSuccess()` → 无异常

**重试流程：**
- 未知工具 → `action === 'tool_error'`, nudge 存在
- 连续 3 次 retry → 第 4 次 `action === 'fatal'`

**预算耗尽：**
- maxRetries=2：连续 2 次纯文本 → 第 3 次 `action === 'fatal'`, `reason` 包含 'retry'
- maxToolErrors=1：1 次未知工具 → 第 2 次 `action === 'fatal'`, `reason` 包含 'tool'

**recordSuccess 重置：**
- 1 次 retry → `recordSuccess()` → 再 1 次 retry → `retriesExhausted === false`（计数已重置）

运行：`npx vitest run tests/guardrails.test.ts`
预期：Middleware 测试 FAIL

- [ ] **实现功能并验证通过**

`src/guardrails/middleware.ts` 关键接口：

```typescript
export type CheckAction = "execute" | "retry" | "tool_error" | "fatal";

export interface CheckResult {
  action: CheckAction;
  toolCalls?: ToolUseBlock[];
  nudge?: Nudge;
  reason?: string;
}

export interface GuardrailsConfig {
  maxRetries?: number;       // 默认 3
  maxToolErrors?: number;    // 默认 2
  rescueEnabled?: boolean;   // 默认 true
}

export class GuardrailsMiddleware {
  private validator: ResponseValidator;
  private errorTracker: ErrorTracker;

  constructor(toolNames: string[], config?: GuardrailsConfig);

  check(toolCalls: ToolUseBlock[] | null, rawContent?: string): CheckResult;
  recordSuccess(): void;
  updateToolNames(toolNames: string[]): void;
}
```

**check 逻辑（参考 forge guardrails.py）：**
1. `this.validator.validate(toolCalls, rawContent)` → ValidationResult
2. 如果 `needsRetry`：
   - nudge.kind === ToolArgValidation → `errorTracker.recordToolError()`
   - 其他 → `errorTracker.recordRetry()`
   - 检查是否耗尽 → `action = 'fatal'`
   - 未耗尽 → action = 'tool_error'（nudge.kind 在 TOOL_ERROR_KINDS 中）或 'retry'
3. 如果不需要 retry → `action = 'execute'`, 重置 errorTracker

更新 `src/guardrails/index.ts` 导出全部公共 API。

运行：`npx vitest run tests/guardrails.test.ts`
预期：PASS

- [ ] **Commit**

```bash
git add src/guardrails/ tests/guardrails.test.ts
git commit -m "feat: add GuardrailsMiddleware facade combining validator and error tracker"
```

---

## 任务 5：CompactStrategy 接口 + 三种实现

**文件：**
- 创建：`src/context/strategy.ts`
- 创建：`src/context/index.ts`（初始导出）
- 测试：`tests/context-strategy.test.ts`

- [ ] **编写测试并验证失败**

`tests/context-strategy.test.ts`：

**NoCompact：**
- 传入任意 messages + budget → 返回相同 messages, `phase === 0`

**BasicCompact（当前逻辑的提取）：**
- 消息总 token < budget × 0.8 → `phase === 0`（不触发）
- 消息含长工具结果（>500 字符）+ token 超过阈值 → 工具结果被压缩为 `[Compressed: ...]`, `phase === 1`
- token 远超 budget → 消息被截断，`phase === 2`

**TieredCompact：**
- token < budget × 0.75 → `phase === 0`
- Phase 1 触发（≥75%）：nudge 消息被删除，长工具结果被截断为 2000 字符摘要 → `phase === 1`
- Phase 2 触发（≥85%）：工具执行结果被完全移除，工具调用保留 → `phase === 2`
- Phase 3 触发（≥95%）：只保留系统提示 + 用户原始输入 + 最近 2 轮 → `phase === 3`
- **始终保留**：第一条用户消息永远不会被删除

**构造 mock 消息的辅助方法：**
```typescript
function makeMessages(opts: {
  userText?: string;
  toolCalls?: { name: string; id: string }[];
  toolResults?: { id: string; content: string; isError?: boolean }[];
  assistantTexts?: string[];
  count?: number;  // 重复次数，用于构造长对话
}): Message[]
```

运行：`npx vitest run tests/context-strategy.test.ts`
预期：FAIL

- [ ] **实现功能并验证通过**

`src/context/strategy.ts` 关键接口：

```typescript
export interface CompactResult {
  messages: Message[];
  phase: number;  // 0=未压缩, 1=轻度, 2=中度, 3=重度
}

export interface CompactStrategy {
  compact(messages: Message[], budgetTokens: number): CompactResult;
}
```

**NoCompact：** 直接返回 `{ messages, phase: 0 }`。

**BasicCompact：** 将现有 `src/core/context.ts` 中的 `compressOldToolResults()` + `truncateMessages()` 逻辑提取到此。使用 `COMPACTABLE_TOOLS` 集合（file_read, bash, grep, glob）。`estimateMessagesTokens` 来自 `src/providers/base.ts`。

**TieredCompact：**

```typescript
export interface TieredCompactOptions {
  keepRecent?: number;  // 默认 2
  phaseThresholds?: [number, number, number];  // 默认 [0.75, 0.85, 0.95]
}

export class TieredCompact implements CompactStrategy {
  constructor(options?: TieredCompactOptions);
  compact(messages: Message[], budgetTokens: number): CompactResult;
}
```

三阶段逻辑：
1. 计算 `estimateMessagesTokens(messages)` 与 budget 比较
2. 找到 `eligibleEnd`（保留最近 keepRecent 轮的起始位置）
3. Phase 1：遍历 eligible 范围，删除 nudge 角色（`content` 含 guardrails 纠错标记的消息），截断 >2000 字符的工具结果
4. Phase 2：在 Phase 1 基础上，将 eligible 范围内的 `tool_result` 内容替换为 `[Result removed]`
5. Phase 3：只保留 messages[0]（用户原始输入）+ 最后 keepRecent × 2 条消息

`src/context/index.ts` 导出所有策略类和接口。

运行：`npx vitest run tests/context-strategy.test.ts`
预期：PASS

- [ ] **Commit**

```bash
git add src/context/ tests/context-strategy.test.ts
git commit -m "feat: add CompactStrategy interface with NoCompact, BasicCompact, TieredCompact"
```

---

## 任务 6：ContextManager 重构（策略注入）

**文件：**
- 创建：`src/context/manager.ts`
- 修改：`src/core/context.ts` → 删除（逻辑已迁移到 `src/context/`）
- 修改：`src/core/engine.ts` → 更新 import 路径
- 测试：`tests/context-strategy.test.ts`（追加 ContextManager 部分）

- [ ] **编写测试并验证失败**

追加到 `tests/context-strategy.test.ts` — ContextManager 部分：

- 默认构造（不传 strategy）→ 使用 BasicCompact，行为与旧 ContextManager 一致
- 注入 NoCompact → `compressIfNeeded()` 始终返回 `phase === 0`
- 注入 TieredCompact → 超过阈值时触发三阶段压缩
- `setStrategy()` 运行时切换策略：先用 NoCompact → 切换 TieredCompact → 再次压缩触发 Phase 1
- `add()` / `getMessages()` / `reset()` 接口与旧实现兼容
- import 路径从 `../src/core/context.js` 改为 `../src/context/manager.js`

运行：`npx vitest run tests/context-strategy.test.ts`
预期：ContextManager 测试 FAIL

- [ ] **实现功能并验证通过**

`src/context/manager.ts` — 保持与旧 ContextManager 相同的公共接口：

```typescript
export class ContextManager {
  private messages: Message[] = [];
  private strategy: CompactStrategy;
  private maxTokens: number;

  constructor(maxTokens?: number, config?: ContextConfig, strategy?: CompactStrategy) {
    this.maxTokens = maxTokens ?? DEFAULT_CONTEXT_WINDOW - DEFAULT_MAX_TOKENS;
    this.strategy = strategy ?? new BasicCompact(config);
  }

  add(message: Message): void;
  getMessages(): Message[];
  reset(): void;
  getLength(): number;
  compressIfNeeded(realInputTokens: number): CompactResult;
  setStrategy(strategy: CompactStrategy): void;
}
```

**compressIfNeeded 改动：**
旧版直接调用 `compressOldToolResults()` + `truncateMessages()`，新版委托给 `this.strategy.compact()`。
返回值从 `boolean` 改为 `CompactResult`（包含 phase 信息）。

**更新 `src/core/engine.ts` 的 import：**
- 旧：`import { ContextManager } from './context.js'`
- 新：`import { ContextManager } from '../context/manager.js'`

**删除 `src/core/context.ts`**（逻辑已完全迁移）。

**更新 `src/context/index.ts`** 导出 ContextManager。

运行：`npx vitest run tests/context-strategy.test.ts`
预期：PASS

同时确保现有测试不受影响：
运行：`npx vitest run tests/sdk.test.ts`
预期：PASS

- [ ] **Commit**

```bash
git add src/context/ src/core/engine.ts tests/context-strategy.test.ts
git rm src/core/context.ts
git commit -m "refactor: extract ContextManager with pluggable CompactStrategy"
```

---

## 任务 7：Engine 集成 Guardrails

**文件：**
- 修改：`src/core/engine.ts`
- 修改：`src/core/types.ts`
- 修改：`src/core/defaults.ts`
- 修改：`src/index.ts`
- 测试：`tests/guardrails.test.ts`（追加集成测试部分）

- [ ] **编写测试并验证失败**

追加到 `tests/guardrails.test.ts` — Engine 集成部分：

- Engine 构造时传入 `guardrailsConfig: { maxRetries: 2 }` → 不抛异常
- Engine 构造时不传 `guardrailsConfig` → 不抛异常（中间件为 null，跳过 guardrails）
- 使用 mock provider 验证：provider 返回未知工具名 → Engine 通过 guardrails 生成 nudge，provider 被再次调用（重试）

运行：`npx vitest run tests/guardrails.test.ts`
预期：集成测试 FAIL

- [ ] **实现功能并验证通过**

**`src/core/types.ts` 新增：**

```typescript
export interface GuardrailsConfig {
  maxRetries?: number;       // 默认 3
  maxToolErrors?: number;    // 默认 2
  rescueEnabled?: boolean;   // 默认 true
}
```

**`src/core/defaults.ts` 新增：**

```typescript
export const DEFAULT_GUARDRAILS_MAX_RETRIES = 3
export const DEFAULT_GUARDRAILS_MAX_TOOL_ERRORS = 2
export const DEFAULT_GUARDRAILS_RESCUE_ENABLED = true
```

**`src/core/engine.ts` 改动（约 20 行）：**

1. 新增 import：
```typescript
import { GuardrailsMiddleware } from '../guardrails/middleware.js'
import { NudgeKind } from '../guardrails/nudge.js'
```

2. EngineOptions 新增可选字段：
```typescript
guardrailsConfig?: GuardrailsConfig
```

3. Engine 构造函数中初始化中间件：
```typescript
this.guardrails = options.guardrailsConfig
  ? new GuardrailsMiddleware(Array.from(this.tools.keys()), options.guardrailsConfig)
  : null
```

4. `runStream()` 中，在 provider 返回 toolUses 后（约第 140 行之后），插入 guardrails check：

```typescript
// Guardrails check
if (this.guardrails && toolUses.length > 0) {
  const checkResult = this.guardrails.check(toolUses, responseText || undefined)
  if (checkResult.action === 'fatal') {
    yield { type: 'error', error: new Error(`Guardrails exhausted: ${checkResult.reason}`) }
    return
  }
  if (checkResult.action === 'retry' || checkResult.action === 'tool_error') {
    // 将 nudge 作为 user/tool_result 消息追加，继续循环
    const nudgeMsg = checkResult.nudge!.role === 'tool'
      ? toolResultMessage([{ type: 'tool_result', toolUseId: 'guardrails-nudge', content: checkResult.nudge!.content, isError: true }])
      : userMessage(checkResult.nudge!.content)
    this.context.add(nudgeMsg)
    continue
  }
  // action === 'execute': 使用 checkResult.toolCalls（可能经过 rescue 解析修正）
  if (checkResult.toolCalls) {
    toolUses.length = 0
    toolUses.push(...checkResult.toolCalls)
  }
  this.guardrails.recordSuccess()
}
```

**`src/index.ts` 新增导出：**
```typescript
export { GuardrailsMiddleware, GuardrailsConfig as GuardrailsConfigType } from './guardrails/index.js'
export { CompactStrategy, TieredCompact, BasicCompact, NoCompact } from './context/index.js'
export { ContextManager } from './context/manager.js'
```

运行：`npx vitest run tests/guardrails.test.ts`
预期：PASS

确保所有测试通过：
运行：`npx vitest run`
预期：ALL PASS

- [ ] **Commit**

```bash
git add src/ tests/
git commit -m "feat: integrate GuardrailsMiddleware into Engine loop with retry and rescue parsing"
```

---

## 任务 8：构建验证 + 最终检查

**文件：** 无新增

- [ ] **运行完整测试套件**

```bash
npx vitest run
```

预期：ALL PASS，所有测试文件通过

- [ ] **运行构建**

```bash
npm run build
```

预期：构建成功，无类型错误

- [ ] **运行类型检查**

```bash
npx tsc --noEmit
```

预期：无错误

- [ ] **最终 Commit**

如果有构建产物或类型修复：
```bash
git add -A
git commit -m "chore: fix build and type issues after guardrails integration"
```
