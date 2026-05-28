import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import config from './config/env';
import { contractClient } from './contracts/client';
import { eventListener } from './services/eventListener';
import { Logger } from './utils/logger';
import { errorHandler, requestLogger } from './middleware/auth';

import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import productsRoutes from './routes/products';
import batchesRoutes from './routes/batches';
import transfersRoutes from './routes/transfers';
import verifyRoutes from './routes/verify';
import opsRoutes from './routes/ops';

dotenv.config();

const app = express();
const PORT = config.port;

// ============= Middleware =============
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

Logger.success('🚀 Backend starting...');
Logger.info(`📝 Environment: ${config.nodeEnv}`);
Logger.info(`🔌 Port: ${PORT}`);

// ============= Initialize Contracts & Event Listener =============
(async () => {
  try {
    await contractClient.initialize();

    if (contractClient.isInitialized()) {
      Logger.success('✅ Smart contracts initialized');
      
      // Start event listener
      try {
        await eventListener.start();
        Logger.success('✅ Event listener started');
      } catch (eventError) {
        Logger.warn('⚠️ Event listener failed to start', eventError);
      }
    } else {
      Logger.warn('⚠️ Contracts not fully initialized');
    }
  } catch (error) {
    Logger.warn('⚠️ Smart contracts initialization skipped', error);
    Logger.info('💡 API will work with mock/local data');
  }
})();

// ============= Health Check =============
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// ============= API Routes =============
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/products', productsRoutes);
app.use('/batches', batchesRoutes);
app.use('/transfers', transfersRoutes);
app.use('/verify', verifyRoutes);
app.use('/', opsRoutes);
app.use('/consumer/verify', (req, _res, next) => {
  req.url = `/consumer${req.url}`;
  next();
}, verifyRoutes);

// ============= 404 Handler =============
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
    },
  });
});

// ============= Global Error Handler =============
app.use(errorHandler);

// ============= Start Server =============
app.listen(PORT, () => {
  Logger.success(`✅ Backend server running on http://localhost:${PORT}`);
  Logger.info(`📝 Endpoints available:`);
  Logger.info(`   GET    http://localhost:${PORT}/health`);
  Logger.info(`   POST   http://localhost:${PORT}/auth/login`);
  Logger.info(`   GET    http://localhost:${PORT}/dashboard/overview`);
  Logger.info(`   GET    http://localhost:${PORT}/products`);
  Logger.info(`   POST   http://localhost:${PORT}/transfers/scan`);
  Logger.info(`   POST   http://localhost:${PORT}/transfers/confirm`);
  Logger.info(`   GET    http://localhost:${PORT}/verify/:serialId`);
});

export default app;
