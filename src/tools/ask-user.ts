import { z } from 'zod'
import { ToolSpec } from './base.js'

export const askUserTool: ToolSpec = {
  name: 'ask_user',
  description: 'Ask the user a question and wait for their response.',
  schema: z.object({ question: z.string().describe('The question to ask') }),
  execute: async (params, ctx) => {
    if (ctx?.askUserCallback) {
      try {
        const answer = await ctx.askUserCallback(params.question)
        return { output: answer }
      } catch (err) {
        return { output: `Error: failed to get user response: ${(err as Error).message}`, isError: true }
      }
    }
    return { output: 'Error: no user interaction callback configured for ask_user tool', isError: true, metadata: { needsUserResponse: true } }
  },
}
