import { Database } from 'bun:sqlite';
import path from 'path';

const DB_PATH = path.resolve(import.meta.dirname, '../../data/tomie.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
await Bun.write(path.join(dataDir, '.gitkeep'), '');

const db = new Database(DB_PATH, { create: true });
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export default db;
