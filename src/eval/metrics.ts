import { EvalRunResult, ScenarioMetrics } from './types.js'

/**
 * Aggregate multiple run results into a single ScenarioMetrics object.
 * Groups results by scenario name and computes averages, pass rate, and error count.
 */
export function aggregateMetrics(results: EvalRunResult[]): ScenarioMetrics[] {
  const grouped = new Map<string, EvalRunResult[]>()

  for (const r of results) {
    const existing = grouped.get(r.scenario)
    if (existing) {
      existing.push(r)
    } else {
      grouped.set(r.scenario, [r])
    }
  }

  const metrics: ScenarioMetrics[] = []

  for (const [name, runs] of grouped) {
    const totalRuns = runs.length
    const passCount = runs.filter(r => r.pass).length
    const errorCount = runs.filter(r => r.error).length

    metrics.push({
      name,
      totalRuns,
      passRate: totalRuns > 0 ? passCount / totalRuns : 0,
      avgToolRounds: totalRuns > 0 ? runs.reduce((s, r) => s + r.toolRounds, 0) / totalRuns : 0,
      avgInputTokens: totalRuns > 0 ? runs.reduce((s, r) => s + r.inputTokens, 0) / totalRuns : 0,
      avgOutputTokens: totalRuns > 0 ? runs.reduce((s, r) => s + r.outputTokens, 0) / totalRuns : 0,
      avgElapsedMs: totalRuns > 0 ? runs.reduce((s, r) => s + r.elapsedMs, 0) / totalRuns : 0,
      errors: errorCount,
    })
  }

  // Sort by scenario name for deterministic output
  metrics.sort((a, b) => a.name.localeCompare(b.name))

  return metrics
}
