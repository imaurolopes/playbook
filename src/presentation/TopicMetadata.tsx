import { useEffect, useState } from 'react'
import { Plus, Save, Trash2, X } from 'lucide-react'
import type { TopicWorkspace } from '../application/topic-repository'
import type { TopicService } from '../application/topic-service'
import type { Topic } from '../domain/topic'
import {
  classificationLists, defaultTopicMetadata, lifecycleStatuses, metadataChanges, visibilities,
  type ClassificationList, type CustomProperty, type TopicMetadata as Metadata,
} from '../domain/topic-metadata'
import { captureTopicSnapshot, matchesTopicSnapshot, type TopicVersion } from '../domain/topic-version'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function DateValue({ value }: { value: string }) {
  return <time dateTime={value}>{dateFormat.format(new Date(value))}</time>
}

function ClassificationValues({ field, values, onChange }: {
  field: ClassificationList
  values: readonly string[]
  onChange: (values: string[]) => void
}) {
  const [pending, setPending] = useState('')
  const title = classificationLists[field]
  const id = `metadata-${field}`

  function add() {
    const value = pending.trim()
    if (value && !values.includes(value)) onChange([...values, value])
    setPending('')
  }

  return <div className="metadata-field">
    <label htmlFor={id}>{title}</label>
    {values.length > 0 && <ul className="metadata-chips">{values.map((value, index) => <li key={index}>
      <span>{value}</span>
      <button type="button" aria-label={`Remove ${value} from ${title.toLowerCase()}`} onClick={() => onChange(values.filter((_, position) => position !== index))}><X size={14} /></button>
    </li>)}</ul>}
    <div className="metadata-add-value">
      <input className="field" id={id} value={pending} onChange={event => setPending(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            add()
          }
        }} />
      <button type="button" className="button icon-button" disabled={!pending.trim()}
        aria-label={`Add to ${title.toLowerCase()}`} title={`Add to ${title.toLowerCase()}`} onClick={add}><Plus size={17} /></button>
    </div>
  </div>
}

function MetadataAudit({ topic, workspace, service }: { topic: Topic; workspace: TopicWorkspace; service: TopicService }) {
  const [versions, setVersions] = useState<TopicVersion[]>()
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    service.versions(topic.id).then(result => { if (active) setVersions(result) }, () => { if (active) setError(true) })
    return () => { active = false }
  }, [topic.id, service, attempt])
  const latest = versions?.[0]
  const live = captureTopicSnapshot(topic, workspace.topics, workspace.relationships)
  const current = versions?.find(version => matchesTopicSnapshot(version.snapshot, live))

  return <section className="panel metadata-card" aria-labelledby="metadata-audit-title">
    <h2 id="metadata-audit-title">Audit information</h2>
    <dl className="metadata-audit">
      <div><dt>Topic ID</dt><dd><code>{topic.id}</code></dd></div>
      <div><dt>Created at</dt><dd><DateValue value={topic.createdAt} /></dd></div>
      <div><dt>Updated at</dt><dd><DateValue value={topic.updatedAt} /></dd></div>
      <div><dt>Current version</dt><dd>{current ? `v${current.versionNumber}` :
        latest ? `Changes since v${latest.versionNumber}` : versions ? 'No saved version' : error ? 'Unavailable' : 'Loading…'}</dd></div>
      {latest && <div><dt>Last version created at</dt><dd><DateValue value={latest.createdAt} /></dd></div>}
    </dl>
    {error && <button type="button" className="button" onClick={() => { setError(false); setAttempt(value => value + 1) }}>Retry version history</button>}
  </section>
}

