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
import { ApiResponse } from './types';

const app: Application = express();

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

app.use(apiRateLimiter);

app.use('/health', healthRoutes);

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);

app.use('/api/conversations', conversationRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/handoffs', handoffRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/stats', dashboardRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/lead-scores', leadScoreRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/api/conversations', conversationNoteRoutes);
app.use('/api/quick-replies', quickReplyRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/staff', staffRoutes);

app.use('/api/webhooks', webhookRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/whatsapp', whatsappConfigRoutes);
app.use('/api/system', systemHealthRoutes);

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
