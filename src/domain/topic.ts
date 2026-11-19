export const scopes = ['Core', 'Organization', 'Project'] as const
import type { TopicMetadata } from './topic-metadata'

export type TopicScope = (typeof scopes)[number]

export interface Topic {
  id: string
  parentId?: string
  title: string
  description: string
  content: string
  scope: TopicScope
  sourceTopicId?: string
  metadata?: TopicMetadata
  createdAt: string
  updatedAt: string
}

export type TopicInput = Pick<Topic, 'parentId' | 'title' | 'description' | 'content' | 'scope'>

export function validateParent(topics: readonly Topic[], id: string, parentId?: string): void {
  const byId = new Map(topics.map(topic => [topic.id, topic]))
  const visited = new Set([id])

  while (parentId !== undefined) {
    if (visited.has(parentId)) throw new Error('A topic cannot be its own parent or sit beneath one of its descendants.')
    const parent = byId.get(parentId)
    if (!parent) throw new Error('Choose an existing parent topic.')
    visited.add(parentId)
    parentId = parent.parentId
  }
}

export function ancestorsOf(topic: Topic, topics: readonly Topic[]): Topic[] {
  const ancestors: Topic[] = []
  let parentId = topic.parentId
  while (parentId) {
    const parent = topics.find(candidate => candidate.id === parentId)
    if (!parent) break
    ancestors.unshift(parent)
    parentId = parent.parentId
  }
  return ancestors
}
