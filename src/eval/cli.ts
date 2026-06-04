import { EvalConfig, EvalRunResult } from './types.js'
import { scenarios } from './scenarios.js'
import { EvalRunner } from './runner.js'
import { aggregateMetrics } from './metrics.js'
import { printReport } from './report.js'
import { OpenAIProvider } from '../providers/openai.js'
import { AnthropicProvider } from '../providers/anthropic.js'
import { LLMProvider } from '../providers/base.js'

/**
 * Parse a CLI argument value from argv.
 * Returns the value after the flag, or undefined if not found.
 */
function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx === -1 || idx + 1 >= args.length) return undefined
  return args[idx + 1]
}

/**
 * Check if a boolean flag is present in argv.
 */
function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

/**
 * Create a real LLM provider from CLI args.
 */
function createProvider(provider: string, apiKey: string, baseURL?: string): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(baseURL || 'https://api.openai.com/v1', apiKey)
    case 'anthropic':
      return new AnthropicProvider(apiKey, baseURL)
    default:
      throw new Error(`Unknown provider: ${provider}. Supported: openai, anthropic`)
  }
}

/**
 * Main CLI entry point.
 *
 * Usage:
 *   npx tsx src/eval/cli.ts --runs 3 --format table
 *   npx tsx src/eval/cli.ts --provider anthropic --api-key $ANTHROPIC_API_KEY --runs 3
 *   npx tsx src/eval/cli.ts --provider openai --api-key $OPENAI_API_KEY --base-url http://localhost:11434/v1 --runs 3
 *   npx tsx src/eval/cli.ts --runs 1 --format jsonl --output eval_results.jsonl
 *   npx tsx src/eval/cli.ts --scenario single_tool_call --runs 5 --verbose
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  const runsStr = getArg(args, '--runs')
  const format = getArg(args, '--format') as EvalConfig['outputFormat'] | undefined
  const output = getArg(args, '--output')
  const scenarioName = getArg(args, '--scenario')
  const verbose = hasFlag(args, '--verbose')
  const providerName = getArg(args, '--provider')
  const apiKey = getArg(args, '--api-key') || getArg(args, '--api_key')
    || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY
  const baseURL = getArg(args, '--base-url')
  const model = getArg(args, '--model')

  const runs = runsStr ? parseInt(runsStr, 10) : 1
  if (isNaN(runs) || runs < 1) {
    console.error('Error: --runs must be a positive integer')
    process.exit(1)
  }

  if (format && format !== 'table' && format !== 'jsonl' && format !== 'both') {
    console.error('Error: --format must be one of: table, jsonl, both')
    process.exit(1)
  }

  // Build real provider if --provider is specified
  let provider: LLMProvider | undefined
  if (providerName) {
    if (!apiKey) {
      console.error('Error: --api-key is required when using --provider')
      console.error('Usage: --provider openai --api-key sk-...')
      process.exit(1)
    }
    provider = createProvider(providerName, apiKey, baseURL)
    console.log(`Using ${providerName} provider${baseURL ? ` (${baseURL})` : ''} model=${model || 'default'}`)
  }

  // Filter scenarios if --scenario is specified
  const selectedScenarios = scenarioName
    ? scenarios.filter(s => s.name === scenarioName)
    : scenarios

  if (selectedScenarios.length === 0) {
    console.error(`Error: no scenario found matching "${scenarioName}"`)
    console.error(`Available scenarios: ${scenarios.map(s => s.name).join(', ')}`)
    process.exit(1)
  }

  const config: EvalConfig = {
    runsPerScenario: runs,
    verbose,
    outputFormat: format ?? 'table',
    outputPath: output,
  }

  const runner = new EvalRunner(config)

  console.log(`Running ${selectedScenarios.length} scenario(s), ${runs} run(s) each...\n`)

  // Collect raw results by running each scenario N times
  const allResults: EvalRunResult[] = []
  for (const scenario of selectedScenarios) {
    for (let i = 0; i < runs; i++) {
      const result = await runner.runOnce(scenario, provider, model)
      allResults.push(result)
    }
  }

  // Aggregate raw results into metrics
  const metrics = aggregateMetrics(allResults)

  printReport(metrics, allResults, config)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
