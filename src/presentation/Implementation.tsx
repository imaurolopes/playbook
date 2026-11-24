import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type Modifier } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Check, ChevronDown, CircleAlert, CircleCheck, Code2, Database, Eye, ExternalLink, FileJson, FileText, GripVertical, Link2, Minus, Package, Pause, Pencil, Play, Plus, Trash2, Unlink } from 'lucide-react'
import type { ImplementationWorkspace, TaskChanges } from '../application/implementation-repository'
import type { ImplementationService } from '../application/implementation-service'
import {
  artifactTypes, orderedTasks, taskProgress, taskStatuses, webUrl,
  type AcceptanceCriterion, type ArtifactDetails, type ArtifactType, type ImplementationArtifact,
  type Project, type ReferenceDetails, type TaskReference,
  type ImplementationTask, type TaskStatus, type TopicImplementation,
} from '../domain/implementation'
import type { Topic } from '../domain/topic'
import { blockedByPrerequisites } from '../application/project-progress'
import { Markdown } from './markdown'
import { MarkdownEditor, MarkdownIndicator } from './MarkdownEditor'
import { projectPath, topicPath } from './navigation'

export function numberedTaskLabels(tasks: readonly Pick<ImplementationTask, 'id' | 'title'>[]) {
  return tasks.map((task, index) => [task.id, `${index + 1}. ${task.title}`] as const)
}

const taskLabels: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' }
const taskIcons = { todo: Minus, in_progress: Play, blocked: Pause, done: Check }
const artifactLabels: Record<ArtifactType, string> = {
  code: 'Code', documentation: 'Documentation', api_specification: 'API specification',
  collection: 'Collection', database_script: 'Database script', other: 'Other',
}
const artifactIcons = { code: Code2, documentation: FileText, api_specification: FileJson, collection: Package, database_script: Database, other: Link2 }

function TaskMark({ status }: { status: TaskStatus }) {
  const Icon = taskIcons[status]
  return <span className={`task-mark task-${status}`} aria-hidden="true"><Icon size={13} /></span>
}

function TaskBadge({ status, blockedByDependency }: { status: TaskStatus; blockedByDependency: boolean }) {
  const displayStatus = blockedByDependency ? 'blocked' : status
  return <span className={`task-badge task-${displayStatus}`}
    title={blockedByDependency ? 'Waiting for prerequisite tasks' : undefined}>{taskLabels[displayStatus]}</span>
}

const verticalDrag: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function useTaskSortRow(id: string, disabled: boolean) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver, activeIndex, overIndex } =
    useSortable({ id, disabled })
  const dropEdge = isOver && activeIndex >= 0 && activeIndex !== overIndex
    ? (activeIndex < overIndex ? 'after' : 'before')
    : undefined
  return {
    row: { ref: setNodeRef, 'data-dragging': isDragging || undefined, 'data-drop-edge': dropEdge,
      style: { transform: CSS.Translate.toString(transform), transition } },
    grip: { ref: setActivatorNodeRef, ...attributes, ...listeners },
  }
}

