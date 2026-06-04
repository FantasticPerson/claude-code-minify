// SDK
export const DEFAULT_MAX_TOKENS = 4096
export const DEFAULT_MAX_TOOL_ROUNDS = 50
export const DEFAULT_CONTEXT_WINDOW = 200000
export const DEFAULT_AUTO_LOAD_CLAUDE_MD = true

// Context
export const DEFAULT_COMPRESS_TRIGGER_RATIO = 0.8
export const DEFAULT_COMPRESS_TARGET_RATIO = 0.6
export const DEFAULT_COMPRESS_RECENT_ROUNDS = 6
export const DEFAULT_TOOL_RESULT_COMPRESS_THRESHOLD = 500

// Bash
export const DEFAULT_BASH_TIMEOUT = 120000
export const DEFAULT_BASH_MAX_TIMEOUT = 600000
export const DEFAULT_BASH_MAX_BUFFER = 10 * 1024 * 1024
export const DEFAULT_BASH_TRUNCATE_LIMIT = 50000

// Grep
export const DEFAULT_GREP_TIMEOUT = 30000
export const DEFAULT_GREP_MAX_COLUMNS = 500
export const DEFAULT_GREP_MAX_BUFFER = 5 * 1024 * 1024
export const DEFAULT_GREP_SKIP_DIRS = ['.git']

// Glob
export const DEFAULT_GLOB_MAX_RESULTS = 100
export const DEFAULT_GLOB_SKIP_DIRS = ['node_modules', '.git']

// Read
export const DEFAULT_READ_MAX_FILE_SIZE = 1024 * 1024

// Write (no limit by default)
// DEFAULT_WRITE_MAX_FILE_SIZE = Infinity (no constant needed)

// Edit
export const DEFAULT_EDIT_MAX_FILE_SIZE = 10 * 1024 * 1024

// Guardrails
export const DEFAULT_GUARDRAILS_MAX_RETRIES = 3
export const DEFAULT_GUARDRAILS_MAX_TOOL_ERRORS = 2
export const DEFAULT_GUARDRAILS_RESCUE_ENABLED = true
