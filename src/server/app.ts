import express from 'express';
import { idempotencyMiddleware } from './idempotency.js';
import { apiRouter } from './routes.js';

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());

  app.use('/api', idempotencyMiddleware());

  app.use('/api', apiRouter);

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'newtonite-operations-under-pressure',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
