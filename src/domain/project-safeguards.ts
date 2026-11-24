export const safeguardGroups = [
  { title: 'Execution controls', policies: [
    ['destructiveApproval', 'Require approval for destructive operations'],
    ['pullRequests', 'Require pull requests for code changes'],
    ['checkpoints', 'Create checkpoints before major changes'],
    ['rollback', 'Require rollback instructions'],
  ] },
  { title: 'Environment safety', policies: [
    ['protectProduction', 'Prevent direct changes in production'],
    ['separateEnvironments', 'Use separate development, test, and production environments'],
    ['deploymentApproval', 'Require production deployment approval'],
  ] },
  { title: 'Traceability', policies: [
    ['traceChanges', 'Keep changes traceable through commits, pull requests, or work items'],
    ['linkArtifacts', 'Link artifacts to implementation tasks'],
    ['executionLogs', 'Record execution logs for automated agents'],
  ] },
] as const

export type ProjectSafeguards = Partial<Record<(typeof safeguardGroups)[number]['policies'][number][0], boolean>>

export function isProjectSafeguards(value: unknown): value is ProjectSafeguards {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([key, enabled]) => typeof enabled === 'boolean' &&
      safeguardGroups.some(group => group.policies.some(([policy]) => policy === key))))
}

export type SafeguardCategory = (typeof safeguardGroups)[number]['title']

export interface CustomSafeguard {
  id: string
  name: string
  description?: string
  category: SafeguardCategory
  enabled: boolean
}

export function customSafeguardNameKey(name: string) {
  return name.trim().toLowerCase()
}

export function isCustomSafeguardList(value: unknown): value is CustomSafeguard[] {
  if (!Array.isArray(value) || !value.every((item: unknown): item is CustomSafeguard => {
    if (!item || typeof item !== 'object') return false
    const { id, name, description, category, enabled } = item as Record<string, unknown>
    return typeof id === 'string' && Boolean(id.trim()) &&
      typeof name === 'string' && Boolean(customSafeguardNameKey(name)) &&
      (description === undefined || typeof description === 'string') &&
      safeguardGroups.some(group => group.title === category) && typeof enabled === 'boolean'
  })) return false
  return new Set(value.map(item => item.id)).size === value.length &&
    new Set(value.map(item => customSafeguardNameKey(item.name))).size === value.length
}

export const safeguardSeverities = ['Low', 'Medium', 'High', 'Critical'] as const
export const safeguardModes = ['Advisory', 'Require approval', 'Block'] as const

export interface SafeguardInput {
  name: string
  context: string
  category: SafeguardCategory
  severity: (typeof safeguardSeverities)[number]
  enforcement: (typeof safeguardModes)[number]
  enabled: boolean
}

export interface SafeguardPolicy extends SafeguardInput {
  id: string
  createdAt: string
  updatedAt: string
}

export function validateSafeguard(input: SafeguardInput, policies: readonly SafeguardPolicy[], id?: string) {
  const name = customSafeguardNameKey(input.name)
  if (!name) throw new Error('Enter a safeguard name.')
  if (policies.some(policy => policy.id !== id && customSafeguardNameKey(policy.name) === name)) {
    throw new Error('A safeguard with this name already exists in this project.')
  }
  if (!safeguardGroups.some(group => group.title === input.category) ||
    !safeguardSeverities.includes(input.severity) || !safeguardModes.includes(input.enforcement) ||
    typeof input.context !== 'string' || typeof input.enabled !== 'boolean') throw new Error('Invalid safeguard settings.')
}

export function isSafeguardPolicyList(value: unknown): value is SafeguardPolicy[] {
  if (!Array.isArray(value) || !value.every((item: unknown): item is SafeguardPolicy => {
    if (!item || typeof item !== 'object') return false
    const policy = item as SafeguardPolicy
    if (typeof policy.id !== 'string' || !policy.id.trim() || typeof policy.name !== 'string' ||
      typeof policy.createdAt !== 'string' || !Number.isFinite(Date.parse(policy.createdAt)) ||
      typeof policy.updatedAt !== 'string' || !Number.isFinite(Date.parse(policy.updatedAt))) return false
    try {
      validateSafeguard(policy, [])
      return true
    } catch {
      return false
    }
  })) return false
  return new Set(value.map(policy => policy.id)).size === value.length &&
    new Set(value.map(policy => customSafeguardNameKey(policy.name))).size === value.length
}

export function projectSafeguardPolicies(project: {
  id: string
  createdAt: string
  updatedAt: string
  safeguardPolicies?: SafeguardPolicy[]
  safeguards?: ProjectSafeguards
  customSafeguards?: CustomSafeguard[]
}): SafeguardPolicy[] {
  if (project.safeguardPolicies !== undefined) return project.safeguardPolicies
  const custom = project.customSafeguards ?? []
  const ids = new Set(custom.map(policy => policy.id))
  const defaults = { severity: 'Medium', enforcement: 'Advisory', createdAt: project.createdAt, updatedAt: project.updatedAt } as const
  const policies: SafeguardPolicy[] = safeguardGroups.flatMap(({ title: category, policies }) => policies.map(([key, name]) => {
    let id = `${project.id}:safeguard:${key}`
    while (ids.has(id)) id += ':legacy'
    ids.add(id)
    return { ...defaults, id, name, category, context: '', enabled: project.safeguards?.[key] ?? false }
  }))
  const names = new Set(policies.map(policy => customSafeguardNameKey(policy.name)))
  const reservedNames = new Set(custom.map(policy => customSafeguardNameKey(policy.name)))
  for (const policy of custom) {
    const originalName = policy.name.trim()
    let name = originalName
    if (names.has(customSafeguardNameKey(name))) {
      let suffix = 1
      do {
        name = `${originalName} (custom${suffix === 1 ? '' : ' ' + suffix})`
        suffix++
      } while (names.has(customSafeguardNameKey(name)) || reservedNames.has(customSafeguardNameKey(name)))
    }
    names.add(customSafeguardNameKey(name))
    policies.push({ ...defaults, id: policy.id, name, category: policy.category, enabled: policy.enabled, context: policy.description ?? '' })
  }
  return policies
}
