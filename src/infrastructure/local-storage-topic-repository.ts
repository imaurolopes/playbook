import type { ImplementationChanges, ImplementationRepository, ImplementationWorkspace, TaskChanges } from '../application/implementation-repository'
import type { ProjectChanges, TaskDetailChange } from '../application/implementation-repository'
import type { InstructionRepository } from '../application/instruction-repository'
import { instructionKey, usageContexts, type InstructionDraft, type InstructionKey, type InstructionSettings } from '../domain/agent-instructions'
import { defaultGenerationTemplate, validTemplateSections, type GenerationTemplate } from '../domain/generation-template'
import { orderedTasks, validateTaskDependency, type ArtifactDetails, type ImplementationArtifact, type ImplementationTask, type Project, type TopicImplementation } from '../domain/implementation'
import { initialImplementations, readStoredImplementations } from './stored-implementations'
import type { TopicRepository, TopicRestoreResult, TopicWorkspace } from '../application/topic-repository'
import { scopes, validateParent, type Topic, type TopicInput } from '../domain/topic'
import { otherTopicId, relationshipTypes, relationshipsFor, validateRelationship, type RelationshipType, type TopicRelationship } from '../domain/topic-relationship'
import { captureTopicSnapshot, type TopicSnapshot, type TopicVersion, type VersionRelationship } from '../domain/topic-version'
import { readTopicVersions } from './stored-topic-versions'
import { isTopicMetadata, type TopicMetadata } from '../domain/topic-metadata'

export const TOPIC_STORAGE_KEY = 'playbook.topics.v1'
type TopicStorage = Pick<Storage, 'getItem' | 'setItem'>
type StoredInstructionSettings = InstructionKey & InstructionSettings
type StoredWorkspace = TopicWorkspace & {
  implementationData: ImplementationWorkspace
  instructionDrafts: InstructionDraft[]
  instructionSettings: StoredInstructionSettings[]
  instructionTemplates: GenerationTemplate[]
  topicVersions: TopicVersion[]
}

function appendVersion(workspace: StoredWorkspace, topic: Topic, summary: string, author: string, createdAt: string, restoredFromVersionId?: string) {
  const latest = workspace.topicVersions.reduce((number, item) => item.topicId === topic.id ? Math.max(number, item.versionNumber) : number, 0)
  const version: TopicVersion = {
    id: crypto.randomUUID(), topicId: topic.id, versionNumber: latest + 1, summary, author, createdAt, restoredFromVersionId,
    snapshot: captureTopicSnapshot(topic, workspace.topics, workspace.relationships),
  }
  workspace.topicVersions.push(version)
  return version
}

function restoredRelationships(workspace: TopicWorkspace, topicId: string, snapshot: TopicSnapshot, now: string) {
  const { dependencies, related } = relationshipsFor(topicId, workspace.relationships)
  const replaced = new Set([...dependencies, ...related].map(edge => edge.id))
  const relations = workspace.relationships.filter(edge => !replaced.has(edge.id))
  const topicIds = new Set(workspace.topics.map(topic => topic.id))

  function restore(links: readonly VersionRelationship[], current: TopicRelationship[], type: RelationshipType) {
    const existing = new Map(current.map(edge => [otherTopicId(topicId, edge), edge]))
    for (const link of links) {
      const previous = existing.get(link.id)
      const edge = previous
        ? { ...previous, description: link.description, updatedAt: previous.description === link.description ? previous.updatedAt : now }
        : { id: crypto.randomUUID(), sourceTopicId: topicId, targetTopicId: link.id, type, description: link.description, createdAt: now, updatedAt: now }
      try {
        validateRelationship(topicIds, relations, edge)
      } catch (problem) {
        const reason = problem instanceof Error ? problem.message : 'The relationship is invalid.'
        throw new Error(`Cannot restore ${type === 'dependency' ? 'dependency' : 'related topic'} “${link.title}”: ${reason}`)
      }
      relations.push(edge)
    }
  }

  restore(snapshot.dependencies, dependencies, 'dependency')
  restore(snapshot.related, related, 'related')
  return relations
}

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

