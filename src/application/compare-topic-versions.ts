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
    { label: 'Topic type', before: before.type ?? 'General', after: after.type ?? 'General' },
    { label: 'Summary', before: before.description, after: after.description },
  ].filter(field => field.before !== field.after)
  const metadata = [
    ...(before.metadata.source?.id !== after.metadata.source?.id ? [
      { label: 'Source topic', before: before.metadata.source?.title, after: after.metadata.source?.title },
    ] : []),
    ...metadataChanges(before.metadata.details, after.metadata.details),
  ]
  const definitions = (snapshot: TopicSnapshot) => new Map(snapshot.taskDefinitions?.map((task, position) => {
    const ordering = String(position + 1)
    const orderedCriteria = [...task.criteria].sort((a, b) => a.order - b.order)
    const criteria = orderedCriteria.map(criterion => `• ${criterion.description}`).join('\n')
    const dependencies = task.dependencyIds.map(id => `Depends on ${snapshot.taskDefinitions?.find(item => item.id === id)?.title ?? id}`).join('\n')
    const references = task.references.map(reference => reference.kind === 'topic'
      ? `Topic reference: ${reference.topicId}` : `Reference: ${reference.title} ${reference.url ?? ''}`.trim()).join('\n')
    return [task.id, { label: task.title, value: [
      `${position + 1}. ${task.title}`, task.description,
      criteria, dependencies, references,
    ].filter(Boolean).join('\n'), parts: {
      Title: task.title, 'Task instructions': task.description, 'Task ordering': ordering,
      'Task dependencies': JSON.stringify(task.dependencyIds),
      'Acceptance criteria': JSON.stringify(orderedCriteria.map(({ id, description }) => [id, description])),
      References: JSON.stringify(task.references.map(reference => reference.kind === 'topic'
        ? [reference.id, reference.kind, reference.topicId] : [reference.id, reference.kind, reference.title, reference.url])),
    } }] as const
  }))
  const sections = (snapshot: TopicSnapshot) => new Map(snapshot.knowledgeSections?.map((section, position) => [
    section.id, { label: section.title, value: `${position + 1}. ${section.title}\n\n${section.content}` },
  ]))
  return {
    fields, metadata, content: compareContent(before.content, after.content),
    implementation: compareRecords(definitions(before), definitions(after)),
    standards: compareRecords(sections(before), sections(after)),
    dependencies: compareLinks(before.dependencies, after.dependencies),
    dependents: compareLinks(before.dependents ?? [], after.dependents ?? []),
    related: compareLinks(before.related, after.related),
  }
}

type ComparedRecord = { label: string; value: string; parts?: Record<string, string> }

function compareRecords(before: ReadonlyMap<string, ComparedRecord>, after: ReadonlyMap<string, ComparedRecord>) {
  return [...new Set([...before.keys(), ...after.keys()])].flatMap(id => {
    const old = before.get(id)
    const next = after.get(id)
    const details = old?.parts && next?.parts ? Object.keys(next.parts).filter(label => old.parts?.[label] !== next.parts?.[label]) : []
    return old?.value === next?.value && !details.length ? [] : [{ id, label: (next ?? old)!.label, before: old?.value, after: next?.value, details }]
  })
}

export type TopicVersionComparison = ReturnType<typeof compareTopicVersions>

export function hasTopicVersionChanges(changes: TopicVersionComparison) {
  return Object.values(changes).some(items => items.length > 0)
}
