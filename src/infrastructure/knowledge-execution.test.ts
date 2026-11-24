import { describe, expect, it, vi } from 'vitest'
import { ImplementationService } from '../application/implementation-service'
import { InstructionService } from '../application/instruction-service'
import { TopicService } from '../application/topic-service'
import { defaultInstructionOptions } from '../domain/agent-instructions'
import type { TaskDefinition } from '../domain/implementation'
import type { Topic } from '../domain/topic'
import { defaultTopicMetadata } from '../domain/topic-metadata'
import { EXECUTION_MIGRATION_BACKUP_PREFIX, LocalStorageTopicRepository, TOPIC_STORAGE_KEY } from './local-storage-topic-repository'

const date = '2026-10-01T12:00:00.000Z'
const topic: Topic = { type: 'General', id: 'topic', title: 'CDC', description: '', content: 'Original knowledge', createdAt: date, updatedAt: date }
const definition: TaskDefinition = {
  id: 'design', topicId: topic.id, title: 'Design CDC', description: 'Document the source offset.',
  createdAt: date, updatedAt: date, order: 1, criteria: [{ id: 'offset', description: 'Keep offsets', order: 1 }],
  dependencyIds: [], references: [{ id: 'guide', kind: 'resource', title: 'CDC guide' }],
}
const azure = 'azure-data-platform'
const aws = 'aws-data-platform'

function setup() {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: vi.fn((key: string, payload: string) => { entries.set(key, payload) }),
  }
  const open = () => {
    const repository = new LocalStorageTopicRepository(() => storage, [topic])
    return { plans: new ImplementationService(repository), topics: new TopicService(repository), instructions: new InstructionService(repository) }
  }
  return { ...open(), open, storage, entries, raw: () => JSON.parse(entries.get(TOPIC_STORAGE_KEY)!) }
}

