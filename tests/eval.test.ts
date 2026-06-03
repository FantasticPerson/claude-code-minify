import { describe, it, expect } from 'vitest'
import { EvalRunner, EvalMockProvider, scenarioToToolMap } from '../src/eval/runner.js'
import { scenarios } from '../src/eval/scenarios.js'
import { EvalScenario, EvalToolDef, EvalRunResult, ScenarioMetrics, EvalConfig } from '../src/eval/types.js'

// ============================================================================
// 1. Types smoke tests
// ============================================================================

describe('Eval types', () => {
  it('EvalToolDef has required fields', () => {
    const tool: EvalToolDef = {
      name: 'test_tool',
      description: 'A test tool',
      handler: (args) => `result: ${JSON.stringify(args)}`,
      parameterSchema: {
        type: 'object',
        properties: { x: { type: 'string' } },
        required: ['x'],
      },
    }
    expect(tool.name).toBe('test_tool')
    expect(tool.handler({ x: 'hello' })).toBe('result: {"x":"hello"}')
  })

  it('EvalScenario has required fields', () => {
    const scenario: EvalScenario = {
      name: 'test_scenario',
      description: 'A test scenario',
      tags: ['test'],
      tools: [],
      userMessage: 'hello',
      validate: (calls) => calls.length === 0,
    }
    expect(scenario.name).toBe('test_scenario')
    expect(scenario.validate([])).toBe(true)
  })

  it('EvalConfig defaults', () => {
    const config: EvalConfig = {}
    expect(config.runsPerScenario).toBeUndefined()
    expect(config.verbose).toBeUndefined()
  })
})

// ============================================================================
// 2. Scenarios validation
// ============================================================================

