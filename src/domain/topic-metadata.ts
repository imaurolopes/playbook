export const lifecycleStatuses = ['Draft', 'In Review', 'Published', 'Deprecated'] as const
export const visibilities = ['Private', 'Organization', 'Public'] as const
export const classificationLists = {
  tags: 'Tags', technologies: 'Technologies', platforms: 'Platforms', languages: 'Programming languages',
} as const
export type ClassificationList = keyof typeof classificationLists

export interface CustomProperty {
  readonly id: string
  readonly key: string
  readonly value: string
}

export interface TopicMetadata {
  readonly category: string
  readonly technicalDomain: string
  readonly tags: readonly string[]
  readonly technologies: readonly string[]
  readonly platforms: readonly string[]
  readonly languages: readonly string[]
  readonly owner: string
  readonly lifecycleStatus: (typeof lifecycleStatuses)[number]
  readonly visibility: (typeof visibilities)[number]
  readonly customProperties: readonly CustomProperty[]
}

export const defaultTopicMetadata: TopicMetadata = {
  category: '', technicalDomain: '', tags: [], technologies: [], platforms: [], languages: [], owner: '',
  lifecycleStatus: 'Draft', visibility: 'Private', customProperties: [],
}

function validProperty(value: unknown): value is CustomProperty {
  return value !== null && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && Boolean(value.id) &&
    'key' in value && typeof value.key === 'string' && Boolean(value.key.trim()) && 'value' in value && typeof value.value === 'string'
}

export function isTopicMetadata(value: unknown): value is TopicMetadata {
  if (!value || typeof value !== 'object') return false
  const metadata = value as Record<string, unknown>
  return [metadata.category, metadata.technicalDomain, metadata.owner].every(item => typeof item === 'string') &&
    lifecycleStatuses.some(status => status === metadata.lifecycleStatus) && visibilities.some(visibility => visibility === metadata.visibility) &&
    Object.keys(classificationLists).every(key => {
      const values = metadata[key]
      return Array.isArray(values) && values.every(item => typeof item === 'string' && Boolean(item.trim()))
    }) &&
    Array.isArray(metadata.customProperties) && metadata.customProperties.every(validProperty) &&
    new Set(metadata.customProperties.map(item => item.id)).size === metadata.customProperties.length &&
    new Set(metadata.customProperties.map(item => item.key.trim().toLowerCase())).size === metadata.customProperties.length
}

export function cleanTopicMetadata(input: TopicMetadata): TopicMetadata {
  const unique = (values: readonly string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))]
  const customProperties = input.customProperties.map(({ id, key, value }) => ({ id, key: key.trim(), value }))
  if (customProperties.some(item => !item.key)) throw new Error('Enter a key for every custom property.')
  if (new Set(customProperties.map(item => item.key.toLowerCase())).size !== customProperties.length) {
    throw new Error('Custom property keys must be unique.')
  }
  const result = {
    category: input.category.trim(), technicalDomain: input.technicalDomain.trim(), owner: input.owner.trim(),
    tags: unique(input.tags), technologies: unique(input.technologies), platforms: unique(input.platforms), languages: unique(input.languages),
    lifecycleStatus: input.lifecycleStatus, visibility: input.visibility, customProperties,
  }
  if (!isTopicMetadata(result)) throw new Error('Enter valid topic metadata.')
  return result
}

export function metadataChanges(before?: TopicMetadata, after?: TopicMetadata) {
  const old = before ?? defaultTopicMetadata
  const next = after ?? defaultTopicMetadata
  const fields = [
    { label: 'Category', before: old.category, after: next.category },
    { label: 'Technical domain', before: old.technicalDomain, after: next.technicalDomain },
    { label: 'Owner', before: old.owner, after: next.owner },
    { label: 'Lifecycle status', before: old.lifecycleStatus, after: next.lifecycleStatus },
    { label: 'Visibility', before: old.visibility, after: next.visibility },
  ].filter(field => field.before !== field.after)
  for (const key of Object.keys(classificationLists) as ClassificationList[]) {
    if (old[key].length !== next[key].length || old[key].some((item, index) => item !== next[key][index])) {
      fields.push({ label: classificationLists[key], before: old[key].join('\n'), after: next[key].join('\n') })
    }
  }
  const oldProperties = new Map(old.customProperties.map(property => [property.key, property.value]))
  const newProperties = new Map(next.customProperties.map(property => [property.key, property.value]))
  for (const key of new Set([...oldProperties.keys(), ...newProperties.keys()])) {
    const before = oldProperties.get(key)
    const after = newProperties.get(key)
    if (before !== after) fields.push({ label: `Custom property: ${key}`, before: before ?? 'Not set', after: after ?? 'Not set' })
  }
  return fields
}
