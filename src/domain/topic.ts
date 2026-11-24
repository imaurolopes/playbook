import type { TopicMetadata } from './topic-metadata'

export const topicTypes = ['Concept', 'Architecture', 'Technology', 'Pattern', 'Practice', 'General'] as const
export type TopicType = (typeof topicTypes)[number]
export const defaultTopicType: TopicType = 'General'

export function isTopicType(value: unknown): value is TopicType {
  return topicTypes.some(type => type === value)
}

export interface Topic {
  id: string
  type: TopicType
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

export type TopicInput = Pick<Topic, 'title' | 'description' | 'content'> & Partial<Pick<Topic, 'type'>>
