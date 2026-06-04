export const NudgeTemplates = {
  retry(rawResponse: string): string {
    return `Your response did not contain a tool call. You must respond with a tool call using the specified tools. Raw response: ${rawResponse}`;
  },

  unknownTool(attempted: string, available: string[]): string {
    const availableStr = available.join(', ');
    return `Unknown tool: "${attempted}". The available tools are: ${availableStr}. Please use one of the available tools.`;
  },

  toolArgValidation(toolName: string, gotArgs: unknown): string {
    return `Tool "${toolName}" received invalid arguments. Arguments must be a valid JSON object. Received: ${String(gotArgs)}`;
  },
};
