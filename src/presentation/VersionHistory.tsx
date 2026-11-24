import { technicalDomainsFor, typedCustomProperty } from '../domain/topic-metadata'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, CalendarDays, Eye, GitCompareArrows, History, Plus, UserRound } from 'lucide-react'
import { compareTopicVersions, hasTopicVersionChanges, type ChangeKind, type ContentChange, type TopicVersionComparison } from '../application/compare-topic-versions'
import type { TopicWorkspace } from '../application/topic-repository'
import type { TopicService } from '../application/topic-service'
import type { Topic } from '../domain/topic'
import type { TopicSnapshot, TopicVersion, VersionRelationship } from '../domain/topic-version'
import { ContextActions } from './TopicActions'
import { Markdown } from './markdown'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const changeLabels: Record<ChangeKind, string> = { added: 'Added', removed: 'Removed', modified: 'Modified' }
const versionActions = [{ id: 'view', label: 'View', Icon: Eye }, { id: 'restore', label: 'Restore', Icon: History }] as const

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

function checklistMarkdown(snapshot: TopicSnapshot) {
  const titles = new Map(snapshot.taskDefinitions?.map(task => [task.id, task.title]))
  return snapshot.taskDefinitions?.map((task, index) => [
    `### ${index + 1}. ${task.title}`,
    task.description,
    task.dependencyIds.length && 'Depends on: ' + task.dependencyIds.map(id => titles.get(id) ?? id).join(', '),
    task.criteria.length && 'Acceptance criteria\n\n' + [...task.criteria].sort((a, b) => a.order - b.order)
      .map(criterion => '- ' + criterion.description).join('\n'),
    task.references.length && 'References\n\n' + task.references.map(reference =>
      '- ' + (reference.kind === 'topic' ? reference.topicId : reference.title + (reference.url ? ' — ' + reference.url : ''))).join('\n'),
  ].filter(Boolean).join('\n\n')).join('\n\n')
}

function SnapshotDetails({ version, id }: { version: TopicVersion; id: string }) {
  const { title, type, description, content, metadata, dependencies, related, dependents, taskDefinitions, knowledgeSections } = version.snapshot
  const domains = technicalDomainsFor(metadata.details)
  return <div className="version-snapshot" id={id}>
    <h4>{title}</h4>
    {description && <p>{description}</p>}
    <dl className="version-metadata">
      <div><dt>Topic type</dt><dd>{type ?? 'Not recorded'}</dd></div>
      {metadata.source && <div><dt>Source</dt><dd>{metadata.source.title}</dd></div>}
      {domains.length > 0 && <div><dt>Technical domains</dt><dd>{domains.join(', ')}</dd></div>}
      {metadata.details?.tags.length ? <div><dt>Tags</dt><dd>{metadata.details.tags.join(', ')}</dd></div> : null}
      {metadata.details?.customProperties.map(property => {
        const { id, key, type, value } = typedCustomProperty(property)
        return <div key={id}><dt>{key} <span className="muted">({type})</span></dt><dd>{String(value)}</dd></div>
      })}
    </dl>
    {!metadata.details && <p className="muted">Classification metadata was not recorded in this snapshot.</p>}
    <div className="version-snapshot-links">
      <VersionLinks title="Direct dependencies" links={dependencies} />
      {dependents?.length ? <VersionLinks title="Required by" links={dependents} /> : null}
      <VersionLinks title="Related topics" links={related} />
    </div>
    {content.trim() && <details className="version-content"><summary>Topic content and standards</summary><Markdown content={content} /></details>}
    {knowledgeSections?.map(section => <details key={section.id} className="version-content">
      <summary>{section.title}</summary><Markdown content={section.content} />
    </details>)}
    {taskDefinitions && <details className="version-content"><summary>Checklist ({taskDefinitions.length})</summary>
      {taskDefinitions.length ? <Markdown content={checklistMarkdown(version.snapshot) ?? ''} /> : <p>No tasks recorded.</p>}
    </details>}
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
    {!hasTopicVersionChanges(changes) && <p className="muted">These snapshots contain the same topic knowledge.</p>}
    {([{ title: 'Topic fields', fields: changes.fields }, { title: 'Metadata', fields: changes.metadata },
      { title: 'Checklist', fields: changes.implementation }, { title: 'Knowledge sections and standards', fields: changes.standards }]).map(({ title, fields }) =>
      fields.length > 0 && <section className="version-diff-section" key={title}><h3>{title}</h3>
        <ul>{fields.map(field => <li key={'id' in field ? String(field.id) : field.label}><strong>{field.label}</strong>
          <DiffValues before={field.before ?? 'None'} after={field.after ?? 'None'} />
        </li>)}</ul>
      </section>,
    )}
    <ContentChanges changes={changes.content} />
    <LinkChanges title="Direct dependencies" changes={changes.dependencies} />
    <LinkChanges title="Required by" changes={changes.dependents} />
    <LinkChanges title="Related topics" changes={changes.related} />
  </section>
}

