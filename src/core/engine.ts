import {
  ToolUseBlock, ToolResultBlock, EngineResult, EngineEvent,
  ToolContext, ToolResult, ChatParams, UsageInfo, SecurityConfig,
  ContextConfig, ToolsConfig, GuardrailsConfig, ToolCallRecord,
} from './types.js'
import { LLMProvider, estimateMessagesTokens, estimateToolDefsTokens, estimateSystemPromptTokens } from '../providers/base.js'
import { ToolSpec, createToolDefinition } from '../tools/base.js'
import { buildSystemPrompt, SystemPromptOptions } from './system-prompt.js'
import { ContextManager } from '../context/manager.js'
import { GuardrailsMiddleware } from '../guardrails/middleware.js'
import { userMessage, toolResultMessage } from './message.js'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from './defaults.js'
import { logger } from './logger.js'

export interface EngineOptions {
  provider: LLMProvider
  tools: Map<string, ToolSpec>
  model: string
  maxTokens: number
  contextWindow?: number
  maxToolRounds: number
  workingDir: string
  security?: SecurityConfig
  contextConfig?: ContextConfig
  toolsConfig?: ToolsConfig
  guardrailsConfig?: GuardrailsConfig
  systemPromptOptions: SystemPromptOptions
  abortSignal?: AbortSignal
  askUserCallback?: (question: string) => Promise<string>
  onText?: (text: string) => void
  onToolStart?: (name: string, params: any) => void
  onToolEnd?: (name: string, result: ToolResult) => void
}

export class Engine {
  private provider: LLMProvider
  private tools: Map<string, ToolSpec>
  private model: string
  private maxTokens: number
  private maxToolRounds: number
  private workingDir: string
  private security?: SecurityConfig
  private toolsConfig?: ToolsConfig
  private systemPromptOptions: SystemPromptOptions
  private context: ContextManager
  private guardrails: GuardrailsMiddleware | null
  private sessionId: string
  private abortSignal?: AbortSignal
  private askUserCallback?: (question: string) => Promise<string>
  private onText?: (text: string) => void
  private onToolStart?: (name: string, params: any) => void
  private onToolEnd?: (name: string, result: ToolResult) => void

  constructor(options: EngineOptions) {
    this.provider = options.provider
    this.tools = options.tools
    this.model = options.model
    this.maxTokens = options.maxTokens
    this.maxToolRounds = options.maxToolRounds
    this.workingDir = options.workingDir
    this.security = options.security
    this.toolsConfig = options.toolsConfig
    this.systemPromptOptions = options.systemPromptOptions
    this.context = new ContextManager(
      (options.contextWindow || DEFAULT_CONTEXT_WINDOW) - (options.maxTokens || DEFAULT_MAX_TOKENS),
      options.contextConfig,
    )
    this.guardrails = options.guardrailsConfig
      ? new GuardrailsMiddleware(Array.from(this.tools.keys()), options.guardrailsConfig)
      : null
    this.sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    this.abortSignal = options.abortSignal
    this.askUserCallback = options.askUserCallback
    this.onText = options.onText
    this.onToolStart = options.onToolStart
    this.onToolEnd = options.onToolEnd
  }

