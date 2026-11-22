import type { AgentProfile, InstructionOptions, InstructionSettings } from '../domain/agent-instructions'
import { defaultGenerationTemplate, templateSections, type ArtifactKind, type TemplateSection } from '../domain/generation-template'
import { webUrl } from '../domain/implementation'
import { stringify } from 'yaml'
import type { InstructionSource } from './instruction-source'

function text(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/[\\&<>*_[\]~\x60]/g, '\\$&')
}

function label(value: string) {
  const words = value.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function referenceLabel({ title, url }: { title: string; url?: string }) {
  const href = url && webUrl(url)
  return href ? '[' + text(title) + '](<' + href + '>)' : text(title)
}

function describe(items: { title: string; description?: string }[]) {
  return items.map(item => '- ' + text(item.title) + (item.description?.trim() ? ' — ' + text(item.description) : '')).join('\n')
}

function taskList(tasks: InstructionSource['tasks'], checklist = false) {
  return tasks.map((task, index) => {
    const prefix = (index + 1) + '. '
    const body = []
    if (!checklist && task.description.trim()) body.push(task.description.trim().split(/\r?\n/).map(text).join('\n'))
    if (!checklist && task.dependencyTitles.length) body.push('Depends on: ' + task.dependencyTitles.map(text).join(', '))
    if (task.criteria.length) {
      body.push('Acceptance criteria\n\n' + task.criteria.map(item => '- [' + (item.completed ? 'x' : ' ') + '] ' + text(item.description)).join('\n'))
    }
    const details = body.join('\n\n').split('\n').map(line => line ? ' '.repeat(prefix.length) + line : '').join('\n')
    const status = checklist ? '[' + (task.status === 'done' ? 'x' : ' ') + '] ' : ''
    return prefix + status + '**' + text(task.title) + '** (' + label(task.status) + ')' + (body.length ? '\n\n' + details : '')
  }).join('\n\n')
}

function namedSections(markdown: string, headingNames: RegExp) {
  const lines = markdown.split(/\r?\n/)
  const matches: string[] = []
  let start: number | undefined
  let level = 0
  let fence: string | undefined
  lines.forEach((line, index) => {
    const marker = /^ {0,3}(\x60{3,}|~{3,})(.*)$/.exec(line)
    if (marker?.[1]) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2]?.trim()) fence = undefined
      return
    }
    if (fence) return
    const heading = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!heading?.[1] || !heading[2]) return
    if (start !== undefined && heading[1].length <= level) {
      matches.push(lines.slice(start, index).join('\n').trim())
      start = undefined
    }
    if (start === undefined && headingNames.test(heading[2])) {
      start = index + 1
      level = heading[1].length
    }
  })
  if (start !== undefined) matches.push(lines.slice(start).join('\n').trim())
  return matches.filter(Boolean).join('\n\n')
}

