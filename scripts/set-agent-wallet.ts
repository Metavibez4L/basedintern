import { ethers, network } from "hardhat";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { TypedDataDomain, TypedDataField } from "ethers";

type Erc8004DeploymentJson = {
  identityRegistry?: string;
  agentId?: string; // uint256 as decimal string
  agentUri?: string;
};

type DeploymentJson = {
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

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing ${name}`);
  return v.trim();
}

async function resolveIdentityRegistryAndAgentId(deploymentsPath: string): Promise<{ identityRegistry: string; agentId: bigint }> {
  const prev = await readExisting(deploymentsPath);

  const identityRegistry = (process.env.ERC8004_IDENTITY_REGISTRY?.trim() || prev.erc8004?.identityRegistry?.trim() || "");
  const agentIdStr = (process.env.ERC8004_AGENT_ID?.trim() || prev.erc8004?.agentId?.trim() || "");

  if (!identityRegistry) throw new Error("Missing identity registry address. Set ERC8004_IDENTITY_REGISTRY or run deploy-erc8004.ts first.");
  if (!agentIdStr) throw new Error("Missing agentId. Set ERC8004_AGENT_ID or run register-agent.ts first.");
  if (!/^\d+$/.test(agentIdStr)) throw new Error(`Invalid ERC8004_AGENT_ID: ${agentIdStr}`);

  return { identityRegistry, agentId: BigInt(agentIdStr) };
}

async function main() {
  const [ownerSigner] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  const deploymentsPath = resolveDeploymentsPath(network.name);
  await mkdir(path.dirname(deploymentsPath), { recursive: true });

  const { identityRegistry, agentId } = await resolveIdentityRegistryAndAgentId(deploymentsPath);

  const newWallet = requireEnv("ERC8004_NEW_WALLET");
  const deadlineSec = process.env.ERC8004_DEADLINE_SEC?.trim();
  const deadline = deadlineSec && /^\d+$/.test(deadlineSec) ? BigInt(deadlineSec) : BigInt(Math.floor(Date.now() / 1000) + 60 * 60);

  const registry = (await ethers.getContractAt(
    "ERC8004IdentityRegistry",
    identityRegistry,
    ownerSigner
  )) as unknown as {
    ownerOf(agentId: bigint): Promise<string>;
    setAgentWallet(agentId: bigint, newWallet: string, deadline: bigint, signature: string): Promise<{
      wait(): Promise<{ hash: string } | null>;
      hash: string;
    }>;
  };
  const owner = await registry.ownerOf(agentId);

  let signature = process.env.ERC8004_WALLET_SIGNATURE?.trim() ?? "";

  const pk = process.env.ERC8004_NEW_WALLET_PRIVATE_KEY?.trim() ?? "";
  if (!signature) {
    const domain: TypedDataDomain = {
      name: "ERC8004IdentityRegistry",
      version: "1",
      chainId: Number(chainId),
      verifyingContract: identityRegistry
    };

    const types: Record<string, TypedDataField[]> = {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" }
      ]
    };

    const message = {
      agentId,
      newWallet,
      owner,
      deadline
    };

    // If binding the agent to the SAME wallet that's executing this script (ownerSigner),
    // we can sign without requiring an additional private key env var.
    const ownerSignerAddress = await ownerSigner.getAddress();
    if (newWallet.toLowerCase() === ownerSignerAddress.toLowerCase()) {
      signature = await ownerSigner.signTypedData(domain, types, message);
    } else {
      if (!pk) {
        throw new Error("Missing signature. Provide ERC8004_WALLET_SIGNATURE or ERC8004_NEW_WALLET_PRIVATE_KEY.");
      }
      const newWalletSigner = new ethers.Wallet(pk, ethers.provider);
      signature = await newWalletSigner.signTypedData(domain, types, message);
    }
  }

  console.log("identityRegistry:", identityRegistry);
  console.log("agentId:", agentId.toString());
  console.log("owner:", owner);
  console.log("newWallet:", newWallet);
  console.log("deadline:", deadline.toString());

  const tx = await registry.setAgentWallet(agentId, newWallet, deadline, signature);
  const receipt = await tx.wait();

  console.log("tx hash:", receipt?.hash ?? tx.hash);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
