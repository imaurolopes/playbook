import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useBlocker } from 'react-router'
import { ChevronDown, Copy, Info, Plus, Save, Trash2, X } from 'lucide-react'
import type { TopicWorkspace } from '../application/topic-repository'
import type { TopicService } from '../application/topic-service'
import { isTopicType, topicTypes, type Topic } from '../domain/topic'
import { compareTopicVersions, hasTopicVersionChanges } from '../application/compare-topic-versions'
import { ImplementationDialog } from './Implementation'
import { topicTypeDisplay } from './topic-types'
import {
  cleanTopicMetadata, defaultTopicMetadata, lifecycleStatuses, mergeTechnicalDomains, technicalDomainsFor,
  parseCustomProperty, propertyTypes, typedCustomProperty,
  type CustomProperty, type PropertyType, type TopicMetadata as Metadata,
} from '../domain/topic-metadata'

const lifecycleDescriptions: Record<Metadata['lifecycleStatus'], string> = {
  Draft: 'Knowledge is being developed.',
  'In Review': 'Knowledge is ready for review.',
  Published: 'Knowledge is ready for reuse within the Workspace.',
  Deprecated: 'Knowledge is no longer recommended for new use. Existing project references remain valid.',
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function DateValue({ value }: { value: string }) {
  return <time dateTime={value}>{dateFormat.format(new Date(value))}</time>
}

function MetadataHelp({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return <span className="criterion-info metadata-help" tabIndex={0} aria-label={label} aria-describedby={id}>
    <Info size={15} aria-hidden="true" />
    <span className="criterion-tooltip" role="tooltip" id={id}>{children}</span>
  </span>
}

type PropertyDraft = { id: string; key: string; type: PropertyType; raw: string; previousValue?: string }

function propertyDrafts(properties: readonly CustomProperty[]): PropertyDraft[] {
  return properties.map(property => {
    const { id, key, type, value } = typedCustomProperty(property)
    return { id, key, type, raw: String(value) }
  })
}

const valueErrors: Record<PropertyType, string> = {
  Text: '', Number: 'Enter a valid number.', Boolean: 'Select True or False.',
  Date: 'Enter a valid date.', URL: 'Enter a valid HTTP or HTTPS URL.',
}

function PropertyRow({ property, index, nameError, onChange, onRemove }: {
  property: PropertyDraft
  index: number
  nameError?: string
  onChange: (change: Partial<PropertyDraft>) => void
  onRemove: () => void
}) {
  const nameErrorId = useId()
  const valueErrorId = useId()
  const valueError = parseCustomProperty({ id: property.id, key: property.key }, property.type, property.raw)
    ? undefined : valueErrors[property.type]
  const valueProps = {
    className: 'field', value: property.raw, 'aria-label': 'Value',
    'aria-invalid': Boolean(valueError) || undefined,
    'aria-describedby': valueError ? valueErrorId : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ raw: event.target.value, previousValue: undefined }),
  }

  return <li className="metadata-property-row">
    <div className="metadata-property-name">
      <span className="metadata-property-mobile-label" aria-hidden="true">Name</span>
      <input className="field" aria-label="Name" value={property.key} aria-invalid={Boolean(nameError) || undefined}
        aria-describedby={nameError ? nameErrorId : undefined} onChange={event => onChange({ key: event.target.value })} />
      {nameError && <p className="error metadata-property-error" id={nameErrorId}>{nameError}</p>}
    </div>
    <div className="metadata-property-type">
      <span className="metadata-property-mobile-label" aria-hidden="true">Type</span>
      <select className="field" aria-label="Type" value={property.type} onChange={event => {
        const type = propertyTypes.find(item => item === event.target.value)
        if (!type) return
        const raw = property.previousValue ?? property.raw
        const converted = parseCustomProperty({ id: property.id, key: property.key }, type, raw)
        onChange({ type, raw: converted ? String(converted.value) : '', previousValue: converted ? undefined : raw })
      }}>{propertyTypes.map(type => <option key={type}>{type}</option>)}</select>
    </div>
    <div className="metadata-property-value">
      <span className="metadata-property-mobile-label" aria-hidden="true">Value</span>
      {property.type === 'Boolean'
        ? <select {...valueProps}><option value="">Select</option><option value="true">True</option><option value="false">False</option></select>
        : <input {...valueProps} type={property.type === 'URL' ? 'url' : property.type.toLowerCase()}
          step={property.type === 'Number' ? 'any' : undefined} />}
      {valueError && <p className="error metadata-property-error" id={valueErrorId}>
        {valueError}{property.previousValue && <> Previous value: <q>{property.previousValue}</q>.</>}
      </p>}
    </div>
    <button type="button" className="button icon-button" title="Delete property" aria-label={`Delete property ${property.key || index + 1}`}
      onClick={onRemove}><Trash2 size={16} /></button>
  </li>
}

