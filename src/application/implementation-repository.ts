import type { ImplementationTask, Project, TopicImplementation } from '../domain/implementation'
import type { AcceptanceCriterion, ArtifactDetails, ImplementationArtifact, TaskReference } from '../domain/implementation'

export interface ImplementationWorkspace {
  projects: Project[]
  implementations: TopicImplementation[]
  tasks: ImplementationTask[]
  artifacts: ImplementationArtifact[]
}

export type ImplementationChanges = Partial<Pick<TopicImplementation, 'status' | 'notes' | 'environment'>> & { branch?: string | null }
export type TaskChanges = Pick<ImplementationTask, 'title' | 'description' | 'status'>

export type TaskDetailChange =
  | { kind: 'addCriterion'; criterion: Omit<AcceptanceCriterion, 'order'> }
  | { kind: 'updateCriterion'; id: string; changes: Partial<Pick<AcceptanceCriterion, 'description' | 'completed'>> }
  | { kind: 'moveCriterion'; id: string; direction: -1 | 1 }
  | { kind: 'removeCriterion'; id: string }
  | { kind: 'addDependency'; id: string }
  | { kind: 'removeDependency'; id: string }
  | { kind: 'addReference' | 'updateReference'; reference: TaskReference }
  | { kind: 'removeReference'; id: string }

export interface ImplementationRepository {
  readImplementations(): Promise<ImplementationWorkspace>
  createProject(project: Project, implementation?: TopicImplementation): Promise<void>
  deleteProject(id: string): Promise<void>
  createImplementation(implementation: TopicImplementation): Promise<boolean>
  updateImplementation(id: string, changes: ImplementationChanges): Promise<void>
  deleteImplementation(id: string): Promise<void>
  createTask(task: Omit<ImplementationTask, 'order'>): Promise<void>
  updateTask(id: string, changes: TaskChanges): Promise<void>
  deleteTask(id: string): Promise<void>
  moveTask(id: string, destination: -1 | 1 | string): Promise<void>
  changeTaskDetails(taskId: string, change: TaskDetailChange): Promise<void>
  createArtifact(artifact: ImplementationArtifact): Promise<void>
  updateArtifact(id: string, changes: ArtifactDetails): Promise<void>
  deleteArtifact(id: string): Promise<void>
}