  async run(prompt: string, signal?: AbortSignal): Promise<EngineResult> {
    logger.log('engine', 'run() called', { promptLength: prompt.length })
    const events: EngineEvent[] = []
    for await (const event of this.runStream(prompt, signal)) {
      events.push(event)
    }
    const interrupted = events.find(e => e.type === 'interrupted') as
      | { type: 'interrupted'; partialText: string; completedToolCalls: ToolCallRecord[]; filesWritten: string[]; usage: UsageInfo }
      | undefined
    if (interrupted) {
      return {
        text: interrupted.partialText,
        toolCalls: interrupted.completedToolCalls,
        filesWritten: interrupted.filesWritten,
        usage: interrupted.usage,
        interrupted: true,
      }
    }
    const complete = events.find(e => e.type === 'complete')
    return (complete as { type: 'complete'; result: EngineResult } | undefined)?.result ?? {
      text: '',
      toolCalls: [],
      filesWritten: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  }

  async *runStream(prompt: string, signal?: AbortSignal): AsyncGenerator<EngineEvent> {
    logger.log('engine', 'runStream() started', { promptLength: prompt.length, sessionId: this.sessionId })

    const sig = signal ?? this.abortSignal

    this.context.add(userMessage(prompt))

    const systemText = await buildSystemPrompt(this.systemPromptOptions)
    const toolDefs = Array.from(this.tools.values()).map(t => createToolDefinition(t))

    logger.log('engine', 'system prompt built', { systemPromptLength: systemText.length, toolCount: toolDefs.length, tools: toolDefs.map(t => t.name) })

    let totalText = ''
    const toolCalls: { name: string; input: any; output: string; isError: boolean }[] = []
    const filesWritten: string[] = []
    let totalUsage: UsageInfo = { inputTokens: 0, outputTokens: 0 }

    const makeInterrupted = (): EngineEvent => ({
      type: 'interrupted',
      partialText: totalText,
      completedToolCalls: toolCalls,
      filesWritten,
      usage: totalUsage,
    })

    for (let round = 0; round < this.maxToolRounds; round++) {
      if (sig?.aborted) {
        yield makeInterrupted()
        return
      }

      const messages = this.context.getMessages()
      const msgTokens = estimateMessagesTokens(messages)
      const sysTokens = estimateSystemPromptTokens([{ text: systemText }])
      const toolDefTokens = estimateToolDefsTokens(toolDefs)
      const estTokens = msgTokens + sysTokens + toolDefTokens
      logger.log('context', `round=${round} msgs=${messages.length} est=${estTokens} (msg=${msgTokens}+sys=${sysTokens}+tools=${toolDefTokens})`)

      const params: ChatParams = {
        model: this.model,
        system: [{ type: 'text', text: systemText }],
        messages,
        tools: toolDefs,
        maxTokens: this.maxTokens,
        signal: sig,
      }

      logger.log('provider', 'sending chat request', { model: this.model, messageCount: messages.length, maxTokens: this.maxTokens })

      let responseText = ''
      const toolUses: ToolUseBlock[] = []
      let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 }

      for await (const event of this.provider.chatStream(params)) {
        if (sig?.aborted) break
        if (logger.isEnabled() && event.type !== 'text_delta' && event.type !== 'thinking_delta' && event.type !== 'tool_use_delta') {
          logger.log('provider', `stream event: ${event.type}`, event.type === 'message_end' ? { usage: event.usage, stopReason: event.stopReason } : event.type === 'tool_use_end' ? { name: event.name, id: event.id } : undefined)
        }
        switch (event.type) {
          case 'text_delta':
            responseText += event.text
            this.onText?.(event.text)
            yield { type: 'text', content: event.text }
            break
          case 'tool_use_end':
            toolUses.push({
              type: 'tool_use',
              id: event.id,
              name: event.name,
              input: event.input,
            })
            break
          case 'message_end':
            usage = event.usage
            break
        }
      }

      totalText += responseText
      if (sig?.aborted) {
        yield makeInterrupted()
        return
      }

      totalUsage.inputTokens += usage.inputTokens
      totalUsage.outputTokens += usage.outputTokens
      if (usage.inputTokens > 0) {
        logger.log('provider', 'API usage', { input: usage.inputTokens, output: usage.outputTokens, cumulativeInput: totalUsage.inputTokens, cumulativeOutput: totalUsage.outputTokens })
      }

      // Use real token usage to decide compression — much more accurate than estimation
      this.context.compressIfNeeded(usage.inputTokens)

      // Guardrails: validate tool calls before execution
      if (this.guardrails && toolUses.length > 0) {
        logger.log('guardrails', 'checking tool calls', { toolCount: toolUses.length, toolNames: toolUses.map(t => t.name) })
        const checkResult = this.guardrails.check(toolUses, responseText || undefined)
        logger.log('guardrails', `action: ${checkResult.action}`, { reason: checkResult.reason })

        if (checkResult.action === 'fatal') {
          // Add assistant message + error tool results to keep message sequence complete
          const assistantContent: (import('./types.js').TextBlock | ToolUseBlock)[] = []
          if (responseText) assistantContent.push({ type: 'text', text: responseText })
          assistantContent.push(...toolUses)
          this.context.add({ role: 'assistant', content: assistantContent })
          const errorResults = toolUses.map(tu => ({
            type: 'tool_result' as const,
            toolUseId: tu.id,
            content: `Error: Guardrails rejected — ${checkResult.reason}`,
            isError: true,
          }))
          this.context.add(toolResultMessage(errorResults))
          yield { type: 'error', error: new Error(`Guardrails exhausted: ${checkResult.reason}`) }
          return
        }

        if (checkResult.action === 'retry' || checkResult.action === 'tool_error') {
          // Append nudge message to context so the model sees the error and retries
          const nudgeMsg = checkResult.nudge!.role === 'tool'
            ? { role: 'user' as const, content: [{ type: 'tool_result' as const, toolUseId: 'guardrails-nudge', content: checkResult.nudge!.content, isError: true }] }
            : { role: 'user' as const, content: [{ type: 'text' as const, text: checkResult.nudge!.content }] }
          this.context.add(nudgeMsg)
          continue
        }

        // action === 'execute': use possibly rescue-corrected toolCalls
        if (checkResult.toolCalls) {
          toolUses.length = 0
          toolUses.push(...checkResult.toolCalls)
        }
        this.guardrails.recordSuccess()
      }

      if (toolUses.length === 0) {
        this.context.add({ role: 'assistant', content: [{ type: 'text', text: responseText }] })
        logger.log('engine', 'no tool calls, finishing', { responseLength: responseText.length })
        break
      }

      // Add assistant message with text + tool_use
      const assistantContent: (import('./types.js').TextBlock | ToolUseBlock)[] = []
      if (responseText) assistantContent.push({ type: 'text', text: responseText })
      assistantContent.push(...toolUses)
      this.context.add({ role: 'assistant', content: assistantContent })

      // Execute tools
      const results: ToolResultBlock[] = []
      for (const tu of toolUses) {
        if (sig?.aborted) {
          yield makeInterrupted()
          return
        }
        const tool = this.tools.get(tu.name)
        if (!tool) {
          results.push({ type: 'tool_result', toolUseId: tu.id, content: `Error: Unknown tool '${tu.name}'`, isError: true })
          toolCalls.push({ name: tu.name, input: tu.input, output: `Error: Unknown tool '${tu.name}'`, isError: true })
          continue
        }

        this.onToolStart?.(tu.name, tu.input)
        yield { type: 'tool_start', name: tu.name, params: tu.input }

        logger.log('tools', `executing ${tu.name}`, { input: tu.input })

        const toolCtx: ToolContext = { workingDir: this.workingDir, sessionId: this.sessionId, security: this.security, tools: this.toolsConfig, askUserCallback: this.askUserCallback, abortSignal: sig }
        let result: ToolResult
        try {
          result = await tool.execute(tu.input, toolCtx)
        } catch (err: any) {
          result = { output: `Tool execution error: ${err.message}`, isError: true }
          logger.error('tools', `${tu.name} threw`, { error: err.message })
        }

        logger.log('tools', `${tu.name} done`, { isError: result.isError, outputLength: result.output.length, metadata: result.metadata })

        this.onToolEnd?.(tu.name, result)
        yield { type: 'tool_end', name: tu.name, result }

        results.push({ type: 'tool_result', toolUseId: tu.id, content: result.output, isError: result.isError })
        toolCalls.push({ name: tu.name, input: tu.input, output: result.output, isError: !!result.isError })

        if ((tu.name === 'file_write' || tu.name === 'file_edit') && result.metadata?.filePath) {
          filesWritten.push(result.metadata.filePath)
        }
      }

      this.context.add(toolResultMessage(results))
    }

    yield {
      type: 'complete',
      result: { text: totalText, toolCalls, filesWritten, usage: totalUsage },
    }
  }

  resetContext(): void {
    this.context.reset()
  }
}
