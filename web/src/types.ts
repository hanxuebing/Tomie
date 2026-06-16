import type {
  Article as BaseArticle,
  Task as BaseTask,
  TaskSource,
  Generation,
  LLMModel,
} from '@tomie/shared'
export type { LLMModel, GenerateRequest } from '@tomie/shared'

export interface Article extends BaseArticle {
  content?: string
  found?: boolean
}

export interface Task extends BaseTask {
  source_count?: number
  generation_count?: number
  is_running?: boolean
  has_unread?: boolean
}

export interface TaskDetail extends Task {
  sources: TaskSourceItem[]
  generations: GenerationItem[]
  is_running: boolean
  running_generation?: {
    sequence_num: number
    prompt: string
    based_on: 'source' | 'previous'
    parent_generation_id: string | null
    parent_sequence_num: number | null
    replace_generation_id: string | null
  } | null
}

export interface TaskSourceItem extends TaskSource {
  title: string
  file_path: string
  file_found: boolean
}

export interface GenerationItem extends Generation {
  article_title: string
  file_path: string
  file_found: boolean
  parent_sequence_num?: number | null
  pending?: boolean
}

// ── LLM Config (multi-model) ──

export interface LLMConfigResponse {
  auth_token_masked: string
  base_url: string
  updated_at: string
  models: LLMModel[]
}

// ── Grouped Articles ──

export interface TaskArticle extends Article {
  sequence_num: number | null
}

export interface TaskArticleGroup {
  id: string
  title: string
  status: string
  created_at: string
  articles: TaskArticle[]
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface GroupedArticles {
  ungrouped: Article[]
  tasks: TaskArticleGroup[]
  pagination: Pagination
}
