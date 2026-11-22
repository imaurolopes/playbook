import type { Topic } from '../domain/topic'

export const TOPIC_ORGANIZATION_BACKUP_PREFIX = 'playbook.topic-organization.backup.'

type LegacyTopic = Topic & { folderId?: unknown; order?: unknown; parentId?: unknown; scope?: unknown }
type BackupStorage = Pick<Storage, 'getItem' | 'setItem'>

export function backUpTopicOrganization(storage: BackupStorage, raw: string): string {
  for (let index = 1; ; index++) {
    const key = TOPIC_ORGANIZATION_BACKUP_PREFIX + index
    const existing = storage.getItem(key)
    if (existing === raw) return key
    if (existing === null) {
      storage.setItem(key, raw)
      return key
    }
  }
}

export function flattenTopics(topics: LegacyTopic[]): Topic[] {
  return topics.map(topic => {
    const flat = { ...topic }
    delete flat.folderId
    delete flat.order
    delete flat.parentId
    delete flat.scope
    return flat
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasBrokenHierarchy(links: ReadonlyMap<string, unknown>): boolean {
  for (const id of links.keys()) {
    const visited = new Set([id])
    let next = links.get(id)
    while (next !== undefined) {
      if (typeof next !== 'string' || !links.has(next) || visited.has(next)) return true
      visited.add(next)
      next = links.get(next)
    }
  }
  return false
}

export function organizationIssues(topics: LegacyTopic[], storedFolders: unknown, expectsFolders: boolean): string[] {
  const issues: string[] = []
  const folders = Array.isArray(storedFolders) ? storedFolders.filter(isRecord) : []
  const validFolders = folders.filter(folder =>
    typeof folder.id === 'string' && Boolean(folder.id) && typeof folder.name === 'string' && Boolean(folder.name.trim()))
  const folderLinks = new Map(validFolders.map(folder => [folder.id as string, folder.parentFolderId]))
  if ((expectsFolders || storedFolders !== undefined) && (!Array.isArray(storedFolders) ||
    storedFolders.length !== validFolders.length || folderLinks.size !== validFolders.length)) {
    issues.push('missing, malformed, or duplicate folder records')
  }
  if (hasBrokenHierarchy(folderLinks) || hasBrokenHierarchy(new Map(topics.map(topic => [topic.id, topic.parentId]))) ||
    topics.some(topic => topic.folderId !== undefined && (typeof topic.folderId !== 'string' || !folderLinks.has(topic.folderId)))) {
    issues.push('missing or cyclic organization links')
  }
  const positions = new Set<string>()
  for (const [parent, order] of [
    ...folders.map(folder => [folder.parentFolderId, folder.order]),
    ...topics.map(topic => [topic.folderId, topic.order]),
  ]) {
    if (!expectsFolders && order === undefined) continue
    const position = JSON.stringify([parent, order])
    if (typeof order !== 'number' || !Number.isSafeInteger(order) || order < 0 || positions.has(position)) {
      issues.push('invalid or conflicting sibling order')
      break
    }
    positions.add(position)
  }
  return issues
}
