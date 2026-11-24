import { memo, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Focus, GitFork, Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react'
import type { Topic } from '../domain/topic'
import type { TopicRelationship } from '../domain/topic-relationship'
import { layoutDependencyGraph, nodeWidth } from './dependency-graph-layout'
import { topicPath } from './navigation'
import { groupDetails, topicRelationshipGroups } from './topic-relationship-groups'
import { topicTypeDisplay } from './topic-types'

const GraphContent = memo(function GraphContent({ layout, rootId }: {
  layout: ReturnType<typeof layoutDependencyGraph>
  rootId: string
}) {
  const arrow = useId()
  const nodes = new Map(layout.nodes.map(node => [node.topic.id, node]))
  const groups = topicRelationshipGroups(rootId, layout.nodes.map(node => node.topic), layout.edges)
  const groupedIds = new Set<string>()
  function renderNode({ topic, x, y, height }: (typeof layout.nodes)[number]) {
    const style = { left: x, top: y, width: nodeWidth, height }
    const { icon: TypeIcon, color, label } = topicTypeDisplay[topic.type]
    const content = <><TypeIcon size={17} style={{ color }} aria-hidden="true" /><strong>{topic.title}</strong></>
    return topic.id === rootId
      ? <div key={topic.id} className="graph-node graph-center" style={style} title={label}>{content}</div>
      : <Link key={topic.id} to={topicPath(topic.id)} className="graph-node graph-edge" style={style} draggable={false} title={label}>
        {content}
      </Link>
  }
  return <>
    <svg className="graph-lines" viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
      <defs><marker id={arrow} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" viewBox="0 0 7 7">
        <path d="M 1 1 L 6 3.5 L 1 6" fill="none" stroke="var(--purple)" />
      </marker></defs>
      {layout.edges.map((edge, index) => {
        const source = nodes.get(edge.sourceTopicId)!
        const target = nodes.get(edge.targetTopicId)!
        const left = target.x < source.x
        const sameColumn = source.x === target.x
        const from = source.x + (left ? 0 : nodeWidth)
        const to = target.x + (left || sameColumn ? nodeWidth : 0)
        const startY = source.y + source.height / 2
        const endY = target.y + target.height / 2
        const bend = sameColumn ? from + 20 : (from + to) / 2
        const towardTarget = left ? -1 : 1
        const lane = 8 + index % 4 * 3
        const path = Math.abs(target.x - source.x) > nodeWidth * 2
          ? `M ${from} ${startY} H ${from + towardTarget * 24} V ${lane} H ${to - towardTarget * 24} V ${endY} H ${to}`
          : `M ${from} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${to} ${endY}`
        const related = edge.type === 'related'
        return <path key={edge.id} className={related ? 'graph-related-line' : undefined}
          d={path}
          markerEnd={related ? undefined : `url(#${arrow})`} />
      })}
    </svg>
    {groupDetails.map(({ key, label }) => {
      const direct = groups[key].flatMap(({ topic }) => {
        if (groupedIds.has(topic.id)) return []
        groupedIds.add(topic.id)
        return [renderNode(nodes.get(topic.id)!)]
      })
      return direct.length ? <div key={key} role="group" aria-label={label}>{direct}</div> : null
    })}
    {layout.nodes.filter(node => !groupedIds.has(node.topic.id)).map(renderNode)}
  </>
})

export function DependencyGraph({ topic, topics, relationships }: { topic: Topic; topics: readonly Topic[]; relationships: readonly TopicRelationship[] }) {
  const layout = useMemo(() => layoutDependencyGraph(topic.id, topics, relationships), [topic.id, topics, relationships])
  const [expanded, setExpanded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const viewport = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const pending = useRef<{ x: number; y: number } | undefined>(undefined)
  const positionedRoot = useRef(false)
  const pan = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | undefined>(undefined)

  function centerAt(point: { x: number; y: number }, scale: number) {
    const view = viewport.current
    const surface = canvas.current
    if (!view || !surface) return
    view.scrollTo(surface.offsetLeft + point.x * scale - view.clientWidth / 2,
      surface.offsetTop + point.y * scale - view.clientHeight / 2)
  }

  useLayoutEffect(() => {
    if (!canvas.current) return
    if (pending.current) {
      centerAt(pending.current, zoom)
      pending.current = undefined
    } else if (!positionedRoot.current) {
      const root = layout.nodes.find(node => node.topic.id === topic.id)
      if (root) centerAt({ x: root.x + nodeWidth / 2, y: root.y + root.height / 2 }, zoom)
      positionedRoot.current = true
    }
  }, [layout, topic.id, zoom])

  function changeZoom(value: number, fit = false) {
    const view = viewport.current
    const surface = canvas.current
    if (!view || !surface) return
    const next = Math.min(2, fit ? value : Math.max(Math.min(0.15, zoom), value))
    const point = fit ? { x: layout.width / 2, y: layout.height / 2 } : {
      x: (view.scrollLeft + view.clientWidth / 2 - surface.offsetLeft) / zoom,
      y: (view.scrollTop + view.clientHeight / 2 - surface.offsetTop) / zoom,
    }
    if (next === zoom) centerAt(point, zoom)
    else {
      pending.current = point
      setZoom(next)
    }
  }

  function fit() {
    const view = viewport.current
    if (view) changeZoom(Math.min(view.clientWidth / layout.width, view.clientHeight / layout.height, 1), true)
  }

  function stopPan() {
    pan.current = undefined
    viewport.current?.removeAttribute('data-panning')
  }

  const empty = !layout.edges.length
  return <section className={'panel dependency-graph' + (expanded && !empty ? ' graph-expanded' : '')}>
    <div className="dependency-heading">
      <h2>Dependency graph</h2>
      {!empty && <div className="graph-controls">
        <button className="button icon-button" type="button" aria-label="Zoom out" title="Zoom out" onClick={() => changeZoom(zoom / 1.25)}><Minus size={16} /></button>
        <button className="button icon-button" type="button" aria-label="Zoom in" title="Zoom in" onClick={() => changeZoom(zoom * 1.25)}><Plus size={16} /></button>
        <output className="muted" aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
        <button className="button icon-button" type="button" aria-label="Fit to view" title="Fit to view" onClick={fit}><Focus size={16} /></button>
        <button className="button icon-button" type="button" aria-label="Reset zoom" title="Reset zoom (100%)" onClick={() => changeZoom(1)}><RotateCcw size={16} /></button>
        <button className="button icon-button graph-expand" type="button" aria-label={expanded ? 'Restore graph size' : 'Expand graph'}
          aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
      </div>}
    </div>
    {empty ? <div className="graph-empty"><GitFork className="purple" size={28} /><p className="muted">No relationships to visualize.</p></div>
      : <div className="graph-viewport" ref={viewport} role="region" aria-label="Dependency graph viewport" tabIndex={0}
        onPointerDown={event => {
          if (event.button !== 0 || event.pointerType === 'touch' || !(event.target instanceof Element) ||
              event.target.closest('.graph-node, .graph-lines path')) return
          const view = event.currentTarget
          pan.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: view.scrollLeft, top: view.scrollTop }
          view.setPointerCapture(event.pointerId)
          view.setAttribute('data-panning', '')
          event.preventDefault()
        }}
        onPointerMove={event => {
          const drag = pan.current
          if (drag?.pointer !== event.pointerId) return
          event.currentTarget.scrollTo(drag.left + drag.x - event.clientX, drag.top + drag.y - event.clientY)
        }}
        onLostPointerCapture={stopPan}>
        <div className="graph-stage" style={{ minWidth: layout.width * zoom, minHeight: layout.height * zoom }}>
          <div ref={canvas} className="graph-surface" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
            <div className="graph-canvas" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
              <GraphContent layout={layout} rootId={topic.id} />
            </div>
          </div>
        </div>
      </div>}
  </section>
}
