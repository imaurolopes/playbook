import type { TrashItem, TrashTarget } from '../domain/trash'
import type { Topic } from '../domain/topic'
import type { RelationshipInput, TopicRelationship } from '../domain/topic-relationship'
import type { TopicInput, TopicType } from '../domain/topic'
import type { TopicSnapshot, TopicVersion } from '../domain/topic-version'
import type { TopicMetadata } from '../domain/topic-metadata'

export interface TopicWorkspace {
  topics: Topic[]
  technicalDomains?: string[]
  trash: TrashItem[]
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
  duplicate(id: string): Promise<Topic>
  update(topic: TopicInput & Pick<Topic, 'id' | 'updatedAt'>): Promise<Topic>
  updateMetadata(id: string, metadata: TopicMetadata, type?: TopicType): Promise<Topic>
  delete(id: string): Promise<void>
  restoreTrash(target: TrashTarget): Promise<void>
  purgeTrashItem(target: TrashTarget): Promise<void>
  emptyTrash(): Promise<void>
  createRelationship(relationship: TopicRelationship): Promise<TopicRelationship>
  updateRelationship(id: string, input: RelationshipInput, updatedAt: string): Promise<TopicRelationship>
  deleteRelationship(id: string): Promise<void>
  listVersions(topicId: string): Promise<TopicVersion[]>
  readWorkingVersion(topicId: string): Promise<{ snapshot: TopicSnapshot; updatedAt: string; versions: TopicVersion[] }>
  createVersion(topicId: string, summary: string, author: string): Promise<TopicVersion>
  restoreVersion(topicId: string, versionId: string, author: string): Promise<TopicRestoreResult>
}
