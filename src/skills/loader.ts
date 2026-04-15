import * as fs from 'fs/promises'
import * as path from 'path'
import { Skill } from '../core/types.js'

export async function loadSkills(skillsDir?: string): Promise<Skill[]> {
  const skills: Skill[] = []
  if (skillsDir) {
    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skill = await loadSkillFile(path.join(skillsDir, entry.name, 'SKILL.md'), entry.name)
          if (skill) skills.push(skill)
        }
      }
    } catch {}
  }
  return skills
}

async function loadSkillFile(filePath: string, defaultName: string): Promise<Skill | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(content)
    return {
      name: frontmatter.name || defaultName,
      description: frontmatter.description || '',
      content: body.trim(),
      triggerPatterns: (frontmatter.triggers || '').split(',').map((s: string) => s.trim()).filter(Boolean),
    }
  } catch { return null }
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }
  const frontmatter: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) frontmatter[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim()
  }
  return { frontmatter, body: match[2] }
}

export function findMatchingSkills(skills: Skill[], query: string): Skill[] {
  const lower = query.toLowerCase()
  return skills.filter(s =>
    lower.includes(s.name.toLowerCase()) ||
    s.triggerPatterns.some(p => lower.includes(p.toLowerCase())) ||
    lower.includes(s.description.toLowerCase())
  )
}
