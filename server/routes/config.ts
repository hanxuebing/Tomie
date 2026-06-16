import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db/index';
import { testConnection } from '../services/agent';
import { setDefaultModel, ensureRoleDefaults, fetchAvailableModels } from '../services/llm';
import type { LLMGlobal, LLMModel } from '../types';

const router = Router();

// GET /llm — full config (global + models)
router.get('/llm', (req, res) => {
  const global = db.query('SELECT * FROM llm_global WHERE id = ?').get('default') as LLMGlobal;
  const models = db.query('SELECT * FROM llm_models ORDER BY role, is_default DESC, name').all() as LLMModel[];
  res.json({
    auth_token_masked: global.auth_token ? global.auth_token.slice(0, 10) + '***' : '',
    base_url: global.base_url,
    updated_at: global.updated_at,
    models,
  });
});

// PUT /llm/global — update auth settings
router.put('/llm/global', (req, res) => {
  const { auth_token, base_url } = req.body;
  if (!base_url) {
    res.status(400).json({ error: 'Base URL 不能为空' });
    return;
  }
  const existing = db.query('SELECT * FROM llm_global WHERE id = ?').get('default') as LLMGlobal;
  const finalToken = auth_token?.trim() ? auth_token : existing.auth_token;
  const now = new Date().toISOString();
  db.run('UPDATE llm_global SET auth_token = ?, base_url = ?, updated_at = ? WHERE id = ?',
    [finalToken, base_url.trim(), now, 'default']);
  res.json({ success: true });
});

// POST /llm/models — add a model
router.post('/llm/models', (req, res) => {
  const { role, name, model } = req.body;
  if (!role || !name || !model) {
    res.status(400).json({ error: '所有字段不能为空' });
    return;
  }
  if (role !== 'text' && role !== 'vision') {
    res.status(400).json({ error: 'role 必须是 text 或 vision' });
    return;
  }
  // Auto-default when adding the first model of this role
  const count = db.query('SELECT COUNT(*) as cnt FROM llm_models WHERE role = ?').get(role) as { cnt: number };
  const isDefault = count.cnt === 0 ? 1 : 0;

  const id = uuid();
  const now = new Date().toISOString();
  db.run('INSERT INTO llm_models (id, role, name, model, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, role, name, model, isDefault, now]);
  const entry = db.query('SELECT * FROM llm_models WHERE id = ?').get(id);
  res.status(201).json(entry);
});

// PUT /llm/models/:id — update a model
router.put('/llm/models/:id', (req, res) => {
  const existing = db.query('SELECT * FROM llm_models WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: '模型不存在' }); return; }
  const { role, name, model } = req.body;
  if (role && role !== 'text' && role !== 'vision') {
    res.status(400).json({ error: 'role 必须是 text 或 vision' }); return;
  }
  db.run('UPDATE llm_models SET role = COALESCE(?, role), name = COALESCE(?, name), model = COALESCE(?, model) WHERE id = ?',
    [role || null, name || null, model || null, req.params.id]);
  // If role changed, ensure defaults still hold for both old and new roles
  if (role) ensureRoleDefaults();
  const updated = db.query('SELECT * FROM llm_models WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// POST /llm/models/:id/default — set a model as the default for its role
router.post('/llm/models/:id/default', (req, res) => {
  const ok = setDefaultModel(req.params.id);
  if (!ok) { res.status(404).json({ error: '模型不存在' }); return; }
  res.json({ success: true });
});

// DELETE /llm/models/:id — remove a model
router.delete('/llm/models/:id', (req, res) => {
  const existing = db.query('SELECT * FROM llm_models WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: '模型不存在' }); return; }
  db.run('DELETE FROM llm_models WHERE id = ?', [req.params.id]);
  // Promote a new default if we just deleted the current one
  ensureRoleDefaults();
  res.json({ success: true });
});

// GET /llm/available-models — fetch model list from the configured Base URL
router.get('/llm/available-models', async (req, res) => {
  try {
    const models = await fetchAvailableModels();
    res.json(models);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? '获取模型列表失败' });
  }
});

// POST /llm/test — test connection with the text model
router.post('/llm/test', async (req, res) => {
  const result = await testConnection();
  res.json({ success: result.ok, message: result.message });
});

export default router;
