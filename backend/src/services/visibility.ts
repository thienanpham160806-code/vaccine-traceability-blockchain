import { Request } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/env';

export type VisibilityScope = 'mine' | 'all';
export type SyncStatus = 'OK' | 'FIREBASE_ONLY' | 'CHAIN_ONLY' | 'OWNER_MISMATCH' | 'STATUS_MISMATCH' | 'STALE_PENDING';

export type VisibilityContext = {
  address: string;
  role: string;
  roles: string[];
  scope: VisibilityScope;
  requestedScope: VisibilityScope;
  isAuthenticated: boolean;
  isPrivilegedViewer: boolean;
};

const PRIVILEGED_VIEWER_ROLES = new Set(['ADMIN', 'AUDITOR', 'RECALL_AUTHORITY']);
const OPERATIONAL_ROLES = new Set(['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'CLINIC', 'PHARMACY']);

function normalizeAddress(address?: string): string {
  return String(address || '').trim().toLowerCase();
}

function normalizeRole(role?: string): string {
  return String(role || '').trim().toUpperCase();
}

function parseRequestedScope(value: unknown): VisibilityScope {
  return String(value || '').toLowerCase() === 'all' ? 'all' : 'mine';
}

function readJwt(req: Request): any | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    return jwt.verify(authHeader.substring(7), config.jwtSecret) as any;
  } catch {
    return null;
  }
}

export function getVisibilityContext(req: Request): VisibilityContext {
  const decoded = readJwt(req);
  const role = normalizeRole(decoded?.role);
  const roles: string[] = Array.isArray(decoded?.roles)
    ? decoded.roles.map((item: unknown) => normalizeRole(String(item))).filter(Boolean)
    : role
      ? [role]
      : [];
  const uniqueRoles: string[] = Array.from(new Set<string>(roles));
  const isPrivilegedViewer = uniqueRoles.some((item) => PRIVILEGED_VIEWER_ROLES.has(item));
  const requestedScope = parseRequestedScope(req.query.scope);

  return {
    address: normalizeAddress(decoded?.address),
    role,
    roles: uniqueRoles,
    requestedScope,
    scope: requestedScope === 'all' && isPrivilegedViewer ? 'all' : 'mine',
    isAuthenticated: Boolean(decoded?.address && uniqueRoles.length),
    isPrivilegedViewer,
  };
}

export function canViewAll(ctx: VisibilityContext): boolean {
  return ctx.isPrivilegedViewer;
}

export function isOperationalRole(role?: string): boolean {
  return OPERATIONAL_ROLES.has(normalizeRole(role));
}

export function isAddressMatch(left?: string, right?: string): boolean {
  return normalizeAddress(left) !== '' && normalizeAddress(left) === normalizeAddress(right);
}

export function roleMatches(ctx: VisibilityContext, role?: string): boolean {
  const normalized = normalizeRole(role);
  return Boolean(normalized && ctx.roles.includes(normalized));
}

export function productVisibleTo(product: any, ctx: VisibilityContext): boolean {
  if (product?.archivedAt || ['ARCHIVED', 'INVALID'].includes(String(product?.status || '').toUpperCase())) return false;
  if (ctx.scope === 'all') return true;
  if (!ctx.isAuthenticated) return false;

  return (
    isAddressMatch(product?.currentOwner, ctx.address) ||
    isAddressMatch(product?.latestTransferFromAddress, ctx.address) ||
    isAddressMatch(product?.latestTransferToAddress, ctx.address) ||
    isAddressMatch(product?.pendingTransferToAddress, ctx.address)
  );
}

export function transferVisibleTo(transfer: any, ctx: VisibilityContext): boolean {
  if (ctx.scope === 'all') return true;
  if (!ctx.isAuthenticated) return false;

  return (
    isAddressMatch(transfer?.fromAddress, ctx.address) ||
    isAddressMatch(transfer?.toAddress, ctx.address)
  );
}

export function riskVisibleTo(risk: any, ctx: VisibilityContext, productBySerial = new Map<string, any>()): boolean {
  if (ctx.scope === 'all') return true;
  if (!ctx.isAuthenticated) return false;

  const product =
    productBySerial.get(String(risk?.serialId || '')) ||
    productBySerial.get(String(risk?.serialHash || ''));
  return product ? productVisibleTo(product, ctx) : false;
}

