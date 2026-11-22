import type { KnowledgeRepository } from './knowledge-repository'

export class KnowledgeService {
  constructor(private readonly repository: KnowledgeRepository) {}

  read(topicId: string) {
    return this.repository.readKnowledge(topicId)
  }

  saveSection(topicId: string, sectionId: string, content: string) {
    return this.repository.saveKnowledgeSection(topicId, sectionId, content)
  }
}
