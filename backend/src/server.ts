import 'dotenv/config';
import { createServer } from 'http';
import { app } from './app';
import { config } from './config';
import logger from './utils/logger';
import { closePool } from './utils/database';
import { initializeWebSocket } from './websocketServer';
import { expireDueTrials } from './services/subscription.service';

const server = createServer(app);
const port = config.port;

initializeWebSocket(server);

server.listen(port, () => {
  logger.info(`Backend API server running on port ${port}`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`WebSocket server available at ws://localhost:${port}/ws`);

  const runTrialExpiry = async (): Promise<void> => {
    try {
      const expiredCount = await expireDueTrials();
      if (expiredCount > 0) {
        logger.info(`Trial expiry job completed`, { expiredCount });
      }
    } catch (error) {
      logger.error('Trial expiry job failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  };

  runTrialExpiry();
  setInterval(runTrialExpiry, 60 * 60 * 1000);
});

server.on('error', (err) => {
  logger.error('Server error', { error: err.message });
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await closePool();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await closePool();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});