function hasInstructionKey(value: unknown): value is InstructionKey & Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.topicId === 'string' && typeof item.agentProfileId === 'string' && Boolean(item.agentProfileId) &&
    (item.projectId === undefined || typeof item.projectId === 'string')
}

function isInstructionDraft(draft: unknown): draft is InstructionDraft {
  if (!hasInstructionKey(draft)) return false
  const artifacts = draft.artifacts as Record<string, unknown> | undefined
  return (artifacts === undefined || (artifacts && typeof artifacts.prompt === 'string' && typeof artifacts.checklist === 'string')) &&
    (draft.yaml === undefined || typeof draft.yaml === 'string') &&
    typeof draft.generatedMarkdown === 'string' && typeof draft.markdown === 'string' &&
    typeof draft.manuallyEdited === 'boolean' && isTimestamp(draft.lastGeneratedAt) &&
    (draft.lastEditedAt === undefined || isTimestamp(draft.lastEditedAt))
}

function isInstructionSettings(item: unknown): item is StoredInstructionSettings {
  return hasInstructionKey(item) && (item.objective === undefined || typeof item.objective === 'string') &&
    (item.usage === undefined || (typeof item.usage === 'string' && Object.hasOwn(usageContexts, item.usage))) &&
    (item.templateId === undefined || typeof item.templateId === 'string')
}

function isCustomTemplate(value: unknown): value is GenerationTemplate {
  if (!value || typeof value !== 'object') return false
  const template = value as Record<string, unknown>
  return typeof template.id === 'string' && Boolean(template.id) && template.id !== defaultGenerationTemplate.id &&
    template.isSystem === false && typeof template.name === 'string' && Boolean(template.name.trim()) &&
    typeof template.description === 'string' && validTemplateSections(template.sections) &&
    isTimestamp(template.createdAt) && isTimestamp(template.updatedAt)
}