function DetectedChanges({ changes }: { changes?: TopicVersionComparison }) {
  if (!changes) return <p className="muted">An initial knowledge snapshot will be created.</p>
  if (!hasTopicVersionChanges(changes)) return <p className="muted">No meaningful changes since the latest saved version.</p>

  const changeKind = (before?: string, after?: string): ChangeKind => before === undefined ? 'added' : after === undefined ? 'removed' : 'modified'
  const describeFields = (fields: { label: string; before?: string; after?: string; details?: string[] }[]) =>
    fields.map(field => ({ label: field.label, kind: changeKind(field.before, field.after), details: field.details }))
  const describeLinks = (links: TopicVersionComparison['dependencies']) =>
    links.map(link => ({ label: (link.after ?? link.before)!.title, kind: link.kind }))
  const categories: { label: string; items: { label: string; kind: ChangeKind; details?: string[] }[] }[] = [
    { label: 'Topic details', items: describeFields(changes.fields) },
    { label: 'Context', items: [...new Set(changes.content.map(change => change.kind))].map(kind => ({ label: 'Content', kind })) },
    { label: 'Dependencies', items: describeLinks(changes.dependencies) },
    { label: 'Required by', items: describeLinks(changes.dependents) },
    { label: 'Related topics', items: describeLinks(changes.related) },
    { label: 'Standards and knowledge sections', items: describeFields(changes.standards) },
    { label: 'Checklist', items: describeFields(changes.implementation) },
    { label: 'Metadata', items: describeFields(changes.metadata) },
  ]
  const groups = categories.filter(group => group.items.length)
  return <div className="version-detected-list">{groups.map(group => <div key={group.label}>
    <h4>{group.label}</h4>
    <ul>{group.items.map((item, index) => <li key={index}>
      <span className={`version-change-tag is-${item.kind}`}>{changeLabels[item.kind]}</span>
      {item.label}{item.details?.length ? ` · ${item.details.join(', ')}` : ''}
    </li>)}</ul>
  </div>)}</div>
}

