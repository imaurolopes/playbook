import { beforeEach, describe, expect, it } from 'vitest'
import { compareTopicVersions } from '../application/compare-topic-versions'
import { ImplementationService } from '../application/implementation-service'
import { TopicService } from '../application/topic-service'
import type { Topic } from '../domain/topic'
import { defaultTopicMetadata, knowledgeMetadata, type TopicMetadata } from '../domain/topic-metadata'
import { captureTopicSnapshot, matchesTopicSnapshot } from '../domain/topic-version'
import { LocalStorageTopicRepository, TOPIC_STORAGE_KEY } from './local-storage-topic-repository'

const createdAt = '2025-03-01T12:00:00.000Z'
const topic: Topic = {
  type: 'General',
  id: 'cdc', title: 'CDC', description: 'Record changes', content: '## Offsets',
  createdAt, updatedAt: createdAt,
}
const sample: TopicMetadata = {
  category: ' Data patterns ', technicalDomain: ' Data engineering ', tags: [' cdc ', 'cdc', 'streaming'],
  technologies: ['Debezium'], platforms: ['Azure'], languages: ['SQL', 'Java'],
  owner: ' Platform team ', lifecycleStatus: 'In Review', visibility: 'Public',
  customProperties: [{ id: 'retention', key: ' Retention ', value: '14 days' }],
}

