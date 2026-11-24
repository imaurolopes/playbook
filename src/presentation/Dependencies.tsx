import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { Topic } from '../domain/topic'
import { type RelationshipInput, type RelationshipType, type TopicRelationship } from '../domain/topic-relationship'
import { topicPath } from './navigation'
import { DependencyGraph } from './DependencyGraph'
import { groupDetails, topicRelationshipGroups, type RelationshipRow } from './topic-relationship-groups'

function RelationshipForm({ topic, topics, existing, onClose, onSave }: {
  topic: Topic
  topics: readonly Topic[]
  existing?: RelationshipRow
  onClose: () => void
  onSave: (input: RelationshipInput) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [type, setType] = useState<RelationshipType>(existing?.relationship.type ?? 'dependency')
  const [direction, setDirection] = useState(existing?.relationship.targetTopicId === topic.id ? 'incoming' : 'outgoing')
  const [query, setQuery] = useState(existing?.topic.title ?? '')
  const [selected, setSelected] = useState(existing?.topic)
  const [description, setDescription] = useState(existing?.relationship.description ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const matches = topics.filter(item => item.id !== topic.id && item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const incoming = direction === 'incoming'
  const source = incoming ? selected : topic
  const target = incoming ? topic : selected

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!source || !target) {
      setError('Choose a topic from the search results.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSave({ sourceTopicId: source.id, targetTopicId: target.id, type, description })
      dialog.current?.close()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : (existing ? 'Could not update the relationship.' : 'Could not add the relationship.'))
    } finally {
      setBusy(false)
    }
  }

  return <dialog ref={dialog} className="panel delete-dialog relationship-dialog" aria-labelledby={titleId}
    onClose={onClose} onCancel={event => { if (busy) event.preventDefault() }}>
    <h2 id={titleId}>{existing ? 'Edit relationship' : 'Add relationship'}</h2>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <label className="relationship-field">Relationship type
          <select value={type} onChange={event => setType(event.target.value === 'related' ? 'related' : 'dependency')}>
            <option value="dependency">Depends on</option>
            <option value="related">Related to</option>
          </select>
        </label>
        {existing && type === 'dependency' && <label className="relationship-field">Direction
          <select value={direction} onChange={event => setDirection(event.target.value)}>
            <option value="outgoing">Outgoing (depends on)</option>
            <option value="incoming">Incoming (required by)</option>
          </select>
        </label>}
        <p className="muted relationship-hint" aria-live="polite">{type === 'related' ? 'The association appears on both topics.'
          : `${source?.title ?? 'The selected topic'} depends on ${target?.title ?? 'the topic you select'}.`}</p>
        <label className="relationship-field">Find a topic by title
          <span className="field relationship-search"><Search size={18} /><input type="search" value={query} placeholder="Search existing topics..." onChange={event => {
            setQuery(event.target.value)
            setSelected(undefined)
          }} /></span>
        </label>
        {matches.length ? <div className="relationship-results" role="group" aria-label="Matching topics">
          {matches.map(item => <button key={item.id} type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelected(item)}>
            <FileText size={17} className="purple" />{item.title}
          </button>)}
        </div> : <p className="muted relationship-hint">{topics.length <= 1 ? 'Create another topic before adding a relationship.' : 'No topics match your search.'}</p>}
        <label className="relationship-field">Description (optional)
          <textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="editor-actions">
          <button type="button" className="button" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className="button primary">{existing ? (busy ? 'Saving…' : 'Save') : (busy ? 'Adding…' : 'Add relationship')}</button>
        </div>
      </fieldset>
    </form>
  </dialog>
}

export function Dependencies({ topic, topics, relationships, onAdd, onEdit, onRemove }: {
  topic: Topic
  topics: readonly Topic[]
  relationships: readonly TopicRelationship[]
  onAdd: (input: RelationshipInput) => Promise<void>
  onEdit: (id: string, input: RelationshipInput) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const [form, setForm] = useState<RelationshipRow | 'add'>()
  const [removing, setRemoving] = useState<string>()
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const groups = topicRelationshipGroups(topic.id, topics, relationships)
  const hasRows = groupDetails.some(({ key }) => groups[key].length)

  async function remove(id: string) {
    if (removing) return
    setRemoving(id)
    setError('')
    setStatus('')
    try {
      await onRemove(id)
      setStatus('Relationship removed.')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not remove the relationship.')
    } finally {
      setRemoving(undefined)
    }
  }

  return <div className="dependencies">
    <div className="dependency-layout">
      <DependencyGraph topic={topic} topics={topics} relationships={relationships} />
      <section className="panel summary-panel dependency-summary">
        <h2>Dependency summary</h2>
        <dl>{groupDetails.map(({ key, label, icon: Icon }) => <div key={key}>
          <dt><Icon className="purple" />{label}</dt><dd>{groups[key].length}</dd>
        </div>)}</dl>
        <p className="muted">Dependencies point from the topic that needs something to the topic it requires.</p>
        <button className="button add-relationship" onClick={() => setForm('add')}><Plus size={17} /> Add relationship</button>
      </section>
    </div>
    <section className="relationship-list" aria-labelledby="relationship-list-title">
      <h2 id="relationship-list-title">Relationships</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <p className={status ? 'relationship-status' : 'sr-only'} role="status">{status}</p>
      {hasRows ? <div className="panel relationship-table-wrap"><table className="playbook-table relationship-table">
        <thead><tr><th scope="col">Topic</th><th scope="col">Type</th><th scope="col">Description</th><th scope="col">Actions</th></tr></thead>
        <tbody>{groupDetails.flatMap(({ key, label, icon: Icon }) => groups[key].map(({ relationship, topic: other }) => <tr key={relationship.id}>
          <td><Link to={topicPath(other.id)}><FileText size={17} className="purple" /> {other.title}</Link></td>
          <td><span className={`relationship-type type-${key}`}><Icon size={16} />{label}</span></td>
          <td className="muted relationship-description">{relationship.description || '—'}</td>
          <td><div className="relationship-actions">
            <button className="button icon-button" disabled={Boolean(removing)}
              aria-label={`Edit ${label.toLowerCase()} relationship with ${other.title}`} title="Edit relationship"
              onClick={() => setForm({ relationship, topic: other })}><Pencil size={16} /></button>
            <button className="button icon-button remove-relationship" disabled={Boolean(removing)}
              aria-label={`Remove ${label.toLowerCase()} relationship with ${other.title}`} title="Remove relationship"
              onClick={() => void remove(relationship.id)}><Trash2 size={16} /></button></div></td>
        </tr>))}</tbody>
      </table></div> : <p className="panel relationship-empty muted">No dependencies or related topics yet. Add a relationship to connect this topic to another.</p>}
    </section>
    {form && <RelationshipForm topic={topic} topics={topics} existing={form === 'add' ? undefined : form}
      onClose={() => setForm(undefined)} onSave={async input => {
        setStatus('')
        if (form === 'add') {
          await onAdd(input)
          setStatus('Relationship added.')
        } else {
          await onEdit(form.relationship.id, input)
          setStatus('Relationship updated.')
        }
      }} />}
  </div>
}
