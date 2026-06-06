---
name: FHEVM relayer URL and initialization
description: Correct Sepolia relayer URL, lazy init pattern, and optimizeDeps config for RelayerWeb in @zama-fhe/sdk v3.
---

## Rule 1 — Correct relayer URL includes /v2

Use `SepoliaConfig` spread from `@zama-fhe/sdk` instead of hardcoding the URL:

```ts
import { RelayerWeb, SepoliaConfig } from "@zama-fhe/sdk";

const relayer = new RelayerWeb({
  getChainId: () => Promise.resolve(11155111),
  transports: {
    [11155111]: {
      ...SepoliaConfig,          // includes correct relayerUrl with /v2
      network: customRpcOrDefault ?? SepoliaConfig.network,
    },
  },
});
```

`SepoliaConfig.relayerUrl` is `"https://relayer.testnet.zama.org/v2"`. All previous hardcoded URLs (`https://relayer.zama.ai`, `https://relayer.testnet.zama.org` without `/v2`) are wrong and cause silent WASM init failure.

**Why:** The SDK fetches WASM artifacts and public params from the relayer URL path. Without `/v2`, every fetch returns 404 and the worker fails silently, keeping status at `"idle"` or `"error"` forever.

## Rule 2 — RelayerWeb is lazy; call getPublicParams() to trigger init

`RelayerWeb` does NOT start WASM initialization at construction time. Status stays `"idle"` indefinitely until a FHE operation is called. To warm up the worker on app boot:

```ts
// In useEffect on app mount:
async function kickInit() {
  try {
    await relayerInstance.getPublicParams(SEPOLIA_CHAIN_ID);
  } catch (_) {
    // status will be "error"; retry loop handles it
  }
}
kickInit();
```

**Why:** Without this call, the status dot never transitions from `idle` → `initializing` → `ready`. The `RelayerWeb` has no `init()` method; `getPublicParams()` is the documented trigger.

**How to apply:** Call `kickInit()` inside the `useEffect(() => { ... }, [])` that polls `relayerInstance.status`. Also call it in the error retry branch.

## Rule 3 — optimizeDeps.exclude must include bare @zama-fhe/relayer-sdk

```ts
optimizeDeps: {
  exclude: [
    "@zama-fhe/sdk",
    "@zama-fhe/react-sdk",
    "@zama-fhe/relayer-sdk",          // bare package — required
    "@zama-fhe/relayer-sdk/web",
    "@zama-fhe/relayer-sdk/bundle",
  ],
},
```

**Why:** If Vite pre-bundles the bare `@zama-fhe/relayer-sdk` package, the WASM loader breaks at runtime. The subpaths alone are not sufficient.

## Confirmed non-issues

- `RelayerWeb` has no `on()` method — event listener via `relayerInstance.on?.()` is a silent no-op.
- `RelayerWeb` has no `init()` method — `(relayerInstance as any).init?.()` is a no-op.
- COEP `credentialless` (not `require-corp`) is correct when serving RainbowKit/WalletConnect iframes.
- `preview.headers` must also include COOP/COEP for the deployed build.
