import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compareTopicVersions } from '../application/compare-topic-versions'
import { ImplementationService } from '../application/implementation-service'
import { InstructionService } from '../application/instruction-service'
import { TopicService } from '../application/topic-service'
import { defaultInstructionOptions } from '../domain/agent-instructions'
import type { Topic } from '../domain/topic'
import { defaultTopicMetadata } from '../domain/topic-metadata'
import { captureTopicSnapshot, matchesTopicSnapshot } from '../domain/topic-version'
import { LocalStorageTopicRepository, TOPIC_STORAGE_KEY } from './local-storage-topic-repository'

const createdAt = '2026-11-19T12:00:00.000Z'
const topic: Topic = {
  id: 'cdc', title: 'Change Data Capture', description: 'Capture database changes.',
  content: '## Technical standards\n\nRetain source offsets.',
  sourceTopicId: 'external-lineage', createdAt, updatedAt: createdAt,
}
const peer = (id: string, title: string): Topic => ({ id, title, description: '', content: '', createdAt, updatedAt: createdAt })
const parent = peer('parent', 'Data Engineering')
const ingestion = peer('ingestion', 'Data Ingestion')
const streams = peer('streams', 'Event Streaming')
const consumer = peer('consumer', 'Downstream consumer')
const seed = [topic, parent, ingestion, streams, consumer]
const projectId = 'azure-data-platform'

