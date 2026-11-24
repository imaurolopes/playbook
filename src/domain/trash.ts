export type TrashEntityType = 'topic' | 'project'

export interface TrashTarget {
  type: TrashEntityType
  id: string
}

export interface TrashItem extends TrashTarget {
  name: string
  deletedAt: string
}
