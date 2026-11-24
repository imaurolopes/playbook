import { isKnowledgeMetadata } from '../domain/topic-metadata'
import { isTopicType } from '../domain/topic'
import type { TopicSnapshot, TopicVersion, VersionRelationship, VersionTopicReference } from '../domain/topic-version'
import { readTaskDefinitions } from './stored-implementations'
import { readKnowledgeSections } from './stored-knowledge'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isReference(value: unknown): value is VersionTopicReference {
  return record(value) && typeof value.id === 'string' && Boolean(value.id) && typeof value.title === 'string'
}

function isLink(value: unknown): value is VersionRelationship {
  if (!record(value) || !isReference(value) || (value.description !== undefined && typeof value.description !== 'string')) return false
  const edge = value.relationship
  return edge === undefined || (record(edge) &&
    ['id', 'sourceTopicId', 'targetTopicId'].every(field => typeof edge[field] === 'string' && Boolean(edge[field])) &&
    ['createdAt', 'updatedAt'].every(field => typeof edge[field] === 'string' && Number.isFinite(Date.parse(edge[field] as string))))
}

function linkList(value: unknown): value is VersionRelationship[] {
  return Array.isArray(value) && value.every(isLink) && new Set(value.map(link => link.id)).size === value.length
}

function isSnapshot(value: unknown): value is TopicSnapshot {
  if (!record(value) || !record(value.metadata)) return false
  const { metadata } = value
  return typeof value.title === 'string' && Boolean(value.title.trim()) &&
    (value.type === undefined || isTopicType(value.type)) &&
    typeof value.description === 'string' && typeof value.content === 'string' &&
    (metadata.source === undefined || isReference(metadata.source)) &&
    (metadata.details === undefined || isKnowledgeMetadata(metadata.details)) &&
    linkList(value.dependencies) && linkList(value.related) && (value.dependents === undefined || linkList(value.dependents))
}

function isVersion(value: unknown): value is TopicVersion {
  return record(value) && typeof value.id === 'string' && Boolean(value.id) && typeof value.topicId === 'string' &&
    typeof value.versionNumber === 'number' && Number.isSafeInteger(value.versionNumber) && value.versionNumber > 0 &&
    typeof value.summary === 'string' && Boolean(value.summary.trim()) && typeof value.author === 'string' && Boolean(value.author.trim()) &&
    typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) &&
    isSnapshot(value.snapshot) && (value.restoredFromVersionId === undefined || typeof value.restoredFromVersionId === 'string')
}

export function readTopicVersions(value: unknown, topicIds: ReadonlySet<string>) {
  if (!Array.isArray(value) || !value.every(isVersion)) throw new Error('Invalid topic versions.')
  const byId = new Map(value.map(item => [item.id, item]))
  const numbers = new Set(value.map(item => JSON.stringify([item.topicId, item.versionNumber])))
  if (byId.size !== value.length || numbers.size !== value.length) throw new Error('Duplicate topic versions.')
  for (const item of value) {
    if (!topicIds.has(item.topicId)) throw new Error('Missing version topic.')
    if (item.snapshot.taskDefinitions !== undefined) readTaskDefinitions(item.snapshot.taskDefinitions, new Set([item.topicId]))
    if (item.snapshot.knowledgeSections !== undefined) readKnowledgeSections(item.snapshot.knowledgeSections, new Set([item.topicId]))
    const { dependencies, related, dependents = [] } = item.snapshot
    for (const [links, direction] of [[dependencies, 'outgoing'], [dependents, 'incoming'], [related, 'any']] as const) {
      for (const link of links) {
        const edge = link.relationship
        if (!edge) continue
        const outgoing = edge.sourceTopicId === item.topicId && edge.targetTopicId === link.id
        const incoming = edge.targetTopicId === item.topicId && edge.sourceTopicId === link.id
        if (!(direction === 'outgoing' ? outgoing : direction === 'incoming' ? incoming : outgoing || incoming)) {
          throw new Error('Invalid snapshot relationship.')
        }
      }
    }
    if (item.restoredFromVersionId !== undefined) {
      const source = byId.get(item.restoredFromVersionId)
      if (!source || source.topicId !== item.topicId || source.versionNumber >= item.versionNumber) {
        throw new Error('Invalid restored version reference.')
      }
    }
  }
  return value
}
