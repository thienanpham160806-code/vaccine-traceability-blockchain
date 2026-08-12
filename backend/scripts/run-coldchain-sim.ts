import { coldChainSimService } from '../src/services/coldchainSim';

/**
 * Usage: npm run sim:coldchain -- <legId> [count] [apiBaseUrl]
 * legId must be an already-open cold-chain leg (see cold-chain-legs/{legId}
 * in Firebase, opened by POST /transfers/lot-scan).
 */
async function main() {
  const legId = process.argv[2];
  if (!legId) {
    console.error('Usage: npm run sim:coldchain -- <legId> [count] [apiBaseUrl]');
    process.exitCode = 1;
    return;
  }

  const count = process.argv[3] ? Number(process.argv[3]) : undefined;
  const apiBaseUrl = process.argv[4];

  const result = await coldChainSimService.simulateLegReadings(legId, { count, apiBaseUrl });
  console.log('Simulation complete:', result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    // devicesService writes through firebase-admin, which keeps a realtime
    // websocket connection open — force-exit once we're done instead of
    // hanging until it times out on its own.
    process.exit(process.exitCode || 0);
  });
