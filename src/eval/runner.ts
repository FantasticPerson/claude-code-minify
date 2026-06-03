import { z } from 'zod'
import { EvalScenario, EvalRunResult, ScenarioMetrics, EvalConfig, EvalToolDef } from './types.js'
import { ToolSpec } from '../tools/base.js'
import { ToolContext, ToolResult, ChatParams, ChatResponse, StreamEvent, Message } from '../core/types.js'
import { LLMProvider } from '../providers/base.js'
import { Engine, EngineOptions } from '../core/engine.js'

/**
 * Convert an EvalToolDef into a ToolSpec compatible with the Engine.
 * Uses a permissive zod schema so mock tool handlers receive args directly.
 */
function toolDefToSpec(def: EvalToolDef): ToolSpec {
  return {
    name: def.name,
    description: def.description,
    schema: z.record(z.string(), z.any()),
    execute: async (params: any, _ctx: ToolContext): Promise<ToolResult> => {
      try {
        const output = await def.handler(params)
        return { output }
      } catch (err: any) {
        return { output: `Tool execution error: ${err.message}`, isError: true }
      }
    },
  }
}

/**
 * Convert scenario's EvalToolDef[] into a Map<string, ToolSpec> for the Engine.
 */
export function scenarioToToolMap(scenario: EvalScenario): Map<string, ToolSpec> {
  const map = new Map<string, ToolSpec>()
  for (const def of scenario.tools) {
    map.set(def.name, toolDefToSpec(def))
  }
  return map
}

/**
 * Mock provider that simulates "correct" tool calls for a scenario.
 * It inspects the scenario's tools and userMessage to decide what tools to call.
 */
export class EvalMockProvider implements LLMProvider {
  private scenario: EvalScenario
  private roundResponses: Array<{ text?: string; toolUses?: Array<{ id: string; name: string; input: Record<string, any> }> }> = []

  callCount = 0
  lastParams: ChatParams | null = null

  constructor(scenario: EvalScenario) {
    this.scenario = scenario
    this.buildResponses()
  }

