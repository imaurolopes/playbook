import type { Topic, TopicInput } from '../domain/topic'
import type { RelationshipInput } from '../domain/topic-relationship'
import type { TopicRepository } from './topic-repository'
import { cleanTopicMetadata, type TopicMetadata } from '../domain/topic-metadata'

const localAuthor = 'Local user'

export class TopicService {
  constructor(private readonly repository: TopicRepository) {}

  list() {
    return this.repository.list()
  }

  readWorkspace() {
    return this.repository.readWorkspace()
  }

  async save(input: TopicInput, id?: string): Promise<Topic> {
    const title = input.title.trim()
    if (!title) throw new Error('Enter a topic title.')
    const now = new Date().toISOString()
    const data = { ...input, title, description: input.description.trim(), updatedAt: now }

    if (id === undefined) {
      return this.repository.create({ ...data, id: crypto.randomUUID(), createdAt: now })
    }

    return this.repository.update({ id, ...data })
  }

  delete(id: string) {
    return this.repository.delete(id)
  }

  restoreTopic(id: string) {
    return this.repository.restoreTopic(id)
  }

  deletePermanently(id: string) {
    return this.repository.deletePermanently(id)
  }

  emptyTrash() {
    return this.repository.emptyTrash()
  }

  async saveMetadata(topicId: string, metadata: TopicMetadata) {
    return this.repository.updateMetadata(topicId, cleanTopicMetadata(metadata))
  }

  addRelationship(input: RelationshipInput) {
    const now = new Date().toISOString()
    return this.repository.createRelationship({
      ...input,
      description: input.description?.trim() || undefined,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    })
  }

  editRelationship(id: string, input: RelationshipInput) {
    return this.repository.updateRelationship(id, { ...input, description: input.description?.trim() || undefined }, new Date().toISOString())
  }

  removeRelationship(id: string) {
    return this.repository.deleteRelationship(id)
  }

  versions(topicId: string) {
    return this.repository.listVersions(topicId)
  }

  async createVersion(topicId: string, summary: string) {
    const message = summary.trim()
    if (!message) throw new Error('Enter a change summary.')
    return this.repository.createVersion(topicId, message, localAuthor)
  }

  restoreVersion(topicId: string, versionId: string) {
    return this.repository.restoreVersion(topicId, versionId, localAuthor)
  }
}
