/* FHE client-side helpers — @zama-fhe/sdk v3 */

import { createContext, useContext } from "react";
import { RelayerWeb, indexedDBStorage } from "@zama-fhe/sdk";
import { WagmiSignerV2 } from "@/lib/wagmiSigner";
import { wagmiConfig } from "@/lib/wagmi";

/* ------------------------------------------------------------------ */
/*  Chain configuration                                                 */
/* ------------------------------------------------------------------ */

const SEPOLIA_CHAIN_ID = 11155111;
const RELAYER_URL = "https://relayer.zama.ai";

/* ------------------------------------------------------------------ */
/*  Shared ZamaProvider dependencies — created once at module load      */
/*                                                                      */
/*  RelayerWebConfig shape (SDK v3):                                    */
/*    - getChainId: () => Promise<number>  — lazy chain ID resolver     */
/*    - transports: Record<chainId, Partial<FhevmInstanceConfig>>       */
/*      where FhevmInstanceConfig = { relayerUrl, network, ... }       */
/*                                                                      */
/*  RelayerWeb constructor starts WASM init in a Web Worker             */
/*  immediately; .status goes idle → initializing → ready | error.     */
/* ------------------------------------------------------------------ */

export const relayerInstance = new RelayerWeb({
  getChainId: () => Promise.resolve(SEPOLIA_CHAIN_ID),
  transports: {
    [SEPOLIA_CHAIN_ID]: {
      relayerUrl: RELAYER_URL,
      network:
        (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ??
        "https://rpc.sepolia.org",
    },
  },
});

/* WagmiSignerV2: custom signer — see wagmiSigner.ts for why we don't use
   @zama-fhe/react-sdk/wagmi's WagmiSigner (uses removed wagmi v2 API) */
export const zamaSigner = new WagmiSignerV2({ config: wagmiConfig });

/* indexedDBStorage is a pre-built GenericStorage singleton (not a factory) */
export const zamaStorage = indexedDBStorage;

/* ------------------------------------------------------------------ */
/*  Relayer status context                                              */
/*  Provided by RouterWithZama in App.tsx; consumed by Layout.tsx.      */
/*  Maps RelayerSDKStatus ("idle"|"initializing"|"ready"|"error")       */
/*  to the three UI states the dot knows about.                        */
/* ------------------------------------------------------------------ */

export type RelayerStatus = "connecting" | "ready" | "error";
export const RelayerStatusContext = createContext<RelayerStatus>("connecting");
export const useRelayerStatus = () => useContext(RelayerStatusContext);

/* ------------------------------------------------------------------ */
/*  Utilities                                                           */
/* ------------------------------------------------------------------ */

export function formatEncryptedHandle(handle: `0x${string}`): string {
  if (!handle || handle === "0x" + "0".repeat(64)) return "0x0000…0000";
  return handle.slice(0, 10) + "…" + handle.slice(-8);
}
