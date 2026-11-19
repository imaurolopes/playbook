export const relationshipTypes = ['dependency', 'related'] as const
export type RelationshipType = (typeof relationshipTypes)[number]

export interface TopicRelationship {
  id: string
  sourceTopicId: string
  targetTopicId: string
  type: RelationshipType
  description?: string
  createdAt: string
  updatedAt: string
}

export type RelationshipInput = Pick<TopicRelationship, 'sourceTopicId' | 'targetTopicId' | 'type' | 'description'>

export function validateRelationship(
  topicIds: ReadonlySet<string>,
  relationships: readonly TopicRelationship[],
  candidate: RelationshipInput,
): void {
  const { sourceTopicId, targetTopicId, type } = candidate
  if (sourceTopicId === targetTopicId) throw new Error('A topic cannot have a relationship with itself.')
  if (!topicIds.has(sourceTopicId) || !topicIds.has(targetTopicId)) {
    throw new Error('Both topics must exist before you can add a relationship.')
  }
  if (relationships.some(existing => existing.type === type && (
    (existing.sourceTopicId === sourceTopicId && existing.targetTopicId === targetTopicId) ||
    (type === 'related' && existing.targetTopicId === sourceTopicId && existing.sourceTopicId === targetTopicId)
  ))) throw new Error('This relationship already exists.')

  if (type !== 'dependency') return

  const outgoing = new Map<string, string[]>()
  for (const edge of relationships) {
    if (edge.type !== 'dependency') continue
    const targets = outgoing.get(edge.sourceTopicId)
    if (targets) targets.push(edge.targetTopicId)
    else outgoing.set(edge.sourceTopicId, [edge.targetTopicId])
  }

  const pending = [targetTopicId]
  const visited = new Set<string>()
  while (pending.length) {
    const current = pending.pop()
    if (current === undefined || visited.has(current)) continue
    if (current === sourceTopicId) throw new Error('This dependency would create a circular dependency chain.')
    visited.add(current)
    for (const target of outgoing.get(current) ?? []) pending.push(target)
  }
}

export function relationshipsFor(topicId: string, relationships: readonly TopicRelationship[]) {
  const dependencies: TopicRelationship[] = []
  const dependents: TopicRelationship[] = []
  const related: TopicRelationship[] = []
  for (const relationship of relationships) {
    const outgoing = relationship.sourceTopicId === topicId
    const incoming = relationship.targetTopicId === topicId
    if (relationship.type === 'related') {
      if (outgoing || incoming) related.push(relationship)
    } else if (outgoing) dependencies.push(relationship)
    else if (incoming) dependents.push(relationship)
  }
  return { dependencies, dependents, related }
}

export function otherTopicId(topicId: string, relationship: TopicRelationship): string {
  return relationship.sourceTopicId === topicId ? relationship.targetTopicId : relationship.sourceTopicId
}
