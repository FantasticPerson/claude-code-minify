import { z } from 'zod'
import { ToolSpec } from './base.js'

export const askUserTool: ToolSpec = {
  name: 'ask_user',
  description: 'Ask the user a question and wait for their response.',
  schema: z.object({ question: z.string().describe('The question to ask') }),
  execute: async (params) => {
    return { output: params.question, metadata: { needsUserResponse: true } }
  },
}
