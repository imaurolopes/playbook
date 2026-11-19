import type { TopicRepository, TopicWorkspace } from '../application/topic-repository'
import { scopes, validateParent, type Topic } from '../domain/topic'
import { relationshipTypes, validateRelationship, type TopicRelationship } from '../domain/topic-relationship'

export const TOPIC_STORAGE_KEY = 'playbook.topics.v1'
type TopicStorage = Pick<Storage, 'getItem' | 'setItem'>

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isTopic(value: unknown): value is Topic {
  if (!value || typeof value !== 'object') return false
  const topic = value as Record<string, unknown>
  return typeof topic.id === 'string' && Boolean(topic.id) &&
    typeof topic.title === 'string' && Boolean(topic.title.trim()) &&
    typeof topic.description === 'string' && typeof topic.content === 'string' &&
    scopes.some(scope => scope === topic.scope) &&
    isTimestamp(topic.createdAt) && isTimestamp(topic.updatedAt) &&
    (topic.parentId === undefined || typeof topic.parentId === 'string') &&
    (topic.sourceTopicId === undefined || typeof topic.sourceTopicId === 'string')
}

function isRelationship(value: unknown): value is TopicRelationship {
  if (!value || typeof value !== 'object') return false
  const edge = value as Record<string, unknown>
  return typeof edge.id === 'string' && Boolean(edge.id) &&
    typeof edge.sourceTopicId === 'string' && typeof edge.targetTopicId === 'string' &&
    relationshipTypes.some(type => type === edge.type) &&
    (edge.description === undefined || typeof edge.description === 'string') &&
    isTimestamp(edge.createdAt) && isTimestamp(edge.updatedAt)
}

export class LocalStorageTopicRepository implements TopicRepository {
  constructor(
    private readonly storage: () => TopicStorage,
    private readonly seed: readonly Topic[] = [],
  ) {}

  private read(): TopicWorkspace {
    let raw: string | null
    try {
      raw = this.storage().getItem(TOPIC_STORAGE_KEY)
    } catch {
      throw new Error('Browser storage is unavailable. Check your browser settings and try again.')
    }

    if (raw === null) {
      const workspace = { topics: this.seed.map(topic => ({ ...topic })), relationships: [] }
      this.write(workspace)
      return workspace
    }

    try {
      const stored: unknown = JSON.parse(raw)
      // A legacy array is upgraded in memory and written in the new format on the next change.
      const data = Array.isArray(stored)
        ? { version: 2, topics: stored, relationships: [] }
        : stored as Record<string, unknown> | null
      if (data?.version !== 2) throw new Error()
      const { topics, relationships } = data
      if (!Array.isArray(topics) || !topics.every(isTopic) ||
          !Array.isArray(relationships) || !relationships.every(isRelationship)) throw new Error()

      const topicIds = new Set(topics.map(topic => topic.id))
      if (topicIds.size !== topics.length) throw new Error()
      for (const topic of topics) validateParent(topics, topic.id, topic.parentId)

      const edgeIds = new Set<string>()
      const validated: TopicRelationship[] = []
      for (const relationship of relationships) {
        if (edgeIds.has(relationship.id)) throw new Error()
        validateRelationship(topicIds, validated, relationship)
        edgeIds.add(relationship.id)
        validated.push(relationship)
      }
      return { topics, relationships }
    } catch {
      throw new Error('Stored Playbook topics or relationships are invalid. The original data has been preserved.')
    }
  }

  private write(workspace: TopicWorkspace): void {
    try {
      this.storage().setItem(TOPIC_STORAGE_KEY, JSON.stringify({ version: 2, ...workspace }))
    } catch {
      throw new Error('Playbook could not save to browser storage. Check available space and browser settings.')
    }
  }

  async readWorkspace() {
    return this.read()
  }

  async list() {
    return this.read().topics
  }

  async getById(id: string) {
    return this.read().topics.find(topic => topic.id === id)
  }

  async create(topic: Topic) {
    const workspace = this.read()
    if (workspace.topics.some(existing => existing.id === topic.id)) throw new Error('A topic with this ID already exists.')
    validateParent(workspace.topics, topic.id, topic.parentId)
    workspace.topics.push(topic)
    this.write(workspace)
    return topic
  }

  async update(topic: Topic) {
    const workspace = this.read()
    const index = workspace.topics.findIndex(existing => existing.id === topic.id)
    if (index === -1) throw new Error('This topic no longer exists.')
    validateParent(workspace.topics, topic.id, topic.parentId)
    workspace.topics[index] = topic
    this.write(workspace)
    return topic
  }

  async delete(id: string) {
    const { topics, relationships } = this.read()
    const topic = topics.find(existing => existing.id === id)
    if (!topic) throw new Error('This topic no longer exists.')
    const updatedAt = new Date().toISOString()
    this.write({
      topics: topics.filter(existing => existing.id !== id).map(existing =>
        existing.parentId === id ? { ...existing, parentId: topic.parentId, updatedAt } : existing,
      ),
      relationships: relationships.filter(edge => edge.sourceTopicId !== id && edge.targetTopicId !== id),
    })
  }

  async createRelationship(relationship: TopicRelationship) {
    const workspace = this.read()
    if (workspace.relationships.some(existing => existing.id === relationship.id)) {
      throw new Error('A relationship with this ID already exists.')
    }
    validateRelationship(new Set(workspace.topics.map(topic => topic.id)), workspace.relationships, relationship)
    workspace.relationships.push(relationship)
    this.write(workspace)
    return relationship
  }

  async deleteRelationship(id: string) {
    const workspace = this.read()
    const index = workspace.relationships.findIndex(edge => edge.id === id)
    if (index === -1) throw new Error('This relationship no longer exists.')
    workspace.relationships.splice(index, 1)
    this.write(workspace)
  }
}
