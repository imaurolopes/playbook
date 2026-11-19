import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, CalendarDays, Download, Eye, GitCompareArrows, History, Plus, UserRound } from 'lucide-react'
import { compareTopicVersions, type ChangeKind, type ContentChange, type TopicVersionComparison } from '../application/compare-topic-versions'
import type { TopicWorkspace } from '../application/topic-repository'
import type { TopicService } from '../application/topic-service'
import type { Topic } from '../domain/topic'
import { captureTopicSnapshot, matchesTopicSnapshot, type TopicVersion, type VersionRelationship } from '../domain/topic-version'
import { downloadMarkdown } from './download-markdown'
import { Markdown } from './markdown'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const changeLabels: Record<ChangeKind, string> = { added: 'Added', removed: 'Removed', modified: 'Modified' }

function versionLabel(version: TopicVersion) {
  return `v${version.versionNumber}`
}

function errorMessage(problem: unknown) {
  return problem instanceof Error ? problem.message : 'Could not complete this version action.'
}

function VersionAttribution({ version }: { version: TopicVersion }) {
  return <div className="version-attribution">
    <span><CalendarDays size={15} aria-hidden="true" /><time dateTime={version.createdAt}>{dateFormat.format(new Date(version.createdAt))}</time></span>
    <span><UserRound size={15} aria-hidden="true" />{version.author}</span>
  </div>
}

function VersionLinks({ title, links }: { title: string; links: readonly VersionRelationship[] }) {
  return <section>
    <h4>{title}</h4>
    {links.length ? <ul>{links.map(link => <li key={link.id}>{link.title}{link.description && <span className="muted"> — {link.description}</span>}</li>)}</ul>
      : <p className="muted">None recorded.</p>}
  </section>
}

function SnapshotDetails({ version, id }: { version: TopicVersion; id: string }) {
  const { title, description, content, metadata, dependencies, related } = version.snapshot
  return <div className="version-snapshot" id={id}>
    <h4>{title}</h4>
    {description && <p>{description}</p>}
    <dl className="version-metadata">
      <div><dt>Scope</dt><dd>{metadata.scope}</dd></div>
      {metadata.parent && <div><dt>Parent</dt><dd>{metadata.parent.title}</dd></div>}
      {metadata.source && <div><dt>Source</dt><dd>{metadata.source.title}</dd></div>}
    </dl>
    <div className="version-snapshot-links">
      <VersionLinks title="Direct dependencies" links={dependencies} />
      <VersionLinks title="Related topics" links={related} />
    </div>
    {content.trim() && <details className="version-content"><summary>Topic content and standards</summary><Markdown content={content} /></details>}
  </div>
}

function DiffValues({ before, after }: { before?: string; after?: string }) {
  return <div className="version-diff-values">
    {before !== undefined && <div className="version-diff-removed"><span>Before</span><pre>{before || 'Empty'}</pre></div>}
    {after !== undefined && <div className="version-diff-added"><span>After</span><pre>{after || 'Empty'}</pre></div>}
  </div>
}

function LinkChanges({ title, changes }: { title: string; changes: TopicVersionComparison['dependencies'] }) {
  if (!changes.length) return null
  return <section className="version-diff-section"><h3>{title}</h3>
    <ul>{changes.map(({ kind, before, after }) => {
      const link = (after ?? before)!
      return <li key={link.id}><strong>{changeLabels[kind]} · {link.title}</strong>
        <DiffValues before={before && (before.description || before.title)} after={after && (after.description || after.title)} />
      </li>
    })}</ul>
  </section>
}

function ContentChanges({ changes }: { changes: ContentChange[] }) {
  if (!changes.length) return null
  return <section className="version-diff-section"><h3>Topic content and standards</h3>
    <ol>{changes.map(({ kind, before, after }, index) => <li key={index}>
      <strong>{changeLabels[kind]}</strong><DiffValues before={before} after={after} />
    </li>)}</ol>
  </section>
}

function VersionComparison({ comparison }: { comparison: { from: TopicVersion; to: TopicVersion; changes: TopicVersionComparison } }) {
  const { from, to, changes } = comparison
  return <section className="panel version-comparison" aria-labelledby="version-comparison-title">
    <h2 id="version-comparison-title">{versionLabel(from)} → {versionLabel(to)}</h2>
    {Object.values(changes).every(items => !items.length) && <p className="muted">These snapshots contain the same topic knowledge.</p>}
    {([{ title: 'Topic fields', fields: changes.fields }, { title: 'Metadata', fields: changes.metadata }]).map(({ title, fields }) =>
      fields.length > 0 && <section className="version-diff-section" key={title}><h3>{title}</h3>
        <ul>{fields.map(field => <li key={field.label}><strong>{field.label}</strong>
          <DiffValues before={field.before ?? 'None'} after={field.after ?? 'None'} />
        </li>)}</ul>
      </section>,
    )}
    <ContentChanges changes={changes.content} />
    <LinkChanges title="Direct dependencies" changes={changes.dependencies} />
    <LinkChanges title="Related topics" changes={changes.related} />
  </section>
}

