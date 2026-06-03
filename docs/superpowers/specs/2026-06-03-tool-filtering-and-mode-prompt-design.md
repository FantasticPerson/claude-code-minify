# 工具过滤与场景化 Prompt 设计

## 概述

为 ClaudeSDK 添加两个能力：
1. **工具过滤** — 通过黑名单禁用内置工具
2. **场景化 Prompt** — 根据 `mode` 切换核心系统提示词

## 需求

- `createBuiltinTools()` 允许通过配置禁用指定工具
- `getCorePrompt()` 按场景切换 prompt，`coding` 模式保持现有行为，`general` 模式提供通用对话 prompt
- 工具列表描述（Available tools 段）与实际注册的工具保持同步
- 完全向后兼容，所有新字段可选

## 设计

### 方案：扩展现有配置

在现有 `ToolsConfig` / `ClaudeSDKConfig` / `SystemPromptOptions` 上扩展，不改架构。

### 类型变更

**`ToolsConfig`** — 新增 `disabled`:
```typescript
export interface ToolsConfig {
  disabled?: string[]  // 如 ['bash', 'file_edit']
  // ... 其余不变
}
```

**`ClaudeSDKConfig`** — 新增 `mode`:
```typescript
export interface ClaudeSDKConfig {
  mode?: 'coding' | 'general'  // 默认 'coding'
  // ... 其余不变
}
```

**`SystemPromptOptions`** — 新增 `mode` + `enabledTools`:
```typescript
export interface SystemPromptOptions {
  // ... 现有字段
  mode?: 'coding' | 'general'
  enabledTools?: string[]
}
```

### createBuiltinTools() 改造

接收 `disabled` 参数，过滤注册：

```typescript
export function createBuiltinTools(disabled: string[] = []): Map<string, ToolSpec> {
  const allTools = [fileReadTool, fileWriteTool, fileEditTool, bashTool,
    grepTool, globTool, todoWriteTool, askUserTool]
  const tools = new Map<string, ToolSpec>()
  for (const tool of allTools) {
    if (!disabled.includes(tool.name)) registerTool(tools, tool)
  }
  return tools
}
```

### ClaudeSDK 构造函数

`general` 模式默认只保留 `file_read` 和 `ask_user`：

```typescript
const isGeneralMode = this.config.mode === 'general'
const disabled = this.config.tools?.disabled ?? (
  isGeneralMode ? ['file_write', 'file_edit', 'bash', 'grep', 'glob', 'todo_write'] : []
)
this.tools = createBuiltinTools(disabled)
```

### getCorePrompt() 改造

根据 `mode` 切换 prompt，`enabledTools` 动态生成 Available tools 段：

- `coding` 模式：现有的软件开发助手 prompt
- `general` 模式：通用对话 prompt（无代码编辑相关指引）

工具描述从硬编码改为 `TOOL_DESCRIPTIONS` 映射表，只列出实际注册的工具。

### createEngine() 串联

```typescript
systemPromptOptions: {
  // ... 现有
  mode: this.config.mode,
  enabledTools: Array.from(this.tools.keys()),
}
```

## 改动范围

| 文件 | 改动 |
|------|------|
| `src/core/types.ts` | `ToolsConfig.disabled`, `ClaudeSDKConfig.mode` |
| `src/tools/index.ts` | `createBuiltinTools(disabled)` |
| `src/core/system-prompt.ts` | `SystemPromptOptions` 扩展, `getCorePrompt()` 按模式切换 |
| `src/index.ts` | 构造函数 general 默认禁用, `createEngine()` 传参 |

## 向后兼容

所有新字段可选，默认值保持 `coding` 模式的完整行为。
