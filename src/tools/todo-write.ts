import { z } from 'zod'
import { ToolSpec } from './base.js'

export const todoWriteTool: ToolSpec = {
  name: 'todo_write',
  description: 'Update the task list. Use to track progress on multi-step tasks.',
  schema: z.object({
    todos: z.array(z.object({ content: z.string().min(1), status: z.enum(['pending', 'in_progress', 'completed']), activeForm: z.string().min(1) })).describe('Updated todo list'),
  }),
  execute: async (params) => {
    const completed = params.todos.filter((t: any) => t.status === 'completed').length
    const total = params.todos.length
    const inProgress = params.todos.find((t: any) => t.status === 'in_progress')
    return { output: `Task list updated: ${completed}/${total} completed${inProgress ? `, working on: ${inProgress.activeForm}` : ''}`, metadata: { todos: params.todos } }
  },
}