function validateInstructionContext(workspace: StoredWorkspace, key: InstructionKey) {
  if (!workspace.topics.some(topic => topic.id === key.topicId)) throw new Error('This topic no longer exists.')
  if (key.projectId !== undefined && !workspace.implementationData.projects.some(project => project.id === key.projectId)) {
    throw new Error('This project no longer exists.')
  }
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
    (topic.sourceTopicId === undefined || typeof topic.sourceTopicId === 'string') &&
    (topic.metadata === undefined || isTopicMetadata(topic.metadata))
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

export class LocalStorageTopicRepository implements TopicRepository, ImplementationRepository, InstructionRepository {
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
      const workspace = {
        topics: this.seed.map(topic => ({ ...topic })), relationships: [],
        implementationData: initialImplementations(), instructionDrafts: [], instructionSettings: [], instructionTemplates: [], topicVersions: [],
      }
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
      const { topics, relationships, instructionDrafts = [], instructionSettings = [], instructionTemplates = [], topicVersions = [] } = data
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
      if (!Array.isArray(instructionDrafts) || !instructionDrafts.every(isInstructionDraft)) throw new Error()
      if (!Array.isArray(instructionSettings) || !instructionSettings.every(isInstructionSettings) ||
        !Array.isArray(instructionTemplates) || !instructionTemplates.every(isCustomTemplate)) throw new Error()
      const projectIds = new Set(implementationData.projects.map(project => project.id))
      const invalidKeys = (items: InstructionKey[]) => new Set(items.map(instructionKey)).size !== items.length ||
        items.some(item => !topicIds.has(item.topicId) || (item.projectId !== undefined && !projectIds.has(item.projectId)))
      if (invalidKeys(instructionDrafts) || invalidKeys(instructionSettings) ||
        new Set(instructionTemplates.map(template => template.id)).size !== instructionTemplates.length) throw new Error()
      return { topics, relationships, implementationData, instructionDrafts, instructionSettings, instructionTemplates,
        topicVersions: readTopicVersions(topicVersions, topicIds) }
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

  async listVersions(topicId: string) {
    return this.read().topicVersions.filter(version => version.topicId === topicId)
      .sort((a, b) => b.versionNumber - a.versionNumber)
  }

  async createVersion(topicId: string, summary: string, author: string) {
    const workspace = this.read()
    const topic = workspace.topics.find(item => item.id === topicId)
    if (!topic) throw new Error('This topic no longer exists.')
    const version = appendVersion(workspace, topic, summary, author, new Date().toISOString())
    this.write(workspace)
    return version
  }

  async restoreVersion(topicId: string, versionId: string, author: string): Promise<TopicRestoreResult> {
    const workspace = this.read()
    const index = workspace.topics.findIndex(topic => topic.id === topicId)
    const topic = workspace.topics[index]
    if (!topic) throw new Error('This topic no longer exists.')
    const target = workspace.topicVersions.find(item => item.topicId === topicId && item.id === versionId)
    if (!target) throw new Error('This version no longer exists for this topic.')
    const { title, description, content, metadata } = target.snapshot
    try {
      validateParent(workspace.topics, topicId, metadata.parent?.id)
    } catch (problem) {
      const reason = problem instanceof Error ? problem.message : 'The parent topic is invalid.'
      throw new Error(`Cannot restore parent “${metadata.parent?.title}”: ${reason}`)
    }

    const now = new Date().toISOString()
    const relationships = restoredRelationships(workspace, topicId, target.snapshot, now)
    const backup = appendVersion(workspace, topic, `State before restoring v${target.versionNumber}.`, author, now)
    const restored: Topic = {
      ...topic, title, description, content, scope: metadata.scope,
      parentId: metadata.parent?.id, sourceTopicId: metadata.source?.id, updatedAt: now,
      metadata: metadata.details ?? topic.metadata,
    }
    workspace.topics[index] = restored
    workspace.relationships = relationships
    const version = appendVersion(workspace, restored, `Restored from v${target.versionNumber}.`, author, now, target.id)
    this.write(workspace)
    return { workspace: { topics: workspace.topics, relationships }, backup, version }
  }

  async readImplementations() {
    return this.read().implementationData
  }

  async readInstructionDraft(key: InstructionKey) {
    const id = instructionKey(key)
    return this.read().instructionDrafts.find(draft => instructionKey(draft) === id)
  }

  async updateInstructionDraft(key: InstructionKey, update: (current?: InstructionDraft) => InstructionDraft) {
    const workspace = this.read()
    validateInstructionContext(workspace, key)
    const id = instructionKey(key)
    const drafts = workspace.instructionDrafts
    const index = drafts.findIndex(draft => instructionKey(draft) === id)
    const current = drafts[index]
    const next = update(current)
    if (!isInstructionDraft(next) || instructionKey(next) !== id) throw new Error('Invalid instruction draft.')
    if (next === current) return next
    if (index < 0) drafts.push(next)
    else drafts[index] = next
    this.write(workspace)
    return next
  }

  async readInstructionSettings(key: InstructionKey): Promise<InstructionSettings> {
    const id = instructionKey(key)
    const settings = this.read().instructionSettings.find(item => instructionKey(item) === id)
    return settings ? { objective: settings.objective, usage: settings.usage, templateId: settings.templateId } : {}
  }

  async updateInstructionSettings(key: InstructionKey, changes: InstructionSettings) {
    const workspace = this.read()
    validateInstructionContext(workspace, key)
    if (changes.templateId !== undefined && changes.templateId !== defaultGenerationTemplate.id &&
      !workspace.instructionTemplates.some(template => template.id === changes.templateId)) {
      throw new Error('This generation template no longer exists.')
    }
    const id = instructionKey(key)
    const settings = workspace.instructionSettings
    const index = settings.findIndex(item => instructionKey(item) === id)
    const next = { ...settings[index], ...changes, ...key }
    if (!isInstructionSettings(next)) throw new Error('Invalid instruction settings.')
    if (index < 0) settings.push(next)
    else settings[index] = next
    this.write(workspace)
    return { objective: next.objective, usage: next.usage, templateId: next.templateId }
  }

  async listGenerationTemplates() {
    return this.read().instructionTemplates
  }

  async writeGenerationTemplate(template: GenerationTemplate, create: boolean) {
    if (!isCustomTemplate(template)) throw new Error('Only valid custom templates can be saved.')
    const workspace = this.read()
    const index = workspace.instructionTemplates.findIndex(item => item.id === template.id)
    if (create && index >= 0) throw new Error('This template already exists.')
    if (!create && index < 0) throw new Error('This template no longer exists.')
    if (create) workspace.instructionTemplates.push(template)
    else workspace.instructionTemplates[index] = template
    this.write(workspace)
    return template
  }

  async deleteGenerationTemplate(id: string) {
    if (id === defaultGenerationTemplate.id) throw new Error('The system template cannot be deleted.')
    const workspace = this.read()
    removeItem(workspace.instructionTemplates, id, 'This template no longer exists.')
    for (const settings of workspace.instructionSettings) {
      if (settings.templateId === id) delete settings.templateId
    }
    this.write(workspace)
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

  async update(input: TopicInput & Pick<Topic, 'id' | 'updatedAt'>) {
    const workspace = this.read()
    const { id, title, description, content, scope, parentId, updatedAt } = input
    const index = workspace.topics.findIndex(existing => existing.id === id)
    const existing = workspace.topics[index]
    if (!existing) throw new Error('This topic no longer exists.')
    validateParent(workspace.topics, id, parentId)
    const topic = { ...existing, title, description, content, scope, parentId, updatedAt }
    workspace.topics[index] = topic
    this.write(workspace)
    return topic
  }

  async updateMetadata(id: string, metadata: TopicMetadata) {
    const workspace = this.read()
    const index = workspace.topics.findIndex(topic => topic.id === id)
    const topic = workspace.topics[index]
    if (!topic) throw new Error('This topic no longer exists.')
    if (!isTopicMetadata(metadata)) throw new Error('Enter valid topic metadata.')
    const updated = { ...topic, metadata, updatedAt: new Date().toISOString() }
    workspace.topics[index] = updated
    this.write(workspace)
    return updated
  }

  async delete(id: string) {
    const workspace = this.read()
    const { topics, relationships, implementationData, instructionDrafts, instructionSettings } = workspace
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
      ...workspace,
      topicVersions: workspace.topicVersions.filter(version => version.topicId !== id),
      instructionDrafts: instructionDrafts.filter(draft => draft.topicId !== id),
      instructionSettings: instructionSettings.filter(item => item.topicId !== id),
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

  async updateProject(id: string, changes: ProjectChanges) {
    const workspace = this.read()
    const project = workspace.implementationData.projects.find(item => item.id === id)
    if (!project) throw new Error('This project no longer exists.')
    project.name = changes.name
    project.description = changes.description
    project.updatedAt = new Date().toISOString()
    this.write(workspace)
  }

  async deleteProject(id: string) {
    const workspace = this.read()
    const data = workspace.implementationData
    if (!data.projects.some(project => project.id === id)) throw new Error('This project no longer exists.')
    data.projects = data.projects.filter(project => project.id !== id)
    removeImplementations(data, item => item.projectId === id)
    workspace.instructionDrafts = workspace.instructionDrafts.filter(draft => draft.projectId !== id)
    workspace.instructionSettings = workspace.instructionSettings.filter(item => item.projectId !== id)
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
