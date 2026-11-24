import { projectSafeguardPolicies } from '../domain/project-safeguards'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImplementationService } from '../application/implementation-service'
import { TopicService } from '../application/topic-service'
import { implementationStatuses, orderedTasks, taskProgress, taskStatuses } from '../domain/implementation'
import type { Topic } from '../domain/topic'
import { LocalStorageTopicRepository, TOPIC_STORAGE_KEY } from './local-storage-topic-repository'

const timestamp = '2026-11-19T12:00:00.000Z'
const topic: Topic = {
  type: 'General',
  id: 'legacy', title: 'User topic', description: 'My description', content: '## My Markdown',
  createdAt: timestamp, updatedAt: timestamp,
}
const child: Topic = { ...topic, id: 'child', title: 'Child topic' }
const azure = 'azure-data-platform'
const aws = 'aws-data-platform'
const draft = { title: ' Ingest events ', description: ' Set up ingestion ', status: 'todo' } as const

describe('project implementations', () => {
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { entries.set(key, value) }),
  }
  const repository = new LocalStorageTopicRepository(() => storage, [topic, child])
  const service = new ImplementationService(repository)
  const topicService = new TopicService(repository)

  beforeEach(async () => {
    entries.clear()
    await service.list()
    storage.setItem.mockClear()
  })

  async function create(projectId = azure, topicId = topic.id) {
    await service.createImplementation(topicId, projectId)
    const { implementations } = await service.list()
    return implementations.find(item => item.topicId === topicId && item.projectId === projectId)!
  }

  it('creates a topic/project pair only once when selection is repeated', async () => {
    const results = await Promise.all([
      service.createImplementation(topic.id, azure),
      service.createImplementation(topic.id, azure),
    ])
    expect(results).toEqual([true, false])
    const { implementations: [plan], tasks } = await service.list()
    expect(plan).toBeDefined()
    if (!plan) throw new Error('Expected an implementation')
    expect(plan).toMatchObject({ topicId: topic.id, projectId: azure, status: 'not_started', notes: '' })
    expect(plan.id).toBeTruthy()
    expect(plan.createdAt).toBe(plan.updatedAt)
    expect(tasks).toEqual([])
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect((await service.list()).implementations).toEqual([plan])
  })

  it('creates the new project and only the current topic implementation in one write', async () => {
    const project = await service.createProject('New project', '', child.id)
    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    const state = await reopened.list()
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(state.projects).toContainEqual(project)
    expect(state.implementations).toEqual([
      expect.objectContaining({ topicId: child.id, projectId: project.id, status: 'not_started', notes: '' }),
    ])
    expect(state.tasks).toEqual([])
  })

  it('does not leave a project behind if automatic implementation creation fails', async () => {
    const before = await service.list()
    await expect(service.createProject('New project', '', 'missing')).rejects.toThrow('topic no longer exists')
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(service.createProject('New project', '', topic.id)).rejects.toThrow('could not save')
    expect(await service.list()).toEqual(before)
  })

  it('keeps plans, notes, tasks, and progress isolated by project after reopening', async () => {
    const first = await create(azure)
    const second = await create(aws)
    const task = await service.createTask(first.id, { ...draft, status: 'done' })
    await service.updateImplementation(first.id, { status: 'in_progress', notes: '## Azure decision' })
    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    storage.setItem.mockClear()
    await expect(reopened.createImplementation(topic.id, azure)).resolves.toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
    const state = await reopened.list()
    expect(state.implementations).toMatchObject([
      { id: first.id, status: 'in_progress', notes: '## Azure decision' },
      { id: second.id, status: 'not_started', notes: '' },
    ])
    expect(orderedTasks(state.tasks, first.id).map(item => item.id)).toEqual([task])
    expect(orderedTasks(state.tasks, second.id)).toEqual([])
    expect((await repository.readWorkspace()).topics).toEqual([topic, child])
  })

  it('preserves the global project and other topic plans when removing one association', async () => {
    const project = await service.createProject('Shared project', '', topic.id)
    const otherPlan = await create(project.id, child.id)
    const separatePlan = await create(aws)
    const sharedPlan = (await service.list()).implementations.find(item => item.projectId === project.id && item.topicId === topic.id)!
    await service.createTask(sharedPlan.id, draft)
    await service.createTask(otherPlan.id, { ...draft, title: 'Keep this task' })
    await service.updateImplementation(otherPlan.id, { status: 'completed', notes: 'Keep these notes.' })
    const before = await service.list()
    await service.deleteImplementation(sharedPlan.id)

    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    const after = await reopened.list()
    expect(after.projects).toEqual(before.projects)
    expect(after.implementations).toEqual(before.implementations.filter(item => item.id !== sharedPlan.id))
    expect(after.tasks).toEqual(before.tasks.filter(task => task.implementationId !== sharedPlan.id))
    expect(after.implementations.map(item => item.id)).toEqual([otherPlan.id, separatePlan.id])
  })

  it('creates, edits, reorders, and deletes tasks within their own implementation', async () => {
    const plan = await create()
    const separate = await create(aws)
    const first = await service.createTask(plan.id, draft)
    const second = await service.createTask(plan.id, { ...draft, title: 'Validate events' })
    const other = await service.createTask(separate.id, draft)
    await service.updateTask(first, { title: 'Review ingestion', description: ' New details ', status: 'blocked' })
    await service.moveTask(first, 1)
    await service.moveTask(first, 1)
    const { tasks } = await service.list()
    expect(orderedTasks(tasks, plan.id).map(task => task.id)).toEqual([second, first])
    expect(orderedTasks(tasks, separate.id).map(task => task.id)).toEqual([other])
    expect(tasks.find(task => task.id === first)).toMatchObject({ title: 'Review ingestion', description: 'New details', status: 'blocked' })
    await service.moveTask(first, -1)
    expect(orderedTasks((await service.list()).tasks, plan.id).map(task => task.id)).toEqual([first, second])
    await service.deleteTask(second)
    expect((await service.list()).tasks.map(task => task.id)).toEqual([first, other])
  })

  it('persists each plan and task status independently, and computes progress from done tasks', async () => {
    const plan = await create()
    expect(taskProgress([]).percent).toBe(0)
    const first = await service.createTask(plan.id, draft)
    await service.createTask(plan.id, { ...draft, title: 'Validate' })
    await service.createTask(plan.id, { ...draft, title: 'Monitor', status: 'blocked' })
    for (const status of implementationStatuses) {
      await service.updateImplementation(plan.id, { status, notes: 'Keep me' })
      expect((await service.list()).implementations[0]).toMatchObject({ status, notes: 'Keep me' })
    }
    for (const status of taskStatuses) {
      await service.updateTask(first, { ...draft, status })
      expect((await service.list()).tasks.find(task => task.id === first)?.status).toBe(status)
    }
    expect(taskProgress(orderedTasks((await service.list()).tasks, plan.id))).toEqual({
      counts: { todo: 1, in_progress: 0, blocked: 1, done: 1 }, percent: 33,
    })
    expect((await service.list()).implementations[0]?.status).toBe('completed')
  })

  it('moves a task over multiple rows in one write while preserving task details and other plans', async () => {
    const plan = await create()
    const other = await create(aws)
    const first = await service.createTask(plan.id, { ...draft, title: 'Ingest', status: 'done' })
    const middle = await service.createTask(plan.id, { ...draft, title: 'Monitor', status: 'in_progress' })
    const last = await service.createTask(plan.id, { ...draft, title: 'Validate', status: 'blocked' })
    await service.createTask(other.id, { ...draft, title: 'Separate task' })
    await service.addCriterion(first, 'Validate schema')
    await service.changeTaskDetails(first, { kind: 'addDependency', id: last })
    await service.saveReference(first, { kind: 'topic', topicId: child.id })
    const before = await service.list()
    storage.setItem.mockClear()

    await service.moveTaskTo(first, last)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    const after = await reopened.list()
    expect(orderedTasks(after.tasks, plan.id).map(task => task.id)).toEqual([middle, last, first])
    expect(orderedTasks(after.tasks, other.id)).toEqual(orderedTasks(before.tasks, other.id))
    expect(taskProgress(orderedTasks(after.tasks, plan.id))).toEqual(taskProgress(orderedTasks(before.tasks, plan.id)))
    expect(after.tasks).toEqual(before.tasks.map(task => ({
      ...task,
      ...(task.implementationId === plan.id ? { order: expect.any(Number), updatedAt: expect.any(String) } : {}),
    })))

    await reopened.moveTaskTo(first, middle)
    expect(orderedTasks((await service.list()).tasks, plan.id).map(task => task.id)).toEqual([first, middle, last])
  })

  it('keeps orders unchanged for empty, single-task, out-of-scope, and failed moves', async () => {
    const empty = await create()
    const other = await create(aws)
    const single = await service.createTask(other.id, draft)
    expect(orderedTasks((await service.list()).tasks, empty.id)).toEqual([])
    storage.setItem.mockClear()
    await service.moveTaskTo(single, single)
    await service.moveTask(single, 1)
    await expect(service.moveTaskTo('missing', single)).rejects.toThrow('task no longer exists')
    expect(storage.setItem).not.toHaveBeenCalled()

    const first = await service.createTask(empty.id, draft)
    const second = await service.createTask(empty.id, draft)
    const before = await service.list()
    storage.setItem.mockClear()
    await expect(service.moveTaskTo(first, single)).rejects.toThrow('same implementation')
    expect(storage.setItem).not.toHaveBeenCalled()
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(service.moveTaskTo(first, second)).rejects.toThrow('could not save')
    expect(await service.list()).toEqual(before)
  })

  it('rejects missing references and blank titles', async () => {
    await expect(service.createImplementation('missing', azure)).rejects.toThrow('topic no longer exists')
    await expect(service.createImplementation(topic.id, 'missing')).rejects.toThrow('project no longer exists')
    await expect(service.createTask('missing', draft)).rejects.toThrow('implementation no longer exists')
    await expect(service.updateTask('missing', draft)).rejects.toThrow('task no longer exists')
    await expect(service.createProject('  ', '')).rejects.toThrow('Enter a project name')
    const plan = await create()
    await expect(service.createTask(plan.id, { ...draft, title: '  ' })).rejects.toThrow('Enter a task title')
    expect((await service.list()).tasks).toEqual([])
  })

  it('hides implementations when projects or topics move to Trash and keeps unrelated plans visible', async () => {
    const first = await create(azure)
    const second = await create(aws)
    const childPlan = await create(aws, child.id)
    const created = await service.createProject('  GCP Data Platform ', '  Sandbox  ')
    expect(created).toMatchObject({ name: 'GCP Data Platform', description: 'Sandbox' })
    const third = await create(created.id)
    await service.createTask(first.id, draft)
    await service.createTask(second.id, draft)
    const kept = await service.createTask(childPlan.id, draft)
    await service.createTask(third.id, draft)
    await topicService.addRelationship({ sourceTopicId: topic.id, targetTopicId: child.id, type: 'dependency' })

    await service.deleteImplementation(first.id)
    expect((await service.list()).implementations.map(item => item.id)).toEqual([second.id, childPlan.id, third.id])
    await service.deleteProject(created.id)
    expect((await service.list()).implementations.map(item => item.id)).toEqual([second.id, childPlan.id])
    expect((await repository.readWorkspace()).relationships).toHaveLength(1)
    storage.setItem.mockClear()
    await topicService.delete(topic.id)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    const state = await service.list()
    expect(state.projects.map(item => item.id)).toEqual([azure, aws])
    expect(state.implementations).toEqual([childPlan])
    expect(state.tasks.map(task => task.id)).toEqual([kept])
    expect((await repository.readWorkspace()).relationships).toEqual([])
  })

  it('migrates legacy safeguards without rewriting on read and preserves independent policy records', async () => {
    const plan = await create()
    const raw = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    const legacy = raw.implementationData.projects[0]
    legacy.safeguards = { pullRequests: true, rollback: false }
    legacy.customSafeguards = [{
      id: 'custom-policy', name: 'Require pull requests for code changes', category: 'Traceability',
      description: '**Legacy context**', enabled: true,
    }]
    entries.set(TOPIC_STORAGE_KEY, JSON.stringify(raw))
    const before = entries.get(TOPIC_STORAGE_KEY)
    const initial = await service.list()
    const policies = projectSafeguardPolicies(initial.projects[0]!)
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(before)
    expect(policies).toHaveLength(11)
    expect(policies.find(item => item.id.endsWith(':pullRequests'))?.enabled).toBe(true)
    const custom = policies.find(item => item.id === 'custom-policy')!
    expect(custom).toMatchObject({ name: 'Require pull requests for code changes (custom)', context: '**Legacy context**',
      enabled: true, severity: 'Medium', enforcement: 'Advisory', createdAt: initial.projects[0]?.createdAt })

    await service.saveSafeguard(azure, { ...custom, name: 'Review changes', enabled: false, severity: 'Critical', enforcement: 'Block' }, custom.id)
    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    const saved = await reopened.list()
    expect(saved.projects[0]).not.toHaveProperty('safeguards')
    expect(saved.projects[0]).not.toHaveProperty('customSafeguards')
    expect(saved.projects[0]?.safeguardPolicies).toHaveLength(11)
    expect(saved.projects[0]?.safeguardPolicies?.find(item => item.id === custom.id)).toMatchObject({
      name: 'Review changes', enabled: false, createdAt: custom.createdAt, severity: 'Critical', enforcement: 'Block',
    })
    expect(saved.projects[1]).toEqual(initial.projects[1])
    expect(saved.implementations).toEqual([plan])
    await reopened.deleteSafeguard(azure, custom.id)
    expect((await service.list()).projects[0]?.safeguardPolicies?.some(item => item.id === custom.id)).toBe(false)
  })

  it('rejects duplicate policy names and failed writes atomically', async () => {
    const policy = { name: 'Review changes', category: 'Traceability' as const, context: '', enabled: true,
      severity: 'High' as const, enforcement: 'Require approval' as const }
    await service.saveSafeguard(azure, policy)
    const before = entries.get(TOPIC_STORAGE_KEY)
    await expect(service.saveSafeguard(azure, { ...policy, name: ' review CHANGES ' })).rejects.toThrow('already exists')
    await expect(service.saveSafeguard(azure, { ...policy, name: '   ' })).rejects.toThrow('Enter a safeguard name')
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(service.saveSafeguard(azure, { ...policy, name: 'New name' })).rejects.toThrow('could not save')
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(before)
    await service.saveSafeguard(aws, policy)
    expect((await service.list()).projects.map(item => item.safeguardPolicies?.filter(policy => policy.name === 'Review changes').length)).toEqual([1, 1])
  })

  it('persists project agent configuration independently without disturbing plans or safeguards', async () => {
    const plan = await create()
    await service.saveSafeguard(azure, { name: 'Keep approvals', context: '', category: 'Traceability',
      severity: 'High', enforcement: 'Require approval', enabled: true })
    const before = await service.list()
    await service.changeAgentConfig(azure, { kind: 'context', content: '## Preserved Markdown\n' })
    await service.changeAgentConfig(azure, { kind: 'workflow', content: '1. Review the safeguards.' })
    const repo = { name: 'Playbook', url: 'https://example.com/team/repo.git', provider: 'GitHub' as const, defaultBranch: 'main' }
    await service.changeAgentConfig(azure, { kind: 'repository', input: repo })
    const original = entries.get(TOPIC_STORAGE_KEY)
    await expect(service.changeAgentConfig(azure, { kind: 'repository', input: { ...repo, url: 'https://EXAMPLE.com/team/repo/' } }))
      .rejects.toThrow('already registered')
    for (const url of ['javascript:alert(1)', 'https://user:pass@example.com/team/repo', 'https://example.com/repo?token=secret']) {
      await expect(service.changeAgentConfig(azure, { kind: 'repository', input: { ...repo, url } })).rejects.toThrow(/valid HTTP|without query/)
    }
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(original)
    const gate = { name: 'Unit tests', description: 'Unit tests must pass.', command: 'npm test', enabled: true, required: true }
    await service.changeAgentConfig(azure, { kind: 'qualityGate', input: gate })
    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    const config = (await reopened.list()).projects.find(project => project.id === azure)?.agentConfig
    expect(config).toMatchObject({ context: '## Preserved Markdown\n', workflow: '1. Review the safeguards.',
      repositories: [expect.objectContaining(repo)], qualityGates: [expect.objectContaining(gate)] })
    const repositoryRecord = config!.repositories[0]!
    const gateRecord = config!.qualityGates[0]!
    await reopened.changeAgentConfig(azure, { kind: 'repository', id: repositoryRecord.id, input: { ...repo, defaultBranch: 'release' } })
    await reopened.changeAgentConfig(azure, { kind: 'toggleQualityGate', id: gateRecord.id })
    const after = await reopened.list()
    expect(after.projects[0]?.agentConfig?.repositories[0]).toMatchObject({ id: repositoryRecord.id,
      createdAt: repositoryRecord.createdAt, defaultBranch: 'release', updatedAt: expect.any(String) })
    expect(after.projects[0]?.agentConfig?.qualityGates[0]).toMatchObject({ id: gateRecord.id, enabled: false })
    expect(after.projects[0]?.safeguardPolicies).toEqual(before.projects[0]?.safeguardPolicies)
    expect(after.projects[1]).toEqual(before.projects[1])
    expect(after.implementations).toEqual([plan])
    await reopened.changeAgentConfig(azure, { kind: 'removeRepository', id: repositoryRecord.id })
    await reopened.changeAgentConfig(azure, { kind: 'removeQualityGate', id: gateRecord.id })
    expect((await service.list()).projects[0]?.agentConfig).toMatchObject({ repositories: [], qualityGates: [] })
  })

  it('does not partially delete a project if saving fails', async () => {
    const plan = await create()
    await service.createTask(plan.id, draft)
    const before = await service.list()
    storage.setItem.mockImplementationOnce(() => { throw new Error('Quota exceeded') })
    await expect(service.deleteProject(azure)).rejects.toThrow('could not save')
    expect(await service.list()).toEqual(before)
  })

  it.each([1, 2])('reads Sprint %s storage and upgrades on write without changing user records', async version => {
    const relationship = {
      id: 'edge', sourceTopicId: topic.id, targetTopicId: child.id, type: 'related', createdAt: timestamp, updatedAt: timestamp,
    }
    const topics = [topic, child]
    const relationships = version === 2 ? [relationship] : []
    const raw = JSON.stringify(version === 1 ? topics : { version: 2, topics, relationships })
    entries.set(TOPIC_STORAGE_KEY, raw)
    expect((await service.list()).projects.map(item => item.name)).toEqual(['Azure Data Platform', 'AWS Data Platform'])
    expect(await repository.readWorkspace()).toMatchObject({ topics, relationships })
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(raw)
    await create()
    expect(JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)).toMatchObject({ version: 6, topics, relationships })
    expect(await new LocalStorageTopicRepository(() => storage).readWorkspace()).toMatchObject({ topics, relationships })
  })

  it('preserves an explicitly empty project list across reloads', async () => {
    await service.deleteProject(azure)
    await service.deleteProject(aws)
    const reopened = new LocalStorageTopicRepository(() => storage)
    expect(await reopened.readImplementations()).toEqual({
      projects: [], implementations: [], tasks: [], artifacts: [], taskDefinitions: [], knowledgeVersions: [],
    })
    expect(await reopened.list()).toEqual([topic, child])
  })

  it('adds, edits, checks, reorders, and removes criteria independently of task status', async () => {
    const plan = await create()
    const taskId = await service.createTask(plan.id, draft)
    await service.addCriterion(taskId, ' First criterion ')
    await service.addCriterion(taskId, 'Second criterion')
    await expect(service.addCriterion(taskId, '   ')).rejects.toThrow('criterion description')
    const readTask = async () => (await new ImplementationService(new LocalStorageTopicRepository(() => storage)).list())
      .tasks.find(task => task.id === taskId)!
    const [first, second] = (await readTask()).criteria
    expect(first).toMatchObject({ description: 'First criterion', completed: false, order: 1 })
    await service.updateCriterion(taskId, first!.id, { description: ' Updated ', completed: true })
    await service.changeTaskDetails(taskId, { kind: 'moveCriterion', id: second!.id, direction: -1 })
    await service.updateCriterion(taskId, second!.id, { completed: true })
    const saved = await readTask()
    expect(saved.status).toBe('todo')
    expect([...saved.criteria].sort((a, b) => a.order - b.order)).toMatchObject([
      { id: second!.id, description: 'Second criterion', completed: true, order: 1 },
      { id: first!.id, description: 'Updated', completed: true, order: 2 },
    ])
    await service.changeTaskDetails(taskId, { kind: 'removeCriterion', id: first!.id })
    expect((await readTask()).criteria.map(item => item.id)).toEqual([second!.id])
  })

  it('rejects self, duplicate, cross-project, missing, and cyclic task dependencies', async () => {
    const plan = await create()
    const other = await create(aws)
    const first = await service.createTask(plan.id, draft)
    const second = await service.createTask(plan.id, draft)
    const third = await service.createTask(plan.id, draft)
    const outside = await service.createTask(other.id, draft)
    const add = (taskId: string, id: string) => service.changeTaskDetails(taskId, { kind: 'addDependency', id })
    await expect(add(first, first)).rejects.toThrow('itself')
    await expect(add(first, outside)).rejects.toThrow('same implementation')
    await expect(add(first, 'missing')).rejects.toThrow('same implementation')
    await add(first, second)
    await add(second, third)
    expect(orderedTasks((await service.list()).tasks, plan.id).map(task => task.id)).toEqual([first, second, third])
    await expect(add(first, second)).rejects.toThrow('already exists')
    await expect(add(third, first)).rejects.toThrow('cycle')
    await service.moveTaskTo(first, third)
    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    const reordered = orderedTasks((await reopened.list()).tasks, plan.id)
    expect(reordered.map(task => [task.id, task.dependencyIds])).toEqual([[second, [third]], [third, []], [first, [second]]])
    await reopened.changeTaskDetails(first, { kind: 'removeDependency', id: second })
    expect(orderedTasks((await reopened.list()).tasks, plan.id).map(task => task.id)).toEqual([second, third, first])
    await add(third, first)
    await service.deleteTask(third)
    expect((await service.list()).tasks.map(task => task.dependencyIds)).toEqual([[], [], []])
    expect((await repository.readWorkspace()).relationships).toEqual([])
  })

  it('manages topic, URL, and resource references and cleans up deleted topic links', async () => {
    const plan = await create()
    const taskId = await service.createTask(plan.id, draft)
    await service.saveReference(taskId, { kind: 'topic', topicId: child.id })
    await service.saveReference(taskId, { kind: 'url', title: 'Docs', url: 'https://example.com/docs' })
    await service.saveReference(taskId, { kind: 'resource', title: 'Runbook' })
    await expect(service.saveReference(taskId, { kind: 'topic', topicId: 'missing' })).rejects.toThrow('topic no longer exists')
    await expect(service.saveReference(taskId, { kind: 'url', title: 'Unsafe', url: 'javascript:alert(1)' })).rejects.toThrow('HTTP or HTTPS')
    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    const read = async () => (await reopened.list()).tasks.find(task => task.id === taskId)!.references
    const references = await read()
    expect(references).toMatchObject([
      { kind: 'topic', topicId: child.id },
      { kind: 'url', title: 'Docs', url: 'https://example.com/docs' },
      { kind: 'resource', title: 'Runbook' },
    ])
    await reopened.saveReference(taskId, { kind: 'resource', title: ' Updated ', url: 'https://example.com/guide' }, references[1]!.id)
    await reopened.changeTaskDetails(taskId, { kind: 'removeReference', id: references[2]!.id })
    await topicService.delete(child.id)
    expect(await read()).toEqual([{ id: references[1]!.id, kind: 'resource', title: 'Updated', url: 'https://example.com/guide' }])
  })

  it('persists environment, optional branch, and artifacts independently per implementation', async () => {
    const first = await create()
    const second = await create(aws)
    await service.updateImplementation(first.id, { environment: 'staging', branch: ' feature/ingest ' })
    await service.saveArtifact(first.id, { title: ' OpenAPI ', type: 'api_specification', url: 'https://example.com/openapi.json', description: ' API contract ' })
    await service.saveArtifact(second.id, { title: 'SQL', type: 'database_script' })
    await expect(service.saveArtifact(first.id, { title: 'Unsafe', type: 'other', url: 'file:///tmp/spec' })).rejects.toThrow('HTTP or HTTPS')
    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    const { implementations, artifacts: [api, sql] } = await reopened.list()
    expect(implementations).toMatchObject([
      { id: first.id, environment: 'staging', branch: 'feature/ingest' },
      { id: second.id, environment: 'development' },
    ])
    expect(implementations[1]?.branch).toBeUndefined()
    expect(api).toMatchObject({
      implementationId: first.id, title: 'OpenAPI', type: 'api_specification',
      url: 'https://example.com/openapi.json', description: 'API contract', createdAt: expect.any(String), updatedAt: expect.any(String),
    })
    await reopened.updateImplementation(first.id, { environment: 'production', branch: '' })
    await reopened.saveArtifact(first.id, { title: ' API guide ', type: 'documentation' }, api!.id)
    const updated = await service.list()
    expect(updated.implementations[0]).toMatchObject({ environment: 'production' })
    expect(updated.implementations[0]?.branch).toBeUndefined()
    expect(updated.artifacts[0]).toMatchObject({ id: api!.id, title: 'API guide', type: 'documentation', createdAt: api!.createdAt })
    expect(updated.artifacts[0]?.url).toBeUndefined()
    expect(updated.artifacts[0]?.description).toBeUndefined()
    await reopened.deleteArtifact(api!.id)
    expect((await service.list()).artifacts).toEqual([sql])
    await reopened.deleteProject(aws)
    expect((await service.list()).artifacts).toEqual([])
  })

  it('persists optional artifact task links within a project and clears them when tasks are removed', async () => {
    const plan = await create()
    const sameProject = await create(azure, child.id)
    const otherProject = await create(aws)
    const localTask = await service.createTask(plan.id, draft)
    const sharedTask = await service.createTask(sameProject.id, draft)
    const foreignTask = await service.createTask(otherProject.id, draft)
    const artifact = { title: 'Runbook', type: 'documentation' } as const
    await expect(service.saveArtifact(plan.id, { ...artifact, relatedTaskId: foreignTask })).rejects.toThrow('this project')
    await service.saveArtifact(plan.id, { ...artifact, relatedTaskId: sharedTask })
    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    const [saved] = (await reopened.list()).artifacts
    expect(saved).toMatchObject({ ...artifact, relatedTaskId: sharedTask })
    const readLink = async () => (await reopened.list()).artifacts[0]?.relatedTaskId
    await expect(reopened.saveArtifact(plan.id, { ...artifact, relatedTaskId: foreignTask }, saved!.id)).rejects.toThrow('this project')
    expect(await readLink()).toBe(sharedTask)
    await reopened.saveArtifact(plan.id, artifact, saved!.id)
    expect(await readLink()).toBeUndefined()
    await reopened.saveArtifact(plan.id, { ...artifact, relatedTaskId: localTask }, saved!.id)
    expect(await readLink()).toBe(localTask)
    await reopened.deleteTask(localTask)
    expect(await readLink()).toBeUndefined()
    await reopened.saveArtifact(plan.id, { ...artifact, relatedTaskId: sharedTask }, saved!.id)
    await reopened.deleteImplementation(sameProject.id)
    expect((await reopened.list()).artifacts[0]).toMatchObject({ ...artifact, id: saved!.id })
    expect(await readLink()).toBeUndefined()
  })

  it('adds safe defaults to existing version 3 records without rewriting on read', async () => {
    const plan = await create()
    const taskId = await service.createTask(plan.id, draft)
    await service.updateImplementation(plan.id, { status: 'in_progress', notes: '## Keep this decision' })
    const raw = JSON.parse(entries.get(TOPIC_STORAGE_KEY)!)
    delete raw.implementationData.implementations[0].environment
    delete raw.implementationData.tasks[0].criteria
    delete raw.implementationData.tasks[0].dependencyIds
    delete raw.implementationData.tasks[0].references
    delete raw.implementationData.artifacts
    const before = JSON.stringify(raw)
    entries.set(TOPIC_STORAGE_KEY, before)
    storage.setItem.mockClear()

    const reopened = new ImplementationService(new LocalStorageTopicRepository(() => storage))
    const migrated = await reopened.list()
    expect(migrated).toMatchObject({
      ...raw.implementationData,
      implementations: [{ ...raw.implementationData.implementations[0], environment: 'development' }],
      tasks: [{ ...raw.implementationData.tasks[0], criteria: [], dependencyIds: [], references: [] }],
      artifacts: [],
    })
    expect(entries.get(TOPIC_STORAGE_KEY)).toBe(before)
    expect(storage.setItem).not.toHaveBeenCalled()
    await reopened.addCriterion(taskId, 'Persist the migrated defaults')
    expect((await service.list()).implementations).toEqual(migrated.implementations)
    expect((await service.list()).tasks[0]?.criteria).toHaveLength(1)
  })
})
