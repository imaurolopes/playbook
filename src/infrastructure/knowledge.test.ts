import { beforeEach, describe, expect, it } from 'vitest'
import { KnowledgeService } from '../application/knowledge-service'
import type { Topic } from '../domain/topic'
import { LocalStorageTopicRepository, TOPIC_STORAGE_KEY } from './local-storage-topic-repository'

const timestamp = '2026-11-19T12:00:00.000Z'
const topic: Topic = { type: 'General', id: 'root', title: 'Legacy topic', description: '', content: '# Existing Markdown', createdAt: timestamp, updatedAt: timestamp }
const section = { id: 'runbook', topicId: topic.id, key: 'runbook', title: 'Runbook', content: 'Run checks.', order: 10 }
const legacy = {
  sections: [section],
  scopes: [
    { scopeType: 'Organization', scopeId: 'example-org', parent: { scopeType: 'Core', scopeId: 'core' } },
    { scopeType: 'Project', scopeId: 'azure-data-platform', parent: { scopeType: 'Organization', scopeId: 'example-org' } },
  ],
  overlays: [
    { id: 'org-overlay', topicId: topic.id, scopeType: 'Organization', scopeId: 'example-org',
      sections: [{ key: section.key, mode: 'extend', content: 'Notify operations.' }], createdAt: timestamp, updatedAt: timestamp },
    { id: 'project-overlay', topicId: topic.id, scopeType: 'Project', scopeId: 'azure-data-platform',
      sections: [{ key: section.key, mode: 'override', content: 'Notify the project owner.' }], createdAt: timestamp, updatedAt: timestamp },
  ],
}

describe('persisted knowledge', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
  }
  const repository = new LocalStorageTopicRepository(() => storage, [topic])
  const service = new KnowledgeService(repository)

  beforeEach(() => entries.clear())

  it.each([1, 2, 3])('preserves topic Markdown in workspace format %s', async version => {
    await repository.readWorkspace()
    const workspace = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    delete workspace.knowledgeSections
    entries.set(TOPIC_STORAGE_KEY, JSON.stringify(version === 1 ? [topic] : version === 2 ? { version, topics: [topic], relationships: [] } : { ...workspace, version }))
    const original = entries.get(TOPIC_STORAGE_KEY)
    expect(await service.read(topic.id)).toEqual({ sections: [] })
    expect(await repository.getById(topic.id)).toEqual(topic)
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)
  })

  it('migrates shared sections and atomically retains scoped data on the next write', async () => {
    await repository.createVersion(topic.id, 'Existing version', 'Local user')
    const workspace = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    delete workspace.knowledgeSections
    entries.set(TOPIC_STORAGE_KEY, JSON.stringify({ ...workspace, knowledgeData: legacy }))
    const original = entries.get(TOPIC_STORAGE_KEY)

    expect(await service.read(topic.id)).toEqual({
      sections: [section], migrationNotice: expect.stringContaining('scope records: 2, customization records: 2'),
    })
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)

    await service.saveSection(topic.id, section.id, 'Updated Markdown')
    const reopened = new LocalStorageTopicRepository(() => storage)
    const updated = { ...section, content: 'Updated Markdown' }
    expect((await reopened.readKnowledge(topic.id)).sections).toEqual([updated])
    expect(await reopened.getById(topic.id)).toEqual({ ...topic, updatedAt: expect.any(String) })
    expect(JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)).toMatchObject({
      implementationData: workspace.implementationData, topicVersions: workspace.topicVersions,
      knowledgeSections: [updated], legacyKnowledgeData: legacy,
    })
    expect(JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)).not.toHaveProperty('knowledgeData')
  })

  it('retains conflicting and orphaned legacy sections while loading unambiguous sections', async () => {
    const knowledgeData = {
      scopes: [], overlays: [],
      sections: [section, { ...section, id: 'duplicate' }, { ...section, topicId: 'missing' },
        { ...section, id: 'unique', key: 'unique' }],
    }
    entries.set(TOPIC_STORAGE_KEY, JSON.stringify({ version: 2, topics: [topic], relationships: [], knowledgeData }))
    const { sections, migrationNotice } = await service.read(topic.id)
    expect(sections.map(item => item.id)).toEqual(['unique'])
    expect(migrationNotice).toContain('could not be merged safely')
    await service.saveSection(topic.id, 'unique', '')
    expect(JSON.parse(entries.get(TOPIC_STORAGE_KEY)!).legacyKnowledgeData).toEqual(knowledgeData)
  })

  it('keeps archived data through project and topic deletion', async () => {
    entries.set(TOPIC_STORAGE_KEY, JSON.stringify({ version: 2, topics: [topic], relationships: [], knowledgeData: legacy }))
    await repository.deleteProject('azure-data-platform')
    expect((await service.read(topic.id)).sections).toEqual([section])
    await repository.delete(topic.id)
    const original = entries.get(TOPIC_STORAGE_KEY)
    await expect(service.saveSection(topic.id, section.id, 'stale edit')).rejects.toThrow('no longer exists')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)
    expect(JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)).toMatchObject({ knowledgeSections: [section], legacyKnowledgeData: legacy })
    await repository.deletePermanently(topic.id)
    expect(JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)).toMatchObject({ knowledgeSections: [], legacyKnowledgeData: legacy })
  })
})
