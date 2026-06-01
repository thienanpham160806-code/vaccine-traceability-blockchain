import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  // Blockchain
  blockchainRpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545',
  backendPrivateKey: process.env.BACKEND_PRIVATE_KEY || '',
  rolePrivateKeys: {
    admin: process.env.ADMIN_PRIVATE_KEY || process.env.BACKEND_PRIVATE_KEY || '',
    manufacturer: process.env.MANUFACTURER_PRIVATE_KEY || process.env.BACKEND_PRIVATE_KEY || '',
    importer: process.env.IMPORTER_PRIVATE_KEY || '',
    distributor: process.env.DISTRIBUTOR_PRIVATE_KEY || '',
    clinic: process.env.CLINIC_PRIVATE_KEY || '',
    pharmacy: process.env.PHARMACY_PRIVATE_KEY || '',
    recall_authority: process.env.RECALL_AUTHORITY_PRIVATE_KEY || process.env.BACKEND_PRIVATE_KEY || '',
  },
  productRegistryAddress: process.env.PRODUCT_REGISTRY_ADDRESS || '',
  transferLedgerAddress: process.env.TRANSFER_LEDGER_ADDRESS || '',
  accessControlAddress: process.env.ACCESS_CONTROL_ADDRESS || '',
  importZkpWasmPath: process.env.IMPORT_ZKP_WASM_PATH || '../smart-contract/zkp-artifacts/import-registration/import_registration_js/import_registration.wasm',
  importZkpZkeyPath: process.env.IMPORT_ZKP_ZKEY_PATH || '../smart-contract/zkp-artifacts/import-registration/import_registration_final.zkey',

  // IPFS / Pinata
  pinataJwt: process.env.PINATA_JWT || '',

  // Firebase
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL || '',
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  firebaseClientId: process.env.FIREBASE_CLIENT_ID || '',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'default_secret_key_change_in_production',

  // Hardhat test accounts (for local development only)
  hardhatAccounts: {
    admin: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    manufacturer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    importer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    distributor: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    clinic: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    pharmacy: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    recallAuthority: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
};

// Validate required env vars
const requiredEnvVars = [
  'BLOCKCHAIN_RPC_URL',
  'BACKEND_PRIVATE_KEY',
  'PRODUCT_REGISTRY_ADDRESS',
  'TRANSFER_LEDGER_ADDRESS',
  'ACCESS_CONTROL_ADDRESS',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_DATABASE_URL',
];

const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.warn(`⚠️  Missing environment variables: ${missingVars.join(', ')}`);
  console.warn('⚠️  Some features may not work. Check .env file.');
}

export default config;