  private buildResponses(): void {
    const scenario = this.scenario

    // Scenario: no_tool_needed — just respond with text
    if (scenario.name === 'no_tool_needed') {
      this.roundResponses.push({ text: 'Hello! I am doing well, thank you for asking.' })
      return
    }

    // Scenario: error_recovery — first call fails (simulate error), second succeeds
    if (scenario.name === 'error_recovery') {
      const tool = scenario.tools[0]
      this.roundResponses.push({
        toolUses: [{
          id: 'tu_0',
          name: tool.name,
          input: { city: 'London' },
        }],
      })
      // The tool handler will succeed, but we simulate a second round with text
      this.roundResponses.push({ text: 'The weather in London is 72°F and sunny.' })
      return
    }

    // Scenario: two_step_sequential — first tool, then second tool, then text
    if (scenario.name === 'two_step_sequential') {
      this.roundResponses.push({
        toolUses: [{
          id: 'tu_0',
          name: 'get_weather',
          input: { city: 'Tokyo' },
        }],
      })
      this.roundResponses.push({
        toolUses: [{
          id: 'tu_1',
          name: 'format_response',
          input: { text: 'The weather in Tokyo is pleasant.' },
        }],
      })
      this.roundResponses.push({ text: 'Here is the formatted weather information for Tokyo.' })
      return
    }

    // Scenario: single_tool_call
    if (scenario.name === 'single_tool_call') {
      const tool = scenario.tools[0]
      this.roundResponses.push({
        toolUses: [{
          id: 'tu_0',
          name: tool.name,
          input: { city: 'Paris' },
        }],
      })
      this.roundResponses.push({ text: "The weather in Paris is 72°F and sunny." })
      return
    }

    // Scenario: correct_arguments
    if (scenario.name === 'correct_arguments') {
      this.roundResponses.push({
        toolUses: [{
          id: 'tu_0',
          name: 'search',
          input: { query: 'typescript testing best practices', limit: 5 },
        }],
      })
      this.roundResponses.push({ text: 'Here are the search results for TypeScript testing best practices.' })
      return
    }

    // Scenario: multiple_tools — call both tools in one round
    if (scenario.name === 'multiple_tools') {
      this.roundResponses.push({
        toolUses: [
          { id: 'tu_0', name: 'get_weather', input: { city: 'New York' } },
          { id: 'tu_1', name: 'get_time', input: { timezone: 'America/New_York' } },
        ],
      })
      this.roundResponses.push({ text: 'In New York, it is currently 72°F and sunny, and the time is 3:00 PM.' })
      return
    }

    // Scenario: data_extraction
    if (scenario.name === 'data_extraction') {
      this.roundResponses.push({
        toolUses: [{
          id: 'tu_0',
          name: 'save_contact',
          input: { name: 'John Smith', email: 'john.smith@example.com' },
        }],
      })
      this.roundResponses.push({ text: 'Contact saved successfully.' })
      return
    }

    // Scenario: conditional_logic
    if (scenario.name === 'conditional_logic') {
      this.roundResponses.push({
        toolUses: [{
          id: 'tu_0',
          name: 'convert_temperature',
          input: { value: 25, from_unit: 'C' },
        }],
      })
      this.roundResponses.push({ text: '25°C = 77°F' })
      return
    }

    // Scenario: long_context
    if (scenario.name === 'long_context') {
      this.roundResponses.push({
        toolUses: [{
          id: 'tu_0',
          name: 'search',
          input: { query: 'recent advances in quantum computing' },
        }],
      })
      this.roundResponses.push({ text: 'Here are the latest advances in quantum computing.' })
      return
    }

    // Scenario: parallel_independent
    if (scenario.name === 'parallel_independent') {
      this.roundResponses.push({
        toolUses: [
          { id: 'tu_0', name: 'get_stock_price', input: { symbol: 'AAPL' } },
          { id: 'tu_1', name: 'get_exchange_rate', input: { from: 'USD', to: 'EUR' } },
        ],
      })
      this.roundResponses.push({ text: 'AAPL is trading at $150.00 and the USD to EUR rate is 1.08.' })
      return
    }

    // Default: call all tools in the first round
    const toolUses = scenario.tools.map((t, i) => ({
      id: `tu_${i}`,
      name: t.name,
      input: {} as Record<string, any>,
    }))
    this.roundResponses.push({ toolUses })
    this.roundResponses.push({ text: 'Done.' })
  }

  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
    this.callCount++
    this.lastParams = params

    const response = this.roundResponses[this.callCount - 1]
    if (!response) {
      yield { type: 'message_end', usage: { inputTokens: 100, outputTokens: 50 }, stopReason: 'end_turn' }
      return
    }

    if (response.text) {
      yield { type: 'text_delta', text: response.text }
    }

    if (response.toolUses) {
      for (const tu of response.toolUses) {
        yield { type: 'tool_use_start', id: tu.id, name: tu.name }
        yield { type: 'tool_use_end', id: tu.id, name: tu.name, input: tu.input }
      }
    }

    yield {
      type: 'message_end',
      usage: { inputTokens: 100, outputTokens: 50 },
      stopReason: response.toolUses?.length ? 'tool_use' : 'end_turn',
    }
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    this.callCount++
    this.lastParams = params

    const response = this.roundResponses[this.callCount - 1]
    if (!response) {
      return { text: '', toolUses: [], usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'end_turn' }
    }

    return {
      text: response.text ?? '',
      toolUses: (response.toolUses ?? []).map(tu => ({
        type: 'tool_use' as const,
        id: tu.id,
        name: tu.name,
        input: tu.input,
      })),
      usage: { inputTokens: 100, outputTokens: 50 },
      stopReason: response.toolUses?.length ? 'tool_use' : 'end_turn',
    }
  }

  async countTokens(messages: Message[]): Promise<number> {
    return Math.ceil(JSON.stringify(messages).length / 4)
  }
}

