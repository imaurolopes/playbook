import type { Topic } from '../domain/topic'
import type { TopicRelationship } from '../domain/topic-relationship'

export interface TopicWorkspace {
  topics: Topic[]
  relationships: TopicRelationship[]
}

export interface TopicRepository {
  readWorkspace(): Promise<TopicWorkspace>
  list(): Promise<Topic[]>
  getById(id: string): Promise<Topic | undefined>
  create(topic: Topic): Promise<Topic>
  update(topic: Topic): Promise<Topic>
  delete(id: string): Promise<void>
  createRelationship(relationship: TopicRelationship): Promise<TopicRelationship>
  deleteRelationship(id: string): Promise<void>
}
