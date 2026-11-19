import type { InstructionDraft, InstructionKey, InstructionSettings } from '../domain/agent-instructions'
import type { GenerationTemplate } from '../domain/generation-template'

export interface InstructionRepository {
  readInstructionDraft(key: InstructionKey): Promise<InstructionDraft | undefined>
  updateInstructionDraft(key: InstructionKey, update: (current?: InstructionDraft) => InstructionDraft): Promise<InstructionDraft>
  readInstructionSettings(key: InstructionKey): Promise<InstructionSettings>
  updateInstructionSettings(key: InstructionKey, changes: InstructionSettings): Promise<InstructionSettings>
  listGenerationTemplates(): Promise<GenerationTemplate[]>
  writeGenerationTemplate(template: GenerationTemplate, create: boolean): Promise<GenerationTemplate>
  deleteGenerationTemplate(id: string): Promise<void>
}
