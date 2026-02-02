import { ethers, network } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type DeploymentJson = {
  token: string;
  deployer: string;
  chainId: number;
  timestamp: string;
};

function deploymentFileName(hardhatNetworkName: string): string {
  if (hardhatNetworkName === "baseSepolia") return "baseSepolia.json";
  if (hardhatNetworkName === "base") return "base.json";
  // fallback: preserve name (e.g. hardhat, localhost)
  return `${hardhatNetworkName}.json`;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  const Factory = await ethers.getContractFactory("BasedInternToken");
  const token = await Factory.deploy();
  const deployTx = token.deploymentTransaction();
  await token.waitForDeployment();

  const tokenAddress = await token.getAddress();
  const txHash = deployTx?.hash ?? "unknown";

  console.log("token address:", tokenAddress);
  console.log("deployer address:", deployer.address);
  console.log("chainId:", Number(chainId));
  console.log("tx hash:", txHash);

  const out: DeploymentJson = {
    token: tokenAddress,
    deployer: deployer.address,
    chainId: Number(chainId),
    timestamp: new Date().toISOString()
  };

  const deploymentsDir = path.join(process.cwd(), "deployments");
  await mkdir(deploymentsDir, { recursive: true });

  const fileName = deploymentFileName(network.name);
  const filePath = path.join(deploymentsDir, fileName);

  await writeFile(filePath, JSON.stringify(out, null, 2), "utf8");
  console.log("saved deployment:", filePath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