function VersionDialog({ restore, latest, changes, hasOpenEditor, onClose, onSubmit }: {
  restore?: TopicVersion
  latest?: TopicVersion
  changes?: TopicVersionComparison
  hasOpenEditor: boolean
  onClose: () => void
  onSubmit: (summary: string) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const noChanges = !restore && Boolean(latest) && (!changes || !hasTopicVersionChanges(changes))
  const needsSummary = !restore && !summary.trim()
  const disabledReason = noChanges ? 'No meaningful changes since the latest saved version.' :
    needsSummary ? 'Enter a change summary to create this version.' : undefined
  const next = (latest?.versionNumber ?? 0) + 1
  useEffect(() => { dialog.current?.showModal() }, [])

  return <dialog ref={dialog} className={`panel delete-dialog version-dialog${restore ? '' : ' version-create-dialog'}`} aria-labelledby="version-dialog-title"
    onClose={onClose} onCancel={event => { if (busy) event.preventDefault() }}>
    <h2 id="version-dialog-title">{restore ? `Restore ${versionLabel(restore)}?` : 'Create version'}</h2>
    <form onSubmit={async event => {
      event.preventDefault()
      if (busy || disabledReason) return
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
        {restore ? <p>This restores the saved Topic classification, summary, content, standards, Checklist, metadata, direct dependencies, and related topics where captured.
          The current state is saved as a new version first. Project implementations and instruction drafts are preserved.</p>
          : <div className="version-create-fields">
            <dl className="version-metadata">
              <div><dt>Previous version</dt><dd>{latest ? versionLabel(latest) : 'No previous version'}</dd></div>
              <div><dt>New version</dt><dd>v{next}</dd></div>
            </dl>
            <label className="version-field">Change summary
              <textarea className="field" required rows={4} value={summary} onChange={event => setSummary(event.target.value)} autoFocus={!noChanges} />
            </label>
            <section aria-labelledby="version-detected-title">
              <h3 id="version-detected-title">Changes detected</h3>
              <DetectedChanges changes={changes} />
            </section>
            <p className="muted">This version creates an immutable snapshot of the current knowledge. Existing projects will not be affected.</p>
          </div>}
        {restore && hasOpenEditor && <p>Restoring also discards unsaved changes in the open Content editor.</p>}
        {restore && changes && hasTopicVersionChanges(changes) && <p className="version-restore-warning">
          The Working version has unversioned changes. A backup version will preserve them before restoration.
        </p>}
        {error && <p className="error" role="alert">{error}</p>}
        {disabledReason && <p id="version-create-disabled" className={noChanges ? 'sr-only' : 'muted'}>{disabledReason}</p>}
        <div className="editor-actions">
          <button type="button" className="button" autoFocus={Boolean(restore) || noChanges} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className="button primary" disabled={busy || Boolean(disabledReason)}
            aria-busy={busy || undefined} aria-describedby={disabledReason ? 'version-create-disabled' : undefined}>
            {busy ? (restore ? 'Restoring…' : 'Creating…') : restore ? 'Restore version' : 'Create'}
          </button>
        </div>
      </fieldset>
    </form>
  </dialog>
}

export function VersionHistory({ topic, service, hasOpenEditor, onRestored }: {
  topic: Topic
  service: TopicService
  hasOpenEditor: boolean
  onRestored: (workspace: TopicWorkspace) => void
}) {
  const [versions, setVersions] = useState<TopicVersion[]>()
  const [working, setWorking] = useState<{ snapshot: TopicSnapshot; updatedAt: string }>()
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
    service.workingVersion(topic.id).then(({ versions: items, snapshot, updatedAt }) => {
      if (!active) return
      setVersions(items)
      setWorking({ snapshot, updatedAt })
    }, problem => {
      if (active) setError(errorMessage(problem))
    })
    return () => { active = false }
  }, [topic.id, topic.updatedAt, service, attempt])
  const latest = versions?.[0]
  const selected = versions?.find(version => version.id === selectedId)
  const from = versions?.find(version => version.id === fromId) ?? versions?.[1]
  const to = versions?.find(version => version.id === toId) ?? latest
  const detected = useMemo(() => latest && working ? compareTopicVersions(latest.snapshot, working.snapshot) : undefined, [latest, working])
  const current = detected && !hasTopicVersionChanges(detected) ? latest : undefined
  const restoreReason = !working ? 'Version history must load before restoring.'
    : !selected ? 'Select a saved version to restore.'
    : !hasTopicVersionChanges(compareTopicVersions(selected.snapshot, working.snapshot)) ? 'The selected version already matches the Working version.'
    : undefined

  function restoreSelection(version: TopicVersion) {
    setSelectedId(version.id)
    if (working && hasTopicVersionChanges(compareTopicVersions(version.snapshot, working.snapshot))) setDialog(version)
  }

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
      setWorking(previous => previous && { ...previous, snapshot: created.snapshot })
      setVersions(previous => [created, ...(previous ?? [])])
      setSelectedId(created.id)
      setMessage(`${versionLabel(created)} created.`)
    } else {
      const { workspace, version, backup } = await service.restoreVersion(topic.id, dialog.id)
      setWorking({ snapshot: version.snapshot, updatedAt: version.createdAt })
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
              <div className="version-entry-info" onClick={() => setSelectedId(version.id)}>
                <h3><button type="button" className="version-select" aria-label={`Select ${versionLabel(version)}`}
                  aria-pressed={isSelected} aria-controls={isSelected ? detailsId : undefined}>
                  {versionLabel(version)}
                </button> {isCurrent ? <span className="version-pill is-current">Current</span>
                  : latest?.id === version.id && <span className="version-pill">Latest</span>}</h3>
                <VersionAttribution version={version} />
                <p>{version.summary}</p>
              </div>
              <div className="version-entry-actions">
                <ContextActions title={versionLabel(version)} buttonTitle="Version actions"
                  entries={versionActions.map(entry => ({ ...entry, disabled: entry.id === 'restore' && isCurrent }))}
                  onAction={action => {
                    if (action === 'restore') restoreSelection(version)
                    else setSelectedId(version.id)
                  }} />
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
        <h2 id="version-current-title">Working version</h2>
        {working && <dl className="version-metadata">
          <div><dt>Status</dt><dd className={current ? 'green' : 'muted'}>
            {current ? 'Matches the latest saved version.' : latest ? 'Contains unversioned changes.' : 'No saved versions.'}
          </dd></div>
          {latest && <div><dt>Latest saved version</dt><dd>{versionLabel(latest)}</dd></div>}
          <div><dt>Last modified</dt><dd><time dateTime={working.updatedAt}>{dateFormat.format(new Date(working.updatedAt))}</time></dd></div>
        </dl>}
      </section>
      <section className="panel" aria-labelledby="version-actions-title">
        <h2 id="version-actions-title">Actions</h2>
        <button className="button version-full-button" disabled={!versions} onClick={() => setDialog('create')}><Plus size={17} /> Create version</button>
        <button className="button version-full-button" disabled={Boolean(restoreReason)} aria-describedby={restoreReason ? 'version-restore-disabled' : undefined}
          onClick={() => { if (selected) restoreSelection(selected) }}>
          <History size={17} /> Restore
        </button>
        {restoreReason && <p id="version-restore-disabled" className="muted">{restoreReason}</p>}
        <div className={message ? 'version-notice green' : 'sr-only'} role="status">{message}</div>
      </section>
    </aside>
    {comparison && <div ref={comparisonPanel} className="version-comparison-wrap" tabIndex={-1}><VersionComparison comparison={comparison} /></div>}
    {dialog && <VersionDialog restore={dialog === 'create' ? undefined : dialog} latest={latest} changes={detected} hasOpenEditor={hasOpenEditor}
      onClose={() => setDialog(undefined)} onSubmit={save} />}
  </div>
}
