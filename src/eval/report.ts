import fs from 'node:fs'
import { ScenarioMetrics, EvalRunResult, EvalConfig } from './types.js'

/**
 * Right-pad or truncate a string to a given width.
 */
function padCell(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width)
  return value + ' '.repeat(width - value.length)
}

/**
 * Right-pad a number string to a given width.
 */
function padNumber(value: number, width: number): string {
  const str = String(Math.round(value))
  if (str.length >= width) return str.slice(0, width)
  return ' '.repeat(width - str.length) + str
}

/**
 * Format ScenarioMetrics[] as an ASCII table.
 */
export function formatTable(metrics: ScenarioMetrics[]): string {
  const colScenario = 25
  const colRuns = 6
  const colPass = 9
  const colRounds = 9
  const colMs = 9

  const sep = (left: string, mid: string, right: string) =>
    left + mid.repeat(3) + '+' + mid.repeat(colScenario) + '+' + mid.repeat(colRuns) + '+' + mid.repeat(colPass) + '+' + mid.repeat(colRounds) + '+' + mid.repeat(colMs) + '+' + right

  const headerRow =
    '║ ' + padCell('Scenario', colScenario) +
    ' ║ ' + padCell('Runs', colRuns) +
    ' ║ ' + padCell('Pass%', colPass) +
    ' ║ ' + padCell('AvgRnd', colRounds) +
    ' ║ ' + padCell('AvgMs', colMs) + ' ║'

  const lines: string[] = [
    sep('╔', '═', '╗'),
    headerRow,
    sep('╠', '═', '╣'),
  ]

  if (metrics.length === 0) {
    lines.push('║ ' + padCell('(no results)', colScenario + colRuns + colPass + colRounds + colMs + 16) + ' ║')
  } else {
    for (const m of metrics) {
      const passStr = (m.passRate * 100).toFixed(1) + '%'
      const avgRnd = m.avgToolRounds.toFixed(1)
      const row =
        '║ ' + padCell(m.name, colScenario) +
        ' ║ ' + padNumber(m.totalRuns, colRuns) +
        ' ║ ' + padCell(passStr, colPass) +
        ' ║ ' + padCell(avgRnd, colRounds) +
        ' ║ ' + padNumber(m.avgElapsedMs, colMs) + ' ║'
      lines.push(row)
    }
  }

  lines.push(sep('╚', '═', '╝'))
  return lines.join('\n')
}

/**
 * Format EvalRunResult[] as JSONL (one JSON object per line).
 */
export function formatJsonl(results: EvalRunResult[]): string {
  return results.map(r => JSON.stringify(r)).join('\n')
}

/**
 * Print evaluation report to console.
 * Outputs table and/or JSONL based on config, and optionally writes to file.
 */
export function printReport(
  metrics: ScenarioMetrics[],
  results: EvalRunResult[],
  config?: EvalConfig,
): void {
  const format = config?.outputFormat ?? 'table'

  if (format === 'table' || format === 'both') {
    console.log('')
    console.log(formatTable(metrics))
    console.log('')
  }

  if (format === 'jsonl' || format === 'both') {
    const jsonl = formatJsonl(results)
    if (config?.outputPath) {
      fs.writeFileSync(config.outputPath, jsonl + '\n', 'utf-8')
      console.log(`JSONL results written to ${config.outputPath}`)
    } else {
      console.log(jsonl)
    }
  }

  // Print summary
  const totalScenarios = metrics.length
  const totalRuns = metrics.reduce((s, m) => s + m.totalRuns, 0)
  const totalPassed = metrics.reduce((s, m) => s + Math.round(m.passRate * m.totalRuns), 0)
  const totalErrors = metrics.reduce((s, m) => s + m.errors, 0)

  console.log(`Summary: ${totalScenarios} scenarios, ${totalRuns} runs, ${totalPassed}/${totalRuns} passed, ${totalErrors} errors`)
}
