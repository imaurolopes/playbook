import { expect, it } from 'vitest'
import type { Topic } from '../domain/topic'
import type { TopicRelationship } from '../domain/topic-relationship'
import { layoutDependencyGraph, nodeWidth } from './dependency-graph-layout'

const date = '2026-11-24T12:00:00.000Z'
const topic = (id: string): Topic => ({ id, title: id, type: 'General', description: '', content: '', createdAt: date, updatedAt: date })
const link = (sourceTopicId: string, targetTopicId: string, type: TopicRelationship['type'] = 'dependency'): TopicRelationship => ({
  id: sourceTopicId + ':' + targetTopicId, sourceTopicId, targetTopicId, type, createdAt: date, updatedAt: date,
})

it('sizes and orders a branching network around its selected topic', () => {
  const topics = ['root', 'upstream', 'downstream', 'shared', 'isolated', ...Array.from({ length: 80 }, (_, index) => 'branch-' + index)].map(topic)
  const edges = [link('root', 'upstream'), link('upstream', 'shared'), link('downstream', 'root'),
    ...topics.slice(5).map(({ id }) => link(id, 'root')), link('branch-0', 'shared', 'related')]
  const graph = layoutDependencyGraph('root', topics, edges)
  const nodes = new Map(graph.nodes.map(node => [node.topic.id, node]))
  expect(nodes.has('isolated')).toBe(false)
  expect(graph.edges).toHaveLength(edges.length)
  for (const edge of graph.edges.filter(edge => edge.type === 'dependency')) {
    expect(nodes.get(edge.sourceTopicId)!.x).toBeGreaterThan(nodes.get(edge.targetTopicId)!.x + nodeWidth)
  }
  for (const node of graph.nodes) {
    expect(node.x).toBeGreaterThan(0)
    expect(node.y).toBeGreaterThan(0)
    expect(node.x + nodeWidth).toBeLessThan(graph.width)
    expect(node.y + node.height).toBeLessThan(graph.height)
  }
  for (const x of new Set(graph.nodes.map(node => node.x))) {
    const column = graph.nodes.filter(node => node.x === x)
    column.slice(1).forEach((node, index) => expect(node.y).toBeGreaterThan(column[index]!.y + column[index]!.height))
  }
  const smaller = layoutDependencyGraph('root', topics, edges.slice(0, 1))
  expect(smaller.width).toBeLessThan(graph.width)
  expect(smaller.height).toBeLessThan(graph.height)
})
