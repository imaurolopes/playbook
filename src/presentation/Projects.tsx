import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Bot, CheckSquare, FileText, Folder, House, Layers3, Plus, Search, Settings, Shield, Unlink } from 'lucide-react'
import type { ImplementationWorkspace } from '../application/implementation-repository'
import type { ImplementationService } from '../application/implementation-service'
import { blockedByPrerequisites, projectProgress } from '../application/project-progress'
import { orderedTasks, webUrl, type Project } from '../domain/implementation'
import { AgentConfig } from './AgentConfig'
import { Safeguards } from './Safeguards'
import type { Topic } from '../domain/topic'
import { ImplementationDialog, numberedTaskLabels, ProjectDialog } from './Implementation'
import { projectPath, topicPath } from './navigation'
import './projects.css'

const sections = [
  ['overview', 'Overview', House], ['topics', 'Topics', Layers3], ['tasks', 'Tasks', CheckSquare],
  ['artifacts', 'Artifacts', FileText], ['agent-config', 'Guidelines', Bot], ['safeguards', 'Safeguards', Shield], ['settings', 'Settings', Settings],
] as const
const taskLabels = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' }
const dates = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium' })
const implementationPath = (topicId: string, projectId: string, taskId?: string) => {
  const query = new URLSearchParams({ project: projectId })
  if (taskId) query.set('task', taskId)
  return topicPath(topicId, 'execution') + '?' + query
}

function projectRecords(data: ImplementationWorkspace, projectId: string) {
  const implementations = data.implementations.filter(item => item.projectId === projectId)
  const byImplementation = new Map(implementations.map(item => [item.id, item]))
  const tasks = data.tasks.filter(task => byImplementation.has(task.implementationId))
  const artifacts = data.artifacts.filter(artifact => byImplementation.has(artifact.implementationId))
  return { implementations, byImplementation, tasks, artifacts, ...projectProgress(tasks) }
}

function ProjectList({ data, service, refresh }: PageData) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('updated')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const search = query.trim().toLocaleLowerCase()
  const projects = data.projects.filter(project => [project.name, project.description].some(text => text.toLocaleLowerCase().includes(search)))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.name.localeCompare(b.name))
  return <div className="projects-page">
    <header className="projects-heading">
      <h1><Folder className="purple" aria-hidden="true" /> Projects</h1>
      <button className="button primary" onClick={() => setCreating(true)}><Plus size={17} /> New project</button>
    </header>
    <div className="projects-filters">
      <label className="field"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search projects" placeholder="Search projects..." value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>Sort by <select className="field" value={sort} onChange={event => setSort(event.target.value)}>
        <option value="updated">Last updated</option><option value="name">Name</option>
      </select></label>
    </div>
    {projects.length ? <ul className="project-cards">{projects.map(project => {
      const records = projectRecords(data, project.id)
      return <li className="panel project-card project-list-card" key={project.id}>
        <div className="project-card-heading">
          <h2><Link to={projectPath(project.id)} title={project.name}>{project.name}</Link></h2>
          <span className="project-status">{records.status}</span>
        </div>
        {project.description && <p className="muted project-card-description" title={project.description}>{project.description}</p>}
        <div className="project-card-metrics">
          <span><strong>{records.implementations.length}</strong> Topics</span>
          <span><strong>{records.tasks.length}</strong> Tasks</span>
          <Progress percent={records.percent} />
        </div>
      </li>
    })}</ul> : <p className="panel project-card muted">{search ? 'No projects match your search.' : 'No projects yet.'}</p>}
    {creating && <ProjectDialog onClose={() => setCreating(false)} onSave={async (name, description) => {
      const project = await service.createProject(name, description)
      await refresh()
      navigate(projectPath(project.id))
    }} />}
  </div>
}

function Progress({ percent }: { percent: number }) {
  return <div className="project-progress">
    <progress aria-label="Project progress" max={100} value={percent} />
    <span>{percent}%</span>
  </div>
}

interface PageData {
  data: ImplementationWorkspace
  service: ImplementationService
  refresh: () => Promise<void>
  onTrashChanged: () => Promise<void>
}

function ProjectDetail({ data, service, refresh, topics, onTrashChanged }: PageData & { topics: readonly Topic[] }) {
  const { projectId, section } = useParams()
  const project = data.projects.find(item => item.id === projectId)
  if (!project) return <section className="panel placeholder"><h1>Project not found</h1><Link to="/projects" className="button">Back to projects</Link></section>
  if (!sections.some(([id]) => id === section)) return <Navigate replace to={projectPath(project.id)} />
  return <ProjectDashboard key={project.id} project={project} section={section} data={data} topics={topics} service={service} refresh={refresh} onTrashChanged={onTrashChanged} />
}

