import { describe, expect, it } from 'vitest'
import type { ImplementationTask } from '../domain/implementation'
import { blockedByPrerequisites, projectProgress } from './project-progress'

const timestamp = '2026-11-19T12:00:00.000Z'
function task(id: string, status: ImplementationTask['status'], dependencyIds: string[] = []): ImplementationTask {
  return { id, status, dependencyIds, implementationId: 'implementation', title: id, description: '', order: 1,
    criteria: [], references: [], createdAt: timestamp, updatedAt: timestamp }
}

describe('project progress', () => {
  it('derives project status from task records and recalculates when completion changes', () => {
    expect(projectProgress([])).toEqual({ completed: 0, percent: 0, status: 'Not planned' })
    expect(projectProgress([task('a', 'todo')])).toMatchObject({ percent: 0, status: 'Planned' })
    expect(projectProgress([task('a', 'blocked'), task('b', 'done'), task('c', 'todo')]))
      .toEqual({ completed: 1, percent: 33, status: 'In progress' })
    expect(projectProgress([task('a', 'done')])).toMatchObject({ percent: 100, status: 'Completed' })
    expect(projectProgress([task('a', 'in_progress')])).toMatchObject({ completed: 0, percent: 0, status: 'In progress' })
  })

  it('shows unfinished prerequisites independently of task order or stored task status', () => {
    const dependent = task('b', 'todo', ['a'])
    expect(blockedByPrerequisites([dependent, task('a', 'todo')])).toEqual(new Set(['b']))
    expect(blockedByPrerequisites([task('a', 'done'), dependent])).toEqual(new Set())
    expect(dependent.status).toBe('todo')
  })
})
