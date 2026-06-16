import express from 'express';
import cors from 'cors';
import path from 'path';
import articlesRouter from './routes/articles';
import tasksRouter from './routes/tasks';
import configRouter from './routes/config';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/articles', articlesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/config', configRouter);

// Serve static frontend in production
const webDist = path.resolve(import.meta.dirname, '../web/dist');
app.use(express.static(webDist));
app.get('{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(webDist, 'index.html'));
});

export default app;
