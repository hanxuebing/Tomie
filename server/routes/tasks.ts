import { Router, type Request, type Response } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import db from '../db/index';
import { runGeneration } from '../services/agent';
import type { AgentInput } from '@tomie/agent';
import type { Task, Article, Generation, TaskSource, GenerateRequest } from '../types';

const router = Router();
const ARTICLES_DIR = path.resolve(import.meta.dirname, '../../data/articles');

// Track running tasks — carries generation metadata + content buffer for SSE reconnect
interface RunningGeneration {
  controller: AbortController
  sequence_num: number
  prompt: string
  based_on: 'source' | 'previous'
  parent_generation_id: string | null
  parent_sequence_num: number | null
  replace_generation_id: string | null
  buffer: string
}
const runningTasks = new Map<string, RunningGeneration>();
// Track SSE connections per task
const sseConnections = new Map<string, Set<Response>>();

function sendSSE(taskId: string, event: string, data: any) {
  const conns = sseConnections.get(taskId);
  if (!conns) return;
  for (const res of conns) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      conns.delete(res);
    }
  }
}

// Global SSE for task-list-level status changes
const globalSSEConnections = new Set<Response>();

function broadcastTaskEvent(event: string, data: { id: string }) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of globalSSEConnections) {
    try {
      res.write(frame);
    } catch {
      globalSSEConnections.delete(res);
    }
  }
}

// List tasks
router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = `SELECT t.*,
    (SELECT COUNT(*) FROM task_sources WHERE task_id = t.id) as source_count,
    (SELECT COUNT(*) FROM generations WHERE task_id = t.id) as generation_count,
    (SELECT COUNT(*) FROM generations WHERE task_id = t.id AND viewed_at IS NULL AND replaced_by IS NULL) as unread_count
    FROM tasks t`;

  if (status === 'running') {
    sql += ` WHERE t.status = 'running'`;
  } else if (status === 'finished') {
    sql += ` WHERE t.status IN ('completed', 'cancelled')`;
  }
  sql += ' ORDER BY t.created_at DESC';

  const rows = db.query(sql).all() as any[];
  const tasks = rows.map((t) => {
    const { unread_count, ...rest } = t;
    return {
      ...rest,
      is_running: runningTasks.has(t.id),
      has_unread: unread_count > 0,
      unread_count,
    };
  });
  res.json(tasks);
});

// Global SSE stream for task list updates
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  globalSSEConnections.add(res);
  res.write(`event: connected\ndata: {}\n\n`);

  req.on('close', () => {
    globalSSEConnections.delete(res);
  });
});

// Get task detail
router.get('/:id', (req, res) => {
  const task = db.query('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | null;
  if (!task) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }

  const sources = db.query(`
    SELECT ts.*, a.title, a.file_path, a.source as article_source
    FROM task_sources ts
    JOIN articles a ON a.id = ts.article_id
    WHERE ts.task_id = ?
  `).all(task.id);

  const generations = db.query(`
    SELECT g.*, a.title as article_title, a.file_path,
           pg.sequence_num as parent_sequence_num
    FROM generations g
    JOIN articles a ON a.id = g.article_id
    LEFT JOIN generations pg ON pg.id = g.parent_generation_id
    WHERE g.task_id = ? AND g.replaced_by IS NULL
    ORDER BY g.sequence_num ASC
  `).all(task.id);

  // Check if files exist
  const checkFileExists = (filePath: string) => {
    try {
      return fs.existsSync(path.join(ARTICLES_DIR, filePath));
    } catch { return false; }
  };

  const sourcesWithStatus = (sources as any[]).map(s => ({
    ...s,
    file_found: checkFileExists(s.file_path),
  }));

  const generationsWithStatus = (generations as any[]).map(g => ({
    ...g,
    file_found: checkFileExists(g.file_path),
  }));

  const running = runningTasks.get(task.id);
  res.json({
    ...task,
    sources: sourcesWithStatus,
    generations: generationsWithStatus,
    is_running: !!running,
    running_generation: running ? {
      sequence_num: running.sequence_num,
      prompt: running.prompt,
      based_on: running.based_on,
      parent_generation_id: running.parent_generation_id,
      parent_sequence_num: running.parent_sequence_num,
      replace_generation_id: running.replace_generation_id,
    } : null,
  });
});

// Mark a single generation as read
router.patch('/:id/generations/:genId/read', (req, res) => {
  const gen = db.query('SELECT id FROM generations WHERE id = ? AND task_id = ?')
    .get(req.params.genId, req.params.id) as { id: string } | null;
  if (!gen) {
    res.status(404).json({ error: '生成记录不存在' });
    return;
  }
  db.run(
    'UPDATE generations SET viewed_at = ? WHERE id = ? AND viewed_at IS NULL',
    [new Date().toISOString(), gen.id]
  );
  broadcastTaskEvent('task_updated', { id: req.params.id });
  res.json({ success: true });
});

