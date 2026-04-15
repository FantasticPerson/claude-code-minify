import { Skill } from '../core/types.js'
import { loadSkills, findMatchingSkills } from './loader.js'

const BUILTIN_SKILLS: Skill[] = [
  {
    name: 'brainstorming',
    description: 'Requirements analysis and solution design before implementation',
    content: `# Brainstorming\n\nBefore implementing any feature:\n1. Understand the user's goal and constraints\n2. Ask clarifying questions one at a time\n3. Propose 2-3 approaches with trade-offs\n4. Get user approval before proceeding`,
    triggerPatterns: ['brainstorm', 'design', 'plan', 'requirements'],
  },
  {
    name: 'frontend-design',
    description: 'Generate production-grade frontend interfaces',
    content: `# Frontend Design\n\n1. Use modern frameworks (React, Vue, etc.)\n2. Follow responsive design\n3. Ensure accessibility\n4. Use consistent styling\n5. Generate complete, runnable components\n6. Include TypeScript types`,
    triggerPatterns: ['frontend', 'UI', 'component', 'page', 'layout'],
  },
  {
    name: 'debugging',
    description: 'Systematic debugging before proposing fixes',
    content: `# Systematic Debugging\n\n1. Reproduce the error first\n2. Read the full error message\n3. Identify root cause before fixing\n4. Make minimal, targeted fixes\n5. Verify the fix works`,
    triggerPatterns: ['debug', 'fix', 'error', 'bug', 'crash'],
  },
  {
    name: 'tdd',
    description: 'Test-driven development workflow',
    content: `# TDD\n\n1. Write failing test first\n2. Run to confirm it fails\n3. Write minimal code to pass\n4. Run tests to confirm pass\n5. Refactor if needed\n6. Repeat`,
    triggerPatterns: ['test', 'TDD', 'spec'],
  },
  {
    name: 'simplify',
    description: 'Code review for reuse, quality, and efficiency',
    content: `# Simplify\n\nReview for:\n1. Reuse opportunities\n2. Quality issues (bugs, edge cases, security)\n3. Efficiency improvements`,
    triggerPatterns: ['simplify', 'review', 'refactor', 'cleanup'],
  },
  {
    name: 'verify',
    description: 'Verify work is complete before claiming success',
    content: `# Verify\n\n1. Run build/compile\n2. Run existing tests\n3. Check for lint errors\n4. Verify core functionality\n5. Report success only with evidence`,
    triggerPatterns: ['verify', 'check', 'done', 'complete'],
  },
]

export async function getAllSkills(customSkillsDir?: string): Promise<Skill[]> {
  const customSkills = await loadSkills(customSkillsDir)
  return [...BUILTIN_SKILLS, ...customSkills]
}

export { findMatchingSkills }
