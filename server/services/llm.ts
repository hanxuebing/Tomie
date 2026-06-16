import type { LLMSettings } from '@tomie/agent'
import db from '../db/index'
import type { LLMGlobal, LLMModel } from '../types'

export function getLLMGlobal(): LLMGlobal {
  return db.query('SELECT * FROM llm_global WHERE id = ?').get('default') as LLMGlobal
}

export function getLLMModels(): LLMModel[] {
  return db.query('SELECT * FROM llm_models ORDER BY role, is_default DESC, name').all() as LLMModel[]
}

/** Map host DB → agent's LLMSettings. */
export function toLLMSettings(): LLMSettings {
  const g = getLLMGlobal()
  const models = getLLMModels()
  return {
    auth: { authToken: g.auth_token, baseUrl: g.base_url },
    models: models.map(m => ({
      id: m.id,
      role: m.role as 'text' | 'vision',
      name: m.name,
      model: m.model,
      isDefault: m.is_default === 1,
    })),
  }
}

/** Make `id` the sole default for its role. Returns false if the model is missing. */
export function setDefaultModel(id: string): boolean {
  const model = db.query('SELECT role FROM llm_models WHERE id = ?').get(id) as { role: string } | null
  if (!model) return false
  db.run('UPDATE llm_models SET is_default = 0 WHERE role = ?', [model.role])
  db.run('UPDATE llm_models SET is_default = 1 WHERE id = ?', [id])
  return true
}

/** Guarantee each role still has exactly one default after add/edit/delete. */
export function ensureRoleDefaults(): void {
  for (const role of ['text', 'vision'] as const) {
    const defaults = db.query('SELECT id FROM llm_models WHERE role = ? AND is_default = 1').all(role) as { id: string }[]
    if (defaults.length === 1) continue
    db.run('UPDATE llm_models SET is_default = 0 WHERE role = ?', [role])
    const first = db.query('SELECT id FROM llm_models WHERE role = ? ORDER BY created_at ASC LIMIT 1').get(role) as { id: string } | null
    if (first) db.run('UPDATE llm_models SET is_default = 1 WHERE id = ?', [first.id])
  }
}

export interface AvailableModel {
  id: string
  display_name: string
}

/** Fetch the model list the configured Base URL actually serves. */
export async function fetchAvailableModels(): Promise<AvailableModel[]> {
  const g = getLLMGlobal()
  const baseUrl = (g.base_url || '').trim().replace(/\/+$/, '')
  if (!baseUrl) throw new Error('请先配置 Base URL')

  const token = g.auth_token || ''
  let resp: Response
  try {
    resp = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-api-key': token,
        'anthropic-version': '2023-06-01',
      },
    })
  } catch (err: any) {
    throw new Error(`无法连接到 Base URL：${err?.message ?? String(err)}`)
  }

  if (resp.status === 404) {
    throw new Error('该网关不支持模型列表接口（/v1/models），请手动输入模型名')
  }
  if (!resp.ok) {
    const body = (await resp.text().catch(() => '')).slice(0, 200)
    throw new Error(`获取模型列表失败：${resp.status} ${body}`)
  }

  const json: any = await resp.json().catch(() => null)
  const data: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
  const models = data
    .map((m) => {
      const id = typeof m?.id === 'string' ? m.id : ''
      const display = typeof m?.display_name === 'string' && m.display_name ? m.display_name : id
      return { id, display_name: display }
    })
    .filter((m) => m.id)
  return models
}
