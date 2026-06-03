export const enum NudgeKind {
  Retry = "retry",
  UnknownTool = "unknown_tool",
  ToolArgValidation = "tool_arg_validation",
  Step = "step",
}

export class Nudge {
  constructor(
    public readonly role: "user" | "tool",
    public readonly content: string,
    public readonly kind: NudgeKind,
  ) {}
}
