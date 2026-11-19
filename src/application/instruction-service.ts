import { getAgentProfile, type InstructionDraft, type InstructionKey, type InstructionOptions, type InstructionSettings } from '../domain/agent-instructions'
import { defaultGenerationTemplate, validTemplateSections, type GenerationTemplate, type TemplateInput } from '../domain/generation-template'
import { generateInstructions } from './generate-instructions'
import type { ImplementationRepository } from './implementation-repository'
import type { InstructionRepository } from './instruction-repository'
import { collectInstructionSource } from './instruction-source'
import type { TopicRepository } from './topic-repository'

export class RegenerationConfirmationRequired extends Error {
  constructor(readonly draft: InstructionDraft) {
    super('Confirm before replacing your manual edits.')
  }
}

export class InstructionService {
  constructor(private readonly repository: InstructionRepository &
    Pick<TopicRepository, 'readWorkspace'> & Pick<ImplementationRepository, 'readImplementations'>) {}

  async projects() {
    return (await this.repository.readImplementations()).projects
  }

  async load(key: InstructionKey) {
    const [draft, implementations] = await Promise.all([
      this.repository.readInstructionDraft(key),
      this.repository.readImplementations(),
    ])
    return { draft, hasImplementation: implementations.implementations.some(item =>
      item.topicId === key.topicId && item.projectId === key.projectId,
    ) }
  }

  settings(key: InstructionKey) {
    return this.repository.readInstructionSettings(key)
  }

  saveSettings(key: InstructionKey, changes: InstructionSettings) {
    return this.repository.updateInstructionSettings(key, changes)
  }

  async templates() {
    return [structuredClone(defaultGenerationTemplate), ...await this.repository.listGenerationTemplates()]
  }

  async saveTemplate(input: TemplateInput, id?: string) {
    const name = input.name.trim()
    if (!name) throw new Error('Enter a template name.')
    if (!validTemplateSections(input.sections)) throw new Error('Choose valid template sections.')
    const current = id ? (await this.templates()).find(template => template.id === id) : undefined
    if (id && !current) throw new Error('This template no longer exists.')
    if (current?.isSystem) throw new Error('The system template cannot be overwritten.')
    const now = new Date().toISOString()
    const template: GenerationTemplate = {
      name, description: input.description.trim(), sections: input.sections,
      id: current?.id ?? crypto.randomUUID(), createdAt: current?.createdAt ?? now, updatedAt: now, isSystem: false,
    }
    return this.repository.writeGenerationTemplate(template, !current)
  }

  async duplicateTemplate(id: string) {
    const template = (await this.templates()).find(item => item.id === id)
    if (!template) throw new Error('This template no longer exists.')
    return this.saveTemplate({ ...template, name: template.name + ' (copy)' })
  }

  deleteTemplate(id: string) {
    return this.repository.deleteGenerationTemplate(id)
  }

  async generate(key: InstructionKey, options: InstructionOptions, confirmed?: InstructionDraft) {
    const profile = getAgentProfile(key.agentProfileId)
    if (!profile) throw new Error('Choose an agent profile.')
    const [topics, implementations, settings, templates] = await Promise.all([
      this.repository.readWorkspace(), this.repository.readImplementations(), this.settings(key), this.templates(),
    ])
    const template = templates.find(item => item.id === settings.templateId) ?? defaultGenerationTemplate
    const { agents: generatedMarkdown, yaml, ...artifacts } = generateInstructions(
      collectInstructionSource(key, topics, implementations), options, profile, settings, template,
    )

    return this.repository.updateInstructionDraft(key, current => {
      if (current?.manuallyEdited && (confirmed?.markdown !== current.markdown ||
        confirmed.lastEditedAt !== current.lastEditedAt || confirmed.lastGeneratedAt !== current.lastGeneratedAt)) {
        throw new RegenerationConfirmationRequired(current)
      }
      return { ...key, generatedMarkdown, markdown: generatedMarkdown, artifacts, yaml, lastGeneratedAt: new Date().toISOString(), manuallyEdited: false }
    })
  }

  saveEdit(key: InstructionKey, markdown: string) {
    return this.repository.updateInstructionDraft(key, current => {
      if (!current) throw new Error('Generate instructions before editing.')
      if (current.markdown === markdown) return current
      return { ...current, markdown, lastEditedAt: new Date().toISOString(), manuallyEdited: true }
    })
  }
}
