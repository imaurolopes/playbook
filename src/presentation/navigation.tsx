import { useState, type ReactNode, type RefObject } from 'react'
import { Link, useMatch } from 'react-router'
import {
  BookOpen, Bot, FileText, Folder, FolderClosed, GitFork,
  House, Layers3, Plus, Search, Settings, Trash2, Users, Library, Command,
} from 'lucide-react'
import type { Topic } from '../domain/topic'
import { topicTypeDisplay } from './topic-types'
import { TopicActions, type TopicAction } from './TopicActions'
import { SidebarResizeHandle, useSidebarLayout } from './sidebar-layout'
import { DockedSidebar } from './DockedSidebar'
import type { TrashEntityType } from '../domain/trash'

export const entityIcons = { topic: FolderClosed, project: Folder } satisfies Record<TrashEntityType, typeof Trash2>
export const topicPath = (id: string, tab = 'content') => '/topics/' + encodeURIComponent(id) + '/' + tab
export const projectPath = (id: string, section = 'overview') => '/projects/' + encodeURIComponent(id) + '/' + section
const mainItems = [
  [entityIcons.topic, 'Topics'], [entityIcons.project, 'Projects'], [Bot, 'Agents'], [Library, 'Library'], [Users, 'People'], [Trash2, 'Trash'],
] as const
const sideItems = [
  [House, 'Overview'], [entityIcons.topic, 'Topics'], [entityIcons.project, 'Projects'], [GitFork, 'Dependency graph'],
  [FileText, 'Templates'], [BookOpen, 'Playbooks'], [Trash2, 'Trash'],
] as const

export function Shell({ children, count, trashCount, focusSearch, topicsSidebar, searchRequest, focusSearchInput }: {
  children: ReactNode; count?: number; trashCount: number; focusSearch: () => void
  topicsSidebar?: (resizeHandle?: ReactNode, pin?: ReactNode) => ReactNode
  searchRequest: number
  focusSearchInput: () => void
}) {
  const inTrash = Boolean(useMatch('/trash'))
  const inProjects = Boolean(useMatch('/projects/*'))
  const inTemplates = Boolean(useMatch('/templates'))
  const { grid, layout, dragging, docking, handleProps, pins, togglePin, expandedWidth } = useSidebarLayout(Boolean(topicsSidebar))
  const columns = [layout.widths.workspace, layout.widths.topics].filter(width => width > 0).map(width => `${width}px`)
  function navigationLink(label: 'Topics' | 'Trash' | 'Projects' | 'Templates', Icon: typeof Trash2) {
    const trash = label === 'Trash'
    const path = label === 'Topics' ? '/' : '/' + label.toLowerCase()
    const selected = { Topics: Boolean(topicsSidebar), Trash: inTrash, Projects: inProjects, Templates: inTemplates }[label]
    return <Link key={label} to={path} className={`${label.toLowerCase()}-nav-link${selected ? ' nav-current' : ''}`}
      aria-current={selected ? 'page' : undefined} aria-label={trash ? `Trash (${trashCount})` : undefined}>
      <Icon aria-hidden="true" />{label}{trash && <span className="trash-nav-count">{trashCount}</span>}
    </Link>
  }

  return <>
    <header className="topbar">
      <Link to="/" className="brand"><Layers3 size={34} strokeWidth={2.8} /> <span>AI Engineering Playbook</span></Link>
      <nav className="top-nav" aria-label="Main navigation">
        {mainItems.map(([Icon, label]) => label === 'Topics' || label === 'Trash' || label === 'Projects'
          ? navigationLink(label, Icon)
          : <span key={label} className="future" title="Planned for a future sprint"><Icon />{label}</span>)}
        {!layout.workspaceVisible && navigationLink('Templates', FileText)}
      </nav>
      <button className="global-search field" onClick={focusSearch}><Search size={19} /> Search topics <kbd><Command size={12} /> / Ctrl + K</kbd></button>
    </header>
    <div className="app-grid" ref={grid} data-docking={docking || undefined}
      data-topics-stacked={layout.topicsStacked || undefined} data-resizing={dragging}
      style={{ gridTemplateColumns: [...columns, 'minmax(0, 1fr)'].join(' ') }}>
      {layout.workspaceVisible && <DockedSidebar label="Workspace navigation" railLabel="Workspace" railIcon={Layers3} panelId="workspace-sidebar" pinned={pins.workspace}
        width={expandedWidth('workspace')} onTogglePin={() => togglePin('workspace')}>{pin =>
      <aside className="main-sidebar" id="workspace-sidebar" aria-label="Workspace navigation">
        <div className="workspace-label sidebar-heading">Workspace{pin}</div>
        <div className="workspace-name"><Layers3 size={17} /> My Playbook</div>
        <nav aria-label="Workspace">
          {sideItems.map(([Icon, label]) => label === 'Topics' || label === 'Trash' || label === 'Projects' || label === 'Templates'
            ? navigationLink(label, Icon)
            : <span key={label} className="future" title="Planned for a future sprint"><Icon />{label}</span>)}
        </nav>
        <div className="sidebar-bottom">
          <section className="storage">
            <strong>Local storage</strong>
            <div>{count === undefined ? 'Browser workspace' : count + (count === 1 ? ' topic stored' : ' topics stored')}</div>
          </section>
          <span className="future settings" title="Planned for a future sprint"><Settings />Settings</span>
        </div>
        {pins.workspace && <SidebarResizeHandle {...handleProps('workspace')} panelId="workspace-sidebar" label="Resize Workspace navigation" />}
      </aside>}</DockedSidebar>}
      {topicsSidebar && <DockedSidebar label="Topics sidebar" railLabel="Topics" railIcon={entityIcons.topic} panelId="topics-sidebar" pinned={layout.topicsStacked || pins.topics}
        width={expandedWidth('topics')} onTogglePin={() => togglePin('topics')} focusRequest={searchRequest} onFocusRequest={focusSearchInput}>
        {pin => topicsSidebar(layout.widths.topics > 0 && pins.topics && !layout.topicsStacked
          ? <SidebarResizeHandle {...handleProps('topics')} panelId="topics-sidebar" label="Resize Topics sidebar" /> : undefined,
          layout.topicsStacked ? undefined : pin)}
      </DockedSidebar>}
      {children}
    </div>
  </>
}

