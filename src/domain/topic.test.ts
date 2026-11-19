import { describe, expect, it } from 'vitest'
import { ancestorsOf, validateParent, type Topic } from './topic'

const timestamp = '2026-11-19T12:00:00.000Z'

function topic(id: string, parentId?: string): Topic {
  return { id, parentId, title: id, description: '', content: '', scope: 'Core', createdAt: timestamp, updatedAt: timestamp }
}

describe('topic hierarchy', () => {
  const topics = [topic('root'), topic('child', 'root'), topic('grandchild', 'child')]

  it('accepts top-level topics and existing non-descendant parents', () => {
    expect(() => validateParent(topics, 'child')).not.toThrow()
    expect(() => validateParent(topics, 'new', 'grandchild')).not.toThrow()
  })

  it('rejects missing parents', () => {
    expect(() => validateParent(topics, 'new', 'missing')).toThrow('existing parent')
  })

  it('rejects direct and indirect cycles', () => {
    expect(() => validateParent(topics, 'root', 'root')).toThrow('own parent')
    expect(() => validateParent(topics, 'root', 'grandchild')).toThrow('descendants')
    expect(() => validateParent([topic('a', 'b'), topic('b', 'a')], 'new', 'a')).toThrow()
  })

  it('lists ancestors from the root down', () => {
    expect(ancestorsOf(topic('grandchild', 'child'), topics).map(parent => parent.id)).toEqual(['root', 'child'])
  })
})
