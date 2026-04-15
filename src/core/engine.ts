import {
  Message, ToolUseBlock, ToolResultBlock, EngineResult, EngineEvent,
  ToolContext, ToolResult, ChatParams, UsageInfo,
} from './types.js'
import { LLMProvider } from '../providers/base.js'
import { ToolSpec, createToolDefinition } from '../tools/base.js'
import { buildSystemPrompt, SystemPromptOptions } from './system-prompt.js'
import { ContextManager } from './context.js'
import { userMessage, toolResultMessage } from './message.js'

export interface EngineOptions {
  provider: LLMProvider
  tools: Map<string, ToolSpec>
  model: string
  maxTokens: number
  maxToolRounds: number
  workingDir: string
  systemPromptOptions: SystemPromptOptions
  abortSignal?: AbortSignal
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
  private systemPromptOptions: SystemPromptOptions
  private context: ContextManager
  private abortSignal?: AbortSignal
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
    this.systemPromptOptions = options.systemPromptOptions
    this.context = new ContextManager()
    this.abortSignal = options.abortSignal
    this.onText = options.onText
    this.onToolStart = options.onToolStart
    this.onToolEnd = options.onToolEnd
  }

  async run(prompt: string): Promise<EngineResult> {
    const events: EngineEvent[] = []
    for await (const event of this.runStream(prompt)) {
      events.push(event)
    }
    const complete = events.find(e => e.type === 'complete')
    return (complete as { type: 'complete'; result: EngineResult } | undefined)?.result ?? {
      text: '',
      toolCalls: [],
      filesWritten: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  }

  async *runStream(prompt: string): AsyncGenerator<EngineEvent> {
    this.context.add(userMessage(prompt))

    const systemText = await buildSystemPrompt(this.systemPromptOptions)
    const toolDefs = Array.from(this.tools.values()).map(t => createToolDefinition(t))

    let totalText = ''
    const toolCalls: { name: string; input: any; output: string; isError: boolean }[] = []
    const filesWritten: string[] = []
    let totalUsage: UsageInfo = { inputTokens: 0, outputTokens: 0 }

    for (let round = 0; round < this.maxToolRounds; round++) {
      if (this.abortSignal?.aborted) {
        yield { type: 'error', error: new Error('Aborted') }
        return
      }

      const messages = this.context.getMessages()
      const params: ChatParams = {
        model: this.model,
        system: [{ type: 'text', text: systemText }],
        messages,
        tools: toolDefs,
        maxTokens: this.maxTokens,
      }

      let responseText = ''
      const toolUses: ToolUseBlock[] = []
      let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 }

      for await (const event of this.provider.chatStream(params)) {
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

      totalUsage.inputTokens += usage.inputTokens
      totalUsage.outputTokens += usage.outputTokens

      if (toolUses.length === 0) {
        totalText += responseText
        this.context.add({ role: 'assistant', content: [{ type: 'text', text: responseText }] })
        break
      }

      // Add assistant message with text + tool_use
      const assistantContent: (import('./types.js').TextBlock | ToolUseBlock)[] = []
      if (responseText) assistantContent.push({ type: 'text', text: responseText })
      assistantContent.push(...toolUses)
      this.context.add({ role: 'assistant', content: assistantContent })
      totalText += responseText

      // Execute tools
      const results: ToolResultBlock[] = []
      for (const tu of toolUses) {
        const tool = this.tools.get(tu.name)
        if (!tool) {
          results.push({ type: 'tool_result', toolUseId: tu.id, content: `Error: Unknown tool '${tu.name}'`, isError: true })
          toolCalls.push({ name: tu.name, input: tu.input, output: `Error: Unknown tool '${tu.name}'`, isError: true })
          continue
        }

        this.onToolStart?.(tu.name, tu.input)
        yield { type: 'tool_start', name: tu.name, params: tu.input }

        const toolCtx: ToolContext = { workingDir: this.workingDir, sessionId: 'session' }
        let result: ToolResult
        try {
          result = await tool.execute(tu.input, toolCtx)
        } catch (err: any) {
          result = { output: `Tool execution error: ${err.message}`, isError: true }
        }

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
