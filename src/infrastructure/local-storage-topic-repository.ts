import type { ImplementationChanges, ImplementationRepository, ImplementationWorkspace, TaskChanges } from '../application/implementation-repository'
import type { TaskDetailChange } from '../application/implementation-repository'
import { orderedTasks, validateTaskDependency, type ArtifactDetails, type ImplementationArtifact, type ImplementationTask, type Project, type TopicImplementation } from '../domain/implementation'
import { initialImplementations, readStoredImplementations } from './stored-implementations'
import type { TopicRepository, TopicWorkspace } from '../application/topic-repository'
import { scopes, validateParent, type Topic } from '../domain/topic'
import { relationshipTypes, validateRelationship, type TopicRelationship } from '../domain/topic-relationship'

export const TOPIC_STORAGE_KEY = 'playbook.topics.v1'
type TopicStorage = Pick<Storage, 'getItem' | 'setItem'>
type StoredWorkspace = TopicWorkspace & { implementationData: ImplementationWorkspace }

function removeImplementations(data: ImplementationWorkspace, matches: (item: TopicImplementation) => boolean) {
  const removed = new Set(data.implementations.filter(matches).map(item => item.id))
  data.implementations = data.implementations.filter(item => !removed.has(item.id))
  data.tasks = data.tasks.filter(task => !removed.has(task.implementationId))
  data.artifacts = data.artifacts.filter(artifact => !removed.has(artifact.implementationId))
}

