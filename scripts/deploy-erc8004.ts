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

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  const Factory = await ethers.getContractFactory("ERC8004IdentityRegistry");
  const identityRegistry = await Factory.deploy();
  const deployTx = identityRegistry.deploymentTransaction();
  await identityRegistry.waitForDeployment();

  const identityRegistryAddress = await identityRegistry.getAddress();
  const txHash = deployTx?.hash ?? "unknown";

  console.log("identityRegistry:", identityRegistryAddress);
  console.log("deployer:", deployer.address);
  console.log("chainId:", Number(chainId));
  console.log("tx hash:", txHash);

  const filePath = resolveDeploymentsPath(network.name);
  await mkdir(path.dirname(filePath), { recursive: true });

  const prev = await readExisting(filePath);

  const out: DeploymentJson = {
    ...prev,
    deployer: deployer.address,
    chainId: Number(chainId),
    timestamp: new Date().toISOString(),
    erc8004: {
      ...(prev.erc8004 ?? {}),
      identityRegistry: identityRegistryAddress
    }
  };

  await writeFile(filePath, JSON.stringify(out, null, 2), "utf8");
  console.log("saved deployment:", filePath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
