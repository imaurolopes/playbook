import { taskProgress, type ImplementationTask } from '../domain/implementation'

export function projectProgress(tasks: readonly ImplementationTask[]) {
  const { counts, percent } = taskProgress(tasks)
  const status = !tasks.length ? 'Not planned' : counts.done === tasks.length ? 'Completed'
    : counts.done || counts.in_progress || counts.blocked ? 'In progress' : 'Planned'
  return { completed: counts.done, percent, status }
}

export function blockedByPrerequisites(tasks: readonly ImplementationTask[]) {
  const completed = new Set(tasks.filter(task => task.status === 'done').map(task => task.id))
  return new Set(tasks.filter(task => task.dependencyIds.some(id => !completed.has(id))).map(task => task.id))
}
