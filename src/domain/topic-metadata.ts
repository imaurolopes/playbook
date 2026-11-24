export const lifecycleStatuses = ['Draft', 'In Review', 'Published', 'Deprecated'] as const
export const visibilities = ['Private', 'Organization', 'Public'] as const
export const classificationLists = {
  tags: 'Tags', technologies: 'Technologies', platforms: 'Platforms', languages: 'Programming languages',
} as const
export type ClassificationList = keyof typeof classificationLists

interface PropertyIdentity {
  readonly id: string
  readonly key: string
}

export const propertyTypes = ['Text', 'Number', 'Boolean', 'Date', 'URL'] as const
export type PropertyType = typeof propertyTypes[number]
type PropertyValues = { Text: string; Number: number; Boolean: boolean; Date: string; URL: string }
export type TypedCustomProperty = {
  [Type in PropertyType]: PropertyIdentity & { readonly type: Type; readonly value: PropertyValues[Type] }
}[PropertyType]
export type CustomProperty = TypedCustomProperty | (PropertyIdentity & { readonly type?: undefined; readonly value: string })

export function typedCustomProperty(property: CustomProperty): TypedCustomProperty {
  return property.type === undefined ? { ...property, type: 'Text' } : property
}

function validNumber(value: number) {
  return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validUrl(value: string) {
  try {
    return /^https?:\/\/[^\s]+$/i.test(value) && Boolean(new URL(value).hostname)
  } catch {
    return false
  }
}

export function parseCustomProperty(identity: PropertyIdentity, type: PropertyType, raw: string): TypedCustomProperty | undefined {
  const value = raw.trim()
  switch (type) {
    case 'Text': return { ...identity, type, value: raw }
    case 'Number': {
      const parsed = Number(value)
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) && validNumber(parsed)) return { ...identity, type, value: parsed }
      return undefined
    }
    case 'Boolean':
      if (/^(true|false)$/i.test(value)) return { ...identity, type, value: value.toLowerCase() === 'true' }
      return undefined
    case 'Date': return validDate(value) ? { ...identity, type, value } : undefined
    case 'URL': return validUrl(value) ? { ...identity, type, value } : undefined
  }
}

export interface TopicMetadata {
  readonly category: string
  readonly technicalDomain?: string
  readonly technicalDomains?: readonly string[]
  readonly tags: readonly string[]
  readonly technologies: readonly string[]
  readonly platforms: readonly string[]
  readonly languages: readonly string[]
  readonly owner: string
  readonly lifecycleStatus: (typeof lifecycleStatuses)[number]
  readonly visibility: (typeof visibilities)[number]
  readonly customProperties: readonly CustomProperty[]
}

export type KnowledgeMetadata = Pick<TopicMetadata, 'technicalDomain' | 'technicalDomains' | 'tags' | 'customProperties'>

