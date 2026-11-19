import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router'
import {
  Bot, CalendarDays, CheckCircle2, ChevronRight, Code2, FileText, FolderClosed, GitFork,
  Info, Layers3, Link2, Pencil, Plus, Trash2,
} from 'lucide-react'
import type { TopicWorkspace } from '../application/topic-repository'
import type { TopicService } from '../application/topic-service'
import { ancestorsOf, type Topic, type TopicInput } from '../domain/topic'
import { otherTopicId, relationshipsFor, type RelationshipInput } from '../domain/topic-relationship'
import { Dependencies } from './Dependencies'
import { Markdown } from './markdown'
import { Shell, TopicTree, topicPath } from './navigation'
import { TopicEditor } from './TopicEditor'

const tabs = [
  ['content', 'Content', FolderClosed],
  ['dependencies', 'Dependencies', GitFork],
  ['implementation', 'Implementation', Code2],
  ['agent-instructions', 'Agent Instructions', Bot],
  ['version-history', 'Version History', Layers3],
  ['metadata', 'Metadata', Info],
] as const

function TopicSummary({ topic, workspace }: { topic: Topic; workspace: TopicWorkspace }) {
  const { related } = relationshipsFor(topic.id, workspace.relationships)
  const byId = new Map(workspace.topics.map(item => [item.id, item]))
  const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })
  return <aside className="topic-summary" aria-label="Topic summary">
    <section className="panel summary-panel">
      <h2>Quick view</h2>
      <dl>
        <div><dt><CheckCircle2 className="green" /> Storage</dt><dd>Saved locally</dd></div>
        <div><dt><Layers3 className="purple" /> Scope</dt><dd>{topic.scope}</dd></div>
        <div><dt><CalendarDays /> Updated</dt><dd><time dateTime={topic.updatedAt}>{date.format(new Date(topic.updatedAt))}</time></dd></div>
        <div><dt><CalendarDays /> Created</dt><dd><time dateTime={topic.createdAt}>{date.format(new Date(topic.createdAt))}</time></dd></div>
      </dl>
    </section>
    <section className="panel summary-panel">
      <h2>Related topics</h2>
      {related.length === 0 ? <p className="muted">No related topics have been added.</p> : <div className="related-group">
        <ul>{related.map(edge => {
          const item = byId.get(otherTopicId(topic.id, edge))
          return item && <li key={edge.id}><Link to={topicPath(item.id)} title={edge.description}><Link2 className="purple" size={16} /> {item.title}</Link></li>
        })}</ul>
      </div>}
    </section>
  </aside>
}

interface TopicRouteProps {
  workspace: TopicWorkspace
  onSave: (input: TopicInput, id?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddRelationship: (input: RelationshipInput) => Promise<void>
  onRemoveRelationship: (id: string) => Promise<void>
}

function TopicScreen({ topic, workspace, onSave, onDelete, onAddRelationship, onRemoveRelationship }: TopicRouteProps & { topic: Topic }) {
  const { topics, relationships } = workspace
  const { tab } = useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const activeTab = tabs.find(([slug]) => slug === tab)
  if (!activeTab) return <Navigate to={topicPath(topic.id)} replace />
  const [slug, label, TabIcon] = activeTab
  const ancestors = ancestorsOf(topic, topics)
  const parent = ancestors.at(-1)

  async function remove() {
    setDeleting(true)
    setError('')
    try {
      await onDelete(topic.id)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not delete this topic.')
      setDeleting(false)
    }
  }

  return <>
    <div className="topic-header">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/"><Layers3 size={15} /> Topics</Link>
        {ancestors.map(parent => <Link key={parent.id} to={topicPath(parent.id)}><ChevronRight size={14} /> {parent.title}</Link>)}
        <span aria-current="page"><ChevronRight size={14} /> {topic.title}</span>
      </nav>
      <div className="topic-title-row">
        <h1><FileText className="purple" size={29} /> {topic.title}</h1>
        <div className="topic-actions">
          <span className="saved-chip"><CheckCircle2 size={16} /> Saved locally</span>
          <button className="button icon-button" title="Delete topic" aria-label="Delete topic" onClick={() => {
            setError('')
            dialog.current?.showModal()
          }}><Trash2 size={18} /></button>
          <button className="button primary" onClick={() => {
            setEditing(true)
            if (slug !== 'content') navigate(topicPath(topic.id))
          }}><Pencil size={17} /> Edit</button>
        </div>
      </div>
      <div className="topic-badges"><span>{topic.scope}</span>{parent && <Link to={topicPath(parent.id)}>{parent.title}</Link>}</div>
      <nav className="tabs" aria-label="Topic sections">
        {tabs.map(([value, name, Icon]) => <Link key={value} to={topicPath(topic.id, value)} aria-current={slug === value ? 'page' : undefined}><Icon size={19} /> {name}</Link>)}
      </nav>
    </div>

    <div className="content-grid" hidden={slug !== 'content'}>
      {editing
        ? <TopicEditor topic={topic} topics={topics} onCancel={() => setEditing(false)} onSave={async input => {
          await onSave(input, topic.id)
          setEditing(false)
        }} />
        : <article className="panel context-panel">
          <h2>Context</h2>
          <p className={topic.description ? 'topic-description' : 'topic-description muted'}>{topic.description || 'No description has been added.'}</p>
          <Markdown content={topic.content} />
        </article>}
      <TopicSummary topic={topic} workspace={workspace} />
    </div>
    {slug === 'dependencies' && <Dependencies topic={topic} topics={topics} relationships={relationships} onAdd={onAddRelationship} onRemove={onRemoveRelationship} />}
    {slug !== 'content' && slug !== 'dependencies' && <section className="panel placeholder">
      <TabIcon className="purple" size={28} />
      <h2>{label}</h2>
      <p className="muted">This section is planned for a future sprint.</p>
      <Link className="button" to={topicPath(topic.id)}>Back to Content</Link>
    </section>}
    <dialog ref={dialog} className="panel delete-dialog" aria-labelledby="delete-title" onCancel={event => { if (deleting) event.preventDefault() }}>
      <h2 id="delete-title">Delete topic?</h2>
      <p><strong>{topic.title}</strong> will be permanently removed. {topics.some(item => item.parentId === topic.id) && 'Its child topics will move up one level.'}{relationships.some(edge => edge.sourceTopicId === topic.id || edge.targetTopicId === topic.id) && ' Its relationships will also be removed.'}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="editor-actions">
        <button className="button" autoFocus disabled={deleting} onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="button danger" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete topic'}</button>
      </div>
    </dialog>
  </>
}

function TopicRoute(props: TopicRouteProps) {
  const { topicId } = useParams()
  const topic = props.workspace.topics.find(item => item.id === topicId)
  return topic
    ? <TopicScreen key={topic.id} topic={topic} {...props} />
    : <section className="panel placeholder"><h1>Topic not found</h1><p className="muted">Choose a topic from the sidebar.</p><Link to="/" className="button">Back to topics</Link></section>
}

export function App({ service }: { service: TopicService }) {
  const [workspace, setWorkspace] = useState<TopicWorkspace>()
  const topics = workspace?.topics
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const focusSearch = useCallback(() => searchRef.current?.focus(), [])

  useEffect(() => {
    let active = true
    service.readWorkspace().then(
      result => { if (active) setWorkspace(result) },
      problem => { if (active) setError(problem instanceof Error ? problem.message : 'Could not load topics.') },
    )
    return () => { active = false }
  }, [service, attempt])

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        focusSearch()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [focusSearch])

