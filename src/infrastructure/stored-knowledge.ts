import type { KnowledgeSection } from '../domain/knowledge'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
}

function isSection(value: unknown): value is KnowledgeSection {
  return record(value) && nonempty(value.id) && nonempty(value.topicId) && nonempty(value.key) &&
    value.key !== 'legacy-content' && value.id !== `legacy:${value.topicId}` &&
    nonempty(value.title) && typeof value.content === 'string' &&
    typeof value.order === 'number' && Number.isSafeInteger(value.order) && value.order >= 0
}

function uniqueSections(sections: KnowledgeSection[]): KnowledgeSection[] {
  const idCounts = new Map<string, number>()
  const keyCounts = new Map<string, number>()
  for (const { topicId, id, key } of sections) {
    const topicIdAndId = JSON.stringify([topicId, id])
    const topicIdAndKey = JSON.stringify([topicId, key])
    idCounts.set(topicIdAndId, (idCounts.get(topicIdAndId) ?? 0) + 1)
    keyCounts.set(topicIdAndKey, (keyCounts.get(topicIdAndKey) ?? 0) + 1)
  }
  return sections.filter(({ topicId, id, key }) =>
    idCounts.get(JSON.stringify([topicId, id])) === 1 && keyCounts.get(JSON.stringify([topicId, key])) === 1)
}

export function readKnowledgeSections(value: unknown, topicIds: ReadonlySet<string>): KnowledgeSection[] {
  if (!Array.isArray(value) || !value.every(isSection) ||
    value.some(section => !topicIds.has(section.topicId)) || uniqueSections(value).length !== value.length) {
    throw new Error('Invalid knowledge sections.')
  }
  return value
}

export function migrateLegacyKnowledge(value: unknown, topicIds: ReadonlySet<string>) {
  const sections = record(value) && Array.isArray(value.sections) ? value.sections : []
  const knowledgeSections = uniqueSections(sections.filter(isSection).filter(section => topicIds.has(section.topicId)))
  if (value === undefined) return { knowledgeSections }
  const fullyMigrated = record(value) && Array.isArray(value.sections) && knowledgeSections.length === sections.length &&
    Array.isArray(value.scopes) && value.scopes.length === 0 &&
    Array.isArray(value.overlays) && value.overlays.length === 0 &&
    Object.keys(value).length === 3
  // Keep the source payload with the workspace so the next write persists both atomically.
  return { knowledgeSections, legacyKnowledgeData: fullyMigrated ? undefined : value }
}

export function legacyKnowledgeNotice(value: unknown): string | undefined {
  if (value === undefined) return
  const scopes = record(value) && Array.isArray(value.scopes) ? value.scopes.length : 0
  const overlays = record(value) && Array.isArray(value.overlays) ? value.overlays.length : 0
  const counts = scopes || overlays ? ` (scope records: ${scopes}, customization records: ${overlays})` : ''
  return `Some legacy knowledge data could not be merged safely${counts}. The original data is retained in browser storage.`
}
