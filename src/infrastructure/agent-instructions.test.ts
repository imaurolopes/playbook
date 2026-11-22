import { beforeEach, describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'
import { ImplementationService } from '../application/implementation-service'
import { InstructionService, RegenerationConfirmationRequired } from '../application/instruction-service'
import { TopicService } from '../application/topic-service'
import { agentProfiles, defaultInstructionOptions, getAgentProfile, instructionFilename, type InstructionKey } from '../domain/agent-instructions'
import { defaultGenerationTemplate, type TemplateInput } from '../domain/generation-template'
import type { Topic } from '../domain/topic'
import { LocalStorageTopicRepository, TOPIC_STORAGE_KEY } from './local-storage-topic-repository'

const date = '2026-11-19T12:00:00.000Z'
const topic: Topic = {
  id: 'cdc', title: 'Change Data Capture (CDC)',
  description: 'Replicate database changes.', content: '### Standards\n\nRetain source offsets.',
  createdAt: date, updatedAt: date,
}
const ingestion = { ...topic, id: 'ingestion', title: 'Data Ingestion', content: 'Do not expand this topic content.' }
const streaming = { ...topic, id: 'streaming', title: 'Event Streaming' }
const indirect = { ...topic, id: 'indirect', title: 'Indirect upstream topic' }
const downstream = { ...topic, id: 'downstream', title: 'Downstream consumer' }
const azure = 'azure-data-platform'
const aws = 'aws-data-platform'
const key: InstructionKey = { topicId: topic.id, projectId: azure, agentProfileId: 'generic' }

describe('agent instructions', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => { entries.set(name, value) },
  }
  const repository = new LocalStorageTopicRepository(() => storage, [topic, ingestion, streaming, indirect, downstream])
  const instructions = new InstructionService(repository)
  const plans = new ImplementationService(repository)
  const topics = new TopicService(repository)

  beforeEach(() => entries.clear())

  async function addSource() {
    await topics.addRelationship({ sourceTopicId: topic.id, targetTopicId: ingestion.id, type: 'dependency', description: 'CDC reads ingestion offsets.' })
    await topics.addRelationship({ sourceTopicId: streaming.id, targetTopicId: topic.id, type: 'related' })
    await topics.addRelationship({ sourceTopicId: ingestion.id, targetTopicId: indirect.id, type: 'dependency' })
    await topics.addRelationship({ sourceTopicId: downstream.id, targetTopicId: topic.id, type: 'dependency' })
    await plans.createImplementation(topic.id, azure)
    const [plan] = (await plans.list()).implementations
    if (!plan) throw new Error('Expected an implementation.')
    await plans.updateImplementation(plan.id, { environment: 'staging', branch: 'feature/cdc', notes: 'Use the established ingestion schema.' })
    const first = await plans.createTask(plan.id, { title: 'Configure CDC source', description: 'Read from the database log.', status: 'done' })
    const second = await plans.createTask(plan.id, { title: 'Implement event processing', description: 'Normalize incoming events.', status: 'todo' })
    await plans.moveTaskTo(second, first)
    await plans.addCriterion(second, 'Retain the source key.')
    await plans.addCriterion(second, 'Record the offset.')
    const [criterion] = (await plans.list()).tasks.find(task => task.id === second)!.criteria
    await plans.updateCriterion(second, criterion!.id, { completed: true })
    await plans.changeTaskDetails(second, { kind: 'moveCriterion', id: criterion!.id, direction: 1 })
    await plans.changeTaskDetails(second, { kind: 'addDependency', id: first })
    await plans.saveReference(second, { kind: 'topic', topicId: streaming.id })
    await plans.saveReference(second, { kind: 'url', title: 'CDC spec', url: 'https://example.com/specification' })
    await plans.saveArtifact(plan.id, { type: 'documentation', title: 'CDC runbook', url: 'https://example.com/runbook' })
  }

  it('generates deterministic Markdown from the current task order and direct relationships', async () => {
    await addSource()
    const draft = await instructions.generate(key, defaultInstructionOptions)
    const generated = draft.markdown
    expect(generated).toEqual((await instructions.generate(key, defaultInstructionOptions)).markdown)
    expect(generated).toContain('# Change Data Capture (CDC)\n\nTopic ID: cdc')
    expect(generated).toContain('## Context\n\nReplicate database changes.')
    expect(generated).toContain(topic.content)
    expect(generated).toContain('## Direct dependencies\n\n- Data Ingestion — CDC reads ingestion offsets.')
    expect(generated).toContain('## Related topics\n\n- Event Streaming')
    expect(generated).not.toMatch(/Indirect upstream topic|Downstream consumer|Do not expand/)
    expect(generated).toContain('Project: Azure Data Platform')
    expect(generated).toContain('Environment: Staging')
    expect(generated).toContain('Branch: feature/cdc')
    expect(generated).toContain('1. **Implement event processing** (Todo)')
    expect(generated).toContain('2. **Configure CDC source** (Done)')
    expect(generated).toContain('Normalize incoming events.')
    expect(generated).toContain('Depends on: Configure CDC source')
    expect(generated).toContain('- [ ] Record the offset.\n   - [x] Retain the source key.')
    expect(generated).toContain('[CDC spec](<https://example.com/specification>)')
    expect(generated).toContain('[CDC runbook](<https://example.com/runbook>)')
    expect(generated).toContain('Use the established ingestion schema.')
    expect(draft.generatedMarkdown).toBe(generated)
  })

  it('honors inclusion options and generates from sparse sources without creating an implementation', async () => {
    await addSource()
    const hidden = (await instructions.generate(key, { content: false, dependencies: false, plan: false, criteria: true })).markdown
    expect(hidden).toContain('Project: Azure Data Platform')
    expect(hidden).not.toMatch(/Retain source offsets|Direct dependencies|Related topics|Implementation plan|Environment:|Acceptance criteria|Technical resources/)
    const withoutCriteria = (await instructions.generate(key, { ...defaultInstructionOptions, criteria: false })).markdown
    expect(withoutCriteria).toContain('Implementation plan')
    expect(withoutCriteria).not.toContain('Acceptance criteria')
    const withoutDependencies = (await instructions.generate(key, { ...defaultInstructionOptions, dependencies: false })).markdown
    expect(withoutDependencies).toContain('Implementation plan')
    expect(withoutDependencies).not.toMatch(/Direct dependencies|Related topics|Depends on:/)

    const noPlan = { ...key, projectId: aws }
    const before = await plans.list()
    expect(await instructions.load(noPlan)).toEqual({ hasImplementation: false, draft: undefined })
    expect((await instructions.generate(noPlan, defaultInstructionOptions)).markdown).not.toContain('Implementation plan')
    expect((await instructions.generate({ ...key, projectId: undefined }, defaultInstructionOptions)).markdown).not.toContain('## Project')
    expect(await plans.list()).toEqual(before)
  })

  it('uses the selected profiles for section headings and meaningful Markdown export names', async () => {
    await addSource()
    for (const profile of agentProfiles) {
      expect(getAgentProfile(profile.id)).toEqual(profile)
      const draft = await instructions.generate({ ...key, agentProfileId: profile.id }, defaultInstructionOptions)
      expect(draft.markdown).toContain('## ' + profile.headings.context)
      expect(draft.markdown).toContain('## ' + profile.headings.plan)
      expect(draft.markdown).toContain('## ' + profile.headings.guidance)
      expect(instructionFilename('Change Data Capture / CDC', profile)).toBe('change-data-capture-cdc-' + profile.outputFilename)
    }
    expect(instructionFilename('////', agentProfiles[0])).toBe('topic-instructions.md')
    await expect(instructions.generate({ ...key, agentProfileId: 'missing' }, defaultInstructionOptions)).rejects.toThrow('agent profile')
  })

  it('persists independent drafts across topic, project and profile switches and preserves manual Markdown', async () => {
    const contexts = [key, { ...key, projectId: aws }, { ...key, projectId: undefined }, { ...key, agentProfileId: 'codex' }, { ...key, topicId: streaming.id }]
    for (const [index, context] of contexts.entries()) {
      await instructions.generate(context, defaultInstructionOptions)
      await instructions.saveEdit(context, '# Draft ' + index + '\n\nEdited Markdown.\n')
    }
    const reopened = new InstructionService(new LocalStorageTopicRepository(() => storage))
    for (const [index, context] of contexts.entries()) {
      const { draft } = await reopened.load(context)
      expect(draft).toMatchObject({
        markdown: '# Draft ' + index + '\n\nEdited Markdown.\n', manuallyEdited: true,
        lastEditedAt: expect.any(String), lastGeneratedAt: expect.any(String),
      })
      expect(draft?.generatedMarkdown).not.toEqual(draft?.markdown)
    }
    await plans.deleteProject(aws)
    await topics.delete(streaming.id)
    expect((await reopened.load(contexts[1]!)).draft).toBeUndefined()
    expect((await reopened.load(contexts[4]!)).draft).toBeUndefined()
    expect((await reopened.load(key)).draft?.markdown).toContain('Draft 0')
  })

  it('requires confirmation for the exact manual revision before regenerating', async () => {
    await instructions.generate(key, defaultInstructionOptions)
    const edited = await instructions.saveEdit(key, 'Manual content')
    await expect(instructions.generate(key, defaultInstructionOptions)).rejects.toBeInstanceOf(RegenerationConfirmationRequired)
    expect((await instructions.load(key)).draft).toEqual(edited)
    const latest = await instructions.saveEdit(key, 'A newer edit')
    await expect(instructions.generate(key, defaultInstructionOptions, edited)).rejects.toBeInstanceOf(RegenerationConfirmationRequired)
    expect((await instructions.load(key)).draft).toEqual(latest)
    const regenerated = await instructions.generate(key, defaultInstructionOptions, latest)
    expect(regenerated.markdown).toBe(regenerated.generatedMarkdown)
    expect(regenerated.manuallyEdited).toBe(false)
  })

  it('persists custom objectives before generation and isolates them across contexts', async () => {
    const otherProfile = { ...key, agentProfileId: 'codex' }
    const otherProject = { ...key, projectId: aws }
    await instructions.saveSettings(key, { objective: 'Preserve transaction ordering.' })
    await instructions.saveSettings(otherProfile, { objective: 'Verify the offset strategy.' })
    const reopened = new InstructionService(new LocalStorageTopicRepository(() => storage))
    expect((await reopened.load(key)).draft).toBeUndefined()
    expect((await reopened.settings(key)).objective).toBe('Preserve transaction ordering.')
    expect((await reopened.settings(otherProfile)).objective).toBe('Verify the offset strategy.')
    expect((await reopened.settings(otherProject)).objective).toBeUndefined()
    expect((await reopened.generate(key, defaultInstructionOptions)).markdown).toContain('## Objective\n\nPreserve transaction ordering.')
    expect((await reopened.generate(otherProject, defaultInstructionOptions)).markdown).toContain('## Objective\n\nReplicate database changes.')
  })

  it('gates all three documents by usage context and never creates missing implementations', async () => {
    await addSource()
    await instructions.saveSettings(key, { usage: 'topic' })
    const topicOnly = await instructions.generate(key, defaultInstructionOptions)
    expect(topicOnly.markdown).toContain('Data Ingestion')
    expect(topicOnly.markdown).not.toContain('Azure Data Platform')
    expect(topicOnly.artifacts?.prompt).not.toContain('Azure Data Platform')
    expect(topicOnly.artifacts?.checklist).not.toContain('Configure CDC source')
    await instructions.saveSettings(key, { usage: 'project' })
    const projectOnly = await instructions.generate(key, defaultInstructionOptions)
    expect(projectOnly.markdown).toContain('Azure Data Platform')
    expect(projectOnly.artifacts?.prompt).toContain('Azure Data Platform')
    expect(projectOnly.markdown).not.toMatch(/feature\/cdc|Configure CDC source|CDC spec/)
    await instructions.saveSettings(key, { usage: 'implementation' })
    const full = await instructions.generate(key, defaultInstructionOptions)
    expect(full.markdown).toMatch(/feature\/cdc[\s\S]*Configure CDC source/)
    expect(full.markdown).toContain('CDC spec')
    expect(full.artifacts?.prompt).toContain('## Implementation steps')
    expect(full.artifacts?.checklist).toContain('Configure CDC source')
    const missing = { ...key, projectId: aws }
    await instructions.saveSettings(missing, { usage: 'implementation' })
    expect((await instructions.generate(missing, defaultInstructionOptions)).markdown).toContain('AWS Data Platform')
    expect((await plans.list()).implementations).toHaveLength(1)
  })

  it('creates independent artifacts with sourced validation, constraints and deliverables', async () => {
    await addSource()
    await topics.save({ ...topic, content: topic.content + '\n\n## Constraints\n\nUse the existing schema.\n\n## Validation requirements\n\nReplay stored events.' }, topic.id)
    const generated = await instructions.generate(key, defaultInstructionOptions)
    expect(generated.markdown).toContain('## Constraints\n\nUse the existing schema.')
    expect(generated.artifacts?.prompt).toContain('## Deliverables\n\n- [CDC runbook]')
    expect(generated.artifacts?.prompt).toContain('## Implementation steps\n\n1. Implement event processing\n2. Configure CDC source')
    expect(generated.artifacts?.checklist).toContain('1. [ ] **Implement event processing**')
    expect(generated.artifacts?.checklist).toContain('2. [x] **Configure CDC source**')
    expect(generated.artifacts?.checklist).toContain('## Validation requirements\n\nReplay stored events.')
    expect(generated.artifacts?.checklist).not.toContain('CDC spec')
    await instructions.saveEdit(key, '# Edited agent instructions')
    expect((await instructions.load(key)).draft?.artifacts).toEqual(generated.artifacts)
  })

  it('serializes valid YAML with ordered tasks, checked criteria, and literal scalar values', async () => {
    await addSource()
    const objective = 'Ship CDC: retain offsets\n# preserve ordering\n!!str true'
    await instructions.saveSettings(key, { objective })
    const draft = await instructions.generate(key, defaultInstructionOptions)
    expect(draft.yaml).toBeDefined()
    const document = parseDocument(draft.yaml!)
    expect(document.errors).toEqual([])
    expect(document.warnings).toEqual([])
    expect(document.toJS()).toMatchObject({
      topic: { id: topic.id, title: topic.title, content: topic.content },
      objective,
      usageContext: 'implementation',
      project: { id: azure, name: 'Azure Data Platform' },
      dependencies: {
        direct: [{ title: 'Data Ingestion', description: 'CDC reads ingestion offsets.' }],
        related: [{ title: 'Event Streaming' }],
      },
      implementation: { branch: 'feature/cdc', tasks: [
        {
          title: 'Implement event processing', dependsOn: ['Configure CDC source'],
          acceptanceCriteria: [{ description: 'Record the offset.', completed: false }, { description: 'Retain the source key.', completed: true }],
        },
        { title: 'Configure CDC source', status: 'done' },
      ] },
    })
    expect(draft.yaml).not.toMatch(/Indirect upstream topic|Downstream consumer/)
  })

  it('filters YAML by context and inclusion toggles and omits missing optional values', async () => {
    await addSource()
    await instructions.saveSettings(key, { usage: 'topic' })
    const topicOnly = parseDocument((await instructions.generate(key, { ...defaultInstructionOptions, content: false, dependencies: false })).yaml!).toJS()
    expect(topicOnly).toEqual({
      topic: { id: topic.id, title: topic.title, description: topic.description },
      objective: topic.description, usageContext: 'topic',
    })
    await instructions.saveSettings(key, { usage: 'project' })
    const projectOnly = parseDocument((await instructions.generate(key, defaultInstructionOptions)).yaml!).toJS()
    expect(projectOnly.project.id).toBe(azure)
    expect(projectOnly.implementation).toBeUndefined()
    await instructions.saveSettings(key, { usage: 'implementation' })
    const noPlan = parseDocument((await instructions.generate(key, { ...defaultInstructionOptions, plan: false })).yaml!).toJS()
    expect(noPlan.implementation).toBeUndefined()
    const noCriteria = parseDocument((await instructions.generate(key, { ...defaultInstructionOptions, criteria: false, dependencies: false })).yaml!).toJS()
    expect(noCriteria.implementation.tasks).toHaveLength(2)
    expect(noCriteria.implementation.tasks[0]).not.toHaveProperty('acceptanceCriteria')
    expect(noCriteria.implementation.tasks[0]).not.toHaveProperty('dependsOn')
    expect(noCriteria).not.toHaveProperty('dependencies')
    const sparse = parseDocument((await instructions.generate({ ...key, projectId: aws }, defaultInstructionOptions)).yaml!).toJS()
    expect(sparse.project.id).toBe(aws)
    expect(sparse).not.toHaveProperty('implementation')
  })

  it('preserves YAML as a generation snapshot and refreshes it after regeneration', async () => {
    const initial = await instructions.generate(key, defaultInstructionOptions)
    await instructions.saveSettings(key, { objective: 'New objective' })
    const edited = await instructions.saveEdit(key, 'Manual Markdown')
    const reopened = new InstructionService(new LocalStorageTopicRepository(() => storage))
    expect((await reopened.load(key)).draft?.yaml).toBe(initial.yaml)
    await expect(reopened.generate(key, defaultInstructionOptions)).rejects.toBeInstanceOf(RegenerationConfirmationRequired)
    const regenerated = await reopened.generate(key, defaultInstructionOptions, edited)
    expect(parseDocument(regenerated.yaml!).toJS().objective).toBe('New objective')
  })

  it('renames a project in place and uses its current description when generating instructions', async () => {
    await addSource()
    const generated = await instructions.generate(key, defaultInstructionOptions)
    const edited = await instructions.saveEdit(key, '# Keep this draft')
    const before = await plans.list()
    const otherProject = before.projects.find(project => project.id === aws)!
    await expect(plans.updateProject(azure, '   ', '')).rejects.toThrow('Enter a project name')
    await expect(plans.updateProject('missing', 'Renamed', '')).rejects.toThrow('project no longer exists')
    expect(await plans.list()).toEqual(before)

    // Projects are keyed by ID. Existing name-sharing projects remain supported.
    await plans.updateProject(azure, otherProject.name, '')
    await plans.updateProject(azure, '  CDC production  ', ' New pipeline description.\nSecond line. ')
    const reopened = new LocalStorageTopicRepository(() => storage)
    const saved = await reopened.readImplementations()
    expect(saved).toEqual({
      ...before,
      projects: before.projects.map(project => project.id === azure ? {
        ...project, name: 'CDC production', description: 'New pipeline description.\nSecond line.', updatedAt: expect.any(String),
      } : project),
    })
    const reloadedInstructions = new InstructionService(reopened)
    expect((await reloadedInstructions.load(key)).draft).toEqual(edited)
    expect(generated.markdown).toContain('Project: Azure Data Platform')
    for (const usage of ['project', 'implementation'] as const) {
      await reloadedInstructions.saveSettings(key, { usage })
      const draft = await reloadedInstructions.generate(key, defaultInstructionOptions, usage === 'project' ? edited : undefined)
      expect(draft.markdown).toContain('Project: CDC production\n\nNew pipeline description. Second line.')
      expect(parseDocument(draft.yaml!).toJS().project).toMatchObject({ id: azure, description: 'New pipeline description.\nSecond line.' })
    }
  })

  it('persists ordered custom templates, protects the system template, and falls back after deletion', async () => {
    await addSource()
    const input: TemplateInput = {
      name: '  Small brief  ', description: '  Narrow scope ', sections: {
        agents: ['plan', 'objective'], prompt: ['steps'], checklist: [],
      },
    }
    await expect(instructions.saveTemplate(input, defaultGenerationTemplate.id)).rejects.toThrow('cannot be overwritten')
    await expect(instructions.deleteTemplate(defaultGenerationTemplate.id)).rejects.toThrow('cannot be deleted')
    const created = await instructions.saveTemplate(input)
    expect(created).toMatchObject({ name: 'Small brief', description: 'Narrow scope', isSystem: false })
    const copy = await instructions.duplicateTemplate(created.id)
    expect(copy).toMatchObject({ name: 'Small brief (copy)', sections: input.sections, isSystem: false })
    expect(copy.id).not.toBe(created.id)
    const systemCopy = await instructions.duplicateTemplate(defaultGenerationTemplate.id)
    expect(systemCopy).toMatchObject({ sections: defaultGenerationTemplate.sections, isSystem: false })
    const edited = await instructions.saveTemplate({ ...input, name: 'Updated', sections: { ...input.sections, agents: ['objective', 'plan'] } }, created.id)
    expect(edited.createdAt).toBe(created.createdAt)
    await instructions.saveSettings(key, { templateId: edited.id })
    const reopened = new InstructionService(new LocalStorageTopicRepository(() => storage))
    expect(await reopened.templates()).toEqual([defaultGenerationTemplate, edited, copy, systemCopy])
    const custom = await reopened.generate(key, defaultInstructionOptions)
    expect(custom.markdown).toMatch(/## Objective[\s\S]*## Implementation plan/)
    expect(custom.markdown).not.toContain('Direct dependencies')
    expect(custom.artifacts?.prompt).not.toContain('Implementation request')
    expect(custom.artifacts?.checklist).not.toContain('Implementation checklist')
    await reopened.deleteTemplate(edited.id)
    await expect(reopened.saveSettings(key, { templateId: edited.id })).rejects.toThrow('template no longer exists')
    expect((await reopened.settings(key)).templateId).toBeUndefined()
    expect((await reopened.load(key)).draft).toEqual(custom)
    expect((await reopened.generate(key, defaultInstructionOptions)).markdown).toContain('Direct dependencies')
  })

  it('preserves pre-artifact manual drafts without upgrading them until explicit regeneration', async () => {
    await instructions.generate(key, defaultInstructionOptions)
    await instructions.saveEdit(key, 'Existing manual edits')
    const existing = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    delete existing.instructionSettings
    delete existing.instructionTemplates
    delete existing.instructionDrafts[0].artifacts
    delete existing.instructionDrafts[0].yaml
    const raw = JSON.stringify(existing)
    entries.set(TOPIC_STORAGE_KEY, raw)
    const reopened = new InstructionService(new LocalStorageTopicRepository(() => storage))
    const { draft } = await reopened.load(key)
    expect(draft).toMatchObject({ markdown: 'Existing manual edits', manuallyEdited: true })
    expect(draft?.artifacts).toBeUndefined()
    expect(draft?.yaml).toBeUndefined()
    expect(await reopened.settings(key)).toEqual({})
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(raw)
    await expect(reopened.generate(key, defaultInstructionOptions)).rejects.toBeInstanceOf(RegenerationConfirmationRequired)
    expect((await reopened.generate(key, defaultInstructionOptions, draft)).artifacts).toBeDefined()
  })

  it.each([2, 3])('opens version %s storage without drafts and preserves existing data on save', async version => {
    await addSource()
    const existing = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    delete existing.instructionDrafts
    if (version === 2) delete existing.implementationData
    existing.version = version
    const raw = JSON.stringify(existing)
    entries.set(TOPIC_STORAGE_KEY, raw)
    expect((await instructions.load(key)).draft).toBeUndefined()
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(raw)
    await instructions.generate(key, defaultInstructionOptions)
    const saved = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    expect(saved).toMatchObject({ ...existing, version: 5 })
    expect(saved.instructionDrafts).toHaveLength(1)
  })
})
