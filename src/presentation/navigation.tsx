import { useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router'
import {
  BookOpen, Bot, ChevronDown, ChevronRight, FileText, Folder, FolderClosed, GitFork,
  House, Layers3, Plus, Search, Settings, Trash2, Users, Library, Command,
} from 'lucide-react'
import type { Topic } from '../domain/topic'

export const topicPath = (id: string, tab = 'content') => '/topics/' + encodeURIComponent(id) + '/' + tab
const mainItems = [
  [FolderClosed, 'Topics'], [Folder, 'Projects'], [Bot, 'Agents'], [Library, 'Library'], [Users, 'People'],
] as const
const sideItems = [
  [House, 'Overview'], [FolderClosed, 'Topics'], [GitFork, 'Dependency graph'],
  [FileText, 'Templates'], [BookOpen, 'Playbooks'], [Trash2, 'Trash'],
] as const

export function Shell({ children, count, focusSearch }: { children: ReactNode; count?: number; focusSearch: () => void }) {
  return <>
    <header className="topbar">
      <Link to="/" className="brand"><Layers3 size={34} strokeWidth={2.8} /> <span>AI Engineering Playbook</span></Link>
      <nav className="top-nav" aria-label="Main navigation">
        {mainItems.map(([Icon, label]) => label === 'Topics'
          ? <Link key={label} to="/" className="nav-current" aria-current="page"><Icon />{label}</Link>
          : <span key={label} className="future" title="Planned for a future sprint"><Icon />{label}</span>)}
      </nav>
      <button className="global-search field" onClick={focusSearch}><Search size={19} /> Search topics <kbd><Command size={12} /> / Ctrl + K</kbd></button>
    </header>
    <div className="app-grid">
      <aside className="main-sidebar" aria-label="Workspace navigation">
        <div className="workspace-label">Workspace</div>
        <div className="workspace-name"><Layers3 size={17} /> My Playbook</div>
        <nav aria-label="Workspace">
          {sideItems.map(([Icon, label]) => label === 'Topics'
            ? <Link key={label} to="/" className="nav-current" aria-current="page"><Icon />{label}</Link>
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
      {children}
    </div>
  </>
}

interface TopicTreeProps {
  topics: readonly Topic[]
  selectedId?: string
  query: string
  setQuery: (query: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  ready: boolean
}

export function TopicTree({ topics, selectedId, query, setQuery, searchRef, ready }: TopicTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [mobileOpen, setMobileOpen] = useState(true)
  const tree = new Map<string | undefined, Topic[]>()
  for (const topic of topics) {
    const siblings = tree.get(topic.parentId) ?? []
    siblings.push(topic)
    tree.set(topic.parentId, siblings)
  }
  const search = query.trim().toLocaleLowerCase()

  function renderTree(items: readonly Topic[], flat = false) {
    return <ul className="tree-list">{items.map(topic => {
      const children = flat ? [] : tree.get(topic.id) ?? []
      const isOpen = !collapsed.has(topic.id)
      const Icon = children.length ? Folder : FileText
      return <li key={topic.id}>
        <div className={'tree-row' + (selectedId === topic.id ? ' selected' : '')}>
          {children.length > 0 && <button className="tree-toggle" aria-expanded={isOpen} aria-label={(isOpen ? 'Collapse ' : 'Expand ') + topic.title} onClick={() => setCollapsed(previous => {
            const next = new Set(previous)
            if (isOpen) next.add(topic.id)
            else next.delete(topic.id)
            return next
          })}>{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>}
          <Link to={topicPath(topic.id)} aria-current={selectedId === topic.id ? 'page' : undefined}>
            <Icon size={19} /><span>{topic.title}</span>
            {children.length > 0 && <span className="tree-count">{children.length}</span>}
          </Link>
        </div>
        {isOpen && children.length > 0 && renderTree(children)}
      </li>
    })}</ul>
  }

  const matches = search ? topics.filter(topic => topic.title.toLocaleLowerCase().includes(search)) : []
  return <aside className={'topics-sidebar' + (mobileOpen ? '' : ' topics-collapsed')} aria-label="Topic browser">
    <div className="topics-heading">
      <h2>Topics</h2>
      <button className="mobile-tree-toggle button" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen}>{mobileOpen ? 'Hide list' : 'Show list'}</button>
      {ready && <Link className="button primary" to="/topics/new"><Plus size={18} /> New</Link>}
    </div>
    <div className="topics-body">
      <label className="field topic-search"><Search size={19} /><input ref={searchRef} value={query} onFocus={() => setMobileOpen(true)} onChange={event => setQuery(event.target.value)} placeholder="Search topics..." aria-label="Search topics by title" type="search" /></label>
      {ready && (search
        ? matches.length ? renderTree(matches, true) : <p className="muted tree-message" role="status">No topics match your search.</p>
        : topics.length ? renderTree(tree.get(undefined) ?? []) : <p className="muted tree-message">No topics yet.</p>)}
    </div>
  </aside>
}
