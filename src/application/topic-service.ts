import type { Topic, TopicInput } from '../domain/topic'
import type { RelationshipInput } from '../domain/topic-relationship'
import type { TopicRepository } from './topic-repository'

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

    const existing = await this.repository.getById(id)
    if (!existing) throw new Error('This topic no longer exists.')
    return this.repository.update({ ...existing, ...data })
  }

  delete(id: string) {
    return this.repository.delete(id)
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

  removeRelationship(id: string) {
    return this.repository.deleteRelationship(id)
  }
}
