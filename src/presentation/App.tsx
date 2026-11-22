import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useMatch, useNavigate, useParams } from 'react-router'
import {
  Bot, CalendarDays, CheckCircle2, ChevronRight, Code2, FileText, FolderClosed, GitFork,
  Info, Layers3, Link2, Pencil, Plus, Trash2,
} from 'lucide-react'
import type { ImplementationService } from '../application/implementation-service'
import type { InstructionService } from '../application/instruction-service'
import type { KnowledgeService } from '../application/knowledge-service'
import type { TopicWorkspace } from '../application/topic-repository'
import type { TopicService } from '../application/topic-service'
import type { TopicMetadata as Metadata } from '../domain/topic-metadata'
import type { Topic, TopicInput } from '../domain/topic'
import { type RelationshipInput } from '../domain/topic-relationship'
import { groupDetails, topicRelationshipGroups } from './topic-relationship-groups'
import { Dependencies } from './Dependencies'
import { AgentInstructions } from './AgentInstructions'
import { Implementation } from './Implementation'
import { Markdown } from './markdown'
import { KnowledgeContent } from './KnowledgeContent'
import { Shell, TopicList, topicPath } from './navigation'
import { TopicEditor } from './TopicEditor'
import { Trash } from './Trash'
import { TopicMetadata } from './TopicMetadata'
import { VersionHistory } from './VersionHistory'

const tabs = [
  ['content', 'Content', FolderClosed],
  ['dependencies', 'Dependencies', GitFork],
  ['implementation', 'Implementation', Code2],
  ['agent-instructions', 'Agent Instructions', Bot],
  ['version-history', 'Version History', Layers3],
  ['metadata', 'Metadata', Info],
] as const

const topicTimestamp = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

function TopicSummary({ topic, workspace }: { topic: Topic; workspace: TopicWorkspace }) {
  const groups = topicRelationshipGroups(topic.id, workspace.topics, workspace.relationships)
  const related = groupDetails.flatMap(({ key, label }) => groups[key].map(row => ({ ...row, label })))
  return <aside className="topic-summary" aria-label="Topic summary">
    <section className="panel summary-panel">
      <h2>Quick view</h2>
      <dl>
        <div><dt><CheckCircle2 className="green" /> Storage</dt><dd>Saved locally</dd></div>
        <div><dt><CalendarDays /> Updated</dt><dd><time dateTime={topic.updatedAt}>{topicTimestamp.format(new Date(topic.updatedAt))}</time></dd></div>
        <div><dt><CalendarDays /> Created</dt><dd><time dateTime={topic.createdAt}>{topicTimestamp.format(new Date(topic.createdAt))}</time></dd></div>
      </dl>
    </section>
    <section className="panel summary-panel">
      <h2>Related topics</h2>
      {related.length === 0 ? <p className="muted">No relationships have been added.</p> : <ul className="related-group">
        {related.map(({ relationship, topic: other, label }) => <li key={relationship.id}>
          <Link to={topicPath(other.id)} title={relationship.description}><Link2 className="purple" size={16} aria-hidden="true" /> {other.title}</Link>
          <small className="muted">{relationship.type === 'dependency' ? `Dependency · ${label}` : label}</small>
        </li>)}
      </ul>}
    </section>
  </aside>
}

interface TopicRouteProps {
  workspace: TopicWorkspace
  topicService: TopicService
  onRestored: (workspace: TopicWorkspace) => void
  implementationService: ImplementationService
  instructionService: InstructionService
  knowledgeService: KnowledgeService
  onSave: (input: TopicInput, id?: string) => Promise<void>
  onSaveMetadata: (topicId: string, metadata: Metadata) => Promise<Topic>
  onDelete: (id: string) => Promise<void>
  onAddRelationship: (input: RelationshipInput) => Promise<void>
  onEditRelationship: (id: string, input: RelationshipInput) => Promise<void>
  onRemoveRelationship: (id: string) => Promise<void>
}

