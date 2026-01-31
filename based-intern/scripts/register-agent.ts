import { ethers, network } from "hardhat";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Erc8004DeploymentJson = {
  identityRegistry?: string;
  agentId?: string; // uint256 as decimal string
  agentUri?: string;
};

type DeploymentJson = {
  token?: string;
  deployer?: string;
  chainId?: number;
  timestamp?: string;
  erc8004?: Erc8004DeploymentJson;
};

function deploymentFileName(hardhatNetworkName: string): string {
  if (hardhatNetworkName === "baseSepolia") return "baseSepolia.json";
  if (hardhatNetworkName === "base") return "base.json";
  return `${hardhatNetworkName}.json`;
}

function resolveDeploymentsPath(hardhatNetworkName: string): string {
  const override = process.env.DEPLOYMENTS_FILE?.trim();
  if (override) return path.resolve(process.cwd(), override);
  return path.join(process.cwd(), "deployments", deploymentFileName(hardhatNetworkName));
}

async function readExisting(filePath: string): Promise<DeploymentJson> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as DeploymentJson;
  } catch {
    return {};
  }
}

function parseExtraArgs(): string[] {
  const sep = process.argv.indexOf("--");
  return sep >= 0 ? process.argv.slice(sep + 1) : [];
}

function pickAgentUri(): string {
  if (process.env.ERC8004_AGENT_URI && process.env.ERC8004_AGENT_URI.trim()) {
    return process.env.ERC8004_AGENT_URI.trim();
  }
  const extra = parseExtraArgs();
  if (extra[0] && extra[0].trim()) return extra[0].trim();
  throw new Error("Missing agentURI. Provide ERC8004_AGENT_URI or pass it as an extra arg: hardhat run ... -- <agentURI>");
}

async function resolveIdentityRegistryAddress(deploymentsPath: string): Promise<string> {
  if (process.env.ERC8004_IDENTITY_REGISTRY && process.env.ERC8004_IDENTITY_REGISTRY.trim()) {
    return process.env.ERC8004_IDENTITY_REGISTRY.trim();
  }
  const prev = await readExisting(deploymentsPath);
  const fromJson = prev.erc8004?.identityRegistry;
  if (fromJson && fromJson.trim()) return fromJson.trim();
  throw new Error("Missing identity registry address. Set ERC8004_IDENTITY_REGISTRY or run deploy-erc8004.ts first.");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  const deploymentsPath = resolveDeploymentsPath(network.name);
  await mkdir(path.dirname(deploymentsPath), { recursive: true });

  const identityRegistryAddress = await resolveIdentityRegistryAddress(deploymentsPath);
  const agentURI = pickAgentUri();

  const identityRegistry = await ethers.getContractAt("ERC8004IdentityRegistry", identityRegistryAddress);

  // Ethers v6 requires explicit overload selection when a contract has both
  // register() and register(string) in the ABI.
  const tx = await identityRegistry["register(string)"](agentURI);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("no receipt");

  let agentId: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== identityRegistryAddress.toLowerCase()) continue;
    try {
      const parsed = identityRegistry.interface.parseLog(log);
      if (parsed?.name === "Registered") {
        agentId = parsed.args.agentId as bigint;
        break;
      }
    } catch {
      // ignore unparseable logs
    }
  }

  if (agentId === null) {
    throw new Error("Failed to find Registered event in tx logs");
  }

  console.log("registered agentId:", agentId.toString());
  console.log("agentURI:", agentURI);
  console.log("owner:", deployer.address);
  console.log("chainId:", Number(chainId));
  console.log("identityRegistry:", identityRegistryAddress);

  const prev = await readExisting(deploymentsPath);

  const out: DeploymentJson = {
    ...prev,
    deployer: deployer.address,
    chainId: Number(chainId),
    timestamp: new Date().toISOString(),
    erc8004: {
      ...(prev.erc8004 ?? {}),
      identityRegistry: identityRegistryAddress,
      agentId: agentId.toString(),
      agentUri: agentURI
    }
  };

  await writeFile(deploymentsPath, JSON.stringify(out, null, 2), "utf8");
  console.log("saved deployment:", deploymentsPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