function SortableTaskRow({ task, blockedByDependency, index, expanded, canReorder, busy, onSelect, onEdit }: {
  task: ImplementationTask
  blockedByDependency: boolean
  index: number
  expanded: boolean
  canReorder: boolean
  busy: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  const { row, grip } = useTaskSortRow(task.id, !canReorder || busy)

  const statusId = useId()
  const status = blockedByDependency ? 'blocked' : task.status
  return <li className="implementation-task-row" {...row}>
    <button type="button" className="task-grip" {...grip}
      disabled={!canReorder} aria-label={`Reorder ${task.title}`} title={`Reorder ${task.title}`}>
      <GripVertical size={17} aria-hidden="true" />
    </button>
    <button className="implementation-task" type="button" aria-expanded={expanded}
      aria-controls="implementation-task-details" aria-describedby={statusId} onClick={onSelect}>
      <TaskMark status={status} />
      <span className="task-label">
        <span className="task-number">{index + 1}.</span>
        <span className="task-title" title={task.title}>{task.title}</span>
      </span>
      <ChevronDown className="task-chevron" size={15} aria-hidden="true" />
    </button>
    <button type="button" className="button icon-button task-row-edit" title="Edit task"
      aria-label={`Edit task: ${task.title}`} disabled={busy} onClick={onEdit}><Pencil size={16} aria-hidden="true" /></button>
    <span className="task-row-status" id={statusId}>
      <TaskBadge status={task.status} blockedByDependency={blockedByDependency} />
    </span>
  </li>
}

function SortableTaskList({ tasks, blockedTaskIds, expandedId, busy, onSelect, onEdit, onReorder }: {
  tasks: ImplementationTask[]
  blockedTaskIds: ReadonlySet<string>
  expandedId?: string
  busy: boolean
  onSelect: (id: string) => void
  onEdit: (task: ImplementationTask) => void
  onReorder: (id: string, targetId: string) => void
}) {
  return <TaskSortContext tasks={tasks} onReorder={onReorder}>
    <ol className="implementation-tasks">{tasks.map((task, index) => <SortableTaskRow key={task.id}
      task={task} blockedByDependency={blockedTaskIds.has(task.id)} index={index} expanded={expandedId === task.id} canReorder={tasks.length > 1} busy={busy}
      onSelect={() => onSelect(task.id)} onEdit={() => onEdit(task)} />)}</ol>
  </TaskSortContext>
}

export function TaskSortContext({ tasks, children, onReorder }: {
  tasks: readonly Pick<ImplementationTask, 'id' | 'title'>[]
  children: ReactNode
  onReorder: (id: string, targetId: string) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const title = (id: string | number) => tasks.find(task => task.id === id)?.title ?? 'Task'
  return <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalDrag]}
    accessibility={{
      screenReaderInstructions: { draggable: 'Press Space or Enter to pick up a task. Use the up and down arrow keys to move it, then press Space or Enter to drop it. Press Escape to cancel.' },
      announcements: {
        onDragStart: ({ active }) => `Picked up ${title(active.id)}.`,
        onDragOver: ({ active, over }) => over ? `${title(active.id)} is over position ${tasks.findIndex(task => task.id === over.id) + 1} of ${tasks.length}.` : undefined,
        onDragEnd: ({ active }) => `Dropped ${title(active.id)}.`,
        onDragCancel: ({ active }) => `Reordering ${title(active.id)} cancelled.`,
      },
    }}
    onDragEnd={({ active, over }) => {
      if (over && active.id !== over.id) onReorder(String(active.id), String(over.id))
    }}>
    <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>{children}</SortableContext>
  </DndContext>
}

function ImplementationNotice({ message, error = false }: { message: string; error?: boolean }) {
  const Icon = error ? CircleAlert : CircleCheck
  return <div className={message ? `implementation-notice${error ? ' is-error' : ''}` : 'sr-only'} role={error ? 'alert' : 'status'}>
    {message && <><Icon size={18} aria-hidden="true" /><span>{message}</span></>}
  </div>
}

type DialogState = { kind: 'project' } | { kind: 'task'; task?: ImplementationTask } |
  { kind: 'criterion'; taskId: string; criterion?: AcceptanceCriterion } |
  { kind: 'dependency'; taskId: string } |
  { kind: 'reference'; taskId: string; reference?: TaskReference } |
  { kind: 'artifact'; implementationId: string; artifact?: ImplementationArtifact } |
  { kind: 'confirm'; title: string; message: string; action: () => Promise<void>; submitLabel?: string; status?: string }

function errorMessage(problem: unknown) {
  return problem instanceof Error ? problem.message : 'Could not save changes. Please try again.'
}

export function ImplementationDialog({ title, submitLabel, destructive, className, children, onClose, onSubmit }: {
  title: string
  submitLabel: string
  destructive?: boolean
  className?: string
  children: ReactNode
  onClose: () => void
  onSubmit: (fields: FormData) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  useEffect(() => {
    if (error) dialog.current?.scrollTo({ top: 0 })
  }, [error])

  return <dialog ref={dialog} className={`panel delete-dialog implementation-dialog${className ? ' ' + className : ''}`} aria-labelledby={titleId}
    onClose={onClose} onCancel={event => { if (busy) event.preventDefault() }}>
    <header className="implementation-dialog-header"><h2 id={titleId}>{title}</h2></header>
    <form onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      const fields = new FormData(event.currentTarget)
      setBusy(true)
      setError('')
      try {
        await onSubmit(fields)
        dialog.current?.close()
        onClose()
      } catch (problem) {
        setError(errorMessage(problem))
      } finally {
        setBusy(false)
      }
    }}>
      <fieldset disabled={busy}>
        <div className="implementation-dialog-body">
          <ImplementationNotice message={error} error />
          {children}
        </div>
        <div className="implementation-dialog-actions">
          <button type="button" className="button" autoFocus={destructive} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className={`button ${destructive ? 'danger' : 'primary'}`}>{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </fieldset>
    </form>
  </dialog>
}

function fieldValue(fields: FormData, name: string) {
  return String(fields.get(name) ?? '')
}

