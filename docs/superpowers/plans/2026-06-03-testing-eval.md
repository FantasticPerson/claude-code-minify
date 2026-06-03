# 测试体系 + 评估基准 实现计划

> 使用 superpowers:subagent-driven-development 逐任务实现此计划。

**目标：** 完善单元测试覆盖核心模块 + 构建完整 eval harness
**架构：** 单元测试使用 MockProvider 隔离；eval harness 独立模块，复用 Engine + Tools
**技术栈：** TypeScript, Vitest, Zod

**分支：** `feat/guardrails-compression-adr`
**规格文档：** `docs/superpowers/specs/2026-06-03-testing-eval-design.md`

---

## 文件结构

```
新增文件：
  tests/engine.test.ts           # Engine 完整循环测试
  tests/providers.test.ts        # Provider 消息转换 + stream 测试
  tests/tools.test.ts            # bash/grep/glob/todo/ask-user 测试
  tests/system-prompt.test.ts    # System prompt 构建测试
  tests/skills-loader.test.ts    # Skill 加载/匹配测试
  tests/helpers/mock-provider.ts # MockProvider + 通用测试工具
  src/eval/types.ts              # Eval 接口定义
  src/eval/scenarios.ts          # 预置场景
  src/eval/runner.ts             # 执行引擎
  src/eval/metrics.ts            # 指标收集
  src/eval/report.ts             # 报告生成
  src/eval/cli.ts                # CLI 入口
  src/eval/index.ts              # 公共导出
```

---

## 任务 A1：MockProvider 测试基础设施

**文件：**
- 创建：`tests/helpers/mock-provider.ts`

- [ ] **实现并验证**

创建一个通用的 MockProvider，供所有 Engine/Provider 测试复用：

```typescript
import { ChatParams, StreamEvent, UsageInfo } from '../../src/core/types.js'

export interface MockResponse {
  text?: string;
  toolUses?: Array<{ id: string; name: string; input: Record<string, any> }>;
  usage?: UsageInfo;
}

export class MockProvider {
  private responses: MockResponse[];
  private callIndex = 0;
  public callCount = 0;
  public lastParams: ChatParams | null = null;

  constructor(responses: MockResponse[]) {
    this.responses = responses;
  }

  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
    this.callCount++;
    this.lastParams = params;
    const resp = this.responses[this.callIndex++] || { text: '' };
    // yield text_delta events
    // yield tool_use events
    // yield message_end event
  }
}
```

确保 MockProvider 的类型兼容 `LLMProvider` 接口。

运行：`npx vitest run tests/helpers/`
预期：无测试（纯工具文件），import 不报错即可

- [ ] **Commit**

```bash
git add tests/helpers/
git commit -m "test: add MockProvider helper for engine and provider tests"
```

---

## 任务 A2：Engine 完整循环测试

**文件：**
- 创建：`tests/engine.test.ts`

- [ ] **编写测试并验证失败，然后实现通过**

使用 MockProvider 测试 Engine 的完整循环：

1. **单轮文本响应** — MockProvider 返回纯文本 → Engine 返回 text，无 toolCalls
2. **单轮工具调用** — MockProvider 返回 file_read 调用 → Engine 执行工具 → 返回工具结果
3. **多轮工具调用** — MockProvider 第一次返回工具调用，第二次返回文本 → 完整两轮循环
4. **工具执行错误** — MockProvider 返回不存在的工具名 → Engine 标记 isError=true
5. **abort signal** — 创建 AbortController，立即 abort → yield error event
6. **filesWritten 追踪** — MockProvider 返回 file_write 调用 → filesWritten 包含文件路径
7. **context compression 触发** — 模拟高 token 使用 → compressIfNeeded 被调用
8. **stream events 顺序** — 验证 text/tool_start/tool_end/complete events 的产出顺序

**关键：** 测试需要创建真实的 Engine 实例（用 MockProvider），构造必要的 systemPromptOptions。

运行：`npx vitest run tests/engine.test.ts`
预期：PASS

- [ ] **Commit**

```bash
git add tests/engine.test.ts tests/helpers/
git commit -m "test: add Engine full loop tests with MockProvider"
```

---

## 任务 A3：Provider 消息转换测试

**文件：**
- 创建：`tests/providers.test.ts`

- [ ] **编写测试并验证失败，然后实现通过**

**OpenAI Provider (`src/providers/openai.ts`)：**

读取源码确认方法签名后，测试 `convertMessages` 私有/公共方法（如果不可访问则通过 chatStream 间接测试）：

1. user 消息 → OpenAI `{ role: 'user', content: '...' }` 格式
2. assistant + tool_use → OpenAI `{ role: 'assistant', tool_calls: [...] }` 格式
3. tool_result → OpenAI `{ role: 'tool', content: '...' }` 格式
4. stream 解析：模拟 OpenAI SSE chunks → 正确产出 text_delta + tool_use_end + message_end events

**Anthropic Provider (`src/providers/anthropic.ts`)：**

