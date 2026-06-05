---
name: FHEVM relayer URL
description: The correct Zama Relayer URL for Sepolia is hardcoded as https://relayer.zama.ai — the old gateway.sepolia.zama.ai URL is stale.
---

## Rule
Hardcode `const RELAYER_URL = "https://relayer.zama.ai"` in fhevm.ts. Do not read from env for this value.

## Why
The old URL `https://gateway.sepolia.zama.ai/` was deprecated. The current endpoint is `https://relayer.zama.ai`. Reading from env is error-prone for this value since it must match the ZK proof format expected by the contracts.
