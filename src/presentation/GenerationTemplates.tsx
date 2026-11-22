import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import type { InstructionService } from '../application/instruction-service'
import {
  artifactKinds, artifactNames, availableSections, defaultGenerationTemplate, templateSections,
  type ArtifactKind, type GenerationTemplate, type TemplateInput, type TemplateSection,
} from '../domain/generation-template'

const emptyTemplate = (): TemplateInput => ({
  name: '', description: '', sections: {
    agents: [...availableSections.agents], prompt: [...availableSections.prompt], checklist: [...availableSections.checklist],
  },
})

export function GenerationTemplates({ service, selectedId, disabled, onSelect }: {
  service: InstructionService
  selectedId?: string
  disabled: boolean
  onSelect: (id: string) => void
}) {
  const [templates, setTemplates] = useState([defaultGenerationTemplate])
  const [mode, setMode] = useState<'create' | 'edit' | 'delete'>('create')
  const [editing, setEditing] = useState<GenerationTemplate>()
  const [input, setInput] = useState<TemplateInput>(emptyTemplate)
  const [artifact, setArtifact] = useState<ArtifactKind>('agents')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dialogError, setDialogError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const selected = templates.find(item => item.id === selectedId) ?? defaultGenerationTemplate

  useEffect(() => {
    let active = true
    service.templates().then(items => { if (active) setTemplates(items) }, problem => {
      if (active) setError(problem instanceof Error ? problem.message : 'Could not load templates.')
    })
    return () => { active = false }
  }, [service])

  function open(nextMode: typeof mode) {
    setMode(nextMode)
    setEditing(nextMode === 'create' ? undefined : selected)
    setInput(nextMode === 'create' ? emptyTemplate() : selected)
    setArtifact('agents')
    setDialogError('')
    dialog.current?.showModal()
  }

  async function save() {
    setBusy(true)
    setDialogError('')
    try {
      if (mode === 'delete' && editing) {
        await service.deleteTemplate(editing.id)
        setTemplates(items => items.filter(item => item.id !== editing.id))
        if (selectedId === editing.id) onSelect(defaultGenerationTemplate.id)
      } else {
        const saved = await service.saveTemplate(input, mode === 'edit' ? editing?.id : undefined)
        setTemplates(items => mode === 'edit' ? items.map(item => item.id === saved.id ? saved : item) : [...items, saved])
        onSelect(saved.id)
      }
      dialog.current?.close()
    } catch (problem) {
      setDialogError(problem instanceof Error ? problem.message : 'Could not save template changes.')
    } finally {
      setBusy(false)
    }
  }

  async function duplicate() {
    setBusy(true)
    setError('')
    try {
      const copy = await service.duplicateTemplate(selected.id)
      setTemplates(items => [...items, copy])
      onSelect(copy.id)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not duplicate the template.')
    } finally {
      setBusy(false)
    }
  }

  const sections = input.sections[artifact]
  const excluded = availableSections[artifact].filter(section => !sections.includes(section))
  function changeSections(next: TemplateSection[]) {
    setInput(current => ({ ...current, sections: { ...current.sections, [artifact]: next } }))
  }
  function moveSection(index: number, direction: number) {
    const next = [...sections]
    const [section] = next.splice(index, 1)
    if (!section) return
    next.splice(index + direction, 0, section)
    changeSections(next)
  }

  return <section className="panel agent-template" aria-labelledby="agent-template-title">
    <h2 id="agent-template-title">Generation template</h2>
    <div className="agent-field">
      <select className="field" aria-label="Generation template" value={selected.id} disabled={disabled || busy}
        onChange={event => onSelect(event.target.value)}>
        {templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {selected.description && <p className="muted agent-hint">{selected.description}</p>}
    </div>
    <div className="agent-preview-actions">
      <button className="button" disabled={disabled || busy} onClick={() => open('create')}><Plus size={15} /> New</button>
      <button className="button" disabled={disabled || busy} onClick={() => void duplicate()}><Copy size={15} /> Duplicate</button>
      {!selected.isSystem && <>
        <button className="button" disabled={disabled || busy} onClick={() => open('edit')}><Pencil size={15} /> Edit</button>
        <button className="button" disabled={disabled || busy} onClick={() => open('delete')}><Trash2 size={15} /> Delete</button>
      </>}
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    <dialog ref={dialog} className="panel delete-dialog agent-template-dialog" aria-labelledby="agent-template-dialog-title"
      onCancel={event => { if (busy) event.preventDefault() }}>
      <h2 id="agent-template-dialog-title">{mode === 'delete' ? 'Delete template?' : mode === 'edit' ? 'Edit template' : 'New template'}</h2>
      <form onSubmit={event => { event.preventDefault(); if (!busy) void save() }}>
        <fieldset disabled={busy}>
          {mode === 'delete' ? <p>“{editing?.name}” will be deleted. Existing drafts will be kept.</p> : <>
            <div className="agent-field">
              <label htmlFor="agent-template-name">Name</label>
              <input className="field" id="agent-template-name" required value={input.name}
                onChange={event => setInput({ ...input, name: event.target.value })} />
            </div>
            <div className="agent-field">
              <label htmlFor="agent-template-description">Description</label>
              <textarea className="field" id="agent-template-description" rows={2} value={input.description}
                onChange={event => setInput({ ...input, description: event.target.value })} />
            </div>
            <div className="agent-field">
              <label htmlFor="agent-template-artifact">Artifact sections</label>
              <select className="field" id="agent-template-artifact" value={artifact}
                onChange={event => setArtifact(event.target.value as ArtifactKind)}>
                {artifactKinds.map(kind => <option key={kind} value={kind}>{artifactNames[kind]}</option>)}
              </select>
            </div>
            <ol className="agent-template-sections">{sections.map((section, index) => <li key={section}>
              <span>{templateSections[section]}</span>
              <button type="button" className="button icon-button" aria-label={`Move ${templateSections[section]} up`} disabled={index === 0} onClick={() => moveSection(index, -1)}><ArrowUp size={14} /></button>
              <button type="button" className="button icon-button" aria-label={`Move ${templateSections[section]} down`} disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)}><ArrowDown size={14} /></button>
              <button type="button" className="button icon-button" aria-label={`Remove ${templateSections[section]}`} onClick={() => changeSections(sections.filter(item => item !== section))}><Trash2 size={14} /></button>
            </li>)}</ol>
            {excluded.length > 0 && <select className="field" aria-label="Add template section" value=""
              onChange={event => {
                const section = excluded.find(item => item === event.target.value)
                if (section) changeSections([...sections, section])
              }}>
              <option value="">Add section</option>
              {excluded.map(section => <option key={section} value={section}>{templateSections[section]}</option>)}
            </select>}
          </>}
          {dialogError && <p className="error" role="alert">{dialogError}</p>}
          <div className="editor-actions">
            <button type="button" className="button" onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="submit" className={mode === 'delete' ? 'button danger' : 'button primary'}>{mode === 'delete' ? 'Delete template' : 'Save'}</button>
          </div>
        </fieldset>
      </form>
    </dialog>
  </section>
}
