import db from './index';

export function migrate() {
  // Drop old single-model config
  db.exec(`DROP TABLE IF EXISTS llm_config`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('upload', 'generated')),
      task_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'cancelled')),
      initial_prompt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_viewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_sources (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      article_id TEXT NOT NULL,
      original_article_id TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (article_id) REFERENCES articles(id)
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      article_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      based_on TEXT NOT NULL CHECK(based_on IN ('source', 'previous')),
      parent_generation_id TEXT,
      sequence_num INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      viewed_at TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (article_id) REFERENCES articles(id)
    );

    -- Shared auth settings (single row, id='default')
    CREATE TABLE IF NOT EXISTS llm_global (
      id TEXT PRIMARY KEY DEFAULT 'default',
      auth_token TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Model entries (multiple rows)
    CREATE TABLE IF NOT EXISTS llm_models (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('text', 'vision')),
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
    CREATE INDEX IF NOT EXISTS idx_articles_task_id ON articles(task_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_task_sources_task_id ON task_sources(task_id);
    CREATE INDEX IF NOT EXISTS idx_generations_task_id ON generations(task_id);
  `);

  // Insert default llm_global row if not exists
  const existingGlobal = db.query('SELECT id FROM llm_global WHERE id = ?').get('default');
  if (!existingGlobal) {
    db.run(
      `INSERT INTO llm_global (id, auth_token, base_url) VALUES (?, ?, ?)`,
      [
        'default',
        process.env.ANTHROPIC_AUTH_TOKEN || '',
        process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      ]
    );
  }

  // Backfill is_default for databases created before the column existed
  const modelCols = db.query('PRAGMA table_info(llm_models)').all() as { name: string }[];
  if (!modelCols.some((c) => c.name === 'is_default')) {
    db.exec('ALTER TABLE llm_models ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0');
  }

  // Backfill last_viewed_at for task unread tracking
  const taskCols = db.query('PRAGMA table_info(tasks)').all() as { name: string }[];
  if (!taskCols.some((c) => c.name === 'last_viewed_at')) {
    db.exec('ALTER TABLE tasks ADD COLUMN last_viewed_at TEXT');
  }

  // Drop the obsolete mode column from databases created before it was removed
  if (taskCols.some((c) => c.name === 'mode')) {
    db.exec('ALTER TABLE tasks DROP COLUMN mode');
  }

  // Backfill replaced_by for in-place regeneration tracking
  const genCols = db.query('PRAGMA table_info(generations)').all() as { name: string }[];
  if (!genCols.some((c) => c.name === 'replaced_by')) {
    db.exec('ALTER TABLE generations ADD COLUMN replaced_by TEXT');
  }

  // Backfill deleted_at for article soft-delete
  const articleCols = db.query('PRAGMA table_info(articles)').all() as { name: string }[];
  if (!articleCols.some((c) => c.name === 'deleted_at')) {
    db.exec('ALTER TABLE articles ADD COLUMN deleted_at TEXT');
  }

  // Backfill viewed_at for per-generation unread tracking
  if (!genCols.some((c) => c.name === 'viewed_at')) {
    db.exec('ALTER TABLE generations ADD COLUMN viewed_at TEXT');
    // 历史记录标为已读，避免升级后全部突然变成未读
    db.exec("UPDATE generations SET viewed_at = datetime('now') WHERE viewed_at IS NULL");
  }

  // Insert default models if table is empty
  const modelCount = db.query('SELECT COUNT(*) as cnt FROM llm_models').get() as { cnt: number };
  if (modelCount.cnt === 0) {
    db.run(
      `INSERT INTO llm_models (id, role, name, model, is_default) VALUES (?, ?, ?, ?, 1)`,
      ['text-default', 'text', 'Claude Sonnet', 'claude-sonnet-4-20250514']
    );
    db.run(
      `INSERT INTO llm_models (id, role, name, model, is_default) VALUES (?, ?, ?, ?, 1)`,
      ['vision-default', 'vision', 'Claude Sonnet (Vision)', 'claude-sonnet-4-20250514']
    );
  }

  // Ensure exactly one default per role (promote the earliest model when none set)
  for (const role of ['text', 'vision'] as const) {
    const hasDefault = db.query(
      'SELECT id FROM llm_models WHERE role = ? AND is_default = 1 LIMIT 1'
    ).get(role);
    if (!hasDefault) {
      const first = db.query(
        'SELECT id FROM llm_models WHERE role = ? ORDER BY created_at ASC LIMIT 1'
      ).get(role) as { id: string } | null;
      if (first) db.run('UPDATE llm_models SET is_default = 1 WHERE id = ?', [first.id]);
    }
  }
}