export function TopicMetadata({ topic, workspace, service, onSave }: {
  topic: Topic
  workspace: TopicWorkspace
  service: TopicService
  onSave: (metadata: Metadata) => Promise<Topic>
}) {
  const [draft, setDraft] = useState(topic.metadata ?? defaultTopicMetadata)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const saved = topic.metadata ?? defaultTopicMetadata
  const dirty = metadataChanges(saved, draft).length > 0 || saved.customProperties.length !== draft.customProperties.length

  function update<K extends keyof Metadata>(key: K, value: Metadata[K]) {
    setDraft(current => ({ ...current, [key]: value }))
    setMessage('')
  }

  function updateProperty(id: string, patch: Partial<Pick<CustomProperty, 'key' | 'value'>>) {
    update('customProperties', draft.customProperties.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  return <form className="topic-metadata" onSubmit={async event => {
    event.preventDefault()
    if (busy || !dirty) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const updated = await onSave(draft)
      setDraft(updated.metadata ?? defaultTopicMetadata)
      setMessage('Metadata saved.')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save metadata.')
    } finally {
      setBusy(false)
    }
  }}>
    <fieldset className="metadata-grid" disabled={busy}>
      <legend className="sr-only">Topic metadata</legend>
      <div className="metadata-column">
        <section className="panel metadata-card" aria-labelledby="metadata-general-title">
          <h2 id="metadata-general-title">General information</h2>
          <div className="metadata-field"><span className="muted">Topic title</span><p>{topic.title}</p></div>
          {topic.description.trim() && <div className="metadata-field"><span className="muted">Description</span><p>{topic.description}</p></div>}
          <label className="metadata-field">Category
            <input className="field" value={draft.category} onChange={event => update('category', event.target.value)} />
          </label>
          <label className="metadata-field">Owner (optional)
            <input className="field" value={draft.owner} onChange={event => update('owner', event.target.value)} />
          </label>
          <div className="metadata-pair">
            <label className="metadata-field">Lifecycle status
              <select className="field" value={draft.lifecycleStatus} onChange={event => {
                const status = lifecycleStatuses.find(value => value === event.target.value)
                if (status) update('lifecycleStatus', status)
              }}>{lifecycleStatuses.map(value => <option key={value}>{value}</option>)}</select>
            </label>
            <label className="metadata-field">Visibility
              <select className="field" value={draft.visibility} aria-describedby="metadata-visibility-note" onChange={event => {
                const visibility = visibilities.find(value => value === event.target.value)
                if (visibility) update('visibility', visibility)
              }}>{visibilities.map(value => <option key={value}>{value}</option>)}</select>
            </label>
          </div>
          <p className="muted metadata-hint" id="metadata-visibility-note">Visibility is a label only. Access and publishing are unaffected.</p>
        </section>
        <MetadataAudit topic={topic} workspace={workspace} service={service} />
      </div>
      <div className="metadata-column">
        <section className="panel metadata-card" aria-label="Tags">
          <ClassificationValues field="tags" values={draft.tags} onChange={values => update('tags', values)} />
        </section>
        <section className="panel metadata-card" aria-labelledby="metadata-classification-title">
          <h2 id="metadata-classification-title">Context and classification</h2>
          <label className="metadata-field">Technical domain
            <input className="field" value={draft.technicalDomain} onChange={event => update('technicalDomain', event.target.value)} />
          </label>
          {(['technologies', 'platforms', 'languages'] as const).map(field => <ClassificationValues key={field}
            field={field} values={draft[field]} onChange={values => update(field, values)} />)}
        </section>
        <section className="panel metadata-card" aria-labelledby="metadata-properties-title">
          <div className="metadata-heading">
            <h2 id="metadata-properties-title">Custom properties</h2>
            <button type="button" className="button" onClick={() => update('customProperties', [
              ...draft.customProperties, { id: crypto.randomUUID(), key: '', value: '' },
            ])}><Plus size={16} /> Add property</button>
          </div>
          {draft.customProperties.length === 0 ? <p className="muted">No custom properties.</p> :
            <ul className="metadata-properties">{draft.customProperties.map((property, index) => <li key={property.id}>
              <label className="metadata-field">Key
                <input className="field" required value={property.key} onChange={event => updateProperty(property.id, { key: event.target.value })} />
              </label>
              <label className="metadata-field">Value
                <input className="field" value={property.value} onChange={event => updateProperty(property.id, { value: event.target.value })} />
              </label>
              <button type="button" className="button icon-button" title="Delete property" aria-label={`Delete property ${property.key || index + 1}`}
                onClick={() => update('customProperties', draft.customProperties.filter(item => item.id !== property.id))}><Trash2 size={16} /></button>
            </li>)}</ul>}
        </section>
      </div>
      <div className="metadata-actions">
        {error && <p className="error" role="alert">{error}</p>}
        <span className="green" role="status">{message}</span>
        <button className="button primary" type="submit" disabled={!dirty || busy}><Save size={16} /> {busy ? 'Saving…' : 'Save'}</button>
      </div>
    </fieldset>
  </form>
}
