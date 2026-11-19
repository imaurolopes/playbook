export const artifactNames = { agents: 'AGENTS.md', prompt: 'PROMPT.md', checklist: 'CHECKLIST.md' } as const
export type ArtifactKind = keyof typeof artifactNames
export const artifactKinds = Object.keys(artifactNames) as ArtifactKind[]

export const templateSections = {
  objective: 'Objective', context: 'Technical context', standards: 'Playbook standards',
  dependencies: 'Dependencies', project: 'Project', plan: 'Implementation tasks',
  guidance: 'Implementation guidance', constraints: 'Constraints', references: 'References',
  request: 'Implementation request', outcome: 'Expected outcome', steps: 'Implementation steps',
  deliverables: 'Deliverables', checklist: 'Implementation checklist', validation: 'Validation requirements',
} as const

export type TemplateSection = keyof typeof templateSections
export type TemplateSections = Record<ArtifactKind, TemplateSection[]>
export interface GenerationTemplate {
  id: string
  name: string
  description: string
  sections: TemplateSections
  createdAt: string
  updatedAt: string
  isSystem: boolean
}

export const availableSections: TemplateSections = {
  agents: ['objective', 'context', 'standards', 'dependencies', 'project', 'plan', 'guidance', 'constraints', 'references'],
  prompt: ['request', 'outcome', 'context', 'steps', 'deliverables'],
  checklist: ['checklist', 'validation'],
}

export const defaultGenerationTemplate: GenerationTemplate = {
  id: 'default', name: 'Default Playbook template', description: 'Generate an agent brief, an implementation prompt, and a validation checklist.',
  sections: availableSections, isSystem: true,
  createdAt: '2026-11-19T00:00:00.000Z', updatedAt: '2026-11-19T00:00:00.000Z',
}

export type TemplateInput = Pick<GenerationTemplate, 'name' | 'description' | 'sections'>

export function validTemplateSections(value: unknown): value is TemplateSections {
  if (!value || typeof value !== 'object') return false
  const sections = value as Record<string, unknown>
  return artifactKinds.every(artifact => {
    const list = sections[artifact]
    return Array.isArray(list) && list.every(section => availableSections[artifact].includes(section)) &&
      new Set(list).size === list.length
  })
}
