import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Eye, Pencil, Save } from 'lucide-react'
import { defaultTopicType, isTopicType, topicTypes, type Topic, type TopicInput } from '../domain/topic'
import { topicTypeDisplay } from './topic-types'
import { Markdown } from './markdown'
import { MarkdownEditor, MarkdownIndicator } from './MarkdownEditor'

export function TopicEditor({ topic, onCancel, onSave, inDialog = false }: {
  topic?: Topic
  onCancel: () => void
  onSave: (input: TopicInput) => Promise<void>
  inDialog?: boolean
}) {
  const [draft, setDraft] = useState<TopicInput>({
    title: topic?.title ?? '',
    type: topic?.type ?? defaultTopicType,
    description: topic?.description ?? '',
    content: topic?.content ?? '',
  })
  const [preview, setPreview] = useState(false)
  const initialType = useRef(topic?.type)
  const type = draft.type === initialType.current ? topic?.type : draft.type
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
      await onSave({ ...draft, type })
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save this topic.')
    } finally {
      setBusy(false)
    }
  }

  const actions = <>
    <button type="button" className="button" disabled={busy} onClick={onCancel}>Cancel</button>
    <button className="button primary" type="submit" disabled={busy}><Save size={17} /> {busy ? 'Saving…' : 'Save'}</button>
  </>

  return <form className="panel topic-editor" onSubmit={submit}>
    {topic && !inDialog && <header className="topic-details-heading">
      <h2>Summary</h2>
      <div className="topic-details-actions">{actions}</div>
    </header>}
    <fieldset disabled={busy}>
      <legend>Topic details</legend>
      <label>Title <input required value={draft.title} onChange={event => update('title', event.target.value)} /></label>
      <label>Topic type <select value={type} onChange={event => {
        const type = event.target.value
        if (isTopicType(type)) update('type', type)
      }}>
        {topicTypes.map(type => <option key={type} value={type}>{topicTypeDisplay[type].label}</option>)}
      </select></label>
      <label>Description <textarea rows={2} value={draft.description} onChange={event => update('description', event.target.value)} /></label>
      <div className="editor-heading">
        <div className="context-editor-title"><h2>Summary</h2><MarkdownIndicator /></div>
        <div className="segmented" aria-label="Context editor mode">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}><Pencil size={15} /> Edit</button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}><Eye size={16} /> Preview</button>
        </div>
      </div>
      <MarkdownEditor label="Context Markdown" placeholder="Write context in Markdown..." rows={11}
        hidden={preview} value={draft.content} onChange={content => update('content', content)} />
      {preview && <div className="editor-preview"><Markdown content={draft.content} /></div>}
      {error && <p className="error" role="alert">{error}</p>}
      {(!topic || inDialog) && <div className="editor-actions">{actions}</div>}
    </fieldset>
  </form>
}

export function TopicEditDialog({ topic, onClose, onSave }: {
  topic: Topic
  onClose: () => void
  onSave: (input: TopicInput) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="panel delete-dialog topic-edit-dialog" aria-labelledby={titleId}
    onClose={onClose} onCancel={event => {
      if (event.currentTarget.querySelector('fieldset:disabled')) event.preventDefault()
    }}>
    <h2 id={titleId}>Edit topic</h2>
    <TopicEditor topic={topic} inDialog onCancel={() => dialog.current?.close()} onSave={async input => {
      await onSave(input)
      dialog.current?.close()
    }} />
  </dialog>
}