function TechnicalDomains({ available, selected, onChange }: {
  available: readonly string[]
  selected: readonly string[]
  onChange: (domains: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const query = search.trim()
  const matches = mergeTechnicalDomains([...available, ...selected]).filter(domain =>
    domain.toLowerCase().includes(query.toLowerCase()))

  function toggle(domain: string) {
    const key = domain.toLowerCase()
    onChange(selected.some(value => value.toLowerCase() === key)
      ? selected.filter(value => value.toLowerCase() !== key)
      : mergeTechnicalDomains([...selected, domain]))
  }

  function create() {
    toggle(query)
    setSearch('')
    input.current?.focus()
  }

  return <div className="metadata-field">
    <div className="metadata-domain-label">
      <label htmlFor="metadata-domain-search">Technical domains</label>
      <MetadataHelp label="About technical domains">Classify this Topic by technical area so it can be found and reused across the Workspace.</MetadataHelp>
    </div>
    {selected.length > 0 && <ul className="metadata-chips">{selected.map(domain => <li key={domain}>
      <span>{domain}</span>
      <button type="button" aria-label={`Remove domain ${domain}`} onClick={() => toggle(domain)}><X size={14} /></button>
    </li>)}</ul>}
    <div className="metadata-domain-picker" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }} onKeyDown={event => {
      if (event.key !== 'Escape' || !open) return
      event.preventDefault()
      input.current?.focus()
      setOpen(false)
    }}>
      <input className="field" id="metadata-domain-search" ref={input} type="search" autoComplete="off"
        placeholder="Search or create a domain" value={search} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        aria-controls="metadata-domain-options" onChange={event => { setSearch(event.target.value); setOpen(true) }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (open) popup.current?.querySelector<HTMLElement>('input, button')?.focus()
            else setOpen(true)
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            if (open && query && matches.length === 0) create()
          }
        }} />
      <button className="metadata-domain-toggle" type="button" aria-label="Technical domain options"
        aria-expanded={open} aria-controls="metadata-domain-options" onClick={() => setOpen(!open)}>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div id="metadata-domain-options" className="metadata-domain-options" ref={popup} role="group"
        aria-label="Available technical domains" hidden={!open}>
        {matches.map(domain => <label key={domain}>
          <input type="checkbox" checked={selected.some(value => value.toLowerCase() === domain.toLowerCase())}
            onChange={() => toggle(domain)} />
          {domain}
        </label>)}
        {matches.length === 0 && (query
          ? <button type="button" onClick={create}><Plus size={15} aria-hidden="true" /> Create “{query}”</button>
          : <p className="muted">Type to create a technical domain.</p>)}
      </div>
    </div>
  </div>
}

function Tags({ suggestions, values, onChange }: {
  suggestions: string[]
  values: readonly string[]
  onChange: (values: string[]) => void
}) {
  const [pending, setPending] = useState('')
  const value = pending.trim()
  const canAdd = Boolean(value) && !values.some(tag => tag.trim().toLowerCase() === value.toLowerCase())

  function add() {
    if (!canAdd) return
    onChange([...values, value])
    setPending('')
  }

  return <div className="metadata-field">
    <label htmlFor="metadata-tags">Tags</label>
    {values.length > 0 && <ul className="metadata-chips">{values.map((value, index) => <li key={index}>
      <span>{value}</span>
      <button type="button" aria-label={`Remove ${value} from tags`} onClick={() => onChange(values.filter((_, position) => position !== index))}><X size={14} /></button>
    </li>)}</ul>}
    <div className="metadata-add-value">
      <input className="field" id="metadata-tags" list="metadata-tag-suggestions" placeholder="Add tag…" value={pending} onChange={event => setPending(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            add()
          }
        }} />
      <datalist id="metadata-tag-suggestions">{suggestions.filter(tag => !values.some(value => value.toLowerCase() === tag.toLowerCase())).map(tag => <option key={tag} value={tag} />)}</datalist>
      <button type="button" className="button icon-button" disabled={!canAdd}
        aria-label="Add tag" title="Add tag" onClick={add}><Plus size={17} /></button>
    </div>
  </div>
}

