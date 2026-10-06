import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
      viaIR: true,
    },
  },

  networks: {
    hardhat: {
      chainId: 31337,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined && process.env.PRIVATE_KEY !== ""
          ? [process.env.PRIVATE_KEY]
          : [],
    },
    amoy: {
      url: process.env.AMOY_RPC_URL || "",
      chainId: 80002,
      accounts:
        process.env.PRIVATE_KEY !== undefined && process.env.PRIVATE_KEY !== ""
          ? [process.env.PRIVATE_KEY]
          : [],
    },
  },

  // Enabled with `npm run test:gas`. Offline: reports gas units only, no
  // price API calls, so it runs the same locally and in CI.
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    offline: true,
    noColors: true,
    excludeContracts: ["MockColdChainVerifier", "DemoImportZKPVerifier"],
  },

  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
    },
  },
};

export default config;
