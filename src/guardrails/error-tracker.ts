export class ErrorTracker {
  private consecutiveRetries = 0;
  private consecutiveToolErrors = 0;

  constructor(
    public readonly maxRetries = 3,
    public readonly maxToolErrors = 2,
  ) {}

  recordRetry(): void {
    this.consecutiveRetries++
  }

  recordToolError(): void {
    this.consecutiveToolErrors++
  }

  reset(): void {
    this.consecutiveRetries = 0;
    this.consecutiveToolErrors = 0;
  }

  get retriesExhausted(): boolean {
    return this.consecutiveRetries >= this.maxRetries
  }

  get toolErrorsExhausted(): boolean {
    return this.consecutiveToolErrors >= this.maxToolErrors
  }
}
