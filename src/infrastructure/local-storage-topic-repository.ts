import type { TrashEntityType, TrashItem, TrashTarget } from '../domain/trash'
import { emptyAgentConfig, isProjectAgentConfig, updateAgentConfig, type AgentConfigChange } from '../domain/project-agent-config'
import { projectSafeguardPolicies, validateSafeguard, type SafeguardInput, type SafeguardPolicy } from '../domain/project-safeguards'
import { backUpTopicOrganization, flattenTopics, organizationIssues } from './topic-organization-migration'
import type { ImplementationChanges, ImplementationRepository, ImplementationWorkspace, TaskChanges } from '../application/implementation-repository'
import type { ProjectChanges, TaskDetailChange } from '../application/implementation-repository'
import type { InstructionRepository } from '../application/instruction-repository'
import { instructionKey, usageContexts, type InstructionDraft, type InstructionKey, type InstructionSettings } from '../domain/agent-instructions'
import { defaultGenerationTemplate, validTemplateSections, type GenerationTemplate } from '../domain/generation-template'
import { orderedTasks, validateTaskDependency, type ArtifactDetails, type ImplementationArtifact, type ImplementationTask, type Project, type TaskDefinition, type TopicImplementation } from '../domain/implementation'
import { initialImplementations, readStoredImplementations, readTaskDefinitions } from './stored-implementations'
import { migrateTaskDefinitions, validateImplementationPins } from './task-definition-migration'
import type { TopicRepository, TopicRestoreResult, TopicWorkspace } from '../application/topic-repository'
import { compareTopicVersions, hasTopicVersionChanges } from '../application/compare-topic-versions'
import { defaultTopicType, isTopicType, isTrashed, type Topic, type TopicInput, type TopicType } from '../domain/topic'
import { otherTopicId, relationshipTypes, relationshipsFor, validateRelationship, type RelationshipInput, type RelationshipType, type TopicRelationship } from '../domain/topic-relationship'
import { captureTopicSnapshot, matchesTopicSnapshot, type TopicSnapshot, type TopicVersion, type VersionRelationship } from '../domain/topic-version'
import { readTopicVersions } from './stored-topic-versions'
import { defaultTopicMetadata, isTopicMetadata, knowledgeMetadata, mergeTechnicalDomains, technicalDomainsFor, typedCustomProperty, type TopicMetadata } from '../domain/topic-metadata'
import type { KnowledgeRepository } from '../application/knowledge-repository'
import type { KnowledgeSection } from '../domain/knowledge'
import { legacyKnowledgeNotice, migrateLegacyKnowledge, readKnowledgeSections } from './stored-knowledge'

export const TOPIC_STORAGE_KEY = 'playbook.topics.v1'
export const EXECUTION_MIGRATION_BACKUP_PREFIX = 'playbook.execution-separation.backup.'
type TopicStorage = Pick<Storage, 'getItem' | 'setItem'>
type StoredInstructionSettings = InstructionKey & InstructionSettings
type StoredWorkspace = Omit<TopicWorkspace, 'trash'> & {
  implementationData: ImplementationWorkspace
  instructionDrafts: InstructionDraft[]
  instructionSettings: StoredInstructionSettings[]
  instructionTemplates: GenerationTemplate[]
  topicVersions: TopicVersion[]
  knowledgeSections: KnowledgeSection[]
  taskDefinitions: TaskDefinition[]
  legacyKnowledgeData?: unknown
}

function moveOrderedTask<T extends { order: number; updatedAt: string }>(ordered: T[], task: T, from: number, to: number, updatedAt?: string) {
  if (to === from || to < 0 || to >= ordered.length) return false
  const start = Math.min(from, to)
  const affected = ordered.slice(start, Math.max(from, to) + 1)
  const positions = affected.map(item => item.order)
  affected.splice(from - start, 1)
  affected.splice(to - start, 0, task)
  affected.forEach((item, index) => {
    item.order = positions[index]!
    if (updatedAt !== undefined) item.updatedAt = updatedAt
  })
  return true
}

function activeTopicIds(topics: readonly Topic[]) {
  return new Set(topics.filter(topic => !isTrashed(topic)).map(topic => topic.id))
}

function visibleRelationships(relationships: TopicRelationship[], activeIds: ReadonlySet<string>) {
  return relationships.filter(edge => activeIds.has(edge.sourceTopicId) && activeIds.has(edge.targetTopicId))
}

function trashSource<T extends { id: string; deletedAt?: string }>(type: TrashEntityType, records: T[], display: (record: T) => string) {
  return {
    records,
    items: (): TrashItem[] => records.flatMap(record => record.deletedAt === undefined ? [] :
      [{ type, id: record.id, name: display(record), deletedAt: record.deletedAt }]),
  }
}

function trashSources(workspace: StoredWorkspace) {
  return {
    topic: trashSource('topic', workspace.topics, topic => topic.title),
    project: trashSource('project', workspace.implementationData.projects, project => project.name),
  }
}

function workspaceTechnicalDomains(workspace: StoredWorkspace) {
  return [...(workspace.technicalDomains ?? []), ...workspace.topics.flatMap(topic => technicalDomainsFor(topic.metadata))]
}

function workspaceView(workspace: StoredWorkspace): TopicWorkspace {
  const { topics, relationships, navigationNotice } = workspace
  const trash = Object.values(trashSources(workspace)).flatMap(source => source.items())
  return {
    technicalDomains: mergeTechnicalDomains(workspaceTechnicalDomains(workspace)),
    topics: topics.filter(topic => !isTrashed(topic)),
    trash: trash.sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt)),
    relationships: visibleRelationships(relationships, activeTopicIds(topics)),
    ...(navigationNotice && { navigationNotice }),
  }
}

