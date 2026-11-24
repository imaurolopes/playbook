import type { Topic } from '../domain/topic'
import type { TopicRelationship } from '../domain/topic-relationship'

const padding = 24
export const nodeWidth = 228
const columnStep = 306
const rowGap = 18

export function layoutDependencyGraph(rootId: string, topics: readonly Topic[], relationships: readonly TopicRelationship[]) {
  const byId = new Map(topics.map(topic => [topic.id, topic]))
  const adjacent = new Map<string, TopicRelationship[]>()
  for (const edge of relationships) {
    if (!byId.has(edge.sourceTopicId) || !byId.has(edge.targetTopicId)) continue
    for (const id of [edge.sourceTopicId, edge.targetTopicId]) {
      const edges = adjacent.get(id) ?? []
      edges.push(edge)
      adjacent.set(id, edges)
    }
  }

  const ranks = new Map([[rootId, 0]])
  const queue = [rootId]
  const edges = new Map<string, TopicRelationship>()
  for (const id of queue) {
    for (const edge of adjacent.get(id) ?? []) {
      edges.set(edge.id, edge)
      const outgoing = edge.sourceTopicId === id
      const other = outgoing ? edge.targetTopicId : edge.sourceTopicId
      if (ranks.has(other)) continue
      ranks.set(other, ranks.get(id)! + (edge.type === 'related' || !outgoing ? 1 : -1))
      queue.push(other)
    }
  }

  // Lay prerequisites to the left, including when branches converge at different depths.
  const incoming = new Map(queue.map(id => [id, 0]))
  for (const edge of edges.values()) {
    if (edge.type === 'dependency') incoming.set(edge.targetTopicId, incoming.get(edge.targetTopicId)! + 1)
  }
  const ordered = queue.filter(id => incoming.get(id) === 0)
  for (const id of ordered) {
    for (const edge of adjacent.get(id) ?? []) {
      if (edge.type !== 'dependency' || edge.sourceTopicId !== id) continue
      const target = edge.targetTopicId
      ranks.set(target, Math.min(ranks.get(target)!, ranks.get(id)! - 1))
      const remaining = incoming.get(target)! - 1
      incoming.set(target, remaining)
      if (!remaining) ordered.push(target)
    }
  }

  const columns = new Map<number, { topic: Topic; height: number }[]>()
  for (const id of queue) {
    const topic = byId.get(id)
    if (!topic) continue
    const rank = ranks.get(id)!
    const column = columns.get(rank) ?? []
    const lines = topic.title.split(/\r?\n/).reduce((count, line) => count + Math.max(1, Math.ceil(Array.from(line).length / 15)), 0)
    column.push({ topic, height: Math.max(52, lines * 20 + 18) })
    columns.set(rank, column)
  }
  const columnRanks = [...columns.keys()].sort((a, b) => a - b)
  const heightOf = (column: { height: number }[]) => column.reduce((sum, node) => sum + node.height + rowGap, -rowGap)
  const height = Math.max(0, ...[...columns.values()].map(heightOf)) + 2 * padding
  const width = (columnRanks.length - 1) * columnStep + nodeWidth + 2 * padding
  const nodes = columnRanks.flatMap((rank, index) => {
    const column = columns.get(rank)!
    let y = (height - heightOf(column)) / 2
    return column.map(node => {
      const positioned = { ...node, x: padding + index * columnStep, y }
      y += node.height + rowGap
      return positioned
    })
  })
  return { nodes, edges: [...edges.values()], width, height }
}
