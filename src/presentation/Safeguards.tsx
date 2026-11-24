import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { Project } from '../domain/implementation'
import {
  customSafeguardNameKey, projectSafeguardPolicies, safeguardGroups, safeguardModes, safeguardSeverities,
  type SafeguardInput, type SafeguardPolicy,
} from '../domain/project-safeguards'
import { ImplementationDialog } from './Implementation'
import { Markdown } from './markdown'
import { MarkdownEditor, MarkdownIndicator } from './MarkdownEditor'

type PolicyDialog = { kind: 'edit'; policy?: SafeguardPolicy } | { kind: 'delete'; policy: SafeguardPolicy }
const initialPolicy: SafeguardInput = {
  name: '', category: safeguardGroups[0].title, context: '', severity: 'Medium', enforcement: 'Advisory', enabled: true,
}
const policyDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const categories = safeguardGroups.map(group => group.title)

function PolicyEditor({ policy, onClose, onSave }: {
  policy?: SafeguardPolicy
  onClose: () => void
  onSave: (input: SafeguardInput) => Promise<void>
}) {
  const [draft, setDraft] = useState<SafeguardInput>(policy ?? initialPolicy)
  const [preview, setPreview] = useState(false)

  function field<K extends keyof SafeguardInput>(key: K, value: SafeguardInput[K]) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  return <ImplementationDialog className="safeguard-editor-dialog" title={policy ? 'Edit safeguard' : 'New safeguard'} submitLabel="Save"
    onClose={onClose} onSubmit={() => onSave(draft)}>
    <label className="implementation-form-field">Name<input className="field" value={draft.name}
      onChange={event => field('name', event.target.value)} required autoFocus /></label>
    <div className="policy-form-options">
      <label className="implementation-form-field">Category<select className="field" value={draft.category} onChange={event => {
        const value = categories.find(item => item === event.target.value)
        if (value) field('category', value)
      }}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="implementation-form-field">Severity<select className="field" value={draft.severity} onChange={event => {
        const value = safeguardSeverities.find(item => item === event.target.value)
        if (value) field('severity', value)
      }}>{safeguardSeverities.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="implementation-form-field">Enforcement mode<select className="field" value={draft.enforcement} onChange={event => {
        const value = safeguardModes.find(item => item === event.target.value)
        if (value) field('enforcement', value)
      }}>{safeguardModes.map(item => <option key={item}>{item}</option>)}</select></label>
    </div>
    <label className="policy-enabled"><input type="checkbox" checked={draft.enabled} onChange={event => field('enabled', event.target.checked)} /> Enabled</label>
    <div className="editor-heading">
      <div className="context-editor-title"><span>Context</span><MarkdownIndicator /></div>
      <div className="segmented" role="group" aria-label="Context editor mode">
        <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>Edit</button>
        <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button>
      </div>
    </div>
    <MarkdownEditor label="Safeguard context" rows={5} value={draft.context} onChange={value => field('context', value)} hidden={preview} />
    {preview && <div className="editor-preview">{draft.context.trim() ? <Markdown content={draft.context} /> : <p className="muted">No context to preview.</p>}</div>}
  </ImplementationDialog>
}

export function Safeguards({ project, onSave, onDelete }: {
  project: Project
  onSave: (input: SafeguardInput, policyId?: string) => Promise<void>
  onDelete: (policyId: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [dialog, setDialog] = useState<PolicyDialog>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const editing = dialog?.kind === 'edit'
  const blocker = useBlocker(({ currentLocation, nextLocation }) => editing && currentLocation.pathname !== nextLocation.pathname)
  const leaving = useRef(false)
  const policies = projectSafeguardPolicies(project)
  const filtered = policies.filter(policy => (!category || policy.category === category) &&
    customSafeguardNameKey(policy.name).includes(customSafeguardNameKey(query)))

  useEffect(() => {
    if (!editing) return
    function confirmUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', confirmUnload)
    return () => window.removeEventListener('beforeunload', confirmUnload)
  }, [editing])

  async function toggle(policy: SafeguardPolicy) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await onSave({ ...policy, enabled: !policy.enabled }, policy.id)
      setNotice(policy.enabled ? 'Safeguard disabled.' : 'Safeguard enabled.')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save the safeguard.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <section className="panel project-card" aria-labelledby="safeguards-heading">
      <div className="projects-heading">
        <h2 id="safeguards-heading">Safeguards</h2>
        <button className="button primary" disabled={busy} onClick={() => setDialog({ kind: 'edit' })}><Plus size={16} aria-hidden="true" /> New safeguard</button>
      </div>
      <p className="muted">These settings record project policies. Automatic enforcement is not available.</p>
      <div className="projects-filters">
        <label className="field"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search safeguards"
          placeholder="Search safeguards..." value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label>Category <select className="field" value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}
        </select></label>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {filtered.length ? <ul className="policy-list">{filtered.map(policy => <li key={policy.id}>
        <div className="policy-row">
          <details className="policy-details">
            <summary>{policy.name}</summary>
            {policy.context.trim() ? <Markdown content={policy.context} /> : <p className="muted">No policy context.</p>}
            <dl className="project-dates">
              <div><dt>Created</dt><dd><time dateTime={policy.createdAt}>{policyDate.format(new Date(policy.createdAt))}</time></dd></div>
              <div><dt>Updated</dt><dd><time dateTime={policy.updatedAt}>{policyDate.format(new Date(policy.updatedAt))}</time></dd></div>
            </dl>
          </details>
          <div className="policy-meta"><span>{policy.category}</span><span>{policy.severity}</span><span>{policy.enforcement}</span>
            <span className={policy.enabled ? 'project-status' : 'muted'}>{policy.enabled ? 'Enabled' : 'Disabled'}</span></div>
          <div className="projects-inline">
            <button className="button" disabled={busy} onClick={() => void toggle(policy)}
              aria-label={`${policy.enabled ? 'Disable' : 'Enable'} safeguard: ${policy.name}`}>{policy.enabled ? 'Disable' : 'Enable'}</button>
            <button className="button icon-button" disabled={busy} onClick={() => setDialog({ kind: 'edit', policy })}
              aria-label={`Edit safeguard: ${policy.name}`} title="Edit safeguard"><Pencil size={16} aria-hidden="true" /></button>
            <button className="button icon-button" disabled={busy} onClick={() => setDialog({ kind: 'delete', policy })}
              aria-label={`Delete safeguard: ${policy.name}`} title="Delete safeguard"><Trash2 size={16} aria-hidden="true" /></button>
          </div>
        </div>
      </li>)}</ul> : <p className="muted">{policies.length ? 'No safeguards match these filters.' : 'No safeguards added yet.'}</p>}
    </section>
    {dialog?.kind === 'edit' && <PolicyEditor policy={dialog.policy} onClose={() => setDialog(undefined)} onSave={async input => {
      await onSave(input, dialog.policy?.id)
      setError('')
      setNotice('Safeguard saved.')
    }} />}
    {dialog?.kind === 'delete' && <ImplementationDialog title="Delete safeguard?" submitLabel="Delete" destructive
      onClose={() => setDialog(undefined)} onSubmit={async () => {
        await onDelete(dialog.policy.id)
        setError('')
        setNotice('Safeguard deleted.')
      }}><p>Delete {dialog.policy.name}? This cannot be undone.</p></ImplementationDialog>}
    {blocker.state === 'blocked' && <ImplementationDialog title="Discard safeguard changes?" submitLabel="Discard changes" destructive
      onClose={() => { if (!leaving.current) blocker.reset() }}
      onSubmit={async () => {
        leaving.current = true
        setDialog(undefined)
        blocker.proceed()
      }}><p>Your unsaved safeguard changes will be lost.</p></ImplementationDialog>}
  </>
}
