import { ethers } from 'ethers';
import { Logger } from '../utils/logger';

const ROLE_NAMES = ['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR', 'CLINIC', 'PHARMACY'];

function roleToBytes32(role: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`${role}_ROLE`));
}

const cache = new Map<string, boolean>();
let loaded = false;

export async function initRouteCache(accessControl: ethers.Contract): Promise<void> {
  if (loaded) return;

  const senders   = ['MANUFACTURER', 'IMPORTER', 'DISTRIBUTOR'];
  const receivers = ['IMPORTER', 'DISTRIBUTOR', 'CLINIC', 'PHARMACY'];

  const checks = senders.flatMap((from) =>
    receivers.map(async (to) => {
      const allowed: boolean = await accessControl.isValidRoute(
        roleToBytes32(from),
        roleToBytes32(to)
      );
      cache.set(`${from}→${to}`, allowed);
    })
  );

  await Promise.all(checks);
  loaded = true;
  Logger.success('✅ Route cache loaded from contract:');
  cache.forEach((v, k) => { if (v) Logger.info(`   ${k}`); });
}

export function isRouteAllowed(fromRole: string, toRole: string): boolean {
  if (!loaded) {
    const key = `${fromRole.toUpperCase()}→${toRole.toUpperCase()}`;
    return cache.get(key) ?? false;
  }
  return cache.get(`${fromRole.toUpperCase()}→${toRole.toUpperCase()}`) ?? false;
}

export function getAllowedReceivers(fromRole: string): string[] {
  return ROLE_NAMES.filter((r) => isRouteAllowed(fromRole, r));
}

export function isRouteCacheReady(): boolean {
  return loaded;
}
