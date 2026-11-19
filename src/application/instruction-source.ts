import type { InstructionKey } from '../domain/agent-instructions'
import { orderedTasks } from '../domain/implementation'
import { otherTopicId, relationshipsFor, type TopicRelationship } from '../domain/topic-relationship'
import type { ImplementationWorkspace } from './implementation-repository'
import type { TopicWorkspace } from './topic-repository'

export function collectInstructionSource(key: InstructionKey, workspace: TopicWorkspace, implementations: ImplementationWorkspace) {
  const topics = new Map(workspace.topics.map(topic => [topic.id, topic]))
  const topic = topics.get(key.topicId)
  if (!topic) throw new Error('This topic no longer exists.')
  const project = implementations.projects.find(item => item.id === key.projectId)
  if (key.projectId !== undefined && !project) throw new Error('This project no longer exists.')

  const implementation = project && implementations.implementations.find(item => item.topicId === topic.id && item.projectId === project.id)
  const relationships = relationshipsFor(topic.id, workspace.relationships)
  const describe = (edges: TopicRelationship[]) => edges.flatMap(edge => {
    const target = topics.get(otherTopicId(topic.id, edge))
    return target ? [{ title: target.title, description: edge.description }] : []
  })
  const tasks = implementation ? orderedTasks(implementations.tasks, implementation.id) : []
  const taskTitles = new Map(tasks.map(task => [task.id, task.title]))
  return {
    topic,
    project,
    implementation,
    dependencies: describe(relationships.dependencies),
    related: describe(relationships.related),
    tasks: tasks.map(task => ({
      ...task,
      dependencyTitles: task.dependencyIds.flatMap(id => {
        const title = taskTitles.get(id)
        return title ? [title] : []
      }),
      technicalReferences: task.references.flatMap((reference): { title: string; url?: string }[] => {
        if (reference.kind !== 'topic') return [{ title: reference.title, url: reference.url }]
        const target = topics.get(reference.topicId)
        return target ? [{ title: target.title }] : []
      }),
    })),
    artifacts: implementations.artifacts.filter(item => item.implementationId === implementation?.id),
  }
}

export type InstructionSource = ReturnType<typeof collectInstructionSource>