5. user 消息 → Anthropic `{ role: 'user', content: [...] }` 格式
6. assistant + tool_use → Anthropic `{ role: 'assistant', content: [{type:'tool_use',...}] }` 格式
7. stream 解析：模拟 Anthropic SSE events → 正确产出 StreamEvent

**实现方式：** 使用 nock（HTTP mock）或直接 mock fetch/httpClient 来拦截 API 请求，返回预设的 SSE 数据。

**如果没有 mock HTTP 库**，可以：
- 使用 vitest 的 `vi.spyOn` mock provider 内部的 http 请求方法
- 或者直接测试 `convertMessages` 方法（如果是公共的）

运行：`npx vitest run tests/providers.test.ts`
预期：PASS

- [ ] **Commit**

```bash
git add tests/providers.test.ts
git commit -m "test: add Provider message conversion and stream parsing tests"
```

---

## 任务 A4：工具测试（bash/grep/glob/todo/ask-user）

**文件：**
- 创建：`tests/tools.test.ts`

- [ ] **编写测试并验证失败，然后实现通过**

**bash：**
1. 执行 `echo hello` → 输出包含 "hello"，isError=false
2. 命令 `exit 1` → isError=true，包含 exit code
3. 超时命令（`sleep 10`，timeout=100ms）→ 超时错误

**grep：**
4. 搜索文件内容（先写文件，再 grep）→ 返回匹配行
5. 无匹配 → 返回无结果信息

**glob：**
6. 匹配已存在文件 → 返回文件列表
7. 无匹配 → 返回空数组

**todo-write：**
8. 写入任务列表 → 返回成功

**ask-user：**
9. 提问 → 返回问题内容

运行：`npx vitest run tests/tools.test.ts`
预期：PASS

- [ ] **Commit**

```bash
git add tests/tools.test.ts
git commit -m "test: add bash, grep, glob, todo-write, ask-user tool tests"
```

---

## 任务 A5：System Prompt + Skills Loader 测试

**文件：**
- 创建：`tests/system-prompt.test.ts`
- 创建：`tests/skills-loader.test.ts`

- [ ] **编写测试并验证失败，然后实现通过**

**system-prompt.test.ts（~8 tests）：**
1. 基础 prompt 生成 → 包含工具描述（如 "file_read"）
2. 自定义 instructions → prompt 包含自定义文本
3. mode='general' → prompt 包含通用对话模式描述
4. mode='coding' → prompt 包含编程助手描述
5. enabledTools 参数 → prompt 只列出启用的工具
6. 空 workingDir → 不崩溃

**skills-loader.test.ts（~8 tests）：**
7. 加载内置 skills → brainstorming/debugging 在列表中
8. 自定义 skill 目录 → 加载 .md 文件
9. 无 skill 目录 → 返回空列表或只有内置 skills
10. skill 名称匹配 → getAllSkills 返回的对象有 name/description/content

运行：`npx vitest run tests/system-prompt.test.ts tests/skills-loader.test.ts`
预期：PASS

- [ ] **Commit**

```bash
git add tests/system-prompt.test.ts tests/skills-loader.test.ts
git commit -m "test: add system prompt builder and skills loader tests"
```

---

## 任务 B1：Eval 类型定义 + 预置场景

**文件：**
- 创建：`src/eval/types.ts`
- 创建：`src/eval/scenarios.ts`

- [ ] **编写测试并验证失败，然后实现通过**

**`src/eval/types.ts`：**

```typescript
export interface EvalToolDef {
  name: string;
  description: string;
  handler: (args: any) => string | Promise<string>;
  parameterSchema: Record<string, any>;
}

export interface EvalScenario {
  name: string;
  description: string;
  tags: string[];
  tools: EvalToolDef[];
  userMessage: string;
  validate: (calls: Array<{ name: string; input: any; output: string }>) => boolean;
  maxRounds?: number;
  expectCompletion?: boolean;
}

export interface EvalRunResult {
  scenario: string;
  pass: boolean;
  toolRounds: number;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  error?: string;
  toolCalls: Array<{ name: string; input: any; output: string }>;
}

export interface ScenarioMetrics {
  name: string;
  totalRuns: number;
  passRate: number;
  avgToolRounds: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgElapsedMs: number;
  errors: number;
}

export interface EvalConfig {
  runsPerScenario?: number;
  verbose?: boolean;
  outputFormat?: 'table' | 'jsonl' | 'both';
  outputPath?: string;
}
```

**`src/eval/scenarios.ts`：** 10-12 个预置场景，使用 mock tools（不需要真实 LLM 即可验证场景定义正确）：

| 名称 | 类别 | 验证点 |
|------|------|--------|
| `single_tool_call` | plumbing | 调用了正确的工具 |
| `two_step_sequential` | plumbing | 依次调用两个工具 |
| `correct_arguments` | plumbing | 参数值正确传递 |
| `guardrails_unknown_tool` | resilience | 拦截未知工具名 |
| `guardrails_bad_args` | resilience | 拦截错误参数格式 |
| `guardrails_retry_exhaust` | resilience | retry 预算耗尽 |
| `context_no_compress` | context | 短对话不触发压缩 |
| `context_phase1` | context | 长对话触发 Phase 1 |
| `conditional_branch` | multi-step | 根据结果选择分支 |
| `parallel_tools` | multi-step | 同时调用多个工具 |

