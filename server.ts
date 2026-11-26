import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { buildExportApp } from './apps/export-service/src/app.ts';
import { attachCollabWebSocketServer } from './collabServer.ts';

async function startUnifiedServer() {
  const port = Number(process.env.APP_PORT ?? 3000);
  const isProd = process.env.NODE_ENV === 'production';

  const exportApp = buildExportApp();
  await exportApp.ready();

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.all('/api/*', async (req, res) => {
    try {
      const response = await exportApp.inject({
        method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS',
        url: req.originalUrl,
        headers: {
          'content-type': req.headers['content-type'] ?? 'application/json',
        },
        payload: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      });

      res.status(response.statusCode);
      for (const [key, value] of Object.entries(response.headers)) {
        if (value !== undefined && key.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(key, value as string | string[]);
        }
      }
      res.send(response.rawPayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export service failure';
      res.status(500).json({ error: message });
    }
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Crystal DocPad running at http://0.0.0.0:${port}`);
  });

  const collabWss = attachCollabWebSocketServer(server);

  const shutdown = async () => {
    collabWss.close();
    server.close();
    await exportApp.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startUnifiedServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