function ProjectDashboard({ project, section, data, topics, service, refresh, onTrashChanged }: PageData & {
  project: Project; section?: string; topics: readonly Topic[]
}) {
  const records = projectRecords(data, project.id)
  const { implementations, byImplementation, tasks, artifacts } = records
  const topicById = new Map(topics.map(topic => [topic.id, topic]))
  const associatedIds = new Set(implementations.map(item => item.topicId))
  const taskLabelsById = new Map(implementations.flatMap(implementation => numberedTaskLabels(orderedTasks(tasks, implementation.id))))
  const derivedBlocked = blockedByPrerequisites(tasks)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [removing, setRemoving] = useState<string>()
  const [upgrading, setUpgrading] = useState<string>()
  const [selection, setSelection] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const tabs = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = tabs.current
    const active = nav?.querySelector('[aria-current="page"]')
    if (!nav || !active) return
    const viewport = nav.getBoundingClientRect()
    const link = active.getBoundingClientRect()
    if (link.left < viewport.left) nav.scrollLeft += link.left - viewport.left
    if (link.right > viewport.right) nav.scrollLeft += link.right - viewport.right
  }, [section])

  async function associate() {
    if (!selection || busy) return
    setBusy(true)
    setError('')
    try {
      await service.createImplementation(selection, project.id)
      await refresh()
      setSelection('')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not associate the topic.')
    } finally {
      setBusy(false)
    }
  }

  const removePlan = implementations.find(item => item.id === removing)
  return <div className="projects-page">
    <Link className="projects-back" to="/projects"><ArrowLeft size={16} /> All projects</Link>
    <header className="projects-heading">
      <div><h1><Folder className="purple" aria-hidden="true" /> {project.name}</h1>
        {project.description && <p className="muted">{project.description}</p>}</div>
      <span className="project-status">{records.status}</span>
    </header>
    <nav ref={tabs} aria-label="Project sections" className="tabs project-tabs">{sections.map(([id, name, Icon]) =>
      <NavLink key={id} end to={projectPath(project.id, id)}><Icon size={18} aria-hidden="true" /> {name}</NavLink>)}</nav>

    {section === 'overview' && <section className="panel project-card">
      <h2>Project summary</h2>
      <div className="project-overview-metrics">
        <Link className="project-metric" to={projectPath(project.id, 'topics')}><strong>{implementations.length}</strong> Topics</Link>
        <Link className="project-metric" to={projectPath(project.id, 'tasks')}><strong>{tasks.length}</strong> Tasks</Link>
        <div className="project-metric"><strong>{records.completed}</strong> Completed tasks</div>
        <div className="project-metric"><strong>{records.percent}%</strong> Progress</div>
      </div>
      <Progress percent={records.percent} />
      <ProjectDates project={project} />
    </section>}

    {section === 'topics' && <section className="panel project-card">
      <div className="projects-heading">
        <h2>Topics</h2>
        <form className="projects-inline" onSubmit={event => { event.preventDefault(); void associate() }}>
          <select className="field" aria-label="Topic to associate" value={selection} onChange={event => setSelection(event.target.value)}>
            <option value="">Select a topic</option>
            {topics.filter(topic => !associatedIds.has(topic.id)).map(topic => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
          </select>
          <button className="button primary" disabled={busy || !selection}>Add</button>
        </form>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {implementations.length ? <ul className="project-rows">{implementations.map(plan => <li key={plan.id}>
        <div className="project-row-text">
          <Link to={topicPath(plan.topicId)}>{topicById.get(plan.topicId)?.title}</Link>
          <small className="muted">Knowledge version {data.knowledgeVersions?.find(version => version.id === plan.knowledgeVersionId)?.versionNumber}</small>
        </div>
        <div className="projects-inline">
          <Link className="button" to={implementationPath(plan.topicId, project.id)}>Implementation</Link>
          <button className="button" onClick={() => setUpgrading(plan.id)}>Upgrade knowledge</button>
          <button className="button" title="Remove implementation" onClick={() => setRemoving(plan.id)}><Unlink size={16} aria-hidden="true" /> Remove</button>
        </div>
      </li>)}</ul> : <p className="muted">No topics added yet.</p>}
    </section>}

    {section === 'tasks' && <section className="panel project-card">
      <h2>Project tasks</h2>
      {tasks.length ? <ul className="project-rows">{[...tasks].sort((a, b) => a.order - b.order).map(task => {
        const topicId = byImplementation.get(task.implementationId)!.topicId
        const blocked = task.status === 'blocked' || derivedBlocked.has(task.id)
        return <li key={task.id}>
          <div className="project-row-text">
            <Link to={implementationPath(topicId, project.id, task.id)}>{task.title}</Link>
            <small className="muted"><Link to={topicPath(topicId)}>{topicById.get(topicId)?.title}</Link></small>
            {!!task.dependencyIds.length && <small className="muted">Depends on {task.dependencyIds.map(id => taskLabelsById.get(id)).filter(Boolean).join(', ')}</small>}
          </div>
          <div className="projects-inline">
            <span className={task.status === 'blocked' ? 'project-status project-blocked' : 'project-status'}>{taskLabels[task.status]}</span>
            {blocked && task.status !== 'blocked' && <span className="project-status project-blocked" title="Waiting for prerequisite tasks">Blocked</span>}
          </div>
        </li>
      })}</ul> : <p className="muted">No tasks in this project yet.</p>}
    </section>}

    {section === 'artifacts' && <section className="panel project-card">
      <h2>Project artifacts</h2>
      {artifacts.length ? <ul className="project-rows">{artifacts.map(artifact => {
        const topicId = byImplementation.get(artifact.implementationId)!.topicId
        const url = artifact.url && webUrl(artifact.url)
        const relatedTask = artifact.relatedTaskId && tasks.find(task => task.id === artifact.relatedTaskId)
        const relatedTopicId = relatedTask && byImplementation.get(relatedTask.implementationId)?.topicId
        return <li key={artifact.id}>
          <div className="project-row-text">
            {url ? <a href={url} target="_blank" rel="noreferrer">{artifact.title}</a> : <strong>{artifact.title}</strong>}
            {relatedTask && relatedTopicId && <small className="muted">Related Task: <Link to={implementationPath(relatedTopicId, project.id, relatedTask.id)}>{taskLabelsById.get(relatedTask.id)}</Link></small>}
            {artifact.description && <small className="muted">{artifact.description}</small>}
          </div>
          <Link to={implementationPath(topicId, project.id)}>{topicById.get(topicId)?.title}</Link>
        </li>
      })}</ul> : <p className="muted">No artifacts in this project yet.</p>}
    </section>}

    {section === 'safeguards' && <Safeguards project={project} onSave={async (input, id) => {
      await service.saveSafeguard(project.id, input, id)
      await refresh()
    }} onDelete={async id => {
      await service.deleteSafeguard(project.id, id)
      await refresh()
    }} />}

    {section === 'agent-config' && <AgentConfig project={project} onChange={async change => {
      await service.changeAgentConfig(project.id, change)
      await refresh()
    }} />}

    {section === 'settings' && <section className="panel project-card">
      <div className="projects-heading"><h2>Project details</h2><button className="button" onClick={() => setEditing(true)}>Edit project</button></div>
      <ProjectDates project={project} />
      <div className="project-danger">
        <h3>Move project to Trash</h3>
        <p className="muted">This hides the project and its implementations. You can restore them from Trash.</p>
        <button className="button danger" onClick={() => setDeleting(true)}>Move to Trash</button>
      </div>
    </section>}

    {editing && <ProjectDialog project={project} onClose={() => setEditing(false)} onSave={async (name, description) => {
      await service.updateProject(project.id, name, description)
      await refresh()
    }} />}
    {upgrading && <ImplementationDialog title="Upgrade knowledge?" submitLabel="Upgrade knowledge" onClose={() => setUpgrading(undefined)}
      onSubmit={async () => { await service.upgradeImplementationKnowledge(upgrading); await refresh() }}>
      <p>Pin the project to the current Topic knowledge and add any missing task definitions as new tasks. Existing execution tasks keep their original content and version.</p>
    </ImplementationDialog>}
    {removePlan && <ImplementationDialog title="Remove implementation?" submitLabel="Remove" destructive
      onClose={() => setRemoving(undefined)} onSubmit={async () => {
        await service.deleteImplementation(removePlan.id)
        await refresh()
      }}><p>The implementation of {topicById.get(removePlan.topicId)?.title} in this project, including its tasks, notes, and artifacts, will be deleted.</p></ImplementationDialog>}
    {deleting && <ImplementationDialog title="Move project to Trash?" submitLabel="Move to Trash" destructive
      onClose={() => setDeleting(false)} onSubmit={async () => {
        await service.deleteProject(project.id)
        await Promise.all([refresh(), onTrashChanged()])
        navigate('/projects')
      }}><p>Move {project.name} to Trash? This hides {associatedIds.size} topic {associatedIds.size === 1 ? 'association' : 'associations'} and {implementations.length} {implementations.length === 1 ? 'implementation' : 'implementations'}. Topics will be kept.</p></ImplementationDialog>}
  </div>
}

function ProjectDates({ project }: { project: Project }) {
  return <dl className="project-dates">
    <div><dt>Created</dt><dd><time dateTime={project.createdAt}>{dates.format(new Date(project.createdAt))}</time></dd></div>
    <div><dt>Last updated</dt><dd><time dateTime={project.updatedAt}>{dates.format(new Date(project.updatedAt))}</time></dd></div>
  </dl>
}

export function Projects({ service, topics, onTrashChanged }: { service: ImplementationService; topics: readonly Topic[]; onTrashChanged: () => Promise<void> }) {
  const [data, setData] = useState<ImplementationWorkspace>()
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    service.list().then(result => { if (active) setData(result) }, problem => {
      if (active) setError(problem instanceof Error ? problem.message : 'Could not load projects.')
    })
    return () => { active = false }
  }, [service])
  if (error) return <p className="error" role="alert">{error}</p>
  if (!data) return <p role="status">Loading projects...</p>
  const props = { service, data, onTrashChanged, refresh: async () => setData(await service.list()) }
  return <Routes>
    <Route index element={<ProjectList {...props} />} />
    <Route path=":projectId" element={<ProjectDetail {...props} topics={topics} />} />
    <Route path=":projectId/:section" element={<ProjectDetail {...props} topics={topics} />} />
    <Route path="*" element={<Navigate replace to="/projects" />} />
  </Routes>
}
