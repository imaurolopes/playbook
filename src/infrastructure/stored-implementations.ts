import type { ImplementationWorkspace } from '../application/implementation-repository'
import {
  artifactTypes, environments, implementationStatuses, taskStatuses, validateTaskDependency, webUrl,
  type AcceptanceCriterion, type ImplementationArtifact, type ImplementationTask, type Project, type TaskReference, type TopicImplementation,
} from '../domain/implementation'

const sampleDate = '2026-11-19T12:00:00.000Z'

export function initialImplementations(): ImplementationWorkspace {
  return {
    projects: [
      { id: 'azure-data-platform', name: 'Azure Data Platform', description: 'Data ingestion and analytics on Microsoft Azure.', createdAt: sampleDate, updatedAt: sampleDate },
      { id: 'aws-data-platform', name: 'AWS Data Platform', description: 'Data ingestion and analytics on Amazon Web Services.', createdAt: sampleDate, updatedAt: sampleDate },
    ],
    implementations: [],
    tasks: [],
    artifacts: [],
  }
}

function hasId(value: unknown): value is Record<string, unknown> & { id: string } {
  return Boolean(value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && value.id)
}

function isRecord(value: unknown): value is Record<string, unknown> & { id: string } {
  return hasId(value) && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
}

function isProject(value: unknown): value is Project {
  return isRecord(value) && typeof value.name === 'string' && Boolean(value.name.trim()) &&
    typeof value.description === 'string'
}

function isImplementation(value: unknown): value is TopicImplementation {
  return isRecord(value) && typeof value.topicId === 'string' && typeof value.projectId === 'string' &&
    implementationStatuses.some(status => status === value.status) && typeof value.notes === 'string' &&
    environments.some(environment => environment === value.environment) &&
    (value.branch === undefined || typeof value.branch === 'string')
}

function isOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isCriterion(value: unknown): value is AcceptanceCriterion {
  return hasId(value) && typeof value.description === 'string' && Boolean(value.description.trim()) &&
    typeof value.completed === 'boolean' && isOrder(value.order)
}

function isReference(value: unknown): value is TaskReference {
  if (!hasId(value)) return false
  if (value.kind === 'topic') return typeof value.topicId === 'string'
  if (typeof value.title !== 'string' || !value.title.trim()) return false
  if (value.kind === 'resource' && value.url === undefined) return true
  return (value.kind === 'url' || value.kind === 'resource') && typeof value.url === 'string' && Boolean(webUrl(value.url))
}

function isArtifact(value: unknown): value is ImplementationArtifact {
  return isRecord(value) && typeof value.implementationId === 'string' &&
    typeof value.title === 'string' && Boolean(value.title.trim()) &&
    artifactTypes.some(type => type === value.type) &&
    (value.url === undefined || (typeof value.url === 'string' && Boolean(webUrl(value.url)))) &&
    (value.description === undefined || typeof value.description === 'string')
}

function unique<Value>(items: readonly Value[]) {
  return new Set(items).size === items.length
}

function isTask(value: unknown): value is ImplementationTask {
  return isRecord(value) && typeof value.implementationId === 'string' &&
    typeof value.title === 'string' && Boolean(value.title.trim()) && typeof value.description === 'string' &&
    taskStatuses.some(status => status === value.status) &&
    isOrder(value.order) &&
    Array.isArray(value.criteria) && value.criteria.every(isCriterion) &&
    unique(value.criteria.map(item => item.id)) && unique(value.criteria.map(item => item.order)) &&
    Array.isArray(value.dependencyIds) && value.dependencyIds.every(id => typeof id === 'string') &&
    Array.isArray(value.references) && value.references.every(isReference) && unique(value.references.map(item => item.id))
}

export function readStoredImplementations(value: unknown, topicIds: ReadonlySet<string>): ImplementationWorkspace {
  if (!value || typeof value !== 'object') throw new Error()
  const { projects, implementations: storedPlans, tasks: storedTasks, artifacts = [] } = value as Record<string, unknown>
  if (!Array.isArray(projects) || !projects.every(isProject) || !Array.isArray(storedPlans) ||
      !Array.isArray(storedTasks) || !Array.isArray(artifacts) || !artifacts.every(isArtifact)) throw new Error()

  const implementations = storedPlans.map<unknown>(item => ({ environment: 'development', ...(hasId(item) ? item : {}) }))
  const tasks = storedTasks.map<unknown>(item => ({ criteria: [], dependencyIds: [], references: [], ...(hasId(item) ? item : {}) }))
  if (!implementations.every(isImplementation) || !tasks.every(isTask)) throw new Error()

  const projectIds = new Set(projects.map(project => project.id))
  const implementationIds = new Set(implementations.map(item => item.id))
  const pairs = new Set(implementations.map(item => JSON.stringify([item.topicId, item.projectId])))
  const taskIds = new Set(tasks.map(task => task.id))
  const orders = new Set(tasks.map(task => JSON.stringify([task.implementationId, task.order])))
  if (projectIds.size !== projects.length || implementationIds.size !== implementations.length ||
      pairs.size !== implementations.length || taskIds.size !== tasks.length || orders.size !== tasks.length ||
      implementations.some(item => !topicIds.has(item.topicId) || !projectIds.has(item.projectId)) ||
      tasks.some(task => !implementationIds.has(task.implementationId) ||
        task.references.some(reference => reference.kind === 'topic' && !topicIds.has(reference.topicId))) ||
      !unique(artifacts.map(item => item.id)) ||
      artifacts.some(item => !implementationIds.has(item.implementationId))) throw new Error()

  const graph = new Map(tasks.map(task => [task.id, { ...task, dependencyIds: [] as string[] }]))
  for (const task of tasks) {
    const node = graph.get(task.id)!
    for (const id of task.dependencyIds) {
      validateTaskDependency(node, id, graph)
      node.dependencyIds.push(id)
    }
  }

  return { projects, implementations, tasks, artifacts }
}
