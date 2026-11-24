import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Copy, MoreHorizontal, Pencil, Trash2, type LucideIcon } from 'lucide-react'

const actions = [
  { id: 'edit', label: 'Edit', Icon: Pencil },
  { id: 'duplicate', label: 'Duplicate', Icon: Copy },
  { id: 'trash', label: 'Move to Trash', Icon: Trash2, destructive: true },
] as const

export type TopicAction = (typeof actions)[number]['id']

export function TopicActions({ title, onAction }: { title: string; onAction: (action: TopicAction) => void }) {
  return <ContextActions title={title} buttonTitle="Topic actions" entries={actions} onAction={onAction} />
}

export function ContextActions<Action extends string>({ title, buttonTitle, entries, onAction }: {
  title: string
  buttonTitle: string
  entries: readonly { id: Action; label: string; Icon: LucideIcon; destructive?: boolean; disabled?: boolean }[]
  onAction: (action: Action) => void
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const items = useRef<Array<HTMLButtonElement | null>>([])
  const initialItem = useRef(0)
  const [position, setPosition] = useState<{ left: number; above: boolean }>()

  useEffect(() => {
    if (!position) return
    items.current[initialItem.current]?.focus({ preventScroll: true })
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setPosition(undefined)
    }
    function close() { setPosition(undefined) }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', close)
    }
  }, [position])

  function open(index = 0) {
    const bounds = trigger.current?.getBoundingClientRect()
    if (!bounds) return
    initialItem.current = index
    const above = window.innerHeight - bounds.bottom < 150 && bounds.top > 150
    const rootLeft = root.current?.getBoundingClientRect().left ?? bounds.left
    setPosition({ left: Math.max(8, bounds.right - 186) - rootLeft, above })
  }

  function closeAndFocus() {
    setPosition(undefined)
    trigger.current?.focus({ preventScroll: true })
  }

  function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.current.findIndex(item => item === event.target)
    const last = entries.length - 1
    if (event.key === 'Tab') {
      closeAndFocus()
      return
    }
    const next = event.key === 'ArrowDown' ? (index + 1) % entries.length
      : event.key === 'ArrowUp' ? (index + last) % entries.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? last : undefined
    if (next === undefined && event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    if (next === undefined) closeAndFocus()
    else items.current[next]?.focus({ preventScroll: true })
  }

  return <div className="topic-action-menu" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setPosition(undefined)
  }}>
    <button type="button" className="topic-action-trigger" ref={trigger} aria-label={`Actions for ${title}`}
      title={buttonTitle} aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined}
      onClick={() => position ? closeAndFocus() : open()}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        open(event.key === 'ArrowUp' ? entries.length - 1 : 0)
      }}><MoreHorizontal size={19} aria-hidden="true" /></button>
    {position && <div className="topic-action-popup" id={id} role="menu" aria-label={`Actions for ${title}`}
      data-above={position.above || undefined} style={{ left: position.left }} onKeyDown={navigateMenu}>
      {entries.map(({ id: action, label, Icon, destructive, disabled }, index) => <button type="button" key={action} role="menuitem" tabIndex={-1}
        aria-disabled={disabled || undefined}
        ref={node => { items.current[index] = node }} className={destructive ? 'topic-action-destructive' : undefined}
        onClick={() => { if (!disabled) { closeAndFocus(); onAction(action) } }}><Icon size={16} aria-hidden="true" />{label}</button>)}
    </div>}
  </div>
}
