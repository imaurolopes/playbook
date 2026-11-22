import type { Topic, TrashedTopic } from '../domain/topic'
import type { TopicRelationship } from '../domain/topic-relationship'
import type { TopicInput } from '../domain/topic'
import type { TopicVersion } from '../domain/topic-version'
import type { TopicMetadata } from '../domain/topic-metadata'

export interface TopicWorkspace {
  topics: Topic[]
  trashedTopics: TrashedTopic[]
  navigationNotice?: string
  relationships: TopicRelationship[]
}

export interface TopicRestoreResult {
  workspace: TopicWorkspace
  backup: TopicVersion
  version: TopicVersion
}

export interface TopicRepository {
  readWorkspace(): Promise<TopicWorkspace>
  list(): Promise<Topic[]>
  getById(id: string): Promise<Topic | undefined>
  create(topic: Topic): Promise<Topic>
  update(topic: TopicInput & Pick<Topic, 'id' | 'updatedAt'>): Promise<Topic>
  updateMetadata(id: string, metadata: TopicMetadata): Promise<Topic>
  delete(id: string): Promise<void>
  restoreTopic(id: string): Promise<void>
  deletePermanently(id: string): Promise<void>
  emptyTrash(): Promise<void>
  createRelationship(relationship: TopicRelationship): Promise<TopicRelationship>
  deleteRelationship(id: string): Promise<void>
  listVersions(topicId: string): Promise<TopicVersion[]>
  createVersion(topicId: string, summary: string, author: string): Promise<TopicVersion>
  restoreVersion(topicId: string, versionId: string, author: string): Promise<TopicRestoreResult>
}