function TopicScreen({ topic, workspace, topicService, implementationService, instructionService, knowledgeService, onRestored, onSave, onSaveMetadata, onDelete, onAddRelationship, onEditRelationship, onRemoveRelationship }: TopicRouteProps & { topic: Topic }) {
  const { topics, relationships } = workspace
  const { tab } = useParams()
  const { search } = useLocation()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const tabsNav = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = tabsNav.current
    const active = nav?.querySelector('[aria-current="page"]')
    if (!nav || !active) return
    const viewport = nav.getBoundingClientRect()
    const link = active.getBoundingClientRect()
    if (link.left < viewport.left || link.right > viewport.right) {
      nav.scrollLeft += (link.left + link.right - viewport.left - viewport.right) / 2
    }
  }, [tab])
  const activeTab = tabs.find(([slug]) => slug === tab)
  if (!activeTab) return <Navigate to={topicPath(topic.id) + search} replace />
  const [slug] = activeTab

  async function remove() {
    setDeleting(true)
    setError('')
    try {
      await onDelete(topic.id)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not move this topic to Trash.')
      setDeleting(false)
    }
  }

  return <>
    <div className="topic-header">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/"><Layers3 size={15} /> Topics</Link>
        <span aria-current="page"><ChevronRight size={14} /> {topic.title}</span>
      </nav>
      <div className="topic-title-row">
        <h1><FileText className="purple" size={29} /> {topic.title}</h1>
        <div className="topic-actions">
          <span className="saved-chip"><CheckCircle2 size={16} /> Saved locally</span>
          <button className="button icon-button" title="Move to Trash" aria-label="Move to Trash" onClick={() => {
            setError('')
            dialog.current?.showModal()
          }}><Trash2 size={18} /></button>
          <button className="button primary" onClick={() => {
            setEditing(true)
            if (slug !== 'content') navigate(topicPath(topic.id) + search)
          }}><Pencil size={17} /> Edit</button>
        </div>
      </div>
      <nav ref={tabsNav} className="tabs" aria-label="Topic sections">
        {tabs.map(([value, name, Icon]) => <Link key={value} to={topicPath(topic.id, value) + search} aria-current={slug === value ? 'page' : undefined}><Icon size={19} /> {name}</Link>)}
      </nav>
    </div>

    <div className="content-grid" hidden={slug !== 'content'}>
      {editing
        ? <TopicEditor topic={topic} onCancel={() => setEditing(false)} onSave={async input => {
          await onSave(input, topic.id)
          setEditing(false)
        }} />
        : slug === 'content' && <article className="panel context-panel">
          <h2>Context</h2>
          <p className={topic.description ? 'topic-description' : 'topic-description muted'}>{topic.description || 'No description has been added.'}</p>
          <Markdown content={topic.content} />
          <KnowledgeContent topicId={topic.id} service={knowledgeService} />
        </article>}
      <TopicSummary topic={topic} workspace={workspace} />
    </div>
    {slug === 'dependencies' && <Dependencies topic={topic} topics={topics} relationships={relationships} onAdd={onAddRelationship} onEdit={onEditRelationship} onRemove={onRemoveRelationship} />}
    {slug === 'implementation' && <Implementation topic={topic} topics={topics} service={implementationService} />}
    {slug === 'agent-instructions' && <AgentInstructions topic={topic} service={instructionService} />}
    {slug === 'version-history' && <VersionHistory topic={topic} workspace={workspace} service={topicService} hasOpenEditor={editing} onRestored={restored => {
      setEditing(false)
      onRestored(restored)
    }} />}
    {slug === 'metadata' && <TopicMetadata topic={topic} workspace={workspace} service={topicService}
      onSave={metadata => onSaveMetadata(topic.id, metadata)} />}
    <dialog ref={dialog} className="panel delete-dialog" aria-labelledby="delete-title" onCancel={event => { if (deleting) event.preventDefault() }}>
      <h2 id="delete-title">Move to Trash?</h2>
      <p>You can restore <strong>{topic.title}</strong> and its associated data from Trash.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="editor-actions">
        <button className="button" autoFocus disabled={deleting} onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="button danger" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Moving…' : 'Move to Trash'}</button>
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

