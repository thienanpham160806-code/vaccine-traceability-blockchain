import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/env';
import { Logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    address: string;
    role: string;
    id: string;
  };
}

/**
 * Middleware to verify JWT token
 */
export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Missing or invalid authorization header',
        },
        timestamp: Date.now(),
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer "

    const decoded = jwt.verify(token, config.jwtSecret) as any;
    req.user = {
      address: decoded.address,
      role: decoded.role,
      id: decoded.id,
    };

    next();
  } catch (error) {
    Logger.warn('Token verification failed', error);
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      },
      timestamp: Date.now(),
    });
  }
};

/**
 * Middleware to check user role
 */
export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
        timestamp: Date.now(),
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `This operation requires one of roles: ${roles.join(', ')}`,
        },
        timestamp: Date.now(),
      });
    }

    next();
  };
};

/**
 * Global error handler middleware
 */
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Internal server error';
  const timestamp = Date.now();
  const authReq = req as AuthRequest;

  Logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    statusCode,
    errorCode,
    message,
    stack: err.stack,
    user: authReq.user
      ? {
          id: authReq.user.id,
          address: authReq.user.address,
          role: authReq.user.role,
        }
      : null,
    timestamp,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      ...(config.nodeEnv !== 'production'
        ? {
            details: err.details || err.stack || err,
          }
        : {}),
    },
    timestamp,
  });
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    Logger.debug(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
};

export default {
  verifyToken,
  requireRole,
  errorHandler,
  requestLogger,
};
