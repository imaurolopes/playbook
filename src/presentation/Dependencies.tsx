import { useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { FileText, GitFork, Maximize2, Minimize2, Plus, Search, Trash2 } from 'lucide-react'
import type { Topic } from '../domain/topic'
import { type RelationshipInput, type RelationshipType, type TopicRelationship } from '../domain/topic-relationship'
import { topicPath } from './navigation'
import { groupDetails, topicRelationshipGroups, type RelationshipGroups, type RelationshipRow } from './topic-relationship-groups'

function DependencyGraph({ topic, groups }: { topic: Topic; groups: RelationshipGroups }) {
  const [expanded, setExpanded] = useState(false)
  const arrowId = useId()
  const rightCount = groups.related.length + groups.dependents.length
  const height = Math.max(260, Math.max(groups.dependencies.length, rightCount) * 58 + 30)
  const midpoint = height / 2
  const empty = !groups.dependencies.length && !rightCount

  function positions(rows: RelationshipRow[], count: number, offset = 0) {
    return rows.map((row, index) => ({ ...row, y: midpoint + (index + offset - (count - 1) / 2) * 58 }))
  }

  const positioned = {
    dependencies: positions(groups.dependencies, groups.dependencies.length),
    related: positions(groups.related, rightCount),
    dependents: positions(groups.dependents, rightCount, groups.related.length),
  }

  return <section className={'panel dependency-graph' + (expanded ? ' graph-expanded' : '')}>
    <div className="dependency-heading">
      <h2>Dependency graph</h2>
      {!empty && <button className="button icon-button graph-expand" aria-label={expanded ? 'Restore graph size' : 'Expand graph'} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>
        {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      </button>}
    </div>
    {empty ? <div className="graph-empty">
      <GitFork className="purple" size={28} />
      <p className="muted">No relationships to visualize.</p>
    </div> : <div className="graph-canvas" style={{ minHeight: height }}>
      <svg className="graph-lines" viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id={arrowId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" viewBox="0 0 7 7">
          <path d="M 1 1 L 6 3.5 L 1 6" fill="none" stroke="var(--purple)" />
        </marker></defs>
        {positioned.dependencies.map(({ relationship, y }) =>
          <path key={relationship.id} d={`M 362 ${midpoint} C 330 ${midpoint}, 334 ${y}, 299 ${y}`} markerEnd={`url(#${arrowId})`} />,
        )}
        {positioned.related.map(({ relationship, y }) =>
          <path key={relationship.id} className="graph-related-line" d={`M 638 ${midpoint} C 665 ${midpoint}, 663 ${y}, 701 ${y}`} />,
        )}
        {positioned.dependents.map(({ relationship, y }) =>
          <path key={relationship.id} d={`M 701 ${y} C 663 ${y}, 665 ${midpoint}, 638 ${midpoint}`} markerEnd={`url(#${arrowId})`} />,
        )}
      </svg>
      <div className="graph-node graph-center"><FileText size={17} /> <strong>{topic.title}</strong></div>
      {groupDetails.map(({ key, label, icon: Icon }) => positioned[key].length > 0 && <div key={key} className={`graph-group graph-${key}`} role="group" aria-label={label}>
        <h3>{label}</h3>
        {positioned[key].map(({ relationship, topic: other, y }) => <Link
          key={relationship.id} to={topicPath(other.id)} className="graph-node graph-edge"
          style={{ top: y }} title={other.title}
        ><Icon size={17} className="purple" /><span><small>{label}</small><strong>{other.title}</strong></span></Link>)}
      </div>)}
    </div>}
  </section>
}

function RelationshipForm({ dialog, topic, topics, onAdd }: {
  dialog: React.RefObject<HTMLDialogElement | null>
  topic: Topic
  topics: readonly Topic[]
  onAdd: (input: RelationshipInput) => Promise<void>
}) {
  const [type, setType] = useState<RelationshipType>('dependency')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Topic>()
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const matches = topics.filter(item => item.id !== topic.id && item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  function reset() {
    setType('dependency')
    setQuery('')
    setSelected(undefined)
    setDescription('')
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!selected) {
      setError('Choose a topic from the search results.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onAdd({ sourceTopicId: topic.id, targetTopicId: selected.id, type, description })
      dialog.current?.close()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not add the relationship.')
    } finally {
      setBusy(false)
    }
  }

  return <dialog ref={dialog} className="panel delete-dialog relationship-dialog" aria-labelledby="add-relationship-title"
    onClose={reset} onCancel={event => { if (busy) event.preventDefault() }}>
    <h2 id="add-relationship-title">Add relationship</h2>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <label className="relationship-field">Relationship type
          <select value={type} onChange={event => setType(event.target.value === 'related' ? 'related' : 'dependency')}>
            <option value="dependency">Dependency</option>
            <option value="related">Related</option>
          </select>
        </label>
        <p className="muted relationship-hint">{type === 'dependency' ? 'This topic depends on the topic you select.' : 'The association appears on both topics.'}</p>
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
          <button type="submit" className="button primary">{busy ? 'Adding…' : 'Add relationship'}</button>
        </div>
      </fieldset>
    </form>
  </dialog>
}

export function Dependencies({ topic, topics, relationships, onAdd, onRemove }: {
  topic: Topic
  topics: readonly Topic[]
  relationships: readonly TopicRelationship[]
  onAdd: (input: RelationshipInput) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
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
      <DependencyGraph topic={topic} groups={groups} />
      <section className="panel summary-panel dependency-summary">
        <h2>Dependency summary</h2>
        <dl>{groupDetails.map(({ key, label, icon: Icon }) => <div key={key}>
          <dt><Icon className="purple" />{label}</dt><dd>{groups[key].length}</dd>
        </div>)}</dl>
        <p className="muted">Dependencies point from the topic that needs something to the topic it requires.</p>
        <button className="button add-relationship" onClick={() => dialog.current?.showModal()}><Plus size={17} /> Add relationship</button>
      </section>
    </div>
    <section className="relationship-list" aria-labelledby="relationship-list-title">
      <h2 id="relationship-list-title">Topic relationships</h2>
      {error && <p className="error" role="alert">{error}</p>}
      <p className={status ? 'relationship-status' : 'sr-only'} role="status">{status}</p>
      {hasRows ? <div className="panel relationship-table-wrap"><table className="relationship-table">
        <thead><tr><th scope="col">Type</th><th scope="col">Topic</th><th scope="col">Description</th><th scope="col">Actions</th></tr></thead>
        <tbody>{groupDetails.flatMap(({ key, label, icon: Icon }) => groups[key].map(({ relationship, topic: other }) => <tr key={relationship.id}>
          <td><span className={`relationship-type type-${key}`}><Icon size={16} />{label}</span></td>
          <td><Link to={topicPath(other.id)}><FileText size={17} className="purple" /> {other.title}</Link></td>
          <td className="muted relationship-description">{relationship.description || '—'}</td>
          <td><button className="button icon-button remove-relationship" disabled={Boolean(removing)}
            aria-label={`Remove ${label.toLowerCase()} relationship with ${other.title}`} title="Remove relationship"
            onClick={() => void remove(relationship.id)}><Trash2 size={16} /></button></td>
        </tr>))}</tbody>
      </table></div> : <p className="panel relationship-empty muted">No dependencies or related topics yet. Add a relationship to connect this topic to another.</p>}
    </section>
    <RelationshipForm dialog={dialog} topic={topic} topics={topics} onAdd={async input => {
      setStatus('')
      await onAdd(input)
      setStatus('Relationship added.')
    }} />
  </div>
}
