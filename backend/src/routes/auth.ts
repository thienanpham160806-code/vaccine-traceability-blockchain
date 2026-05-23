import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/env';
import { db } from '../config/firebase';
import { Logger } from '../utils/logger';
import { AuthResponse, User, UserRole } from '../types';
import { verifyToken, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * POST /auth/login
 * Login with wallet address (for local dev, simplified without signature verification)
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { address, role } = req.body;

    // Validate input
    if (!address || !role) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: address, role',
        },
      });
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ADDRESS',
          message: 'Invalid Ethereum address format',
        },
      });
    }

    Logger.info(`Login attempt for: ${address}`);

    // Get or create user in Firebase
    const userRef = db.ref(`users/${address}`);
    const userSnapshot = await userRef.once('value');
    let user: User;

    if (!userSnapshot.exists()) {
      // Create new user
      user = {
        id: address,
        address,
        role: role as UserRole,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await userRef.set(user);
      Logger.info(`New user created: ${address}`);
    } else {
      user = userSnapshot.val();
      // Update role if provided
      if (role && role !== user.role) {
        user.role = role as UserRole;
        user.updatedAt = Date.now();
        await userRef.update({ role, updatedAt: user.updatedAt });
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        address: user.address,
        role: user.role,
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    const response: AuthResponse = {
      token,
      user,
    };

    Logger.success(`User logged in: ${address}`);
    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    Logger.error('Login error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: 'Failed to login',
      },
    });
  }
});

/**
 * GET /auth/me
 * Get current user info (requires token)
 */
router.get('/me', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        },
      });
    }

    const userRef = db.ref(`users/${req.user.address}`);
    const userSnapshot = await userRef.once('value');

    if (!userSnapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    }

    const user = userSnapshot.val();

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    Logger.error('Get user info error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_USER_FAILED',
        message: 'Failed to get user info',
      },
    });
  }
});

/**
 * POST /auth/logout (optional - for frontend to clear token)
 */
router.post('/logout', verifyToken, (req: Request, res: Response) => {
  // Token-based auth, just return success
  // Frontend should delete token from localStorage
  Logger.info('User logged out');
  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});

export default router;
