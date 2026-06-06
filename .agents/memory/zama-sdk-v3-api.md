---
name: Zama SDK v3 API
description: Correct API shapes for @zama-fhe/sdk v3 + @zama-fhe/react-sdk v3; key differences from old relayer-sdk v0.4; WagmiSignerV2 workaround.
---

## RelayerWebConfig (SDK v3 shape)

```ts
new RelayerWeb({
  getChainId: () => Promise.resolve(11155111),        // lazy chain ID resolver
  transports: {
    11155111: {
      relayerUrl: "https://relayer.zama.ai",           // Zama-hosted relayer
      network: "https://rpc.sepolia.org",              // RPC URL
    },
  },
});
```

**NOT** the old relayer-sdk v0.4 shape `{ gatewayUrl, networkUrl }`.

## indexedDBStorage

Pre-built `GenericStorage` singleton — import and use directly:
```ts
import { indexedDBStorage } from "@zama-fhe/sdk";
export const zamaStorage = indexedDBStorage; // NOT indexedDBStorage()
```

## RelayerSDKStatus values

`"idle" | "initializing" | "ready" | "error"` — poll `relayerInstance.status` with `setInterval`.

## useEncrypt() from @zama-fhe/react-sdk

Returns a TanStack mutation. Key types:

- `contractAddress` and `userAddress` params must be `0x${string}` (not plain `string`); TS2322 error points to those param lines inside mutateAsync.
- `result.handles[0]` is typed as `string` in some TS contexts — cast via `as unknown as 0x${string}`.
- `result.inputProof` is **`Uint8Array`**, NOT `0x${string}` — convert with `toHex(result.inputProof)` from viem before ABI-encoding.

## WagmiSignerV2 workaround

**Why:** `@zama-fhe/react-sdk/wagmi` `WagmiSigner` imports `watchConnection` from `wagmi/actions` which was removed in wagmi v2. Causes `SyntaxError: does not provide an export named 'watchConnection'` at runtime.

**Fix:** `src/lib/wagmiSigner.ts` implements `GenericSigner` directly using wagmi v2 actions. The `subscribe()` method returns a no-op (wagmi v2 `Config` doesn't expose its Zustand store as public API; `GenericSigner.subscribe` is optional).

**Why:** `@zama-fhe/react-sdk` main index does NOT import from `./wagmi` subpath — only happens when the `/wagmi` subpath is explicitly imported. Clearing Vite's `.vite/deps` cache (after removing the import) is needed to purge the stale module graph.

## Vite optimizeDeps

Must exclude both bare package names (not subpaths):
```ts
optimizeDeps: { exclude: ["@zama-fhe/sdk", "@zama-fhe/react-sdk"] }
```
