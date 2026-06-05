---
name: relayer-sdk web export
description: RelayerWeb class from @zama-fhe/relayer-sdk/web is a runtime-only export; TypeScript declaration file does not include it.
---

## Rule
Add `// @ts-ignore` before the dynamic import destructure of `RelayerWeb`.

## Why
The @zama-fhe/relayer-sdk@0.4.1 package's `lib/web.d.ts` declaration file does not export `RelayerWeb` as a named export in TypeScript's view, but the runtime module does export it. This is a declaration gap in the SDK.

## How to apply
```ts
// @ts-ignore
const { RelayerWeb } = await import("@zama-fhe/relayer-sdk/web");
```

This is the only safe approach until the SDK authors fix the declaration file.
