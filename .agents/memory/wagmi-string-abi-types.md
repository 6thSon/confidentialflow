---
name: wagmi string-ABI unknown types
description: wagmi v2 useReadContract returns `unknown` for all return values when the ABI is a string array (not a parsed ABI). This causes TypeScript errors when used in JSX or boolean expressions.
---

## Rule
Never use wagmi `data` directly from a string-ABI `useReadContract` call in JSX or boolean expressions without a type cast.

## Why
wagmi v2 cannot infer the return type from string ABIs at compile time. The data field is typed as `unknown`. In React 19 strict types, `unknown && <JSX />` resolves to `unknown`, which is not assignable to `ReactNode`.

## How to apply

**For boolean use (e.g. in disabled prop):**
```ts
const isApproved = !!data; // force boolean
```

**For JSX conditional rendering:**
```tsx
{data ? <Component /> : null}  // ternary avoids unknown in JSX children
// NOT: {data && <Component />}  // unknown && JSX = unknown (TS error)
```

**For address/object types:**
```ts
const addr = rawData as `0x${string}` | undefined;
const route = rawData as { yieldPct: number; vestPct: number; liquidPct: number } | undefined;
```

**For explicit boolean:**
```ts
const isAdmin: boolean = Boolean(
  isConnected && address && adminAddress && address.toLowerCase() === adminAddress.toLowerCase()
);
```