export function generateInstructions(source: InstructionSource, options: InstructionOptions, profile: AgentProfile,
  settings: InstructionSettings = {}, template = defaultGenerationTemplate) {
  const { topic } = source
  const usage = settings.usage ?? (source.project ? 'implementation' : 'topic')
  const dependencies = options.dependencies ? source.dependencies : []
  const related = options.dependencies ? source.related : []
  const standards = options.content ? topic.content : ''
  const project = usage === 'topic' ? undefined : source.project
  const implementation = options.plan && usage === 'implementation' ? source.implementation : undefined
  const tasks = implementation ? source.tasks.map(task => ({
    ...task,
    criteria: options.criteria ? [...task.criteria].sort((a, b) => a.order - b.order) : [],
    dependencyTitles: options.dependencies ? task.dependencyTitles : [],
  })) : []
  const artifacts = implementation ? source.artifacts : []
  const context = ['Project: ' + text(project?.name ?? '')]
  if (project?.description.trim()) context.push(text(project.description))
  if (implementation) {
    context.push('Implementation status: ' + label(implementation.status), 'Environment: ' + label(implementation.environment))
    if (implementation.branch?.trim()) context.push('Branch: ' + text(implementation.branch))
  }

  const sourceObjective = settings.objective?.trim() || topic.description.trim() || topic.title
  const objective = text(sourceObjective)
  const artifactReferences = artifacts.map(artifact => '- ' + referenceLabel(artifact) + ' (' + label(artifact.type) + ')' +
    (artifact.description?.trim() ? ' — ' + text(artifact.description) : '')).join('\n')
  const taskReferences = tasks.flatMap(task => task.technicalReferences.map(reference =>
    '- ' + referenceLabel(reference) + ' — ' + text(task.title),
  )).join('\n')
  const outcomes = tasks.flatMap(task => task.criteria.map(item => '- ' + text(item.description))).join('\n')
  const blocks: Record<TemplateSection, () => string> = {
    objective: () => objective,
    context: () => text(topic.description),
    standards: () => standards,
    dependencies: () => '',
    project: () => project ? context.join('\n\n') : '',
    plan: () => taskList(tasks),
    guidance: () => implementation?.notes ?? '',
    constraints: () => [
      options.content ? namedSections(topic.content, /^constraints$/i) : '',
      namedSections(implementation?.notes ?? '', /^constraints$/i),
    ].filter(Boolean).join('\n\n'),
    references: () => [taskReferences, artifactReferences].filter(Boolean).join('\n'),
    request: () => objective || text(topic.title),
    outcome: () => outcomes || objective,
    steps: () => tasks.map((task, index) => (index + 1) + '. ' + text(task.title)).join('\n'),
    deliverables: () => artifactReferences,
    checklist: () => taskList(tasks, true),
    validation: () => [
      options.content ? namedSections(topic.content, /^(?:validation(?: requirements)?|verification|testing)$/i) : '',
      namedSections(implementation?.notes ?? '', /^(?:validation(?: requirements)?|verification|testing)$/i),
    ].filter(Boolean).join('\n\n'),
  }

  function render(kind: ArtifactKind) {
    const title = text(topic.title) + ({ agents: '', prompt: ' — Implementation prompt', checklist: ' — Checklist' }[kind])
    const sections = ['# ' + title]
    if (kind === 'agents') sections.push('Topic ID: ' + text(topic.id))
    const append = (heading: string, body: string) => {
      if (body.trim()) sections.push('## ' + heading + '\n\n' + body.trim())
    }
    const headings = kind === 'agents' ? { ...templateSections, ...profile.headings, standards: 'Topic content and technical standards' } : templateSections
    for (const section of template.sections[kind]) {
      if (section === 'dependencies') {
        append('Direct dependencies', describe(dependencies))
        append('Related topics', describe(related))
      } else if (section === 'context' && kind === 'prompt') {
        append('Relevant context', [blocks.context(), project ? 'Project: ' + text(project.name) : ''].filter(Boolean).join('\n\n'))
      } else append(headings[section], blocks[section]())
    }
    return sections.join('\n\n') + '\n'
  }

  const yaml = stringify({
    topic: {
      id: topic.id, title: topic.title,
      description: topic.description.trim() || undefined,
      content: standards.trim() ? standards : undefined,
    },
    objective: sourceObjective,
    usageContext: usage,
    project: project && { id: project.id, name: project.name, description: project.description.trim() || undefined },
    dependencies: dependencies.length || related.length ? {
      direct: dependencies.length ? dependencies : undefined,
      related: related.length ? related : undefined,
    } : undefined,
    implementation: implementation && {
      status: implementation.status,
      environment: implementation.environment,
      branch: implementation.branch?.trim() || undefined,
      tasks: tasks.length ? tasks.map(task => ({
        title: task.title, status: task.status, description: task.description.trim() || undefined,
        dependsOn: task.dependencyTitles.length ? task.dependencyTitles : undefined,
        acceptanceCriteria: task.criteria.length ? task.criteria.map(({ description, completed }) => ({ description, completed })) : undefined,
      })) : undefined,
    },
  }, { aliasDuplicateObjects: false, lineWidth: 0 })

  return { agents: render('agents'), prompt: render('prompt'), checklist: render('checklist'), yaml }
}
