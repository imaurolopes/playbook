import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicService } from '../application/topic-service'
import type { Topic } from '../domain/topic'
import { otherTopicId, relationshipsFor, type RelationshipType } from '../domain/topic-relationship'
import { LocalStorageTopicRepository, TOPIC_STORAGE_KEY } from './local-storage-topic-repository'

const timestamp = '2026-11-19T12:00:00.000Z'
function makeTopic(id: string): Topic {
  return {
    id, title: id, description: 'User description', content: '## User Markdown',
    createdAt: timestamp, updatedAt: timestamp,
  }
}

const topics = [makeTopic('data'), makeTopic('cdc'), makeTopic('kafka'), makeTopic('quality')]

describe('topic relationships', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { entries.set(key, value) }),
  }
  const repository = new LocalStorageTopicRepository(() => storage, topics)
  const service = new TopicService(repository)

  function add(sourceTopicId: string, targetTopicId: string, type: RelationshipType = 'dependency') {
    return service.addRelationship({ sourceTopicId, targetTopicId, type, description: '  Technical context  ' })
  }

  beforeEach(() => {
    entries.clear()
    storage.setItem.mockClear()
  })

  it('creates and removes a dependency, with a stable ID and optional description', async () => {
    const edge = await add('cdc', 'kafka')
    expect(edge).toMatchObject({ sourceTopicId: 'cdc', targetTopicId: 'kafka', type: 'dependency', description: 'Technical context' })
    expect(edge.id).toBeTruthy()
    expect(edge.updatedAt).toBe(edge.createdAt)
    expect((await repository.readWorkspace()).relationships).toEqual([edge])
    await service.removeRelationship(edge.id)
    expect((await repository.readWorkspace()).relationships).toEqual([])
  })

  it('rejects duplicate directed dependencies and reverse duplicates of related edges', async () => {
    await add('cdc', 'kafka')
    await expect(add('cdc', 'kafka')).rejects.toThrow('already exists')
    await add('cdc', 'kafka', 'related')
    await expect(add('kafka', 'cdc', 'related')).rejects.toThrow('already exists')
    expect((await repository.readWorkspace()).relationships).toHaveLength(2)
  })

  it.each(['dependency', 'related'] as const)('rejects self-references and missing endpoints for %s', async type => {
    await expect(add('cdc', 'cdc', type)).rejects.toThrow('itself')
    await expect(add('missing', 'cdc', type)).rejects.toThrow('Both topics must exist')
    await expect(add('cdc', 'missing', type)).rejects.toThrow('Both topics must exist')
    expect((await repository.readWorkspace()).relationships).toEqual([])
  })

  it('rejects two-topic and transitive cycles independently of related edges', async () => {
    await add('cdc', 'data')
    await expect(add('data', 'cdc')).rejects.toThrow('circular')
    await add('data', 'kafka')
    await add('kafka', 'cdc', 'related')
    await expect(add('kafka', 'cdc')).rejects.toThrow('circular')
    expect((await repository.readWorkspace()).relationships).toHaveLength(3)
  })

  it('finds direct and reverse dependencies and exposes a related edge to both topics', async () => {
    const outgoing = await add('cdc', 'kafka')
    const incoming = await add('quality', 'cdc')
    const related = await add('kafka', 'cdc', 'related')
    const edges = (await repository.readWorkspace()).relationships
    expect(relationshipsFor('cdc', edges)).toEqual({ dependencies: [outgoing], dependents: [incoming], related: [related] })
    expect(relationshipsFor('kafka', edges)).toEqual({ dependencies: [], dependents: [outgoing], related: [related] })
    expect(otherTopicId('cdc', related)).toBe('kafka')
    expect(otherTopicId('kafka', related)).toBe('cdc')
  })

  it('hides incident edges in the same write and preserves unrelated edges', async () => {
    await add('data', 'kafka')
    await add('quality', 'data')
    await add('data', 'cdc', 'related')
    const kept = await add('cdc', 'quality')
    storage.setItem.mockClear()
    await service.delete('data')
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    const workspace = await repository.readWorkspace()
    expect(workspace.relationships).toEqual([kept])
    expect(workspace.topics.map(topic => topic.id)).toEqual(['cdc', 'kafka', 'quality'])
  })

  it('leaves topics and relationships intact if a deletion write fails', async () => {
    const edge = await add('cdc', 'kafka')
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(service.delete('kafka')).rejects.toThrow('could not save')
    expect(await repository.readWorkspace()).toEqual({ topics, trashedTopics: [], relationships: [edge] })
  })

  it('recognizes an empty legacy workspace and leaves corrupt relationship records untouched', async () => {
    entries.set(TOPIC_STORAGE_KEY, '[]')
    expect(await repository.readWorkspace()).toMatchObject({ topics: [], relationships: [] })
    const raw = JSON.stringify({
      version: 2, topics, relationships: [{ id: 'orphan', sourceTopicId: 'missing', targetTopicId: 'cdc', type: 'related', createdAt: timestamp, updatedAt: timestamp }],
    })
    entries.set(TOPIC_STORAGE_KEY, raw)
    await expect(repository.readWorkspace()).rejects.toThrow('original data has been preserved')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(raw)
  })
})
