import 'express-async-errors';
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRateLimiter, authRateLimiter, adminRateLimiter } from './middleware/rateLimiter';
import { validateBody } from './middleware/validation';
import { loginSchema } from './controllers/auth.controller';
import { requestIdMiddleware } from './middleware/requestId';
import authRoutes from './routes/auth.routes';
import conversationRoutes from './routes/conversation.routes';
import contactRoutes from './routes/contact.routes';
import handoffRoutes from './routes/handoff.routes';
import quoteRoutes from './routes/quote.routes';
import appointmentRoutes from './routes/appointment.routes';
import knowledgeRoutes from './routes/knowledge.routes';
import messageRoutes from './routes/message.routes';
import dashboardRoutes from './routes/dashboard.routes';
import auditRoutes from './routes/audit.routes';
import followUpRoutes from './routes/followUp.routes';
import leadScoreRoutes from './routes/leadScore.routes';
import conversationNoteRoutes from './routes/conversationNote.routes';
import quickReplyRoutes from './routes/quickReply.routes';
import businessRoutes from './routes/business.routes';
import settingsRoutes from './routes/settings.routes';
import staffRoutes from './routes/staff.routes';
import whatsappConfigRoutes from './routes/whatsappConfig.routes';
import systemHealthRoutes from './routes/systemHealth.routes';
import { healthRoutes } from './routes/health.routes';
import webhookRoutes from './routes/webhook.routes';
import publicRoutes from './routes/public.routes';
import subscriptionRoutes from './routes/subscription.routes';
import ownerRoutes from './routes/owner.routes';
import adminRoutes from './routes/admin.routes';
import billingRoutes from './routes/billing.routes';
import { ApiResponse } from './types';

const app: Application = express();

// Trust proxy chain: client -> Vercel edge (rewrite) -> nginx -> Express.
// Required so req.ip reflects the real client IP from X-Forwarded-For.
// Must be a number (not `true`) to satisfy express-rate-limit's
// ERR_ERL_PERMISSIVE_TRUST_PROXY validation.
app.set('trust proxy', 2);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret', 'X-Signature-256', 'X-Timestamp', 'X-API-Key', 'X-N8N-Webhook-Secret'],
}));

app.use(requestIdMiddleware);
app.use((req, res, next) => {
  if (req.is('multipart/*')) {
    return next();
  }
  next();
});
app.use(express.json({ type: ['application/json'], limit: '10mb' }));
app.use(express.urlencoded({ type: ['application/x-www-form-urlencoded'], extended: true, limit: '10mb' }));

app.use('/storage', express.static('/app/storage'));

// Health endpoints BEFORE the global limiter so monitoring/docker
// healthchecks can never burn the rate-limit budget (skip in the
// limiter itself is kept as defense-in-depth).
app.use('/health', healthRoutes);
// Alias so Vercel's /api/:path* rewrite can reach health as /api/health
app.use('/api/health', healthRoutes);

app.use(apiRateLimiter);

app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/conversations', conversationRoutes);
app.use('/conversations', conversationRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/contacts', contactRoutes);
app.use('/api/handoffs', handoffRoutes);
app.use('/handoffs', handoffRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/quotes', quoteRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/knowledge', knowledgeRoutes);
app.use('/api/messages', messageRoutes);
app.use('/messages', messageRoutes);
app.use('/api/stats', dashboardRoutes);
app.use('/stats', dashboardRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/audit-logs', auditRoutes);
app.use('/api/lead-scores', leadScoreRoutes);
app.use('/lead-scores', leadScoreRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/follow-ups', followUpRoutes);
app.use('/api/conversations', conversationNoteRoutes);
app.use('/conversations', conversationNoteRoutes);
app.use('/api/quick-replies', quickReplyRoutes);
app.use('/quick-replies', quickReplyRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/businesses', businessRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/settings', settingsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/staff', staffRoutes);

app.use('/api/webhooks', webhookRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/api/public', publicRoutes);
app.use('/public', publicRoutes);
app.use('/api/billing', subscriptionRoutes);
app.use('/billing', subscriptionRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/owner', ownerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes);
app.use('/api/owner/billing', billingRoutes);
app.use('/owner/billing', billingRoutes);
app.use('/api/whatsapp', whatsappConfigRoutes);
app.use('/whatsapp', whatsappConfigRoutes);
app.use('/api/system', systemHealthRoutes);
app.use('/system', systemHealthRoutes);

app.get('/', (_req: Request, res: Response<ApiResponse>): void => {
  res.json({
    success: true,
    data: {
      name: 'WhatsApp Sales Assistant Backend API',
      version: '1.0.0',
      status: 'running',
      documentation: '/api/docs',
    },
  } as ApiResponse);
});

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
