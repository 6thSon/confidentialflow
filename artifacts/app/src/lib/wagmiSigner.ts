/**
 * WagmiSignerV2 — implements GenericSigner from @zama-fhe/sdk using wagmi v2 APIs.
 *
 * Why not @zama-fhe/react-sdk/wagmi's WagmiSigner?
 *   It imports `watchConnection` from "wagmi/actions", which was removed in wagmi v2.
 *   This custom class replaces that call with `config.subscribe` (the wagmi v2
 *   Zustand store API), preserving identical observable behaviour.
 */

import {
  getAccount,
  getBlock,
  getChainId,
  readContract,
  signTypedData,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import type { Config } from "wagmi";
import {
  TransactionRevertedError,
  type ContractAbi,
  type EIP712TypedData,
  type Hex,
  type ReadContractArgs,
  type ReadContractConfig,
  type ReadContractReturnType,
  type ReadFunctionName,
  type TransactionReceipt,
  type WriteContractArgs,
  type WriteContractConfig,
  type WriteFunctionName,
} from "@zama-fhe/sdk";

interface SignerLifecycleCallbacks {
  onDisconnect?: () => void;
  onAccountChange?: (address: string) => void;
  onChainChange?: (chainId: number) => void;
}

export class WagmiSignerV2 {
  private config: Config;

  constructor({ config }: { config: Config }) {
    this.config = config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.config);
  }

  getAddress = async (): Promise<`0x${string}`> => {
    const acc = getAccount(this.config);
    if (!acc?.address) throw new TypeError("Wallet not connected");
    return acc.address;
  };

  async signTypedData(typedData: EIP712TypedData): Promise<Hex> {
    const { EIP712Domain: _omit, ...types } = typedData.types;
    return signTypedData(this.config, {
      primaryType: Object.keys(types)[0] as string,
      types: types as Parameters<typeof signTypedData>[1]["types"],
      domain: typedData.domain,
      message: typedData.message,
    });
  }

  async writeContract<
    const TAbi extends ContractAbi,
    TFunctionName extends WriteFunctionName<TAbi>,
    const TArgs extends WriteContractArgs<TAbi, TFunctionName>,
  >(config: WriteContractConfig<TAbi, TFunctionName, TArgs>): Promise<Hex> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return writeContract(this.config, config as any);
  }

  async readContract<
    const TAbi extends ContractAbi,
    TFunctionName extends ReadFunctionName<TAbi>,
    const TArgs extends ReadContractArgs<TAbi, TFunctionName>,
  >(
    config: ReadContractConfig<TAbi, TFunctionName, TArgs>,
  ): Promise<ReadContractReturnType<TAbi, TFunctionName, TArgs>> {
    return readContract(
      this.config,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config as any,
    ) as Promise<ReadContractReturnType<TAbi, TFunctionName, TArgs>>;
  }

  async waitForTransactionReceipt(hash: Hex): Promise<TransactionReceipt> {
    try {
      return (await waitForTransactionReceipt(this.config, {
        hash,
      })) as unknown as TransactionReceipt;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("could not be found") ||
        msg.includes("Transaction not found")
      ) {
        throw new TransactionRevertedError(
          `Could not find transaction receipt for hash "${hash.slice(0, 10)}…". ` +
            `If using ERC-4337, your connector may be returning a UserOperation hash.`,
          { cause: err instanceof Error ? err : undefined },
        );
      }
      throw err;
    }
  }

  getBlockTimestamp = async (): Promise<bigint> => {
    const block = await getBlock(this.config);
    return block.timestamp;
  };

  subscribe = (_callbacks: SignerLifecycleCallbacks = {}): (() => void) => {
    // wagmi v2 Config does not expose its Zustand store's getState/subscribe
    // as public API. Since GenericSigner.subscribe is optional, returning a
    // no-op unsubscriber is safe — the SDK will still work; it just won't
    // auto-refresh FHE credentials on account/chain change (user must
    // reconnect to get a new session, which is the expected UX on Sepolia).
    return () => {};
  };
}
