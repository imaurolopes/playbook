import { useState, type FormEvent } from 'react'
import { Eye, Pencil, Save } from 'lucide-react'
import { scopes, validateParent, type Topic, type TopicInput } from '../domain/topic'
import { Markdown } from './markdown'

export function TopicEditor({ topic, topics, onCancel, onSave }: {
  topic?: Topic
  topics: readonly Topic[]
  onCancel: () => void
  onSave: (input: TopicInput) => Promise<void>
}) {
  const [draft, setDraft] = useState<TopicInput>({
    title: topic?.title ?? '',
    description: topic?.description ?? '',
    content: topic?.content ?? '',
    parentId: topic?.parentId,
    scope: topic?.scope ?? 'Project',
  })
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function update<K extends keyof TopicInput>(key: K, value: TopicInput[K]) {
    setDraft(current => ({ ...current, [key]: value }))
  }

  const parents = topics.filter(candidate => {
    try {
      validateParent(topics, topic?.id ?? '', candidate.id)
      return true
    } catch {
      return false
    }
  })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onSave(draft)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save this topic.')
    } finally {
      setBusy(false)
    }
  }

  return <form className="panel topic-editor" onSubmit={submit}>
    <fieldset disabled={busy}>
      <legend>Topic details</legend>
      <label>Title <input required value={draft.title} onChange={event => update('title', event.target.value)} /></label>
      <label>Description <textarea rows={2} value={draft.description} onChange={event => update('description', event.target.value)} /></label>
      <div className="form-columns">
        <label>Parent topic <select value={draft.parentId ?? ''} onChange={event => update('parentId', event.target.value || undefined)}>
          <option value="">Top level</option>
          {parents.map(parent => <option key={parent.id} value={parent.id}>{parent.title}</option>)}
        </select></label>
        <label>Scope <select value={draft.scope} onChange={event => {
          const scope = scopes.find(value => value === event.target.value)
          if (scope) update('scope', scope)
        }}>{scopes.map(scope => <option key={scope}>{scope}</option>)}</select></label>
      </div>
      <div className="editor-heading">
        <h2>Context</h2>
        <div className="segmented" aria-label="Context editor mode">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}><Pencil size={15} /> Write</button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}><Eye size={16} /> Preview</button>
        </div>
      </div>
      {preview ? <div className="editor-preview"><Markdown content={draft.content} /></div>
        : <textarea className="markdown-input" aria-label="Context Markdown" placeholder="Write context in Markdown..." rows={11} value={draft.content} onChange={event => update('content', event.target.value)} />}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="editor-actions">
        <button type="button" className="button" onClick={onCancel}>Cancel</button>
        <button className="button primary" type="submit"><Save size={17} /> {busy ? 'Saving…' : 'Save topic'}</button>
      </div>
    </fieldset>
  </form>
}