describe('topic version history', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: vi.fn((name: string, value: string) => { entries.set(name, value) }),
  }
  const repository = new LocalStorageTopicRepository(() => storage, seed)
  const service = new TopicService(repository)

  beforeEach(() => {
    entries.clear()
    storage.setItem.mockClear()
  })

  const depend = (sourceTopicId: string, targetTopicId: string, description?: string) =>
    service.addRelationship({ sourceTopicId, targetTopicId, type: 'dependency', description })

  it('captures an immutable knowledge snapshot and assigns sequential per-topic numbers', async () => {
    await depend(topic.id, ingestion.id, 'Read ingestion offsets.')
    await depend(consumer.id, topic.id)
    await service.addRelationship({ sourceTopicId: streams.id, targetTopicId: topic.id, type: 'related' })
    await expect(service.createVersion(topic.id, '   ')).rejects.toThrow('change summary')
    const first = await service.createVersion(topic.id, '  Initial standard  ')
    expect(first).toMatchObject({
      topicId: topic.id, versionNumber: 1, summary: 'Initial standard', author: 'Local user', createdAt: expect.any(String),
    })
    expect(first.snapshot).toEqual({
      title: topic.title, description: topic.description, content: topic.content,
      metadata: {
        source: { id: 'external-lineage', title: 'external-lineage' },
        details: defaultTopicMetadata,
      },
      dependencies: [{ id: ingestion.id, title: ingestion.title, description: 'Read ingestion offsets.' }],
      related: [{ id: streams.id, title: streams.title, description: undefined }],
    })
    await service.save({ ...topic, title: 'CDC v2' }, topic.id)
    await service.save({ ...ingestion, title: 'Renamed ingestion' }, ingestion.id)
    const [second, third, other] = await Promise.all([
      service.createVersion(topic.id, 'Second'), service.createVersion(topic.id, 'Third'), service.createVersion(streams.id, 'Other topic'),
    ])
    expect([second.versionNumber, third.versionNumber, other.versionNumber]).toEqual([2, 3, 1])
    const reopened = new TopicService(new LocalStorageTopicRepository(() => storage))
    const history = await reopened.versions(topic.id)
    expect(history.map(item => item.id)).toEqual([third.id, second.id, first.id])
    expect(history[2]?.snapshot.title).toBe(topic.title)
    expect(history[2]?.snapshot.dependencies[0]?.title).toBe(ingestion.title)
    const fetched = history[2]!
    Reflect.set(fetched.snapshot, 'title', 'Changed in memory')
    expect((await reopened.versions(topic.id))[2]?.snapshot.title).toBe(topic.title)
  })

  it('compares modified, added and removed Markdown and separates relationship and metadata changes', async () => {
    await service.save({ ...topic, content: 'Remove me\nKeep A\nOld standard\nKeep B\n' }, topic.id)
    const oldEdge = await depend(topic.id, ingestion.id, 'Old description')
    await depend(topic.id, parent.id)
    const first = await service.createVersion(topic.id, 'Before')
    await service.save({ ...topic, title: 'Current CDC', content: 'Keep A\nNew standard\nKeep B\nAdd me\n' }, topic.id)
    const relationships = await service.readWorkspace()
    await service.removeRelationship(oldEdge.id)
    await service.removeRelationship(relationships.relationships.find(edge => edge.targetTopicId === parent.id)!.id)
    await depend(topic.id, ingestion.id, 'Updated description')
    await depend(topic.id, streams.id)
    const second = await service.createVersion(topic.id, 'After')
    const compared = compareTopicVersions(first.snapshot, second.snapshot)
    expect(compared.fields).toEqual([{ label: 'Title', before: topic.title, after: 'Current CDC' }])
    expect(compared.content).toMatchObject([
      { kind: 'removed', before: 'Remove me\n' },
      { kind: 'modified', before: 'Old standard\n', after: 'New standard\n' },
      { kind: 'added', after: 'Add me\n' },
    ])
    expect(compared.dependencies).toMatchObject([
      { kind: 'modified', before: { description: 'Old description' }, after: { description: 'Updated description' } },
      { kind: 'removed', before: { id: parent.id } },
      { kind: 'added', after: { id: streams.id } },
    ])
    expect(Object.values(compareTopicVersions(first.snapshot, first.snapshot)).flat()).toEqual([])
  })

  it('restores knowledge and links in one write, saves a reversible backup, and preserves project work', async () => {
    const dependency = await depend(topic.id, ingestion.id)
    const related = await service.addRelationship({ sourceTopicId: topic.id, targetTopicId: streams.id, type: 'related' })
    const first = await service.createVersion(topic.id, 'Original')
    await service.save({ ...topic, title: 'Changed CDC', content: 'Manual changes' }, topic.id)
    await service.removeRelationship(dependency.id)
    await service.removeRelationship(related.id)
    await depend(topic.id, streams.id)
    await service.addRelationship({ sourceTopicId: consumer.id, targetTopicId: topic.id, type: 'related' })
    const external = await depend(consumer.id, topic.id)
    const plans = new ImplementationService(repository)
    await plans.createImplementation(topic.id, projectId)
    const plan = (await plans.list()).implementations[0]!
    await plans.createTask(plan.id, { title: 'Keep this task', description: 'Implementation work', status: 'done' })
    await plans.saveArtifact(plan.id, { title: 'Keep this artifact', type: 'documentation' })
    const instructions = new InstructionService(repository)
    const instructionKey = { topicId: topic.id, projectId, agentProfileId: 'generic' }
    await instructions.generate(instructionKey, defaultInstructionOptions)
    const draft = await instructions.saveEdit(instructionKey, '# Keep these manual edits')
    const implementationData = await plans.list()
    storage.setItem.mockClear()

    const result = await service.restoreVersion(topic.id, first.id)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(result.backup).toMatchObject({ versionNumber: 2, snapshot: { title: 'Changed CDC', content: 'Manual changes' } })
    expect(result.version).toMatchObject({ versionNumber: 3, restoredFromVersionId: first.id })
    expect(matchesTopicSnapshot(result.version.snapshot, first.snapshot)).toBe(true)
    expect(result.workspace.relationships).toContainEqual(external)
    expect(result.workspace.topics.find(item => item.id === topic.id)).toMatchObject({ id: topic.id, createdAt })
    expect(await plans.list()).toEqual(implementationData)
    expect((await instructions.load(instructionKey)).draft).toEqual(draft)
    const reopened = new TopicService(new LocalStorageTopicRepository(() => storage))
    expect((await reopened.versions(topic.id)).map(item => item.versionNumber)).toEqual([3, 2, 1])
    const undo = await reopened.restoreVersion(topic.id, result.backup.id)
    expect(matchesTopicSnapshot(undo.version.snapshot, result.backup.snapshot)).toBe(true)
  })

  it('rejects missing dependencies and dependency cycles without changing storage', async () => {
    const dependency = await depend(topic.id, ingestion.id)
    const first = await service.createVersion(topic.id, 'Original')
    await service.removeRelationship(dependency.id)
    await depend(ingestion.id, topic.id)
    let before = entries.get(TOPIC_STORAGE_KEY)
    await expect(service.restoreVersion(topic.id, first.id)).rejects.toThrow(/Data Ingestion.*circular/)
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(before)
    await service.delete(ingestion.id)
    before = entries.get(TOPIC_STORAGE_KEY)
    await expect(service.restoreVersion(topic.id, first.id)).rejects.toThrow(/Data Ingestion.*Both topics/)
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(before)
    expect(await service.versions(topic.id)).toHaveLength(1)
  })

  it('reports a deleted related topic instead of silently dropping its historical link', async () => {
    await service.addRelationship({ sourceTopicId: streams.id, targetTopicId: topic.id, type: 'related' })
    const saved = await service.createVersion(topic.id, 'With related topic')
    await service.delete(streams.id)
    const before = entries.get(TOPIC_STORAGE_KEY)
    await expect(service.restoreVersion(topic.id, saved.id)).rejects.toThrow(/related topic.*Event Streaming/)
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(before)
  })

  it('keeps both the knowledge and history unchanged when saving a restore fails', async () => {
    const first = await service.createVersion(topic.id, 'Original')
    await service.save({ ...topic, description: 'Current changes' }, topic.id)
    const before = entries.get(TOPIC_STORAGE_KEY)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(service.restoreVersion(topic.id, first.id)).rejects.toThrow('could not save')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(before)
    expect(await service.versions(topic.id)).toHaveLength(1)
  })

  it.each([1, 2, 3, 4, 5])('preserves version %s storage when opening history and takes the first snapshot on demand', async version => {
    await service.readWorkspace()
    const stored = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    delete stored.topicVersions
    const legacyTopics = seed.map(item => ({ ...item, scope: 'Core' }))
    const legacy = version === 1 ? legacyTopics : version === 2 ? { version, topics: legacyTopics, relationships: [] }
      : version === 3 ? { ...stored, version, topics: legacyTopics }
      : version === 4 ? { ...stored, version, folders: [], topics: seed.map((item, order) => ({ ...item, order })) }
      : stored
    const raw = JSON.stringify(legacy)
    entries.set(TOPIC_STORAGE_KEY, raw)
    expect(await service.versions(topic.id)).toEqual([])
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(raw)
    const first = await service.createVersion(topic.id, 'First')
    expect(first.versionNumber).toBe(1)
    const { topics, relationships } = await service.readWorkspace()
    expect(topics.map(item => item.id)).toEqual(seed.map(item => item.id))
    expect(first.snapshot).toEqual(captureTopicSnapshot(topic, topics, relationships))
    if (version === 5) expect(JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)).toMatchObject(stored)
  })
})