/**
 * Eval runner that executes scenarios using the Engine with a mock or real provider.
 */
export class EvalRunner {
  private config: EvalConfig

  constructor(config?: EvalConfig) {
    this.config = config ?? {}
  }

  /**
   * Run a single scenario once. If no provider is given, uses EvalMockProvider.
   */
  async runOnce(scenario: EvalScenario, provider?: LLMProvider): Promise<EvalRunResult> {
    const startTime = Date.now()

    try {
      const tools = scenarioToToolMap(scenario)
      const mockProvider = provider ?? new EvalMockProvider(scenario)

      const engineOptions: EngineOptions = {
        provider: mockProvider,
        tools,
        model: 'eval-mock-model',
        maxTokens: 1024,
        maxToolRounds: scenario.maxRounds ?? 4,
        workingDir: '/tmp/eval',
        systemPromptOptions: {
          workingDir: '/tmp/eval',
          enabledTools: Array.from(tools.keys()),
        },
      }

      const engine = new Engine(engineOptions)
      const result = await engine.run(scenario.userMessage)

      // Convert EngineResult toolCalls to the format expected by validate
      const toolCalls = result.toolCalls.map(tc => ({
        name: tc.name,
        input: tc.input,
        output: tc.output,
      }))

      const pass = scenario.validate(toolCalls)

      return {
        scenario: scenario.name,
        pass,
        toolRounds: result.toolCalls.length,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        elapsedMs: Date.now() - startTime,
        toolCalls,
      }
    } catch (err: any) {
      return {
        scenario: scenario.name,
        pass: false,
        toolRounds: 0,
        inputTokens: 0,
        outputTokens: 0,
        elapsedMs: Date.now() - startTime,
        error: err.message,
        toolCalls: [],
      }
    }
  }

  /**
   * Run a single scenario N times and aggregate results.
   */
  async runScenario(scenario: EvalScenario, runs: number, provider?: LLMProvider): Promise<ScenarioMetrics> {
    const results: EvalRunResult[] = []
    for (let i = 0; i < runs; i++) {
      const result = await this.runOnce(scenario, provider)
      results.push(result)
      if (this.config.verbose) {
        console.log(`  [${i + 1}/${runs}] ${scenario.name}: pass=${result.pass} rounds=${result.toolRounds} ${result.elapsedMs}ms`)
      }
    }

    const totalRuns = results.length
    const passCount = results.filter(r => r.pass).length
    const errorCount = results.filter(r => r.error).length

    return {
      name: scenario.name,
      totalRuns,
      passRate: totalRuns > 0 ? passCount / totalRuns : 0,
      avgToolRounds: totalRuns > 0 ? results.reduce((s, r) => s + r.toolRounds, 0) / totalRuns : 0,
      avgInputTokens: totalRuns > 0 ? results.reduce((s, r) => s + r.inputTokens, 0) / totalRuns : 0,
      avgOutputTokens: totalRuns > 0 ? results.reduce((s, r) => s + r.outputTokens, 0) / totalRuns : 0,
      avgElapsedMs: totalRuns > 0 ? results.reduce((s, r) => s + r.elapsedMs, 0) / totalRuns : 0,
      errors: errorCount,
    }
  }

  /**
   * Run all scenarios N times each.
   */
  async runAll(scenarios: EvalScenario[], runs?: number, provider?: LLMProvider): Promise<ScenarioMetrics[]> {
    const n = runs ?? this.config.runsPerScenario ?? 1
    const metrics: ScenarioMetrics[] = []

    for (const scenario of scenarios) {
      if (this.config.verbose) {
        console.log(`Running scenario: ${scenario.name} (${n} runs)`)
      }
      const m = await this.runScenario(scenario, n, provider)
      metrics.push(m)
    }

    return metrics
  }
}
