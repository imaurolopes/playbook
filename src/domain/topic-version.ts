import type { Topic } from './topic'
import { defaultTopicMetadata, metadataChanges, type TopicMetadata } from './topic-metadata'
import { otherTopicId, relationshipsFor, type TopicRelationship } from './topic-relationship'

export interface VersionTopicReference {
  readonly id: string
  readonly title: string
}

export interface VersionRelationship extends VersionTopicReference {
  readonly description?: string
}

export interface TopicSnapshot {
  readonly title: string
  readonly description: string
  readonly content: string
  readonly metadata: {
    readonly source?: VersionTopicReference
    readonly details?: TopicMetadata
  }
  readonly dependencies: readonly VersionRelationship[]
  readonly related: readonly VersionRelationship[]
}

export interface TopicVersion {
  readonly id: string
  readonly topicId: string
  readonly versionNumber: number
  readonly summary: string
  readonly createdAt: string
  readonly author: string
  readonly snapshot: TopicSnapshot
  readonly restoredFromVersionId?: string
}

export function captureTopicSnapshot(topic: Topic, topics: readonly Topic[], relationships: readonly TopicRelationship[]): TopicSnapshot {
  const titles = new Map(topics.map(item => [item.id, item.title]))
  const reference = (id: string): VersionTopicReference => ({ id, title: titles.get(id) ?? id })
  const describe = (edges: TopicRelationship[]) => edges.map(edge => ({
    ...reference(otherTopicId(topic.id, edge)), description: edge.description,
  }))
  const { dependencies, related } = relationshipsFor(topic.id, relationships)
  return {
    title: topic.title, description: topic.description, content: topic.content,
    metadata: {
      source: topic.sourceTopicId === undefined ? undefined : reference(topic.sourceTopicId),
      details: structuredClone(topic.metadata ?? defaultTopicMetadata),
    },
    dependencies: describe(dependencies),
    related: describe(related),
  }
}

export function sameVersionRelationship(before: VersionRelationship | undefined, after: VersionRelationship | undefined) {
  return before?.id === after?.id && (before?.description ?? '') === (after?.description ?? '')
}

export function matchesTopicSnapshot(before: TopicSnapshot, after: TopicSnapshot) {
  const sameLinks = (a: readonly VersionRelationship[], b: readonly VersionRelationship[]) => {
    const byId = new Map(b.map(link => [link.id, link]))
    return a.length === b.length && a.every(link => sameVersionRelationship(link, byId.get(link.id)))
  }
  return before.title === after.title && before.description === after.description && before.content === after.content &&
    before.metadata.source?.id === after.metadata.source?.id &&
    metadataChanges(before.metadata.details, after.metadata.details).length === 0 &&
    sameLinks(before.dependencies, after.dependencies) && sameLinks(before.related, after.related)
}
