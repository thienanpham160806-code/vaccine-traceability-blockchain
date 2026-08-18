import {
  getVisibilityContext,
  canViewAll,
  isOperationalRole,
  isAddressMatch,
  roleMatches,
  productVisibleTo,
  transferVisibleTo,
  riskVisibleTo,
  recallVisibleTo,
  latestTransferForProduct,
  inferProductSyncStatus,
  decorateProduct,
  batchVisibleTo,
  decorateBatch,
  decorateTransfer,
} from '../../src/services/visibility';
import { Request } from 'express';
import jwt from 'jsonwebtoken';

function createJwtToken(payload: Record<string, any>): string {
  return jwt.sign(payload, process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only');
}

function mockRequest(headers: Record<string, any> = {}, query: Record<string, any> = {}): Partial<Request> {
  return { headers, query } as Partial<Request>;
}

describe('VisibilityService', () => {
  describe('getVisibilityContext', () => {
    it('should return default context for unauthenticated request', () => {
      const req = mockRequest({});
      const ctx = getVisibilityContext(req as Request);

      expect(ctx.isAuthenticated).toBe(false);
      expect(ctx.scope).toBe('mine');
      expect(ctx.roles).toEqual([]);
      expect(ctx.isPrivilegedViewer).toBe(false);
    });

    it('should return context for authenticated user with single role', () => {
      const token = createJwtToken({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5',
        role: 'MANUFACTURER',
      });

      const req = mockRequest({ authorization: `Bearer ${token}` });
      const ctx = getVisibilityContext(req as Request);

      expect(ctx.isAuthenticated).toBe(true);
      expect(ctx.address).toBe('0x742d35cc6634c0532925a3b844bc9e7595f0d5e5');
      expect(ctx.roles).toContain('MANUFACTURER');
    });

    it('should return context with scope=all for privileged viewers', () => {
      const token = createJwtToken({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5',
        role: 'ADMIN',
      });

      const req = mockRequest(
        { authorization: `Bearer ${token}` },
        { scope: 'all' }
      );
      const ctx = getVisibilityContext(req as Request);

      expect(ctx.isPrivilegedViewer).toBe(true);
      expect(ctx.scope).toBe('all');
    });

    it('should return scope=mine even with scope=all query if not privileged', () => {
      const token = createJwtToken({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5',
        role: 'MANUFACTURER',
      });

      const req = mockRequest(
        { authorization: `Bearer ${token}` },
        { scope: 'all' }
      );
      const ctx = getVisibilityContext(req as Request);

      expect(ctx.isPrivilegedViewer).toBe(false);
      expect(ctx.scope).toBe('mine');
    });

    it('should handle multiple roles', () => {
      const token = createJwtToken({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5',
        role: 'ADMIN',
        roles: ['ADMIN', 'AUDITOR'],
      });

      const req = mockRequest({ authorization: `Bearer ${token}` });
      const ctx = getVisibilityContext(req as Request);

      expect(ctx.roles).toContain('ADMIN');
      expect(ctx.roles).toContain('AUDITOR');
      expect(ctx.roles.length).toBe(2);
    });

    it('should normalize addresses to lowercase', () => {
      const token = createJwtToken({
        address: '0x742D35Cc6634C0532925a3b844Bc9e7595f0d5E5',
        role: 'MANUFACTURER',
      });

      const req = mockRequest({ authorization: `Bearer ${token}` });
      const ctx = getVisibilityContext(req as Request);

      expect(ctx.address).toBe('0x742d35cc6634c0532925a3b844bc9e7595f0d5e5');
    });

    it('should normalize roles to uppercase', () => {
      const token = createJwtToken({
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5',
        role: 'manufacturer',
      });

      const req = mockRequest({ authorization: `Bearer ${token}` });
      const ctx = getVisibilityContext(req as Request);

      expect(ctx.roles).toContain('MANUFACTURER');
    });
  });

  describe('canViewAll', () => {
    it('should return true for ADMIN role', () => {
      const ctx = { isPrivilegedViewer: true } as any;
      expect(canViewAll(ctx)).toBe(true);
    });

    it('should return true for AUDITOR role', () => {
      const ctx = { isPrivilegedViewer: true } as any;
      expect(canViewAll(ctx)).toBe(true);
    });

    it('should return false for MANUFACTURER role', () => {
      const ctx = { isPrivilegedViewer: false } as any;
      expect(canViewAll(ctx)).toBe(false);
    });
  });

  describe('isOperationalRole', () => {
    it('should return true for operational roles', () => {
      expect(isOperationalRole('MANUFACTURER')).toBe(true);
      expect(isOperationalRole('IMPORTER')).toBe(true);
      expect(isOperationalRole('DISTRIBUTOR')).toBe(true);
      expect(isOperationalRole('CLINIC')).toBe(true);
      expect(isOperationalRole('PHARMACY')).toBe(true);
    });

    it('should return false for non-operational roles', () => {
      expect(isOperationalRole('ADMIN')).toBe(false);
      expect(isOperationalRole('AUDITOR')).toBe(false);
      expect(isOperationalRole('RECALL_AUTHORITY')).toBe(false);
      expect(isOperationalRole('')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isOperationalRole('manufacturer')).toBe(true);
      expect(isOperationalRole('Manufacturer')).toBe(true);
    });
  });

  describe('isAddressMatch', () => {
    it('should match identical addresses', () => {
      expect(isAddressMatch('0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5', '0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5')).toBe(true);
    });

    it('should match addresses with different case', () => {
      expect(isAddressMatch('0x742D35Cc6634C0532925a3b844Bc9e7595f0d5E5', '0x742d35cc6634c0532925a3b844bc9e7595f0d5e5')).toBe(true);
    });

    it('should not match different addresses', () => {
      expect(isAddressMatch('0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5', '0x0000000000000000000000000000000000000000')).toBe(false);
    });

    it('should return false for empty address', () => {
      expect(isAddressMatch('', '0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5')).toBe(false);
      expect(isAddressMatch(undefined, '0x742d35Cc6634C0532925a3b844Bc9e7595f0d5e5')).toBe(false);
    });
  });

  describe('roleMatches', () => {
    it('should match when role is in context', () => {
      const ctx = { roles: ['MANUFACTURER', 'DISTRIBUTOR'] } as any;
      expect(roleMatches(ctx, 'MANUFACTURER')).toBe(true);
      expect(roleMatches(ctx, 'DISTRIBUTOR')).toBe(true);
    });

    it('should not match when role is not in context', () => {
      const ctx = { roles: ['MANUFACTURER'] } as any;
      expect(roleMatches(ctx, 'DISTRIBUTOR')).toBe(false);
    });

    it('should be case insensitive', () => {
      const ctx = { roles: ['MANUFACTURER'] } as any;
      expect(roleMatches(ctx, 'manufacturer')).toBe(true);
    });
  });

  describe('productVisibleTo', () => {
    const adminCtx = { scope: 'all', isAuthenticated: true } as any;
    const userCtx = { scope: 'mine', isAuthenticated: true, address: '0x1234' } as any;
    const unauthCtx = { scope: 'mine', isAuthenticated: false } as any;

    it('should return true for scope=all', () => {
      expect(productVisibleTo({ serialId: '123' }, adminCtx)).toBe(true);
    });

    it('should return false for archived products', () => {
      expect(productVisibleTo({ archivedAt: Date.now() }, userCtx)).toBe(false);
      expect(productVisibleTo({ status: 'ARCHIVED' }, userCtx)).toBe(false);
      expect(productVisibleTo({ status: 'INVALID' }, userCtx)).toBe(false);
    });

    it('should return false for unauthenticated user with scope=mine', () => {
      expect(productVisibleTo({ currentOwner: '0x1234' }, unauthCtx)).toBe(false);
    });

    it('should return true when user is current owner', () => {
      const product = { currentOwner: '0x1234' };
      expect(productVisibleTo(product, userCtx)).toBe(true);
    });

    it('should return true when user is latest transfer to address', () => {
      const product = { latestTransferToAddress: '0x1234' };
      expect(productVisibleTo(product, userCtx)).toBe(true);
    });

    it('should return true when user is pending transfer to address', () => {
      const product = { pendingTransferToAddress: '0x1234' };
      expect(productVisibleTo(product, userCtx)).toBe(true);
    });
  });

  describe('transferVisibleTo', () => {
    const adminCtx = { scope: 'all', isAuthenticated: true } as any;
    const userCtx = { scope: 'mine', isAuthenticated: true, address: '0x1234' } as any;

    it('should return true for scope=all', () => {
      expect(transferVisibleTo({}, adminCtx)).toBe(true);
    });

    it('should return true when user is from or to address', () => {
      expect(transferVisibleTo({ fromAddress: '0x1234' }, userCtx)).toBe(true);
      expect(transferVisibleTo({ toAddress: '0x1234' }, userCtx)).toBe(true);
    });

    it('should return false when user is neither from nor to address', () => {
      expect(transferVisibleTo({ fromAddress: '0x5678', toAddress: '0x9abc' }, userCtx)).toBe(false);
    });
  });

  describe('latestTransferForProduct', () => {
    it('should find latest transfer by confirmedAt', () => {
      const product = { serialId: 'S001' };
      const transfers = [
        { serialId: 'S001', confirmedAt: 1000 },
        { serialId: 'S001', confirmedAt: 2000 },
        { serialId: 'S001', confirmedAt: 500 },
      ];

      const latest = latestTransferForProduct(product, transfers);
      expect(latest?.confirmedAt).toBe(2000);
    });

    it('should find latest transfer by createdAt when no confirmedAt', () => {
      const product = { serialId: 'S001' };
      const transfers = [
        { serialId: 'S001', createdAt: 1000 },
        { serialId: 'S001', createdAt: 3000 },
        { serialId: 'S001', createdAt: 2000 },
      ];

      const latest = latestTransferForProduct(product, transfers);
      expect(latest?.createdAt).toBe(3000);
    });

    it('should match by serialHash', () => {
      const product = { serialHash: 'hash123' };
      const transfers = [
        { serialHash: 'hash123', confirmedAt: 1000 },
        { serialHash: 'hash456', confirmedAt: 2000 },
      ];

      const latest = latestTransferForProduct(product, transfers);
      expect(latest?.serialHash).toBe('hash123');
    });
  });

  describe('inferProductSyncStatus', () => {
    it('should return explicit syncStatus if set', () => {
      expect(inferProductSyncStatus({ syncStatus: 'FIREBASE_ONLY' })).toBe('FIREBASE_ONLY');
      expect(inferProductSyncStatus({ syncStatus: 'CHAIN_ONLY' })).toBe('CHAIN_ONLY');
    });

    it('should return FIREBASE_ONLY if no blockchainTx', () => {
      expect(inferProductSyncStatus({})).toBe('FIREBASE_ONLY');
      expect(inferProductSyncStatus({ blockchainTx: null })).toBe('FIREBASE_ONLY');
    });

    it('should return STALE_PENDING for stale pending transfer', () => {
      const product = { blockchainTx: '0x123' };
      const transfer = { status: 'PENDING' };
      expect(inferProductSyncStatus(product, transfer)).toBe('STALE_PENDING');
    });

    it('should return OK for normal case', () => {
      expect(inferProductSyncStatus({ blockchainTx: '0x123' })).toBe('OK');
    });
  });

  describe('decorateProduct', () => {
    it('should decorate product with transfer info', () => {
      const product = { serialId: 'S001', currentOwner: '0x1234' };
      const transfers = [
        { id: 'T001', serialId: 'S001', status: 'CONFIRMED', toAddress: '0x1234', toLocationName: 'Clinic A' },
      ];

      const decorated = decorateProduct(product, transfers);

      expect(decorated.currentLocationName).toBe('Clinic A');
      expect(decorated.latestTransferId).toBe(transfers[0].id);
    });

    it('should handle pending transfer', () => {
      const product = { serialId: 'S001' };
      const transfers = [
        { id: 'T002', serialId: 'S001', status: 'PENDING', fromLocationName: 'Warehouse A', toAddress: '0x1234' },
      ];

      const decorated = decorateProduct(product, transfers);

      expect(decorated.currentLocationName).toBe('Warehouse A');
      expect(decorated.pendingTransferToAddress).toBe(transfers[0].toAddress);
    });
  });

  describe('decorateBatch', () => {
    it('should count visible serials', () => {
      const batch = { id: 'B001', batchHash: 'hashB' };
      const visibleProducts = [
        { batchId: 'B001' },
        { batchId: 'B001' },
        { batchHash: 'hashB' },
        { batchId: 'B002' },
      ];

      const decorated = decorateBatch(batch, visibleProducts);

      expect(decorated.visibleSerialCount).toBe(3);
      expect(decorated.visibilityScope).toBe('mine');
    });

    it('should set visibilityScope=all for empty visible products', () => {
      const batch = { id: 'B001' };
      const decorated = decorateBatch(batch, []);

      expect(decorated.visibleSerialCount).toBe(0);
      expect(decorated.visibilityScope).toBe('all');
    });
  });

  describe('decorateTransfer', () => {
    it('should add visibilityScope to transfer', () => {
      const transfer = { id: 'T001' };
      const ctx = { scope: 'all' } as any;

      const decorated = decorateTransfer(transfer, ctx);

      expect(decorated.visibilityScope).toBe('all');
    });
  });
});
