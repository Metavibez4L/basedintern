import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

// Load env from project dir first, then fall back to repo-root (.env) if present.
// This avoids confusion when running from `based-intern/` while editing `../.env`.
const localEnvPath = path.join(process.cwd(), ".env");
if (existsSync(localEnvPath)) dotenv.config({ path: localEnvPath });
const repoRootEnvPath = path.resolve(process.cwd(), "..", ".env");
if (existsSync(repoRootEnvPath)) dotenv.config({ path: repoRootEnvPath, override: false });

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
// BaseScan API key used by `hardhat verify` (applies to both Base + Base Sepolia).
// You can create one at https://basescan.org/myapikey
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY ?? process.env.ETHERSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  defaultNetwork: "hardhat",
  networks: {
    baseSepolia: {
      chainId: 84532,
      url: process.env.BASE_SEPOLIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    },
    base: {
      chainId: 8453,
      url: process.env.BASE_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  },
  etherscan: {
    // Etherscan API V2 expects a single key (not per-network keys).
    apiKey: BASESCAN_API_KEY,
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  }
};

export default config;