function requireActiveProject(workspace: StoredWorkspace, id: string) {
  const project = workspace.implementationData.projects.find(item => item.id === id)
  if (!project || project.deletedAt !== undefined) throw new Error('This project no longer exists or is in Trash.')
  return project
}

function requireActiveTopic(workspace: StoredWorkspace, id: string) {
  const topic = workspace.topics.find(item => item.id === id)
  if (!topic || isTrashed(topic)) throw new Error('This topic no longer exists or is in Trash.')
  return topic
}

function requireActiveImplementation(workspace: StoredWorkspace, id: string) {
  const implementation = workspace.implementationData.implementations.find(item => item.id === id)
  if (!implementation) throw new Error('This implementation no longer exists.')
  requireActiveTopic(workspace, implementation.topicId)
  requireActiveProject(workspace, implementation.projectId)
  return implementation
}

function appendVersion(workspace: StoredWorkspace, topic: Topic, summary: string, author: string, createdAt: string, restoredFromVersionId?: string) {
  const latest = workspace.topicVersions.reduce((number, item) => item.topicId === topic.id ? Math.max(number, item.versionNumber) : number, 0)
  const version: TopicVersion = {
    id: crypto.randomUUID(), topicId: topic.id, versionNumber: latest + 1, summary, author, createdAt, restoredFromVersionId,
    snapshot: currentKnowledgeSnapshot(workspace, topic),
  }
  workspace.topicVersions.push(version)
  return version
}

function currentKnowledgeSnapshot(workspace: StoredWorkspace, topic: Topic): TopicSnapshot {
  return captureTopicSnapshot(topic, workspace.topics, visibleRelationships(workspace.relationships, activeTopicIds(workspace.topics)), workspace)
}

function topicVersions(workspace: StoredWorkspace, topicId: string) {
  return workspace.topicVersions.filter(version => version.topicId === topicId).sort((a, b) => b.versionNumber - a.versionNumber)
}

function touchKnowledge(workspace: StoredWorkspace, ids: readonly string[], updatedAt: string) {
  const changed = new Set(ids)
  workspace.topics = workspace.topics.map(item => changed.has(item.id) ? { ...item, updatedAt } : item)
}

function pinCurrentKnowledge(workspace: StoredWorkspace, topic: Topic) {
  const latest = workspace.topicVersions.filter(version => version.topicId === topic.id)
    .reduce<TopicVersion | undefined>((current, version) => !current || version.versionNumber > current.versionNumber ? version : current, undefined)
  const snapshot = currentKnowledgeSnapshot(workspace, topic)
  return latest?.snapshot.knowledgeSections !== undefined && matchesTopicSnapshot(latest.snapshot, snapshot) ? latest :
    appendVersion(workspace, topic, 'Knowledge pinned for project execution.', 'Playbook', new Date().toISOString())
}

function instantiateDefinitions(workspace: StoredWorkspace, plan: TopicImplementation, version: TopicVersion) {
  const tasks = workspace.implementationData.tasks
  const existing = orderedTasks(tasks, plan.id)
  const ids = new Map(existing.flatMap(task => task.definitionId ? [[task.definitionId, task.id] as const] : []))
  const definitions = [...(version.snapshot.taskDefinitions ?? [])].sort((a, b) => a.order - b.order)
  const additions = definitions.filter(definition => !ids.has(definition.id))
  for (const definition of additions) ids.set(definition.id, crypto.randomUUID())
  let order = existing.at(-1)?.order ?? 0
  const now = new Date().toISOString()
  for (const definition of additions) {
    tasks.push({
      id: ids.get(definition.id)!, implementationId: plan.id, definitionId: definition.id, knowledgeVersionId: version.id,
      title: definition.title, description: definition.description, status: 'todo', order: ++order,
      dependencyIds: definition.dependencyIds.map(id => ids.get(id)!),
      criteria: definition.criteria.map(criterion => ({ ...criterion, completed: false })),
      references: structuredClone(definition.references.filter(reference =>
        reference.kind !== 'topic' || workspace.topics.some(topic => topic.id === reference.topicId))),
      createdAt: now, updatedAt: now,
    })
  }
}

