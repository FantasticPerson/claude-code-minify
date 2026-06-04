# ADR-001: Guardrails 作为独立中间件层

**状态**: 已接受
**日期**: 2026-06-03

## 上下文

当前 engine.ts 的对话循环在收到 provider 返回后直接解析工具调用并执行。当 provider（尤其是本地小模型）返回格式错误的工具调用时，会导致：

1. 解析失败直接抛异常，用户看到不可理解的错误
2. 工具名拼写错误导致调用不存在的工具
3. 参数格式错误（如 args 为字符串而非 object）导致工具执行失败

我们需要在这些错误到达工具执行层之前拦截并修正。

## 决策

采用**独立中间件层**模式，而非将防护逻辑集成到 Engine 内部。

具体做法：
- 新建 `src/guardrails/` 模块，包含 ResponseValidator、ErrorTracker、Nudge 等组件
- GuardrailsMiddleware 通过构造函数注入 Engine
- Engine 在 provider 返回后调用 `middleware.check()`，根据返回的 CheckResult 分流
- 中间件是可选的 — 不传则跳过所有 guardrails

### 考虑过的替代方案

**方案 A：集成到 Engine 内部**
- 将校验逻辑直接写在 engine.ts 的循环中
- 优点：代码更紧凑，无需额外抽象
- 缺点：Engine 承担过多职责，难以单独测试，修改校验逻辑需要改 Engine

**方案 B：管道式插件架构**
- 每个校验环节作为独立插件，通过管道组合
- 优点：最灵活，可动态增减校验环节
- 缺点：过度工程化，当前只有 3 种校验场景不需要这种复杂度

**选择中间件层的原因：**
- Engine 保持简洁（单一职责：循环调度）
- Guardrails 可以独立测试（不依赖 Engine）
- 可以在不同场景复用（SDK 模式、未来 proxy 模式）
- 复杂度适中 — 不像管道那样过度抽象

## 后果

**正面：**
- Engine 逻辑不变，改动风险低
- Guardrails 可独立迭代和测试
- 未来可用于其他集成模式（如 proxy）

**负面：**
- 新增 6 个文件和约 250 行代码
- Engine 构造需要额外传入 middleware（可选参数）
- 需要文档说明中间件的工作原理