function exportSnapshot(version: TopicVersion) {
  const { title, description, content, metadata, dependencies, related } = version.snapshot
  const relations = (heading: string, links: readonly VersionRelationship[]) => links.length
    ? [heading, links.map(link => `- ${link.title}${link.description ? ` — ${link.description}` : ''}`).join('\n')] : []
  const document = [
    `# ${title} — ${versionLabel(version)}`,
    `Change summary: ${version.summary}\n\nAuthor: ${version.author}\n\nCreated: ${version.createdAt}`,
    description,
    ['## Metadata', `- Scope: ${metadata.scope}`, metadata.parent && `- Parent: ${metadata.parent.title}`,
      metadata.source && `- Source: ${metadata.source.title}`].filter(Boolean).join('\n'),
    ...relations('## Direct dependencies', dependencies),
    ...relations('## Related topics', related),
    content,
  ].filter(Boolean).join('\n\n') + '\n'
  const slug = title.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 100)
  downloadMarkdown(document, `${slug || 'topic'}-${versionLabel(version)}.md`)
}

function VersionDialog({ restore, hasOpenEditor, onClose, onSubmit }: {
  restore?: TopicVersion
  hasOpenEditor: boolean
  onClose: () => void
  onSubmit: (summary: string) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])

  return <dialog ref={dialog} className="panel delete-dialog version-dialog" aria-labelledby="version-dialog-title"
    onClose={onClose} onCancel={event => { if (busy) event.preventDefault() }}>
    <h2 id="version-dialog-title">{restore ? `Restore ${versionLabel(restore)}?` : 'Create version'}</h2>
    <form onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      setBusy(true)
      setError('')
      try {
        await onSubmit(summary)
        dialog.current?.close()
        onClose()
      } catch (problem) {
        setError(errorMessage(problem))
      } finally {
        setBusy(false)
      }
    }}>
      <fieldset disabled={busy}>
        {restore ? <p>This replaces the current title, description, content and standards, topic metadata, direct dependencies, and related topics.
          The current state is saved as a new version first. Project implementations and instruction drafts are preserved.</p>
          : <label className="version-field">Change summary
            <textarea className="field" required rows={4} value={summary} onChange={event => setSummary(event.target.value)} autoFocus />
          </label>}
        {restore && hasOpenEditor && <p>Restoring also discards unsaved changes in the open Content editor.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="editor-actions">
          <button type="button" className="button" autoFocus={Boolean(restore)} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className="button primary">{busy ? 'Saving…' : restore ? 'Restore version' : 'Create version'}</button>
        </div>
      </fieldset>
    </form>
  </dialog>
}