export function ReferenceDialog({ topics, reference, onClose, onSave }: {
  topics: readonly Topic[]
  reference?: TaskReference
  onClose: () => void
  onSave: (input: ReferenceDetails) => Promise<void>
}) {
  const [kind, setKind] = useState<ReferenceDetails['kind']>(reference?.kind ?? 'topic')
  return <ImplementationDialog title={reference ? 'Edit reference' : 'Add reference'} submitLabel="Save" onClose={onClose} onSubmit={async fields => {
    if (kind === 'topic') await onSave({ kind, topicId: fieldValue(fields, 'topic') })
    else await onSave({ kind, title: fieldValue(fields, 'title'), url: fieldValue(fields, 'url') })
  }}>
    <div className="implementation-form-field">
      <label htmlFor="reference-type">Reference type</label>
      <select className="field" id="reference-type" value={kind} onChange={event => {
        const next = event.target.value
        if (next === 'topic' || next === 'url' || next === 'resource') setKind(next)
      }}><option value="topic">Playbook topic</option><option value="url">External URL</option><option value="resource">Other resource</option></select>
    </div>
    {kind === 'topic' ? <div className="implementation-form-field">
      <label htmlFor="reference-topic">Topic</label>
      <select className="field" id="reference-topic" name="topic" required defaultValue={reference?.kind === 'topic' ? reference.topicId : ''}>
        <option value="" disabled>Select a topic</option>
        {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
      </select>
    </div> : <>
      <div className="implementation-form-field">
        <label htmlFor="reference-title">Title</label>
        <input className="field" id="reference-title" name="title" required defaultValue={reference?.kind !== 'topic' ? reference?.title : ''} />
      </div>
      <div className="implementation-form-field">
        <label htmlFor="reference-url">{kind === 'resource' ? 'URL (optional)' : 'URL'}</label>
        <input className="field" id="reference-url" name="url" type="url" required={kind === 'url'} defaultValue={reference?.kind !== 'topic' ? reference?.url : ''} />
      </div>
    </>}
  </ImplementationDialog>
}

function ArtifactDialog({ artifact, taskGroups, onClose, onSave }: {
  artifact?: ImplementationArtifact
  taskGroups: { planId: string; topicTitle: string; labels: ReturnType<typeof numberedTaskLabels> }[]
  onClose: () => void
  onSave: (input: ArtifactDetails) => Promise<void>
}) {
  return <ImplementationDialog title={artifact ? 'Edit artifact' : 'Add artifact'} submitLabel="Save" onClose={onClose} onSubmit={async fields => {
    const type = artifactTypes.find(value => value === fieldValue(fields, 'type'))
    if (!type) throw new Error('Choose an artifact type.')
    await onSave({
      title: fieldValue(fields, 'title'), type, relatedTaskId: fieldValue(fields, 'relatedTaskId'),
      url: fieldValue(fields, 'url'), description: fieldValue(fields, 'description'),
    })
  }}>
    <div className="implementation-form-field">
      <label htmlFor="artifact-title">Title</label>
      <input className="field" id="artifact-title" name="title" required autoFocus defaultValue={artifact?.title} />
    </div>
    <div className="implementation-form-field">
      <label htmlFor="artifact-type">Type</label>
      <select className="field" id="artifact-type" name="type" defaultValue={artifact?.type ?? 'code'}>
        {artifactTypes.map(type => <option key={type} value={type}>{artifactLabels[type]}</option>)}
      </select>
    </div>
    <div className="implementation-form-field">
      <label htmlFor="artifact-task">Related Task (optional)</label>
      <select className="field" id="artifact-task" name="relatedTaskId" defaultValue={artifact?.relatedTaskId ?? ''}>
        <option value="">No related task</option>
        {artifact?.relatedTaskId && !taskGroups.some(group => group.labels.some(([id]) => id === artifact.relatedTaskId)) &&
          <option value={artifact.relatedTaskId}>Unavailable task</option>}
        {taskGroups.map(({ planId, topicTitle, labels }) => <optgroup key={planId} label={topicTitle}>
          {labels.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </optgroup>)}
      </select>
    </div>
    <div className="implementation-form-field">
      <label htmlFor="artifact-url">URL (optional)</label>
      <input className="field" id="artifact-url" name="url" type="url" defaultValue={artifact?.url} />
    </div>
    <div className="implementation-form-field">
      <label htmlFor="artifact-description">Description (optional)</label>
      <textarea className="field" id="artifact-description" name="description" rows={3} defaultValue={artifact?.description} />
    </div>
  </ImplementationDialog>
}

export function ResourceLink({ url, title }: { url?: string; title: string }) {
  const href = url && webUrl(url)
  return href ? <a className="implementation-resource-link" href={href} target="_blank" rel="noopener noreferrer">
    {title} <ExternalLink size={13} aria-hidden="true" />
  </a> : <span>{title}</span>
}

function DetailAction({ label, icon: Icon, onClick, disabled }: {
  label: string
  icon: typeof Pencil
  onClick: () => void
  disabled?: boolean
}) {
  return <button type="button" className="button icon-button detail-action" title={label} aria-label={label} disabled={disabled} onClick={onClick}><Icon size={14} /></button>
}

export function ProjectDialog({ project, onClose, onSave }: { project?: Project; onClose: () => void; onSave: (name: string, description: string) => Promise<void> }) {
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  return <ImplementationDialog title={project ? 'Edit project' : 'New project'} submitLabel={project ? 'Save' : 'Create project'}
    onClose={onClose} onSubmit={() => onSave(name, description)}>
    <div className="implementation-form-field">
      <label htmlFor="implementation-project-name">Project name</label>
      <input id="implementation-project-name" className="field" autoFocus required value={name} onChange={event => setName(event.target.value)} />
    </div>
    <div className="implementation-form-field">
      <label htmlFor="implementation-project-description">Description</label>
      <textarea id="implementation-project-description" className="field" rows={3} value={description} onChange={event => setDescription(event.target.value)} />
    </div>
  </ImplementationDialog>
}

function TaskDialog({ task, onClose, onSave }: { task?: ImplementationTask; onClose: () => void; onSave: (changes: TaskChanges) => Promise<void> }) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo')
  return <ImplementationDialog className="task-editor-dialog" title={task ? 'Edit task' : 'New task'} submitLabel={task ? 'Save' : 'Add task'} onClose={onClose}
    onSubmit={() => onSave({ title, description, status })}>
    <div className="implementation-form-field">
      <label htmlFor="implementation-task-title">Task title</label>
      <input id="implementation-task-title" className="field" autoFocus required value={title} onChange={event => setTitle(event.target.value)} />
    </div>
    <div className="implementation-form-field">
      <label htmlFor="implementation-task-description">Description</label>
      <textarea id="implementation-task-description" className="field" rows={3} value={description} onChange={event => setDescription(event.target.value)} />
    </div>
    <div className="implementation-form-field">
      <label htmlFor="implementation-task-status">Task status</label>
      <select id="implementation-task-status" className="field" value={status} onChange={event => {
        const next = taskStatuses.find(value => value === event.target.value)
        if (next) setStatus(next)
      }}>{taskStatuses.map(value => <option key={value} value={value}>{taskLabels[value]}</option>)}</select>
    </div>
  </ImplementationDialog>
}

function DecisionNotes({ implementation, busy, onSave }: {
  implementation: TopicImplementation
  busy: boolean
  onSave: (notes: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [preview, setPreview] = useState(false)
  const [draft, setDraft] = useState(implementation.notes)
  return <section className="panel implementation-panel">
    <div className="implementation-heading">
      <div className="context-editor-title"><h2>Technical decisions</h2>{editing && <MarkdownIndicator />}</div>
      {!editing && <button className="button" disabled={busy} onClick={() => {
        setDraft(implementation.notes)
        setPreview(false)
        setEditing(true)
      }}><Pencil size={15} /> Edit notes</button>}
    </div>
    {editing ? <>
      <div className="segmented notes-mode" aria-label="Decision notes editor mode">
        <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}><Pencil size={15} /> Edit</button>
        <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}><Eye size={16} /> Preview</button>
      </div>
      <MarkdownEditor label="Technical decision notes" placeholder="Document technical decisions in Markdown..." rows={6}
        hidden={preview} value={draft} onChange={setDraft} />
      {preview && <div className="editor-preview">{draft.trim() ? <Markdown content={draft} /> : <p className="muted">No notes to preview.</p>}</div>}
      <div className="editor-actions">
        <button className="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
        <button className="button primary" disabled={busy} onClick={async () => { if (await onSave(draft)) setEditing(false) }}>Save</button>
      </div>
    </> : implementation.notes.trim() ? <Markdown content={implementation.notes} /> : <p className="muted">No technical decisions have been recorded.</p>}
  </section>
}

export function Implementation({ topic, topics, service }: { topic: Topic; topics: readonly Topic[]; service: ImplementationService }) {
  const [data, setData] = useState<ImplementationWorkspace>()
  const [query, setQuery] = useSearchParams()
  const [dialog, setDialog] = useState<DialogState>()
  const [taskId, setTaskId] = useState<string>()
  const [pendingOrder, setPendingOrder] = useState<{ implementationId: string; tasks: ImplementationTask[] }>()
  const [collapsed, setCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    service.list().then(
      result => { if (active) setData(result) },
      problem => { if (active) setError(errorMessage(problem)) },
    )
    return () => { active = false }
  }, [service, retry])

  const topicImplementations = data?.implementations.filter(item => item.topicId === topic.id)
  const defaultProjectId = topicImplementations?.[0]?.projectId
  const projects = data?.projects
  const project = projects?.find(item => item.id === query.get('project')) ?? projects?.find(item => item.id === defaultProjectId)
  const implementation = topicImplementations?.find(item => item.projectId === project?.id)
  const tasks = implementation
    ? (pendingOrder?.implementationId === implementation.id ? pendingOrder.tasks : orderedTasks(data?.tasks ?? [], implementation.id))
    : []
  const blockedTaskIds = blockedByPrerequisites(tasks)
  const artifacts = data?.artifacts.filter(item => item.implementationId === implementation?.id) ?? []
  const selectedTask = tasks.find(task => task.id === (taskId ?? query.get('task'))) ?? tasks[0]
  const taskIndex = selectedTask ? tasks.indexOf(selectedTask) : -1
  const progress = taskProgress(tasks)
  const criteria = [...(selectedTask?.criteria ?? [])].sort((a, b) => a.order - b.order)
  const dependencyOptions = tasks.filter(task => task.id !== selectedTask?.id && !selectedTask?.dependencyIds.includes(task.id))
  const taskLabelsById = new Map(numberedTaskLabels(tasks))
  const artifactTaskGroups = (data?.implementations ?? []).filter(plan => plan.projectId === project?.id).flatMap(plan => {
    const labels = numberedTaskLabels(plan.id === implementation?.id ? tasks : orderedTasks(data?.tasks ?? [], plan.id))
    return labels.length ? [{ planId: plan.id, topicTitle: topics.find(item => item.id === plan.topicId)?.title ?? 'Topic', labels }] : []
  })
  const artifactTaskLabels = new Map(artifactTaskGroups.flatMap(group => group.labels))

  function confirmRemoval(label: string, action: () => Promise<void>) {
    setDialog({ kind: 'confirm', title: `Delete ${label}?`, message: `This ${label} will be permanently deleted.`, action })
  }

  function selectProject(id: string, replace = false) {
    setQuery(params => {
      params.delete('task')
      if (id) params.set('project', id)
      else params.delete('project')
      return params
    }, { replace })
    setTaskId(undefined)
    setCollapsed(false)
    setMessage('')
    setError('')
  }

  async function commit(action: () => Promise<void>, status: string) {
    setError('')
    setMessage('')
    await action()
    setData(await service.list())
    setMessage(status)
  }

  async function run(action: () => Promise<void>, status: string) {
    if (busy) return false
    setBusy(true)
    try {
      await commit(action, status)
      return true
    } catch (problem) {
      setError(errorMessage(problem))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function reorderTasks(id: string, targetId: string) {
    if (busy || !implementation) return
    const from = tasks.findIndex(task => task.id === id)
    const to = tasks.findIndex(task => task.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    setTaskId(selectedTask?.id)
    setPendingOrder({ implementationId: implementation.id, tasks: arrayMove(tasks, from, to) })
    await run(() => service.moveTaskTo(id, targetId), 'Task order saved.')
    setPendingOrder(undefined)
  }

  if (!data) return error
    ? <section className="panel placeholder"><h2>Could not load implementations</h2><ImplementationNotice message={error} error />
      <button className="button" onClick={() => { setError(''); setRetry(value => value + 1) }}>Try again</button></section>
    : <p className="placeholder" role="status">Loading implementations…</p>

  return <div className="implementation">
    <section className="implementation-toolbar" aria-labelledby="implementation-project-label">
      <h2 id="implementation-project-label">Project</h2>
      <div className="implementation-project-control">
        <select className="field" aria-labelledby="implementation-project-label" disabled={!data.projects.length || busy}
          value={project?.id ?? ''} onChange={event => selectProject(event.target.value)}>
          {!project && <option value="" disabled>{data.projects.length ? 'Select a project' : 'No projects available'}</option>}
          {data.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {project && !busy
          ? <Link className="button icon-button" aria-label="Open project" title="Open project" to={projectPath(project.id)}>
            <ExternalLink size={16} aria-hidden="true" />
          </Link>
          : <button type="button" className="button icon-button" aria-label="Open project" title="Open project" disabled>
            <ExternalLink size={16} aria-hidden="true" />
          </button>}
      </div>
      <button className="button" disabled={busy} onClick={() => setDialog({ kind: 'project' })}><Plus size={16} /> New project</button>
    </section>
    <section className="implementation-toolbar" aria-labelledby="implementation-controls-heading">
      <h2 id="implementation-controls-heading">Implementation</h2>
      {implementation && project ?
        <button className="button implementation-remove" title="Remove implementation" aria-label="Remove implementation" disabled={busy} onClick={() => setDialog({
          kind: 'confirm', title: 'Remove implementation?', submitLabel: 'Remove', status: 'Implementation removed.',
          message: `Remove this topic from "${project.name}"? Its implementation, tasks, artifacts, and notes will be permanently deleted.`,
          action: async () => {
            await service.deleteImplementation(implementation.id)
            selectProject(project.id, true)
          },
        })}><Unlink size={17} aria-hidden="true" /> Remove</button>
      : project ? <>
        <p className="muted">Not implemented</p>
        <button className="button primary" disabled={busy} onClick={() => void run(async () => {
          await service.createImplementation(topic.id, project.id)
        }, 'Implementation associated.')}>Add</button>
      </> : <p className="muted">Select or create a project to implement this topic.</p>}
    </section>
    <ImplementationNotice message={error} error />
    <ImplementationNotice message={message} />
    {implementation && <>
      <div className="implementation-grid">
        <section className="panel implementation-panel implementation-plan">
          <div className="implementation-heading"><h2>Implementation plan</h2>
            <button className="button primary" disabled={busy} onClick={() => setDialog({ kind: 'task' })}><Plus size={16} /> Add task</button>
          </div>
          {!tasks.length ? <p className="muted">No tasks yet. Add a task to start planning this implementation.</p>
            : <SortableTaskList key={implementation.id} tasks={tasks} blockedTaskIds={blockedTaskIds} expandedId={collapsed ? undefined : selectedTask?.id}
              busy={busy} onEdit={task => setDialog({ kind: 'task', task })} onReorder={(id, targetId) => void reorderTasks(id, targetId)} onSelect={id => {
                setCollapsed(selectedTask?.id === id && !collapsed)
                setTaskId(id)
              }} />}
        </section>
        <section className="panel implementation-panel implementation-progress">
          <h2>Implementation progress</h2>
          <div className="progress-summary">
            <div className="progress-ring" role="progressbar" aria-label="Tasks completed"
              aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle className="progress-track" cx="50" cy="50" r="45" />
                {progress.percent > 0 && <circle className="progress-value" cx="50" cy="50" r="45"
                  pathLength="100" strokeDasharray={`${progress.percent} 100`} />}
              </svg>
              <span>{progress.percent}%</span>
            </div>
            <ul>
              <li><TaskMark status="done" /><span><strong>{progress.counts.done}</strong> Completed</span></li>
              <li><TaskMark status="in_progress" /><span><strong>{progress.counts.in_progress}</strong> In progress</span></li>
              <li><TaskMark status="todo" /><span><strong>{progress.counts.todo + progress.counts.blocked}</strong> Pending
                {progress.counts.blocked > 0 && <small className="muted"> ({progress.counts.blocked} blocked)</small>}</span></li>
            </ul>
          </div>
        </section>
        <section className="panel implementation-panel implementation-details">
          <div className="implementation-heading"><h2>Task details</h2>
            {!collapsed && selectedTask && <div className="task-action-group">
              {selectedTask.status !== 'done' && <button className="button mark-done" disabled={busy} onClick={() => void run(() => service.updateTask(selectedTask.id, {
                title: selectedTask.title, description: selectedTask.description, status: 'done',
              }), 'Task completed.')}><Check size={16} /> Mark as completed</button>}
              <button className="button" disabled={busy} onClick={() => setDialog({ kind: 'task', task: selectedTask })}><Pencil size={15} aria-hidden="true" /> Edit</button>
              <button className="button icon-button task-delete" aria-label="Delete task" title="Delete task" disabled={busy} onClick={() => setDialog({
                kind: 'confirm', title: 'Delete task?', message: `“${selectedTask.title}” will be permanently deleted.`,
                action: () => service.deleteTask(selectedTask.id),
              })}><Trash2 size={16} aria-hidden="true" /></button>
            </div>}
          </div>
          <div id="implementation-task-details" hidden={collapsed || !selectedTask}>
          {selectedTask && <>
            <div className="task-detail-summary">
              <h3 className="task-detail-title"><Code2 className="purple" size={19} /> {selectedTask.title}</h3>
              <TaskBadge status={selectedTask.status} blockedByDependency={blockedTaskIds.has(selectedTask.id)} />
            </div>
            <p className={`task-description${selectedTask.description ? '' : ' muted'}`}>{selectedTask.description || 'No task description.'}</p>
            <div className="task-context">
              <section className="task-criteria">
                <h4>Acceptance criteria</h4>
                {!!criteria.length && <ul className="implementation-detail-list">{criteria.map(criterion => <li key={criterion.id} className="implementation-detail-row">
                  <label className="criterion-label"><input type="checkbox" checked={criterion.completed} disabled={busy} onChange={event => {
                    const completed = event.target.checked
                    void run(() => service.updateCriterion(selectedTask.id, criterion.id, { completed }), 'Criterion saved.')
                  }} /> <span>{criterion.description}</span></label>
                  <div className="implementation-detail-actions">
                    <DetailAction label="Edit criterion" icon={Pencil} disabled={busy} onClick={() => setDialog({ kind: 'criterion', taskId: selectedTask.id, criterion })} />
                    <DetailAction label="Delete criterion" icon={Trash2} disabled={busy}
                      onClick={() => confirmRemoval('criterion', () => service.changeTaskDetails(selectedTask.id, { kind: 'removeCriterion', id: criterion.id }))} />
                  </div>
                </li>)}</ul>}
              </section>
                {!!selectedTask.dependencyIds.length && <section>
                  <h4>Dependencies</h4>
                  <ul className="implementation-detail-list">{tasks.filter(task => selectedTask.dependencyIds.includes(task.id)).map(task => <li key={task.id} className="implementation-detail-row">
                    <button type="button" className="implementation-resource-link" disabled={busy} onClick={() => {
                      setTaskId(task.id)
                      setCollapsed(false)
                    }}><Link2 size={14} aria-hidden="true" /> {taskLabelsById.get(task.id)}</button>
                    <DetailAction label="Remove dependency" icon={Trash2} disabled={busy}
                      onClick={() => void run(() => service.changeTaskDetails(selectedTask.id, { kind: 'removeDependency', id: task.id }), 'Dependency removed.')} />
                  </li>)}</ul>
                </section>}
                {!!selectedTask.references.length && <section>
                  <h4>References</h4>
                  <ul className="implementation-detail-list">{selectedTask.references.map(reference => <li key={reference.id} className="implementation-detail-row">
                    {reference.kind === 'topic'
                      ? <Link className="implementation-resource-link" to={topicPath(reference.topicId)}>{topics.find(item => item.id === reference.topicId)?.title ?? 'Referenced topic'}</Link>
                      : <ResourceLink url={reference.url} title={reference.title} />}
                    <div className="implementation-detail-actions">
                      <DetailAction label="Edit reference" icon={Pencil} disabled={busy} onClick={() => setDialog({ kind: 'reference', taskId: selectedTask.id, reference })} />
                      <DetailAction label="Delete reference" icon={Trash2} disabled={busy}
                        onClick={() => confirmRemoval('reference', () => service.changeTaskDetails(selectedTask.id, { kind: 'removeReference', id: reference.id }))} />
                    </div>
                  </li>)}</ul>
                </section>}
            </div>
            <footer className="task-controls">
              <div className="task-action-group">
                <button type="button" className="button" disabled={busy} onClick={() => setDialog({ kind: 'criterion', taskId: selectedTask.id })}><Plus size={14} /> Add criterion</button>
                <button type="button" className="button" disabled={busy || !dependencyOptions.length}
                  title={dependencyOptions.length ? undefined : 'No other tasks available'}
                  onClick={() => setDialog({ kind: 'dependency', taskId: selectedTask.id })}><Plus size={14} /> Add dependency</button>
                <button type="button" className="button" disabled={busy} onClick={() => setDialog({ kind: 'reference', taskId: selectedTask.id })}><Plus size={14} /> Add reference</button>
              </div>
              <div className="task-action-group">
                <button className="button icon-button" aria-label="Move task up" title="Move task up" disabled={busy || taskIndex === 0}
                  onClick={() => { const target = tasks[taskIndex - 1]; if (target) void reorderTasks(selectedTask.id, target.id) }}><ArrowUp size={17} /></button>
                <button className="button icon-button" aria-label="Move task down" title="Move task down" disabled={busy || taskIndex === tasks.length - 1}
                  onClick={() => { const target = tasks[taskIndex + 1]; if (target) void reorderTasks(selectedTask.id, target.id) }}><ArrowDown size={17} /></button>
              </div>
            </footer>
          </>}
          </div>
          {(collapsed || !selectedTask) && <p className="muted">{tasks.length ? 'Select a task to view its details.' : 'Task details appear here after you add a task.'}</p>}
        </section>
        <section className="panel implementation-panel implementation-artifacts" aria-labelledby="implementation-artifacts-title">
          <h2 id="implementation-artifacts-title">Artifacts and resources</h2>
          {artifacts.length ? <ul className="implementation-detail-list artifact-list">{artifacts.map(artifact => {
            const Icon = artifactIcons[artifact.type]
            const relatedTask = artifact.relatedTaskId && artifactTaskLabels.get(artifact.relatedTaskId)
            return <li key={artifact.id} className="implementation-detail-row">
              <Icon className="purple" size={17} aria-hidden="true" />
              <div className="artifact-details">
                <ResourceLink url={artifact.url} title={artifact.title} />
                <small className="muted">{artifactLabels[artifact.type]}</small>
                {relatedTask && <small className="muted">Related Task: {relatedTask}</small>}
                {artifact.description && <p>{artifact.description}</p>}
              </div>
              <div className="implementation-detail-actions">
                <DetailAction label="Edit artifact" icon={Pencil} disabled={busy} onClick={() => setDialog({ kind: 'artifact', implementationId: implementation.id, artifact })} />
                <DetailAction label="Delete artifact" icon={Trash2} disabled={busy} onClick={() => confirmRemoval('artifact', () => service.deleteArtifact(artifact.id))} />
              </div>
            </li>
          })}</ul> : <p className="muted artifact-caption">No artifacts yet.</p>}
          <button className="button artifact-add" disabled={busy} onClick={() => setDialog({ kind: 'artifact', implementationId: implementation.id })}><Plus size={17} /> Add artifact</button>
        </section>
      </div>
      <DecisionNotes key={implementation.id} implementation={implementation} busy={busy}
          onSave={notes => run(() => service.updateImplementation(implementation.id, { notes }), 'Technical decisions saved.')} />
    </>}
    {dialog?.kind === 'project' && <ProjectDialog onClose={() => setDialog(undefined)}
      onSave={(name, description) => commit(async () => {
        const created = await service.createProject(name, description, topic.id)
        selectProject(created.id)
      }, 'Project and implementation created.')} />}
    {dialog?.kind === 'task' && implementation && <TaskDialog task={dialog.task} onClose={() => setDialog(undefined)} onSave={changes => commit(async () => {
      if (dialog.task) await service.updateTask(dialog.task.id, changes)
      else {
        setTaskId(await service.createTask(implementation.id, changes))
        setCollapsed(false)
      }
    }, dialog.task ? 'Task saved.' : 'Task added.')} />}
    {dialog?.kind === 'criterion' && <ImplementationDialog title={dialog.criterion ? 'Edit criterion' : 'Add criterion'} submitLabel="Save"
      onClose={() => setDialog(undefined)} onSubmit={fields => commit(() => {
        const description = fieldValue(fields, 'description')
        return dialog.criterion
          ? service.updateCriterion(dialog.taskId, dialog.criterion.id, { description })
          : service.addCriterion(dialog.taskId, description)
      }, 'Criterion saved.')}>
      <div className="implementation-form-field">
        <label htmlFor="criterion-description">Description</label>
        <textarea className="field" id="criterion-description" name="description" autoFocus required rows={3} defaultValue={dialog.criterion?.description} />
      </div>
    </ImplementationDialog>}
    {dialog?.kind === 'dependency' && <ImplementationDialog title="Add dependency" submitLabel="Add dependency" onClose={() => setDialog(undefined)}
      onSubmit={fields => commit(() => service.changeTaskDetails(dialog.taskId, { kind: 'addDependency', id: fieldValue(fields, 'task') }), 'Dependency added.')}>
      <div className="implementation-form-field">
        <label htmlFor="dependency-task">Depends on</label>
        <select className="field" id="dependency-task" name="task" autoFocus required defaultValue="">
          <option value="" disabled>Select a task</option>
          {dependencyOptions.map(task => <option key={task.id} value={task.id}>{taskLabelsById.get(task.id)}</option>)}
        </select>
      </div>
    </ImplementationDialog>}
    {dialog?.kind === 'reference' && <ReferenceDialog topics={topics} reference={dialog.reference} onClose={() => setDialog(undefined)}
      onSave={input => commit(() => service.saveReference(dialog.taskId, input, dialog.reference?.id), 'Reference saved.')} />}
    {dialog?.kind === 'artifact' && <ArtifactDialog artifact={dialog.artifact} taskGroups={artifactTaskGroups} onClose={() => setDialog(undefined)}
      onSave={input => commit(() => service.saveArtifact(dialog.implementationId, input, dialog.artifact?.id), 'Artifact saved.')} />}
    {dialog?.kind === 'confirm' && <ImplementationDialog title={dialog.title} submitLabel={dialog.submitLabel ?? 'Delete'} destructive
      onClose={() => setDialog(undefined)} onSubmit={() => commit(dialog.action, dialog.status ?? 'Deleted.')}><p>{dialog.message}</p></ImplementationDialog>}
  </div>
}
