import { webUrl } from './implementation'

export const repositoryProviders = ['GitHub', 'GitLab', 'Azure DevOps', 'Other'] as const

export interface RepositoryInput {
  name: string
  url: string
  provider: (typeof repositoryProviders)[number]
  defaultBranch: string
  description?: string
}

export interface QualityGateInput {
  name: string
  description: string
  enabled: boolean
  required: boolean
  command?: string
}

interface ConfigRecord {
  id: string
  createdAt: string
  updatedAt: string
}

export type ProjectRepository = RepositoryInput & ConfigRecord
export type QualityGate = QualityGateInput & ConfigRecord

export interface ProjectAgentConfig {
  context: string
  workflow: string
  repositories: ProjectRepository[]
  qualityGates: QualityGate[]
}

export type AgentConfigChange =
  | { kind: 'context' | 'workflow'; content: string }
  | { kind: 'repository'; id?: string; input: RepositoryInput }
  | { kind: 'qualityGate'; id?: string; input: QualityGateInput }
  | { kind: 'toggleQualityGate'; id: string }
  | { kind: 'removeRepository' | 'removeQualityGate'; id: string }

export function emptyAgentConfig(): ProjectAgentConfig {
  return { context: '', workflow: '', repositories: [], qualityGates: [] }
}

function repositoryUrl(value: string) {
  const safe = webUrl(value)
  if (!safe) throw new Error('Enter a valid HTTP or HTTPS repository URL without credentials.')
  const url = new URL(safe)
  if (url.search || url.hash) throw new Error('Use the repository URL without query parameters or fragments.')
  return safe
}

function repositoryKey(value: string) {
  return value.replace(/\/+$/, '').replace(/\.git$/i, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function validConfigRecords<T extends ConfigRecord>(value: unknown, valid: (record: Record<string, unknown>) => boolean): value is T[] {
  return Array.isArray(value) && value.every(item => isRecord(item) && typeof item.id === 'string' && Boolean(item.id.trim()) &&
    validTimestamp(item.createdAt) && validTimestamp(item.updatedAt) && valid(item)) &&
    new Set(value.map(item => item.id)).size === value.length
}

function validRepository(record: Record<string, unknown>) {
  if (typeof record.name !== 'string' || !record.name.trim() || typeof record.defaultBranch !== 'string' ||
    !record.defaultBranch.trim() || typeof record.url !== 'string' ||
    !repositoryProviders.some(provider => provider === record.provider) ||
    (record.description !== undefined && typeof record.description !== 'string')) return false
  try {
    repositoryUrl(record.url)
    return true
  } catch {
    return false
  }
}

export function isProjectAgentConfig(value: unknown): value is ProjectAgentConfig {
  return isRecord(value) && typeof value.context === 'string' && typeof value.workflow === 'string' &&
    validConfigRecords<ProjectRepository>(value.repositories, validRepository) &&
    new Set(value.repositories.map(item => repositoryKey(repositoryUrl(item.url)))).size === value.repositories.length &&
    validConfigRecords<QualityGate>(value.qualityGates, item => typeof item.name === 'string' && Boolean(item.name.trim()) &&
      typeof item.description === 'string' && Boolean(item.description.trim()) &&
      typeof item.enabled === 'boolean' && typeof item.required === 'boolean' &&
      (item.command === undefined || typeof item.command === 'string'))
}

export function updateAgentConfig(config: ProjectAgentConfig, change: AgentConfigChange, now: string): ProjectAgentConfig {
  switch (change.kind) {
    case 'context':
    case 'workflow':
      return { ...config, [change.kind]: change.content }
    case 'repository': {
      const { id, input } = change
      const url = repositoryUrl(input.url)
      if (config.repositories.some(repo => repo.id !== id && repositoryKey(repositoryUrl(repo.url)) === repositoryKey(url))) {
        throw new Error('This repository URL is already registered for the project.')
      }
      const fields = { name: input.name.trim(), url, provider: input.provider,
        defaultBranch: input.defaultBranch.trim(), description: input.description?.trim() || undefined }
      if (!fields.name || !fields.defaultBranch) throw new Error('Enter a repository name and default branch.')
      return { ...config, repositories: saveRecord(config.repositories, fields, now, id) }
    }
    case 'qualityGate': {
      const { input } = change
      const fields = { name: input.name.trim(), description: input.description.trim(), enabled: input.enabled,
        required: input.required, command: input.command?.trim() || undefined }
      if (!fields.name || !fields.description) throw new Error('Enter a name and description for the quality gate.')
      return { ...config, qualityGates: saveRecord(config.qualityGates, fields, now, change.id) }
    }
    case 'toggleQualityGate': {
      const gate = config.qualityGates.find(item => item.id === change.id)
      if (!gate) throw new Error('This quality gate no longer exists.')
      return { ...config, qualityGates: config.qualityGates.map(item => item.id === change.id
        ? { ...item, enabled: !item.enabled, updatedAt: now } : item) }
    }
    case 'removeRepository':
      return { ...config, repositories: config.repositories.filter(item => item.id !== change.id) }
    case 'removeQualityGate':
      return { ...config, qualityGates: config.qualityGates.filter(item => item.id !== change.id) }
  }
}

function saveRecord<T extends object>(records: (T & ConfigRecord)[], input: T, now: string, id?: string): (T & ConfigRecord)[] {
  if (id === undefined) return [...records, { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }]
  if (!records.some(item => item.id === id)) throw new Error('This record no longer exists.')
  return records.map(item => item.id === id ? { ...item, ...input, updatedAt: now } : item)
}