每个场景定义 mock tool handler（返回预设值）+ validate 函数。

运行：`npx vitest run`（确保不破坏现有测试）
预期：ALL PASS

- [ ] **Commit**

```bash
git add src/eval/
git commit -m "feat: add eval types and preset scenarios"
```

---

## 任务 B2：EvalRunner 执行引擎

**文件：**
- 创建：`src/eval/runner.ts`

- [ ] **实现并验证**

```typescript
export class EvalRunner {
  constructor(private config?: EvalConfig) {}

  /** 运行单个场景一次 */
  async runOnce(scenario: EvalScenario, provider?: LLMProvider): Promise<EvalRunResult>;

  /** 运行单个场景 N 次 */
  async runScenario(scenario: EvalScenario, runs: number, provider?: LLMProvider): Promise<ScenarioMetrics>;

  /** 运行所有场景 */
  async runAll(scenarios: EvalScenario[], runs: number, provider?: LLMProvider): Promise<ScenarioMetrics[]>;
}
```

**runOnce 逻辑：**
1. 将 EvalScenario.tools 转换为 ToolSpec Map（用 handler 作为 execute）
2. 创建 Engine（用传入的 provider 或默认 mock provider）
3. 调用 `engine.run(scenario.userMessage)`
4. 用 `scenario.validate(result.toolCalls)` 判断 pass/fail
5. 收集 metrics（toolRounds, tokens, elapsed）
6. 返回 EvalRunResult

**runScenario 逻辑：**
- 循环 runs 次 runOnce
- 聚合为 ScenarioMetrics（passRate, avg*）

**runAll 逻辑：**
- 遍历 scenarios，逐个 runScenario
- 返回 ScenarioMetrics[]

运行：`npx vitest run`
预期：ALL PASS

- [ ] **Commit**

```bash
git add src/eval/runner.ts
git commit -m "feat: add EvalRunner execution engine"
```

---

## 任务 B3：指标收集 + 报告生成

**文件：**
- 创建：`src/eval/metrics.ts`
- 创建：`src/eval/report.ts`

- [ ] **实现并验证**

**metrics.ts：**
```typescript
/** 聚合多次运行结果为 ScenarioMetrics */
export function aggregateMetrics(results: EvalRunResult[]): ScenarioMetrics;
```

**report.ts：**
```typescript
/** 生成 ASCII 表格 */
export function formatTable(metrics: ScenarioMetrics[]): string;

/** 输出 JSONL 行 */
export function formatJsonl(results: EvalRunResult[]): string;

/** 打印到控制台 */
export function printReport(metrics: ScenarioMetrics[], config?: EvalConfig): void;
```

ASCII 表格格式：
```
┌─────────────────────────┬──────┬─────────┬─────────┬──────────┐
│ Scenario                │ Runs │ Pass%   │ AvgRnd  │ AvgTok   │
├─────────────────────────┼──────┼─────────┼─────────┼──────────┤
│ single_tool_call        │    3 │ 100.0%  │   1.0   │    150   │
│ two_step_sequential     │    3 │  66.7%  │   2.3   │    420   │
│ guardrails_unknown_tool │    3 │ 100.0%  │   2.0   │    280   │
└─────────────────────────┴──────┴─────────┴─────────┴──────────┘
```

运行：`npx vitest run`
预期：ALL PASS

- [ ] **Commit**

```bash
git add src/eval/metrics.ts src/eval/report.ts
git commit -m "feat: add eval metrics aggregation and ASCII/JSONL report generation"
```

---

## 任务 B4：CLI 入口 + 公共导出 + 最终验证

**文件：**
- 创建：`src/eval/cli.ts`
- 创建：`src/eval/index.ts`
- 修改：`package.json`（添加 eval script）

- [ ] **实现并验证**

**cli.ts：** 简单的 CLI 入口，解析参数并执行 eval：

```typescript
// npx tsx src/eval/cli.ts --runs 3 --format table
const args = process.argv.slice(2);
// 解析 --runs, --format, --output, --scenario
// 加载场景 → 创建 EvalRunner → 运行 → 打印报告
```

**package.json 新增 script：**
```json
{
  "scripts": {
    "eval": "tsx src/eval/cli.ts",
    "eval:verbose": "tsx src/eval/cli.ts --verbose"
  }
}
```

**index.ts：** 导出所有 eval 公共 API。

**最终验证：**
```bash
npx vitest run          # 全部测试通过
npx tsc --noEmit        # 类型检查通过
npm run build           # 构建成功
npm run eval -- --runs 1  # eval CLI 可运行
```

- [ ] **Commit**

```bash
git add src/eval/ package.json
git commit -m "feat: add eval CLI and public exports"
```

---

## 任务 A6：最终验证

- [ ] **运行完整测试套件**
```bash
npx vitest run
```
预期：ALL PASS（目标 120+ tests）

- [ ] **运行构建**
```bash
npm run build
```
预期：成功

- [ ] **运行类型检查**
```bash
npx tsc --noEmit
```
预期：无错误