  async function save(input: TopicInput, id?: string) {
    const topic = await service.save(input, id)
    setWorkspace(current => current && {
      ...current,
      topics: id ? current.topics.map(item => item.id === id ? topic : item) : [...current.topics, topic],
    })
    if (!id) {
      setQuery('')
      navigate(topicPath(topic.id))
    }
  }

  async function remove(id: string) {
    const parentId = topics?.find(item => item.id === id)?.parentId
    await service.delete(id)
    setWorkspace(await service.readWorkspace())
    navigate(parentId ? topicPath(parentId) : '/', { replace: true })
  }

  async function addRelationship(input: RelationshipInput) {
    const edge = await service.addRelationship(input)
    setWorkspace(current => current && { ...current, relationships: [...current.relationships, edge] })
  }

  async function removeRelationship(id: string) {
    await service.removeRelationship(id)
    setWorkspace(current => current && { ...current, relationships: current.relationships.filter(edge => edge.id !== id) })
  }

  const defaultTopic = topics?.find(topic => topic.id === 'cdc') ?? topics?.[0]
  return <Shell count={topics?.length} focusSearch={focusSearch}>
    <Routes>
      <Route path="/topics/:topicId/*" element={<RoutedTree topics={topics ?? []} query={query} setQuery={setQuery} searchRef={searchRef} ready={Boolean(topics)} />} />
      <Route path="*" element={<TopicTree topics={topics ?? []} query={query} setQuery={setQuery} searchRef={searchRef} ready={Boolean(topics)} />} />
    </Routes>
    <main className="main-workspace" id="workspace">
      {error ? <section className="panel placeholder" role="alert">
        <h1>Could not load Playbook</h1><p>{error}</p>
        <button className="button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Try again</button>
      </section> : !workspace ? <p className="placeholder" role="status">Loading topics…</p> : <Routes>
        <Route path="/" element={defaultTopic ? <Navigate replace to={topicPath(defaultTopic.id)} /> : <section className="panel placeholder">
          <FolderClosed className="purple" size={29} /><h1>No topics yet</h1><p className="muted">Create your first topic to start documenting technical knowledge.</p>
          <Link to="/topics/new" className="button primary"><Plus size={18} /> New topic</Link>
        </section>} />
        <Route path="/topics/new" element={<section className="new-topic"><h1>New topic</h1><TopicEditor topics={workspace.topics} onSave={save} onCancel={() => navigate('/')} /></section>} />
        <Route path="/topics/:topicId" element={<TopicRoute workspace={workspace} onSave={save} onDelete={remove} onAddRelationship={addRelationship} onRemoveRelationship={removeRelationship} />} />
        <Route path="/topics/:topicId/:tab" element={<TopicRoute workspace={workspace} onSave={save} onDelete={remove} onAddRelationship={addRelationship} onRemoveRelationship={removeRelationship} />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>}
    </main>
  </Shell>
}

function RoutedTree(props: React.ComponentProps<typeof TopicTree>) {
  const { topicId } = useParams()
  return <TopicTree {...props} selectedId={topicId} />
}
