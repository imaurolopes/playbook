import type { Topic, TopicType } from './topic'
import type { TaskDefinition } from './implementation'
import type { KnowledgeSection } from './knowledge'
import { defaultTopicMetadata, knowledgeMetadata, metadataChanges, type KnowledgeMetadata } from './topic-metadata'
import { otherTopicId, relationshipsFor, type TopicRelationship } from './topic-relationship'

export interface VersionTopicReference {
  readonly id: string
  readonly title: string
}

export interface VersionRelationship extends VersionTopicReference {
  readonly description?: string
  readonly relationship?: Readonly<Pick<TopicRelationship, 'id' | 'sourceTopicId' | 'targetTopicId' | 'createdAt' | 'updatedAt'>>
}

export interface TopicSnapshot {
  readonly title: string
  readonly type?: TopicType
  readonly description: string
  readonly content: string
  readonly metadata: {
    readonly source?: VersionTopicReference
    readonly details?: KnowledgeMetadata
  }
  readonly dependencies: readonly VersionRelationship[]
  readonly related: readonly VersionRelationship[]
  readonly dependents?: readonly VersionRelationship[]
  readonly knowledgeSections?: readonly KnowledgeSection[]
  readonly taskDefinitions?: readonly TaskDefinition[]
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

export function captureTopicSnapshot(topic: Topic, topics: readonly Topic[], relationships: readonly TopicRelationship[],
  knowledge?: { taskDefinitions: readonly TaskDefinition[]; knowledgeSections: readonly KnowledgeSection[] }): TopicSnapshot {
  const titles = new Map(topics.map(item => [item.id, item.title]))
  const reference = (id: string): VersionTopicReference => ({ id, title: titles.get(id) ?? id })
  const describe = (edges: TopicRelationship[]) => edges.map(edge => ({
    ...reference(otherTopicId(topic.id, edge)), description: edge.description,
    relationship: {
      id: edge.id, sourceTopicId: edge.sourceTopicId, targetTopicId: edge.targetTopicId,
      createdAt: edge.createdAt, updatedAt: edge.updatedAt,
    },
  }))
  const { dependencies, related, dependents } = relationshipsFor(topic.id, relationships)
  return {
    title: topic.title, type: topic.type, description: topic.description, content: topic.content,
    metadata: {
      source: topic.sourceTopicId === undefined ? undefined : reference(topic.sourceTopicId),
      details: structuredClone(knowledgeMetadata(topic.metadata ?? defaultTopicMetadata)),
    },
    dependencies: describe(dependencies),
    related: describe(related),
    dependents: describe(dependents),
    ...(knowledge && {
      taskDefinitions: structuredClone(knowledge.taskDefinitions.filter(task => task.topicId === topic.id).sort((a, b) => a.order - b.order)),
      knowledgeSections: structuredClone(knowledge.knowledgeSections.filter(section => section.topicId === topic.id).sort((a, b) => a.order - b.order)),
    }),
  }
}

export function sameVersionRelationship(before: VersionRelationship | undefined, after: VersionRelationship | undefined) {
  return before?.id === after?.id && (before?.description ?? '') === (after?.description ?? '') &&
    (!before?.relationship || !after?.relationship || before.relationship.id === after.relationship.id)
}

export function matchesTopicSnapshot(before: TopicSnapshot, after: TopicSnapshot) {
  const sameLinks = (a: readonly VersionRelationship[], b: readonly VersionRelationship[]) => {
    const byId = new Map(b.map(link => [link.id, link]))
    return a.length === b.length && a.every(link => sameVersionRelationship(link, byId.get(link.id)))
  }
  const taskContent = (snapshot: TopicSnapshot) => snapshot.taskDefinitions?.map(
    ({ createdAt: _createdAt, updatedAt: _updatedAt, ...task }) => task,
  )
  return before.title === after.title && (before.type ?? 'General') === (after.type ?? 'General') &&
    before.description === after.description && before.content === after.content &&
    before.metadata.source?.id === after.metadata.source?.id &&
    metadataChanges(before.metadata.details, after.metadata.details).length === 0 &&
    sameLinks(before.dependencies, after.dependencies) && sameLinks(before.related, after.related) &&
    sameLinks(before.dependents ?? [], after.dependents ?? []) &&
    JSON.stringify(taskContent(before) ?? []) === JSON.stringify(taskContent(after) ?? []) &&
    JSON.stringify(before.knowledgeSections ?? []) === JSON.stringify(after.knowledgeSections ?? [])
}
