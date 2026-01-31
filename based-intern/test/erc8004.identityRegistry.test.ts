import { expect } from "chai";
import { ethers } from "hardhat";
import type { Log } from "ethers";
import { ERC8004IdentityRegistry__factory } from "../typechain-types/factories/contracts/erc8004/ERC8004IdentityRegistry__factory";

describe("ERC8004IdentityRegistry", () => {
  it("registers an agent and allows setAgentWallet with valid EIP-712 signature", async () => {
    const [owner, newWallet] = await ethers.getSigners();

    const registry = await new ERC8004IdentityRegistry__factory(owner).deploy();
    await registry.waitForDeployment();

    const registryAddr = await registry.getAddress();

    const tx = await registry.connect(owner)["register(string)"]("ipfs://agent");
    const receipt = await tx.wait();
    expect(receipt).to.not.equal(null);

    const log = receipt!.logs
      .filter((l: Log) => l.address?.toLowerCase() === registryAddr.toLowerCase())
      .map((l: Log) => {
        try {
          return registry.interface.parseLog(l as any);
        } catch {
          return null;
        }
      })
      .find((p: any) => p?.name === "Registered");

    expect(log, "Registered event not found").to.not.equal(undefined);

    const agentId = (log as any).args.agentId as bigint;
    expect(await registry.getAgentWallet(agentId)).to.equal(owner.address);

    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp ?? Math.floor(Date.now() / 1000)) + 3600);

    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: "ERC8004IdentityRegistry",
      version: "1",
      chainId: Number(chainId),
      verifyingContract: registryAddr
    };

    const types = {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" }
      ]
    };

    const value = {
      agentId,
      newWallet: newWallet.address,
      owner: owner.address,
      deadline
    };

    const signature = await (newWallet as any).signTypedData(domain, types, value);

    await registry.connect(owner).setAgentWallet(agentId, newWallet.address, deadline, signature);

    expect(await registry.getAgentWallet(agentId)).to.equal(newWallet.address);
  });

  it("reverts setAgentWallet with a bad signature", async () => {
    const [owner, newWallet, wrongSigner] = await ethers.getSigners();

    const registry = await new ERC8004IdentityRegistry__factory(owner).deploy();
    await registry.waitForDeployment();

    const registryAddr = await registry.getAddress();

    const tx = await registry.connect(owner)["register(string)"]("ipfs://agent");
    const receipt = await tx.wait();

    const log = receipt!.logs
      .filter((l: Log) => l.address?.toLowerCase() === registryAddr.toLowerCase())
      .map((l: Log) => {
        try {
          return registry.interface.parseLog(l as any);
        } catch {
          return null;
        }
      })
      .find((p: any) => p?.name === "Registered");

    const agentId = (log as any).args.agentId as bigint;

    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt((latestBlock?.timestamp ?? Math.floor(Date.now() / 1000)) + 3600);

    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: "ERC8004IdentityRegistry",
      version: "1",
      chainId: Number(chainId),
      verifyingContract: registryAddr
    };

    const types = {
      AgentWalletSet: [
        { name: "agentId", type: "uint256" },
        { name: "newWallet", type: "address" },
        { name: "owner", type: "address" },
        { name: "deadline", type: "uint256" }
      ]
    };

    const value = {
      agentId,
      newWallet: newWallet.address,
      owner: owner.address,
      deadline
    };

    const badSignature = await (wrongSigner as any).signTypedData(domain, types, value);

    await expect(
      registry.connect(owner).setAgentWallet(agentId, newWallet.address, deadline, badSignature)
    ).to.be.revertedWith("bad sig");
  });
});
