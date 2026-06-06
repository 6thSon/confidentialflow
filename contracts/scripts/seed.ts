import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Seeding with:", deployer.address);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const addresses = require("../deployments/sepolia.json");
  const cUSDT = await ethers.getContractAt("MockERC7984", addresses.contracts.cUSDT);

  const AMOUNT = 10_000n; // 10,000 cUSDT (uint64, no decimals in FHE token)
  const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL ?? "";

  console.log("Creating FHE instance via relayer-sdk v0.4 ...");
  // @ts-ignore — relayer-sdk/node TS declarations don't match the runtime export
  const { createInstance, SepoliaConfig } = await import("@zama-fhe/relayer-sdk/node");

  const instance = await createInstance({
    ...SepoliaConfig,
    network: SEPOLIA_RPC,
  });

  console.log("Encrypting", AMOUNT.toString(), "cUSDT for", deployer.address, "...");
  const input = instance.createEncryptedInput(addresses.contracts.cUSDT, deployer.address);
  input.add64(AMOUNT);
  const { handles, inputProof } = await input.encrypt();
  console.log("Encrypted. Submitting mintEncrypted ...");

  const tx = await cUSDT.mintEncrypted(deployer.address, handles[0], inputProof);
  await tx.wait();
  console.log("Minted 10,000 test cUSDT to:", deployer.address);
  console.log("Etherscan:", `https://sepolia.etherscan.io/tx/${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
