---
name: FHEVM relayer URL
description: The correct Zama Relayer URL for Sepolia — both old URLs are stale/wrong.
---

## Rule
Use `const RELAYER_URL = "https://relayer.testnet.zama.org"` in fhevm.ts.

## Why
- `https://gateway.sepolia.zama.ai/` — deprecated, was the v0.3 era URL.
- `https://relayer.zama.ai` — wrong; causes SDK v3 RelayerWeb to immediately enter `"error"` status.
- `https://relayer.testnet.zama.org` — correct for SDK v3 on Sepolia. Matches `@zama-fhe/relayer-sdk` v0.4 `SepoliaConfig.relayerUrl`. Using the wrong URL causes the dot to appear permanently red because `relayerInstance.status` enters `"error"` before React even mounts.

## How to apply
Any time you configure `new RelayerWeb({ transports: { [11155111]: { relayerUrl: ... } } })`, use `https://relayer.testnet.zama.org`.
