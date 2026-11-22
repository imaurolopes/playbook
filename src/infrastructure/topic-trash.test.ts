import { describe, expect, it, vi } from 'vitest'
import { ImplementationService } from '../application/implementation-service'
import { InstructionService } from '../application/instruction-service'
import { TopicService } from '../application/topic-service'
import { defaultInstructionOptions } from '../domain/agent-instructions'
import type { Topic } from '../domain/topic'
import { defaultTopicMetadata } from '../domain/topic-metadata'
import { LocalStorageTopicRepository, TOPIC_STORAGE_KEY } from './local-storage-topic-repository'

const timestamp = '2026-10-01T12:00:00.000Z'
const seed: Topic[] = ['First topic', 'Second topic', 'Third topic'].map((title, index) => ({
  id: String(index + 1), title, description: '', content: '# Topic content', createdAt: timestamp, updatedAt: timestamp,
}))
const projectId = 'azure-data-platform'
const key = { topicId: '1', projectId, agentProfileId: 'generic' }

function setup() {
  const entries = new Map<string, string>()
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { entries.set(key, value) }) }
  const open = () => {
    const repository = new LocalStorageTopicRepository(() => storage, seed)
    return { repository, topics: new TopicService(repository), plans: new ImplementationService(repository), instructions: new InstructionService(repository) }
  }
  const raw = () => JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
  return { entries, storage, open, raw }
}

