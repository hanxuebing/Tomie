import app from './app';
import { migrate } from './db/migrate';

const PORT = Number(process.env.SERVER_PORT) || 3700;

// Run migrations
migrate();
console.log('✓ Database migrated');

app.listen(PORT, () => {
  console.log(`✓ Tomie server running at http://localhost:${PORT}`);
});
