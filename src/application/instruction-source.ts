import type { InstructionKey } from '../domain/agent-instructions'
import { orderedTasks } from '../domain/implementation'
import { otherTopicId, relationshipsFor, type TopicRelationship } from '../domain/topic-relationship'
import { knowledgeMetadata } from '../domain/topic-metadata'
import type { VersionRelationship } from '../domain/topic-version'
import { defaultTopicType } from '../domain/topic'
import type { ImplementationWorkspace } from './implementation-repository'
import type { TopicWorkspace } from './topic-repository'
import type { InstructionRepository } from './instruction-repository'
import type { Topic } from '../domain/topic'

type TopicKnowledge = Awaited<ReturnType<InstructionRepository['readTopicInstructionKnowledge']>>

function resolveKnowledge(root: Topic, topics: ReadonlyMap<string, Topic>, relationships: readonly TopicRelationship[]) {
  const outbound = new Map<string, TopicRelationship[]>()
  for (const edge of relationships) {
    if (edge.type !== 'dependency' || !topics.has(edge.sourceTopicId) || !topics.has(edge.targetTopicId)) continue
    const edges = outbound.get(edge.sourceTopicId) ?? []
    edges.push(edge)
    outbound.set(edge.sourceTopicId, edges)
  }
  const visited = new Set([root.id])
  const queue = [root.id]
  const edges: { source: string; target: string; description?: string }[] = []
  for (const id of queue) {
    for (const edge of outbound.get(id) ?? []) {
      if (id !== root.id) edges.push({ source: topics.get(id)!.title, target: topics.get(edge.targetTopicId)!.title, description: edge.description })
      if (visited.has(edge.targetTopicId)) continue
      visited.add(edge.targetTopicId)
      queue.push(edge.targetTopicId)
    }
  }
  for (const edge of relationshipsFor(root.id, relationships).related) {
    const id = otherTopicId(root.id, edge)
    if (visited.has(id) || !topics.has(id)) continue
    visited.add(id)
    queue.push(id)
  }
  return { edges, topics: queue.slice(1).map(id => topics.get(id)!) }
}

export function collectInstructionSource(key: InstructionKey, workspace: TopicWorkspace, implementations?: ImplementationWorkspace, knowledge?: TopicKnowledge) {
  const topics = new Map(workspace.topics.map(topic => [topic.id, topic]))
  const currentTopic = topics.get(key.topicId)
  if (!currentTopic) throw new Error('This topic no longer exists.')
  const project = implementations?.projects.find(item => item.id === key.projectId)
  if (key.projectId !== undefined && !project) throw new Error('This project no longer exists.')

  const implementation = project && implementations?.implementations.find(item => item.topicId === currentTopic.id && item.projectId === project.id)
  const version = implementations?.knowledgeVersions?.find(item => item.id === implementation?.knowledgeVersionId)
  const snapshot = version?.snapshot
  const topic = snapshot ? {
    ...currentTopic, title: snapshot.title, type: snapshot.type ?? defaultTopicType,
    description: snapshot.description, content: snapshot.content,
  } : currentTopic
  const details = snapshot ? snapshot.metadata.details : currentTopic.metadata
  const relationships = relationshipsFor(currentTopic.id, workspace.relationships)
  const describe = (edges: TopicRelationship[]) => edges.flatMap(edge => {
    const target = topics.get(otherTopicId(topic.id, edge))
    return target ? [{ title: target.title, description: edge.description }] : []
  })
  const pinnedLinks = (links: readonly VersionRelationship[]) => links.map(({ title, description }) => ({ title, description }))
  const tasks = project
    ? (implementation ? orderedTasks(implementations?.tasks ?? [], implementation.id) : [])
    : [...(knowledge?.taskDefinitions ?? [])].sort((a, b) => a.order - b.order)
  const taskTitles = new Map(tasks.map(task => [task.id, task.title]))
  return {
    topic,
    classification: details && knowledgeMetadata(details),
    project,
    implementation,
    version,
    knowledge: knowledge && resolveKnowledge(topic, topics, workspace.relationships),
    sections: knowledge?.sections ?? [...(snapshot?.knowledgeSections ?? [])],
    dependencies: snapshot ? pinnedLinks(snapshot.dependencies) : describe(relationships.dependencies),
    related: snapshot ? pinnedLinks(snapshot.related) : describe(relationships.related),
    tasks: tasks.map(task => ({
      ...task,
      status: 'status' in task ? task.status : undefined,
      criteria: task.criteria.map(criterion => ({ ...criterion, completed: 'completed' in criterion ? criterion.completed === true : undefined })),
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
    artifacts: implementations?.artifacts.filter(item => item.implementationId === implementation?.id) ?? [],
  }
}

export type InstructionSource = ReturnType<typeof collectInstructionSource>