export function recallVisibleTo(recall: any, ctx: VisibilityContext, products: any[] = []): boolean {
  if (ctx.scope === 'all') return true;
  if (!ctx.isAuthenticated) return false;

  const batchHash = String(recall?.batchHash || recall?.id || '');
  const serials = new Set((recall?.serials || []).map(String));
  return products.some((product) => {
    const sameBatch = [product?.batchHash, product?.batchId].filter(Boolean).map(String).includes(batchHash);
    const sameSerial = serials.has(String(product?.serialId || '')) || serials.has(String(product?.serialHash || ''));
    return (sameBatch || sameSerial) && productVisibleTo(product, ctx);
  });
}

export function latestTransferForProduct(product: any, transfers: any[]): any | null {
  const serialKeys = new Set([product?.serialId, product?.serialHash].filter(Boolean).map(String));
  let latest: any | null = null;
  let latestTimestamp = 0;

  for (const transfer of transfers) {
    if (!serialKeys.has(String(transfer?.serialId || '')) && !serialKeys.has(String(transfer?.serialHash || ''))) continue;
    const timestamp = transfer?.confirmedAt || transfer?.rejectedAt || transfer?.returnedAt || transfer?.updatedAt || transfer?.createdAt || 0;
    if (!latest || timestamp >= latestTimestamp) {
      latest = transfer;
      latestTimestamp = timestamp;
    }
  }

  return latest;
}

export function inferProductSyncStatus(product: any, latestTransfer?: any | null): SyncStatus {
  const explicit = String(product?.syncStatus || '').toUpperCase();
  if (explicit) return explicit as SyncStatus;
  if (!product?.blockchainTx) return 'FIREBASE_ONLY';
  if (latestTransfer?.status === 'PENDING' && product?.status !== 'IN_TRANSIT') return 'STALE_PENDING';
  return 'OK';
}

export function decorateProduct(product: any, transfers: any[] = []) {
  const latestTransfer = latestTransferForProduct(product, transfers);
  const currentLocationName =
    latestTransfer?.status === 'CONFIRMED'
      ? latestTransfer?.toLocationName || latestTransfer?.toWarehouseName
      : latestTransfer?.status === 'PENDING'
        ? latestTransfer?.fromLocationName || latestTransfer?.fromWarehouseName
        : product?.currentLocationName;
  const currentWarehouseName =
    latestTransfer?.status === 'CONFIRMED'
      ? latestTransfer?.toWarehouseName
      : latestTransfer?.status === 'PENDING'
        ? latestTransfer?.fromWarehouseName
        : product?.currentWarehouseName;

  return {
    ...product,
    currentLocationName: currentLocationName || null,
    currentWarehouseName: currentWarehouseName || null,
    latestTransferId: latestTransfer?.id || null,
    latestTransferFromAddress: latestTransfer?.fromAddress || null,
    latestTransferToAddress: latestTransfer?.toAddress || null,
    pendingTransferToAddress: latestTransfer?.status === 'PENDING' ? latestTransfer?.toAddress || null : null,
    syncStatus: inferProductSyncStatus(product, latestTransfer),
  };
}

export function batchVisibleTo(batch: any, visibleProducts: any[]): boolean {
  const batchKeys = new Set([batch?.id, batch?.batchHash, batch?.batchQR].filter(Boolean).map((value) => String(value).toLowerCase()));
  return visibleProducts.some((product) =>
    [product?.batchId, product?.batchHash].filter(Boolean).some((value) => batchKeys.has(String(value).toLowerCase()))
  );
}

export function decorateBatch(batch: any, visibleProducts: any[]) {
  const batchKeys = new Set([batch?.id, batch?.batchHash, batch?.batchQR].filter(Boolean).map((value) => String(value).toLowerCase()));
  const visibleSerialCount = visibleProducts.filter((product) =>
    [product?.batchId, product?.batchHash].filter(Boolean).some((value) => batchKeys.has(String(value).toLowerCase()))
  ).length;

  return {
    ...batch,
    visibleSerialCount,
    visibilityScope: visibleSerialCount > 0 ? 'mine' : 'all',
  };
}

export function decorateTransfer(transfer: any, ctx: VisibilityContext) {
  return {
    ...transfer,
    visibilityScope: ctx.scope,
  };
}
