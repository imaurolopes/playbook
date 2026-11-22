import type { KnowledgeSection } from '../domain/knowledge'

export interface KnowledgeRepository {
  readKnowledge(topicId: string): Promise<{ sections: KnowledgeSection[]; migrationNotice?: string }>
  saveKnowledgeSection(topicId: string, sectionId: string, content: string): Promise<KnowledgeSection>
}