function restoredRelationships(workspace: StoredWorkspace, topicId: string, snapshot: TopicSnapshot, now: string) {
  const topicIds = activeTopicIds(workspace.topics)
  const { dependencies, related } = relationshipsFor(topicId, visibleRelationships(workspace.relationships, topicIds))
  const replaced = new Set([...dependencies, ...related].map(edge => edge.id))
  const relations = workspace.relationships.filter(edge => !replaced.has(edge.id))

  function restore(links: readonly VersionRelationship[], current: TopicRelationship[], type: RelationshipType) {
    const existing = new Map(current.map(edge => [otherTopicId(topicId, edge), edge]))
    for (const link of links) {
      const previous = existing.get(link.id)
      const captured = link.relationship
      const available = captured && !relations.some(edge => edge.id === captured.id)
      const edge = available
        ? { ...captured, type, description: link.description, updatedAt: now }
        : previous
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
  const removedTaskIds = new Set(data.tasks.filter(task => removed.has(task.implementationId)).map(task => task.id))
  data.implementations = data.implementations.filter(item => !removed.has(item.id))
  data.tasks = data.tasks.filter(task => !removed.has(task.implementationId))
  data.artifacts = data.artifacts.filter(artifact => !removed.has(artifact.implementationId))
  clearArtifactTaskLinks(data.artifacts, removedTaskIds, new Date().toISOString())
}

function clearArtifactTaskLinks(artifacts: ImplementationArtifact[], taskIds: ReadonlySet<string>, updatedAt: string) {
  for (const artifact of artifacts) {
    if (artifact.relatedTaskId && taskIds.has(artifact.relatedTaskId)) {
      delete artifact.relatedTaskId
      artifact.updatedAt = updatedAt
    }
  }
}

function validateArtifactTask(data: ImplementationWorkspace, projectId: string, taskId?: string) {
  if (taskId === undefined) return
  const task = data.tasks.find(item => item.id === taskId)
  const plan = data.implementations.find(item => item.id === task?.implementationId)
  if (plan?.projectId !== projectId) throw new Error('Choose an existing task from this project.')
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
  requireActiveTopic(workspace, key.topicId)
  if (key.projectId !== undefined) requireActiveProject(workspace, key.projectId)
}

type StoredTopic = Omit<Topic, 'type'> & Partial<Pick<Topic, 'type'>>

function isTopicContent(value: unknown): value is StoredTopic {
  if (!value || typeof value !== 'object') return false
  const topic = value as Record<string, unknown>
  return typeof topic.id === 'string' && Boolean(topic.id) &&
    (topic.type === undefined || isTopicType(topic.type)) &&
    typeof topic.title === 'string' && Boolean(topic.title.trim()) &&
    typeof topic.description === 'string' && typeof topic.content === 'string' &&
    isTimestamp(topic.createdAt) && isTimestamp(topic.updatedAt) &&
    (topic.deletedAt === undefined || isTimestamp(topic.deletedAt)) &&
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

export class LocalStorageTopicRepository implements TopicRepository, ImplementationRepository, InstructionRepository, KnowledgeRepository {
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
        knowledgeSections: [], taskDefinitions: [],
      }
      this.write(workspace)
      return workspace
    }

    let workspace: StoredWorkspace
    let issues: string[] | undefined
    let upgrade = false
    let invalidReason = 'Stored Playbook workspace data is invalid.'
    try {
      const stored: unknown = JSON.parse(raw)
      // A legacy array is upgraded in memory and written in the new format on the next change.
      const data = Array.isArray(stored)
        ? { version: 2, topics: stored, relationships: [] }
        : stored as Record<string, unknown> | null
      if (data?.version !== 2 && data?.version !== 3 && data?.version !== 4 && data?.version !== 5 && data?.version !== 6) throw new Error()
      upgrade = data.version !== 6
      const { topics: storedTopics, relationships, instructionDrafts = [], instructionSettings = [], instructionTemplates = [],
        topicVersions = [], technicalDomains, knowledgeData, knowledgeSections, legacyKnowledgeData } = data
      if (!Array.isArray(storedTopics) || !storedTopics.every(isTopicContent) ||
          !Array.isArray(relationships) || !relationships.every(isRelationship) ||
          (technicalDomains !== undefined && (!Array.isArray(technicalDomains) || technicalDomains.some(domain => typeof domain !== 'string')))) throw new Error()

      const topicIds = new Set(storedTopics.map(topic => topic.id))
      if (topicIds.size !== storedTopics.length) {
        invalidReason = 'Stored Playbook workspace has duplicate topic IDs, so topic references are ambiguous.'
        throw new Error()
      }
      const migrating = data.version !== 5 && data.version !== 6
      const topics = storedTopics.map(topic => ({
        ...topic, type: topic.type ?? defaultTopicType,
        ...(topic.metadata && { metadata: { ...topic.metadata, customProperties: topic.metadata.customProperties.map(typedCustomProperty) } }),
      }))
      if (migrating) issues = organizationIssues(topics, data.folders, data.version === 4)

      const edgeIds = new Set<string>()
      const validated: TopicRelationship[] = []
      for (const relationship of relationships) {
        if (edgeIds.has(relationship.id)) throw new Error()
        validateRelationship(topicIds, validated, relationship)
        edgeIds.add(relationship.id)
        validated.push(relationship)
      }
      const implementationData = data.version !== 2
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
      const versions = readTopicVersions(topicVersions, topicIds).map(version => {
        if (!migrating) return version
        const metadata = { ...version.snapshot.metadata } as TopicSnapshot['metadata'] & { scope?: unknown; parent?: unknown }
        delete metadata.scope
        delete metadata.parent
        return { ...version, snapshot: { ...version.snapshot, metadata } }
      })
      const knowledge = knowledgeSections === undefined
        ? migrateLegacyKnowledge(knowledgeData, topicIds)
        : { knowledgeSections: readKnowledgeSections(knowledgeSections, topicIds), legacyKnowledgeData }
      workspace = {
        topics, relationships,
        ...(technicalDomains && { technicalDomains: mergeTechnicalDomains(technicalDomains) }),
        implementationData, instructionDrafts, instructionSettings, instructionTemplates, topicVersions: versions, ...knowledge,
        taskDefinitions: upgrade ? [] : readTaskDefinitions(data.taskDefinitions, topicIds),
        navigationNotice: typeof data.navigationNotice === 'string' ? data.navigationNotice : undefined,
      }
    } catch {
      throw new Error(`${invalidReason} The original data has been preserved.`)
    }

    if (issues) {
      let key: string
      try {
        key = backUpTopicOrganization(this.storage(), raw)
      } catch {
        throw new Error('Playbook could not back up the original topic organization. The workspace is unchanged. Check available browser storage and try again.')
      }
      workspace.topics = flattenTopics(workspace.topics)
      const details = issues.length ? ` Review the original records for ${issues.join(', ')}.` : ''
      workspace.navigationNotice = `Topics now appear in a flat list. The original workspace is backed up in browser storage under ${key}.${details}`
    }
    try {
      if (upgrade) {
        const topicIds = new Set(workspace.topics.map(topic => topic.id))
        workspace.taskDefinitions = migrateTaskDefinitions(workspace.implementationData, workspace.topics, workspace.relationships,
          workspace.topicVersions, workspace.knowledgeSections)
        readTaskDefinitions(workspace.taskDefinitions, topicIds)
        readTopicVersions(workspace.topicVersions, topicIds)
      }
      validateImplementationPins(workspace.implementationData, workspace.topicVersions)
    } catch {
      throw new Error('Playbook could not validate the workspace knowledge and execution links. The original data has been preserved.')
    }
    if (upgrade && !issues) {
      this.backUpExecutionMigration(raw)
    }
    return workspace
  }

  private backUpExecutionMigration(raw: string) {
    try {
      for (let index = 1; ; index++) {
        const key = EXECUTION_MIGRATION_BACKUP_PREFIX + index
        const previous = this.storage().getItem(key)
        if (previous === raw) return
        if (previous === null) {
          this.storage().setItem(key, raw)
          return
        }
      }
    } catch {
      throw new Error('Playbook could not back up the workspace for migration. The original workspace is unchanged.')
    }
  }

  private write(workspace: StoredWorkspace): void {
    try {
      this.storage().setItem(TOPIC_STORAGE_KEY, JSON.stringify({ version: 6, ...workspace }))
    } catch {
      throw new Error('Playbook could not save to browser storage. Check available space and browser settings.')
    }
  }

  async readWorkspace(): Promise<TopicWorkspace> {
    return workspaceView(this.read())
  }

  async readKnowledge(topicId: string) {
    const workspace = this.read()
    requireActiveTopic(workspace, topicId)
    return {
      sections: workspace.knowledgeSections.filter(section => section.topicId === topicId)
        .sort((a, b) => a.order - b.order),
      migrationNotice: legacyKnowledgeNotice(workspace.legacyKnowledgeData),
    }
  }

  async saveKnowledgeSection(topicId: string, sectionId: string, content: string) {
    const workspace = this.read()
    const index = workspace.knowledgeSections.findIndex(section => section.topicId === topicId && section.id === sectionId)
    const section = workspace.knowledgeSections[index]
    if (!section) throw new Error('This knowledge section no longer exists.')
    requireActiveTopic(workspace, topicId)
    if (section.content === content) return section
    const updated = { ...section, content }
    workspace.knowledgeSections[index] = updated
    touchKnowledge(workspace, [topicId], new Date().toISOString())
    this.write(workspace)
    return updated
  }

  async listVersions(topicId: string) {
    const workspace = this.read()
    if (!activeTopicIds(workspace.topics).has(topicId)) return []
    return topicVersions(workspace, topicId)
  }

  async readWorkingVersion(topicId: string) {
    const workspace = this.read()
    const topic = requireActiveTopic(workspace, topicId)
    return { snapshot: currentKnowledgeSnapshot(workspace, topic), updatedAt: topic.updatedAt, versions: topicVersions(workspace, topicId) }
  }

  async createVersion(topicId: string, summary: string, author: string) {
    const workspace = this.read()
    const topic = requireActiveTopic(workspace, topicId)
    const [latest] = topicVersions(workspace, topicId)
    if (latest && !hasTopicVersionChanges(compareTopicVersions(latest.snapshot, currentKnowledgeSnapshot(workspace, topic)))) {
      throw new Error('No meaningful changes since the latest saved version.')
    }
    const version = appendVersion(workspace, topic, summary, author, new Date().toISOString())
    this.write(workspace)
    return version
  }

  async restoreVersion(topicId: string, versionId: string, author: string): Promise<TopicRestoreResult> {
    const workspace = this.read()
    const index = workspace.topics.findIndex(topic => topic.id === topicId)
    const topic = requireActiveTopic(workspace, topicId)
    const target = workspace.topicVersions.find(item => item.topicId === topicId && item.id === versionId)
    if (!target) throw new Error('This version no longer exists for this topic.')
    const { title, description, content, metadata } = target.snapshot
    const now = new Date().toISOString()
    const relationships = restoredRelationships(workspace, topicId, target.snapshot, now)
    const backup = appendVersion(workspace, topic, `State before restoring v${target.versionNumber}.`, author, now)
    const restored: Topic = {
      ...topic, title, description, content, type: target.snapshot.type ?? topic.type, sourceTopicId: metadata.source?.id, updatedAt: now,
      metadata: metadata.details ? { ...(topic.metadata ?? defaultTopicMetadata), ...knowledgeMetadata(metadata.details) } : topic.metadata,
    }
    workspace.topics[index] = restored
    workspace.relationships = relationships
    if (target.snapshot.taskDefinitions !== undefined) {
      workspace.taskDefinitions = workspace.taskDefinitions.filter(definition => definition.topicId !== topic.id)
        .concat(structuredClone([...target.snapshot.taskDefinitions]))
    }
    if (target.snapshot.knowledgeSections !== undefined) {
      workspace.knowledgeSections = workspace.knowledgeSections.filter(section => section.topicId !== topic.id)
        .concat(structuredClone([...target.snapshot.knowledgeSections]))
    }
    const version = appendVersion(workspace, restored, `Restored from v${target.versionNumber}.`, author, now, target.id)
    this.write(workspace)
    return { workspace: workspaceView(workspace), backup, version }
  }

  async readImplementations() {
    const workspace = this.read()
    const { projects, implementations, tasks, artifacts } = workspace.implementationData
    const activeIds = activeTopicIds(workspace.topics)
    const activeProjects = projects.filter(project => project.deletedAt === undefined)
    const activeProjectIds = new Set(activeProjects.map(project => project.id))
    const visible = implementations.filter(item => activeIds.has(item.topicId) && activeProjectIds.has(item.projectId))
    const implementationIds = new Set(visible.map(item => item.id))
    return {
      projects: activeProjects, implementations: visible,
      tasks: tasks.filter(task => implementationIds.has(task.implementationId)).map(task => ({
        ...task, references: task.references.filter(reference => reference.kind !== 'topic' || activeIds.has(reference.topicId)),
      })),
      artifacts: artifacts.filter(artifact => implementationIds.has(artifact.implementationId)),
      taskDefinitions: workspace.taskDefinitions.filter(task => activeIds.has(task.topicId)),
      knowledgeVersions: workspace.topicVersions.filter(version =>
        visible.some(plan => plan.knowledgeVersionId === version.id)),
    }
  }

  async readTopicInstructionKnowledge(topicId: string) {
    const workspace = this.read()
    requireActiveTopic(workspace, topicId)
    return {
      taskDefinitions: workspace.taskDefinitions.filter(task => task.topicId === topicId),
      sections: workspace.knowledgeSections,
    }
  }

  async readInstructionDraft(key: InstructionKey) {
    const id = instructionKey(key)
    const workspace = this.read()
    if (!activeTopicIds(workspace.topics).has(key.topicId) || (key.projectId !== undefined &&
      !workspace.implementationData.projects.some(project => project.id === key.projectId && project.deletedAt === undefined))) return undefined
    return workspace.instructionDrafts.find(draft => instructionKey(draft) === id)
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
    const workspace = this.read()
    if (!activeTopicIds(workspace.topics).has(key.topicId) || (key.projectId !== undefined &&
      !workspace.implementationData.projects.some(project => project.id === key.projectId && project.deletedAt === undefined))) return {}
    const settings = workspace.instructionSettings.find(item => instructionKey(item) === id)
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
    return this.read().topics.filter(topic => !isTrashed(topic))
  }

  async getById(id: string) {
    return this.read().topics.find(topic => topic.id === id && !isTrashed(topic))
  }

  async create(topic: Topic) {
    const workspace = this.read()
    if (!isTopicType(topic.type)) throw new Error('Choose a valid topic type.')
    if (workspace.topics.some(existing => existing.id === topic.id)) throw new Error('A topic with this ID already exists.')
    workspace.topics.push(topic)
    this.write(workspace)
    return topic
  }

  async duplicate(id: string) {
    const workspace = this.read()
    const source = requireActiveTopic(workspace, id)
    const now = new Date().toISOString()
    const copy = structuredClone(source)
    copy.id = crypto.randomUUID()
    copy.title += ' (Copy)'
    copy.createdAt = copy.updatedAt = now
    if (copy.metadata) {
      copy.metadata = {
        ...copy.metadata, customProperties: copy.metadata.customProperties.map(property => ({ ...property, id: crypto.randomUUID() })),
      }
    }
    const { dependencies, related } = relationshipsFor(id, workspace.relationships)
    const topicIds = new Set([...workspace.topics.map(topic => topic.id), copy.id])
    for (const edge of [...dependencies, ...related]) {
      const clonedEdge = {
        ...edge, id: crypto.randomUUID(), createdAt: now, updatedAt: now,
        sourceTopicId: edge.sourceTopicId === id ? copy.id : edge.sourceTopicId,
        targetTopicId: edge.targetTopicId === id ? copy.id : edge.targetTopicId,
      }
      validateRelationship(topicIds, workspace.relationships, clonedEdge)
      workspace.relationships.push(clonedEdge)
    }
    const definitions = workspace.taskDefinitions.filter(task => task.topicId === id)
    const taskIds = new Map(definitions.map(task => [task.id, crypto.randomUUID()]))
    workspace.taskDefinitions.push(...definitions.map(task => ({
      ...task, id: taskIds.get(task.id)!, topicId: copy.id, createdAt: now, updatedAt: now,
      dependencyIds: task.dependencyIds.map(dependency => taskIds.get(dependency)!),
      criteria: task.criteria.map(criterion => ({ ...criterion, id: crypto.randomUUID() })),
      references: task.references.map(reference => reference.kind === 'topic'
        ? { ...reference, id: crypto.randomUUID(), topicId: reference.topicId === id ? copy.id : reference.topicId }
        : { ...reference, id: crypto.randomUUID() }),
    })))
    const sections = workspace.knowledgeSections.filter(section => section.topicId === id)
    workspace.knowledgeSections.push(...sections.map(section => ({ ...section, id: crypto.randomUUID(), topicId: copy.id })))
    workspace.topics.push(copy)
    this.write(workspace)
    return copy
  }

  async update(input: TopicInput & Pick<Topic, 'id' | 'updatedAt'>) {
    const workspace = this.read()
    const { id, title, description, content, type, updatedAt } = input
    if (type !== undefined && !isTopicType(type)) throw new Error('Choose a valid topic type.')
    const index = workspace.topics.findIndex(existing => existing.id === id)
    const existing = requireActiveTopic(workspace, id)
    const topic = { ...existing, title, description, content, type: type ?? existing.type, updatedAt }
    workspace.topics[index] = topic
    this.write(workspace)
    return topic
  }

  async updateMetadata(id: string, metadata: TopicMetadata, type?: TopicType) {
    const workspace = this.read()
    const index = workspace.topics.findIndex(topic => topic.id === id)
    const topic = requireActiveTopic(workspace, id)
    if (!isTopicMetadata(metadata)) throw new Error('Enter valid topic metadata.')
    if (type !== undefined && !isTopicType(type)) throw new Error('Choose a valid topic type.')
    const domains = mergeTechnicalDomains([...workspaceTechnicalDomains(workspace), ...technicalDomainsFor(metadata)])
    if (domains.length) workspace.technicalDomains = domains
    const updated = { ...topic, metadata, type: type ?? topic.type, updatedAt: new Date().toISOString() }
    workspace.topics[index] = updated
    this.write(workspace)
    return updated
  }

  async delete(id: string) {
    this.moveToTrash({ type: 'topic', id })
  }

  private moveToTrash(target: TrashTarget) {
    const workspace = this.read()
    const record = trashSources(workspace)[target.type].records.find(item => item.id === target.id)
    if (!record || record.deletedAt !== undefined) return
    record.deletedAt = new Date().toISOString()
    this.write(workspace)
  }

  async restoreTrash(target: TrashTarget) {
    const workspace = this.read()
    const record = trashSources(workspace)[target.type].records.find(item => item.id === target.id)
    if (record?.deletedAt === undefined) return
    delete record.deletedAt
    this.write(workspace)
  }

  async purgeTrashItem(target: TrashTarget) {
    const workspace = this.read()
    const record = trashSources(workspace)[target.type].records.find(item => item.id === target.id)
    if (!record) return
    if (record.deletedAt === undefined) throw new Error(`Move this ${target.type} to Trash before deleting it permanently.`)
    this.purgeTrash(workspace, [target])
  }

  async deletePermanently(id: string) {
    return this.purgeTrashItem({ type: 'topic', id })
  }

  async emptyTrash() {
    const workspace = this.read()
    this.purgeTrash(workspace, workspaceView(workspace).trash)
  }

  private purgeTrash(workspace: StoredWorkspace, targets: readonly TrashTarget[]) {
    if (!targets.length) return
    const ids: Record<TrashEntityType, Set<string>> = { topic: new Set(), project: new Set() }
    for (const target of targets) ids[target.type].add(target.id)
    const { topic: topicIds, project: projectIds } = ids
    const { implementationData } = workspace
    const plansWithTasks = new Set(implementationData.tasks.map(task => task.implementationId))
    if (implementationData.implementations.some(plan => topicIds.has(plan.topicId) &&
      (!projectIds.has(plan.projectId) || plansWithTasks.has(plan.id)))) {
      throw new Error('This topic is pinned by an existing project. Restore the topic and remove its project association before permanently deleting it and its knowledge versions.')
    }
    const retainedTrashedTopics = new Set(workspace.topics.filter(item => isTrashed(item) && !topicIds.has(item.id)).map(item => item.id))
    const belongsToDeletedProject = (item: { projectId?: string }) => item.projectId !== undefined && projectIds.has(item.projectId)
    const jeopardizesRestore = [...implementationData.implementations, ...workspace.instructionDrafts, ...workspace.instructionSettings]
      .some(item => belongsToDeletedProject(item) && retainedTrashedTopics.has(item.topicId))
    if (jeopardizesRestore) throw new Error('Restore or permanently delete the topics in Trash that use this project before deleting it permanently.')

    implementationData.projects = implementationData.projects.filter(project => !projectIds.has(project.id))
    removeImplementations(implementationData, item => topicIds.has(item.topicId) || belongsToDeletedProject(item))
    const updatedAt = new Date().toISOString()
    for (const task of implementationData.tasks) {
      const references = task.references.filter(reference => reference.kind !== 'topic' || !topicIds.has(reference.topicId))
      if (references.length !== task.references.length) {
        task.references = references
        task.updatedAt = updatedAt
      }
    }
    this.write({
      ...workspace,
      knowledgeSections: workspace.knowledgeSections.filter(section => !topicIds.has(section.topicId)),
      taskDefinitions: workspace.taskDefinitions.filter(task => !topicIds.has(task.topicId)).map(task => ({
        ...task, references: task.references.filter(reference => reference.kind !== 'topic' || !topicIds.has(reference.topicId)),
      })),
      topicVersions: workspace.topicVersions.filter(version => !topicIds.has(version.topicId)),
      instructionDrafts: workspace.instructionDrafts.filter(draft => !topicIds.has(draft.topicId) && !belongsToDeletedProject(draft)),
      instructionSettings: workspace.instructionSettings.filter(item => !topicIds.has(item.topicId) && !belongsToDeletedProject(item)),
      topics: workspace.topics.filter(existing => !topicIds.has(existing.id)),
      relationships: workspace.relationships.filter(edge => !topicIds.has(edge.sourceTopicId) && !topicIds.has(edge.targetTopicId)),
    })
  }

  async createRelationship(relationship: TopicRelationship) {
    const workspace = this.read()
    if (workspace.relationships.some(existing => existing.id === relationship.id)) {
      throw new Error('A relationship with this ID already exists.')
    }
    validateRelationship(activeTopicIds(workspace.topics), workspace.relationships, relationship)
    workspace.relationships.push(relationship)
    touchKnowledge(workspace, [relationship.sourceTopicId, relationship.targetTopicId], relationship.updatedAt)
    this.write(workspace)
    return relationship
  }

  async updateRelationship(id: string, input: RelationshipInput, updatedAt: string) {
    const workspace = this.read()
    const index = workspace.relationships.findIndex(edge => edge.id === id)
    const existing = workspace.relationships[index]
    if (!existing) throw new Error('This relationship no longer exists.')
    requireActiveTopic(workspace, existing.sourceTopicId)
    requireActiveTopic(workspace, existing.targetTopicId)
    validateRelationship(activeTopicIds(workspace.topics), workspace.relationships.filter(edge => edge.id !== id), input)
    const updated = { ...existing, ...input, id: existing.id, createdAt: existing.createdAt, updatedAt }
    workspace.relationships[index] = updated
    touchKnowledge(workspace, [existing.sourceTopicId, existing.targetTopicId, updated.sourceTopicId, updated.targetTopicId], updatedAt)
    this.write(workspace)
    return updated
  }

  async deleteRelationship(id: string) {
    const workspace = this.read()
    const index = workspace.relationships.findIndex(edge => edge.id === id)
    const edge = workspace.relationships[index]
    if (!edge) throw new Error('This relationship no longer exists.')
    requireActiveTopic(workspace, edge.sourceTopicId)
    requireActiveTopic(workspace, edge.targetTopicId)
    workspace.relationships.splice(index, 1)
    touchKnowledge(workspace, [edge.sourceTopicId, edge.targetTopicId], new Date().toISOString())
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
    const project = requireActiveProject(workspace, id)
    project.name = changes.name
    project.description = changes.description
    project.updatedAt = new Date().toISOString()
    this.write(workspace)
  }

  async changeProjectAgentConfig(projectId: string, change: AgentConfigChange) {
    const workspace = this.read()
    const project = requireActiveProject(workspace, projectId)
    const now = new Date().toISOString()
    const config = updateAgentConfig(project.agentConfig ?? emptyAgentConfig(), change, now)
    if (!isProjectAgentConfig(config)) throw new Error('Invalid project agent configuration.')
    project.agentConfig = config
    project.updatedAt = now
    this.write(workspace)
  }

  async saveProjectPolicy(projectId: string, input: SafeguardInput, policyId?: string) {
    const workspace = this.read()
    const project = requireActiveProject(workspace, projectId)
    const policies = projectSafeguardPolicies(project)
    const existing = policies.find(policy => policy.id === policyId)
    if (policyId !== undefined && !existing) throw new Error('This safeguard no longer exists.')
    validateSafeguard(input, policies, policyId)
    const now = new Date().toISOString()
    const policy: SafeguardPolicy = {
      name: input.name.trim(), context: input.context, category: input.category,
      severity: input.severity, enforcement: input.enforcement, enabled: input.enabled,
      id: existing?.id ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    this.writeProjectPolicies(workspace, project, existing ? policies.map(item => item.id === policyId ? policy : item) : [...policies, policy], now)
  }

  async deleteProjectPolicy(projectId: string, policyId: string) {
    const workspace = this.read()
    const project = requireActiveProject(workspace, projectId)
    const policies = projectSafeguardPolicies(project)
    if (!policies.some(policy => policy.id === policyId)) throw new Error('This safeguard no longer exists.')
    this.writeProjectPolicies(workspace, project, policies.filter(policy => policy.id !== policyId), new Date().toISOString())
  }

  private writeProjectPolicies(workspace: StoredWorkspace, project: Project, policies: SafeguardPolicy[], updatedAt: string) {
    project.safeguardPolicies = policies
    project.updatedAt = updatedAt
    delete project.safeguards
    delete project.customSafeguards
    this.write(workspace)
  }

  async deleteProject(id: string) {
    this.moveToTrash({ type: 'project', id })
  }

  async createImplementation(implementation: TopicImplementation) {
    const workspace = this.read()
    if (!this.addImplementation(workspace, implementation)) return false
    this.write(workspace)
    return true
  }

  private addImplementation(workspace: StoredWorkspace, implementation: TopicImplementation) {
    const { implementations } = workspace.implementationData
    const topic = requireActiveTopic(workspace, implementation.topicId)
    requireActiveProject(workspace, implementation.projectId)
    if (implementations.some(item => item.topicId === implementation.topicId && item.projectId === implementation.projectId)) {
      return false
    }
    if (implementations.some(item => item.id === implementation.id)) throw new Error('An implementation with this ID already exists.')
    const version = pinCurrentKnowledge(workspace, topic)
    const plan = { ...implementation, knowledgeVersionId: version.id }
    implementations.push(plan)
    instantiateDefinitions(workspace, plan, version)
    return true
  }

  async updateImplementation(id: string, changes: ImplementationChanges) {
    const workspace = this.read()
    const item = requireActiveImplementation(workspace, id)
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
    requireActiveImplementation(workspace, id)
    removeImplementations(data, item => item.id === id)
    this.write(workspace)
  }

  async upgradeImplementationKnowledge(id: string) {
    const workspace = this.read()
    const plan = requireActiveImplementation(workspace, id)
    const version = pinCurrentKnowledge(workspace, requireActiveTopic(workspace, plan.topicId))
    if (plan.knowledgeVersionId === version.id) return
    plan.knowledgeVersionId = version.id
    plan.updatedAt = new Date().toISOString()
    instantiateDefinitions(workspace, plan, version)
    this.write(workspace)
  }

  async saveTaskDefinition(input: TaskDefinition) {
    const workspace = this.read()
    requireActiveTopic(workspace, input.topicId)
    const definitions = workspace.taskDefinitions
    const index = definitions.findIndex(task => task.id === input.id)
    const existing = definitions[index]
    if (existing && existing.topicId !== input.topicId) throw new Error('This task definition belongs to another topic.')
    for (const reference of input.references) {
      if (reference.kind === 'topic' && !existing?.references.some(previous =>
        previous.id === reference.id && previous.kind === 'topic' && previous.topicId === reference.topicId)) {
        requireActiveTopic(workspace, reference.topicId)
      }
    }
    const order = definitions.reduce((highest, task) => task.topicId === input.topicId ? Math.max(highest, task.order) : highest, 0)
    const now = new Date().toISOString()
    const task = {
      id: input.id, topicId: input.topicId, title: input.title, description: input.description,
      criteria: input.criteria.map(({ id, description, order }) => ({ id, description, order })),
      dependencyIds: [...input.dependencyIds], references: structuredClone(input.references),
      order: existing?.order ?? order + 1, createdAt: existing?.createdAt ?? now,
      sourceProjectId: existing?.sourceProjectId, updatedAt: now,
    }
    if (existing) definitions[index] = task
    else definitions.push(task)
    readTaskDefinitions(definitions, new Set(workspace.topics.map(topic => topic.id)))
    touchKnowledge(workspace, [input.topicId], now)
    this.write(workspace)
  }

  async moveTaskDefinition(topicId: string, id: string, destination: -1 | 1 | string) {
    const workspace = this.read()
    requireActiveTopic(workspace, topicId)
    const ordered = workspace.taskDefinitions.filter(task => task.topicId === topicId).sort((a, b) => a.order - b.order)
    const index = ordered.findIndex(task => task.id === id)
    const task = ordered[index]
    if (!task) throw new Error('This task definition no longer exists.')
    const target = typeof destination === 'string' ? ordered.findIndex(item => item.id === destination) : index + destination
    if (typeof destination === 'string' && target < 0) throw new Error('Choose a task in the same Topic.')
    if (!moveOrderedTask(ordered, task, index, target)) return
    touchKnowledge(workspace, [topicId], new Date().toISOString())
    this.write(workspace)
  }

  async deleteTaskDefinition(topicId: string, id: string) {
    const workspace = this.read()
    requireActiveTopic(workspace, topicId)
    if (!workspace.taskDefinitions.some(task => task.id === id && task.topicId === topicId)) {
      throw new Error('This task definition no longer exists.')
    }
    removeItem(workspace.taskDefinitions, id, 'This task definition no longer exists.')
    for (const task of workspace.taskDefinitions) {
      if (!task.dependencyIds.includes(id)) continue
      task.dependencyIds = task.dependencyIds.filter(dependency => dependency !== id)
      task.updatedAt = new Date().toISOString()
    }
    touchKnowledge(workspace, [topicId], new Date().toISOString())
    this.write(workspace)
  }

  async createTask(task: Omit<ImplementationTask, 'order'>) {
    const workspace = this.read()
    const { tasks } = workspace.implementationData
    const plan = requireActiveImplementation(workspace, task.implementationId)
    if (tasks.some(item => item.id === task.id)) throw new Error('A task with this ID already exists.')
    const last = orderedTasks(tasks, task.implementationId).at(-1)
    const order = (last?.order ?? 0) + 1
    const projectDefinition: TaskDefinition = {
      id: crypto.randomUUID(), topicId: plan.topicId, sourceProjectId: plan.projectId,
      title: task.title, description: task.description, order, createdAt: task.createdAt, updatedAt: task.updatedAt,
      criteria: [], dependencyIds: [], references: [],
    }
    tasks.push({ ...task, order, knowledgeVersionId: plan.knowledgeVersionId, definitionId: projectDefinition.id, projectDefinition })
    this.write(workspace)
  }

  async updateTask(id: string, changes: TaskChanges) {
    const workspace = this.read()
    const task = workspace.implementationData.tasks.find(item => item.id === id)
    if (!task) throw new Error('This task no longer exists.')
    requireActiveImplementation(workspace, task.implementationId)
    task.title = changes.title
    task.description = changes.description
    task.status = changes.status
    task.updatedAt = new Date().toISOString()
    this.write(workspace)
  }

  async deleteTask(id: string) {
    const workspace = this.read()
    const tasks = workspace.implementationData.tasks
    const existing = tasks.find(task => task.id === id)
    if (!existing) throw new Error('This task no longer exists.')
    requireActiveImplementation(workspace, existing.implementationId)
    removeItem(tasks, id, 'This task no longer exists.')
    const updatedAt = new Date().toISOString()
    for (const task of tasks) {
      if (task.dependencyIds.includes(id)) {
        task.dependencyIds = task.dependencyIds.filter(dependency => dependency !== id)
        task.updatedAt = updatedAt
      }
    }
    clearArtifactTaskLinks(workspace.implementationData.artifacts, new Set([id]), updatedAt)
    this.write(workspace)
  }

  async moveTask(id: string, destination: -1 | 1 | string) {
    const workspace = this.read()
    const tasks = workspace.implementationData.tasks
    const task = tasks.find(item => item.id === id)
    if (!task) throw new Error('This task no longer exists.')
    requireActiveImplementation(workspace, task.implementationId)
    const ordered = orderedTasks(tasks, task.implementationId)
    const from = ordered.indexOf(task)
    const to = typeof destination === 'string' ? ordered.findIndex(item => item.id === destination) : from + destination
    if (typeof destination === 'string' && to === -1) throw new Error('Choose a task in the same implementation.')
    if (!moveOrderedTask(ordered, task, from, to, new Date().toISOString())) return
    this.write(workspace)
  }

  async changeTaskDetails(taskId: string, change: TaskDetailChange) {
    const workspace = this.read()
    const tasks = workspace.implementationData.tasks
    const task = tasks.find(item => item.id === taskId)
    if (!task) throw new Error('This task no longer exists.')
    requireActiveImplementation(workspace, task.implementationId)

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
        if (reference.kind === 'topic') requireActiveTopic(workspace, reference.topicId)
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
    const { artifacts } = workspace.implementationData
    const implementation = requireActiveImplementation(workspace, artifact.implementationId)
    validateArtifactTask(workspace.implementationData, implementation.projectId, artifact.relatedTaskId)
    if (artifacts.some(item => item.id === artifact.id)) throw new Error('This artifact already exists.')
    artifacts.push(artifact)
    this.write(workspace)
  }

  async updateArtifact(id: string, changes: ArtifactDetails) {
    const workspace = this.read()
    const artifact = workspace.implementationData.artifacts.find(item => item.id === id)
    if (!artifact) throw new Error('This artifact no longer exists.')
    const implementation = requireActiveImplementation(workspace, artifact.implementationId)
    validateArtifactTask(workspace.implementationData, implementation.projectId, changes.relatedTaskId)
    Object.assign(artifact, changes, { updatedAt: new Date().toISOString() })
    this.write(workspace)
  }

  async deleteArtifact(id: string) {
    const workspace = this.read()
    const artifact = workspace.implementationData.artifacts.find(item => item.id === id)
    if (!artifact) throw new Error('This artifact no longer exists.')
    requireActiveImplementation(workspace, artifact.implementationId)
    removeItem(workspace.implementationData.artifacts, id, 'This artifact no longer exists.')
    this.write(workspace)
  }
}
