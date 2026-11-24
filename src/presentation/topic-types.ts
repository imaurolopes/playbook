import { Boxes, Cpu, FileText, Layers3, Lightbulb, ListChecks } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { TopicType } from '../domain/topic'

export const topicTypeDisplay = {
  Concept: { label: 'Concept', icon: Lightbulb, color: '#eac880' },
  Architecture: { label: 'Architecture', icon: Layers3, color: '#c4a5ff' },
  Technology: { label: 'Technology', icon: Cpu, color: '#97c7ff' },
  Pattern: { label: 'Pattern', icon: Boxes, color: '#8bdacc' },
  Practice: { label: 'Practice', icon: ListChecks, color: '#9adea9' },
  General: { label: 'General', icon: FileText, color: 'var(--purple)' },
} satisfies Record<TopicType, { label: string; icon: LucideIcon; color: string }>
