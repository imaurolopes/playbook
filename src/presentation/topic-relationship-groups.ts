import { ArrowLeft, Layers3, Link2 } from 'lucide-react'
import { isTrashed, type Topic } from '../domain/topic'
import { otherTopicId, relationshipsFor, type TopicRelationship } from '../domain/topic-relationship'

export const groupDetails = [
  { key: 'dependencies', label: 'Depends on', icon: Link2 },
  { key: 'related', label: 'Related to', icon: Layers3 },
  { key: 'dependents', label: 'Required by', icon: ArrowLeft },
] as const

type GroupKey = (typeof groupDetails)[number]['key']
export interface RelationshipRow {
  relationship: TopicRelationship
  topic: Topic
}
export type RelationshipGroups = Record<GroupKey, RelationshipRow[]>

export function topicRelationshipGroups(topicId: string, topics: readonly Topic[], relationships: readonly TopicRelationship[]): RelationshipGroups {
  const byId = new Map(topics.filter(item => !isTrashed(item)).map(item => [item.id, item]))
  const connections = relationshipsFor(topicId, relationships)
  function rows(edges: readonly TopicRelationship[]): RelationshipRow[] {
    return edges.flatMap(relationship => {
      const other = byId.get(otherTopicId(topicId, relationship))
      return other ? [{ relationship, topic: other }] : []
    })
  }
  return { dependencies: rows(connections.dependencies), related: rows(connections.related), dependents: rows(connections.dependents) }
}