function removeItem(items: { id: string }[], id: string, message: string) {
  const index = items.findIndex(item => item.id === id)
  if (index === -1) throw new Error(message)
  items.splice(index, 1)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isTopic(value: unknown): value is Topic {
  if (!value || typeof value !== 'object') return false
  const topic = value as Record<string, unknown>
  return typeof topic.id === 'string' && Boolean(topic.id) &&
    typeof topic.title === 'string' && Boolean(topic.title.trim()) &&
    typeof topic.description === 'string' && typeof topic.content === 'string' &&
    scopes.some(scope => scope === topic.scope) &&
    isTimestamp(topic.createdAt) && isTimestamp(topic.updatedAt) &&
    (topic.parentId === undefined || typeof topic.parentId === 'string') &&
    (topic.sourceTopicId === undefined || typeof topic.sourceTopicId === 'string')
}

function isRelationship(value: unknown): value is TopicRelationship {
  if (!value || typeof value !== 'object') return false
  const edge = value as Record<string, unknown>
  return typeof edge.id === 'string' && Boolean(edge.id) &&
    typeof edge.sourceTopicId === 'string' && typeof edge.targetTopicId === 'string' &&
    relationshipTypes.some(type => type === edge.type) &&
    (edge.description === undefined || typeof edge.description === 'string') &&
    isTimestamp(edge.createdAt) && isTimestamp(edge.updatedAt)
}

export class LocalStorageTopicRepository implements TopicRepository, ImplementationRepository {
  constructor(
    private readonly storage: () => TopicStorage,
    private readonly seed: readonly Topic[] = [],
  ) {}

  private read(): StoredWorkspace {
    let raw: string | null
    try {
      raw = this.storage().getItem(TOPIC_STORAGE_KEY)
    } catch {
      throw new Error('Browser storage is unavailable. Check your browser settings and try again.')
    }

    if (raw === null) {
      const workspace = { topics: this.seed.map(topic => ({ ...topic })), relationships: [], implementationData: initialImplementations() }
      this.write(workspace)
      return workspace
    }

    try {
      const stored: unknown = JSON.parse(raw)
      // A legacy array is upgraded in memory and written in the new format on the next change.
      const data = Array.isArray(stored)
        ? { version: 2, topics: stored, relationships: [] }
        : stored as Record<string, unknown> | null
      if (data?.version !== 2 && data?.version !== 3) throw new Error()
      const { topics, relationships } = data
      if (!Array.isArray(topics) || !topics.every(isTopic) ||
          !Array.isArray(relationships) || !relationships.every(isRelationship)) throw new Error()

      const topicIds = new Set(topics.map(topic => topic.id))
      if (topicIds.size !== topics.length) throw new Error()
      for (const topic of topics) validateParent(topics, topic.id, topic.parentId)

      const edgeIds = new Set<string>()
      const validated: TopicRelationship[] = []
      for (const relationship of relationships) {
        if (edgeIds.has(relationship.id)) throw new Error()
        validateRelationship(topicIds, validated, relationship)
        edgeIds.add(relationship.id)
        validated.push(relationship)
      }
      const implementationData = data.version === 3
        ? readStoredImplementations(data.implementationData, topicIds)
        : initialImplementations()
      return { topics, relationships, implementationData }
    } catch {
      throw new Error('Stored Playbook workspace data is invalid. The original data has been preserved.')
    }
  }

  private write(workspace: StoredWorkspace): void {
    try {
      this.storage().setItem(TOPIC_STORAGE_KEY, JSON.stringify({ version: 3, ...workspace }))
    } catch {
      throw new Error('Playbook could not save to browser storage. Check available space and browser settings.')
    }
  }

  async readWorkspace(): Promise<TopicWorkspace> {
    const { topics, relationships } = this.read()
    return { topics, relationships }
  }

  async readImplementations() {
    return this.read().implementationData
  }

  async list() {
    return this.read().topics
  }

  async getById(id: string) {
    return this.read().topics.find(topic => topic.id === id)
  }

  async create(topic: Topic) {
    const workspace = this.read()
    if (workspace.topics.some(existing => existing.id === topic.id)) throw new Error('A topic with this ID already exists.')
    validateParent(workspace.topics, topic.id, topic.parentId)
    workspace.topics.push(topic)
    this.write(workspace)
    return topic
  }

  async update(topic: Topic) {
    const workspace = this.read()
    const index = workspace.topics.findIndex(existing => existing.id === topic.id)
    if (index === -1) throw new Error('This topic no longer exists.')
    validateParent(workspace.topics, topic.id, topic.parentId)
    workspace.topics[index] = topic
    this.write(workspace)
    return topic
  }

  async delete(id: string) {
    const { topics, relationships, implementationData } = this.read()
    const topic = topics.find(existing => existing.id === id)
    if (!topic) throw new Error('This topic no longer exists.')
    const updatedAt = new Date().toISOString()
    removeImplementations(implementationData, item => item.topicId === id)
    for (const task of implementationData.tasks) {
      const references = task.references.filter(reference => reference.kind !== 'topic' || reference.topicId !== id)
      if (references.length !== task.references.length) {
        task.references = references
        task.updatedAt = updatedAt
      }
    }
    this.write({
      implementationData,
      topics: topics.filter(existing => existing.id !== id).map(existing =>
        existing.parentId === id ? { ...existing, parentId: topic.parentId, updatedAt } : existing,
      ),
      relationships: relationships.filter(edge => edge.sourceTopicId !== id && edge.targetTopicId !== id),
    })
  }

  async createRelationship(relationship: TopicRelationship) {
    const workspace = this.read()
    if (workspace.relationships.some(existing => existing.id === relationship.id)) {
      throw new Error('A relationship with this ID already exists.')
    }
    validateRelationship(new Set(workspace.topics.map(topic => topic.id)), workspace.relationships, relationship)
    workspace.relationships.push(relationship)
    this.write(workspace)
    return relationship
  }

  async deleteRelationship(id: string) {
    const workspace = this.read()
    const index = workspace.relationships.findIndex(edge => edge.id === id)
    if (index === -1) throw new Error('This relationship no longer exists.')
    workspace.relationships.splice(index, 1)
    this.write(workspace)
  }

  async createProject(project: Project, implementation?: TopicImplementation) {
    const workspace = this.read()
    const { projects } = workspace.implementationData
    if (projects.some(item => item.id === project.id)) throw new Error('A project with this ID already exists.')
    projects.push(project)
    if (implementation) {
      if (implementation.projectId !== project.id) throw new Error('The implementation must belong to the new project.')
      this.addImplementation(workspace, implementation)
    }
    this.write(workspace)
  }

  async deleteProject(id: string) {
    const workspace = this.read()
    const data = workspace.implementationData
    if (!data.projects.some(project => project.id === id)) throw new Error('This project no longer exists.')
    data.projects = data.projects.filter(project => project.id !== id)
    removeImplementations(data, item => item.projectId === id)
    this.write(workspace)
  }

  async createImplementation(implementation: TopicImplementation) {
    const workspace = this.read()
    if (!this.addImplementation(workspace, implementation)) return false
    this.write(workspace)
    return true
  }

  private addImplementation(workspace: StoredWorkspace, implementation: TopicImplementation) {
    const { projects, implementations } = workspace.implementationData
    if (!workspace.topics.some(topic => topic.id === implementation.topicId)) throw new Error('This topic no longer exists.')
    if (!projects.some(project => project.id === implementation.projectId)) throw new Error('This project no longer exists.')
    if (implementations.some(item => item.topicId === implementation.topicId && item.projectId === implementation.projectId)) {
      return false
    }
    if (implementations.some(item => item.id === implementation.id)) throw new Error('An implementation with this ID already exists.')
    implementations.push(implementation)
    return true
  }

  async updateImplementation(id: string, changes: ImplementationChanges) {
    const workspace = this.read()
    const item = workspace.implementationData.implementations.find(candidate => candidate.id === id)
    if (!item) throw new Error('This implementation no longer exists.')
    if (changes.status !== undefined) item.status = changes.status
    if (changes.notes !== undefined) item.notes = changes.notes
    if (changes.environment !== undefined) item.environment = changes.environment
    if (changes.branch === null) delete item.branch
    else if (changes.branch !== undefined) item.branch = changes.branch
    item.updatedAt = new Date().toISOString()
    this.write(workspace)
  }

  async deleteImplementation(id: string) {
    const workspace = this.read()
    const data = workspace.implementationData
    if (!data.implementations.some(item => item.id === id)) throw new Error('This implementation no longer exists.')
    removeImplementations(data, item => item.id === id)
    this.write(workspace)
  }

  async createTask(task: Omit<ImplementationTask, 'order'>) {
    const workspace = this.read()
    const { tasks, implementations } = workspace.implementationData
    if (!implementations.some(item => item.id === task.implementationId)) throw new Error('This implementation no longer exists.')
    if (tasks.some(item => item.id === task.id)) throw new Error('A task with this ID already exists.')
    const last = orderedTasks(tasks, task.implementationId).at(-1)
    tasks.push({ ...task, order: (last?.order ?? 0) + 1 })
    this.write(workspace)
  }

  async updateTask(id: string, changes: TaskChanges) {
    const workspace = this.read()
    const task = workspace.implementationData.tasks.find(item => item.id === id)
    if (!task) throw new Error('This task no longer exists.')
    task.title = changes.title
    task.description = changes.description
    task.status = changes.status
    task.updatedAt = new Date().toISOString()
    this.write(workspace)
  }

  async deleteTask(id: string) {
    const workspace = this.read()
    const tasks = workspace.implementationData.tasks
    removeItem(tasks, id, 'This task no longer exists.')
    const updatedAt = new Date().toISOString()
    for (const task of tasks) {
      if (task.dependencyIds.includes(id)) {
        task.dependencyIds = task.dependencyIds.filter(dependency => dependency !== id)
        task.updatedAt = updatedAt
      }
    }
    this.write(workspace)
  }

  async moveTask(id: string, destination: -1 | 1 | string) {
    const workspace = this.read()
    const tasks = workspace.implementationData.tasks
    const task = tasks.find(item => item.id === id)
    if (!task) throw new Error('This task no longer exists.')
    const ordered = orderedTasks(tasks, task.implementationId)
    const from = ordered.indexOf(task)
    const to = typeof destination === 'string' ? ordered.findIndex(item => item.id === destination) : from + destination
    if (typeof destination === 'string' && to === -1) throw new Error('Choose a task in the same implementation.')
    if (to === from || to < 0 || to >= ordered.length) return

    const start = Math.min(from, to)
    const end = Math.max(from, to)
    const affected = ordered.slice(start, end + 1)
    const positions = affected.map(item => item.order)
    affected.splice(from - start, 1)
    affected.splice(to - start, 0, task)
    const updatedAt = new Date().toISOString()
    affected.forEach((item, index) => {
      item.order = positions[index]!
      item.updatedAt = updatedAt
    })
    this.write(workspace)
  }

  async changeTaskDetails(taskId: string, change: TaskDetailChange) {
    const workspace = this.read()
    const tasks = workspace.implementationData.tasks
    const task = tasks.find(item => item.id === taskId)
    if (!task) throw new Error('This task no longer exists.')

    switch (change.kind) {
      case 'addCriterion': {
        if (task.criteria.some(item => item.id === change.criterion.id)) throw new Error('This criterion already exists.')
        const last = task.criteria.reduce((highest, item) => Math.max(highest, item.order), 0)
        task.criteria.push({ ...change.criterion, order: last + 1 })
        break
      }
      case 'updateCriterion':
      case 'moveCriterion': {
        const criterion = task.criteria.find(item => item.id === change.id)
        if (!criterion) throw new Error('This criterion no longer exists.')
        if (change.kind === 'updateCriterion') {
          if (change.changes.description !== undefined) criterion.description = change.changes.description
          if (change.changes.completed !== undefined) criterion.completed = change.changes.completed
        } else {
          const ordered = [...task.criteria].sort((a, b) => a.order - b.order)
          const neighbor = ordered[ordered.indexOf(criterion) + change.direction]
          if (!neighbor) return
          const order = criterion.order
          criterion.order = neighbor.order
          neighbor.order = order
        }
        break
      }
      case 'removeCriterion':
        removeItem(task.criteria, change.id, 'This criterion no longer exists.')
        break
      case 'addDependency':
        validateTaskDependency(task, change.id, new Map(tasks.map(item => [item.id, item])))
        task.dependencyIds.push(change.id)
        break
      case 'removeDependency':
        if (!task.dependencyIds.includes(change.id)) return
        task.dependencyIds = task.dependencyIds.filter(id => id !== change.id)
        break
      case 'addReference':
      case 'updateReference': {
        const { reference } = change
        if (reference.kind === 'topic' && !workspace.topics.some(topic => topic.id === reference.topicId)) {
          throw new Error('This topic no longer exists.')
        }
        const index = task.references.findIndex(item => item.id === reference.id)
        if (change.kind === 'addReference') {
          if (index !== -1) throw new Error('This reference already exists.')
          task.references.push(reference)
        } else {
          if (index === -1) throw new Error('This reference no longer exists.')
          task.references[index] = reference
        }
        break
      }
      case 'removeReference':
        removeItem(task.references, change.id, 'This reference no longer exists.')
        break
    }
    task.updatedAt = new Date().toISOString()
    this.write(workspace)
  }

  async createArtifact(artifact: ImplementationArtifact) {
    const workspace = this.read()
    const { artifacts, implementations } = workspace.implementationData
    if (!implementations.some(item => item.id === artifact.implementationId)) throw new Error('This implementation no longer exists.')
    if (artifacts.some(item => item.id === artifact.id)) throw new Error('This artifact already exists.')
    artifacts.push(artifact)
    this.write(workspace)
  }

  async updateArtifact(id: string, changes: ArtifactDetails) {
    const workspace = this.read()
    const artifact = workspace.implementationData.artifacts.find(item => item.id === id)
    if (!artifact) throw new Error('This artifact no longer exists.')
    Object.assign(artifact, changes, { updatedAt: new Date().toISOString() })
    this.write(workspace)
  }

  async deleteArtifact(id: string) {
    const workspace = this.read()
    removeItem(workspace.implementationData.artifacts, id, 'This artifact no longer exists.')
    this.write(workspace)
  }
}
