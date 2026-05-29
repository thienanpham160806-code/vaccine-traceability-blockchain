import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import config from '../config/env';
import { db } from '../config/firebase';
import { contractClient } from '../contracts/client';
import { Logger } from '../utils/logger';
import { AuthResponse, User, UserRole } from '../types';
import { verifyToken, AuthRequest } from '../middleware/auth';

const router = Router();
const NONCE_TTL_MS = 5 * 60 * 1000;
const roleLabels: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  MANUFACTURER: 'Nhà sản xuất',
  IMPORTER: 'Nhà nhập khẩu',
  DISTRIBUTOR: 'Nhà phân phối',
  CLINIC: 'Phòng khám',
  PHARMACY: 'Nhà thuốc',
  AUDITOR: 'Kiểm toán viên',
  RECALL_AUTHORITY: 'Đơn vị thu hồi',
};
const defaultDemoActors: Record<string, string> = {
  MANUFACTURER: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  IMPORTER: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  DISTRIBUTOR: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  CLINIC: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  PHARMACY: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
};
const demoRoleOrder = ['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'CLINIC', 'PHARMACY'];

function normalizeAddress(address: string): string {
  return ethers.getAddress(address);
}

function userKey(address: string): string {
  return normalizeAddress(address).toLowerCase();
}

function createToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      address: user.address,
      role: user.role,
      roles: user.roles || [user.role],
    },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

function createLoginMessage(address: string, nonce: string): string {
  return [
    'VaxiTrust authentication',
    '',
    `Wallet: ${normalizeAddress(address)}`,
    `Nonce: ${nonce}`,
    '',
    'Sign this message to prove wallet ownership. This does not trigger a blockchain transaction.',
  ].join('\n');
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
}

function isUsablePrivateKey(privateKey?: string): privateKey is string {
  if (!privateKey || privateKey.includes('...') || privateKey.includes('<')) return false;
  const normalized = normalizePrivateKey(privateKey);
  return /^0x[a-fA-F0-9]{64}$/.test(normalized);
}

function getConfiguredRoleForAddress(address: string): UserRole | null {
  const normalizedAddress = normalizeAddress(address);

  for (const [role, privateKey] of Object.entries(config.rolePrivateKeys)) {
    if (!isUsablePrivateKey(privateKey)) continue;

    try {
      const wallet = new ethers.Wallet(normalizePrivateKey(privateKey));
      if (normalizeAddress(wallet.address) === normalizedAddress) {
        return role.toUpperCase() as UserRole;
      }
    } catch {
      Logger.warn(`Invalid private key configured for role: ${role}`);
    }
  }

  return null;
}

function getConfiguredDemoActors() {
  return demoRoleOrder.map((roleName) => {
    const privateKey = config.rolePrivateKeys[roleName.toLowerCase() as keyof typeof config.rolePrivateKeys];
    const address = isUsablePrivateKey(privateKey)
      ? new ethers.Wallet(normalizePrivateKey(privateKey)).address
      : defaultDemoActors[roleName];

    return {
      role: roleName,
      label: roleLabels[roleName] || roleName,
      address,
      source: isUsablePrivateKey(privateKey) ? 'env' : 'fallback',
    };
  });
}

async function getOnChainUserRoles(address: string): Promise<{ roles: UserRole[]; primaryRole: UserRole | null }> {
  if (!contractClient.isInitialized()) {
    return { roles: [], primaryRole: null };
  }

  try {
    const { roles, primaryRole } = await contractClient.getAccountRoles(normalizeAddress(address));
    return {
      roles: roles as UserRole[],
      primaryRole: primaryRole as UserRole | null,
    };
  } catch (error) {
    Logger.warn('Failed to read wallet roles from chain', error);
    return { roles: [], primaryRole: null };
  }
}

async function getOrCreateUser(
  address: string,
  role: UserRole,
  allowRoleUpdate = false,
  roles: UserRole[] = role === 'PUBLIC' ? ['PUBLIC'] : [role]
): Promise<User> {
  const key = userKey(address);
  const userRef = db.ref(`users/${key}`);
  const userSnapshot = await userRef.once('value');

  if (!userSnapshot.exists()) {
    const now = Date.now();
    const user: User = {
      id: key,
      address: normalizeAddress(address),
      role,
      roles,
      createdAt: now,
      updatedAt: now,
    };

    await userRef.set(user);
    Logger.info(`New user created: ${user.address}`);
    return user;
  }

  const user = userSnapshot.val() as User;
  const currentRoles = Array.isArray(user.roles) ? user.roles : [user.role];
  const rolesChanged = JSON.stringify([...currentRoles].sort()) !== JSON.stringify([...roles].sort());
  if (allowRoleUpdate && role && (role !== user.role || rolesChanged)) {
    user.role = role;
    user.roles = roles;
    user.updatedAt = Date.now();
    await userRef.update({ role, roles, updatedAt: user.updatedAt });
  }

  return user;
}

