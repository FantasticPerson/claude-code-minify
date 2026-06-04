# 第一批任务设计：Guardrails + 分级压缩 + ADR

> 状态：已批准
> 日期：2026-06-03
> 分支：feat/guardrails-compression-adr
> 借鉴项目：forge (https://github.com/antoinezambelli/forge)

## 背景

claude-code-minify 是从 Claude Code CLI v2.1.88 提取的轻量 SDK，保留了核心 AI 编程助手能力。当前存在以下不足：

1. **Engine 对话循环缺少防护** — provider 返回格式错误时直接崩溃或静默失败
2. **上下文压缩过于简单** — 只有截断 + 工具结果压缩，无法智能保留推理过程
3. **缺乏设计决策记录** — 关键架构选择没有文档化

通过研究 forge 项目的 guardrails 系统和分级压缩策略，提取适用于 TypeScript SDK 的设计模式。

## 范围

本规格覆盖第一批三个任务：
- **Task 1**: ADR 架构决策记录（3 份）
- **Task 2**: Guardrails 错误防护中间件
- **Task 3**: 分级上下文压缩（策略模式）

第二批任务（测试体系 + 评估基准）将在第一批完成后另行规格化。

---

## Task 1: ADR 架构决策记录

### 目标

为关键设计选择建立不可逆决策记录，格式遵循 forge 的 ADR 规范。

### 交付物

3 份 ADR 文档，存放在 `docs/decisions/` 目录：

| ADR | 标题 | 核心决策 |
|-----|------|----------|
| 001 | Guardrails 作为独立中间件层 | 选择中间件模式而非集成到 Engine 内部 |
| 002 | 分级上下文压缩策略 | 引入 TieredCompact 三阶段渐进压缩 |
| 003 | 可插拔压缩策略接口 | 用策略模式替代直接替换现有压缩逻辑 |

### ADR 格式

每份文档包含：

```
# ADR-NNN: 标题

**状态**: 已接受 / 已提议 / 已废弃 / 已替代
**日期**: YYYY-MM-DD
**上下文**: 为什么需要做这个决策
**决策**: 我们选择了什么，以及为什么
**后果**: 这个决策带来的正面和负面影响
```

---

## Task 2: Guardrails 错误防护中间件

### 设计目标

在 Engine 的 provider 调用外层包裹独立中间件，负责拦截、验证、修正 provider 返回的工具调用。Engine 本身的循环逻辑不变。

### 数据流

```
Engine.runStream() 循环:
  1. 调用 provider.chatStream()
  2. 收到 provider response
  3. → GuardrailsMiddleware.check(response, availableTools)
  4. ← CheckResult { action, toolCalls?, nudge? }
  5. 根据 action 分流:
     - "execute"   → 正常执行工具
     - "retry"     → 将 nudge 消息追加到历史，重新调用 provider
     - "tool_error"→ 将 nudge 作为工具错误反馈，重新调用 provider
     - "fatal"     → 抛出 GuardrailsExhaustedError
  6. 工具执行成功 → GuardrailsMiddleware.record(toolName)
```

### 新增文件结构

```
src/guardrails/
  index.ts              # 公共导出
  validator.ts          # ResponseValidator
  error-tracker.ts      # ErrorTracker
  nudge.ts              # Nudge 数据结构
  middleware.ts         # GuardrailsMiddleware（门面）
  nudge-templates.ts    # 纠错提示模板
```

### 核心类设计

#### Nudge（不可变纠错消息）

```typescript
// src/guardrails/nudge.ts

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

#### ResponseValidator（响应校验 + 救援解析）

```typescript
// src/guardrails/validator.ts

export interface ValidationResult {
  toolCalls: ToolCall[] | null;
  nudge: Nudge | null;
  needsRetry: boolean;
}

export class ResponseValidator {
  private toolNames: Set<string>;

  constructor(toolNames: string[], private rescueEnabled = true) {
    this.toolNames = new Set(toolNames);
  }

  /**
   * 校验 provider 返回的工具调用：
   * 1. 如果是纯文本响应且 rescueEnabled，尝试 rescue 解析
   * 2. 检查工具名是否在已知列表中
   * 3. 检查参数是否为合法 object
   */
  validate(toolCalls: ToolCall[] | null, rawContent?: string): ValidationResult;

  /**
   * Rescue 解析 — 处理三种常见格式错误：
   * 1. JSON 包在 markdown 代码块中 (```json ... ```)
   * 2. [TOOL_CALLS]name{args} 格式（Mistral 系列）
   * 3. ``` ... ``` XML 格式（Qwen 系列）
   */
  private rescueParse(rawContent: string): ToolCall[] | null;
}
```

#### ErrorTracker（错误预算管理）

```typescript
// src/guardrails/error-tracker.ts

export class ErrorTracker {
  private consecutiveRetries = 0;
  private consecutiveToolErrors = 0;

  constructor(
    public readonly maxRetries = 3,
    public readonly maxToolErrors = 2,
  ) {}

  recordRetry(): void;
  recordToolError(): void;
  reset(): void;

  get retriesExhausted(): boolean;
  get toolErrorsExhausted(): boolean;
}
```

#### GuardrailsMiddleware（门面）

```typescript
// src/guardrails/middleware.ts

export type CheckAction = "execute" | "retry" | "tool_error" | "fatal";

export interface CheckResult {
  action: CheckAction;
  toolCalls?: ToolCall[];
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

  /**
   * 核心方法 — 校验 provider 返回
   * 流程：validator.validate() → 检查预算 → 返回 CheckResult
   */
  check(toolCalls: ToolCall[] | null, rawContent?: string): CheckResult;

  /**
   * 记录成功执行，重置错误计数
   */
  recordSuccess(): void;

  /**
   * 更新可用工具列表（工具动态注册/注销时使用）
   */
  updateToolNames(toolNames: string[]): void;
}
```

### Nudge 模板

```typescript
// src/guardrails/nudge-templates.ts

export const NudgeTemplates = {
  /** 纯文本响应时 — 要求重新生成工具调用 */
  retry(rawResponse: string): string,

  /** 工具名不存在时 — 提示可用工具列表 */
  unknownTool(attempted: string, available: string[]): string,

  /** 工具参数格式错误时 — 要求修正参数结构 */
  toolArgValidation(toolName: string, gotArgs: unknown): string,
};
```

### Engine 集成改动

修改 `src/core/engine.ts` 的 `runStream()` 方法，改动约 15-20 行：

```typescript
// 在 provider 返回后插入 guardrails 检查
const checkResult = this.guardrails.check(toolCalls, rawContent);

switch (checkResult.action) {
  case "execute":
    // 正常路径：执行工具
    break;
  case "retry":
  case "tool_error":
    // 将 nudge 消息追加到历史，继续循环
    this.messages.push(/* nudge message */);
    continue;
  case "fatal":
    throw new GuardrailsExhaustedError(checkResult.reason);
}
```

GuardrailsMiddleware 通过构造函数注入 Engine，可选（传 null 或 undefined 则跳过 guardrails）。

---

## Task 3: 分级上下文压缩

### 设计目标

将现有 `src/core/context.ts` 的压缩逻辑抽象为 `CompactStrategy` 接口，保留当前逻辑作为 `BasicCompact` 策略，新增 `TieredCompact` 三阶段渐进压缩。

### 策略接口

```typescript
// src/context/strategy.ts

export interface CompactResult {
  messages: Message[];
  /** 0 = 未压缩, 1 = 轻度, 2 = 中度, 3 = 重度 */
  phase: number;
}

export interface CompactStrategy {
  /**
   * 压缩消息列表以适应 token 预算
   * @param messages 当前消息列表
   * @param budgetTokens token 预算上限
   * @returns 压缩后的消息列表和达到的阶段
   */
  compact(messages: Message[], budgetTokens: number): CompactResult;
}
```

### 三种实现

#### NoCompact（调试用）

不做任何压缩，直接返回原始消息。`phase` 始终为 0。

#### BasicCompact（当前逻辑）

将现有 `context.ts` 中的 `compressOldToolResults()` 和 `truncateMessages()` 提取到此类。行为与当前完全一致。

#### TieredCompact（三阶段分级压缩）

```typescript
// src/context/strategy.ts

export interface TieredCompactOptions {
  /** 保留最近 N 轮迭代（默认 2） */
  keepRecent?: number;
  /** 触发压缩的 token 占比阈值 [轻度, 中度, 重度]（默认 [0.75, 0.85, 0.95]） */
  phaseThresholds?: [number, number, number];
}

export class TieredCompact implements CompactStrategy {
  constructor(options?: TieredCompactOptions);
  compact(messages: Message[], budgetTokens: number): CompactResult;
}
```

**三阶段压缩逻辑：**

```
Phase 1（轻度, ≥75% 预算）:
  - 删除所有 nudge 消息（guardrails 纠错消息）
  - 截断超过 2000 字符的工具结果为摘要
  → 不够？进入 Phase 2

Phase 2（中度, ≥85% 预算）:
  - 完全移除工具执行结果
  - 保留工具调用本身（让模型知道调用过什么）
  → 不够？进入 Phase 3

Phase 3（重度, ≥95% 预算）:
  - 只保留：系统提示 + 用户原始输入 + 最近 2 轮工具调用
  - 移除所有中间推理和文本响应
```

**始终保留的消息：**
- 系统提示（第一条）
- 用户原始输入（不可压缩）
- 最近的 `keepRecent` 轮迭代

### ContextManager 重构

```typescript
// src/context/manager.ts（重构后）

export class ContextManager {
  private strategy: CompactStrategy;

  constructor(
    /** token 预算上限 */
    public budgetTokens: number,
    /** 压缩策略，默认 BasicCompact */
    strategy?: CompactStrategy,
  ) {
    this.strategy = strategy ?? new BasicCompact();
  }

  /** 添加消息到历史 */
  add(message: Message): void;

  /** 获取当前消息列表 */
  getMessages(): Message[];

  /** 检查是否需要压缩，如果需要则执行 */
  compressIfNeeded(): CompactResult;

  /** 切换压缩策略 */
  setStrategy(strategy: CompactStrategy): void;
}
```

**与现有 context.ts 的兼容性：** 保持 `add()`、`getMessages()`、`compressIfNeeded()` 三个公共方法签名不变。现有调用点无需修改。

### 新增文件结构

```
src/context/
  index.ts      # 公共导出
  strategy.ts   # CompactStrategy 接口 + NoCompact + BasicCompact + TieredCompact
  manager.ts    # 重构后的 ContextManager
```

---

## 对现有代码的改动范围

| 文件 | 改动类型 | 改动量 | 说明 |
|------|----------|--------|------|
| `src/core/engine.ts` | 小幅修改 | ~20 行 | 在 provider 返回后插入 guardrails check |
| `src/core/context.ts` | 重构 → 拆分 | 移动代码 | 压缩逻辑提取到 strategy.ts，manager.ts 保留管理逻辑 |
| `src/core/types.ts` | 可选新增 | ~5 行 | Guardrails 相关类型（也可放在 guardrails 模块内） |
| `src/guardrails/*` | 新增 | ~250 行 | 6 个新文件 |
| `src/context/*` | 新增/重构 | ~200 行 | strategy + 重构后的 manager |
| `docs/decisions/*` | 新增 | ~150 行 | 3 份 ADR |

**总计新增/修改约 600 行代码 + 150 行文档。**

---

## 不做的事

以下明确不在本批次范围内：

- ❌ 不改变 Engine 的整体循环结构
- ❌ 不引入 step enforcement / required_steps（属于 forge 的工作流概念，SDK 场景不需要）
- ❌ 不添加 proxy 模式
- ❌ 不改变 Provider 接口
- ❌ 不修改工具系统的接口
- ❌ 不引入 slot worker 或优先级队列
- ❌ 第二批任务（测试体系 + 评估基准）另行规格化
