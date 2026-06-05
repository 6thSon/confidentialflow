---
name: Protocol Registry pattern in ConfidentialPaymentGate
description: routeFromProtocol() allows authorized protocols to route through the gate; callers must grant transient ACL before calling.
---

## Rule
Calling protocols must execute `FHE.allowTransient(amount, address(gate))` before calling `routeFromProtocol()`, or all FHE operations will revert with `SenderNotAllowed`.

## Why
When the gate receives a `euint64 encryptedAmount` from a protocol, the FHE coprocessor checks ACL. Unless the protocol granted transient ACL to the gate address, the gate cannot read the handle. The gate does NOT check caller balance — the protocol is responsible for fund availability.

## How to apply
The swap-and-pop pattern is used in `revokeProtocol()` to maintain `_protocolList` without gaps. `authorizedProtocols[protocol] = false` but the name mapping is kept for historical reference. `getRegisteredProtocols()` iterates `_protocolList` which only contains currently authorized addresses.
