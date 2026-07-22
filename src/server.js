import express from 'express';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { reservationRoutes } from './routes/reservationRoutes.js';
import { vapiToolsRoutes } from './routes/vapiTools.js';

const app = express();

// Accept any Content-Type so Vapi requests (which may arrive as text/plain or
// without a content-type header through ngrok) are still parsed as JSON.
app.use(express.json({ type: '*/*' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(reservationRoutes);
app.use(vapiToolsRoutes);

app.use((error, req, res, next) => {
  logger.logError('request_failed', error, { path: req.path });
  const status = /^Invalid (availability|reservation) input|^Warm session/.test(error.message)
    ? 400
    : 500;
  res.status(status).json({ success: false, error: 'internal_error', message: error.message });
});

app.listen(env.port, () => {
  logger.log('server_started', { port: env.port, nodeEnv: env.nodeEnv });
});