export function mergeTechnicalDomains(values: readonly string[]) {
  const domains = new Map<string, string>()
  for (const raw of values) {
    const domain = raw.trim()
    if (domain && !domains.has(domain.toLowerCase())) domains.set(domain.toLowerCase(), domain)
  }
  return [...domains.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export function technicalDomainsFor(metadata?: KnowledgeMetadata) {
  return mergeTechnicalDomains(metadata?.technicalDomains ?? (metadata?.technicalDomain ? [metadata.technicalDomain] : []))
}

export function knowledgeMetadata(metadata: KnowledgeMetadata) {
  return { technicalDomains: technicalDomainsFor(metadata), tags: metadata.tags, customProperties: metadata.customProperties.map(typedCustomProperty) }
}

export const defaultTopicMetadata: TopicMetadata = {
  category: '', technicalDomain: '', tags: [], technologies: [], platforms: [], languages: [], owner: '',
  lifecycleStatus: 'Draft', visibility: 'Private', customProperties: [],
}

function validProperty(value: unknown): value is CustomProperty {
  if (value === null || typeof value !== 'object') return false
  const property = value as Record<string, unknown>
  if (typeof property.id !== 'string' || !property.id || typeof property.key !== 'string' || !property.key.trim()) return false
  switch (property.type) {
    case undefined:
    case 'Text': return typeof property.value === 'string'
    case 'Number': return typeof property.value === 'number' && validNumber(property.value)
    case 'Boolean': return typeof property.value === 'boolean'
    case 'Date': return typeof property.value === 'string' && validDate(property.value)
    case 'URL': return typeof property.value === 'string' && validUrl(property.value)
    default: return false
  }
}

export function isTopicMetadata(value: unknown): value is TopicMetadata {
  if (!value || typeof value !== 'object') return false
  const metadata = value as Record<string, unknown>
  return isKnowledgeMetadata(value) && [metadata.category, metadata.owner].every(item => typeof item === 'string') &&
    lifecycleStatuses.some(status => status === metadata.lifecycleStatus) && visibilities.some(visibility => visibility === metadata.visibility) &&
    Object.keys(classificationLists).every(key => {
      const values = metadata[key]
      return Array.isArray(values) && values.every(item => typeof item === 'string' && Boolean(item.trim()))
    })
}

export function isKnowledgeMetadata(value: unknown): value is KnowledgeMetadata {
  if (!value || typeof value !== 'object') return false
  const metadata = value as Record<string, unknown>
  return (metadata.technicalDomain === undefined || typeof metadata.technicalDomain === 'string') &&
    (metadata.technicalDomains === undefined || (Array.isArray(metadata.technicalDomains) &&
      metadata.technicalDomains.every(domain => typeof domain === 'string' && Boolean(domain.trim())))) &&
    Array.isArray(metadata.tags) &&
    metadata.tags.every(item => typeof item === 'string' && Boolean(item.trim())) &&
    Array.isArray(metadata.customProperties) && metadata.customProperties.every(validProperty) &&
    new Set(metadata.customProperties.map(item => item.id)).size === metadata.customProperties.length &&
    new Set(metadata.customProperties.map(item => item.key.trim().toLowerCase())).size === metadata.customProperties.length
}

export function cleanTopicMetadata(input: TopicMetadata): TopicMetadata {
  const unique = (values: readonly string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))]
  const customProperties = input.customProperties.map(property => typedCustomProperty({ ...property, key: property.key.trim() }))
  if (customProperties.some(item => !item.key)) throw new Error('Enter a key for every custom property.')
  if (new Set(customProperties.map(item => item.key.toLowerCase())).size !== customProperties.length) {
    throw new Error('Custom property keys must be unique.')
  }
  const result = {
    category: input.category.trim(), owner: input.owner.trim(),
    ...(input.technicalDomains === undefined
      ? { technicalDomain: input.technicalDomain?.trim() ?? '' }
      : { technicalDomains: technicalDomainsFor(input) }),
    tags: unique(input.tags), technologies: unique(input.technologies), platforms: unique(input.platforms), languages: unique(input.languages),
    lifecycleStatus: input.lifecycleStatus, visibility: input.visibility, customProperties,
  }
  if (!isTopicMetadata(result)) throw new Error('Enter valid topic metadata.')
  return result
}

export function metadataChanges(before?: KnowledgeMetadata, after?: KnowledgeMetadata) {
  const old = before ?? defaultTopicMetadata
  const next = after ?? defaultTopicMetadata
  const fields = [
    { label: 'Technical domains', before: technicalDomainsFor(old).join('\n'), after: technicalDomainsFor(next).join('\n') },
  ].filter(field => field.before !== field.after)
  if (old.tags.length !== next.tags.length || old.tags.some((item, index) => item !== next.tags[index])) {
    fields.push({ label: 'Tags', before: old.tags.join('\n'), after: next.tags.join('\n') })
  }
  const oldProperties = new Map(old.customProperties.map(property => [property.key, typedCustomProperty(property)]))
  const newProperties = new Map(next.customProperties.map(property => [property.key, typedCustomProperty(property)]))
  for (const key of new Set([...oldProperties.keys(), ...newProperties.keys()])) {
    const before = oldProperties.get(key)
    const after = newProperties.get(key)
    if (before?.type !== after?.type || before?.value !== after?.value) {
      const withType = before && after && before.type !== after.type
      const describe = (property?: TypedCustomProperty) => property
        ? String(property.value) + (withType ? ` (${property.type})` : '') : 'Not set'
      fields.push({ label: `Custom property: ${key}`, before: describe(before), after: describe(after) })
    }
  }
  return fields
}
