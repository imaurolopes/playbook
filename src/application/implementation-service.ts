import type { AgentConfigChange } from '../domain/project-agent-config'
import type { SafeguardInput } from '../domain/project-safeguards'
import type { ImplementationChanges, ImplementationRepository, TaskChanges } from './implementation-repository'
import { artifactTypes, environments, webUrl, type ArtifactDetails, type ReferenceDetails } from '../domain/implementation'
import type { TaskDefinition } from '../domain/implementation'
import type { TaskDetailChange } from './implementation-repository'

function newRecord() {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now }
}

function newImplementation(topicId: string, projectId: string) {
  return { ...newRecord(), topicId, projectId, status: 'not_started' as const, notes: '', environment: 'development' as const }
}

function required(value: string, message: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(message)
  return trimmed
}

function cleanProject(name: string, description: string) {
  return { name: required(name, 'Enter a project name.'), description: description.trim() }
}

function cleanTask(input: TaskChanges): TaskChanges {
  return { ...input, title: required(input.title, 'Enter a task title.'), description: input.description.trim() }
}

function optionalUrl(value?: string) {
  if (!value?.trim()) return undefined
  const url = webUrl(value)
  if (!url) throw new Error('Enter a valid HTTP or HTTPS URL.')
  return url
}

function cleanReference(input: ReferenceDetails): ReferenceDetails {
  if (input.kind === 'topic') return { kind: 'topic', topicId: input.topicId }
  const title = required(input.title, 'Enter a reference title.')
  const url = optionalUrl(input.url)
  if (input.kind === 'resource') return { kind: 'resource', title, url }
  if (!url) throw new Error('Enter a reference URL.')
  return { kind: 'url', title, url }
}

function cleanArtifact(input: ArtifactDetails): ArtifactDetails {
  if (!artifactTypes.includes(input.type)) throw new Error('Choose an artifact type.')
  return {
    title: required(input.title, 'Enter an artifact title.'),
    type: input.type,
    relatedTaskId: input.relatedTaskId || undefined,
    url: optionalUrl(input.url),
    description: input.description?.trim() || undefined,
  }
}

export class ImplementationService {
  constructor(private readonly repository: ImplementationRepository) {}

  list() {
    return this.repository.readImplementations()
  }

  saveTaskDefinition(input: TaskDefinition) {
    return this.repository.saveTaskDefinition({
      ...input,
      title: required(input.title, 'Enter a task name.'),
      description: input.description.trim(),
      criteria: input.criteria.map(criterion => ({ ...criterion, description: required(criterion.description, 'Enter an acceptance criterion.') })),
      references: input.references.map(reference => ({ ...cleanReference(reference), id: reference.id })),
    })
  }

  moveTaskDefinition(topicId: string, id: string, destination: -1 | 1 | string) {
    return this.repository.moveTaskDefinition(topicId, id, destination)
  }

  deleteTaskDefinition(topicId: string, id: string) {
    return this.repository.deleteTaskDefinition(topicId, id)
  }

  upgradeImplementationKnowledge(id: string) {
    return this.repository.upgradeImplementationKnowledge(id)
  }

  async createProject(name: string, description: string, topicId?: string) {
    const project = { ...newRecord(), ...cleanProject(name, description) }
    await this.repository.createProject(project, topicId === undefined ? undefined : newImplementation(topicId, project.id))
    return project
  }

  async updateProject(id: string, name: string, description: string) {
    await this.repository.updateProject(id, cleanProject(name, description))
  }

  changeAgentConfig(projectId: string, change: AgentConfigChange) {
    return this.repository.changeProjectAgentConfig(projectId, change)
  }

  saveSafeguard(projectId: string, input: SafeguardInput, policyId?: string) {
    return this.repository.saveProjectPolicy(projectId, input, policyId)
  }

  deleteSafeguard(projectId: string, policyId: string) {
    return this.repository.deleteProjectPolicy(projectId, policyId)
  }

  deleteProject(id: string) {
    return this.repository.deleteProject(id)
  }

  createImplementation(topicId: string, projectId: string) {
    return this.repository.createImplementation(newImplementation(topicId, projectId))
  }

  async updateImplementation(id: string, changes: ImplementationChanges) {
    if (changes.environment !== undefined && !environments.includes(changes.environment)) throw new Error('Choose an environment.')
    await this.repository.updateImplementation(id, {
      ...changes,
      branch: changes.branch === undefined ? undefined : changes.branch?.trim() || null,
    })
  }

  deleteImplementation(id: string) {
    return this.repository.deleteImplementation(id)
  }

  async createTask(implementationId: string, input: TaskChanges) {
    const task = { ...newRecord(), ...cleanTask(input), implementationId, criteria: [], dependencyIds: [], references: [] }
    await this.repository.createTask(task)
    return task.id
  }

  async updateTask(id: string, input: TaskChanges) {
    await this.repository.updateTask(id, cleanTask(input))
  }

  deleteTask(id: string) {
    return this.repository.deleteTask(id)
  }

  moveTask(id: string, direction: -1 | 1) {
    return this.repository.moveTask(id, direction)
  }

  moveTaskTo(id: string, targetId: string) {
    return this.repository.moveTask(id, targetId)
  }

  async addCriterion(taskId: string, description: string) {
    const criterion = { id: crypto.randomUUID(), description: required(description, 'Enter a criterion description.'), completed: false }
    await this.repository.changeTaskDetails(taskId, { kind: 'addCriterion', criterion })
  }

  async updateCriterion(taskId: string, id: string, changes: Partial<{ description: string; completed: boolean }>) {
    const cleaned = { ...changes }
    if (changes.description !== undefined) cleaned.description = required(changes.description, 'Enter a criterion description.')
    await this.repository.changeTaskDetails(taskId, { kind: 'updateCriterion', id, changes: cleaned })
  }

  changeTaskDetails(taskId: string, change: Extract<TaskDetailChange, { kind: 'moveCriterion' | 'removeCriterion' | 'addDependency' | 'removeDependency' | 'removeReference' }>) {
    return this.repository.changeTaskDetails(taskId, change)
  }

  async saveReference(taskId: string, input: ReferenceDetails, id?: string) {
    const reference = { ...cleanReference(input), id: id ?? crypto.randomUUID() }
    await this.repository.changeTaskDetails(taskId, { kind: id ? 'updateReference' : 'addReference', reference })
  }

  async saveArtifact(implementationId: string, input: ArtifactDetails, id?: string) {
    const changes = cleanArtifact(input)
    if (id) await this.repository.updateArtifact(id, changes)
    else await this.repository.createArtifact({ ...newRecord(), ...changes, implementationId })
  }

  deleteArtifact(id: string) {
    return this.repository.deleteArtifact(id)
  }
}
