import express from 'express';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { reservationRoutes } from './routes/reservationRoutes.js';

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(reservationRoutes);

app.use((error, req, res, next) => {
  logger.logError('request_failed', error, { path: req.path });
  const status = /^Invalid (availability|reservation) input/.test(error.message) ? 400 : 500;
  res.status(status).json({ success: false, error: 'internal_error', message: error.message });
});

app.listen(env.port, () => {
  logger.log('server_started', { port: env.port, nodeEnv: env.nodeEnv });
});
