# Changelog

本项目所有重要变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
