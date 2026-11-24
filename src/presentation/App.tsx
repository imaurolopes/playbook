import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useMatch, useNavigate, useParams } from 'react-router'
import {
  Bot, CalendarDays, CheckCircle2, ChevronRight, Code2, FolderClosed, GitFork,
  Info, Layers3, Link2, Pencil, Plus,
} from 'lucide-react'
import type { ImplementationService } from '../application/implementation-service'
import type { InstructionService } from '../application/instruction-service'
import type { KnowledgeService } from '../application/knowledge-service'
import type { TopicWorkspace } from '../application/topic-repository'
import type { TopicService } from '../application/topic-service'
import { mergeTechnicalDomains, technicalDomainsFor, type TopicMetadata as Metadata } from '../domain/topic-metadata'
import type { Topic, TopicInput } from '../domain/topic'
import { type RelationshipInput } from '../domain/topic-relationship'
import { groupDetails, topicRelationshipGroups } from './topic-relationship-groups'
import { Dependencies } from './Dependencies'
import { AgentInstructions } from './AgentInstructions'
import { GenerationTemplates } from './GenerationTemplates'
import { Implementation, ImplementationDialog } from './Implementation'
import { Markdown } from './markdown'
import { KnowledgeContent } from './KnowledgeContent'
import { Shell, TopicList, topicPath } from './navigation'
import { TopicEditor, TopicEditDialog } from './TopicEditor'
import { TopicActions, type TopicAction } from './TopicActions'
import { topicTypeDisplay } from './topic-types'
import { TaskDefinitions } from './TaskDefinitions'
import { Projects } from './Projects'
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
  const { icon: TypeIcon, label, color } = topicTypeDisplay[topic.type]
  const groups = topicRelationshipGroups(topic.id, workspace.topics, workspace.relationships)
  const related = groupDetails.flatMap(({ key, label }) => groups[key].map(row => ({ ...row, label })))
  return <aside className="topic-summary" aria-label="Topic summary">
    <section className="panel summary-panel">
      <h2>Quick view</h2>
      <dl>
        <div><dt><TypeIcon style={{ color }} aria-hidden="true" /> Type</dt><dd>{label}</dd></div>
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
  onSaveMetadata: (topicId: string, metadata: Metadata, type: Topic['type']) => Promise<Topic>
  onTopicAction: (action: TopicAction, topic: Topic) => void
  onAddRelationship: (input: RelationshipInput) => Promise<void>
  onEditRelationship: (id: string, input: RelationshipInput) => Promise<void>
  onRemoveRelationship: (id: string) => Promise<void>
}

