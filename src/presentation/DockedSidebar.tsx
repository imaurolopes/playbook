import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Pin, PinOff, type LucideIcon } from 'lucide-react'

export function DockedSidebar({ label, railLabel, railIcon: RailIcon, panelId, pinned, width, onTogglePin, focusRequest, onFocusRequest, children }: {
  label: string
  railLabel: string
  railIcon: LucideIcon
  panelId: string
  pinned: boolean
  width: number
  onTogglePin: () => void
  focusRequest?: number
  onFocusRequest?: () => void
  children: (pin: ReactNode) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLButtonElement>(null)
  const pinButton = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const focusOnOpen = useRef(false)
  const changingPin = useRef(false)

  function cancelTimer() {
    window.clearTimeout(timer.current)
  }

  useEffect(() => cancelTimer, [])

  useLayoutEffect(() => {
    if (!changingPin.current) return
    changingPin.current = false
    if (!pinned) rail.current?.focus()
  }, [pinned])

  useLayoutEffect(() => {
    if (!focusRequest) return
    if (!pinned && !open) {
      setOpen(true)
      return
    }
    const frame = window.requestAnimationFrame(() => onFocusRequest?.())
    return () => window.cancelAnimationFrame(frame)
  }, [focusRequest, onFocusRequest, open, pinned])

  useLayoutEffect(() => {
    if (!open || !focusOnOpen.current) return
    focusOnOpen.current = false
    pinButton.current?.focus()
  }, [open])

  const pin = <button type="button" className="sidebar-pin" ref={pinButton}
    aria-label={`${pinned ? 'Unpin' : 'Pin'} ${label}`} title={`${pinned ? 'Unpin' : 'Pin'} ${label}`}
    onClick={() => {
      cancelTimer()
      changingPin.current = true
      setOpen(false)
      onTogglePin()
    }}>
    {pinned ? <Pin size={16} aria-hidden="true" /> : <PinOff size={16} aria-hidden="true" />}
  </button>

  return <div className="docked-sidebar" ref={root} data-pinned={pinned} data-overlay-open={!pinned && open || undefined}
    onPointerEnter={event => {
      if (pinned || open || event.pointerType === 'touch') return
      cancelTimer()
      timer.current = window.setTimeout(() => setOpen(true), 160)
    }}
    onPointerLeave={() => {
      cancelTimer()
      if (!pinned && (document.activeElement === rail.current || !root.current?.contains(document.activeElement))) setOpen(false)
    }}
    onBlur={event => {
      if (!pinned && !event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(':hover')) setOpen(false)
    }}
    onKeyDown={event => {
      if (pinned || !open || event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      cancelTimer()
      setOpen(false)
      rail.current?.focus()
    }}>
    {!pinned && <button type="button" className="sidebar-rail" ref={rail} aria-expanded={open} aria-controls={panelId}
      aria-label={`Show ${railLabel}`} onClick={event => {
        cancelTimer()
        if (event.detail === 0) {
          if (open) pinButton.current?.focus()
          else focusOnOpen.current = true
        }
        setOpen(true)
      }}><span className="sidebar-rail-label"><RailIcon size={17} aria-hidden="true" /><span>{railLabel}</span></span></button>}
    <div className="docked-sidebar-content" inert={!pinned && !open} style={pinned ? undefined : { width }}>
      {children(pin)}
    </div>
  </div>
}
