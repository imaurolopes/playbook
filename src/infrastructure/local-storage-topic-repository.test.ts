import { beforeEach, describe, expect, it } from 'vitest'
import type { Topic } from '../domain/topic'
import { LocalStorageTopicRepository, TOPIC_STORAGE_KEY } from './local-storage-topic-repository'

const timestamp = '2026-11-19T12:00:00.000Z'
const root: Topic = { id: 'root', title: 'Root', description: '', content: '', createdAt: timestamp, updatedAt: timestamp }

describe('LocalStorageTopicRepository', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
  }
  const repository = new LocalStorageTopicRepository(() => storage, [root])

  beforeEach(() => entries.clear())

  it('initializes once and keeps an initialized empty workspace empty', async () => {
    expect(await repository.list()).toEqual([root])
    await repository.delete(root.id)
    const reopened = new LocalStorageTopicRepository(() => storage, [root])
    expect(await reopened.list()).toEqual([])
  })

  it('creates, retrieves, and updates a topic across repository instances', async () => {
    const child: Topic = { ...root, id: 'child', title: 'Child' }
    await repository.create(child)
    expect(await repository.getById(child.id)).toEqual(child)
    const updated = { ...child, title: 'Updated', content: '## Context' }
    await repository.update(updated)
    expect(await new LocalStorageTopicRepository(() => storage).getById(child.id)).toEqual(updated)
    expect(await repository.getById('missing')).toBeUndefined()
  })

  it('rejects duplicate or missing topics without changing data', async () => {
    const child: Topic = { ...root, id: 'child' }
    await repository.create(child)
    await expect(repository.create(child)).rejects.toThrow('already exists')
    await expect(repository.update({ ...root, id: 'missing' })).rejects.toThrow('no longer exists')
    await repository.delete('missing')
    expect(await repository.list()).toEqual([root, child])
  })

  it.each(['{invalid', '{}', JSON.stringify([root, root])])('preserves malformed storage: %s', async raw => {
    entries.set(TOPIC_STORAGE_KEY, raw)
    await expect(repository.list()).rejects.toThrow('original data has been preserved')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(raw)
  })

  it('reports unavailable reads and failed writes', async () => {
    const unavailable = new LocalStorageTopicRepository(() => { throw new Error('Blocked') })
    await expect(unavailable.list()).rejects.toThrow('storage is unavailable')

    await repository.list()
    const readOnly = new LocalStorageTopicRepository(() => ({
      ...storage,
      setItem: () => { throw new Error('Quota exceeded') },
    }))
    await expect(readOnly.update({ ...root, title: 'Changed' })).rejects.toThrow('could not save')
    expect(await repository.getById(root.id)).toEqual(root)
  })
})
