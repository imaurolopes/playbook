import { diffLines } from 'diff'
import { metadataChanges } from '../domain/topic-metadata'
import { sameVersionRelationship, type TopicSnapshot, type VersionRelationship } from '../domain/topic-version'

export type ChangeKind = 'added' | 'removed' | 'modified'

export interface ContentChange {
  kind: ChangeKind
  before?: string
  after?: string
}

function compareContent(before: string, after: string): ContentChange[] {
  if (before === after) return []
  const diff = diffLines(before, after, { timeout: 100, maxEditLength: 4000 })
  if (!diff) return [{ kind: 'modified', before, after }]

  const changes: ContentChange[] = []
  let removed = ''
  let added = ''
  function flush() {
    if (!removed && !added) return
    changes.push({ kind: removed && added ? 'modified' : added ? 'added' : 'removed', before: removed || undefined, after: added || undefined })
    removed = ''
    added = ''
  }
  for (const part of diff) {
    if (part.added) added += part.value
    else if (part.removed) removed += part.value
    else flush()
  }
  flush()
  return changes
}

function compareLinks(before: readonly VersionRelationship[], after: readonly VersionRelationship[]) {
  const previous = new Map(before.map(link => [link.id, link]))
  const next = new Map(after.map(link => [link.id, link]))
  const changes: { kind: ChangeKind; before?: VersionRelationship; after?: VersionRelationship }[] = []
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const oldLink = previous.get(id)
    const newLink = next.get(id)
    if (!sameVersionRelationship(oldLink, newLink)) {
      changes.push({ kind: !oldLink ? 'added' : !newLink ? 'removed' : 'modified', before: oldLink, after: newLink })
    }
  }
  return changes
}

export function compareTopicVersions(before: TopicSnapshot, after: TopicSnapshot) {
  const fields = [
    { label: 'Title', before: before.title, after: after.title },
    { label: 'Description', before: before.description, after: after.description },
  ].filter(field => field.before !== field.after)
  const metadata = [
    { label: 'Scope', before: before.metadata.scope, after: after.metadata.scope },
    ...(before.metadata.parent?.id !== after.metadata.parent?.id ? [
      { label: 'Parent topic', before: before.metadata.parent?.title, after: after.metadata.parent?.title },
    ] : []),
    ...(before.metadata.source?.id !== after.metadata.source?.id ? [
      { label: 'Source topic', before: before.metadata.source?.title, after: after.metadata.source?.title },
    ] : []),
    ...metadataChanges(before.metadata.details, after.metadata.details),
  ].filter(field => field.label !== 'Scope' || field.before !== field.after)
  return {
    fields, metadata, content: compareContent(before.content, after.content),
    dependencies: compareLinks(before.dependencies, after.dependencies),
    related: compareLinks(before.related, after.related),
  }
}

export type TopicVersionComparison = ReturnType<typeof compareTopicVersions>