describe('knowledge and execution separation', () => {
  it('duplicates independent Topic knowledge without copying project work or history', async () => {
    const { plans, topics, open, raw } = setup()
    const prerequisite = await topics.save({ title: 'Prerequisite', type: 'Concept', description: '', content: '' })
    const dependent = await topics.save({ title: 'Dependent', description: '', content: '' })
    await topics.save({ ...topic, type: 'Technology' }, topic.id)
    await topics.saveMetadata(topic.id, { ...defaultTopicMetadata, tags: ['CDC'], customProperties: [{ id: 'property', key: 'Tier', value: '1' }] })
    const outgoing = await topics.addRelationship({ sourceTopicId: topic.id, targetTopicId: prerequisite.id, type: 'dependency' })
    await topics.addRelationship({ sourceTopicId: dependent.id, targetTopicId: topic.id, type: 'dependency' })
    const related = await topics.addRelationship({ sourceTopicId: dependent.id, targetTopicId: topic.id, type: 'related' })
    const selfReference = { id: 'self', kind: 'topic', topicId: topic.id } as const
    await plans.saveTaskDefinition({ ...definition, references: [...definition.references, selfReference] })
    await plans.saveTaskDefinition({ ...definition, id: 'verify', title: 'Verify', dependencyIds: [definition.id], references: [] })
    await plans.createImplementation(topic.id, azure)
    const copy = await topics.duplicate(topic.id)
    const reopened = open()
    expect(copy).toMatchObject({ title: 'CDC (Copy)', type: 'Technology', content: topic.content,
      metadata: { tags: ['CDC'], customProperties: [{ key: 'Tier', value: '1' }] } })
    expect(copy.id).not.toBe(topic.id)
    expect(copy.metadata?.customProperties[0]?.id).not.toBe('property')
    const copiedEdges = (await reopened.topics.readWorkspace()).relationships.filter(edge => edge.sourceTopicId === copy.id || edge.targetTopicId === copy.id)
    expect(copiedEdges).toMatchObject([
      { sourceTopicId: copy.id, targetTopicId: prerequisite.id, type: 'dependency' },
      { sourceTopicId: dependent.id, targetTopicId: copy.id, type: 'related' },
    ])
    expect(copiedEdges.map(edge => edge.id)).not.toEqual([outgoing.id, related.id])
    const [first, second] = (await reopened.plans.list()).taskDefinitions!.filter(task => task.topicId === copy.id)
    expect(first).toMatchObject({ title: definition.title, criteria: [{ description: 'Keep offsets' }],
      references: [{ title: 'CDC guide' }, { kind: 'topic', topicId: copy.id }] })
    expect(first!.id).not.toBe(definition.id)
    expect(first!.criteria[0]!.id).not.toBe('offset')
    expect(first!.references[0]!.id).not.toBe('guide')
    expect(second!.dependencyIds).toEqual([first!.id])
    expect(await reopened.topics.versions(copy.id)).toEqual([])
    expect(raw().implementationData.implementations).toHaveLength(1)
    expect(raw().implementationData.tasks).toHaveLength(2)
    await reopened.plans.deleteTaskDefinition(copy.id, first!.id)
    expect((await plans.list()).taskDefinitions!.find(task => task.id === 'verify')?.dependencyIds).toEqual([definition.id])
  })

  it('edits, reorders and deletes definitions without a project and validates dependencies', async () => {
    const { plans } = setup()
    await plans.saveTaskDefinition(definition)
    const followup = { ...definition, id: 'verify', title: 'Verify CDC', dependencyIds: ['design'], criteria: [], references: [] }
    await plans.saveTaskDefinition(followup)
    await expect(plans.saveTaskDefinition({ ...definition, dependencyIds: ['verify'] })).rejects.toThrow('cycle')
    await expect(plans.saveTaskDefinition({ ...definition, dependencyIds: ['design'] })).rejects.toThrow('itself')
    await plans.moveTaskDefinition(topic.id, followup.id, -1)
    const workspace = await plans.list()
    expect(workspace.implementations).toEqual([])
    expect(workspace.tasks).toEqual([])
    expect(workspace.taskDefinitions?.find(item => item.id === 'verify')?.order).toBe(1)
    await plans.deleteTaskDefinition(topic.id, 'design')
    expect((await plans.list()).taskDefinitions).toMatchObject([{ id: 'verify', dependencyIds: [] }])
  })

  it('pins versions and isolates execution across projects, even after definition changes', async () => {
    const { plans, topics, instructions } = setup()
    await plans.saveTaskDefinition(definition)
    await topics.saveMetadata(topic.id, {
      ...defaultTopicMetadata, technicalDomain: 'Pinned domain', tags: ['Pinned tag'], owner: 'Internal owner',
      customProperties: [{ id: 'open', key: 'Open source', type: 'Boolean', value: false }],
    }, 'Concept')
    await plans.createImplementation(topic.id, azure)
    await plans.createImplementation(topic.id, aws)
    const starting = await plans.list()
    const [first, second] = starting.implementations
    const tasks = starting.tasks
    expect(first!.knowledgeVersionId).toBe(second!.knowledgeVersionId)
    expect(tasks.map(task => task.definitionId)).toEqual([definition.id, definition.id])
    expect(tasks[0]!.id).not.toBe(tasks[1]!.id)
    await plans.updateTask(tasks[0]!.id, { title: 'Azure rollout', description: 'Azure only', status: 'done' })
    await plans.updateCriterion(tasks[0]!.id, 'offset', { completed: true })
    await topics.save({ ...topic, content: 'Current knowledge' }, topic.id)
    await topics.saveMetadata(topic.id, { ...defaultTopicMetadata, technicalDomain: 'Working domain' }, 'Practice')
    await plans.saveTaskDefinition({ ...definition, title: 'Redesign CDC' })
    await plans.saveTaskDefinition({ ...definition, id: 'verify', title: 'Verify CDC', dependencyIds: ['design'] })
    const beforeReorder = await plans.list()
    await plans.moveTaskDefinition(topic.id, 'verify', 'design')
    const afterReorder = await plans.list()
    expect(afterReorder.tasks).toEqual(beforeReorder.tasks)
    expect(afterReorder.implementations).toEqual(beforeReorder.implementations)
    const key = { topicId: topic.id, agentProfileId: 'generic' as const }
    const topicDraft = await instructions.generate(key, defaultInstructionOptions)
    const projectDraft = await instructions.generate({ ...key, projectId: azure }, defaultInstructionOptions)
    expect(topicDraft.markdown).toContain('Current knowledge')
    expect(topicDraft.markdown).toContain('Redesign CDC')
    expect(topicDraft.markdown).not.toContain('(Done)')
    expect(projectDraft.markdown).toContain('Original knowledge')
    expect(projectDraft.markdown).toContain('Technical domains: Pinned domain')
    expect(projectDraft.markdown).toContain('Topic type: Concept')
    expect(projectDraft.yaml).toContain('Pinned tag')
    expect(projectDraft.markdown).toContain('Open source: false')
    expect(projectDraft.yaml).toMatch(/key: Open source\s+type: Boolean\s+value: false/)
    expect(topicDraft.yaml).not.toContain('Open source')
    expect(projectDraft.yaml).not.toMatch(/Working domain|Internal owner/)
    expect(topicDraft.markdown).toContain('Technical domains: Working domain')
    expect(topicDraft.yaml).not.toContain('Pinned domain')
    expect(projectDraft.markdown).toContain('Azure rollout')
    expect(projectDraft.markdown).not.toContain('Redesign CDC')
    await plans.upgradeImplementationKnowledge(first!.id)
    const result = await plans.list()
    expect(result.implementations[0]!.knowledgeVersionId).not.toBe(first!.knowledgeVersionId)
    expect(result.implementations[1]!.knowledgeVersionId).toBe(second!.knowledgeVersionId)
    expect(result.tasks[0]).toMatchObject({ id: tasks[0]!.id, status: 'done', title: 'Azure rollout',
      knowledgeVersionId: first!.knowledgeVersionId, criteria: [{ completed: true }] })
    expect(result.tasks[1]).toEqual(tasks[1])
    expect(result.tasks[2]).toMatchObject({ definitionId: 'verify', dependencyIds: [tasks[0]!.id], status: 'todo' })
  })

  it('keeps definitions when restoring legacy snapshots and clears them for explicitly empty snapshots', async () => {
    const { plans, topics, entries, raw } = setup()
    const empty = await topics.createVersion(topic.id, 'Empty plan')
    const stored = raw()
    delete stored.topicVersions[0].snapshot.taskDefinitions
    entries.set(TOPIC_STORAGE_KEY, JSON.stringify(stored))
    await plans.saveTaskDefinition(definition)
    await topics.restoreVersion(topic.id, empty.id)
    expect((await plans.list()).taskDefinitions).toMatchObject([{ id: definition.id }])
    await plans.deleteTaskDefinition(topic.id, definition.id)
    const explicit = await topics.createVersion(topic.id, 'Explicitly empty')
    await plans.saveTaskDefinition(definition)
    await topics.restoreVersion(topic.id, explicit.id)
    expect((await plans.list()).taskDefinitions).toEqual([])
  })

  it('backs up and deterministically migrates even trashed plans, retaining artifacts and retrying failed writes', async () => {
    const { plans, topics, entries, raw, open, storage } = setup()
    await plans.createImplementation(topic.id, azure)
    const [plan] = (await plans.list()).implementations
    const taskId = await plans.createTask(plan!.id, { title: 'Legacy task', description: '', status: 'done' })
    await plans.saveArtifact(plan!.id, { title: 'Runbook', type: 'documentation', relatedTaskId: taskId })
    await topics.delete(topic.id)
    const legacy = raw()
    legacy.version = 5
    delete legacy.taskDefinitions
    delete legacy.implementationData.implementations[0].knowledgeVersionId
    const task = legacy.implementationData.tasks[0]
    delete task.definitionId
    delete task.knowledgeVersionId
    delete task.projectDefinition
    const original = JSON.stringify(legacy)
    entries.set(TOPIC_STORAGE_KEY, original)
    storage.setItem.mockImplementationOnce(() => { throw new Error('quota') })
    await expect(open().topics.readWorkspace()).rejects.toThrow('could not back up')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)
    await open().topics.readWorkspace()
    expect(entries.get(EXECUTION_MIGRATION_BACKUP_PREFIX + '1')).toBe(original)
    storage.setItem.mockImplementationOnce(() => { throw new Error('quota') })
    await expect(open().topics.restoreTopic(topic.id)).rejects.toThrow()
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)
    await open().topics.restoreTopic(topic.id)
    const result = await open().plans.list()
    expect(raw().version).toBe(6)
    expect(result.tasks).toMatchObject([{ id: taskId, status: 'done', definitionId: 'legacy-task-definition:' + taskId }])
    expect(result.artifacts).toMatchObject([{ relatedTaskId: taskId }])
    expect(result.taskDefinitions).toMatchObject([{ sourceProjectId: azure }])
    expect(await open().plans.list()).toEqual(result)
    await open().topics.delete(topic.id)
    await expect(open().topics.deletePermanently(topic.id)).rejects.toThrow('pinned by an existing project')
  })
})
