import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Code2, Copy, Download, Eye, FileText, RotateCw, WandSparkles } from 'lucide-react'
import { InstructionService, RegenerationConfirmationRequired } from '../application/instruction-service'
import {
  agentProfiles, defaultInstructionOptions, getAgentProfile, instructionFilename, instructionKey, usageContexts,
  type AgentProfile, type InstructionDraft, type InstructionKey, type InstructionOptions, type InstructionSettings, type UsageContext,
} from '../domain/agent-instructions'
import { artifactNames, type ArtifactKind } from '../domain/generation-template'
import type { Project } from '../domain/implementation'
import type { Topic } from '../domain/topic'
import { Markdown } from './markdown'
import { GenerationTemplates } from './GenerationTemplates'
import { downloadMarkdown } from './download-markdown'

const optionLabels: Record<keyof InstructionOptions, string> = {
  dependencies: 'Include dependencies',
  content: 'Include Playbook standards',
  plan: 'Include implementation plan',
  criteria: 'Include acceptance criteria',
}

function errorMessage(problem: unknown) {
  return problem instanceof Error ? problem.message : 'Something went wrong. Please try again.'
}

export function AgentInstructions({ topic, service }: { topic: Topic; service: InstructionService }) {
  const [query, setQuery] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [options, setOptions] = useState(defaultInstructionOptions)

  useEffect(() => {
    let active = true
    service.projects().then(
      result => { if (active) setProjects(result) },
      problem => { if (active) setError(errorMessage(problem)) },
    )
    return () => { active = false }
  }, [service, attempt])

  if (!projects) return error
    ? <section className="panel placeholder"><h2>Could not load projects</h2><p role="alert">{error}</p>
      <button className="button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Try again</button></section>
    : <p className="placeholder" role="status">Loading agent instructions…</p>

  const project = projects.find(item => item.id === query.get('project'))
  const profile = getAgentProfile(query.get('agent')) ?? agentProfiles[0]
  const context = { topicId: topic.id, projectId: project?.id, agentProfileId: profile.id }

  function changeContext(field: 'project' | 'agent', value: string) {
    setQuery(params => {
      if (value) params.set(field, value)
      else params.delete(field)
      return params
    }, { replace: true })
  }

  return <InstructionWorkspace key={instructionKey(context)} topic={topic} projects={projects} project={project}
    profile={profile} service={service} options={options} onOptionsChange={setOptions} onContextChange={changeContext} />
}