describe('Preset scenarios', () => {
  it('has exactly 10 scenarios', () => {
    expect(scenarios.length).toBe(10)
  })

  it('each scenario has required fields', () => {
    for (const s of scenarios) {
      expect(s.name).toBeTruthy()
      expect(s.description).toBeTruthy()
      expect(s.tags.length).toBeGreaterThan(0)
      expect(s.tools.length).toBeGreaterThan(0)
      expect(s.userMessage).toBeTruthy()
      expect(typeof s.validate).toBe('function')
    }
  })

  it('scenario names are unique', () => {
    const names = scenarios.map(s => s.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('all scenarios have maxRounds set', () => {
    for (const s of scenarios) {
      expect(s.maxRounds).toBeDefined()
      expect(s.maxRounds).toBeGreaterThan(0)
    }
  })

  it('all scenario tools have handlers', () => {
    for (const s of scenarios) {
      for (const t of s.tools) {
        expect(typeof t.handler).toBe('function')
        expect(t.parameterSchema).toBeDefined()
      }
    }
  })
})

// ============================================================================
// 3. scenarioToToolMap
// ============================================================================

describe('scenarioToToolMap', () => {
  it('converts EvalToolDef[] to ToolSpec Map', () => {
    const scenario: EvalScenario = {
      name: 'test',
      description: 'test',
      tags: [],
      tools: [
        {
          name: 'tool_a',
          description: 'Tool A',
          handler: () => 'ok',
          parameterSchema: { type: 'object', properties: {} },
        },
        {
          name: 'tool_b',
          description: 'Tool B',
          handler: () => 'ok',
          parameterSchema: { type: 'object', properties: {} },
        },
      ],
      userMessage: 'test',
      validate: () => true,
    }

    const map = scenarioToToolMap(scenario)
    expect(map.size).toBe(2)
    expect(map.has('tool_a')).toBe(true)
    expect(map.has('tool_b')).toBe(true)
  })

  it('ToolSpec execute returns correct result', async () => {
    const scenario: EvalScenario = {
      name: 'test',
      description: 'test',
      tags: [],
      tools: [
        {
          name: 'echo',
          description: 'Echoes input',
          handler: (args) => `echo: ${args.msg}`,
          parameterSchema: {
            type: 'object',
            properties: { msg: { type: 'string' } },
            required: ['msg'],
          },
        },
      ],
      userMessage: 'test',
      validate: () => true,
    }

    const map = scenarioToToolMap(scenario)
    const spec = map.get('echo')!
    const result = await spec.execute({ msg: 'hello' }, { workingDir: '/tmp', sessionId: 'test' })
    expect(result.output).toBe('echo: hello')
    expect(result.isError).toBeFalsy()
  })
})

// ============================================================================
// 4. EvalMockProvider
// ============================================================================

describe('EvalMockProvider', () => {
  it('produces tool_use responses for single_tool_call scenario', async () => {
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    const provider = new EvalMockProvider(scenario)

    const chatParams = {
      model: 'test',
      system: [{ type: 'text', text: 'system' }],
      messages: [],
      tools: [],
      maxTokens: 1024,
    }

    const response = await provider.chat(chatParams)
    expect(response.toolUses.length).toBe(1)
    expect(response.toolUses[0].name).toBe('get_weather')
    expect(response.toolUses[0].input.city).toBe('Paris')
  })

  it('produces text-only response for no_tool_needed scenario', async () => {
    const scenario = scenarios.find(s => s.name === 'no_tool_needed')!
    const provider = new EvalMockProvider(scenario)

    const chatParams = {
      model: 'test',
      system: [{ type: 'text', text: 'system' }],
      messages: [],
      tools: [],
      maxTokens: 1024,
    }

    const response = await provider.chat(chatParams)
    expect(response.text).toBeTruthy()
    expect(response.toolUses.length).toBe(0)
  })

  it('produces multi-round responses for two_step_sequential', async () => {
    const scenario = scenarios.find(s => s.name === 'two_step_sequential')!
    const provider = new EvalMockProvider(scenario)

    const chatParams = {
      model: 'test',
      system: [{ type: 'text', text: 'system' }],
      messages: [],
      tools: [],
      maxTokens: 1024,
    }

    // Round 1: get_weather
    const r1 = await provider.chat(chatParams)
    expect(r1.toolUses.length).toBe(1)
    expect(r1.toolUses[0].name).toBe('get_weather')

    // Round 2: format_response
    const r2 = await provider.chat(chatParams)
    expect(r2.toolUses.length).toBe(1)
    expect(r2.toolUses[0].name).toBe('format_response')

    // Round 3: text response
    const r3 = await provider.chat(chatParams)
    expect(r3.text).toBeTruthy()
    expect(r3.toolUses.length).toBe(0)
  })

  it('counts provider calls', async () => {
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    const provider = new EvalMockProvider(scenario)

    const chatParams = {
      model: 'test',
      system: [{ type: 'text', text: 'system' }],
      messages: [],
      tools: [],
      maxTokens: 1024,
    }

    expect(provider.callCount).toBe(0)
    await provider.chat(chatParams)
    expect(provider.callCount).toBe(1)
    await provider.chat(chatParams)
    expect(provider.callCount).toBe(2)
  })
})

// ============================================================================
// 5. EvalRunner.runOnce
// ============================================================================

describe('EvalRunner.runOnce', () => {
  const runner = new EvalRunner()

  it('single_tool_call passes', async () => {
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    const result = await runner.runOnce(scenario)
    expect(result.scenario).toBe('single_tool_call')
    expect(result.pass).toBe(true)
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(1)
    expect(result.error).toBeUndefined()
  })

  it('no_tool_needed passes', async () => {
    const scenario = scenarios.find(s => s.name === 'no_tool_needed')!
    const result = await runner.runOnce(scenario)
    expect(result.scenario).toBe('no_tool_needed')
    expect(result.pass).toBe(true)
    expect(result.toolCalls.length).toBe(0)
  })

  it('two_step_sequential passes', async () => {
    const scenario = scenarios.find(s => s.name === 'two_step_sequential')!
    const result = await runner.runOnce(scenario)
    expect(result.scenario).toBe('two_step_sequential')
    expect(result.pass).toBe(true)
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('correct_arguments passes', async () => {
    const scenario = scenarios.find(s => s.name === 'correct_arguments')!
    const result = await runner.runOnce(scenario)
    expect(result.scenario).toBe('correct_arguments')
    expect(result.pass).toBe(true)
  })

  it('error_recovery passes', async () => {
    const scenario = scenarios.find(s => s.name === 'error_recovery')!
    const result = await runner.runOnce(scenario)
    expect(result.scenario).toBe('error_recovery')
    expect(result.pass).toBe(true)
  })

  it('multiple_tools passes', async () => {
    const scenario = scenarios.find(s => s.name === 'multiple_tools')!
    const result = await runner.runOnce(scenario)
    expect(result.scenario).toBe('multiple_tools')
    expect(result.pass).toBe(true)
  })

  it('data_extraction passes', async () => {
    const scenario = scenarios.find(s => s.name === 'data_extraction')!
    const result = await runner.runOnce(scenario)
    expect(result.scenario).toBe('data_extraction')
    expect(result.pass).toBe(true)
  })

  it('conditional_logic passes', async () => {
    const scenario = scenarios.find(s => s.name === 'conditional_logic')!
    const result = await runner.runOnce(scenario)
    expect(result.scenario).toBe('conditional_logic')
    expect(result.pass).toBe(true)
  })

  it('long_context passes', async () => {
    const scenario = scenarios.find(s => s.name === 'long_context')!
    const result = await runner.runOnce(scenario)
    expect(result.scenario).toBe('long_context')
    expect(result.pass).toBe(true)
  })

  it('parallel_independent passes', async () => {
    const scenario = scenarios.find(s => s.name === 'parallel_independent')!
    const result = await runner.runOnce(scenario)
    expect(result.scenario).toBe('parallel_independent')
    expect(result.pass).toBe(true)
  })

  it('returns error result on invalid scenario', async () => {
    const badScenario: EvalScenario = {
      name: 'broken',
      description: 'broken scenario',
      tags: [],
      tools: [],
      userMessage: 'test',
      validate: () => false,
    }
    // Empty tools — engine should still run, just with text response
    const result = await runner.runOnce(badScenario)
    expect(result.scenario).toBe('broken')
    expect(result.pass).toBe(false)
    expect(result.error).toBeUndefined() // No crash, just validation fails
  })

  it('returns elapsedMs > 0', async () => {
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    const result = await runner.runOnce(scenario)
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('returns token counts >= 0', async () => {
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    const result = await runner.runOnce(scenario)
    expect(result.inputTokens).toBeGreaterThanOrEqual(0)
    expect(result.outputTokens).toBeGreaterThanOrEqual(0)
  })
})

// ============================================================================
// 6. EvalRunner.runScenario
// ============================================================================

describe('EvalRunner.runScenario', () => {
  it('runs scenario 3 times and aggregates metrics', async () => {
    const runner = new EvalRunner()
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    const metrics = await runner.runScenario(scenario, 3)
    expect(metrics.name).toBe('single_tool_call')
    expect(metrics.totalRuns).toBe(3)
    expect(metrics.passRate).toBe(1)
    expect(metrics.avgToolRounds).toBeGreaterThanOrEqual(1)
    expect(metrics.errors).toBe(0)
  })

  it('aggregates elapsed time', async () => {
    const runner = new EvalRunner()
    const scenario = scenarios.find(s => s.name === 'no_tool_needed')!
    const metrics = await runner.runScenario(scenario, 2)
    expect(metrics.avgElapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('returns correct metrics for failing scenario', async () => {
    const runner = new EvalRunner()
    const badScenario: EvalScenario = {
      name: 'always_fail',
      description: 'Always fails validation',
      tags: [],
      tools: [],
      userMessage: 'hello',
      validate: () => false,
    }
    const metrics = await runner.runScenario(badScenario, 2)
    expect(metrics.totalRuns).toBe(2)
    expect(metrics.passRate).toBe(0)
  })
})

// ============================================================================
// 7. EvalRunner.runAll
// ============================================================================

describe('EvalRunner.runAll', () => {
  it('runs all 10 scenarios and returns metrics', async () => {
    const runner = new EvalRunner()
    const allMetrics = await runner.runAll(scenarios, 1)
    expect(allMetrics.length).toBe(10)

    // All scenarios should pass with mock provider
    for (const m of allMetrics) {
      expect(m.totalRuns).toBe(1)
      expect(m.passRate).toBe(1)
      expect(m.errors).toBe(0)
    }
  })

  it('respects runsPerScenario from config', async () => {
    const runner = new EvalRunner({ runsPerScenario: 2 })
    const subset = scenarios.slice(0, 3)
    const allMetrics = await runner.runAll(subset)
    expect(allMetrics.length).toBe(3)
    for (const m of allMetrics) {
      expect(m.totalRuns).toBe(2)
    }
  })

  it('overrides runsPerScenario with explicit runs parameter', async () => {
    const runner = new EvalRunner({ runsPerScenario: 5 })
    const subset = scenarios.slice(0, 2)
    const allMetrics = await runner.runAll(subset, 1)
    expect(allMetrics.length).toBe(2)
    for (const m of allMetrics) {
      expect(m.totalRuns).toBe(1) // explicit runs=1 overrides config
    }
  })
})

// ============================================================================
// 8. Validate function tests
// ============================================================================

describe('Scenario validate functions', () => {
  it('single_tool_call: validates correct city', () => {
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    expect(scenario.validate([{ name: 'get_weather', input: { city: 'Paris' }, output: '' }])).toBe(true)
    expect(scenario.validate([{ name: 'get_weather', input: { city: 'paris' }, output: '' }])).toBe(true)
    expect(scenario.validate([{ name: 'get_weather', input: { city: 'Tokyo' }, output: '' }])).toBe(false)
    expect(scenario.validate([])).toBe(false)
  })

  it('no_tool_needed: passes with no calls', () => {
    const scenario = scenarios.find(s => s.name === 'no_tool_needed')!
    expect(scenario.validate([])).toBe(true)
    expect(scenario.validate([{ name: 'get_weather', input: { city: 'Paris' }, output: '' }])).toBe(false)
  })

  it('two_step_sequential: validates order', () => {
    const scenario = scenarios.find(s => s.name === 'two_step_sequential')!
    expect(scenario.validate([
      { name: 'get_weather', input: { city: 'Tokyo' }, output: '' },
      { name: 'format_response', input: { text: 'nice' }, output: '' },
    ])).toBe(true)

    // Wrong order
    expect(scenario.validate([
      { name: 'format_response', input: { text: 'nice' }, output: '' },
      { name: 'get_weather', input: { city: 'Tokyo' }, output: '' },
    ])).toBe(false)

    // Missing tool
    expect(scenario.validate([
      { name: 'get_weather', input: { city: 'Tokyo' }, output: '' },
    ])).toBe(false)
  })

  it('correct_arguments: validates query content', () => {
    const scenario = scenarios.find(s => s.name === 'correct_arguments')!
    expect(scenario.validate([
      { name: 'search', input: { query: 'typescript testing best practices', limit: 5 }, output: '' },
    ])).toBe(true)

    // Wrong query
    expect(scenario.validate([
      { name: 'search', input: { query: 'python tutorial', limit: 5 }, output: '' },
    ])).toBe(false)

    // limit is optional, so undefined is ok
    expect(scenario.validate([
      { name: 'search', input: { query: 'Typescript testing guide' }, output: '' },
    ])).toBe(true)
  })

  it('conditional_logic: validates correct branch', () => {
    const scenario = scenarios.find(s => s.name === 'conditional_logic')!
    expect(scenario.validate([
      { name: 'convert_temperature', input: { value: 25, from_unit: 'C' }, output: '' },
    ])).toBe(true)

    // Wrong tool
    expect(scenario.validate([
      { name: 'convert_distance', input: { value: 25, from_unit: 'C' }, output: '' },
    ])).toBe(false)

    // Both tools called
    expect(scenario.validate([
      { name: 'convert_temperature', input: { value: 25, from_unit: 'C' }, output: '' },
      { name: 'convert_distance', input: { value: 10, from_unit: 'mi' }, output: '' },
    ])).toBe(false)
  })

  it('parallel_independent: validates both tools called', () => {
    const scenario = scenarios.find(s => s.name === 'parallel_independent')!
    expect(scenario.validate([
      { name: 'get_stock_price', input: { symbol: 'AAPL' }, output: '' },
      { name: 'get_exchange_rate', input: { from: 'USD', to: 'EUR' }, output: '' },
    ])).toBe(true)

    // Missing one
    expect(scenario.validate([
      { name: 'get_stock_price', input: { symbol: 'AAPL' }, output: '' },
    ])).toBe(false)

    // Wrong symbol
    expect(scenario.validate([
      { name: 'get_stock_price', input: { symbol: 'GOOG' }, output: '' },
      { name: 'get_exchange_rate', input: { from: 'USD', to: 'EUR' }, output: '' },
    ])).toBe(false)
  })
})

// ============================================================================
// 9. EvalRunResult structure
// ============================================================================

describe('EvalRunResult structure', () => {
  it('has all required fields', async () => {
    const runner = new EvalRunner()
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    const result = await runner.runOnce(scenario)

    expect(result).toHaveProperty('scenario')
    expect(result).toHaveProperty('pass')
    expect(result).toHaveProperty('toolRounds')
    expect(result).toHaveProperty('inputTokens')
    expect(result).toHaveProperty('outputTokens')
    expect(result).toHaveProperty('elapsedMs')
    expect(result).toHaveProperty('toolCalls')
  })

  it('toolCalls match expected format', async () => {
    const runner = new EvalRunner()
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    const result = await runner.runOnce(scenario)

    for (const tc of result.toolCalls) {
      expect(tc).toHaveProperty('name')
      expect(tc).toHaveProperty('input')
      expect(tc).toHaveProperty('output')
    }
  })
})

// ============================================================================
// 10. ScenarioMetrics structure
// ============================================================================

describe('ScenarioMetrics structure', () => {
  it('has all required fields', async () => {
    const runner = new EvalRunner()
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    const metrics = await runner.runScenario(scenario, 2)

    expect(metrics).toHaveProperty('name')
    expect(metrics).toHaveProperty('totalRuns')
    expect(metrics).toHaveProperty('passRate')
    expect(metrics).toHaveProperty('avgToolRounds')
    expect(metrics).toHaveProperty('avgInputTokens')
    expect(metrics).toHaveProperty('avgOutputTokens')
    expect(metrics).toHaveProperty('avgElapsedMs')
    expect(metrics).toHaveProperty('errors')
  })

  it('metrics values are in valid ranges', async () => {
    const runner = new EvalRunner()
    const scenario = scenarios.find(s => s.name === 'single_tool_call')!
    const metrics = await runner.runScenario(scenario, 2)

    expect(metrics.passRate).toBeGreaterThanOrEqual(0)
    expect(metrics.passRate).toBeLessThanOrEqual(1)
    expect(metrics.avgToolRounds).toBeGreaterThanOrEqual(0)
    expect(metrics.avgInputTokens).toBeGreaterThanOrEqual(0)
    expect(metrics.avgOutputTokens).toBeGreaterThanOrEqual(0)
    expect(metrics.avgElapsedMs).toBeGreaterThanOrEqual(0)
    expect(metrics.errors).toBeGreaterThanOrEqual(0)
  })
})
