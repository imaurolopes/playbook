import { useRef, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import type { TrashedTopic } from '../domain/topic'

const deletionDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function Trash({ topics, onRestore, onDelete, onEmpty }: {
  topics: readonly TrashedTopic[]
  onRestore: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onEmpty: () => Promise<void>
}) {
  const [confirmation, setConfirmation] = useState<TrashedTopic | 'all'>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  function confirm(selection: TrashedTopic | 'all') {
    setError('')
    setConfirmation(selection)
    dialog.current?.showModal()
  }

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      dialog.current?.close()
      setNotice(message)
      heading.current?.focus()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not update Trash.')
    } finally {
      setBusy(false)
    }
  }

  const emptying = confirmation === 'all'
  return <section className="panel trash-panel" aria-labelledby="trash-heading">
    <header className="trash-header">
      <h1 id="trash-heading" ref={heading} tabIndex={-1}><Trash2 size={24} aria-hidden="true" /> Trash</h1>
      <button className="button danger" disabled={busy || !topics.length} onClick={() => confirm('all')}>Empty Trash</button>
    </header>
    <p role="status" className="muted">{notice}</p>
    {error && !confirmation && <p className="error" role="alert">{error}</p>}
    {topics.length ? <ul className="trash-list">
      {topics.map(topic => <li key={topic.id}>
        <div><h2>{topic.title}</h2><time className="muted" dateTime={topic.deletedAt}>{deletionDate.format(new Date(topic.deletedAt))}</time></div>
        <div className="trash-actions" role="group" aria-label={topic.title}>
          <button className="button" disabled={busy} onClick={() => void run(() => onRestore(topic.id), `Restored ${topic.title}.`)}><RotateCcw size={16} aria-hidden="true" /> Restore</button>
          <button className="button danger" disabled={busy} onClick={() => confirm(topic)}>Delete permanently</button>
        </div>
      </li>)}
    </ul> : <p className="muted">Trash is empty.</p>}

    <dialog ref={dialog} className="panel delete-dialog" aria-labelledby="trash-confirm-title"
      onCancel={event => { if (busy) event.preventDefault() }}
      onClose={() => { setConfirmation(undefined); setError('') }}>
      <h2 id="trash-confirm-title">{emptying ? 'Empty Trash?' : 'Delete permanently?'}</h2>
      <p>{emptying ? `Permanently delete all ${topics.length} trashed ${topics.length === 1 ? 'topic' : 'topics'} and their associated data?`
        : <>Permanently delete <strong>{confirmation?.title}</strong> and its associated data?</>} This cannot be undone.</p>
      {error && confirmation && <p className="error" role="alert">{error}</p>}
      <div className="editor-actions">
        <button className="button" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="button danger" disabled={busy || !confirmation} onClick={() => {
          if (confirmation === 'all') void run(onEmpty, 'Trash emptied.')
          else if (confirmation) void run(() => onDelete(confirmation.id), `Permanently deleted ${confirmation.title}.`)
        }}>{emptying ? 'Empty Trash' : 'Delete permanently'}</button>
      </div>
    </dialog>
  </section>
}
