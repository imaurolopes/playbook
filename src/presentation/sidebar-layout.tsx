import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const preferenceKey = 'playbook.layout.sidebar-widths'
const pinKey = 'playbook.layout.sidebar-pins'
const railWidth = 36
const mainMinimum = 700
const bounds = { workspace: { min: 180, max: 400 }, topics: { min: 200, max: 600 } } as const
type Sidebar = keyof typeof bounds
type Widths = Record<Sidebar, number>
type Preferences = Partial<Widths>
type Pins = Record<Sidebar, boolean>
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}')
    const preferences: Preferences = {}
    for (const sidebar of ['workspace', 'topics'] as const) {
      const width = value?.[sidebar]
      if (typeof width === 'number' && Number.isFinite(width)) {
        preferences[sidebar] = clamp(width, bounds[sidebar].min, bounds[sidebar].max)
      }
    }
    return preferences
  } catch {
    return {}
  }
}

function defaultWidth(sidebar: Sidebar, viewport: number) {
  return sidebar === 'workspace' ? clamp(viewport * 0.1525, 180, 255)
    : viewport <= 970 ? 225 : clamp(viewport * 0.19, 218, 318)
}

function loadPins(): Pins {
  try {
    const saved = JSON.parse(localStorage.getItem(pinKey) ?? '{}')
    return { workspace: saved?.workspace !== false, topics: saved?.topics !== false }
  } catch {
    return { workspace: true, topics: true }
  }
}

function fitLayout(viewport: number, hasTopics: boolean, preferences: Preferences, pins: Pins) {
  const workspaceVisible = hasTopics ? viewport >= mainMinimum + bounds.workspace.min + bounds.topics.min : viewport > 970
  const topicsStacked = hasTopics && viewport < mainMinimum + bounds.topics.min
  const topicsVisible = hasTopics && !topicsStacked
  const sidebarSpace = viewport - mainMinimum
  const topicsMinimum = topicsVisible ? (pins.topics ? bounds.topics.min : railWidth) : 0
  const workspaceWidth = workspaceVisible ? (pins.workspace
    ? clamp(preferences.workspace ?? defaultWidth('workspace', viewport), bounds.workspace.min, Math.min(bounds.workspace.max, sidebarSpace - topicsMinimum))
    : railWidth) : 0
  const topicsWidth = topicsVisible ? (pins.topics
    ? clamp(preferences.topics ?? defaultWidth('topics', viewport), bounds.topics.min, Math.min(bounds.topics.max, sidebarSpace - workspaceWidth))
    : railWidth) : 0
  return { viewport, workspaceVisible, topicsStacked, widths: { workspace: workspaceWidth, topics: topicsWidth } }
}

export function useSidebarLayout(hasTopics: boolean) {
  const grid = useRef<HTMLDivElement>(null)
  const [saved] = useState(loadPreferences)
  const preferences = useRef(saved)
  const [pins, setPins] = useState(loadPins)
  const [layout, setLayout] = useState(() => fitLayout(document.documentElement.clientWidth, hasTopics, saved, pins))
  const [dragging, setDragging] = useState<Sidebar>()
  const [docking, setDocking] = useState(false)

  useEffect(() => {
    if (!docking) return
    const timeout = window.setTimeout(() => setDocking(false), 240)
    return () => window.clearTimeout(timeout)
  }, [docking, pins])

  useLayoutEffect(() => {
    const element = grid.current
    if (!element) return
    let measured: number | undefined
    function measure() {
      const width = element!.clientWidth
      if (width === measured) return
      measured = width
      const next = fitLayout(width, hasTopics, preferences.current, pins)
      setLayout(next)
      setDragging(current => current && next.widths[current] > 0 ? current : undefined)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasTopics, pins])

  function handleProps(sidebar: Sidebar) {
    const other = sidebar === 'workspace' ? 'topics' : 'workspace'
    const min = bounds[sidebar].min
    const max = Math.min(bounds[sidebar].max, layout.viewport - mainMinimum - layout.widths[other])
    function resize(width: number) {
      const next = clamp(width, min, max)
      setLayout(current => ({ ...current, widths: { ...current.widths, [sidebar]: next } }))
      return next
    }
    function save(width?: number) {
      const next = { ...preferences.current, [sidebar]: width }
      preferences.current = next
      try { localStorage.setItem(preferenceKey, JSON.stringify(next)) } catch { /* Keep the session's layout. */ }
    }
    return {
      width: layout.widths[sidebar], min, max, resize, save,
      setDragging: (active: boolean) => setDragging(active ? sidebar : undefined),
      reset: () => { resize(defaultWidth(sidebar, layout.viewport)); save() },
    }
  }

  function togglePin(sidebar: Sidebar) {
    const next = { ...pins, [sidebar]: !pins[sidebar] }
    setDocking(true)
    setPins(next)
    try { localStorage.setItem(pinKey, JSON.stringify(next)) } catch { /* Keep the session's layout. */ }
  }

  function expandedWidth(sidebar: Sidebar) {
    return preferences.current[sidebar] ?? defaultWidth(sidebar, layout.viewport)
  }

  return { grid, layout, dragging, docking, handleProps, pins, togglePin, expandedWidth }
}

type HandleProps = ReturnType<ReturnType<typeof useSidebarLayout>['handleProps']>

export function SidebarResizeHandle({ label, panelId, width, min, max, resize, save, reset, setDragging }: HandleProps & {
  label: string
  panelId: string
}) {
  const drag = useRef<{ pointer: number; startX: number; startWidth: number; width: number } | undefined>(undefined)
  return <div className="sidebar-resize-handle" role="separator" aria-orientation="vertical" aria-label={label} aria-controls={panelId}
    aria-valuemin={min} aria-valuemax={Math.floor(max)} aria-valuenow={Math.round(width)} tabIndex={0}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return
      event.preventDefault()
      event.currentTarget.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { pointer: event.pointerId, startX: event.clientX, startWidth: width, width }
      setDragging(true)
    }}
    onPointerMove={event => {
      const active = drag.current
      if (active?.pointer === event.pointerId) active.width = resize(active.startWidth + event.clientX - active.startX)
    }}
    onPointerUp={event => {
      const active = drag.current
      if (active?.pointer !== event.pointerId) return
      if (active.width !== active.startWidth) save(active.width)
      drag.current = undefined
      setDragging(false)
    }}
    onLostPointerCapture={() => {
      if (!drag.current) return
      resize(drag.current.startWidth)
      drag.current = undefined
      setDragging(false)
    }}
    onDoubleClick={reset}
    onKeyDown={event => {
      const target = event.key === 'ArrowLeft' ? width - 10 : event.key === 'ArrowRight' ? width + 10
        : event.key === 'Home' ? min : event.key === 'End' ? max : undefined
      if (target === undefined && event.key !== 'Enter') return
      event.preventDefault()
      if (target === undefined) reset()
      else save(resize(target))
    }} />
}