export function App({ service, implementationService, instructionService, knowledgeService }: {
  service: TopicService
  implementationService: ImplementationService
  instructionService: InstructionService
  knowledgeService: KnowledgeService
}) {
  const topicsHome = useMatch('/')
  const topicsRoute = useMatch('/topics/*')
  const inTopics = Boolean(topicsHome || topicsRoute)
  const selectedTopicId = useMatch('/topics/:topicId/*')?.params.topicId
  const [workspace, setWorkspace] = useState<TopicWorkspace>()
  const topics = workspace?.topics
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const searchRequested = useRef(false)
  const focusSearch = useCallback(() => {
    if (inTopics) {
      searchRef.current?.focus()
    } else {
      searchRequested.current = true
      navigate('/')
    }
  }, [inTopics, navigate])

  useEffect(() => {
    if (inTopics && searchRequested.current) {
      searchRequested.current = false
      searchRef.current?.focus()
    }
  }, [inTopics])

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
      if (!event.defaultPrevented && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
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

  async function saveMetadata(topicId: string, metadata: Metadata) {
    const updated = await service.saveMetadata(topicId, metadata)
    setWorkspace(current => current && {
      ...current, topics: current.topics.map(topic => topic.id === topicId ? updated : topic),
    })
    return updated
  }

  async function remove(id: string) {
    await service.delete(id)
    setWorkspace(await service.readWorkspace())
    navigate('/', { replace: true })
  }

  async function addRelationship(input: RelationshipInput) {
    const edge = await service.addRelationship(input)
    setWorkspace(current => current && { ...current, relationships: [...current.relationships, edge] })
  }

  async function editRelationship(id: string, input: RelationshipInput) {
    const updated = await service.editRelationship(id, input)
    setWorkspace(current => current && { ...current, relationships: current.relationships.map(edge => edge.id === id ? updated : edge) })
  }

  async function removeRelationship(id: string) {
    await service.removeRelationship(id)
    setWorkspace(current => current && { ...current, relationships: current.relationships.filter(edge => edge.id !== id) })
  }

  const listProps = {
    selectedId: selectedTopicId,
    topics: topics ?? [], query, setQuery, searchRef, ready: Boolean(workspace),
  }

  const defaultTopic = topics?.find(topic => topic.id === 'cdc') ?? topics?.[0]
  const topicRouteProps = workspace && {
    workspace, topicService: service, onRestored: setWorkspace, implementationService, instructionService, knowledgeService, onSave: save, onSaveMetadata: saveMetadata, onDelete: remove,
    onAddRelationship: addRelationship, onEditRelationship: editRelationship, onRemoveRelationship: removeRelationship,
  }
  return <Shell count={topics?.length} trashCount={workspace?.trashedTopics.length ?? 0} focusSearch={focusSearch}
    topicsSidebar={inTopics ? <TopicList {...listProps} /> : undefined}>
    <main className="main-workspace" id="workspace">
      {error ? <section className="panel placeholder" role="alert">
        <h1>Could not load Playbook</h1><p>{error}</p>
        <button className="button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Try again</button>
      </section> : !topicRouteProps ? <p className="placeholder" role="status">Loading topics…</p> : <Routes>
        <Route path="/" element={defaultTopic ? <Navigate replace to={topicPath(defaultTopic.id)} /> : <section className="panel placeholder">
          <FolderClosed className="purple" size={29} /><h1>No topics yet</h1><p className="muted">Create your first topic to start documenting technical knowledge.</p>
          <Link to="/topics/new" className="button primary"><Plus size={18} /> New topic</Link>
        </section>} />
        <Route path="/trash" element={<Trash topics={topicRouteProps.workspace.trashedTopics}
          onRestore={async id => { await service.restoreTopic(id); setWorkspace(await service.readWorkspace()) }}
          onDelete={async id => { await service.deletePermanently(id); setWorkspace(await service.readWorkspace()) }}
          onEmpty={async () => { await service.emptyTrash(); setWorkspace(await service.readWorkspace()) }} />} />
        <Route path="/topics/new" element={<section className="new-topic"><h1>New topic</h1><TopicEditor onSave={save} onCancel={() => navigate('/')} /></section>} />
        <Route path="/topics/:topicId" element={<TopicRoute {...topicRouteProps} />} />
        <Route path="/topics/:topicId/:tab" element={<TopicRoute {...topicRouteProps} />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>}
    </main>
  </Shell>
}
