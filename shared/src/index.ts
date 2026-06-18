export interface Article {
  id: string
  title: string
  file_path: string
  source: 'upload' | 'generated'
  task_id: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface Task {
  id: string
  title: string
  status: 'running' | 'completed' | 'cancelled'
  initial_prompt: string
  created_at: string
  updated_at: string
  last_viewed_at: string | null
}

export interface TaskSource {
  id: string
  task_id: string
  article_id: string
  original_article_id: string
}

export interface Generation {
  id: string
  task_id: string
  article_id: string
  prompt: string
  based_on: 'source' | 'previous'
  parent_generation_id: string | null
  sequence_num: number
  created_at: string
  replaced_by?: string | null
  viewed_at?: string | null
}

export interface LLMModel {
  id: string
  role: 'text' | 'vision'
  name: string
  model: string
  is_default?: number
  created_at?: string
}

export interface GenerateRequest {
  prompt: string
  based_on: 'source' | 'previous'
  parent_generation_id?: string
  replace_generation_id?: string
  model_id?: string
}
