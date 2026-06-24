import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  // Bypass HardhatEthersSigner — use ethers.Wallet directly so gas overrides are honored
  const provider = ethers.provider;
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

  const latestNonce  = await provider.getTransactionCount(wallet.address, 'latest');
  const pendingNonce = await provider.getTransactionCount(wallet.address, 'pending');

  console.log(`Address:          ${wallet.address}`);
  console.log(`Confirmed nonce:  ${latestNonce}`);
  console.log(`Pending nonce:    ${pendingNonce}`);

  if (pendingNonce <= latestNonce) {
    console.log("\nNo pending transactions. Ready to deploy.");
    return;
  }

  console.log(`\nFound ${pendingNonce - latestNonce} pending transaction(s). Cancelling...`);

  const feeData = await provider.getFeeData();
  // 10x current gas price — guaranteed to beat any previously stuck tx
  const highGas = feeData.maxFeePerGas
    ? {
        maxFeePerGas:         feeData.maxFeePerGas * 10n,
        maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas ?? 2_000_000_000n) * 10n,
      }
    : { gasPrice: (feeData.gasPrice ?? 2_000_000_000n) * 10n };

  console.log(`Using maxFeePerGas: ${ethers.formatUnits((highGas as any).maxFeePerGas ?? (highGas as any).gasPrice, 'gwei')} gwei`);

  for (let nonce = latestNonce; nonce < pendingNonce; nonce++) {
    console.log(`\nCancelling nonce ${nonce}...`);
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0n,
      nonce,
      ...highGas,
    });
    console.log(`Cancel tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✓ Nonce ${nonce} cleared (block ${receipt?.blockNumber})`);
  }

  console.log("\nAll pending transactions cancelled. Run deploy now.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
