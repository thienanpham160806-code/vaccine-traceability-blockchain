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

  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
    },
  },
};

export default config;
