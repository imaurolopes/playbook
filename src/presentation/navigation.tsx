import { useState, type ReactNode, type RefObject } from 'react'
import { Link, useMatch } from 'react-router'
import {
  BookOpen, Bot, FileText, Folder, FolderClosed, GitFork,
  House, Layers3, Plus, Search, Settings, Trash2, Users, Library, Command,
} from 'lucide-react'
import type { Topic } from '../domain/topic'

export const topicPath = (id: string, tab = 'content') => '/topics/' + encodeURIComponent(id) + '/' + tab
const mainItems = [
  [FolderClosed, 'Topics'], [Folder, 'Projects'], [Bot, 'Agents'], [Library, 'Library'], [Users, 'People'], [Trash2, 'Trash'],
] as const
const sideItems = [
  [House, 'Overview'], [FolderClosed, 'Topics'], [GitFork, 'Dependency graph'],
  [FileText, 'Templates'], [BookOpen, 'Playbooks'], [Trash2, 'Trash'],
] as const

export function Shell({ children, count, trashCount, focusSearch, topicsSidebar }: { children: ReactNode; count?: number; trashCount: number; focusSearch: () => void; topicsSidebar?: ReactNode }) {
  const inTrash = Boolean(useMatch('/trash'))
  function navigationLink(label: 'Topics' | 'Trash', Icon: typeof Trash2) {
    const trash = label === 'Trash'
    const selected = trash ? inTrash : Boolean(topicsSidebar)
    return <Link key={label} to={trash ? '/trash' : '/'} className={`${trash ? 'trash-nav-link ' : ''}${selected ? 'nav-current' : ''}`}
      aria-current={selected ? 'page' : undefined} aria-label={trash ? `Trash (${trashCount})` : undefined}>
      <Icon aria-hidden="true" />{label}{trash && <span className="trash-nav-count">{trashCount}</span>}
    </Link>
  }

  return <>
    <header className="topbar">
      <Link to="/" className="brand"><Layers3 size={34} strokeWidth={2.8} /> <span>AI Engineering Playbook</span></Link>
      <nav className="top-nav" aria-label="Main navigation">
        {mainItems.map(([Icon, label]) => label === 'Topics' || label === 'Trash'
          ? navigationLink(label, Icon)
          : <span key={label} className="future" title="Planned for a future sprint"><Icon />{label}</span>)}
      </nav>
      <button className="global-search field" onClick={focusSearch}><Search size={19} /> Search topics <kbd><Command size={12} /> / Ctrl + K</kbd></button>
    </header>
    <div className={topicsSidebar ? 'app-grid with-topics-sidebar' : 'app-grid'}>
      <aside className="main-sidebar" aria-label="Workspace navigation">
        <div className="workspace-label">Workspace</div>
        <div className="workspace-name"><Layers3 size={17} /> My Playbook</div>
        <nav aria-label="Workspace">
          {sideItems.map(([Icon, label]) => label === 'Topics' || label === 'Trash'
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
      </aside>
      {topicsSidebar}
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
}

export function TopicList({ topics, selectedId, query, setQuery, searchRef, ready }: TopicListProps) {
  const [mobileOpen, setMobileOpen] = useState(true)
  const search = query.trim().toLocaleLowerCase()
  const matches = search ? topics.filter(topic => topic.title.toLocaleLowerCase().includes(search)) : topics

  return <aside className={'topics-sidebar' + (mobileOpen ? '' : ' topics-collapsed')} aria-label="Topic browser">
    <div className="topics-heading">
      <h2>Topics</h2>
      <button className="mobile-tree-toggle button" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen}>{mobileOpen ? 'Hide list' : 'Show list'}</button>
      {ready && <Link className="button primary" to="/topics/new"><Plus size={18} /> New</Link>}
    </div>
    <div className="topics-body">
      <label className="field topic-search"><Search size={19} /><input ref={searchRef} value={query} onFocus={() => setMobileOpen(true)} onChange={event => setQuery(event.target.value)} placeholder="Search topics..." aria-label="Search topics by title" type="search" /></label>
      {ready && (matches.length ? <ul className="tree-list">{matches.map(topic => {
        const selected = topic.id === selectedId
        return <li key={topic.id} className={'tree-row' + (selected ? ' selected' : '')}>
          <Link to={topicPath(topic.id)} aria-current={selected ? 'page' : undefined}>
            <FileText size={19} /><span>{topic.title}</span>
          </Link>
        </li>
      })}</ul> : <p className="muted tree-message" role="status">{search ? 'No topics match your search.' : 'No topics yet.'}</p>)}
    </div>
  </aside>
}
