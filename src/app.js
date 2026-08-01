import express from 'express';
import healthRouter from './routes/health.js';
import whatsappRouter from './routes/whatsapp.js';
import emailsRouter from './routes/emails.js';
import draftsRouter from './routes/drafts.js';
import { logger } from './services/logging.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/', (req, res) => {
    res.json({ service: 'Falcon AI', status: 'running' });
  });

  app.use('/health', healthRouter);
  app.use('/', whatsappRouter);
  app.use('/emails', emailsRouter);
  app.use('/drafts', draftsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    logger.error('http.error', err.message, { path: req.path, method: req.method });
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}
