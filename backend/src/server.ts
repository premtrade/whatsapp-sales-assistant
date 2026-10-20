import 'dotenv/config';
import { createServer } from 'http';
import { app } from './app';
import { config } from './config';
import logger from './utils/logger';
import { closePool } from './utils/database';
import { initializeWebSocket } from './websocketServer';
import { expireDueTrials } from './services/subscription.service';
import { sendDueTrialReminders } from './services/trial-reminder.service';
import { runOfflineBillingLifecycle } from './services/billing/offlineBilling.service';

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

  const runTrialReminders = async (): Promise<void> => {
    try {
      const sentCount = await sendDueTrialReminders();
      if (sentCount > 0) logger.info('Trial reminder job completed', { sentCount });
    } catch (error) {
      logger.error('Trial reminder job failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  };

  const runOfflineBilling = async (): Promise<void> => {
    try {
      const result = await runOfflineBillingLifecycle();
      if (result.renewalsCreated || result.markedPastDue || result.expired) {
        logger.info('Offline billing lifecycle job completed', result);
      }
    } catch (error) {
      logger.error('Offline billing lifecycle job failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  };

  runTrialExpiry();
  setInterval(runTrialExpiry, 60 * 60 * 1000);
  runTrialReminders();
  setInterval(runTrialReminders, 60 * 60 * 1000);
  runOfflineBilling();
  setInterval(runOfflineBilling, 60 * 60 * 1000);

  if (config.billing.provider === 'manual' && !config.billing.accountNumber) {
    logger.warn(
      'Offline billing is active but BILLING_ACCOUNT_NUMBER is empty. Customers will be asked to email ' +
        'for account details. Set BILLING_ACCOUNT_NUMBER and BILLING_BANK_NAME to show them on the Billing page.'
    );
  }
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
