# ADR-003: 可插拔压缩策略接口

**状态**: 已接受
**日期**: 2026-06-03

## 上下文

现有的 context.ts 包含固定的压缩逻辑（工具结果压缩 + 消息截断）。我们希望引入新的 TieredCompact 策略，但面临选择：

1. 直接替换现有逻辑
2. 用策略模式让两者共存、可选切换

## 决策

采用**策略模式（Strategy Pattern）**，定义 `CompactStrategy` 接口，将现有逻辑提取为 `BasicCompact` 实现。

```typescript
interface CompactStrategy {
  compact(messages: Message[], budgetTokens: number): CompactResult;
}
```

ContextManager 通过构造函数接受 CompactStrategy，默认使用 BasicCompact（保持现有行为）。

### 三种内置策略

| 策略 | 用途 | 备注 |
|------|------|------|
| `NoCompact` | 调试 | 不做任何压缩 |
| `BasicCompact` | 简单对话 | 当前逻辑，默认策略 |
| `TieredCompact` | 长对话/复杂工作流 | 三阶段分级压缩 |

### 考虑过的替代方案

**方案 A：直接替换**
- 删除现有压缩逻辑，全部换成 TieredCompact
- 优点：代码更简洁，只有一个实现
- 缺点：破坏性变更，现有用户的行为会改变；无法在简单场景使用更轻量的策略

**方案 B：配置开关**
- 在 ContextManager 中添加 if/else 分支
- 优点：不需要接口抽象
- 缺点：违反开闭原则，每加一个策略就要改 ContextManager

**选择策略模式的原因：**
- 保持向后兼容 — 默认行为不变
- 用户可以按需选择策略
- 遵循开闭原则 — 新策略无需改 ContextManager
- 便于测试 — 可以 mock CompactStrategy

## 后果

**正面：**
- 完全向后兼容，默认使用 BasicCompact
- 用户可以根据场景选择最优策略
- 新增策略不影响现有代码
- 便于测试 — mock 策略即可隔离测试 ContextManager

**负面：**
- 新增接口和 3 个实现类
- ContextManager 需要重构（拆分为 manager.ts + strategy.ts）
- 用户需要理解策略的概念（但默认行为不变）