// Create task
router.post('/', async (req: Request, res: Response) => {
  const { title, initial_prompt, source_article_ids } = req.body;

  if (!title || !initial_prompt || !source_article_ids?.length) {
    res.status(400).json({ error: '请填写所有必要字段' });
    return;
  }

  const taskId = uuid();
  const now = new Date().toISOString();

  // Create task
  db.run(
    'INSERT INTO tasks (id, title, status, initial_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [taskId, title, 'running', initial_prompt, now, now]
  );

  // Copy source articles
  for (const originalId of source_article_ids) {
    const original = db.query('SELECT * FROM articles WHERE id = ?').get(originalId) as Article | null;
    if (!original) continue;

    // Copy file
    const srcPath = path.join(ARTICLES_DIR, original.file_path);
    let content: string;
    try {
      content = fs.readFileSync(srcPath, 'utf-8');
    } catch {
      continue;
    }

    const copyId = uuid();
    const copyFileName = `${copyId}.md`;
    fs.writeFileSync(path.join(ARTICLES_DIR, copyFileName), content, 'utf-8');

    db.run(
      'INSERT INTO articles (id, title, file_path, source, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [copyId, original.title, copyFileName, 'upload', taskId, now, now]
    );

    db.run(
      'INSERT INTO task_sources (id, task_id, article_id, original_article_id) VALUES (?, ?, ?, ?)',
      [uuid(), taskId, copyId, originalId]
    );
  }

  const task = db.query('SELECT * FROM tasks WHERE id = ?').get(taskId);
  res.status(201).json(task);
  broadcastTaskEvent('task_created', { id: taskId });
});

// Trigger generation (initial or iterative)
router.post('/:id/generate', async (req: Request, res: Response) => {
  const task = db.query('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | null;
  if (!task) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }
  if (task.status !== 'running') {
    res.status(400).json({ error: '任务已结束' });
    return;
  }
  if (runningTasks.has(task.id)) {
    res.status(409).json({ error: '任务正在生成中' });
    return;
  }

  const { prompt, based_on, parent_generation_id, model_id, replace_generation_id } = req.body as GenerateRequest;
  if (!prompt) {
    res.status(400).json({ error: '请输入提示词' });
    return;
  }

  // Compute metadata synchronously so we can register before responding
  let sequenceNum: number;
  if (replace_generation_id) {
    const replacedGen = db.query(
      'SELECT sequence_num FROM generations WHERE id = ? AND task_id = ?'
    ).get(replace_generation_id, task.id) as { sequence_num: number } | null;
    if (!replacedGen) {
      res.status(400).json({ error: '要替换的生成记录不存在' });
      return;
    }
    sequenceNum = replacedGen.sequence_num;
  } else {
    const lastGen = db.query(
      'SELECT MAX(sequence_num) as max_seq FROM generations WHERE task_id = ?'
    ).get(task.id) as { max_seq: number | null } | null;
    sequenceNum = (lastGen?.max_seq || 0) + 1;
  }

  let parentSequenceNum: number | null = null;
  if (parent_generation_id) {
    const pg = db.query('SELECT sequence_num FROM generations WHERE id = ?')
      .get(parent_generation_id) as { sequence_num: number } | null;
    parentSequenceNum = pg?.sequence_num ?? null;
  }

  const abortController = new AbortController();
  runningTasks.set(task.id, {
    controller: abortController,
    sequence_num: sequenceNum,
    prompt,
    based_on: based_on || 'source',
    parent_generation_id: parent_generation_id || null,
    parent_sequence_num: parentSequenceNum,
    replace_generation_id: replace_generation_id || null,
    buffer: '',
  });

  // Respond immediately
  res.json({ message: '生成已开始' });
  broadcastTaskEvent('task_updated', { id: task.id });

  // Run in background
  try {
    // Get source contents
    const sources = db.query(
      'SELECT a.file_path FROM task_sources ts JOIN articles a ON a.id = ts.article_id WHERE ts.task_id = ?'
    ).all(task.id) as { file_path: string }[];

    const sourceContents = sources.map(s => {
      try {
        return fs.readFileSync(path.join(ARTICLES_DIR, s.file_path), 'utf-8');
      } catch { return ''; }
    }).filter(Boolean);

    // Get previous draft if iterating
    let previousDraft: string | undefined;
    if (based_on === 'previous' && parent_generation_id) {
      const parentGen = db.query(
        'SELECT a.file_path FROM generations g JOIN articles a ON a.id = g.article_id WHERE g.id = ?'
      ).get(parent_generation_id) as { file_path: string } | null;
      if (parentGen) {
        try {
          previousDraft = fs.readFileSync(path.join(ARTICLES_DIR, parentGen.file_path), 'utf-8');
        } catch { /* ignore */ }
      }
    }

    sendSSE(task.id, 'start', { sequence_num: sequenceNum });

    const agentInput: AgentInput = {
      sources: sourceContents,
      prompt,
      previousDraft,
      modelId: model_id,
    };

    const fullContent = await runGeneration({
      input: agentInput,
      onEvent: (event) => {
        if (event.type === 'chunk') {
          const running = runningTasks.get(task.id);
          if (running) running.buffer += event.content;
          sendSSE(task.id, 'chunk', { content: event.content });
        } else if (event.type === 'step') {
          sendSSE(task.id, 'step', { step: event.step });
        }
      },
      signal: abortController.signal,
    });

    // Save generated article
    const articleId = uuid();
    const fileName = `${articleId}.md`;
    const fullPath = path.join(ARTICLES_DIR, fileName);
    fs.writeFileSync(fullPath, fullContent, 'utf-8');

    const now = new Date().toISOString();
    const articleTitle = `${task.title} - 第${sequenceNum}次生成`;

    db.run(
      'INSERT INTO articles (id, title, file_path, source, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [articleId, articleTitle, fileName, 'generated', task.id, now, now]
    );

    const genId = uuid();
    db.run(
      'INSERT INTO generations (id, task_id, article_id, prompt, based_on, parent_generation_id, sequence_num, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [genId, task.id, articleId, prompt, based_on || 'source', parent_generation_id || null, sequenceNum, now]
    );

    // Mark old generation as replaced
    if (replace_generation_id) {
      db.run('UPDATE generations SET replaced_by = ? WHERE id = ?', [genId, replace_generation_id]);
    }

    db.run('UPDATE tasks SET updated_at = ? WHERE id = ?', [now, task.id]);

    sendSSE(task.id, 'done', {
      generation_id: genId,
      article_id: articleId,
      article_title: articleTitle,
      sequence_num: sequenceNum,
    });
    broadcastTaskEvent('task_updated', { id: task.id });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      sendSSE(task.id, 'cancelled', { message: '生成已取消' });
      broadcastTaskEvent('task_updated', { id: task.id });
    } else {
      sendSSE(task.id, 'error', { message: err.message || '生成失败' });
      broadcastTaskEvent('task_updated', { id: task.id });
    }
  } finally {
    runningTasks.delete(task.id);
  }
});