describe('Trash and recovery', () => {
  it('preserves the original topic, plans, tasks, artifacts, knowledge, versions and instruction drafts after reload', async () => {
    const { open, raw, entries } = setup()
    const { repository, topics, plans, instructions } = open()
    await topics.saveMetadata('1', { ...defaultTopicMetadata, category: 'Data Patterns' })
    const version = await topics.createVersion('1', 'Before Trash')
    const originalTopic = await repository.getById('1')
    await plans.createImplementation('1', projectId)
    const implementation = (await plans.list()).implementations[0]!
    await plans.createTask(implementation.id, { title: 'Recover this task', description: '', status: 'todo' })
    await plans.saveArtifact(implementation.id, { title: 'Recover this artifact', type: 'documentation' })
    const planData = await plans.list()
    await instructions.generate(key, defaultInstructionOptions)
    const draft = await instructions.saveEdit(key, '# Saved instructions')
    const stored = raw()
    const section = { id: 'runbook', topicId: '1', key: 'runbook', title: 'Runbook', content: 'Keep this.', order: 0 }
    entries.set(TOPIC_STORAGE_KEY, JSON.stringify({ ...stored, knowledgeSections: [section] }))

    await topics.delete('1')
    const reopened = open()
    const workspace = await reopened.topics.readWorkspace()
    expect(workspace.topics.map(item => item.id)).toEqual(['2', '3'])
    expect(workspace.trashedTopics).toEqual([{ ...originalTopic, deletedAt: expect.any(String) }])
    expect(await reopened.repository.getById('1')).toBeUndefined()
    expect(await reopened.plans.list()).toMatchObject({ implementations: [], tasks: [], artifacts: [] })
    expect(await reopened.topics.versions('1')).toEqual([])
    await expect(reopened.instructions.generate(key, defaultInstructionOptions)).rejects.toThrow('no longer exists')
    await expect(reopened.plans.deleteProject(projectId)).rejects.toThrow('topics in Trash')
    await expect(reopened.repository.saveKnowledgeSection('1', section.id, 'stale edit')).rejects.toThrow('Trash')

    await reopened.topics.restoreTopic('1')
    expect(await open().repository.getById('1')).toEqual(originalTopic)
    expect(await open().topics.versions('1')).toEqual([version])
    expect(await open().plans.list()).toEqual(planData)
    expect(await open().repository.readInstructionDraft(key)).toEqual(draft)
    expect((await open().repository.readKnowledge('1')).sections).toEqual([section])
  })

  it('hides dormant relationships and restores them only when both endpoints are active', async () => {
    const { open, raw } = setup()
    const { topics, instructions } = open()
    const edge = await topics.addRelationship({ sourceTopicId: '1', targetTopicId: '2', type: 'dependency' })
    const unrelated = await topics.addRelationship({ sourceTopicId: '1', targetTopicId: '3', type: 'related' })
    await topics.delete('2')
    expect((await topics.readWorkspace()).relationships).toEqual([unrelated])
    expect((await instructions.generate(key, defaultInstructionOptions)).markdown).not.toContain('Second topic')
    await expect(topics.removeRelationship(edge.id)).rejects.toThrow('Trash')
    await expect(topics.addRelationship({ sourceTopicId: '3', targetTopicId: '2', type: 'related' })).rejects.toThrow('Both topics')
    await topics.delete('1')
    await topics.restoreTopic('1')
    expect((await topics.readWorkspace()).relationships).toEqual([unrelated])
    await topics.restoreTopic('2')
    expect((await open().topics.readWorkspace()).relationships).toEqual([edge, unrelated])
    expect(raw().relationships).toHaveLength(2)
  })

  it('permanently deletes only trashed topics and applies the same cleanup to Empty Trash', async () => {
    const { open, raw, storage } = setup()
    const { topics, plans, instructions } = open()
    for (const topicId of ['1', '2', '3']) {
      await topics.createVersion(topicId, 'Original')
      await plans.createImplementation(topicId, projectId)
      const plan = (await plans.list()).implementations.find(item => item.topicId === topicId)!
      await plans.createTask(plan.id, { title: `Task ${topicId}`, description: '', status: 'todo' })
      await plans.saveArtifact(plan.id, { title: `Artifact ${topicId}`, type: 'documentation' })
      await instructions.generate({ ...key, topicId }, defaultInstructionOptions)
    }
    await topics.addRelationship({ sourceTopicId: '1', targetTopicId: '2', type: 'dependency' })
    await topics.addRelationship({ sourceTopicId: '3', targetTopicId: '2', type: 'related' })
    await expect(topics.deletePermanently('3')).rejects.toThrow('Move this topic to Trash')
    await topics.delete('1')
    await topics.delete('2')
    await topics.deletePermanently('1')
    expect(raw().topics.map((topic: Topic) => topic.id)).toEqual(['2', '3'])
    expect(raw().relationships).toHaveLength(1)
    expect(raw().instructionDrafts.map((draft: { topicId: string }) => draft.topicId)).toEqual(['2', '3'])

    storage.setItem.mockClear()
    await topics.emptyTrash()
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect((await open().topics.readWorkspace()).trashedTopics).toEqual([])
    expect(raw().relationships).toEqual([])
    expect(raw().topicVersions.map((version: { topicId: string }) => version.topicId)).toEqual(['3'])
    expect(raw().instructionDrafts.map((draft: { topicId: string }) => draft.topicId)).toEqual(['3'])
    expect(raw().implementationData.implementations).toHaveLength(1)
    expect(raw().implementationData.tasks.map((task: { title: string }) => task.title)).toEqual(['Task 3'])
    expect(raw().implementationData.artifacts.map((item: { title: string }) => item.title)).toEqual(['Artifact 3'])
  })

  it('supports topics without deletedAt and makes repeated operations safe', async () => {
    const { open, entries, storage } = setup()
    const original = JSON.stringify(seed)
    entries.set(TOPIC_STORAGE_KEY, original)
    const { topics } = open()
    expect((await topics.readWorkspace()).topics).toEqual(seed)
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)
    await topics.delete('1')
    const first = entries.get(TOPIC_STORAGE_KEY)
    storage.setItem.mockClear()
    await topics.delete('1')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(first)
    await topics.restoreTopic('1')
    await topics.restoreTopic('1')
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    await topics.delete('1')
    await topics.deletePermanently('1')
    storage.setItem.mockClear()
    await topics.deletePermanently('1')
    await topics.restoreTopic('1')
    await topics.delete('1')
    await topics.emptyTrash()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect((await open().topics.readWorkspace()).topics).toEqual(seed.slice(1))
  })
})
