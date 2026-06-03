/** Eval scenario mock tool definition */
export interface EvalToolDef {
  name: string;
  description: string;
  handler: (args: any) => string | Promise<string>;
  parameterSchema: Record<string, any>;
}

/** Single eval scenario */
export interface EvalScenario {
  name: string;
  description: string;
  tags: string[];
  tools: EvalToolDef[];
  userMessage: string;
  /** Validate that the tool call sequence is correct */
  validate: (calls: Array<{ name: string; input: any; output: string }>) => boolean;
  maxRounds?: number;
  expectCompletion?: boolean;
}

/** Single run result */
export interface EvalRunResult {
  scenario: string;
  pass: boolean;
  toolRounds: number;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
  error?: string;
  toolCalls: Array<{ name: string; input: any; output: string }>;
}

/** Aggregated metrics per scenario */
export interface ScenarioMetrics {
  name: string;
  totalRuns: number;
  passRate: number;
  avgToolRounds: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgElapsedMs: number;
  errors: number;
}

/** Eval configuration */
export interface EvalConfig {
  runsPerScenario?: number;
  verbose?: boolean;
  outputFormat?: 'table' | 'jsonl' | 'both';
  outputPath?: string;
}

/** Internal representation of a tool call for eval validation */
export interface EvalToolCallRecord {
  name: string;
  input: Record<string, any>;
  output: string;
  isError: boolean;
}