interface TopicListProps {
  topics: readonly Topic[]
  selectedId?: string
  query: string
  setQuery: (query: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  ready: boolean
  onTopicAction: (action: TopicAction, topic: Topic) => void
  resizeHandle?: ReactNode
  pin?: ReactNode
}

export function TopicList({ topics, selectedId, query, setQuery, searchRef, ready, onTopicAction, resizeHandle, pin }: TopicListProps) {
  const [mobileOpen, setMobileOpen] = useState(true)
  const search = query.trim().toLocaleLowerCase()
  const matches = search ? topics.filter(topic => topic.title.toLocaleLowerCase().includes(search)) : topics

  return <aside className={'topics-sidebar' + (mobileOpen ? '' : ' topics-collapsed')} id="topics-sidebar" aria-label="Topic browser">
    <div className="topics-heading">
      <h2>Topics</h2>
      <button className="mobile-tree-toggle button" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen}>{mobileOpen ? 'Hide list' : 'Show list'}</button>
      {ready && <Link className="button primary" to="/topics/new"><Plus size={18} /> New</Link>}
      {pin}
    </div>
    <div className="topics-body">
      <label className="field topic-search"><Search size={19} /><input ref={searchRef} value={query} onFocus={() => setMobileOpen(true)} onChange={event => setQuery(event.target.value)} placeholder="Search topics..." aria-label="Search topics by title" type="search" /></label>
      {ready && (matches.length ? <ul className="tree-list">{matches.map(topic => {
        const selected = topic.id === selectedId
        const { icon: TopicIcon, color } = topicTypeDisplay[topic.type]
        return <li key={topic.id} className={'tree-row' + (selected ? ' selected' : '')}>
          <Link to={topicPath(topic.id)} aria-current={selected ? 'page' : undefined}>
            <TopicIcon size={19} style={{ color }} aria-hidden="true" /><span>{topic.title}</span>
          </Link>
          <TopicActions title={topic.title} onAction={action => onTopicAction(action, topic)} />
        </li>
      })}</ul> : <p className="muted tree-message" role="status">{search ? 'No topics match your search.' : 'No topics yet.'}</p>)}
    </div>
    {resizeHandle}
  </aside>
}