/**
 * POST /auth/nonce
 * Create a short-lived message for MetaMask signature login.
 */
router.post('/nonce', async (req: Request, res: Response) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ADDRESS', message: 'Missing required field: address' },
      });
    }

    let normalizedAddress: string;
    try {
      normalizedAddress = normalizeAddress(address);
    } catch {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ADDRESS', message: 'Invalid Ethereum address format' },
      });
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + NONCE_TTL_MS;
    const message = createLoginMessage(normalizedAddress, nonce);

    await db.ref(`auth-nonces/${userKey(normalizedAddress)}`).set({
      nonce,
      message,
      expiresAt,
      createdAt: Date.now(),
    });

    res.json({ success: true, data: { message, expiresAt } });
  } catch (error) {
    Logger.error('Create auth nonce error', error);
    res.status(500).json({
      success: false,
      error: { code: 'NONCE_FAILED', message: 'Failed to create login message' },
    });
  }
});

/**
 * GET /auth/demo-actors
 * Return demo role addresses derived from configured private keys.
 */
router.get('/demo-actors', (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: getConfiguredDemoActors(),
    });
  } catch (error) {
    Logger.error('Demo actors error', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DEMO_ACTORS_FAILED',
        message: 'Không thể tải danh sách ví demo.',
      },
    });
  }
});

/**
 * POST /auth/login-with-signature
 * Verify MetaMask signature and return an app JWT.
 */
router.post('/login-with-signature', async (req: Request, res: Response) => {
  try {
    const { address, signature } = req.body;

    if (!address || !signature) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: address, signature',
        },
      });
    }

    let normalizedAddress: string;
    try {
      normalizedAddress = normalizeAddress(address);
    } catch {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ADDRESS', message: 'Invalid Ethereum address format' },
      });
    }

    const nonceRef = db.ref(`auth-nonces/${userKey(normalizedAddress)}`);
    const nonceSnapshot = await nonceRef.once('value');

    if (!nonceSnapshot.exists()) {
      return res.status(400).json({
        success: false,
        error: { code: 'NONCE_NOT_FOUND', message: 'Login message expired. Try again.' },
      });
    }

    const loginNonce = nonceSnapshot.val() as { message: string; expiresAt: number };
    if (!loginNonce.message || !loginNonce.expiresAt || Date.now() > loginNonce.expiresAt) {
      await nonceRef.remove();
      return res.status(400).json({
        success: false,
        error: { code: 'NONCE_EXPIRED', message: 'Login message expired. Try again.' },
      });
    }

    const recoveredAddress = ethers.verifyMessage(loginNonce.message, signature);
    if (normalizeAddress(recoveredAddress) !== normalizedAddress) {
      return res.status(401).json({
        success: false,
        error: { code: 'SIGNATURE_MISMATCH', message: 'Signature does not match wallet address' },
      });
    }

    await nonceRef.remove();

    const chainRoles = await getOnChainUserRoles(normalizedAddress);
    const configuredRole = getConfiguredRoleForAddress(normalizedAddress);
    const effectiveRole = chainRoles.primaryRole || configuredRole || 'PUBLIC';
    const effectiveRoles = chainRoles.roles.length
      ? chainRoles.roles
      : configuredRole
        ? [configuredRole]
        : (['PUBLIC'] as UserRole[]);
    const user = await getOrCreateUser(normalizedAddress, effectiveRole, true, effectiveRoles);
    const token = createToken(user);
    const response: AuthResponse = { token, user };

    Logger.success(`Signature login: ${normalizedAddress}`);
    res.json({ success: true, data: response });
  } catch (error) {
    Logger.error('Signature login error', error);
    res.status(500).json({
      success: false,
      error: { code: 'SIGNATURE_LOGIN_FAILED', message: 'Failed to login with signature' },
    });
  }
});

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

    const user = await getOrCreateUser(address, role as UserRole, true);

    // Generate JWT token
    const token = createToken(user);

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

    const userRef = db.ref(`users/${userKey(req.user.address)}`);
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
