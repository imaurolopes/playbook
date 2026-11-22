import { useState, type FormEvent } from 'react'
import { Eye, Pencil, Save } from 'lucide-react'
import type { Topic, TopicInput } from '../domain/topic'
import { Markdown } from './markdown'
import { MarkdownEditor, MarkdownIndicator } from './MarkdownEditor'

export function TopicEditor({ topic, onCancel, onSave }: {
  topic?: Topic
  onCancel: () => void
  onSave: (input: TopicInput) => Promise<void>
}) {
  const [draft, setDraft] = useState<TopicInput>({
    title: topic?.title ?? '',
    description: topic?.description ?? '',
    content: topic?.content ?? '',
  })
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function update<K extends keyof TopicInput>(key: K, value: TopicInput[K]) {
    setDraft(current => ({ ...current, [key]: value }))
  }

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
      <div className="editor-heading">
        <div className="context-editor-title"><h2>Context</h2><MarkdownIndicator /></div>
        <div className="segmented" aria-label="Context editor mode">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}><Pencil size={15} /> Edit</button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}><Eye size={16} /> Preview</button>
        </div>
      </div>
      <MarkdownEditor label="Context Markdown" placeholder="Write context in Markdown..." rows={11}
        hidden={preview} value={draft.content} onChange={content => update('content', content)} />
      {preview && <div className="editor-preview"><Markdown content={draft.content} /></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="editor-actions">
        <button type="button" className="button" onClick={onCancel}>Cancel</button>
        <button className="button primary" type="submit"><Save size={17} /> {busy ? 'Saving…' : 'Save'}</button>
      </div>
    </fieldset>
  </form>
}