export function VersionHistory({ topic, workspace, service, hasOpenEditor, onRestored }: {
  topic: Topic
  workspace: TopicWorkspace
  service: TopicService
  hasOpenEditor: boolean
  onRestored: (workspace: TopicWorkspace) => void
}) {
  const [versions, setVersions] = useState<TopicVersion[]>()
  const [selectedId, setSelectedId] = useState<string>()
  const [fromId, setFromId] = useState<string>()
  const [toId, setToId] = useState<string>()
  const [comparison, setComparison] = useState<{ from: TopicVersion; to: TopicVersion; changes: TopicVersionComparison }>()
  const [dialog, setDialog] = useState<'create' | TopicVersion>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const comparisonPanel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    service.versions(topic.id).then(items => { if (active) setVersions(items) }, problem => {
      if (active) setError(errorMessage(problem))
    })
    return () => { active = false }
  }, [topic.id, service, attempt])
  const latest = versions?.[0]
  const selected = versions?.find(version => version.id === selectedId) ?? latest
  const from = versions?.find(version => version.id === fromId) ?? versions?.[1]
  const to = versions?.find(version => version.id === toId) ?? latest
  const live = captureTopicSnapshot(topic, workspace.topics, workspace.relationships)
  const current = versions?.find(version => matchesTopicSnapshot(version.snapshot, live))

  function compare(from: TopicVersion, to: TopicVersion) {
    setFromId(from.id)
    setToId(to.id)
    setComparison({ from, to, changes: compareTopicVersions(from.snapshot, to.snapshot) })
    requestAnimationFrame(() => comparisonPanel.current?.focus())
  }

  async function save(summary: string) {
    if (!dialog) return
    if (dialog === 'create') {
      const created = await service.createVersion(topic.id, summary)
      setVersions(previous => [created, ...(previous ?? [])])
      setSelectedId(created.id)
      setMessage(`${versionLabel(created)} created.`)
    } else {
      const { workspace, version, backup } = await service.restoreVersion(topic.id, dialog.id)
      onRestored(workspace)
      setVersions(previous => [version, backup, ...(previous ?? [])])
      setSelectedId(version.id)
      setMessage(`${versionLabel(version)} restored from ${versionLabel(dialog)}. The previous state was saved as ${versionLabel(backup)}.`)
    }
  }

  return <div className="version-history">
    <section className="panel version-timeline-panel" aria-labelledby="version-history-title">
      <h2 id="version-history-title">Version history</h2>
      {!versions ? error ? <div>
        <p className="error" role="alert">{error}</p>
        <button className="button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Try again</button>
      </div> : <p className="muted" role="status">Loading versions…</p>
        : versions.length === 0 ? <p className="muted">No versions yet. Create a version to capture the current topic.</p>
          : <ol className="version-timeline">{versions.map(version => {
            const isSelected = selected?.id === version.id
            const isCurrent = current?.id === version.id
            const detailsId = `snapshot-${version.id}`
            return <li key={version.id} className="version-entry" data-current={isCurrent || undefined} data-selected={isSelected || undefined}>
              <div className="version-entry-info">
                <h3>{versionLabel(version)} {isCurrent ? <span className="version-pill is-current">Current</span>
                  : latest?.id === version.id && <span className="version-pill">Latest</span>}</h3>
                <VersionAttribution version={version} />
                <p>{version.summary}</p>
              </div>
              <div className="version-entry-actions">
                <button className="button" aria-expanded={isSelected} aria-controls={isSelected ? detailsId : undefined}
                  aria-label={`View ${versionLabel(version)}`} onClick={() => setSelectedId(version.id)}><Eye size={15} /> View</button>
                {versions.length >= 2 && <button className="button" aria-label={`Compare ${versionLabel(version)}`} onClick={() => {
                  if (latest && latest.id !== version.id) compare(version, latest)
                  else if (versions[1]) compare(versions[1], version)
                }}><GitCompareArrows size={15} /> Compare</button>}
              </div>
              {isSelected && <SnapshotDetails id={detailsId} version={version} />}
            </li>
          })}</ol>}
    </section>
    <aside className="version-sidebar" aria-label="Version controls">
      <section className="panel" aria-labelledby="version-compare-title">
        <h2 id="version-compare-title">Compare versions</h2>
        <div className="version-compare-fields">
          <label className="version-field">From
            <select className="field" value={from?.id ?? ''} disabled={!versions || versions.length < 2} onChange={event => setFromId(event.target.value)}>
              {!from && <option value="">Choose version</option>}
              {versions?.map(version => <option key={version.id} value={version.id}>{versionLabel(version)}</option>)}
            </select>
          </label>
          <button className="button icon-button" aria-label="Swap versions" title="Swap versions" disabled={!from || !to || from.id === to.id} onClick={() => {
            if (from && to) { setFromId(to.id); setToId(from.id) }
          }}><ArrowLeftRight size={16} /></button>
          <label className="version-field">To
            <select className="field" value={to?.id ?? ''} disabled={!versions || versions.length < 2} onChange={event => setToId(event.target.value)}>
              {!to && <option value="">Choose version</option>}
              {versions?.map(version => <option key={version.id} value={version.id}>{versionLabel(version)}</option>)}
            </select>
          </label>
        </div>
        <button className="button primary version-full-button" disabled={!from || !to || from.id === to.id} onClick={() => {
          if (from && to) compare(from, to)
        }}><GitCompareArrows size={16} /> Compare changes</button>
        {versions && versions.length < 2 && <p className="muted">Save at least two versions to compare them.</p>}
      </section>
      <section className="panel" aria-labelledby="version-current-title">
        <h2 id="version-current-title">Current version</h2>
        {current ? <><strong className="green">{versionLabel(current)}</strong><VersionAttribution version={current} /></>
          : <p className="muted">{latest ? `The current topic differs from the saved versions. Latest saved version: ${versionLabel(latest)}.`
            : 'The current topic has no saved version.'}</p>}
      </section>
      <section className="panel" aria-labelledby="version-actions-title">
        <h2 id="version-actions-title">Actions</h2>
        <button className="button version-full-button" disabled={!versions} onClick={() => setDialog('create')}><Plus size={17} /> Create version</button>
        <button className="button version-full-button" disabled={!selected || selected.id === current?.id} onClick={() => { if (selected) setDialog(selected) }}>
          <History size={17} /> Restore selected version
        </button>
        <button className="button version-full-button" disabled={!selected} onClick={() => { if (selected) exportSnapshot(selected) }}>
          <Download size={17} /> Export Markdown
        </button>
        <div className={message ? 'version-notice green' : 'sr-only'} role="status">{message}</div>
      </section>
    </aside>
    {comparison && <div ref={comparisonPanel} className="version-comparison-wrap" tabIndex={-1}><VersionComparison comparison={comparison} /></div>}
    {dialog && <VersionDialog restore={dialog === 'create' ? undefined : dialog} hasOpenEditor={hasOpenEditor}
      onClose={() => setDialog(undefined)} onSubmit={save} />}
  </div>
}
