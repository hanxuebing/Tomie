import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import db from '../db/index';
import type { Article } from '../types';

const router = Router();

const ARTICLES_DIR = path.resolve(import.meta.dirname, '../../data/articles');

// Ensure articles dir exists
if (!fs.existsSync(ARTICLES_DIR)) {
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
}

// List articles
router.get('/', (req, res) => {
  const { source, search, standalone } = req.query;
  let sql = 'SELECT id, title, file_path, source, task_id, created_at, updated_at FROM articles';
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: any[] = [];

  if (source && (source === 'upload' || source === 'generated')) {
    conditions.push('source = ?');
    params.push(source);
  }
  if (search && typeof search === 'string' && search.trim()) {
    conditions.push('title LIKE ?');
    params.push(`%${search.trim()}%`);
  }
  if (standalone === 'true') {
    conditions.push('task_id IS NULL');
  }
  if (conditions.length) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';

  const articles = db.query(sql).all(...params);
  res.json(articles);
});

// Grouped articles by task (paginated by task group, with full-library search)
router.get('/grouped', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const like = `%${search}%`;

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string, 10) || 10));
  const offset = (page - 1) * pageSize;

  // Ungrouped (standalone) material — only on page 1.
  const ungrouped = page === 1
    ? db.query(
        `SELECT id, title, file_path, source, task_id, created_at, updated_at
         FROM articles
         WHERE task_id IS NULL AND deleted_at IS NULL${search ? ' AND title LIKE ?' : ''}
         ORDER BY created_at DESC`
      ).all(...(search ? [like] : []))
    : [];

  // Matching task groups (a task qualifies if it has ≥1 article, matching search if given).
  const matchingTasks = db.query(
    `SELECT t.id, t.title, t.status, t.created_at
     FROM tasks t
     WHERE EXISTS (
       SELECT 1 FROM articles a
       WHERE a.task_id = t.id AND a.deleted_at IS NULL${search ? ' AND a.title LIKE ?' : ''}
     )
     ORDER BY t.created_at DESC`
  ).all(...(search ? [like] : [])) as { id: string; title: string; status: string; created_at: string }[];

  const total = matchingTasks.length;
  const pageTasks = matchingTasks.slice(offset, offset + pageSize);

  const taskGroups = pageTasks.map(t => {
    const articles = db.query(
      `SELECT a.id, a.title, a.file_path, a.source, a.task_id,
              a.created_at, a.updated_at, g.sequence_num
       FROM articles a
       LEFT JOIN generations g ON g.article_id = a.id
       WHERE a.task_id = ? AND a.deleted_at IS NULL${search ? ' AND a.title LIKE ?' : ''}
       ORDER BY CASE WHEN a.source = 'upload' THEN 0 ELSE 1 END,
                g.sequence_num ASC`
    ).all(...(search ? [t.id, like] : [t.id]));
    return { id: t.id, title: t.title, status: t.status, created_at: t.created_at, articles };
  });

  res.json({
    ungrouped,
    tasks: taskGroups,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

// OCR: image → markdown article
router.post('/ocr', async (req, res) => {
  const { image, mimeType, hint, title } = req.body;
  if (!image || !mimeType) {
    res.status(400).json({ error: '请提供图片数据' });
    return;
  }

  try {
    const { recognizeImage } = await import('../services/agent');
    const markdown = await recognizeImage({ imageBase64: image, mimeType, hint });

    // Optionally auto-create an article
    if (title) {
      const articleId = uuid();
      const fileName = `${articleId}.md`;
      fs.writeFileSync(path.join(ARTICLES_DIR, fileName), markdown, 'utf-8');
      const now = new Date().toISOString();
      db.run(
        'INSERT INTO articles (id, title, file_path, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [articleId, title, fileName, 'upload', now, now]
      );
      const article = db.query('SELECT * FROM articles WHERE id = ?').get(articleId);
      res.json({ markdown, article });
      return;
    }

    res.json({ markdown });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '图片识别失败' });
  }
});

// Get single article with content
router.get('/:id', (req, res) => {
  const article = db.query('SELECT * FROM articles WHERE id = ?').get(req.params.id) as Article | null;
  if (!article || article.deleted_at) {
    res.status(404).json({ error: '文章不存在' });
    return;
  }

  const fullPath = path.join(ARTICLES_DIR, article.file_path);
  let content: string | null = null;
  let found = true;

  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch {
    found = false;
  }

  res.json({ ...article, content, found });
});

// Create article (JSON body with content, or file upload handled separately)
router.post('/', (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    res.status(400).json({ error: '标题和内容不能为空' });
    return;
  }

  const id = uuid();
  const fileName = `${id}.md`;
  const fullPath = path.join(ARTICLES_DIR, fileName);

  fs.writeFileSync(fullPath, content, 'utf-8');

  const now = new Date().toISOString();
  db.run(
    'INSERT INTO articles (id, title, file_path, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, title, fileName, 'upload', now, now]
  );

  const article = db.query('SELECT * FROM articles WHERE id = ?').get(id);
  res.status(201).json(article);
});

// Update article
router.put('/:id', (req, res) => {
  const article = db.query('SELECT * FROM articles WHERE id = ?').get(req.params.id) as Article | null;
  if (!article) {
    res.status(404).json({ error: '文章不存在' });
    return;
  }

  const { title, content } = req.body;
  const now = new Date().toISOString();

  if (title) {
    db.run('UPDATE articles SET title = ?, updated_at = ? WHERE id = ?', [title, now, article.id]);
  }

  if (content !== undefined) {
    const fullPath = path.join(ARTICLES_DIR, article.file_path);
    fs.writeFileSync(fullPath, content, 'utf-8');
    db.run('UPDATE articles SET updated_at = ? WHERE id = ?', [now, article.id]);
  }

  const updated = db.query('SELECT * FROM articles WHERE id = ?').get(article.id);
  res.json(updated);
});

// Delete article
router.delete('/:id', (req, res) => {
  const article = db.query('SELECT * FROM articles WHERE id = ?').get(req.params.id) as Article | null;
  if (!article) {
    res.status(404).json({ error: '文章不存在' });
    return;
  }

  // Delete file
  const fullPath = path.join(ARTICLES_DIR, article.file_path);
  try {
    fs.unlinkSync(fullPath);
  } catch {
    // File may already be gone
  }

  db.run('DELETE FROM articles WHERE id = ?', [article.id]);
  res.json({ success: true });
});

// Copy article (for task source usage)
router.post('/:id/copy', (req, res) => {
  const article = db.query('SELECT * FROM articles WHERE id = ?').get(req.params.id) as Article | null;
  if (!article) {
    res.status(404).json({ error: '文章不存在' });
    return;
  }

  const srcPath = path.join(ARTICLES_DIR, article.file_path);
  let content: string;
  try {
    content = fs.readFileSync(srcPath, 'utf-8');
  } catch {
    res.status(404).json({ error: '文章文件未找到', found: false });
    return;
  }

  const newId = uuid();
  const newFileName = `${newId}.md`;
  const newFullPath = path.join(ARTICLES_DIR, newFileName);
  fs.writeFileSync(newFullPath, content, 'utf-8');

  const now = new Date().toISOString();
  db.run(
    'INSERT INTO articles (id, title, file_path, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [newId, `[副本] ${article.title}`, newFileName, article.source, now, now]
  );

  const copy = db.query('SELECT * FROM articles WHERE id = ?').get(newId);
  res.status(201).json(copy);
});

export default router;
