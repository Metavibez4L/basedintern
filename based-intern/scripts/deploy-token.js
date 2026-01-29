"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hardhat_1 = require("hardhat");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
function deploymentFileName(hardhatNetworkName) {
    if (hardhatNetworkName === "baseSepolia")
        return "baseSepolia.json";
    if (hardhatNetworkName === "base")
        return "base.json";
    // fallback: preserve name (e.g. hardhat, localhost)
    return `${hardhatNetworkName}.json`;
}
async function main() {
    const [deployer] = await hardhat_1.ethers.getSigners();
    const { chainId } = await hardhat_1.ethers.provider.getNetwork();
    const Factory = await hardhat_1.ethers.getContractFactory("BasedInternToken");
    const token = await Factory.deploy();
    const deployTx = token.deploymentTransaction();
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    const txHash = deployTx?.hash ?? "unknown";
    console.log("token address:", tokenAddress);
    console.log("deployer address:", deployer.address);
    console.log("chainId:", Number(chainId));
    console.log("tx hash:", txHash);
    const out = {
        token: tokenAddress,
        deployer: deployer.address,
        chainId: Number(chainId),
        timestamp: new Date().toISOString()
    };
    const deploymentsDir = node_path_1.default.join(process.cwd(), "deployments");
    await (0, promises_1.mkdir)(deploymentsDir, { recursive: true });
    const fileName = deploymentFileName(hardhat_1.network.name);
    const filePath = node_path_1.default.join(deploymentsDir, fileName);
    await (0, promises_1.writeFile)(filePath, JSON.stringify(out, null, 2), "utf8");
    console.log("saved deployment:", filePath);
}
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