function MetadataAudit({ topic, service }: { topic: Topic; service: TopicService }) {
  const [working, setWorking] = useState<Awaited<ReturnType<TopicService['workingVersion']>>>()
  const [error, setError] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    service.workingVersion(topic.id).then(result => { if (active) setWorking(result) }, () => { if (active) setError(true) })
    return () => { active = false }
  }, [topic, service, attempt])
  const latest = working?.versions[0]
  const status = error ? 'Unavailable' : latest && working
    ? hasTopicVersionChanges(compareTopicVersions(latest.snapshot, working.snapshot))
      ? 'Contains unversioned changes.' : 'Matches the latest saved version.'
    : working ? 'No saved versions.' : 'Loading…'

  return <section className="panel metadata-card" aria-labelledby="metadata-audit-title">
    <h2 id="metadata-audit-title">Audit information</h2>
    <dl className="metadata-audit">
      <div><dt>Topic ID</dt><dd className="metadata-topic-id"><code title={topic.id}>{topic.id}</code>
        <button type="button" className="button icon-button" aria-label="Copy Topic ID" title="Copy Topic ID"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(topic.id)
              setCopyStatus('Topic ID copied.')
            } catch {
              setCopyStatus('Could not copy Topic ID.')
            }
          }}><Copy size={14} /></button>
      </dd></div>
      <div><dt>Created at</dt><dd><DateValue value={topic.createdAt} /></dd></div>
      <div><dt>Updated at</dt><dd><DateValue value={topic.updatedAt} /></dd></div>
      <div><dt>Latest saved version</dt><dd>{latest && !error ? `v${latest.versionNumber}` : status}</dd></div>
      <div><dt>Working version status</dt><dd>{status}</dd></div>
      <div><dt>Last version created at</dt><dd>{latest && !error ? <DateValue value={latest.createdAt} /> : '—'}</dd></div>
    </dl>
    {copyStatus && <p className="muted" role="status">{copyStatus}</p>}
    {error && <button type="button" className="button" onClick={() => { setError(false); setAttempt(value => value + 1) }}>Retry version history</button>}
  </section>
}

