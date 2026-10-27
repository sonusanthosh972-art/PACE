import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { connectDb, pingDb } from './db/mongo.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { transactionsRouter } from './routes/transactions.js';
import { insightsRouter } from './routes/insights.js';
import { adminRouter } from './routes/admin.js';
import { startDailySummaryCron } from './jobs/dailySummary.js';

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));

// CORS
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length > 0 && !allowedOrigins.includes('*')) {
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
} else {
  app.use(cors());
}

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  statusCode: 429,
  message: {
    status: 429,
    title: 'Too Many Requests',
    detail: 'Rate limit exceeded for authentication requests.',
  },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  statusCode: 429,
  message: {
    status: 429,
    title: 'Too Many Requests',
    detail: 'Rate limit exceeded.',
  },
});

// Health Checks
app.get('/health', async (_req: Request, res: Response) => {
  const isHealthy = await pingDb();
  if (isHealthy) {
    res.status(200).json({ status: 'healthy', database: 'connected' });
  } else {
    res.status(503).json({
      title: 'Database connection failed',
      detail: 'The server could not establish a connection to the database.',
      status: 503,
    });
  }
});

app.get('/api/v1/health', async (_req: Request, res: Response) => {
  const isHealthy = await pingDb();
  if (isHealthy) {
    res.status(200).json({ status: 'healthy', database: 'connected' });
  } else {
    res.status(503).json({
      title: 'Database connection failed',
      detail: 'The server could not establish a connection to the database.',
      status: 503,
    });
  }
});

// API Routes
app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/me', apiLimiter, meRouter);
app.use('/api/v1/transactions', apiLimiter, transactionsRouter);
app.use('/api/v1/insights', apiLimiter, insightsRouter);
app.use('/api/v1/admin', adminRouter);

// Start Server
const PORT = process.env.PORT || 5080;

async function bootstrap() {
  try {
    console.log('[Bootstrap] Connecting to MongoDB...');
    await connectDb();
    console.log('[Bootstrap] Connected to MongoDB & ensured indexes.');

    startDailySummaryCron();

    app.listen(PORT, () => {
      console.log(`[PaisaPulse API] Server is running on port ${PORT}`);
    });
  } catch (err: any) {
    console.error('[Bootstrap] Fatal startup error:', err.message);
    process.exit(1);
  }
}

bootstrap();
