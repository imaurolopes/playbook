export interface AgentProfile {
  id: string
  name: string
  description: string
  outputFilename: string
  headings: { context: string; plan: string; guidance: string }
}

export const agentProfiles = [
  {
    id: 'generic', name: 'Generic Markdown', description: 'A portable Markdown brief for any coding agent.',
    outputFilename: 'instructions.md',
    headings: { context: 'Context', plan: 'Implementation plan', guidance: 'Technical decisions' },
  },
  {
    id: 'codex', name: 'OpenAI Codex', description: 'A topic brief organized for an AGENTS.md document.',
    outputFilename: 'AGENTS.md',
    headings: { context: 'Purpose and context', plan: 'Implementation tasks', guidance: 'Implementation guidance' },
  },
  {
    id: 'claude-code', name: 'Claude Code', description: 'A topic brief organized for a CLAUDE.md document.',
    outputFilename: 'CLAUDE.md',
    headings: { context: 'Project context', plan: 'Implementation plan', guidance: 'Technical guidance' },
  },
  {
    id: 'cursor', name: 'Cursor', description: 'A Markdown brief for use as context in Cursor.',
    outputFilename: 'cursor.md',
    headings: { context: 'Technical context', plan: 'Implementation steps', guidance: 'Implementation guidance' },
  },
] as const satisfies readonly AgentProfile[]

export function getAgentProfile(id: string | null): AgentProfile | undefined {
  return agentProfiles.find(profile => profile.id === id)
}

export interface InstructionKey {
  topicId: string
  projectId?: string
  agentProfileId: string
}

export interface InstructionDraft extends InstructionKey {
  generatedMarkdown: string
  markdown: string
  lastGeneratedAt: string
  lastEditedAt?: string
  manuallyEdited: boolean
  artifacts?: { prompt: string; checklist: string }
  yaml?: string
}

export const usageContexts = { topic: 'Topic only', project: 'Topic + Project', implementation: 'Topic + Implementation' } as const
export type UsageContext = keyof typeof usageContexts

export interface InstructionSettings {
  objective?: string
  usage?: UsageContext
  templateId?: string
}

export function instructionKey(key: InstructionKey) {
  return JSON.stringify([key.topicId, key.projectId ?? null, key.agentProfileId])
}

export interface InstructionOptions {
  content: boolean
  dependencies: boolean
  plan: boolean
  criteria: boolean
}

export const defaultInstructionOptions: InstructionOptions = {
  content: true, dependencies: true, plan: true, criteria: true,
}

export function instructionFilename(title: string, profile: AgentProfile) {
  const slug = title.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '')
  return `${slug || 'topic'}-${profile.outputFilename}`
}
