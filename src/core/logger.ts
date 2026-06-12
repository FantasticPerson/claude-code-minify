import type { LogCategory, DebugConfig } from './types.js'

const ALL_CATEGORIES: readonly LogCategory[] = ['engine', 'provider', 'tools', 'context', 'guardrails', 'memory', 'config', 'skills']

const SENSITIVE_KEYS = /^(apiKey|token|password|secret|authorization)$/i

function sanitize(key: string, value: unknown): unknown {
  if (typeof key === 'string' && SENSITIVE_KEYS.test(key)) return '[REDACTED]'
  return value
}

function formatData(data: unknown): string {
  if (typeof data === 'object' && data !== null) return JSON.stringify(data, sanitize, 2)
  return String(data)
}

class Logger {
  private enabled = false
  private categories = new Set<LogCategory>()

  init(config?: DebugConfig): void {
    this.enabled = config?.enabled ?? false
    this.categories = new Set(config?.categories ?? ALL_CATEGORIES)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  log(category: LogCategory, message: string, data?: unknown): void {
    if (!this.enabled || !this.categories.has(category)) return
    const ts = new Date().toISOString().slice(11, 23)
    const prefix = `[${ts}][${category}]`
    if (data !== undefined) {
      console.log(prefix, message, formatData(data))
    } else {
      console.log(prefix, message)
    }
  }

  error(category: LogCategory, message: string, data?: unknown): void {
    if (!this.enabled || !this.categories.has(category)) return
    const ts = new Date().toISOString().slice(11, 23)
    const prefix = `[${ts}][${category}]`
    if (data !== undefined) {
      console.error(prefix, message, formatData(data))
    } else {
      console.error(prefix, message)
    }
  }
}

export const logger = new Logger()
