# 第二批任务设计：测试体系 + 评估基准

> 状态：已批准
> 日期：2026-06-03
> 分支：feat/guardrails-compression-adr
> 前置：第一批任务已完成（Guardrails + 分级压缩 + ADR）

## 范围

- **Task A**: 完善单元测试（~80 个测试，覆盖 Engine、Providers、Tools、SystemPrompt、Skills）
- **Task B**: 完整 eval harness（场景定义、执行引擎、指标收集、报告生成、CLI）

---

## Task A: 完善单元测试

### 新增测试文件

#### tests/engine.test.ts (~15 tests)

使用 MockProvider 测试 Engine 的完整循环：

```typescript
// MockProvider 实现
class MockProvider implements LLMProvider {
  constructor(private responses: ChatResponse[]) { ... }
  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> { ... }
}
```

**测试场景：**
- 单轮文本响应 → Engine 返回 text，无 toolCalls
- 单轮工具调用 → Engine 执行工具，返回结果
- 多轮工具调用（mock provider 第一次返回工具调用，第二次返回文本）→ 完整循环
- abort signal 中断 → yield error event
- 工具执行错误 → isError=true，继续循环
- 空工具结果 → 正常处理
- file_write/file_edit → filesWritten 追踪

#### tests/providers.test.ts (~20 tests)

**OpenAI Provider：**
- 消息转换：user/assistant/tool_use/tool_result → OpenAI 格式
- Tool definition 转换
- Stream 解析：text_delta + tool_use chunks
- 无工具调用的纯文本响应

**Anthropic Provider：**
- 消息转换：user/assistant/tool_use/tool_result → Anthropic 格式
- Tool schema 转换
- Stream 解析：message_start + content_block_delta + message_end

**注意：** Provider 测试不调用真实 API，使用 nock 或简单的 mock 拦截 HTTP 请求。

#### tests/tools.test.ts (~25 tests)

**bash:**
- 成功执行命令 → 返回 stdout
- 命令超时 → 返回错误信息
- 输出截断 → 超过阈值时截断
- exit code 非零 → isError=true

**grep:**
- 搜索文件内容 → 返回匹配行
- 无匹配 → 返回空结果
- 不存在的路径 → 错误

**glob:**
- 匹配文件 → 返回文件列表
- 无匹配 → 返回空数组
- 结果数量限制 → 超过 maxResults 截断

**todo-write：**
- 写入任务列表 → 返回成功

**ask-user：**
- 提问 → 返回问题内容

#### tests/system-prompt.test.ts (~8 tests)

- 基础 prompt 生成 → 包含工具描述
- 自定义 instructions → 包含在 prompt 中
- CLAUDE.md 内容 → 包含在 prompt 中
- mode='general' → 不同的核心 prompt
- 空 options → 不崩溃

#### tests/skills-loader.test.ts (~8 tests)

- 加载内置 skills → 返回列表
- 自定义 skill 目录 → 加载 .md 文件
- Frontmatter 解析 → name/description/triggers
- 触发模式匹配 → 正确匹配/不匹配

---

## Task B: 评估基准 (Eval Harness)

### 文件结构

```
src/eval/
  types.ts           # EvalScenario, EvalResult, EvalMetrics 接口
  scenarios.ts        # 预置场景定义（10-15 个）
  runner.ts           # EvalRunner 执行引擎
  metrics.ts          # 指标收集和聚合
  report.ts           # ASCII 表格 + JSONL 报告
  cli.ts              # CLI 入口（npx eval 或 npm run eval）
  index.ts            # 公共导出
```

### 场景定义格式

```typescript
interface EvalScenario {
  name: string;
  description: string;
  tags: string[];
  tools: EvalToolDef[];
  userMessage: string;
  /** 验证工具调用是否正确 */
  validate: (calls: ToolCallRecord[]) => boolean;
  /** 最大工具轮数 */
  maxRounds?: number;
  /** 预期完成（调用 terminal tool） */
  expectCompletion?: boolean;
}

interface EvalToolDef {
  name: string;
  description: string;
  /** Mock 实现 — 返回预设结果 */
  handler: (args: any) => string | Promise<string>;
  parameterSchema: Record<string, any>;
}
```

### 预置场景（10-15 个）

| 类别 | 场景 | 验证点 |
|------|------|--------|
| plumbing | 单工具调用 | 模型正确选择并调用工具 |
| plumbing | 顺序两步 | 先 A 后 B |
| plumbing | 参数准确性 | 传递正确的参数值 |
| resilience | 未知工具名 | Guardrails 拦截并重试 |
| resilience | 格式错误参数 | Guardrails 救援解析 |
| resilience | 重试耗尽 | fatal 错误正确处理 |
| context | 短对话压缩 | 不触发压缩 |
| context | 长对话压缩 | 触发 Phase 1/2 |
| multi-step | 条件分支 | 根据工具结果决定下一步 |
| multi-step | 并行工具调用 | 同时调用多个工具 |

### EvalRunner

```typescript
class EvalRunner {
  constructor(private provider: LLMProvider, private config?: EvalConfig) {}

  /** 运行单个场景 N 次 */
  async runScenario(scenario: EvalScenario, runs: number): Promise<ScenarioMetrics>;

  /** 运行所有场景 */
  async runAll(scenarios: EvalScenario[], runs: number): Promise<EvalReport>;

  /** 生成报告 */
  generateReport(results: ScenarioMetrics[]): string;  // ASCII table
}

interface EvalConfig {
  runsPerScenario?: number;  // 默认 3
  verbose?: boolean;
  outputFormat?: 'table' | 'jsonl' | 'both';
  outputPath?: string;
}

interface ScenarioMetrics {
  name: string;
  totalRuns: number;
  completedRuns: number;
  completionRate: number;
  avgToolRounds: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  errorCount: number;
  avgElapsedMs: number;
}
```

### CLI

```bash
# 运行所有场景
npx tsx src/eval/cli.ts --runs 3

# 运行特定场景
npx tsx src/eval/cli.ts --scenario basic_single_tool --runs 10

# 输出 JSONL
npx tsx src/eval/cli.ts --format jsonl --output eval_results.jsonl

# 指定 provider
npx tsx src/eval/cli.ts --provider anthropic --api-key $ANTHROPIC_API_KEY
```

### 不做的事

- ❌ 不做 HTML dashboard（后续迭代）
- ❌ 不做 ablation 系统（后续迭代）
- ❌ 不做批量配置（后续迭代）
- ❌ 不依赖真实 LLM（场景使用 mock，但也支持真实 provider）
