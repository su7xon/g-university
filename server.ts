import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createApp } from './src/server/app.js';
import { initDb, closeDb } from './src/server/db.js';
import { startOutboxWorker, stopOutboxWorker } from './src/server/outbox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse port from CLI flags e.g. --port 3000 or env
const portArgIdx = process.argv.indexOf('--port');
const portFromArg = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? process.argv[portArgIdx + 1] : null;
const PORT = parseInt(portFromArg || process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  await initDb();
  startOutboxWorker(2000);

  const app = createApp();

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.use('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Newtonite Operations Platform listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async () => {
    console.log('Shutting down Newtonite service gracefully...');
    stopOutboxWorker();
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
