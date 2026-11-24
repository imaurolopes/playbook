import type { ProjectAgentConfig } from './project-agent-config'
import type { CustomSafeguard, ProjectSafeguards, SafeguardPolicy } from './project-safeguards'

export const implementationStatuses = ['not_started', 'planned', 'in_progress', 'blocked', 'completed'] as const
export type ImplementationStatus = (typeof implementationStatuses)[number]

export const taskStatuses = ['todo', 'in_progress', 'blocked', 'done'] as const
export type TaskStatus = (typeof taskStatuses)[number]

export const environments = ['development', 'staging', 'production'] as const
export type Environment = (typeof environments)[number]

export const artifactTypes = ['code', 'documentation', 'api_specification', 'collection', 'database_script', 'other'] as const
export type ArtifactType = (typeof artifactTypes)[number]

export interface AcceptanceCriterion {
  id: string
  description: string
  completed: boolean
  order: number
}

export type ReferenceDetails =
  | { kind: 'topic'; topicId: string }
  | { kind: 'url'; title: string; url: string }
  | { kind: 'resource'; title: string; url?: string }

export type TaskReference = ReferenceDetails & { id: string }

export interface ArtifactDetails {
  title: string
  type: ArtifactType
  relatedTaskId?: string
  url?: string
  description?: string
}

export interface ImplementationArtifact extends ArtifactDetails {
  id: string
  implementationId: string
  createdAt: string
  updatedAt: string
}

export interface Project {
  deletedAt?: string
  agentConfig?: ProjectAgentConfig
  safeguardPolicies?: SafeguardPolicy[]
  safeguards?: ProjectSafeguards
  customSafeguards?: CustomSafeguard[]
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface TopicImplementation {
  id: string
  topicId: string
  projectId: string
  knowledgeVersionId?: string
  status: ImplementationStatus
  notes: string
  environment: Environment
  branch?: string
  createdAt: string
  updatedAt: string
}

export interface ImplementationTask {
  id: string
  implementationId: string
  definitionId?: string
  knowledgeVersionId?: string
  projectDefinition?: TaskDefinition
  title: string
  description: string
  status: TaskStatus
  order: number
  criteria: AcceptanceCriterion[]
  dependencyIds: string[]
  references: TaskReference[]
  createdAt: string
  updatedAt: string
}

export interface TaskDefinition extends Pick<ImplementationTask, 'id' | 'title' | 'description' | 'order' | 'dependencyIds' | 'references' | 'createdAt' | 'updatedAt'> {
  topicId: string
  sourceProjectId?: string
  criteria: Omit<AcceptanceCriterion, 'completed'>[]
}

export function orderedTasks(tasks: readonly ImplementationTask[], implementationId: string): ImplementationTask[] {
  return tasks.filter(task => task.implementationId === implementationId).sort((a, b) => a.order - b.order)
}

export function webUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim())
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url.href
  } catch {
    return undefined
  }
}

type TaskDependencyNode = Pick<ImplementationTask, 'id' | 'implementationId' | 'dependencyIds'>

export function validateTaskDependency(task: TaskDependencyNode, targetId: string, tasks: ReadonlyMap<string, TaskDependencyNode>) {
  if (task.id === targetId) throw new Error('A task cannot depend on itself.')
  if (tasks.get(targetId)?.implementationId !== task.implementationId) {
    throw new Error('Choose a task in the same implementation.')
  }
  if (task.dependencyIds.includes(targetId)) throw new Error('This task dependency already exists.')

  const pending = [targetId]
  const visited = new Set<string>()
  while (pending.length) {
    const id = pending.pop()!
    if (id === task.id) throw new Error('This dependency would create a cycle.')
    if (visited.has(id)) continue
    visited.add(id)
    for (const dependency of tasks.get(id)?.dependencyIds ?? []) pending.push(dependency)
  }
}

export function taskProgress(tasks: readonly ImplementationTask[]) {
  const counts: Record<TaskStatus, number> = { todo: 0, in_progress: 0, blocked: 0, done: 0 }
  for (const task of tasks) counts[task.status]++
  const percent = tasks.length ? Math.round(counts.done / tasks.length * 100) : 0
  return { counts, percent }
}
