import 'dotenv/config';
import { createServer } from 'http';
import { app } from './app';
import { config } from './config';
import logger from './utils/logger';
import { closePool } from './utils/database';
import { initializeWebSocket } from './websocketServer';

const server = createServer(app);
const port = config.port;

initializeWebSocket(server);

server.listen(port, () => {
  logger.info(`Backend API server running on port ${port}`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`WebSocket server available at ws://localhost:${port}/ws`);
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