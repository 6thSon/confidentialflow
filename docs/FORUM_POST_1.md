# Building composable payment rails on Zama — what we learned about PaymentIntents, Protocol Registries, and the limits of privacy

*Submitted as part of the Zama Season 3 Builder Track.*

---

## The problem nobody talks about: DeFi payments are manual and isolated

Most DeFi protocols are built around a single implicit assumption: the user is present. You connect your wallet, you sign the transaction, you wait for confirmation. Every payment is a deliberate, synchronous act. That is fine for a retail swap. It is completely unworkable for anything that looks like real-world finance — payroll that executes on a schedule, escrow that releases on a condition, a settlement that coordinates across two protocols without requiring both counterparties to be online at the same time.

The isolation problem compounds this. Different protocols cannot coordinate payment flows without either: (a) exposing amounts on-chain, or (b) requiring a trusted intermediary who can see everything. Neither is acceptable in practice. The result is that "programmable money" has remained remarkably manual in the one area that matters most — the actual movement of value between parties.

---

## What we built: the PaymentIntent pattern

A PaymentIntent is a simple idea: separate the *declaration* of a payment from its *execution*.

When a user calls `createPaymentIntent()`, they encrypt the amount once in the browser using the Zama SDK, commit the encrypted handle to an on-chain record, and specify the recipient, routing mode, and expiry window. That is the declaration. The handle lives on-chain. The plaintext never leaves the browser.

Later — perhaps hours later, perhaps triggered by an external condition — `executeIntent()` runs. It can be called by the original sender, or by any protocol that has been registered in the Protocol Registry. The executing party does not need the plaintext amount. They pass the `intentId`, and the Gate retrieves the encrypted handle it stored at creation time, runs the sanction and balance guards in FHE, and dispatches the payment.

This unlocks something that is not possible in normal ERC-20 land: a payroll system executing on behalf of a user without the user being present, where the amount is never exposed to the payroll system, the chain, or any observer. The declaration happens once. Execution happens when conditions are met. The two are fully decoupled.

---

## The Protocol Registry: composability without FHE expertise

The Protocol Registry addresses a harder problem: how do you let external developers build on top of confidential payment rails without requiring them to understand FHE?

Any registered protocol can call `routeFromProtocol(from, to, encryptedAmount, routingMode)` on the Gate. The protocol passes an encrypted handle — either one it received from the user's `createPaymentIntent` call, or one it holds transiently via an ACL grant — but it never needs to decrypt anything, generate proofs, or interact with the Zama SDK directly. The Gate handles sanction filtering, balance gating, and dispatch. The protocol is just a conduit.

Registration is admin-gated: `registerProtocol(address, description)` is an owner-only call, and revocation is immediate. This means ecosystem composability does not require open access — you can whitelist the protocols you trust and revoke instantly if something goes wrong.

The practical implication: a lending protocol, an automated payroll service, or a streaming payment system can integrate with ConfidentialFlow and route confidential payments without the protocol itself holding or processing any plaintext financial data. The FHE complexity stays inside the Gate.

---

## Where FHE ends: a note on what we are not solving

We want to be direct about one known limitation, because we think it is important for anyone evaluating privacy infrastructure.

The ConfidentialYieldVault holds pooled user funds and routes them through a cUSDT wrapper. cUSDT, like USDC and USDT, is an asset whose underlying can be frozen by the issuer. If Centre or Tether decides to freeze an address, FHE does not protect you — your funds are still subject to the centralized control baked into the token contract. This is not an FHE problem. FHE solves *data* privacy — who can see what values on-chain. It does not and cannot solve *asset* centralization — who controls the underlying.

We think this distinction matters for the broader FHE ecosystem. The technology is genuinely powerful. But it is important to be precise about which threat model it addresses. Confidential computation eliminates on-chain data exposure. It does not change the trust model of the underlying assets.

---

## What's next

The contracts are deployed on Sepolia. You can explore them on Etherscan:

- **ConfidentialPaymentGate**: [`0x78e9683ab9A62C8A1F12a72E05e209111f7bec40`](https://sepolia.etherscan.io/address/0x78e9683ab9A62C8A1F12a72E05e209111f7bec40)
- **ConfidentialYieldVault**: [`0xEC9dC67572704d219bfd03ED8Be0f4231f659a18`](https://sepolia.etherscan.io/address/0xEC9dC67572704d219bfd03ED8Be0f4231f659a18)
- **ConfidentialVestingModule**: [`0xCB9b04eaab3D3CBb29CA1dCEA666543D53e9d190`](https://sepolia.etherscan.io/address/0xCB9b04eaab3D3CBb29CA1dCEA666543D53e9d190)
- **FlowRegistry**: [`0xA55A0E3CE8d613E090580eB1f797579b192376E0`](https://sepolia.etherscan.io/address/0xA55A0E3CE8d613E090580eB1f797579b192376E0)

If you are building a protocol that wants to route confidential payments without handling FHE directly — a lending protocol, an automated settlement system, a payroll service — reach out. The Protocol Registry is open to integrations. The interface is four parameters and a `bytes32` return. The FHE stays inside the Gate.

We will post the GitHub link and a live demo URL once the frontend deployment is finalized.