function InstructionWorkspace({ topic, projects, project, profile, service, options, onOptionsChange, onContextChange }: {
  topic: Topic
  projects: Project[]
  project?: Project
  profile: AgentProfile
  service: InstructionService
  options: InstructionOptions
  onOptionsChange: (options: InstructionOptions) => void
  onContextChange: (field: 'project' | 'agent', value: string) => void
}) {
  const key = useMemo<InstructionKey>(() => ({
    topicId: topic.id, projectId: project?.id, agentProfileId: profile.id,
  }), [topic.id, project?.id, profile.id])
  const [draft, setDraft] = useState<InstructionDraft>()
  const [settings, setSettings] = useState<InstructionSettings>({})
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsFailure, setSettingsFailure] = useState<InstructionSettings>()
  const settingsRevision = useRef(0)
  const [markdown, setMarkdown] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [hasImplementation, setHasImplementation] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [format, setFormat] = useState<'markdown' | 'yaml'>('markdown')
  const [activeArtifact, setActiveArtifact] = useState<ArtifactKind>('agents')
  const preview = useRef<HTMLElement>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const revision = useRef(0)
  const confirmation = useRef<HTMLDialogElement>(null)
  const confirmedDraft = useRef<InstructionDraft | undefined>(undefined)
  const files = draft ? [
    { kind: 'agents' as const, name: draft.artifacts ? artifactNames.agents : instructionFilename(topic.title, profile), markdown },
    ...(draft.artifacts ? [
      { kind: 'prompt' as const, name: artifactNames.prompt, markdown: draft.artifacts.prompt },
      { kind: 'checklist' as const, name: artifactNames.checklist, markdown: draft.artifacts.checklist },
    ] : []),
  ] : []
  const file = files.find(item => item.kind === activeArtifact)
  const busy = saving || generating || settingsSaving
  const unsaved = Boolean(draft && markdown !== draft.markdown)
  const usage = settings.usage ?? (project ? 'implementation' : 'topic')
  const includeImplementation = usage === 'implementation' && hasImplementation
  const contextLocked = busy || unsaved || Boolean(settingsFailure)

  useEffect(() => {
    let active = true
    Promise.all([service.load(key), service.settings(key)]).then(([result, savedSettings]) => {
      if (!active) return
      setDraft(result.draft)
      setMarkdown(result.draft?.markdown ?? '')
      setHasImplementation(result.hasImplementation)
      setSettings(savedSettings)
      setLoaded(true)
    }, problem => { if (active) setError(errorMessage(problem)) })
    return () => { active = false }
  }, [service, key, attempt])

  async function changeSettings(changes: InstructionSettings) {
    const pending = { ...settingsFailure, ...changes }
    const latest = ++settingsRevision.current
    setSettings(current => ({ ...current, ...pending }))
    setSettingsSaving(true)
    setError('')
    try {
      const saved = await service.saveSettings(key, pending)
      if (settingsRevision.current === latest) {
        setSettings(saved)
        setSettingsFailure(undefined)
      }
    } catch (problem) {
      if (settingsRevision.current === latest) {
        setSettingsFailure(pending)
        setError(errorMessage(problem))
      }
    } finally {
      if (settingsRevision.current === latest) setSettingsSaving(false)
    }
  }

  function askToRegenerate(current: InstructionDraft) {
    confirmedDraft.current = current
    confirmation.current?.showModal()
  }

  async function generate(confirmed?: InstructionDraft) {
    setGenerating(true)
    setError('')
    setNotice('')
    try {
      const next = await service.generate(key, options, confirmed)
      setDraft(next)
      setMarkdown(next.markdown)
      setActiveArtifact('agents')
      setMode('edit')
      setNotice('Instructions generated and saved locally.')
    } catch (problem) {
      if (problem instanceof RegenerationConfirmationRequired) {
        setDraft(problem.draft)
        setMarkdown(problem.draft.markdown)
        askToRegenerate(problem.draft)
      } else setError(errorMessage(problem))
    } finally {
      setGenerating(false)
    }
  }

  async function edit(value: string) {
    const latest = ++revision.current
    setMarkdown(value)
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const next = await service.saveEdit(key, value)
      if (revision.current === latest) setDraft(next)
    } catch (problem) {
      if (revision.current === latest) setError(errorMessage(problem))
    } finally {
      if (revision.current === latest) setSaving(false)
    }
  }

  async function copyMarkdown() {
    if (!file) return
    try {
      await navigator.clipboard.writeText(file.markdown)
      setNotice('Markdown copied.')
    } catch {
      setNotice('Could not copy Markdown. Select and copy the text in the Markdown view.')
    }
  }

  return <div className="agent-instructions">
    <section className="panel agent-settings" aria-labelledby="agent-settings-title">
      <h2 id="agent-settings-title">Agent instructions</h2>
      <div className="agent-field">
        <label htmlFor="agent-objective">Instruction objective</label>
        <input id="agent-objective" className="field" disabled={!loaded || generating} value={settings.objective ?? topic.description}
          placeholder={topic.description || topic.title} aria-describedby="agent-objective-status"
          onChange={event => void changeSettings({ objective: event.target.value })} />
        <span id="agent-objective-status" className="sr-only">Your objective saves automatically for this topic, project, and agent profile.</span>
      </div>
      <div className="agent-field">
        <label htmlFor="agent-usage-context">Usage context</label>
        <select id="agent-usage-context" className="field" disabled={!loaded || contextLocked} value={usage}
          onChange={event => void changeSettings({ usage: event.target.value as UsageContext })} aria-describedby="agent-context-availability">
          {(Object.keys(usageContexts) as UsageContext[]).map(context => <option key={context} value={context}>{usageContexts[context]}</option>)}
        </select>
        <p className="muted agent-hint" id="agent-context-availability">
          {usage === 'topic' ? 'Project and implementation details are excluded.' :
            !project ? 'Select a project to include project or implementation details.' :
            usage === 'project' ? 'Implementation details are excluded.' :
            loaded && !hasImplementation ? `Implementation context is unavailable for ${project.name}. The topic and project can still be included.` :
            'Uses the selected project’s implementation.'}
        </p>
      </div>
      <div className="agent-source-fields">
        <div className="agent-field">
          <label htmlFor="agent-project">Project</label>
          <select id="agent-project" className="field" value={project?.id ?? ''} disabled={contextLocked}
            onChange={event => onContextChange('project', event.target.value)}>
            <option value="">No project</option>
            {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="agent-field">
          <label htmlFor="agent-profile">Agent profile</label>
          <select id="agent-profile" className="field" value={profile.id} disabled={contextLocked} aria-describedby="agent-profile-description"
            title={profile.description} onChange={event => onContextChange('agent', event.target.value)}>
            {agentProfiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <p className="sr-only" id="agent-profile-description">{profile.description}</p>
        </div>
        {!projects.length && <p className="muted agent-hint">No projects are available.</p>}
      </div>
      <fieldset className="agent-options" disabled={generating}>
        <legend className="sr-only">Include in instructions</legend>
        {(Object.keys(optionLabels) as (keyof InstructionOptions)[]).map(option => <label key={option}>
          <input type="checkbox" role="switch" checked={options[option] && (option === 'plan' ? includeImplementation : option === 'criteria' ? includeImplementation && options.plan : true)}
            disabled={(option === 'plan' && !includeImplementation) || (option === 'criteria' && (!includeImplementation || !options.plan))}
            onChange={event => onOptionsChange({ ...options, [option]: event.target.checked })} />
          {optionLabels[option]}
        </label>)}
      </fieldset>
      <button type="button" className="button primary agent-generate" disabled={!loaded || contextLocked}
        onClick={() => draft?.manuallyEdited ? askToRegenerate(draft) : void generate()}>
        {draft ? <RotateCw size={17} /> : <WandSparkles size={17} />}
        {generating ? 'Generating…' : draft ? 'Regenerate' : 'Generate Instructions'}
      </button>
    </section>
    <section ref={preview} tabIndex={-1} className="panel agent-document" aria-labelledby="agent-document-title">
      <div className="editor-heading">
        <h2 id="agent-document-title">Instruction preview</h2>
        <div className="segmented agent-formats" role="group" aria-label="Instruction format">
          <button type="button" aria-pressed={format === 'markdown'} onClick={() => {
            if (format === 'markdown') setMode('edit')
            setFormat('markdown')
          }}>Markdown</button>
          <button type="button" aria-pressed={format === 'yaml'} onClick={() => setFormat('yaml')}>YAML</button>
        </div>
      </div>
      {format === 'markdown' && draft?.artifacts && <div className="agent-field">
        <select className="field" aria-label="Preview artifact" value={activeArtifact}
          onChange={event => setActiveArtifact(event.target.value as ArtifactKind)}>
          {files.map(item => <option key={item.kind} value={item.kind}>{item.name}</option>)}
        </select>
      </div>}
      {!loaded ? <p className="muted" role="status">{error ? 'Draft unavailable.' : 'Loading draft…'}</p>
        : format === 'yaml' ? draft?.yaml
          ? <textarea key="yaml" className="markdown-input agent-markdown" aria-label="Instruction YAML" spellCheck={false} readOnly value={draft.yaml} />
          : <div className="agent-empty"><p className="muted">{draft ? 'Regenerate instructions to create a YAML preview for this draft.' : 'Generate instructions to preview them as YAML.'}</p></div>
        : !draft ? <div className="agent-empty"><FileText className="purple" size={25} aria-hidden="true" />
          <p className="muted">Generate instructions from {topic.title} to start a draft.</p></div>
          : mode === 'edit'
            ? <textarea key="markdown" className="markdown-input agent-markdown" aria-label="Instruction Markdown" spellCheck={false}
              disabled={generating} readOnly={activeArtifact !== 'agents'} value={file?.markdown ?? ''}
              onChange={event => void edit(event.target.value)} />
            : <div className="editor-preview agent-preview" tabIndex={0} aria-label="Rendered Markdown">{file?.markdown.trim() ? <Markdown content={file.markdown} /> : <p className="muted">The draft is empty.</p>}</div>}
      {format === 'markdown' && draft && <div className="agent-preview-actions">
        <button type="button" className="button" onClick={() => setMode(mode === 'edit' ? 'preview' : 'edit')}>
          {mode === 'edit' ? <><Eye size={15} /> Rendered preview</> : <><Code2 size={15} /> {activeArtifact === 'agents' ? 'Edit Markdown' : 'View Markdown'}</>}
        </button>
        <button type="button" className="button" disabled={generating} onClick={() => void copyMarkdown()}><Copy size={15} /> Copy Markdown</button>
      </div>}
      <p className={notice ? 'agent-notice' : 'sr-only'} role="status">{notice}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {!loaded && error && <button className="button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Try again</button>}
      {unsaved && !saving && <button className="button" onClick={() => void edit(markdown)}>Retry saving edits</button>}
      {settingsFailure && !settingsSaving && <button className="button" onClick={() => void changeSettings(settingsFailure)}>Retry saving settings</button>}
    </section>
    <section className="panel agent-artifacts" aria-labelledby="agent-artifacts-title">
      <h2 id="agent-artifacts-title">Generated artifacts</h2>
      {draft ? <>
        <ul className="agent-artifact-list">
          {files.map(item => <li key={item.kind}>
            <FileText className="purple" size={19} aria-hidden="true" />
            <button type="button" className="agent-artifact-name" aria-pressed={activeArtifact === item.kind} onClick={() => {
              setActiveArtifact(item.kind)
              setFormat('markdown')
              preview.current?.focus()
            }}>{item.name}</button>
            <span className="agent-artifact-type">{{ agents: 'Agent instructions', prompt: 'Implementation prompt', checklist: 'Validation checklist' }[item.kind]}</span>
            <button type="button" className="button icon-button agent-artifact-download" aria-label={`Download ${item.name}`}
              title={`Download ${item.name}`} disabled={generating} onClick={() => {
                downloadMarkdown(item.markdown, item.name)
                setNotice(`Downloading ${item.name}.`)
              }}><Download size={17} /></button>
          </li>)}
        </ul>
        <p className="muted agent-hint" role="status">{saving ? 'Saving edits…' : unsaved ? 'Edits have not been saved.' : draft.manuallyEdited ? 'Edited draft saved locally.' : 'Generated draft saved locally.'}</p>
      </> : <p className="muted agent-hint">Generate instructions to make a Markdown file available here.</p>}
    </section>
    <GenerationTemplates service={service} selectedId={settings.templateId} disabled={!loaded || busy || unsaved}
      onSelect={templateId => void changeSettings({ templateId })} />
    <dialog ref={confirmation} className="panel delete-dialog" aria-labelledby="agent-regenerate-title">
      <h2 id="agent-regenerate-title">Replace manual edits?</h2>
      <p>Regenerating this draft will replace your edits with instructions from the current Playbook source.</p>
      <div className="editor-actions">
        <button className="button" autoFocus onClick={() => confirmation.current?.close()}>Keep edits</button>
        <button className="button primary" onClick={() => {
          confirmation.current?.close()
          void generate(confirmedDraft.current)
        }}>Replace and regenerate</button>
      </div>
    </dialog>
  </div>
}
