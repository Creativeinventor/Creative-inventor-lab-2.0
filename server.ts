import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  const DATA_DIR = path.resolve(process.cwd(), 'data');
  const CREDENTIALS_FILE = path.join(DATA_DIR, 'admin_credentials.json');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  function getStoredCredentials() {
    try {
      if (fs.existsSync(CREDENTIALS_FILE)) {
        const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
        if (data && data.username && data.password) {
          return {
            username: String(data.username).trim().toLowerCase(),
            password: String(data.password),
            authEmail: data.authEmail || `${String(data.username).trim().toLowerCase()}@creativeinventorlab.internal`,
            updatedAt: data.updatedAt || new Date().toISOString(),
          };
        }
      }
    } catch (e) {
      console.warn('Error reading credentials file:', e);
    }

    return {
      username: 'admin',
      password: '123',
      authEmail: 'admin@creativeinventorlab.internal',
      updatedAt: new Date().toISOString(),
    };
  }

  // Centralized administrator credentials endpoint
  app.get('/api/admin/credentials', (_req, res) => {
    res.json(getStoredCredentials());
  });

  // Centralized administrator update endpoint
  app.post('/api/admin/credentials', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const current = getStoredCredentials();
    const updated = {
      username: String(username).trim().toLowerCase(),
      password: String(password),
      authEmail: `${String(username).trim().toLowerCase()}@creativeinventorlab.internal`,
      updatedAt: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
      console.log(`[Admin Security] Server credentials permanently updated to User ID: ${updated.username}`);
      return res.json(updated);
    } catch (err: any) {
      console.error('Failed to write credentials file:', err);
      return res.status(500).json({ error: 'Failed to persist credentials on server' });
    }
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
