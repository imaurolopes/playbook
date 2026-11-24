import type { AgentProfile, InstructionOptions, InstructionSettings } from '../domain/agent-instructions'
import { artifactKinds, defaultGenerationTemplate, templateSections, type ArtifactKind, type TemplateSection } from '../domain/generation-template'
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

function describe(items: readonly { title: string; description?: string }[]) {
  return items.map(item => '- ' + text(item.title) + (item.description?.trim() ? ' — ' + text(item.description) : '')).join('\n')
}

function taskList(tasks: InstructionSource['tasks'], checklist = false) {
  return tasks.map((task, index) => {
    const prefix = (index + 1) + '. '
    const body = []
    if ((!checklist || !task.status) && task.description.trim()) {
      body.push(task.status ? task.description.trim().split(/\r?\n/).map(text).join('\n') : task.description.trim())
    }
    if ((!checklist || !task.status) && task.dependencyTitles.length) body.push('Depends on: ' + task.dependencyTitles.map(text).join(', '))
    if (task.criteria.length) {
      body.push('Acceptance criteria\n\n' + task.criteria.map(item =>
        '- ' + (item.completed === undefined ? '' : '[' + (item.completed ? 'x' : ' ') + '] ') + text(item.description)).join('\n'))
    }
    const details = body.join('\n\n').split('\n').map(line => line ? ' '.repeat(prefix.length) + line : '').join('\n')
    const status = checklist && task.status ? '[' + (task.status === 'done' ? 'x' : ' ') + '] ' : ''
    return prefix + status + '**' + text(task.title) + '**' + (task.status ? ' (' + label(task.status) + ')' : '') + (body.length ? '\n\n' + details : '')
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
  const topicOnly = usage === 'topic'
  const dependencies = options.dependencies ? source.dependencies : []
  const related = options.dependencies ? source.related : []
  const standards = options.content ? topic.content : ''
  const sectionsByTopic = new Map<string, typeof source.sections>()
  if (options.content) for (const section of source.sections) {
    if (!section.content.trim()) continue
    const sections = sectionsByTopic.get(section.topicId) ?? []
    sections.push(section)
    sectionsByTopic.set(section.topicId, sections)
  }
  const sectionsFor = (topicId: string) => (sectionsByTopic.get(topicId) ?? []).sort((a, b) => a.order - b.order)
    .map(({ title, content }) => ({ title, content }))
  const rootSections = sectionsFor(topic.id)
  const linkedKnowledge = options.dependencies ? source.knowledge?.topics.map(item => ({
    title: item.title, type: item.type, summary: item.description.trim() || undefined,
    standards: options.content ? item.content.trim() || undefined : undefined,
    sections: sectionsFor(item.id),
  })) ?? [] : []
  const upstream = options.dependencies ? source.knowledge?.edges ?? [] : []
  const project = usage === 'topic' ? undefined : source.project
  const implementation = options.plan && usage === 'implementation' ? source.implementation : undefined
  const tasks = options.plan && (usage === 'topic' || implementation) ? source.tasks.map(task => ({
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
  if (project && source.version) context.push('Knowledge version: v' + source.version.versionNumber)

  const sourceObjective = topicOnly ? undefined : settings.objective?.trim() || topic.description.trim() || topic.title
  const objective = sourceObjective ? text(sourceObjective) : ''
  const artifactReferences = artifacts.map(artifact => '- ' + referenceLabel(artifact) + ' (' + label(artifact.type) + ')' +
    (artifact.description?.trim() ? ' — ' + text(artifact.description) : '')).join('\n')
  const taskReferences = tasks.flatMap(task => task.technicalReferences.map(reference =>
    '- ' + referenceLabel(reference) + ' — ' + text(task.title),
  )).join('\n')
  const outcomes = tasks.flatMap(task => task.criteria.map(item => '- ' + text(item.description))).join('\n')
  const classification = {
    technicalDomains: source.classification?.technicalDomains.length ? source.classification.technicalDomains : undefined,
    tags: source.classification?.tags.length ? source.classification.tags : undefined,
    customProperties: source.classification?.customProperties.length
      ? source.classification.customProperties.map(({ key, type, value }) => ({ key, type, value })) : undefined,
  }
  const contextIncluded = artifactKinds.some(kind => template.sections[kind].includes('context'))
  const classificationContext = [
    !topicOnly && 'Topic type: ' + topic.type,
    classification.technicalDomains && 'Technical domains: ' + classification.technicalDomains.map(text).join(', '),
    classification.tags && 'Tags: ' + classification.tags.map(text).join(', '),
    ...(classification.customProperties ?? []).map(({ key, value }) => text(key) + ': ' + text(String(value))),
  ].filter(Boolean).join('\n')
  const blocks: Record<TemplateSection, () => string> = {
    objective: () => objective,
    context: () => [text(topic.description), classificationContext].filter(Boolean).join('\n\n'),
    standards: () => [standards, ...rootSections.map(section => '### ' + text(section.title) + '\n\n' + section.content)].filter(Boolean).join('\n\n'),
    dependencies: () => '',
    project: () => project ? context.join('\n\n') : '',
    plan: () => taskList(tasks),
    guidance: () => implementation?.notes ?? '',
    constraints: () => [
      options.content ? namedSections(topic.content, /^constraints$/i) : '',
      namedSections(implementation?.notes ?? '', /^constraints$/i),
    ].filter(Boolean).join('\n\n'),
    references: () => [taskReferences, artifactReferences].filter(Boolean).join('\n'),
    request: () => topicOnly ? '' : objective || text(topic.title),
    outcome: () => topicOnly ? '' : outcomes || objective,
    steps: () => topicOnly ? taskList(tasks) : tasks.map((task, index) => (index + 1) + '. ' + text(task.title)).join('\n'),
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
    if (topicOnly) sections.push('Topic type: ' + topic.type)
    const append = (heading: string, body: string) => {
      if (body.trim()) sections.push('## ' + heading + '\n\n' + body.trim())
    }
    const headings = kind === 'agents' ? { ...templateSections, ...profile.headings, standards: 'Topic content and technical standards' } : templateSections
    for (const section of template.sections[kind]) {
      if (section === 'dependencies') {
        append('Direct dependencies', describe(dependencies))
        append('Related topics', describe(related))
        append('Upstream dependencies', upstream.map(({ source, target, description }) =>
          '- ' + text(source) + ' depends on ' + text(target) + (description ? ' — ' + text(description) : '')).join('\n'))
        append('Knowledge from connected topics', linkedKnowledge.map(item => [
          '### ' + text(item.title) + ' (' + item.type + ')', item.summary && text(item.summary), item.standards,
          ...item.sections.map(section => '#### ' + text(section.title) + '\n\n' + section.content),
        ].filter(Boolean).join('\n\n')).join('\n\n'))
      } else if (section === 'context' && kind === 'prompt') {
        append('Relevant context', [blocks.context(), project ? 'Project: ' + text(project.name) : ''].filter(Boolean).join('\n\n'))
      } else if (topicOnly && (section === 'plan' || section === 'checklist')) append('Checklist', blocks[section]())
      else if (topicOnly && section === 'context' && headings.context === 'Project context') append('Topic context', blocks.context())
      else append(headings[section], blocks[section]())
    }
    return sections.join('\n\n') + '\n'
  }

  const yaml = stringify({
    topic: {
      id: topic.id, title: topic.title,
      type: topicOnly || contextIncluded ? topic.type : undefined,
      ...(contextIncluded ? classification : {}),
      knowledgeVersionId: project ? source.version?.id : undefined,
      description: topic.description.trim() || undefined,
      content: standards.trim() ? standards : undefined,
      standards: rootSections.length ? rootSections : undefined,
    },
    objective: sourceObjective,
    usageContext: usage,
    project: project && { id: project.id, name: project.name, description: project.description.trim() || undefined },
    dependencies: dependencies.length || related.length || upstream.length || linkedKnowledge.length ? {
      direct: dependencies.length ? dependencies : undefined,
      related: related.length ? related : undefined,
      upstream: upstream.length ? upstream : undefined,
      knowledge: linkedKnowledge.length ? linkedKnowledge : undefined,
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
    taskDefinitions: usage === 'topic' && tasks.length ? tasks.map(task => ({
      title: task.title, description: task.description.trim() || undefined,
      dependsOn: task.dependencyTitles.length ? task.dependencyTitles : undefined,
      acceptanceCriteria: task.criteria.length ? task.criteria.map(({ description }) => ({ description })) : undefined,
      references: task.technicalReferences.length ? task.technicalReferences : undefined,
    })) : undefined,
  }, { aliasDuplicateObjects: false, lineWidth: 0 })

  return { agents: render('agents'), prompt: render('prompt'), checklist: render('checklist'), yaml }
}
