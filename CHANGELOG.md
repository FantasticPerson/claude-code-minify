# Changelog

本项目所有重要变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增
- **`tools.wrapExecute` 工具执行拦截器** —— 注册时对任意工具的 `execute` 包一层（审计/日志/限流），用户 wrap 叠加在内置 wrap 之外
- **`file_edit`/`file_write` 进程内文件级互斥锁** —— 同进程内并发多个 `chat()`/`Session` 时，对同一文件的读写自动串行化（不同文件仍并行），作为 `wrapExecute` 的首个内置用例
- 导出 `ToolExecute` 类型

### 修复
- 多实例并发写同一文件时 `file_edit` 丢更新（read-modify-write 竞态：A 读旧→B 读旧→A 写→B 写 覆盖 A）

## [1.2.0] - 2026-06-16

### 新增

- **会话中断能力** —— 可中断进行中的对话轮次，信号一路透传到 Provider（断开流式 HTTP 连接）并传递给运行中的工具：
  - `ClaudeSDK.chat(prompt, options?)` / `chatStream(prompt, options?)` 接受 `ChatOptions.signal`
  - `Session.abort()` 命令式中断当前轮并自动复位；`Session.signal` 暴露当前轮的 `AbortSignal`
  - 中断后保留已生成内容，产出 `interrupted` 事件（含 `partialText`、`completedToolCalls`、`filesWritten`、`usage`），`EngineResult.interrupted` 标记中断状态
  - `bash` 工具中断时杀掉整个进程树（`spawn` + 进程组）

### 修复

- 中断时补齐 context 消息序列：避免 `tool_use` 无配对 `tool_result` 导致下一轮请求被 Anthropic 拒绝
- `bash` 进程树中断兼容 Windows（改用 `taskkill /T /F`）
- `bash` `maxBuffer` 恢复按流分项计数（stdout / stderr 独立），与原始 `exec` 行为一致

---

> 1.2.0 之前的变更请查阅 git 历史。
