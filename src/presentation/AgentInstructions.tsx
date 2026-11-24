import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Code2, Copy, Download, Eye, FileText, RotateCw, WandSparkles } from 'lucide-react'
import { InstructionService, RegenerationConfirmationRequired } from '../application/instruction-service'
import {
  agentProfiles, defaultInstructionOptions, getAgentProfile, instructionFilename, instructionKey,
  type AgentProfile, type InstructionDraft, type InstructionKey, type InstructionOptions, type InstructionSettings,
} from '../domain/agent-instructions'
import { artifactNames, defaultGenerationTemplate, type ArtifactKind } from '../domain/generation-template'
import type { Topic } from '../domain/topic'
import { Markdown } from './markdown'
import { downloadMarkdown } from './download-markdown'

const optionLabels: Record<keyof InstructionOptions, string> = {
  dependencies: 'Dependencies',
  content: 'Playbook standards',
  plan: 'Checklist',
  criteria: 'Acceptance criteria',
}

function errorMessage(problem: unknown) {
  return problem instanceof Error ? problem.message : 'Something went wrong. Please try again.'
}

function hasLegacyObjective(draft: InstructionDraft) {
  return draft.yaml ? /^objective:/m.test(draft.yaml) : /^## Objective\s*$/mi.test(draft.generatedMarkdown)
}

function previewText(value: string) {
  return value.replace(/\r\n?/g, '\n')
}

export function AgentInstructions({ topic, service }: { topic: Topic; service: InstructionService }) {
  const [query, setQuery] = useSearchParams()
  const [options, setOptions] = useState(defaultInstructionOptions)
  const profile = getAgentProfile(query.get('agent')) ?? agentProfiles[0]
  const context = { topicId: topic.id, agentProfileId: profile.id }

  function changeProfile(value: string) {
    setQuery(params => {
      params.set('agent', value)
      return params
    }, { replace: true })
  }

  return <InstructionWorkspace key={instructionKey(context)} topic={topic}
    profile={profile} service={service} options={options} onOptionsChange={setOptions} onProfileChange={changeProfile} />
}

