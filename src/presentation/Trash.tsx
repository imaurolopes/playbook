import { useRef, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import type { TrashEntityType, TrashItem, TrashTarget } from '../domain/trash'
import { entityIcons } from './navigation'

const deletionDate = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const typeLabels = { topic: 'Topic', project: 'Project' } satisfies Record<TrashEntityType, string>

export function Trash({ items, onRestore, onDelete, onEmpty }: {
  items: readonly TrashItem[]
  onRestore: (target: TrashTarget) => Promise<void>
  onDelete: (target: TrashTarget) => Promise<void>
  onEmpty: () => Promise<void>
}) {
  const [confirmation, setConfirmation] = useState<TrashItem | 'all'>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  function confirm(selection: TrashItem | 'all') {
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
      <button className="button danger" disabled={busy || !items.length} onClick={() => confirm('all')}>Empty Trash</button>
    </header>
    <p role="status" className="muted">{notice}</p>
    {error && !confirmation && <p className="error" role="alert">{error}</p>}
    {items.length ? <div className="trash-table-wrap" role="region" aria-label="Trash items" tabIndex={0}>
      <table className="playbook-table trash-table" aria-labelledby="trash-heading">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Name</th>
            <th scope="col">Deleted at</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const Icon = entityIcons[item.type]
            const label = typeLabels[item.type]
            return <tr key={item.type + ':' + item.id}>
              <td><span className="trash-entity-type"><Icon size={16} aria-hidden="true" />{label}</span></td>
              <td className="trash-item-name">{item.name}</td>
              <td><time className="muted" dateTime={item.deletedAt}>{deletionDate.format(new Date(item.deletedAt)).replace(',', '')}</time></td>
              <td>
                <div className="trash-actions" role="group" aria-label={item.type === 'topic' ? item.name : label + ': ' + item.name}>
                  <button className="button" disabled={busy} onClick={() => void run(() => onRestore(item), `Restored ${item.name}.`)}><RotateCcw size={16} aria-hidden="true" /> Restore</button>
                  <button className="button danger" disabled={busy} onClick={() => confirm(item)}>Delete permanently</button>
                </div>
              </td>
            </tr>
          })}
        </tbody>
      </table>
    </div> : <p className="muted">Trash is empty.</p>}

    <dialog ref={dialog} className="panel delete-dialog" aria-labelledby="trash-confirm-title"
      onCancel={event => { if (busy) event.preventDefault() }}
      onClose={() => { setConfirmation(undefined); setError('') }}>
      <h2 id="trash-confirm-title">{emptying ? 'Empty Trash?' : 'Delete permanently?'}</h2>
      <p>{emptying ? `Permanently delete all ${items.length} trashed ${items.length === 1 ? 'item' : 'items'} and their associated data?`
        : <>Permanently delete <strong>{confirmation?.name}</strong> and its associated data?</>} This cannot be undone.</p>
      {error && confirmation && <p className="error" role="alert">{error}</p>}
      <div className="editor-actions">
        <button className="button" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="button danger" disabled={busy || !confirmation} onClick={() => {
          if (confirmation === 'all') void run(onEmpty, 'Trash emptied.')
          else if (confirmation) void run(() => onDelete(confirmation), `Permanently deleted ${confirmation.name}.`)
        }}>{emptying ? 'Empty Trash' : 'Delete permanently'}</button>
      </div>
    </dialog>
  </section>
}
