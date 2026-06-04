import { ToolUseBlock, GuardrailsConfig } from '../core/types.js'
import { Nudge, NudgeKind } from './nudge.js'
import { ResponseValidator } from './validator.js'
import { ErrorTracker } from './error-tracker.js'

export type CheckAction = "execute" | "retry" | "tool_error" | "fatal";

export interface CheckResult {
  action: CheckAction;
  toolCalls?: ToolUseBlock[];
  nudge?: Nudge;
  reason?: string;
}

export class GuardrailsMiddleware {
  private validator: ResponseValidator;
  private errorTracker: ErrorTracker;
  private readonly rescueEnabled: boolean;

  constructor(toolNames: string[], config?: GuardrailsConfig) {
    const maxRetries = config?.maxRetries ?? 3;
    const maxToolErrors = config?.maxToolErrors ?? 2;
    this.rescueEnabled = config?.rescueEnabled ?? true;
    this.validator = new ResponseValidator(toolNames, this.rescueEnabled);
    this.errorTracker = new ErrorTracker(maxRetries, maxToolErrors);
  }

  check(toolCalls: ToolUseBlock[] | null, rawContent?: string): CheckResult {
    const validationResult = this.validator.validate(toolCalls, rawContent);

    if (validationResult.needsRetry) {
      const nudge = validationResult.nudge!;

      // Check if already exhausted from previous calls
      if (this.errorTracker.retriesExhausted) {
        return { action: 'fatal', reason: 'Too many retries' };
      }
      if (this.errorTracker.toolErrorsExhausted) {
        return { action: 'fatal', reason: 'Too many tool errors' };
      }

      // Record the appropriate error type
      if (
        nudge.kind === NudgeKind.ToolArgValidation ||
        nudge.kind === NudgeKind.UnknownTool
      ) {
        this.errorTracker.recordToolError();
      } else {
        this.errorTracker.recordRetry();
      }

      // Not exhausted — return retry or tool_error
      const action: CheckAction =
        nudge.kind === NudgeKind.UnknownTool ||
        nudge.kind === NudgeKind.ToolArgValidation
          ? 'tool_error'
          : 'retry';

      return { action, nudge };
    }

    // No retry needed — reset error counters and execute
    this.errorTracker.reset();
    return { action: 'execute', toolCalls: validationResult.toolCalls ?? undefined };
  }

  recordSuccess(): void {
    this.errorTracker.reset();
  }

  updateToolNames(toolNames: string[]): void {
    this.validator = new ResponseValidator(toolNames, this.rescueEnabled);
  }
}
