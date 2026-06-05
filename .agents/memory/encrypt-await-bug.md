---
name: encryptUint64 await bug
description: The relayer-sdk input.encrypt() call is async in mock/test contexts and must always be awaited. Missing await causes a silent hang in the UI.
---

## Rule
Always await `input.encrypt()` and wrap it in `Promise.resolve()` to handle both sync and async SDK variants.

## Why
The `@zama-fhe/relayer-sdk` `EncryptedInput.encrypt()` returns a Promise in test/mock environments but may be sync in the browser. Wrapping in `Promise.resolve()` handles both cases safely. Without `await`, the destructure `{ handles, inputProof }` gets a Promise object instead of values, causing the payment flow to silently hang.

## How to apply
```ts
const { handles, inputProof } = await withTimeout(
  Promise.resolve(input.encrypt()),
  30_000,
  "Encryption"
);
```

Also: wrap `RelayerWeb.create()` in the same 30-second timeout since it fetches the KMS public key from the gateway on init and can hang if the relayer is unreachable.
