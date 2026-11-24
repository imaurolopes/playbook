import { useState } from 'react'
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import type { Project } from '../domain/implementation'
import {
  emptyAgentConfig, repositoryProviders,
  type AgentConfigChange, type ProjectRepository, type QualityGate,
} from '../domain/project-agent-config'
import { ImplementationDialog } from './Implementation'
import { Markdown } from './markdown'
import { MarkdownEditor, MarkdownIndicator } from './MarkdownEditor'
import { projectPath } from './navigation'

type ConfigDialog =
  | { kind: 'context' | 'workflow' }
  | { kind: 'repository'; record?: ProjectRepository }
  | { kind: 'qualityGate'; record?: QualityGate }
  | { kind: 'removeRepository' | 'removeQualityGate'; id: string; name: string }

const markdownTitles = { context: 'Project Context', workflow: 'Execution Workflow' }

function ConfigMarkdown({ title, value, onClose, onSave }: {
  title: string
  value: string
  onClose: () => void
  onSave: (value: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(value)
  const [preview, setPreview] = useState(false)
  return <ImplementationDialog className="agent-config-editor-dialog" title={title} submitLabel="Save" onClose={onClose} onSubmit={() => onSave(draft)}>
    <div className="editor-heading">
      <MarkdownIndicator />
      <div className="segmented" role="group" aria-label="Markdown editor mode">
        <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>Edit</button>
        <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button>
      </div>
    </div>
    <MarkdownEditor label={title + ' Markdown'} value={draft} onChange={setDraft} rows={10} hidden={preview} />
    {preview && <div className="editor-preview">{draft.trim() ? <Markdown content={draft} /> : <p className="muted">No content to preview.</p>}</div>}
  </ImplementationDialog>
}

function textField(fields: FormData, name: string) {
  const value = fields.get(name)
  return typeof value === 'string' ? value : ''
}

function RepositoryEditor({ record, onClose, save }: {
  record?: ProjectRepository
  onClose: () => void
  save: (change: AgentConfigChange) => Promise<void>
}) {
  return <ImplementationDialog title={record ? 'Edit repository' : 'Add repository'} submitLabel="Save" onClose={onClose} onSubmit={fields => {
    const provider = repositoryProviders.find(item => item === fields.get('provider'))
    if (!provider) throw new Error('Choose a repository provider.')
    return save({ kind: 'repository', id: record?.id, input: {
      name: textField(fields, 'name'), url: textField(fields, 'url'), provider,
      defaultBranch: textField(fields, 'branch'), description: textField(fields, 'description'),
    } })
  }}>
    <label className="implementation-form-field">Name<input className="field" name="name" defaultValue={record?.name} required autoFocus /></label>
    <label className="implementation-form-field">Repository URL<input className="field" name="url" type="url" defaultValue={record?.url} required /></label>
    <label className="implementation-form-field">Provider<select className="field" name="provider" defaultValue={record?.provider ?? 'Other'}>
      {repositoryProviders.map(provider => <option key={provider}>{provider}</option>)}
    </select></label>
    <label className="implementation-form-field">Default branch<input className="field" name="branch" defaultValue={record?.defaultBranch} required /></label>
    <label className="implementation-form-field">Description (optional)<textarea className="field" name="description" rows={2} defaultValue={record?.description} /></label>
  </ImplementationDialog>
}

function QualityGateEditor({ record, onClose, save }: {
  record?: QualityGate
  onClose: () => void
  save: (change: AgentConfigChange) => Promise<void>
}) {
  return <ImplementationDialog title={record ? 'Edit quality gate' : 'Add quality gate'} submitLabel="Save" onClose={onClose} onSubmit={fields =>
    save({ kind: 'qualityGate', id: record?.id, input: {
      name: textField(fields, 'name'), description: textField(fields, 'description'),
      enabled: fields.has('enabled'), required: fields.get('requirement') === 'required', command: textField(fields, 'command'),
    } })}>
    <label className="implementation-form-field">Name<input className="field" name="name" defaultValue={record?.name} required autoFocus /></label>
    <label className="implementation-form-field">Description<textarea className="field" name="description" rows={2} defaultValue={record?.description} required /></label>
    <label className="implementation-form-field">Requirement<select className="field" name="requirement" defaultValue={record?.required === false ? 'optional' : 'required'}>
      <option value="required">Required</option><option value="optional">Optional</option>
    </select></label>
    <label className="policy-enabled"><input type="checkbox" name="enabled" defaultChecked={record?.enabled ?? true} /> Enabled</label>
    <label className="implementation-form-field">Validation command (optional)<input className="field" name="command" defaultValue={record?.command} /></label>
  </ImplementationDialog>
}

export function AgentConfig({ project, onChange }: { project: Project; onChange: (change: AgentConfigChange) => Promise<void> }) {
  const config = project.agentConfig ?? emptyAgentConfig()
  const [dialog, setDialog] = useState<ConfigDialog>()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState(false)

  function open(next: ConfigDialog) {
    setError('')
    setNotice('')
    setDialog(next)
  }

  async function save(change: AgentConfigChange, message = 'Agent configuration saved.') {
    await onChange(change)
    setNotice(message)
  }

  async function toggle(gate: QualityGate) {
    if (toggling) return
    setToggling(true)
    setError('')
    setNotice('')
    try {
      await save({ kind: 'toggleQualityGate', id: gate.id }, gate.enabled ? 'Quality gate disabled.' : 'Quality gate enabled.')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not update the quality gate.')
    } finally {
      setToggling(false)
    }
  }

  function markdownSection(kind: 'context' | 'workflow') {
    const title = markdownTitles[kind]
    return <section className="panel project-card" aria-labelledby={`agent-config-${kind}`}>
      <div className="projects-heading"><h2 id={`agent-config-${kind}`}>{title}</h2>
        <button className="button" aria-label={`Edit ${title}`} disabled={toggling} onClick={() => open({ kind })}><Pencil size={16} aria-hidden="true" /> Edit</button>
      </div>
      {config[kind].trim() ? <Markdown content={config[kind]} /> : <p className="muted">{kind === 'context' ? 'No project context yet.' : 'No execution workflow yet.'}</p>}
    </section>
  }

  return <>
    <p className="muted">This configuration applies to all topics and tasks in this project. <Link className="purple" to={projectPath(project.id, 'safeguards')}>Safeguards</Link> take precedence if guidance conflicts.</p>
    {notice && <p role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {markdownSection('context')}

    <section className="panel project-card" aria-labelledby="agent-config-repositories">
      <div className="projects-heading"><h2 id="agent-config-repositories">Repositories</h2>
        <button className="button" disabled={toggling} onClick={() => open({ kind: 'repository' })}><Plus size={16} aria-hidden="true" /> Add repository</button>
      </div>
      {config.repositories.length ? <ul className="project-rows">{config.repositories.map(repo => <li key={repo.id}>
        <div className="project-row-text">
          <a href={repo.url} target="_blank" rel="noopener noreferrer" aria-label={`Open repository: ${repo.name}`}>{repo.name} <ExternalLink size={14} aria-hidden="true" /></a>
          <span className="muted">{repo.provider} · Default branch <code>{repo.defaultBranch}</code></span>
          <small className="muted">{repo.url}</small>
          {repo.description && <p>{repo.description}</p>}
        </div>
        <div className="projects-inline">
          <button className="button icon-button" disabled={toggling} title="Edit repository" aria-label={`Edit repository: ${repo.name}`}
            onClick={() => open({ kind: 'repository', record: repo })}><Pencil size={16} aria-hidden="true" /></button>
          <button className="button icon-button" disabled={toggling} title="Remove repository" aria-label={`Remove repository: ${repo.name}`}
            onClick={() => open({ kind: 'removeRepository', id: repo.id, name: repo.name })}><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      </li>)}</ul> : <p className="muted">No repositories added yet.</p>}
    </section>

    {markdownSection('workflow')}

    <section className="panel project-card" aria-labelledby="agent-config-quality">
      <div className="projects-heading"><h2 id="agent-config-quality">Quality Gates</h2>
        <button className="button" disabled={toggling} onClick={() => open({ kind: 'qualityGate' })}><Plus size={16} aria-hidden="true" /> Add quality gate</button>
      </div>
      <p className="muted">Quality gates document completion expectations. Commands are stored as text.</p>
      {config.qualityGates.length ? <ul className="project-rows">{config.qualityGates.map(gate => <li key={gate.id}>
        <div className="project-row-text">
          <strong>{gate.name}</strong>
          <span className="muted">{gate.required ? 'Required' : 'Optional'} · {gate.enabled ? 'Enabled' : 'Disabled'}</span>
          <p>{gate.description}</p>
          {gate.command && <code>{gate.command}</code>}
        </div>
        <div className="projects-inline">
          <button className="button" disabled={toggling} aria-label={`${gate.enabled ? 'Disable' : 'Enable'} quality gate: ${gate.name}`}
            onClick={() => void toggle(gate)}>{gate.enabled ? 'Disable' : 'Enable'}</button>
          <button className="button icon-button" disabled={toggling} title="Edit quality gate" aria-label={`Edit quality gate: ${gate.name}`}
            onClick={() => open({ kind: 'qualityGate', record: gate })}><Pencil size={16} aria-hidden="true" /></button>
          <button className="button icon-button" disabled={toggling} title="Delete quality gate" aria-label={`Delete quality gate: ${gate.name}`}
            onClick={() => open({ kind: 'removeQualityGate', id: gate.id, name: gate.name })}><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      </li>)}</ul> : <p className="muted">No quality gates added yet.</p>}
    </section>

    {(dialog?.kind === 'context' || dialog?.kind === 'workflow') && <ConfigMarkdown title={markdownTitles[dialog.kind]} value={config[dialog.kind]}
      onClose={() => setDialog(undefined)} onSave={content => save({ kind: dialog.kind, content })} />}
    {dialog?.kind === 'repository' && <RepositoryEditor record={dialog.record} onClose={() => setDialog(undefined)} save={save} />}
    {dialog?.kind === 'qualityGate' && <QualityGateEditor record={dialog.record} onClose={() => setDialog(undefined)} save={save} />}
    {(dialog?.kind === 'removeRepository' || dialog?.kind === 'removeQualityGate') && <ImplementationDialog
      title={dialog.kind === 'removeRepository' ? 'Remove repository?' : 'Delete quality gate?'}
      submitLabel={dialog.kind === 'removeRepository' ? 'Remove' : 'Delete'} destructive onClose={() => setDialog(undefined)}
      onSubmit={() => save({ kind: dialog.kind, id: dialog.id }, dialog.kind === 'removeRepository' ? 'Repository removed.' : 'Quality gate deleted.')}>
      <p>Remove <strong>{dialog.name}</strong> from this project?</p>
    </ImplementationDialog>}
  </>
}
