import { describe, expect, it, vi } from 'vitest'
import { ImplementationService } from '../application/implementation-service'
import { InstructionService } from '../application/instruction-service'
import { TopicService } from '../application/topic-service'
import { defaultInstructionOptions } from '../domain/agent-instructions'
import { defaultTopicMetadata } from '../domain/topic-metadata'
import type { Topic } from '../domain/topic'
import { LocalStorageTopicRepository, TOPIC_STORAGE_KEY } from './local-storage-topic-repository'
import { TOPIC_ORGANIZATION_BACKUP_PREFIX } from './topic-organization-migration'

const timestamp = '2026-11-19T12:00:00.000Z'
function topic(id: string): Topic {
  return { id, title: id, description: 'Original description', content: '# Original content', createdAt: timestamp, updatedAt: timestamp }
}

const firstBackup = TOPIC_ORGANIZATION_BACKUP_PREFIX + '1'
const secondBackup = TOPIC_ORGANIZATION_BACKUP_PREFIX + '2'

function setup() {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { entries.set(key, value) }),
  }
  const open = () => new LocalStorageTopicRepository(() => storage, [topic('first'), topic('second'), topic('third')])
  return { entries, storage, open }
}

describe('flat topic migration', () => {
  it('backs up the exact v4 workspace once and preserves topic content and linked data', async () => {
    const { entries, open, storage } = setup()
    const repository = open()
    const topics = new TopicService(repository)
    const plans = new ImplementationService(repository)
    const instructions = new InstructionService(repository)
    const key = { topicId: 'second', projectId: 'azure-data-platform', agentProfileId: 'generic' }
    await topics.addRelationship({ sourceTopicId: 'second', targetTopicId: 'third', type: 'dependency', description: 'Explicit dependency' })
    await topics.addRelationship({ sourceTopicId: 'first', targetTopicId: 'third', type: 'related' })
    await topics.saveMetadata('second', { ...defaultTopicMetadata, category: 'Data Patterns' })
    const snapshot = await topics.createVersion('second', 'Before flattening')
    await plans.createImplementation(key.topicId, key.projectId)
    await instructions.generate(key, defaultInstructionOptions)
    await instructions.saveEdit(key, '# Saved user instructions')
    const active = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    active.knowledgeSections = [{ id: 'runbook', topicId: 'second', key: 'runbook', title: 'Runbook', content: 'Keep this.', order: 0 }]
    active.legacyKnowledgeData = { overlays: [{ id: 'archived-customization' }] }
    const prior = {
      ...active, version: 4,
      folders: [{ id: 'outer', name: 'Outer', order: 1 }, { id: 'inner', name: 'Inner', parentFolderId: 'outer', order: 0 }],
      topics: [{ ...active.topics[0], folderId: 'inner', order: 0 }, { ...active.topics[1], folderId: 'inner', order: 1 },
        { ...active.topics[2], order: 0 }],
      legacyNavigation: { topics: [{ id: 'first', scope: 'Project' }], detachedTopicIds: [],
        versions: { [snapshot.id]: { scope: 'Core', parent: { id: 'first', title: 'Former title' } } } },
    }
    const original = JSON.stringify(prior, null, 2)
    entries.set(TOPIC_STORAGE_KEY, original)
    entries.set(firstBackup, 'Previously saved backup')
    storage.setItem.mockClear()

    const migrated = await open().readWorkspace()
    expect(migrated).toMatchObject({ topics: active.topics, relationships: active.relationships })
    expect(migrated.topics).toEqual(active.topics)
    expect(migrated).not.toHaveProperty('folders')
    expect(migrated.navigationNotice).toContain(secondBackup)
    expect(await open().readWorkspace()).toEqual(migrated)
    expect(storage.setItem.mock.calls).toEqual([[secondBackup, original]])
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)

    expect((await open().readKnowledge('second')).sections).toEqual(active.knowledgeSections)
    await open().update({ ...migrated.topics[1]!, title: 'Edited after migration' })
    const saved = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    expect(saved).toMatchObject({
      version: 5, relationships: active.relationships, knowledgeSections: active.knowledgeSections,
      legacyKnowledgeData: active.legacyKnowledgeData, implementationData: active.implementationData,
      instructionDrafts: active.instructionDrafts, topicVersions: active.topicVersions,
    })
    expect(saved.topics[1]).toEqual({ ...active.topics[1], title: 'Edited after migration' })
    expect(saved).not.toHaveProperty('folders')
    expect(saved).not.toHaveProperty('legacyNavigation')
    expect((await open().readWorkspace()).navigationNotice).toBe(migrated.navigationNotice)
    expect(entries.get(firstBackup)).toBe('Previously saved backup')
    expect(entries.get(secondBackup)).toBe(original)
    expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual([secondBackup, TOPIC_STORAGE_KEY])
  })

  it('reports ambiguous organization while keeping orphaned topics and original records', async () => {
    const { entries, open } = setup()
    await open().readWorkspace()
    const initial = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    const original = JSON.stringify({
      ...initial, version: 4,
      folders: [{ id: 'a', name: 'A', parentFolderId: 'b', order: 0 }, { id: 'b', name: 'B', parentFolderId: 'a', order: 0 }],
      topics: [{ ...topic('one'), folderId: 'missing', order: 0 }, { ...topic('two'), order: 0 }, { ...topic('three'), order: 0 }],
    })
    entries.set(TOPIC_STORAGE_KEY, original)
    const workspace = await open().readWorkspace()
    expect(workspace.navigationNotice).toContain('missing or cyclic organization links')
    expect(workspace.navigationNotice).toContain('invalid or conflicting sibling order')
    expect(workspace.topics).toEqual([topic('one'), topic('two'), topic('three')])
    expect(workspace.relationships).toEqual([])
    expect(entries.get(firstBackup)).toBe(original)
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)
  })

  it('keeps legacy parent links in the backup without creating relationships', async () => {
    const { entries, open } = setup()
    const original = JSON.stringify([{ ...topic('first'), scope: 'Core' }, { ...topic('second'), parentId: 'first', scope: 'Project' }])
    entries.set(TOPIC_STORAGE_KEY, original)
    const workspace = await open().readWorkspace()
    expect(workspace.topics).toEqual([topic('first'), topic('second')])
    expect(workspace.relationships).toEqual([])
    expect(entries.get(firstBackup)).toBe(original)
  })

  it('leaves the original unchanged when backup fails and reuses a successful backup after a failed save', async () => {
    const { entries, storage, open } = setup()
    const original = JSON.stringify([topic('first')])
    entries.set(TOPIC_STORAGE_KEY, original)
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(open().readWorkspace()).rejects.toThrow('could not back up')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)
    expect(entries.has(firstBackup)).toBe(false)
    await open().readWorkspace()
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(open().update({ ...topic('first'), title: 'Edited' })).rejects.toThrow('could not save')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)
    expect(entries.get(firstBackup)).toBe(original)
    await open().update({ ...topic('first'), title: 'Edited' })
    expect(entries.has(secondBackup)).toBe(false)
    expect((await open().getById('first'))?.title).toBe('Edited')
  })

  it('rejects duplicate topic IDs before writing anything', async () => {
    const { entries, storage, open } = setup()
    const original = JSON.stringify([topic('first'), { ...topic('first'), title: 'Second title' }])
    entries.set(TOPIC_STORAGE_KEY, original)
    await expect(open().readWorkspace()).rejects.toThrow('duplicate topic IDs')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
