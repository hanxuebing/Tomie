export type {
  Article,
  Task,
  TaskSource,
  Generation,
  LLMModel,
  GenerateRequest,
} from '@tomie/shared'

export interface LLMGlobal {
  auth_token: string
  base_url: string
  updated_at: string
}
