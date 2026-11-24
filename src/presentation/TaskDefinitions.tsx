import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { arrayMove } from '@dnd-kit/sortable'
import { ArrowDown, ArrowUp, GripVertical, Info, Pencil, Plus, Square, Trash2 } from 'lucide-react'
import type { ImplementationService } from '../application/implementation-service'
import type { TaskDefinition, TaskReference } from '../domain/implementation'
import type { Topic } from '../domain/topic'
import { ImplementationDialog, numberedTaskLabels, ReferenceDialog, ResourceLink, TaskSortContext, useTaskSortRow } from './Implementation'
import { Markdown } from './markdown'
import { topicPath } from './navigation'

function resizeCriterion(field: HTMLTextAreaElement) {
  field.style.height = 'auto'
  field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`
}

function CriterionField({ id, description, index }: { id: string; description: string; index: number }) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const field = fieldRef.current
    if (!field) return
    resizeCriterion(field)
    let width = field.offsetWidth
    const observer = new ResizeObserver(() => {
      if (field.offsetWidth === width) return
      width = field.offsetWidth
      resizeCriterion(field)
    })
    observer.observe(field)
    return () => observer.disconnect()
  }, [])

  return <label className="task-criterion-field">
    <span className="muted" aria-hidden="true">{index + 1}.</span>
    <textarea ref={fieldRef} className="field" name={id} defaultValue={description} required rows={1}
      aria-label={`Criterion ${index + 1}`} onInput={event => resizeCriterion(event.currentTarget)}
      placeholder="Describe a verifiable condition that demonstrates successful implementation." />
  </label>
}

function DefinitionRow({ task, index, count, selected, busy, onSelect, onMove }: {
  task: TaskDefinition
  index: number
  count: number
  selected: boolean
  busy: boolean
  onSelect: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const { row, grip } = useTaskSortRow(task.id, busy || count < 2)
  return <li className="implementation-task-row definition-task-row" {...row}>
    <button type="button" className="task-grip" {...grip} disabled={busy || count < 2}
      aria-label={`Reorder ${task.title}`} title={`Reorder ${task.title}`}>
      <GripVertical size={17} aria-hidden="true" />
    </button>
    <button type="button" className="implementation-task" aria-pressed={selected} aria-controls="knowledge-task-details" onClick={onSelect}>
      <span className="task-label"><span className="task-number">{index + 1}.</span><span className="task-title" title={task.title}>{task.title}</span></span>
    </button>
    <button type="button" className="button icon-button detail-action task-move" disabled={busy || index === 0}
      aria-label={`Move ${task.title} up`} title="Move up" onClick={() => onMove(-1)}><ArrowUp size={16} aria-hidden="true" /></button>
    <button type="button" className="button icon-button detail-action task-move" disabled={busy || index === count - 1}
      aria-label={`Move ${task.title} down`} title="Move down" onClick={() => onMove(1)}><ArrowDown size={16} aria-hidden="true" /></button>
  </li>
}

export function TaskDefinitions({ topic, topics, service }: { topic: Topic; topics: readonly Topic[]; service: ImplementationService }) {
  const [definitions, setDefinitions] = useState<TaskDefinition[]>()
  const [selectedId, setSelectedId] = useState<string>()
  const [draft, setDraft] = useState<TaskDefinition>()
  const [deleting, setDeleting] = useState<TaskDefinition>()
  const [referenceEdit, setReferenceEdit] = useState<{ task: TaskDefinition; reference?: TaskReference }>()
  const [referenceDelete, setReferenceDelete] = useState<{ task: TaskDefinition; reference: TaskReference }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const criteriaHintId = useId()

  function forTopic(items: TaskDefinition[]) {
    return items.filter(item => item.topicId === topic.id).sort((a, b) => a.order - b.order)
  }

  useEffect(() => {
    let active = true
    service.list().then(data => {
      if (active) setDefinitions((data.taskDefinitions ?? []).filter(item => item.topicId === topic.id).sort((a, b) => a.order - b.order))
    }, problem => { if (active) setError(String(problem)) })
    return () => { active = false }
  }, [service, topic.id])

  async function refresh() {
    setDefinitions(forTopic((await service.list()).taskDefinitions ?? []))
  }

  async function move(id: string, destination: -1 | 1 | string) {
    if (busy || !definitions) return
    const from = definitions.findIndex(task => task.id === id)
    const to = typeof destination === 'string' ? definitions.findIndex(task => task.id === destination) : from + destination
    if (from < 0 || to < 0 || to >= definitions.length || from === to) return
    setSelectedId(selected?.id)
    setBusy(true)
    setError('')
    setDefinitions(arrayMove(definitions, from, to).map((task, index) => ({ ...task, order: definitions[index]!.order })))
    try {
      await service.moveTaskDefinition(topic.id, id, destination)
    } catch (problem) {
      setDefinitions(definitions)
      setError(problem instanceof Error ? problem.message : String(problem))
    } finally {
      setBusy(false)
    }
  }

  const selected = definitions?.find(item => item.id === selectedId) ?? definitions?.[0]
  const labels = new Map(numberedTaskLabels(definitions ?? []))

  function add() {
    setDraft({
      id: crypto.randomUUID(), topicId: topic.id, title: '', description: '', order: 0, createdAt: '', updatedAt: '',
      criteria: [], dependencyIds: [], references: [],
    })
  }

  return <div className="implementation">
    {error && <p role="alert" className="error">{error}</p>}
    <section className="panel implementation-panel">
      <div className="implementation-heading">
        <h2>Checklist</h2>
        <button className="button primary" disabled={!definitions || busy} onClick={add}><Plus size={16} aria-hidden="true" /> Add</button>
      </div>
      {definitions?.length ? <TaskSortContext tasks={definitions} onReorder={(id, targetId) => void move(id, targetId)}>
        <ol className="implementation-tasks" aria-label="Implementation tasks">{definitions.map((task, index) => <DefinitionRow key={task.id}
          task={task} index={index} count={definitions.length} selected={selected?.id === task.id} busy={busy}
          onSelect={() => setSelectedId(task.id)} onMove={direction => void move(task.id, direction)} />)}</ol>
      </TaskSortContext> : <p className="muted">{definitions ? 'No tasks yet.' : 'Loading tasks…'}</p>}
    </section>
    {selected && <section id="knowledge-task-details" className="panel implementation-panel">
      <div className="implementation-heading"><h2>{selected.title}</h2><div className="task-action-group">
        <button className="button" disabled={busy} onClick={() => setDraft(structuredClone(selected))}><Pencil size={16} aria-hidden="true" /> Edit</button>
        <button className="button icon-button" disabled={busy} aria-label="Delete task" title="Delete task"
          onClick={() => setDeleting(selected)}><Trash2 size={16} aria-hidden="true" /></button>
      </div></div>
      <div className="task-context definition-task-details">
        <section><h3>Description</h3>
          {selected.description ? <Markdown content={selected.description} /> : <p className="muted">No implementation instructions.</p>}
        </section>
        <section><h3>Acceptance criteria
          <span className="criterion-info" tabIndex={0} aria-label="About acceptance criteria" aria-describedby={criteriaHintId}>
            <Info size={15} aria-hidden="true" />
            <span className="criterion-tooltip" id={criteriaHintId} role="tooltip">Conditions that must be satisfied for the task to be considered successfully implemented.</span>
          </span>
        </h3>{selected.criteria.length
          ? <ul className="implementation-detail-list">{selected.criteria.map(item => <li className="implementation-detail-row definition-criterion" key={item.id}>
            <Square size={15} className="muted" aria-hidden="true" />
            <span>{item.description}</span>
          </li>)}</ul>
          : <p className="muted">No acceptance criteria.</p>}</section>
        {selected.dependencyIds.length > 0 && <section><h3>Dependencies</h3><ul className="implementation-detail-list">
          {selected.dependencyIds.map(id => <li key={id} className="implementation-detail-row">
            <button className="implementation-resource-link" onClick={() => setSelectedId(id)}>{labels.get(id)}</button>
          </li>)}
        </ul></section>}
        <section><h3>References</h3><ul className="implementation-detail-list">
          {selected.references.map(reference => <li key={reference.id} className="implementation-detail-row">
            {reference.kind === 'topic'
              ? <Link className="implementation-resource-link" to={topicPath(reference.topicId)}>{topics.find(item => item.id === reference.topicId)?.title ?? 'Unavailable topic'}</Link>
              : <ResourceLink url={reference.url} title={reference.title} />}
            <div className="implementation-detail-actions">
              <button className="button icon-button detail-action" aria-label="Edit reference" title="Edit reference"
                onClick={() => setReferenceEdit({ task: selected, reference })}><Pencil size={15} aria-hidden="true" /></button>
              <button className="button icon-button detail-action" aria-label="Delete reference" title="Delete reference"
                onClick={() => setReferenceDelete({ task: selected, reference })}><Trash2 size={15} aria-hidden="true" /></button>
            </div>
          </li>)}
        </ul></section>
      </div>
      <footer className="task-controls">
        <div className="task-action-group">
          <button className="button" onClick={() => setReferenceEdit({ task: selected })}><Plus size={16} aria-hidden="true" /> Add reference</button>
        </div>
      </footer>
    </section>}
    {draft && <ImplementationDialog className="task-editor-dialog" title={draft.order ? 'Edit task' : 'Add task'} submitLabel="Save"
      onClose={() => setDraft(undefined)} onSubmit={async fields => {
        await service.saveTaskDefinition({
          ...draft, title: String(fields.get('title') ?? ''), description: String(fields.get('description') ?? ''),
          dependencyIds: fields.getAll('dependencies').map(String),
          criteria: draft.criteria.map((item, index) => ({ ...item, order: index + 1, description: String(fields.get(item.id) ?? '') })),
        })
        setSelectedId(draft.id)
        await refresh()
      }}>
      <label className="implementation-form-field">Title <input className="field" name="title" defaultValue={draft.title} required autoFocus /></label>
      <label className="implementation-form-field">Implementation instructions <textarea className="field" name="description" defaultValue={draft.description} rows={5} /></label>
      <fieldset className="implementation-form-field">
        <legend>Acceptance criteria</legend>
        {draft.criteria.map((item, index) => <div key={item.id} className="task-criterion-editor">
          <CriterionField id={item.id} description={item.description} index={index} />
          <button className="button icon-button" type="button" title="Remove criterion" aria-label={`Remove criterion ${index + 1}`}
            onClick={() => setDraft({ ...draft, criteria: draft.criteria.filter(criterion => criterion.id !== item.id) })}><Trash2 size={16} aria-hidden="true" /></button>
        </div>)}
        <button className="button" type="button" onClick={() => setDraft({ ...draft, criteria: [...draft.criteria, {
          id: crypto.randomUUID(), description: '', order: draft.criteria.length + 1,
        }] })}><Plus size={16} aria-hidden="true" /> Add criterion</button>
      </fieldset>
      <fieldset className="implementation-form-field">
        <legend>Dependencies</legend>
        {definitions?.filter(item => item.id !== draft.id).map(item => <label key={item.id} className="criterion-label">
          <input type="checkbox" name="dependencies" value={item.id} defaultChecked={draft.dependencyIds.includes(item.id)} />
          {labels.get(item.id)}
        </label>)}
      </fieldset>
    </ImplementationDialog>}
    {deleting && <ImplementationDialog title="Delete task?" submitLabel="Delete" destructive onClose={() => setDeleting(undefined)}
      onSubmit={async () => { await service.deleteTaskDefinition(topic.id, deleting.id); await refresh() }}>
      <p>Delete “{deleting.title}” from this Topic’s implementation plan?</p>
    </ImplementationDialog>}
    {referenceEdit && <ReferenceDialog topics={topics} reference={referenceEdit.reference} onClose={() => setReferenceEdit(undefined)}
      onSave={async input => {
        const { task, reference } = referenceEdit
        await service.saveTaskDefinition({ ...task, references: reference
          ? task.references.map(item => item.id === reference.id ? { ...input, id: item.id } : item)
          : [...task.references, { ...input, id: crypto.randomUUID() }] })
        await refresh()
      }} />}
    {referenceDelete && <ImplementationDialog title="Delete reference?" submitLabel="Delete" destructive onClose={() => setReferenceDelete(undefined)}
      onSubmit={async () => {
        const { task, reference } = referenceDelete
        await service.saveTaskDefinition({ ...task, references: task.references.filter(item => item.id !== reference.id) })
        await refresh()
      }}><p>Delete this reference from the task definition?</p></ImplementationDialog>}
  </div>
}
