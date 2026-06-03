import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getAllSkills, findMatchingSkills } from '../src/skills/index.js'
import { loadSkills } from '../src/skills/loader.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const tmpDir = path.join(os.tmpdir(), `test-skills-loader-${Date.now()}`)

beforeAll(async () => {
  // Create a temporary custom skills directory with a subdirectory + SKILL.md
  const skillDir = path.join(tmpDir, 'custom-skills', 'my-test-skill')
  await fs.mkdir(skillDir, { recursive: true })
  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---
name: my-test-skill
description: A custom test skill for verifying loader
triggers: test,custom,verify
---
# My Test Skill

This is the body of the test skill.

Steps:
1. Do something
2. Verify it works
`
  )
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('getAllSkills', () => {
  it('loads built-in skills including brainstorming', async () => {
    const skills = await getAllSkills()
    const names = skills.map(s => s.name)
    expect(names).toContain('brainstorming')
    expect(names).toContain('frontend-design')
    expect(names).toContain('debugging')
    expect(names).toContain('tdd')
    expect(names).toContain('simplify')
    expect(names).toContain('verify')
  })

  it('each skill has name, description, content, and triggerPatterns', async () => {
    const skills = await getAllSkills()
    for (const skill of skills) {
      expect(skill).toHaveProperty('name')
      expect(skill).toHaveProperty('description')
      expect(skill).toHaveProperty('content')
      expect(skill).toHaveProperty('triggerPatterns')
      expect(Array.isArray(skill.triggerPatterns)).toBe(true)
    }
  })

  it('without custom skillsDir returns only built-in skills', async () => {
    const skills = await getAllSkills()
    const names = skills.map(s => s.name)
    expect(names).toHaveLength(6) // 6 built-in skills
    expect(names).not.toContain('my-test-skill')
  })

  it('with custom skillsDir loads additional skills', async () => {
    const skills = await getAllSkills(path.join(tmpDir, 'custom-skills'))
    const names = skills.map(s => s.name)
    expect(names).toContain('my-test-skill')
    // Built-in skills are still present
    expect(names).toContain('brainstorming')
  })

  it('custom skill has correct name and description from frontmatter', async () => {
    const skills = await getAllSkills(path.join(tmpDir, 'custom-skills'))
    const custom = skills.find(s => s.name === 'my-test-skill')
    expect(custom).toBeDefined()
    expect(custom!.description).toBe('A custom test skill for verifying loader')
  })

  it('custom skill triggerPatterns are parsed from frontmatter', async () => {
    const skills = await getAllSkills(path.join(tmpDir, 'custom-skills'))
    const custom = skills.find(s => s.name === 'my-test-skill')
    expect(custom!.triggerPatterns).toContain('test')
    expect(custom!.triggerPatterns).toContain('custom')
    expect(custom!.triggerPatterns).toContain('verify')
  })

  it('custom skill content is the body after frontmatter', async () => {
    const skills = await getAllSkills(path.join(tmpDir, 'custom-skills'))
    const custom = skills.find(s => s.name === 'my-test-skill')
    expect(custom!.content).toContain('This is the body of the test skill')
    expect(custom!.content).not.toContain('---')
    expect(custom!.content).not.toContain('name: my-test-skill')
  })
})

describe('findMatchingSkills', () => {
  it('matches by skill name', () => {
    const skills = [
      { name: 'brainstorming', description: 'Design stuff', content: '', triggerPatterns: ['design'] },
    ]
    const matches = findMatchingSkills(skills, 'use brainstorming skill')
    expect(matches).toHaveLength(1)
    expect(matches[0].name).toBe('brainstorming')
  })

  it('matches by trigger pattern', () => {
    const skills = [
      { name: 'debugging', description: 'Debug', content: '', triggerPatterns: ['debug', 'fix'] },
    ]
    const matches = findMatchingSkills(skills, 'I need to debug this issue')
    expect(matches).toHaveLength(1)
  })

  it('matches by description', () => {
    const skills = [
      { name: 'custom', description: 'analyze performance', content: '', triggerPatterns: [] },
    ]
    const matches = findMatchingSkills(skills, 'help me analyze performance')
    expect(matches).toHaveLength(1)
  })

  it('returns empty array when no match', () => {
    const skills = [
      { name: 'brainstorming', description: 'Design', content: '', triggerPatterns: ['design'] },
    ]
    const matches = findMatchingSkills(skills, 'deploy to production')
    expect(matches).toHaveLength(0)
  })
})

describe('loadSkills', () => {
  it('returns empty array for nonexistent directory', async () => {
    const skills = await loadSkills('/nonexistent/path')
    expect(skills).toEqual([])
  })

  it('returns empty array when no skillsDir provided', async () => {
    const skills = await loadSkills()
    expect(skills).toEqual([])
  })

  it('ignores files that are not directories', async () => {
    // Create a stray .md file directly in the skills dir
    const strayDir = path.join(tmpDir, 'stray-skills')
    await fs.mkdir(strayDir, { recursive: true })
    await fs.writeFile(path.join(strayDir, 'orphan.md'), 'not a skill')

    const skills = await loadSkills(strayDir)
    expect(skills).toHaveLength(0)
  })
})