// SSE stream endpoint
router.get('/:id/stream', (req: Request, res: Response) => {
  const taskId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  if (!sseConnections.has(taskId)) {
    sseConnections.set(taskId, new Set());
  }
  sseConnections.get(taskId)!.add(res);

  // Send initial connection message
  res.write(`event: connected\ndata: ${JSON.stringify({ taskId })}\n\n`);

  // Replay buffered content so reconnecting clients recover earlier chunks
  const runningInfo = runningTasks.get(taskId);
  if (runningInfo?.buffer) {
    res.write(`event: chunk\ndata: ${JSON.stringify({ content: runningInfo.buffer })}\n\n`);
  }

  req.on('close', () => {
    sseConnections.get(taskId)?.delete(res);
    if (sseConnections.get(taskId)?.size === 0) {
      sseConnections.delete(taskId);
    }
  });
});

// Mark task complete
router.put('/:id/complete', (req, res) => {
  const task = db.query('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | null;
  if (!task) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }

  const now = new Date().toISOString();
  db.run("UPDATE tasks SET status = 'completed', updated_at = ? WHERE id = ?", [now, task.id]);

  // Cancel if running
  const ctrl = runningTasks.get(task.id);
  if (ctrl) ctrl.controller.abort();
  runningTasks.delete(task.id);

  broadcastTaskEvent('task_updated', { id: task.id });
  res.json({ success: true });
});

// Cancel task
router.put('/:id/cancel', (req, res) => {
  const task = db.query('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | null;
  if (!task) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }

  const now = new Date().toISOString();
  db.run("UPDATE tasks SET status = 'cancelled', updated_at = ? WHERE id = ?", [now, task.id]);

  // Cancel if running
  const ctrl = runningTasks.get(task.id);
  if (ctrl) ctrl.controller.abort();
  runningTasks.delete(task.id);

  broadcastTaskEvent('task_updated', { id: task.id });
  res.json({ success: true });
});

// Delete task (keep articles)
router.delete('/:id', (req, res) => {
  const task = db.query('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | null;
  if (!task) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }

  // Cancel if running
  const ctrl = runningTasks.get(task.id);
  if (ctrl) ctrl.controller.abort();
  runningTasks.delete(task.id);

  // Delete task records but keep articles
  db.run('DELETE FROM generations WHERE task_id = ?', [task.id]);
  db.run('DELETE FROM task_sources WHERE task_id = ?', [task.id]);
  db.run('DELETE FROM tasks WHERE id = ?', [task.id]);

  broadcastTaskEvent('task_deleted', { id: task.id });
  res.json({ success: true });
});

export default router;