describe('topic metadata', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
  }
  const repository = new LocalStorageTopicRepository(() => storage, [topic])
  const topics = new TopicService(repository)

  beforeEach(() => entries.clear())

  it('adds metadata to a legacy topic, preserves project work, and persists through content edits and reload', async () => {
    entries.set(TOPIC_STORAGE_KEY, JSON.stringify([topic]))
    expect((await topics.list())[0]?.metadata).toBeUndefined()
    const plans = new ImplementationService(repository)
    await plans.createImplementation(topic.id, 'azure-data-platform')
    const before = await plans.list()
    const saved = await topics.saveMetadata(topic.id, sample)
    expect(saved).toMatchObject({
      ...topic, updatedAt: expect.any(String),
      metadata: {
        ...sample, category: 'Data patterns', technicalDomain: 'Data engineering', tags: ['cdc', 'streaming'], owner: 'Platform team',
        customProperties: [{ id: 'retention', key: 'Retention', type: 'Text', value: '14 days' }],
      },
    })
    expect(saved.updatedAt).not.toBe(createdAt)
    const updated = await topics.save({ ...topic, content: '## New content' }, topic.id)
    expect(updated.metadata).toEqual(saved.metadata)
    const reopened = new LocalStorageTopicRepository(() => storage)
    expect((await reopened.list())[0]).toEqual(updated)
    expect(await reopened.readImplementations()).toEqual(before)
  })

  it('updates and removes properties by ID and rejects case-insensitive duplicate or blank keys', async () => {
    const initial = await topics.saveMetadata(topic.id, sample)
    const metadata = initial.metadata!
    const raw = entries.get(TOPIC_STORAGE_KEY)
    await expect(topics.saveMetadata(topic.id, { ...metadata, customProperties: [
      ...metadata.customProperties, { id: 'second', key: ' retention ', value: '' },
    ] })).rejects.toThrow('keys must be unique')
    await expect(topics.saveMetadata(topic.id, { ...metadata, customProperties: [
      { id: 'invalid', key: '   ', value: '' },
    ] })).rejects.toThrow('Enter a key')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(raw)
    const edited = await topics.saveMetadata(topic.id, { ...metadata, customProperties: [
      { id: 'retention', key: 'Retention policy', value: ' 30 days ' },
    ] })
    expect(edited.metadata?.customProperties).toEqual([{ id: 'retention', key: 'Retention policy', type: 'Text', value: ' 30 days ' }])
    await topics.saveMetadata(topic.id, { ...metadata, customProperties: [] })
    expect((await topics.list())[0]?.metadata?.customProperties).toEqual([])
  })

  it('preserves the latest metadata when a previously opened content editor saves', async () => {
    const opened = (await topics.list())[0]!
    const saved = await topics.saveMetadata(topic.id, sample)
    const edited = await repository.update({ ...opened, title: 'Edited content', updatedAt: '2026-11-19T15:00:00.000Z' })
    expect(edited.metadata).toEqual(saved.metadata)
    expect(edited.title).toBe('Edited content')
  })

  it('versions classification and restores it independently of governance and legacy fields', async () => {
    const before = await topics.createVersion(topic.id, 'Original defaults')
    const initial = await topics.saveMetadata(topic.id, sample)
    const saved = await topics.saveMetadata(topic.id, initial.metadata!, 'Concept')
    const workspace = await topics.readWorkspace()
    expect(matchesTopicSnapshot(before.snapshot, captureTopicSnapshot(saved, workspace.topics, workspace.relationships))).toBe(false)
    const after = await topics.createVersion(topic.id, 'Classified')
    expect(after.snapshot.metadata.details).toEqual(knowledgeMetadata(saved.metadata!))
    expect(after.snapshot.type).toBe('Concept')
    expect(compareTopicVersions(before.snapshot, after.snapshot).metadata).toEqual(expect.arrayContaining([
      { label: 'Technical domains', before: '', after: 'Data engineering' },
      { label: 'Tags', before: '', after: 'cdc\nstreaming' },
      { label: 'Custom property: Retention', before: 'Not set', after: '14 days' },
    ]))
    const governance = await topics.saveMetadata(topic.id, { ...saved.metadata!, owner: 'Current owner', lifecycleStatus: 'Published' })
    await expect(topics.createVersion(topic.id, 'Governance only')).rejects.toThrow('No meaningful changes')
    const restored = await topics.restoreVersion(topic.id, before.id)
    expect(restored.backup.snapshot.metadata.details).toEqual(knowledgeMetadata(saved.metadata!))
    expect(restored.version.snapshot.metadata.details).toEqual(knowledgeMetadata(defaultTopicMetadata))
    expect((await topics.list())[0]).toMatchObject({ type: 'General',
      metadata: { ...governance.metadata, ...knowledgeMetadata(defaultTopicMetadata) },
    })
    expect((await topics.versions(topic.id)).find(version => version.id === after.id)).toEqual(after)
  })

  it('keeps newly entered metadata when restoring a pre-metadata version', async () => {
    const prior = await topics.createVersion(topic.id, 'Before metadata')
    const raw = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    delete raw.topicVersions[0].snapshot.metadata.details
    entries.set(TOPIC_STORAGE_KEY, JSON.stringify(raw))
    const saved = await topics.saveMetadata(topic.id, sample)
    await topics.save({ ...topic, title: 'Edited title' }, topic.id)
    const restored = await topics.restoreVersion(topic.id, prior.id)
    expect(restored.version.snapshot.title).toBe(topic.title)
    expect((await topics.list())[0]?.metadata).toEqual(saved.metadata)
  })

  it('reads old full snapshots and preserves their original metadata through restoration', async () => {
    const prior = await topics.createVersion(topic.id, 'Legacy snapshot')
    const raw = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    const legacy = { ...defaultTopicMetadata, technicalDomain: 'Original', owner: 'Former owner', category: 'Former category' }
    raw.topicVersions[0].snapshot.metadata.details = legacy
    entries.set(TOPIC_STORAGE_KEY, JSON.stringify(raw))
    const saved = await topics.saveMetadata(topic.id, sample)
    await topics.restoreVersion(topic.id, prior.id)
    expect((await topics.list())[0]?.metadata).toEqual({ ...saved.metadata, ...knowledgeMetadata(legacy) })
    expect((await topics.versions(topic.id)).find(version => version.id === prior.id)?.snapshot.metadata.details).toEqual(legacy)
  })

  it('preserves all property types after reload and detects a type-only change', async () => {
    const properties = [
      { id: 'version', key: 'Version', value: '3.0.1' },
      { id: 'port', key: 'Port', type: 'Number', value: 8083.5 },
      { id: 'open', key: 'Open source', type: 'Boolean', value: false },
      { id: 'date', key: 'Released', type: 'Date', value: '2024-02-29' },
      { id: 'docs', key: 'Docs', type: 'URL', value: 'https://debezium.io' },
    ] as const
    const saved = await topics.saveMetadata(topic.id, { ...defaultTopicMetadata, customProperties: properties })
    const version = await topics.createVersion(topic.id, 'Typed properties')
    const reopened = new LocalStorageTopicRepository(() => storage)
    expect((await reopened.getById(topic.id))?.metadata?.customProperties).toEqual([
      { ...properties[0], type: 'Text' }, ...properties.slice(1),
    ])
    await topics.saveMetadata(topic.id, { ...saved.metadata!, customProperties: properties.map(property =>
      property.id === 'docs' ? { ...property, type: 'Text' } : property) })
    const next = await topics.createVersion(topic.id, 'Change documentation type')
    expect(compareTopicVersions(version.snapshot, next.snapshot).metadata).toContainEqual({
      label: 'Custom property: Docs', before: 'https://debezium.io (URL)', after: 'https://debezium.io (Text)',
    })
    const restored = await topics.restoreVersion(topic.id, version.id)
    expect(restored.version.snapshot.metadata.details?.customProperties).toEqual(version.snapshot.metadata.details?.customProperties)
  })
})