function InstructionWorkspace({ topic, profile, service, options, onOptionsChange, onProfileChange }: {
  topic: Topic
  profile: AgentProfile
  service: InstructionService
  options: InstructionOptions
  onOptionsChange: (options: InstructionOptions) => void
  onProfileChange: (value: string) => void
}) {
  const key = useMemo<InstructionKey>(() => ({
    topicId: topic.id, agentProfileId: profile.id,
  }), [topic.id, profile.id])
  const [draft, setDraft] = useState<InstructionDraft>()
  const [settings, setSettings] = useState<InstructionSettings>({})
  const [templates, setTemplates] = useState([defaultGenerationTemplate])
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsFailure, setSettingsFailure] = useState<InstructionSettings>()
  const settingsRevision = useRef(0)
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'source' | 'preview'>('source')
  const [format, setFormat] = useState<'markdown' | 'yaml'>('markdown')
  const [activeArtifact, setActiveArtifact] = useState<ArtifactKind>('agents')
  const preview = useRef<HTMLElement>(null)
  const [generating, setGenerating] = useState(false)
  const [outdated, setOutdated] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const confirmation = useRef<HTMLDialogElement>(null)
  const confirmedDraft = useRef<InstructionDraft | undefined>(undefined)
  const previewDraft = draft && !hasLegacyObjective(draft) ? draft : undefined
  const yaml = previewDraft?.yaml && previewText(previewDraft.yaml)
  const files = previewDraft ? [
    { kind: 'agents' as const, name: previewDraft.artifacts ? artifactNames.agents : instructionFilename(topic.title, profile), markdown: previewText(previewDraft.generatedMarkdown) },
    ...(previewDraft.artifacts ? [
      { kind: 'prompt' as const, name: artifactNames.prompt, markdown: previewText(previewDraft.artifacts.prompt) },
      { kind: 'checklist' as const, name: artifactNames.checklist, markdown: previewText(previewDraft.artifacts.checklist) },
    ] : []),
  ] : []
  const file = files.find(item => item.kind === activeArtifact)
  const busy = generating || settingsSaving
  const contextLocked = busy || Boolean(settingsFailure)
  const selectedTemplate = templates.find(item => item.id === settings.templateId) ?? defaultGenerationTemplate

  useEffect(() => {
    let active = true
    Promise.all([service.load(key), service.settings(key), service.templates()]).then(([result, savedSettings, availableTemplates]) => {
      if (!active) return
      setDraft(result.draft)
      setSettings(savedSettings)
      setTemplates(availableTemplates)
      setLoaded(true)
    }, problem => { if (active) setError(errorMessage(problem)) })
    return () => { active = false }
  }, [service, key, attempt])

  useEffect(() => {
    if (!draft || !loaded || settingsSaving || generating) return
    let active = true
    service.isOutdated(key, options, draft).then(value => {
      if (active) setOutdated(value)
    }, () => { if (active) setOutdated(true) })
    return () => { active = false }
  }, [service, key, draft, options, topic, loaded, settings, settingsSaving, generating])

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
      setOutdated(false)
      setActiveArtifact('agents')
      setMode('source')
      setNotice('Instructions generated and saved locally.')
    } catch (problem) {
      if (problem instanceof RegenerationConfirmationRequired) {
        setDraft(problem.draft)
        askToRegenerate(problem.draft)
      } else setError(errorMessage(problem))
    } finally {
      setGenerating(false)
    }
  }

  async function copyPreview() {
    const content = format === 'yaml' ? yaml : file?.markdown
    if (content === undefined) return
    const label = format === 'yaml' ? 'YAML' : 'Markdown'
    try {
      await navigator.clipboard.writeText(content)
      setNotice(label + ' copied.')
    } catch {
      setNotice(`Could not copy ${label}. Select and copy the text in the source view.`)
    }
  }

  return <div className="agent-instructions">
    <section className="panel agent-settings" aria-labelledby="agent-settings-title">
      <h2 id="agent-settings-title">Agent instructions</h2>
      <div className="agent-field">
        <label htmlFor="agent-profile">Agent profile</label>
        <select id="agent-profile" className="field" value={profile.id} disabled={contextLocked} aria-describedby="agent-profile-description"
          title={profile.description} onChange={event => onProfileChange(event.target.value)}>
          {agentProfiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <p className="sr-only" id="agent-profile-description">{profile.description}</p>
      </div>
      <div className="agent-field">
        <label htmlFor="agent-template-select">Generation template</label>
        <select id="agent-template-select" className="field" value={selectedTemplate.id} disabled={!loaded || contextLocked}
          aria-describedby="agent-template-description" onChange={event => void changeSettings({ templateId: event.target.value })}>
          {templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <p id="agent-template-description" className="muted agent-hint">{selectedTemplate.description}</p>
      </div>
      <fieldset className="agent-options" disabled={generating}>
        <legend>Include in instructions</legend>
        {(Object.keys(optionLabels) as (keyof InstructionOptions)[]).map(option => <label key={option}>
          <input type="checkbox" role="switch" checked={options[option] && (option !== 'criteria' || options.plan)}
            disabled={option === 'criteria' && !options.plan}
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
            if (format === 'markdown') setMode('source')
            setFormat('markdown')
          }}>Markdown</button>
          <button type="button" aria-pressed={format === 'yaml'} onClick={() => setFormat('yaml')}>YAML</button>
        </div>
      </div>
      {format === 'markdown' && previewDraft?.artifacts && <div className="agent-field">
        <select className="field" aria-label="Preview artifact" value={activeArtifact}
          onChange={event => setActiveArtifact(event.target.value as ArtifactKind)}>
          {files.map(item => <option key={item.kind} value={item.kind}>{item.name}</option>)}
        </select>
      </div>}
      {draft && (outdated || !previewDraft) && <p className="muted agent-hint" role="status">Preview is outdated. Regenerate to use the current Topic knowledge and settings.</p>}
      {!loaded ? <p className="muted" role="status">{error ? 'Draft unavailable.' : 'Loading draft…'}</p>
        : format === 'yaml' ? yaml
          ? <textarea key="yaml" className="markdown-input agent-markdown" aria-label="Instruction YAML" spellCheck={false} readOnly value={yaml} />
          : <div className="agent-empty"><p className="muted">{draft ? 'Regenerate instructions to create a YAML preview for this draft.' : 'Generate instructions to preview them as YAML.'}</p></div>
        : !previewDraft ? <div className="agent-empty"><FileText className="purple" size={25} aria-hidden="true" />
          <p className="muted">{draft ? 'Regenerate instructions to refresh this preview.' : `Generate instructions from ${topic.title} to start a draft.`}</p></div>
          : mode === 'source'
            ? <textarea key="markdown" className="markdown-input agent-markdown" aria-label="Instruction Markdown" spellCheck={false}
              readOnly value={file?.markdown ?? ''} />
            : <div className="editor-preview agent-preview" tabIndex={0} aria-label="Rendered Markdown">{file?.markdown.trim() ? <Markdown content={file.markdown} /> : <p className="muted">The draft is empty.</p>}</div>}
      {((format === 'markdown' && file) || (format === 'yaml' && yaml)) && <div className="agent-preview-actions">
        {format === 'markdown' && <button type="button" className="button" onClick={() => setMode(mode === 'source' ? 'preview' : 'source')}>
          {mode === 'source' ? <><Eye size={15} /> Rendered preview</> : <><Code2 size={15} /> View Markdown</>}
        </button>}
        <button type="button" className="button" onClick={() => void copyPreview()}><Copy size={15} /> {format === 'yaml' ? 'Copy YAML' : 'Copy Markdown'}</button>
      </div>}
      <p className={notice ? 'agent-notice' : 'sr-only'} role="status">{notice}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {!loaded && error && <button className="button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Try again</button>}
      {settingsFailure && !settingsSaving && <button className="button" onClick={() => void changeSettings(settingsFailure)}>Retry saving settings</button>}
    </section>
    <section className="panel agent-artifacts" aria-labelledby="agent-artifacts-title">
      <h2 id="agent-artifacts-title">Generated artifacts</h2>
      {previewDraft ? <>
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
        <p className="muted agent-hint">Generated draft saved locally.</p>
      </> : <p className="muted agent-hint">Generate instructions to make a Markdown file available here.</p>}
    </section>
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
