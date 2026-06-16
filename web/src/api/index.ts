import axios from 'axios'
import type {
  Article,
  Task,
  TaskDetail,
  GroupedArticles,
  LLMConfigResponse,
  LLMModel,
} from '@/types'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
})

export default api

// ---------- Articles ----------

export async function listArticles(params?: { source?: string; search?: string; standalone?: string }): Promise<Article[]> {
  const { data } = await api.get('/articles', { params })
  return data
}

export async function listGroupedArticles(params?: {
  page?: number
  pageSize?: number
  search?: string
}): Promise<GroupedArticles> {
  const { data } = await api.get('/articles/grouped', { params })
  return data
}

export async function getArticle(id: string): Promise<Article> {
  const { data } = await api.get(`/articles/${id}`)
  return data
}

export async function createArticle(payload: { title: string; content: string }): Promise<Article> {
  const { data } = await api.post('/articles', payload)
  return data
}

export async function updateArticle(id: string, payload: { title?: string; content?: string }): Promise<Article> {
  const { data } = await api.put(`/articles/${id}`, payload)
  return data
}

export async function deleteArticle(id: string): Promise<void> {
  await api.delete(`/articles/${id}`)
}

/** OCR: send base64 image → get markdown text (and optionally auto-create article). */
export async function ocrImage(payload: {
  image: string
  mimeType: string
  hint?: string
  title?: string
}): Promise<{ markdown: string; article?: Article }> {
  const { data } = await api.post('/articles/ocr', payload)
  return data
}

// ---------- Tasks ----------

export async function listTasks(status?: 'running' | 'finished'): Promise<Task[]> {
  const { data } = await api.get('/tasks', { params: status ? { status } : {} })
  return data
}

export async function getTask(id: string): Promise<TaskDetail> {
  const { data } = await api.get(`/tasks/${id}`)
  return data
}

export async function createTask(payload: {
  title: string
  initial_prompt: string
  source_article_ids: string[]
}): Promise<Task> {
  const { data } = await api.post('/tasks', payload)
  return data
}

export async function generate(taskId: string, payload: {
  prompt: string
  based_on: 'source' | 'previous'
  parent_generation_id?: string
  model_id?: string
}): Promise<void> {
  await api.post(`/tasks/${taskId}/generate`, payload)
}

export async function completeTask(id: string): Promise<void> {
  await api.put(`/tasks/${id}/complete`)
}

export async function cancelTask(id: string): Promise<void> {
  await api.put(`/tasks/${id}/cancel`)
}

export async function deleteTask(id: string): Promise<void> {
  await api.delete(`/tasks/${id}`)
}

// ---------- LLM Config (multi-model) ----------

export async function getLLMConfig(): Promise<LLMConfigResponse> {
  const { data } = await api.get('/config/llm')
  return data
}

export async function updateLLMGlobal(payload: { auth_token?: string; base_url: string }): Promise<void> {
  await api.put('/config/llm/global', payload)
}

export async function addLLMModel(payload: { role: string; name: string; model: string }): Promise<LLMModel> {
  const { data } = await api.post('/config/llm/models', payload)
  return data
}

export async function updateLLMModel(id: string, payload: Partial<LLMModel>): Promise<LLMModel> {
  const { data } = await api.put(`/config/llm/models/${id}`, payload)
  return data
}

export async function deleteLLMModel(id: string): Promise<void> {
  await api.delete(`/config/llm/models/${id}`)
}

export async function setDefaultLLMModel(id: string): Promise<void> {
  await api.post(`/config/llm/models/${id}/default`)
}

export async function getAvailableModels(): Promise<{ id: string; display_name: string }[]> {
  const { data } = await api.get('/config/llm/available-models')
  return data
}

export async function testLLMConnection(): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post('/config/llm/test')
  return data
}
