import type { TopicMetadata } from './topic-metadata'

export interface Topic {
  id: string
  title: string
  description: string
  content: string
  sourceTopicId?: string
  metadata?: TopicMetadata
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export type TrashedTopic = Topic & { deletedAt: string }

export function isTrashed(topic: Topic): topic is TrashedTopic {
  return topic.deletedAt !== undefined
}

export type TopicInput = Pick<Topic, 'title' | 'description' | 'content'>
