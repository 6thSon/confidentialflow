/* Contract addresses — Sepolia deployment (2026-06-05) */
export const CONTRACT_ADDRESSES = {
  cUSDT:        "0x9A2Bc655517d22CAC4a331Cfee6Fe7271f900Ec1",
  gate:         "0x78e9683ab9A62C8A1F12a72E05e209111f7bec40",
  vault:        "0xEC9dC67572704d219bfd03ED8Be0f4231f659a18",
  vesting:      "0xCB9b04eaab3D3CBb29CA1dCEA666543D53e9d190",
  flowRegistry: "0xA55A0E3CE8d613E090580eB1f797579b192376E0",
} as const;

/* Routing modes */
export const ROUTING_MODE = {
  LIQUID:  0,
  YIELD:   1,
  VESTING: 2,
} as const;

export type RoutingMode = typeof ROUTING_MODE[keyof typeof ROUTING_MODE];

/*
 * JSON ABI format (viem-compatible). Using inline JSON objects avoids the
 * runtime "cannot use 'in' operator" error that occurs when string
 * human-readable ABIs are passed directly to wagmi's writeContract.
 *
 * Source of truth: contracts/artifacts/contracts/<Contract>.sol/<Contract>.json
 * Re-run `cd contracts && npx hardhat compile` after any contract change.
 */

export const GATE_ABI = [
  /* ---- Core payment ---- */
  {
    type: "function", name: "deposit",
    inputs: [
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof",      type: "bytes"   },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "routePayment",
    inputs: [
      { name: "recipient",       type: "address" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof",      type: "bytes"   },
      { name: "mode",            type: "uint8"   },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "routeFromProtocol",
    inputs: [
      { name: "from",            type: "address" },
      { name: "to",              type: "address" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "routingMode",     type: "uint8"   },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  /* ---- Payment Intents ---- */
  {
    type: "function", name: "createPaymentIntent",
    inputs: [
      { name: "to",              type: "address" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof",      type: "bytes"   },
      { name: "routingMode",     type: "uint8"   },
      { name: "expiresAt",       type: "uint256" },
    ],
    outputs: [{ name: "intentId", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "executeIntent",
    inputs: [{ name: "intentId", type: "bytes32" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "cancelIntent",
    inputs: [{ name: "intentId", type: "bytes32" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "intents",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "from",            type: "address" },
      { name: "to",              type: "address" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "routingMode",     type: "uint8"   },
      { name: "expiresAt",       type: "uint256" },
      { name: "executed",        type: "bool"    },
      { name: "cancelled",       type: "bool"    },
    ],
    stateMutability: "view",
  },
  /* ---- Balance / status ---- */
  {
    type: "function", name: "getBalance",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "hasBalance",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  /* ---- Sanction / admin ---- */
  {
    type: "function", name: "sanctioned",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "admin",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "setSanctioned",
    inputs: [
      { name: "user",   type: "address" },
      { name: "status", type: "bool"    },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "transferAdmin",
    inputs: [{ name: "newAdmin", type: "address" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "setModules",
    inputs: [
      { name: "yieldVault",    type: "address" },
      { name: "vestingModule", type: "address" },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  /* ---- Protocol registry ---- */
  {
    type: "function", name: "authorizedProtocols",
    inputs: [{ name: "protocol", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "protocolNames",
    inputs: [{ name: "protocol", type: "address" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "registerProtocol",
    inputs: [
      { name: "protocol", type: "address" },
      { name: "name",     type: "string"  },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "revokeProtocol",
    inputs: [{ name: "protocol", type: "address" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getRegisteredProtocols",
    inputs: [],
    outputs: [
      { name: "protocols", type: "address[]" },
      { name: "names",     type: "string[]"  },
    ],
    stateMutability: "view",
  },
  /* ---- Events ---- */
  {
    type: "event", name: "Deposited",
    inputs: [
      { indexed: true,  name: "user",      type: "address" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event", name: "PaymentRouted",
    inputs: [
      { indexed: true,  name: "from",      type: "address" },
      { indexed: true,  name: "to",        type: "address" },
      { indexed: false, name: "mode",      type: "uint8"   },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event", name: "ProtocolRegistered",
    inputs: [
      { indexed: true,  name: "protocol", type: "address" },
      { indexed: false, name: "name",     type: "string"  },
    ],
  },
  {
    type: "event", name: "ProtocolRevoked",
    inputs: [{ indexed: true, name: "protocol", type: "address" }],
  },
  {
    type: "event", name: "PaymentIntentCreated",
    inputs: [
      { indexed: true,  name: "intentId",    type: "bytes32" },
      { indexed: true,  name: "from",        type: "address" },
      { indexed: true,  name: "to",          type: "address" },
      { indexed: false, name: "routingMode", type: "uint8"   },
      { indexed: false, name: "expiresAt",   type: "uint256" },
    ],
  },
  {
    type: "event", name: "PaymentIntentSettled",
    inputs: [
      { indexed: true,  name: "intentId",  type: "bytes32" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event", name: "PaymentIntentCancelled",
    inputs: [{ indexed: true, name: "intentId", type: "bytes32" }],
  },
] as const;

export const VAULT_ABI = [
  {
    type: "function", name: "claimWithYield",
    inputs: [], outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "hasDeposit",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "unlockTime",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event", name: "Deposited",
    inputs: [
      { indexed: true,  name: "user",      type: "address" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event", name: "Claimed",
    inputs: [
      { indexed: true,  name: "user",      type: "address" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
] as const;

export const VESTING_ABI = [
  {
    type: "function", name: "claim",
    inputs: [], outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "hasSchedule",
    inputs: [{ name: "beneficiary", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "cliffTimestamp",
    inputs: [{ name: "beneficiary", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "vestingDuration",
    inputs: [{ name: "beneficiary", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event", name: "VestingCreated",
    inputs: [
      { indexed: true,  name: "beneficiary",    type: "address" },
      { indexed: false, name: "cliffTimestamp", type: "uint256" },
      { indexed: false, name: "vestingDuration", type: "uint256" },
    ],
  },
  {
    type: "event", name: "VestingClaimed",
    inputs: [
      { indexed: true,  name: "beneficiary", type: "address" },
      { indexed: false, name: "timestamp",   type: "uint256" },
    ],
  },
] as const;

export const REGISTRY_ABI = [
  {
    type: "function", name: "setRoute",
    inputs: [
      { name: "yieldPct",  type: "uint8" },
      { name: "vestPct",   type: "uint8" },
      { name: "liquidPct", type: "uint8" },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "resetRoute",
    inputs: [], outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getRoute",
    inputs: [{ name: "sender", type: "address" }],
    outputs: [
      {
        name: "config", type: "tuple",
        components: [
          { name: "yieldPct",  type: "uint8" },
          { name: "vestPct",   type: "uint8" },
          { name: "liquidPct", type: "uint8" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function", name: "hasCustomRoute",
    inputs: [{ name: "sender", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

export const CUSDT_ABI = [
  {
    type: "function", name: "setOperator",
    inputs: [
      { name: "operator", type: "address" },
      { name: "until",    type: "uint48"  },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "isOperator",
    inputs: [
      { name: "holder",  type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function", name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
] as const;
