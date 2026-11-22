import { useEffect, useId, useState, type FormEvent } from 'react'
import type { KnowledgeService } from '../application/knowledge-service'
import type { KnowledgeSection } from '../domain/knowledge'
import { Markdown } from './markdown'
import './knowledge.css'

type Knowledge = Awaited<ReturnType<KnowledgeService['read']>>

export function KnowledgeContent({ topicId, service }: { topicId: string; service: KnowledgeService }) {
  const [knowledge, setKnowledge] = useState<Knowledge>()
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    service.read(topicId).then(
      result => { if (active) setKnowledge(result) },
      problem => { if (active) setError(problem instanceof Error ? problem.message : 'Could not load knowledge sections.') },
    )
    return () => { active = false }
  }, [service, topicId])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!knowledge) return <p role="status">Loading knowledge sections…</p>
  if (!knowledge.sections.length && !knowledge.migrationNotice) return null

  async function saveSection(section: KnowledgeSection, content: string) {
    const updated = await service.saveSection(topicId, section.id, content)
    setKnowledge(current => current && {
      ...current,
      sections: current.sections.map(item => item.id === updated.id ? updated : item),
    })
  }

  return <div className="knowledge-content">
    {knowledge.migrationNotice && <p className="muted" role="status">{knowledge.migrationNotice}</p>}
    {knowledge.sections.map(section => <Section key={section.id} section={section} onSave={content => saveSection(section, content)} />)}
  </div>
}

function Section({ section, onSave }: { section: KnowledgeSection; onSave: (content: string) => Promise<void> }) {
  const headingId = useId()
  const [draft, setDraft] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || draft === undefined) return
    setError('')
    setSaving(true)
    try {
      await onSave(draft)
      setDraft(undefined)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save the knowledge section.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="knowledge-section" aria-labelledby={headingId}>
    <h3 id={headingId}>{section.title}</h3>
    {draft === undefined ? <>
      {section.content ? <Markdown content={section.content} /> : <p className="muted">This section is empty.</p>}
      <button className="button" onClick={() => setDraft(section.content)}>Edit {section.title}</button>
    </> : <form onSubmit={save}>
      <fieldset disabled={saving}>
        <label>Section Markdown
          <textarea className="markdown-input" rows={5} value={draft} onChange={event => setDraft(event.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="editor-actions">
          <button className="button" type="button" onClick={() => { setDraft(undefined); setError('') }}>Cancel</button>
          <button className="button primary">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </fieldset>
    </form>}
  </section>
}