export function TopicMetadata({ topic, workspace, service, onSave }: {
  topic: Topic
  workspace: TopicWorkspace
  service: TopicService
  onSave: (metadata: Metadata, type: Topic['type']) => Promise<Topic>
}) {
  const [draft, setDraft] = useState(topic.metadata ?? defaultTopicMetadata)
  const [properties, setProperties] = useState(() => propertyDrafts(draft.customProperties))
  const [type, setType] = useState(topic.type)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const saved = topic.metadata ?? defaultTopicMetadata
  const leaving = useRef(false)
  const TypeIcon = topicTypeDisplay[type].icon
  const tags = [...new Set(workspace.topics.flatMap(item => item.metadata?.tags ?? []))]
  const names = properties.map(property => property.key.trim().toLowerCase())
  const nameErrors = names.map((name, index) => !name ? 'Enter a name.' :
    names.some((other, position) => position !== index && other === name) ? 'Name already exists.' : undefined)
  const parsedProperties = properties.map(({ id, key, type, raw }) => parseCustomProperty({ id, key }, type, raw))
  const invalidProperties = nameErrors.some(Boolean) || parsedProperties.some(property => !property)
  let validDraft: Metadata | undefined
  let validation = ''
  let changed = false
  try {
    const comparable = (metadata: Metadata) => cleanTopicMetadata({ ...metadata, technicalDomains: technicalDomainsFor(metadata) })
    if (!invalidProperties) {
      validDraft = comparable({ ...draft, customProperties: parsedProperties.filter(property => property !== undefined) })
      changed = type !== topic.type || JSON.stringify(comparable(saved)) !== JSON.stringify(validDraft)
    }
  } catch (problem) {
    validation = problem instanceof Error ? problem.message : 'Enter valid metadata.'
  }
  const dirty = changed || invalidProperties || Boolean(validation)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    if (!dirty) return
    function confirmUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', confirmUnload)
    return () => window.removeEventListener('beforeunload', confirmUnload)
  }, [dirty])

  function update<K extends keyof Metadata>(key: K, value: Metadata[K]) {
    setDraft(current => ({ ...current, [key]: value }))
    setMessage('')
  }

  function editProperties(next: PropertyDraft[]) {
    setProperties(next)
    setMessage('')
  }

  return <><form className="topic-metadata" onSubmit={async event => {
    event.preventDefault()
    if (busy || !changed || !validDraft || validation) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const updated = await onSave({ ...draft, customProperties: validDraft.customProperties }, type)
      setDraft(updated.metadata ?? defaultTopicMetadata)
      setProperties(propertyDrafts(updated.metadata?.customProperties ?? []))
      setType(updated.type)
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
        <section className="panel metadata-card" aria-labelledby="metadata-classification-title">
          <h2 id="metadata-classification-title">Classification</h2>
          <label className="metadata-field">Topic type
            <span className="metadata-type" style={{ color: topicTypeDisplay[type].color }}>
              <TypeIcon size={16} aria-hidden="true" />
              <select className="field" value={type} onChange={event => {
                if (isTopicType(event.target.value)) setType(event.target.value)
                setMessage('')
              }}>{topicTypes.map(value => {
                const { icon: OptionIcon, color, label } = topicTypeDisplay[value]
                return <option key={value} value={value} style={{ color }}><OptionIcon size={16} aria-hidden="true" />{label}</option>
              })}</select>
            </span>
          </label>
          <TechnicalDomains available={workspace.technicalDomains ?? []} selected={technicalDomainsFor(draft)}
            onChange={domains => update('technicalDomains', domains)} />
          <Tags values={draft.tags} suggestions={tags} onChange={values => update('tags', values)} />
        </section>
        <MetadataAudit topic={topic} service={service} />
      </div>
      <div className="metadata-column">
        <section className="panel metadata-card" aria-labelledby="metadata-governance-title">
          <h2 id="metadata-governance-title">Governance</h2>
          <label className="metadata-field">Owner
            <input className="field" placeholder="Assign knowledge owner…" value={draft.owner}
              onChange={event => update('owner', event.target.value)} />
          </label>
          <label className="metadata-field">Lifecycle status
            <select className="field" value={draft.lifecycleStatus} aria-describedby="metadata-lifecycle-description" onChange={event => {
              const status = lifecycleStatuses.find(value => value === event.target.value)
              if (status) update('lifecycleStatus', status)
            }}>{lifecycleStatuses.map(value => <option key={value} value={value}>{value === 'In Review' ? 'In review' : value}</option>)}</select>
          </label>
          <p className="muted metadata-hint" id="metadata-lifecycle-description">{lifecycleDescriptions[draft.lifecycleStatus]}</p>
        </section>
        <section className="panel metadata-card metadata-properties-card" aria-labelledby="metadata-properties-title">
          <div className="metadata-heading">
            <div className="metadata-properties-title">
              <h2 id="metadata-properties-title">Custom properties</h2>
              <MetadataHelp label="About custom properties">
                Define additional structured metadata specific to this topic. Custom properties help organize, filter,
                and enrich reusable knowledge without modifying the standard metadata model.
                <span className="metadata-property-examples">
                  <span>Minimum version: 3.0</span>
                  <span>Open source: True</span>
                  <span>Default port: 8083</span>
                  <span>Official documentation: https://debezium.io</span>
                </span>
              </MetadataHelp>
            </div>
            <button type="button" className="button" onClick={() => editProperties([
              ...properties, { id: crypto.randomUUID(), key: '', type: 'Text', raw: '' },
            ])}><Plus size={16} /> Add</button>
          </div>
          {properties.length === 0 ? <p className="muted">No custom properties.</p> : <>
            <div className="metadata-property-row metadata-property-head" aria-hidden="true">
              <span>Name</span><span>Type</span><span>Value</span>
            </div>
            <ul className="metadata-properties">{properties.map((property, index) =>
              <PropertyRow key={property.id} property={property} index={index} nameError={nameErrors[index]}
                onChange={patch => editProperties(properties.map(item => item.id === property.id ? { ...item, ...patch } : item))}
                onRemove={() => editProperties(properties.filter(item => item.id !== property.id))} />)}</ul>
          </>}
        </section>
      </div>
      <div className="metadata-actions">
        {error && <p className="error" role="alert">{error}</p>}
        {validation && <p className="error" role="status">{validation}</p>}
        <span className={message ? 'green' : 'muted'} role="status">{message || (dirty ? 'Unsaved changes' : '')}</span>
        <button className="button primary" type="submit" disabled={!changed || invalidProperties || Boolean(validation) || busy} aria-busy={busy || undefined}><Save size={16} /> {busy ? 'Saving…' : 'Save'}</button>
      </div>
    </fieldset>
  </form>
  {blocker.state === 'blocked' && <ImplementationDialog title="Discard metadata changes?" submitLabel="Discard changes" destructive
    onClose={() => { if (!leaving.current) blocker.reset() }}
    onSubmit={async () => { leaving.current = true; blocker.proceed() }}
  ><p>Your unsaved metadata changes will be lost.</p></ImplementationDialog>}
  </>
}
