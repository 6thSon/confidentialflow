/*
 * @file ConfidentialPaymentGate.test.ts
 * @description Tests for ConfidentialPaymentGate.
 *              Covers: deposit, routePayment (all three modes), sanction
 *              filtering, balance-insufficient silencing, admin controls,
 *              and ACL correctness.
 */
import { expect } from "chai";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { ethers } from "hardhat";
import hre from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { Signer } from "ethers";
import type {
    ConfidentialPaymentGate,
    ConfidentialYieldVault,
    ConfidentialVestingModule,
    FlowRegistry,
} from "../typechain-types";

describe("ConfidentialPaymentGate", function () {
    let gate: ConfidentialPaymentGate;
    let vault: ConfidentialYieldVault;
    let vesting: ConfidentialVestingModule;
    let registry: FlowRegistry;
    let mockCUSDT: any;

    let admin: Signer;
    let alice: Signer;
    let bob: Signer;
    let carol: Signer;

    const DEPOSIT_AMOUNT = 10_000n;

    async function deployAll() {
        [admin, alice, bob, carol] = await ethers.getSigners();

        /* Mock ERC-7984 token */
        const TokenFactory = await ethers.getContractFactory("MockERC7984");
        mockCUSDT = await TokenFactory.deploy();
        await mockCUSDT.waitForDeployment();

        /* FlowRegistry */
        const RegistryFactory = await ethers.getContractFactory("FlowRegistry");
        registry = (await RegistryFactory.deploy()) as FlowRegistry;
        await registry.waitForDeployment();

        /* Gate */
        const GateFactory = await ethers.getContractFactory("ConfidentialPaymentGate");
        gate = (await GateFactory.deploy(
            await mockCUSDT.getAddress(),
            await registry.getAddress()
        )) as ConfidentialPaymentGate;
        await gate.waitForDeployment();

        /* Vault */
        const VaultFactory = await ethers.getContractFactory("ConfidentialYieldVault");
        vault = (await VaultFactory.deploy(
            await gate.getAddress(),
            await mockCUSDT.getAddress()
        )) as ConfidentialYieldVault;
        await vault.waitForDeployment();

        /* Vesting */
        const VestFactory = await ethers.getContractFactory("ConfidentialVestingModule");
        vesting = (await VestFactory.deploy(
            await gate.getAddress(),
            await mockCUSDT.getAddress()
        )) as ConfidentialVestingModule;
        await vesting.waitForDeployment();

        /* Wire modules */
        await gate.setModules(
            await vault.getAddress(),
            await vesting.getAddress()
        );

        /* Mint tokens to alice so she can deposit */
        const mintInput = hre.fhevm.createEncryptedInput(
            await mockCUSDT.getAddress(),
            await admin.getAddress()
        );
        mintInput.add64(DEPOSIT_AMOUNT);
        const { handles, inputProof } = await mintInput.encrypt();
        await mockCUSDT.connect(admin).mintEncrypted(
            await alice.getAddress(),
            handles[0],
            inputProof
        );

        /* Alice sets gate as operator */
        await mockCUSDT.connect(alice).setOperator(
            await gate.getAddress(),
            BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600)
        );
    }

    async function aliceDeposits(amount: bigint = DEPOSIT_AMOUNT) {
        const gateAddr  = await gate.getAddress();
        const aliceAddr = await alice.getAddress();
        const input = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        input.add64(amount);
        const { handles, inputProof } = await input.encrypt();
        return gate.connect(alice).deposit(handles[0], inputProof);
    }

    beforeEach(deployAll);

    /* ------------------------------------------------------------------
     * Test 1: deposit emits Deposited and sets hasBalance
     * ------------------------------------------------------------------ */
    it("deposit emits Deposited and sets hasBalance", async function () {
        const aliceAddr = await alice.getAddress();
        await expect(aliceDeposits())
            .to.emit(gate, "Deposited")
            .withArgs(aliceAddr, anyValue);

        expect(await gate.hasBalance(aliceAddr)).to.be.true;
    });

    /* ------------------------------------------------------------------
     * Test 2: routePayment mode 0 (liquid) emits PaymentRouted
     * ------------------------------------------------------------------ */
    it("routePayment mode 0 emits PaymentRouted with correct args", async function () {
        await aliceDeposits();

        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const gateAddr  = await gate.getAddress();

        const input = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        input.add64(500n);
        const { handles, inputProof } = await input.encrypt();

        await expect(
            gate.connect(alice).routePayment(bobAddr, handles[0], inputProof, 0)
        ).to.emit(gate, "PaymentRouted").withArgs(aliceAddr, bobAddr, 0, anyValue);
    });

    /* ------------------------------------------------------------------
     * Test 3: routePayment mode 1 (yield) deposits to vault
     * ------------------------------------------------------------------ */
    it("routePayment mode 1 triggers vault deposit", async function () {
        await aliceDeposits();

        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const gateAddr  = await gate.getAddress();

        const input = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        input.add64(1_000n);
        const { handles, inputProof } = await input.encrypt();

        await expect(
            gate.connect(alice).routePayment(bobAddr, handles[0], inputProof, 1)
        ).to.emit(vault, "Deposited").withArgs(bobAddr, anyValue);

        expect(await vault.hasDeposit(bobAddr)).to.be.true;
    });

    /* ------------------------------------------------------------------
     * Test 4: routePayment mode 2 (vesting) creates vesting schedule
     * ------------------------------------------------------------------ */
    it("routePayment mode 2 creates a vesting schedule for recipient", async function () {
        await aliceDeposits();

        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const gateAddr  = await gate.getAddress();

        const input = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        input.add64(2_000n);
        const { handles, inputProof } = await input.encrypt();

        await expect(
            gate.connect(alice).routePayment(bobAddr, handles[0], inputProof, 2)
        ).to.emit(vesting, "VestingCreated");

        expect(await vesting.hasSchedule(bobAddr)).to.be.true;
    });

    /* ------------------------------------------------------------------
     * Test 5: sanctioned sender route is silently zeroed (no revert)
     * ------------------------------------------------------------------ */
    it("sanctioned sender payment succeeds but routes 0 (no revert)", async function () {
        await aliceDeposits();

        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const gateAddr  = await gate.getAddress();

        await gate.connect(admin).setSanctioned(aliceAddr, true);

        const input = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        input.add64(1_000n);
        const { handles, inputProof } = await input.encrypt();

        await expect(
            gate.connect(alice).routePayment(bobAddr, handles[0], inputProof, 0)
        ).to.emit(gate, "PaymentRouted");

        const balHandle = await mockCUSDT.balanceOf(bobAddr) as `0x${string}`;
        const bobBal = await hre.fhevm.userDecryptEuint(
            FhevmType.euint64, balHandle, await mockCUSDT.getAddress(), bob
        );
        expect(bobBal).to.equal(0n);
    });

    /* ------------------------------------------------------------------
     * Test 6: routing > gate balance silently routes 0
     * ------------------------------------------------------------------ */
    it("over-limit payment routes 0 without revert", async function () {
        await aliceDeposits(1_000n);

        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const gateAddr  = await gate.getAddress();

        const input = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        input.add64(5_000n);
        const { handles, inputProof } = await input.encrypt();

        await expect(
            gate.connect(alice).routePayment(bobAddr, handles[0], inputProof, 0)
        ).to.emit(gate, "PaymentRouted");

        const balHandle = await mockCUSDT.balanceOf(bobAddr) as `0x${string}`;
        const bobBal = await hre.fhevm.userDecryptEuint(
            FhevmType.euint64, balHandle, await mockCUSDT.getAddress(), bob
        );
        expect(bobBal).to.equal(0n);
    });

    /* ------------------------------------------------------------------
     * Test 7: admin can set and clear sanction
     * ------------------------------------------------------------------ */
    it("admin can sanction and unsanction a user", async function () {
        const aliceAddr = await alice.getAddress();

        await gate.connect(admin).setSanctioned(aliceAddr, true);
        expect(await gate.sanctioned(aliceAddr)).to.be.true;

        await gate.connect(admin).setSanctioned(aliceAddr, false);
        expect(await gate.sanctioned(aliceAddr)).to.be.false;
    });

    /* ------------------------------------------------------------------
     * Test 8: non-admin cannot setSanctioned
     * ------------------------------------------------------------------ */
    it("reverts when non-admin tries to setSanctioned", async function () {
        const carolAddr = await carol.getAddress();
        await expect(
            gate.connect(carol).setSanctioned(carolAddr, true)
        ).to.be.revertedWith("ConfidentialPaymentGate: caller is not admin");
    });

    /* ------------------------------------------------------------------
     * Test 9: transferAdmin hands over control
     * ------------------------------------------------------------------ */
    it("transferAdmin hands admin role to new address", async function () {
        const carolAddr = await carol.getAddress();
        await gate.connect(admin).transferAdmin(carolAddr);
        expect(await gate.admin()).to.equal(carolAddr);

        await expect(
            gate.connect(admin).setSanctioned(carolAddr, true)
        ).to.be.revertedWith("ConfidentialPaymentGate: caller is not admin");
    });

    /* ------------------------------------------------------------------
     * Test 10: routePayment reverts with invalid mode
     * ------------------------------------------------------------------ */
    it("reverts routePayment with mode > 2", async function () {
        await aliceDeposits();

        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const gateAddr  = await gate.getAddress();

        const input = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        input.add64(100n);
        const { handles, inputProof } = await input.encrypt();

        await expect(
            gate.connect(alice).routePayment(bobAddr, handles[0], inputProof, 3)
        ).to.be.revertedWith("ConfidentialPaymentGate: invalid mode");
    });

    /* ------------------------------------------------------------------
     * Test 11: routePayment reverts without prior deposit
     * ------------------------------------------------------------------ */
    it("reverts routePayment when caller has no gate deposit", async function () {
        const carolAddr = await carol.getAddress();
        const gateAddr  = await gate.getAddress();

        const input = hre.fhevm.createEncryptedInput(gateAddr, carolAddr);
        input.add64(100n);
        const { handles, inputProof } = await input.encrypt();

        await expect(
            gate.connect(carol).routePayment(carolAddr, handles[0], inputProof, 0)
        ).to.be.revertedWith("ConfidentialPaymentGate: no deposit");
    });

    /* ------------------------------------------------------------------
     * Test 12: deposit accumulates correctly on repeat deposits
     * ------------------------------------------------------------------ */
    it("accumulates gate balance across multiple deposits", async function () {
        const aliceAddr = await alice.getAddress();

        /* Mint more tokens for alice */
        const mintInput = hre.fhevm.createEncryptedInput(
            await mockCUSDT.getAddress(),
            await admin.getAddress()
        );
        mintInput.add64(DEPOSIT_AMOUNT);
        const { handles: mh, inputProof: mip } = await mintInput.encrypt();
        await mockCUSDT.connect(admin).mintEncrypted(aliceAddr, mh[0], mip);

        await aliceDeposits(5_000n);
        await aliceDeposits(3_000n);

        const gateBalHandle = await gate.getBalance(aliceAddr) as `0x${string}`;
        const gateBal = await hre.fhevm.userDecryptEuint(
            FhevmType.euint64, gateBalHandle, await gate.getAddress(), alice
        );
        expect(gateBal).to.equal(8_000n);
    });

    /* ------------------------------------------------------------------
     * Test 13: createPaymentIntent stores intent and emits event
     * ------------------------------------------------------------------ */
    it("createPaymentIntent stores intent data and emits PaymentIntentCreated", async function () {
        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const gateAddr  = await gate.getAddress();

        const expiresAt = BigInt(Math.floor(Date.now() / 1000)) + 86400n; // 24 h

        const intentInput = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        intentInput.add64(500n);
        const { handles, inputProof } = await intentInput.encrypt();

        const tx = await gate.connect(alice).createPaymentIntent(
            bobAddr, handles[0], inputProof, 0, expiresAt
        );

        /* Verify event */
        await expect(Promise.resolve(tx))
            .to.emit(gate, "PaymentIntentCreated")
            .withArgs(anyValue, aliceAddr, bobAddr, 0, expiresAt);

        /* Extract intentId and verify storage */
        const receipt = await tx.wait();
        const iface   = gate.interface;
        const parsed  = receipt!.logs
            .map(l => { try { return iface.parseLog(l); } catch { return null; } })
            .find(e => e?.name === "PaymentIntentCreated");

        expect(parsed).to.not.be.null;
        const intentId = parsed!.args.intentId as string;

        const intent = await gate.intents(intentId);
        expect(intent.from).to.equal(aliceAddr);
        expect(intent.to).to.equal(bobAddr);
        expect(intent.routingMode).to.equal(0);
        expect(intent.expiresAt).to.equal(expiresAt);
        expect(intent.executed).to.be.false;
        expect(intent.cancelled).to.be.false;
    });

    /* ------------------------------------------------------------------
     * Test 14: intent creator can execute intent (liquid mode)
     * ------------------------------------------------------------------ */
    it("intent creator can execute intent and PaymentIntentSettled is emitted", async function () {
        await aliceDeposits();

        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const gateAddr  = await gate.getAddress();

        const expiresAt = BigInt(Math.floor(Date.now() / 1000)) + 86400n;

        const intentInput = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        intentInput.add64(500n);
        const { handles, inputProof } = await intentInput.encrypt();

        const createTx = await gate.connect(alice).createPaymentIntent(
            bobAddr, handles[0], inputProof, 0, expiresAt
        );
        const receipt = await createTx.wait();
        const iface   = gate.interface;
        const parsed  = receipt!.logs
            .map(l => { try { return iface.parseLog(l); } catch { return null; } })
            .find(e => e?.name === "PaymentIntentCreated");
        const intentId = parsed!.args.intentId as string;

        /* Creator executes */
        await expect(gate.connect(alice).executeIntent(intentId))
            .to.emit(gate, "PaymentIntentSettled")
            .withArgs(intentId, anyValue);

        /* Intent marked executed */
        const intent = await gate.intents(intentId);
        expect(intent.executed).to.be.true;
    });

    /* ------------------------------------------------------------------
     * Test 15: authorized protocol can execute an intent
     * ------------------------------------------------------------------ */
    it("authorized protocol can execute a payment intent", async function () {
        await aliceDeposits();

        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const carolAddr = await carol.getAddress();
        const gateAddr  = await gate.getAddress();

        /* Register carol as a protocol */
        await gate.connect(admin).registerProtocol(carolAddr, "TestProtocol");

        const expiresAt = BigInt(Math.floor(Date.now() / 1000)) + 86400n;

        const intentInput = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        intentInput.add64(500n);
        const { handles, inputProof } = await intentInput.encrypt();

        const createTx = await gate.connect(alice).createPaymentIntent(
            bobAddr, handles[0], inputProof, 0, expiresAt
        );
        const receipt = await createTx.wait();
        const iface   = gate.interface;
        const parsed  = receipt!.logs
            .map(l => { try { return iface.parseLog(l); } catch { return null; } })
            .find(e => e?.name === "PaymentIntentCreated");
        const intentId = parsed!.args.intentId as string;

        /* Authorized protocol executes */
        await expect(gate.connect(carol).executeIntent(intentId))
            .to.emit(gate, "PaymentIntentSettled")
            .withArgs(intentId, anyValue);
    });

    /* ------------------------------------------------------------------
     * Test 16: executeIntent reverts when intent is expired
     * ------------------------------------------------------------------ */
    it("reverts executeIntent when intent is past expiry", async function () {
        await aliceDeposits();

        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const gateAddr  = await gate.getAddress();

        /* Use actual chain timestamp (may differ from wall clock after prior evm_increaseTime calls) */
        const latestBlock = await ethers.provider.getBlock("latest");
        const expiresAt   = BigInt(latestBlock!.timestamp) + 30n;

        const intentInput = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        intentInput.add64(100n);
        const { handles, inputProof } = await intentInput.encrypt();

        const createTx = await gate.connect(alice).createPaymentIntent(
            bobAddr, handles[0], inputProof, 0, expiresAt
        );
        const receipt = await createTx.wait();
        const iface   = gate.interface;
        const parsed  = receipt!.logs
            .map(l => { try { return iface.parseLog(l); } catch { return null; } })
            .find(e => e?.name === "PaymentIntentCreated");
        const intentId = parsed!.args.intentId as string;

        /* Advance EVM time well past expiry */
        await (hre as any).network.provider.send("evm_increaseTime", [120]);
        await (hre as any).network.provider.send("evm_mine", []);

        await expect(gate.connect(alice).executeIntent(intentId))
            .to.be.revertedWith("ConfidentialPaymentGate: intent expired");
    });

    /* ------------------------------------------------------------------
     * Test 17: executeIntent reverts when already executed
     * ------------------------------------------------------------------ */
    it("reverts executeIntent when intent is already executed", async function () {
        await aliceDeposits();

        const aliceAddr = await alice.getAddress();
        const bobAddr   = await bob.getAddress();
        const gateAddr  = await gate.getAddress();

        const expiresAt = BigInt(Math.floor(Date.now() / 1000)) + 86400n;

        const intentInput = hre.fhevm.createEncryptedInput(gateAddr, aliceAddr);
        intentInput.add64(100n);
        const { handles, inputProof } = await intentInput.encrypt();

        const createTx = await gate.connect(alice).createPaymentIntent(
            bobAddr, handles[0], inputProof, 0, expiresAt
        );
        const receipt = await createTx.wait();
        const iface   = gate.interface;
        const parsed  = receipt!.logs
            .map(l => { try { return iface.parseLog(l); } catch { return null; } })
            .find(e => e?.name === "PaymentIntentCreated");
        const intentId = parsed!.args.intentId as string;

        /* First execution succeeds */
        await gate.connect(alice).executeIntent(intentId);

        /* Second execution must revert */
        await expect(gate.connect(alice).executeIntent(intentId))
            .to.be.revertedWith("ConfidentialPaymentGate: already executed");
    });
});
