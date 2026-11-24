import type { TrashTarget } from '../domain/trash'
import { defaultTopicType, isTopicType, type Topic, type TopicInput, type TopicType } from '../domain/topic'
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
    if (input.type !== undefined && !isTopicType(input.type)) throw new Error('Choose a valid topic type.')
    const now = new Date().toISOString()
    const data = { ...input, title, description: input.description.trim(), updatedAt: now }

    if (id === undefined) {
      return this.repository.create({ ...data, type: input.type ?? defaultTopicType, id: crypto.randomUUID(), createdAt: now })
    }

    return this.repository.update({ id, ...data })
  }

  delete(id: string) {
    return this.repository.delete(id)
  }

  duplicate(id: string) {
    return this.repository.duplicate(id)
  }

  restoreTopic(id: string) {
    return this.restoreTrash({ type: 'topic', id })
  }

  deletePermanently(id: string) {
    return this.purgeTrashItem({ type: 'topic', id })
  }

  restoreTrash(target: TrashTarget) {
    return this.repository.restoreTrash(target)
  }

  purgeTrashItem(target: TrashTarget) {
    return this.repository.purgeTrashItem(target)
  }

  emptyTrash() {
    return this.repository.emptyTrash()
  }

  async saveMetadata(topicId: string, metadata: TopicMetadata, type?: TopicType) {
    const cleaned = cleanTopicMetadata(metadata)
    // The Metadata editor only changes fields it displays. Preserve hidden legacy values exactly.
    const details = type === undefined ? cleaned : {
      ...cleaned, category: metadata.category, technologies: metadata.technologies,
      platforms: metadata.platforms, languages: metadata.languages, tags: metadata.tags,
    }
    return this.repository.updateMetadata(topicId, details, type)
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

  workingVersion(topicId: string) {
    return this.repository.readWorkingVersion(topicId)
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
