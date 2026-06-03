import { EvalConfig, EvalRunResult } from './types.js'
import { scenarios } from './scenarios.js'
import { EvalRunner } from './runner.js'
import { aggregateMetrics } from './metrics.js'
import { printReport } from './report.js'

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
 * Main CLI entry point.
 *
 * Usage:
 *   npx tsx src/eval/cli.ts --runs 3 --format table
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

  const runs = runsStr ? parseInt(runsStr, 10) : 1
  if (isNaN(runs) || runs < 1) {
    console.error('Error: --runs must be a positive integer')
    process.exit(1)
  }

  if (format && format !== 'table' && format !== 'jsonl' && format !== 'both') {
    console.error('Error: --format must be one of: table, jsonl, both')
    process.exit(1)
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
      const result = await runner.runOnce(scenario)
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
