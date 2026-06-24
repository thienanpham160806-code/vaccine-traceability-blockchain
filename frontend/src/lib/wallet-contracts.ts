import { keccak256, toBytes, zeroHash, type Address, type Hex } from "viem";

export const productRegistryAbi = [
  {
    type: "function",
    name: "registerProduct",
    stateMutability: "nonpayable",
    inputs: [
      { name: "serialID", type: "bytes32" },
      { name: "batchHash", type: "bytes32" },
      { name: "metadataHash", type: "bytes32" },
      { name: "importDocHash", type: "bytes32" },
      { name: "zkpProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "recallBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "batchHash", type: "bytes32" },
      { name: "reasonHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export const transferLedgerAbi = [
  {
    type: "function",
    name: "createTransferRequest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "serialID", type: "bytes32" },
      { name: "receiver", type: "address" },
      { name: "fromLocationHash", type: "bytes32" },
      { name: "toLocationHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "confirmTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "serialID", type: "bytes32" },
      { name: "receiverLocationHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "rejectTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "serialID", type: "bytes32" },
      { name: "reason", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export function getProductRegistryAddress(): Address {
  const address = process.env.NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS;
  if (!address) throw new Error("NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS chưa được cấu hình.");
  return address as Address;
}

export function getTransferLedgerAddress(): Address {
  const address = process.env.NEXT_PUBLIC_TRANSFER_LEDGER_ADDRESS;
  if (!address) throw new Error("NEXT_PUBLIC_TRANSFER_LEDGER_ADDRESS chưa được cấu hình.");
  return address as Address;
}

export function toBytes32(value: string): Hex {
  return /^0x[a-fA-F0-9]{64}$/.test(value) ? (value as Hex) : keccak256(toBytes(value));
}

export function emptyBytes32(): Hex {
  return zeroHash;
}