function TopicScreen({ topic, workspace, topicService, implementationService, instructionService, knowledgeService, onRestored, onSave, onSaveMetadata, onTopicAction, onAddRelationship, onEditRelationship, onRemoveRelationship }: TopicRouteProps & { topic: Topic }) {
  const { icon: TopicIcon, color } = topicTypeDisplay[topic.type]
  const { topics, relationships } = workspace
  const { tab } = useParams()
  const { search } = useLocation()
  const [editing, setEditing] = useState(false)
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
  const slug = tab === 'execution' ? tab : tabs.find(([value]) => value === tab)?.[0]
  if (!slug) return <Navigate to={topicPath(topic.id) + search} replace />
  if (slug === 'implementation' && new URLSearchParams(search).has('project')) {
    return <Navigate replace to={topicPath(topic.id, 'execution') + search} />
  }

  return <>
    <div className="topic-header">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/"><Layers3 size={15} /> Topics</Link>
        <span aria-current="page"><ChevronRight size={14} /> {topic.title}</span>
      </nav>
      <div className="topic-title-row">
        <div className="topic-title-group">
          <h1><TopicIcon style={{ color }} size={29} aria-hidden="true" /> {topic.title}</h1>
          <TopicActions title={topic.title} onAction={action => onTopicAction(action, topic)} />
        </div>
        <span className="saved-chip"><CheckCircle2 size={16} /> Saved locally</span>
      </div>
      <nav ref={tabsNav} className="tabs" aria-label="Topic sections">
        {tabs.map(([value, name, Icon]) => <Link key={value} to={topicPath(topic.id, value) + (value === 'implementation' ? '' : search)} aria-current={slug === value ? 'page' : undefined}><Icon size={19} /> {name}</Link>)}
      </nav>
    </div>

    <div className="content-grid" hidden={slug !== 'content'}>
      {editing
        ? <TopicEditor topic={topic} onCancel={() => setEditing(false)} onSave={async input => {
          await onSave(input, topic.id)
          setEditing(false)
        }} />
        : slug === 'content' && <article className="panel context-panel">
          <header className="topic-details-heading">
            <h2>Summary</h2>
            <div className="topic-details-actions">
              <button className="button primary" onClick={() => setEditing(true)}><Pencil size={17} aria-hidden="true" /> Edit</button>
            </div>
          </header>
          <p className={topic.description ? 'topic-description' : 'topic-description muted'}>{topic.description || 'No description has been added.'}</p>
          <Markdown content={topic.content} />
          <KnowledgeContent topicId={topic.id} service={knowledgeService} />
        </article>}
      <TopicSummary topic={topic} workspace={workspace} />
    </div>
    {slug === 'dependencies' && <Dependencies topic={topic} topics={topics} relationships={relationships} onAdd={onAddRelationship} onEdit={onEditRelationship} onRemove={onRemoveRelationship} />}
    {slug === 'implementation' && <TaskDefinitions topic={topic} topics={topics} service={implementationService} />}
    {slug === 'execution' && <Implementation topic={topic} topics={topics} service={implementationService} />}
    {slug === 'agent-instructions' && <AgentInstructions topic={topic} service={instructionService} />}
    {slug === 'version-history' && <VersionHistory topic={topic} service={topicService} hasOpenEditor={editing} onRestored={restored => {
      setEditing(false)
      onRestored(restored)
    }} />}
    {slug === 'metadata' && <TopicMetadata topic={topic} workspace={workspace} service={topicService}
      onSave={(metadata, type) => onSaveMetadata(topic.id, metadata, type)} />}
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
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [topicDialog, setTopicDialog] = useState<{ action: 'edit' | 'trash'; topic: Topic }>()
  const [attempt, setAttempt] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchRequest, setSearchRequest] = useState(0)
  const navigate = useNavigate()
  const searchRequested = useRef(false)
  const focusSearchInput = useCallback(() => {
    searchRef.current?.focus()
    setSearchRequest(0)
  }, [])
  const focusSearch = useCallback(() => {
    if (inTopics) {
      setSearchRequest(value => value + 1)
    } else {
      searchRequested.current = true
      navigate('/')
    }
  }, [inTopics, navigate])

  useEffect(() => {
    if (inTopics && searchRequested.current) {
      searchRequested.current = false
      setSearchRequest(value => value + 1)
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

  async function saveMetadata(topicId: string, metadata: Metadata, type: Topic['type']) {
    const updated = await service.saveMetadata(topicId, metadata, type)
    setWorkspace(current => current && {
      ...current, topics: current.topics.map(topic => topic.id === topicId ? updated : topic),
      technicalDomains: mergeTechnicalDomains([...(current.technicalDomains ?? []), ...technicalDomainsFor(updated.metadata)]),
    })
    return updated
  }

  function onTopicAction(action: TopicAction, topic: Topic) {
    setActionError('')
    setNotice('')
    if (action !== 'duplicate') {
      setTopicDialog({ action, topic })
      return
    }
    void duplicateTopic(topic.id)
  }

  async function duplicateTopic(id: string) {
    try {
      const copy = await service.duplicate(id)
      setWorkspace(await service.readWorkspace())
      setQuery('')
      navigate(topicPath(copy.id))
      setNotice(`Created ${copy.title}.`)
    } catch (problem) {
      setActionError(problem instanceof Error ? problem.message : 'Could not duplicate this topic.')
    }
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
    topics: topics ?? [], query, setQuery, searchRef, ready: Boolean(workspace), onTopicAction,
  }

  const defaultTopic = topics?.find(topic => topic.id === 'cdc') ?? topics?.[0]
  const topicRouteProps = workspace && {
    workspace, topicService: service, onRestored: setWorkspace, implementationService, instructionService, knowledgeService, onSave: save, onSaveMetadata: saveMetadata, onTopicAction,
    onAddRelationship: addRelationship, onEditRelationship: editRelationship, onRemoveRelationship: removeRelationship,
  }
  return <Shell count={topics?.length} trashCount={workspace?.trash.length ?? 0} focusSearch={focusSearch}
    searchRequest={searchRequest} focusSearchInput={focusSearchInput}
    topicsSidebar={inTopics ? (resizeHandle, pin) => <TopicList {...listProps} resizeHandle={resizeHandle} pin={pin} /> : undefined}>
    <main className="main-workspace" id="workspace">
      <p className={notice ? 'implementation-notice' : 'sr-only'} role="status">{notice}</p>
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {error ? <section className="panel placeholder" role="alert">
        <h1>Could not load Playbook</h1><p>{error}</p>
        <button className="button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Try again</button>
      </section> : !topicRouteProps ? <p className="placeholder" role="status">Loading topics…</p> : <Routes>
        <Route path="/" element={defaultTopic ? <Navigate replace to={topicPath(defaultTopic.id)} /> : <section className="panel placeholder">
          <FolderClosed className="purple" size={29} /><h1>No topics yet</h1><p className="muted">Create your first topic to start documenting technical knowledge.</p>
          <Link to="/topics/new" className="button primary"><Plus size={18} /> New topic</Link>
        </section>} />
        <Route path="/projects/*" element={<Projects topics={topicRouteProps.workspace.topics} service={implementationService}
          onTrashChanged={async () => setWorkspace(await service.readWorkspace())} />} />
        <Route path="/templates" element={<GenerationTemplates service={instructionService} />} />
        <Route path="/trash" element={<Trash items={topicRouteProps.workspace.trash}
          onRestore={async item => { await service.restoreTrash(item); setWorkspace(await service.readWorkspace()) }}
          onDelete={async item => { await service.purgeTrashItem(item); setWorkspace(await service.readWorkspace()) }}
          onEmpty={async () => { await service.emptyTrash(); setWorkspace(await service.readWorkspace()) }} />} />
        <Route path="/topics/new" element={<section className="new-topic"><h1>New topic</h1><TopicEditor onSave={save} onCancel={() => navigate('/')} /></section>} />
        <Route path="/topics/:topicId" element={<TopicRoute {...topicRouteProps} />} />
        <Route path="/topics/:topicId/:tab" element={<TopicRoute {...topicRouteProps} />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>}
      {topicDialog?.action === 'edit' && <TopicEditDialog topic={topicDialog.topic} onClose={() => setTopicDialog(undefined)}
        onSave={input => save(input, topicDialog.topic.id)} />}
      {topicDialog?.action === 'trash' && <ImplementationDialog title="Move topic to Trash?" submitLabel="Move to Trash" destructive
        onClose={() => setTopicDialog(undefined)} onSubmit={async () => {
          const { topic } = topicDialog
          await service.delete(topic.id)
          setWorkspace(await service.readWorkspace())
          if (selectedTopicId === topic.id) navigate('/', { replace: true })
          setNotice(`Moved ${topic.title} to Trash.`)
        }}>
        <p>This topic will be moved to Trash and can be restored later.</p>
      </ImplementationDialog>}
    </main>
  </Shell>
}
