import type { ImplementationWorkspace } from '../application/implementation-repository'
import { orderedTasks, type TaskDefinition } from '../domain/implementation'
import type { Topic } from '../domain/topic'
import type { KnowledgeSection } from '../domain/knowledge'
import type { TopicRelationship } from '../domain/topic-relationship'
import { captureTopicSnapshot, type TopicVersion } from '../domain/topic-version'
import { readTaskDefinitions } from './stored-implementations'

export function migrateTaskDefinitions(data: ImplementationWorkspace, topics: Topic[], relationships: TopicRelationship[],
  versions: TopicVersion[], knowledgeSections: readonly KnowledgeSection[]) {
  const definitions: TaskDefinition[] = []
  const definitionId = (id: string) => 'legacy-task-definition:' + id
  for (const topic of topics) {
    const plans = data.implementations.filter(plan => plan.topicId === topic.id)
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    if (!plans.length) continue
    const topicDefinitions: TaskDefinition[] = []
    const versionId = 'implementation-baseline:' + topic.id
    for (const plan of plans) {
      plan.knowledgeVersionId = versionId
      for (const task of orderedTasks(data.tasks, plan.id)) {
        const id = definitionId(task.id)
        task.definitionId = id
        task.knowledgeVersionId = versionId
        topicDefinitions.push({
          id, topicId: topic.id, sourceProjectId: plan.projectId, title: task.title, description: task.description,
          order: topicDefinitions.length + 1, createdAt: task.createdAt, updatedAt: task.updatedAt,
          criteria: task.criteria.map(({ id, description, order }) => ({ id, description, order })),
          dependencyIds: task.dependencyIds.map(definitionId), references: structuredClone(task.references),
        })
      }
    }
    definitions.push(...topicDefinitions)
    const number = versions.reduce((latest, version) => version.topicId === topic.id ? Math.max(latest, version.versionNumber) : latest, 0)
    versions.push({
      id: versionId, topicId: topic.id, versionNumber: number + 1, author: 'Playbook',
      summary: 'Baseline for migrated implementations.', createdAt: topic.updatedAt,
      snapshot: captureTopicSnapshot(topic, topics, relationships, { taskDefinitions: topicDefinitions, knowledgeSections }),
    })
  }
  return definitions
}

export function validateImplementationPins(data: ImplementationWorkspace, versions: TopicVersion[]) {
  const versionsById = new Map(versions.map(version => [version.id, version]))
  const plans = new Map(data.implementations.map(plan => [plan.id, plan]))
  for (const plan of plans.values()) {
    if (typeof plan.knowledgeVersionId !== 'string' || versionsById.get(plan.knowledgeVersionId)?.topicId !== plan.topicId) {
      throw new Error('An implementation has no valid knowledge version.')
    }
  }
  for (const task of data.tasks) {
    const plan = plans.get(task.implementationId)!
    const version = task.knowledgeVersionId && versionsById.get(task.knowledgeVersionId)
    const local = task.projectDefinition
    if (local !== undefined) readTaskDefinitions([local], new Set([plan.topicId]))
    if (!version || version.topicId !== plan.topicId ||
        !task.definitionId || (local
          ? local.id !== task.definitionId || local.sourceProjectId !== plan.projectId
          : !version.snapshot.taskDefinitions?.some(definition => definition.id === task.definitionId))) {
      throw new Error('A task has no valid knowledge origin.')
    }
  }
}
