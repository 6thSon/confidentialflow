# ConfidentialFlow

Composable confidential payment rails on Zama FHEVM v0.11 — balances and transfer amounts are fully encrypted on-chain using homomorphic encryption.

## Run & Operate

- `pnpm --filter @workspace/app run dev` — React frontend (port assigned by env)
- `pnpm --filter @workspace/api-server run dev` — Express API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `cd contracts && npm run compile` — compile Solidity contracts with Hardhat
- `cd contracts && npm test` — run 38 Hardhat tests against the FHEVM mock
- `cd contracts && npm run deploy:sepolia` — deploy all 4 contracts to Sepolia
- Required env (root): `SESSION_SECRET`
- Required env (contracts): `SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY`
- Required env (frontend): `VITE_SEPOLIA_RPC_URL`, `VITE_WALLETCONNECT_PROJECT_ID` (optional — RainbowKit works without it in dev)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite 7, wagmi v2, RainbowKit v2, viem v2, Tailwind CSS v4
- FHEVM client: `@zama-fhe/sdk@^3` + `@zama-fhe/react-sdk@^3` (Token API + React hooks)
- Smart contracts: Solidity 0.8.24, Hardhat, `@fhevm/solidity` v0.11.1, `@fhevm/hardhat-plugin`
- API: Express 5, Drizzle ORM, PostgreSQL
- **`contracts/` is a standalone npm project** (NOT in pnpm workspace) to avoid `@zama-fhe/relayer-sdk` version conflict

## Where things live

- `contracts/contracts/` — 4 Solidity contracts (ConfidentialPaymentGate, ConfidentialYieldVault, ConfidentialVestingModule, FlowRegistry)
- `contracts/test/` — Hardhat TypeScript test files (38 tests)
- `contracts/scripts/` — deploy.ts and seed.ts deployment scripts
- `artifacts/app/src/pages/` — Send.tsx, Dashboard.tsx, Admin.tsx
- `artifacts/app/src/lib/` — wagmi.ts (chain/wallet config), contracts.ts (ABIs), fhevm.ts (FHE helpers), wagmiSigner.ts (custom GenericSigner)
- `artifacts/app/src/components/Layout.tsx` — top nav with RainbowKit wallet button + relayer status dot
- `docs/ARCHITECTURE.md`, `docs/DEMO_FLOW.md` — technical docs

## Architecture decisions

- All 4 FHE contracts inherit `ZamaEthereumConfig` (not `ZamaCoprocessorConfig`); FHE coprocessor is auto-configured per-network.
- `FHE.fromExternal()` wraps every user-supplied encrypted input; `FHE.allowThis()` called after every stored encrypted value.
- `FHE.select(ebool, a, b)` used for conditional logic instead of `require(ebool)` — required by FHEVM rules.
- `contracts/` uses `overrides: { "@zama-fhe/relayer-sdk": "0.4.1" }` in its own package.json to pin the version independently of the pnpm workspace.
- Frontend uses `RelayerWeb` with `{ getChainId, transports: { [chainId]: { relayerUrl, network } } }` config (SDK v3 shape).
- `WagmiSignerV2` (custom class in `wagmiSigner.ts`) replaces the broken `@zama-fhe/react-sdk/wagmi` `WagmiSigner` — see Known Limitations.
- `useEncrypt()` from `@zama-fhe/react-sdk` returns a TanStack mutation; `inputProof` is `Uint8Array` and must be converted with `toHex()` from viem before passing to contracts.
- Relayer status (idle → initializing → ready | error) is polled via `setInterval` in `RouterWithZama` and surfaced via `RelayerStatusContext`.

## Product

- **Send** — encrypt a cUSDT amount client-side, submit a confidential ERC-7984 transfer; amount never visible on-chain.
- **Dashboard** — view your encrypted balance (readable only by your wallet via FHE user decryption), vesting schedule, and yield position.
- **Admin** — manage FlowRegistry registrations, pause/resume gates, set yield APR.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Known Limitations

- **`@zama-fhe/react-sdk/wagmi` `WagmiSigner` is broken with wagmi v2**: it imports `watchConnection` from `wagmi/actions` which was removed in wagmi v2. `WagmiSignerV2` in `src/lib/wagmiSigner.ts` is a drop-in replacement implementing `GenericSigner` directly against wagmi v2 actions. The `subscribe()` method returns a no-op because wagmi v2 `Config` doesn't expose its Zustand store as a public API; this means FHE credentials are not automatically refreshed on wallet/chain change (expected on Sepolia — users re-connect to get a new session).
- **Relayer WASM init is async**: `new RelayerWeb(config)` starts initialization in a Web Worker; the status dot goes yellow (initializing) → green (ready) → red (error). On Sepolia, expect 5–15 s for WASM + network handshake.
- **`VITE_WALLETCONNECT_PROJECT_ID` is optional but recommended**: without it, WalletConnect shows a 403 from Reown's config endpoint. Injected wallets (MetaMask) work fine without it.

## Gotchas

- **`@zama-fhe/sdk` v3 `RelayerWebConfig`**: shape is `{ getChainId: () => Promise<number>, transports: Record<chainId, { relayerUrl, network }> }`. NOT `{ gatewayUrl, networkUrl }` (that was the old relayer-sdk v0.4 shape).
- **`indexedDBStorage`** from `@zama-fhe/sdk` is a pre-built `GenericStorage` singleton — import it directly, do NOT call it as a function.
- **`useEncrypt().mutateAsync` params**: `contractAddress` and `userAddress` must be `0x${string}` (Address type), not plain `string`.
- **`inputProof` is `Uint8Array`**: convert with `toHex(inputProof)` from viem before passing to ABI-encoded contract calls.
- Vite `optimizeDeps.exclude` must list `@zama-fhe/sdk` and `@zama-fhe/react-sdk` (bare package names) to prevent Vite from pre-bundling these ESM-native packages.
- `contracts/` must NOT be added to pnpm-workspace.yaml — keep it as a standalone npm project.
- `cd contracts && npm install` takes ~60 s on first run (downloads hardhat + fhevm toolchain).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `docs/ARCHITECTURE.md` for FHE contract design patterns
- See `docs/DEMO_FLOW.md` for the end-to-end user journey
