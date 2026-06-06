import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseUnits, toHex } from "viem";
import {
  Lock, ShieldCheck, ArrowRight, Send, Coins, Clock,
  CheckCircle2, ExternalLink, RefreshCw, CalendarClock, Copy
} from "lucide-react";
import { useEncrypt } from "@zama-fhe/react-sdk";
import { CONTRACT_ADDRESSES, GATE_ABI, CUSDT_ABI, ROUTING_MODE } from "@/lib/contracts";
import { formatEncryptedHandle } from "@/lib/fhevm";
import { useTransactionFlow } from "@/hooks/useTransactionFlow";
import { useToast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ */
/*  Routing option definitions                                          */
/* ------------------------------------------------------------------ */

const ROUTING_OPTIONS = [
  {
    mode: ROUTING_MODE.LIQUID,
    label: "Direct Transfer",
    tag: "Liquid",
    icon: Send,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/40",
    ring: "ring-primary/40",
    description:
      "Instantly transfers the encrypted amount to the recipient. Amount stays private on-chain — only sender and receiver can decrypt.",
    detail: "Instant · No lock-up · Fully private",
  },
  {
    mode: ROUTING_MODE.YIELD,
    label: "Yield Vault",
    tag: "Yield",
    icon: Coins,
    color: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/40",
    ring: "ring-accent/40",
    description:
      "Locks funds in the ConfidentialYieldVault for 24 hours. After the lock-up the recipient claims principal plus a 1% yield bonus.",
    detail: "24 h lock · +1% yield · Encrypted",
  },
  {
    mode: ROUTING_MODE.VESTING,
    label: "Vesting Schedule",
    tag: "Vest",
    icon: Clock,
    color: "text-chart-3",
    bg: "bg-chart-3/10",
    border: "border-chart-3/40",
    ring: "ring-chart-3/40",
    description:
      "Creates a vesting schedule for the recipient with a 30-day cliff and 180-day linear vest. Funds trickle out over time.",
    detail: "30-day cliff · 180-day linear vest · Encrypted",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Encryption state machine                                            */
/* ------------------------------------------------------------------ */

type EncryptState = "idle" | "encrypting" | "encrypted" | "sending";

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export default function SendPage() {
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  const { flowState, isBusy, runTx, writeContractAsync } = useTransactionFlow();

  /* useEncrypt() — must be at hook level; safe here because SendPage
     only renders inside ZamaProvider (see RouterWithZama in App.tsx). */
  const encrypt = useEncrypt();

  const [recipient, setRecipient]     = useState("");
  const [amount, setAmount]           = useState("");
  const [mode, setMode]               = useState<number>(ROUTING_MODE.LIQUID);
  const [encryptState, setEncryptState] = useState<EncryptState>("idle");

  /* ---- Schedule Payment state ---- */
  const [intentRecipient, setIntentRecipient] = useState("");
  const [intentAmount, setIntentAmount]       = useState("");
  const [intentMode, setIntentMode]           = useState<number>(ROUTING_MODE.LIQUID);
  const [intentExpiry, setIntentExpiry]       = useState("");
  const [intentEncryptState, setIntentEncryptState] = useState<EncryptState>("idle");
  const [lastIntentId, setLastIntentId]       = useState<string | null>(null);

  /* ---- localStorage operator-approval badge ---- */
  const approvalKey = address ? `cf_approved_${address}` : null;
  const [localApproved, setLocalApproved] = useState(false);

  useEffect(() => {
    if (approvalKey) setLocalApproved(!!localStorage.getItem(approvalKey));
  }, [approvalKey]);

  /* ---- On-chain isOperator check ---- */
  const gateAddr  = CONTRACT_ADDRESSES.gate  as `0x${string}` | undefined;
  const cusdtAddr = CONTRACT_ADDRESSES.cUSDT as `0x${string}` | undefined;

  const { data: isOperator, refetch: refetchOperator } = useReadContract({
    address: cusdtAddr,
    abi: CUSDT_ABI,
    functionName: "isOperator",
    args: [address!, gateAddr!],
    query: { enabled: !!address && !!cusdtAddr && !!gateAddr },
  });

  /* Cast to boolean: wagmi returns unknown for some return values */
  const approved = !!isOperator || localApproved;

  /* ---- Derived ---- */
  const selectedOption       = ROUTING_OPTIONS.find(o => o.mode === mode)!;
  const selectedIntentOption = ROUTING_OPTIONS.find(o => o.mode === intentMode)!;
  const isEncryptBusy        = encryptState !== "idle";
  const isIntentEncryptBusy  = intentEncryptState !== "idle";

  /* ---------------------------------------------------------------- */
  /*  Shared encrypt helper — wraps useEncrypt().mutateAsync           */
  /* ---------------------------------------------------------------- */

  async function fheEncrypt(
    value: bigint,
    contractAddress: `0x${string}`,
    userAddress: `0x${string}`,
  ) {
    const result = await encrypt.mutateAsync({
      values: [{ value, type: "euint64" as const }],
      contractAddress,
      userAddress,
    });
    /* handles are Address (0x${string}); cast via unknown for TS safety */
    const handle = result.handles[0] as unknown as `0x${string}`;
    /* inputProof is Uint8Array from the SDK — toHex returns 0x${string} */
    const inputProof =
      result.inputProof instanceof Uint8Array
        ? toHex(result.inputProof)
        : (result.inputProof as unknown as `0x${string}`);
    return { handle, inputProof };
  }

  /* ---------------------------------------------------------------- */
  /*  Step 1 — Approve operator                                        */
  /* ---------------------------------------------------------------- */

  async function handleApproveOperator() {
    if (!address || !gateAddr || !cusdtAddr) return;
    const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

    const hash = await runTx({
      actionName: "Operator Approval",
      pendingDetail: `Approving ConfidentialPaymentGate (${gateAddr.slice(0, 10)}…) as cUSDT operator`,
      contractCall: () =>
        writeContractAsync({
          address: cusdtAddr,
          abi: CUSDT_ABI,
          functionName: "setOperator",
          args: [gateAddr, expiry],
        }),
      successDetail: "Gate can now pull cUSDT during deposits",
    });

    if (hash && approvalKey) {
      localStorage.setItem(approvalKey, "true");
      setLocalApproved(true);
      refetchOperator();
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Step 2 — Deposit                                                 */
  /* ---------------------------------------------------------------- */

  async function handleDeposit() {
    if (!address || !amount || !gateAddr) return;

    if (!approved) {
      toast({
        title: "Operator approval required",
        description: "Complete Step 1 first — approve the gate as cUSDT operator.",
        variant: "destructive",
      });
      return;
    }

    setEncryptState("encrypting");
    let handle: `0x${string}`, inputProof: `0x${string}`;
    try {
      ({ handle, inputProof } = await fheEncrypt(
        parseUnits(amount, 6),
        gateAddr,
        address,
      ));
      setEncryptState("encrypted");
    } catch (err: any) {
      setEncryptState("idle");
      toast({ title: "❌ Encryption failed", description: err.message, variant: "destructive" });
      return;
    }

    setEncryptState("sending");

    await runTx({
      actionName: "Deposit",
      pendingDetail: "Depositing encrypted cUSDT into the gate",
      contractCall: () =>
        writeContractAsync({
          address: gateAddr!,
          abi: GATE_ABI,
          functionName: "deposit",
          args: [handle, inputProof],
        }),
      successDetail: `${amount} cUSDT deposited (encrypted)`,
    });

    setEncryptState("idle");
  }

  /* ---------------------------------------------------------------- */
  /*  Step 3 — Route Payment                                           */
  /* ---------------------------------------------------------------- */

  async function handleSend() {
    if (!address || !amount || !recipient || !gateAddr) return;

    setEncryptState("encrypting");
    let handle: `0x${string}`, inputProof: `0x${string}`;
    try {
      ({ handle, inputProof } = await fheEncrypt(
        parseUnits(amount, 6),
        gateAddr,
        address,
      ));
      setEncryptState("encrypted");
    } catch (err: any) {
      setEncryptState("idle");
      toast({ title: "❌ Encryption failed", description: err.message, variant: "destructive" });
      return;
    }

    setEncryptState("sending");

    await runTx({
      actionName: "Route Payment",
      pendingDetail: `Routing ${amount} cUSDT via ${selectedOption.label}`,
      contractCall: () =>
        writeContractAsync({
          address: gateAddr!,
          abi: GATE_ABI,
          functionName: "routePayment",
          args: [recipient as `0x${string}`, handle, inputProof, mode],
        }),
      successDetail: `${amount} cUSDT routed via ${selectedOption.label}`,
    });

    setEncryptState("idle");
  }

  /* ---------------------------------------------------------------- */
  /*  Step 4 — Schedule Payment Intent                                 */
  /* ---------------------------------------------------------------- */

  async function handleSchedulePayment() {
    if (!address || !intentAmount || !intentRecipient || !intentExpiry || !gateAddr) return;

    const expiresAt = BigInt(Math.floor(new Date(intentExpiry).getTime() / 1000));
    if (expiresAt <= BigInt(Math.floor(Date.now() / 1000))) {
      toast({ title: "Invalid expiry", description: "Expiry must be in the future.", variant: "destructive" });
      return;
    }

    setIntentEncryptState("encrypting");
    let handle: `0x${string}`, inputProof: `0x${string}`;
    try {
      ({ handle, inputProof } = await fheEncrypt(
        parseUnits(intentAmount, 6),
        gateAddr,
        address,
      ));
      setIntentEncryptState("encrypted");
    } catch (err: any) {
      setIntentEncryptState("idle");
      toast({ title: "❌ Encryption failed", description: err.message, variant: "destructive" });
      return;
    }

    setIntentEncryptState("sending");

    const hash = await runTx({
      actionName: "Schedule Payment",
      pendingDetail: `Scheduling intent: ${intentAmount} cUSDT to ${intentRecipient.slice(0, 10)}…`,
      contractCall: () =>
        writeContractAsync({
          address: gateAddr!,
          abi: GATE_ABI,
          functionName: "createPaymentIntent",
          args: [intentRecipient as `0x${string}`, handle, inputProof, intentMode, expiresAt],
        }),
      successDetail: `Payment intent created — execute any time before ${new Date(intentExpiry).toLocaleString()}`,
    });

    setIntentEncryptState("idle");

    if (hash && address) {
      const stored: string[] = JSON.parse(localStorage.getItem(`cf_intents_${address}`) || "[]");
      stored.push(hash);
      localStorage.setItem(`cf_intents_${address}`, JSON.stringify(stored));
      setLastIntentId(hash);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Not connected                                                     */
  /* ---------------------------------------------------------------- */

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Lock className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2">Confidential Payments</h1>
          <p className="text-muted-foreground max-w-md">
            Connect your wallet to send encrypted cUSDT using Zama FHEVM — amounts never
            visible on-chain.
          </p>
        </div>
        <div className="encrypted-badge px-4 py-2 rounded-lg text-sm text-primary/90 cipher-text">
          0xA3f9…B2e7 ▸ [ENCRYPTED] ▸ 0x7d2C…E891
        </div>
      </div>
    );
  }

  const globalBusy = isBusy || isEncryptBusy;
  const intentGlobalBusy = isBusy || isIntentEncryptBusy;

  /* ---------------------------------------------------------------- */
  /*  Page                                                              */
  /* ---------------------------------------------------------------- */

  return (
    <div className="max-w-lg mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Lock className="w-6 h-6 text-primary" />
          Send cUSDT
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          All amounts encrypted via FHEVM — zero on-chain amount visibility.
        </p>
      </div>

      {/* ---- Step 1: Approve operator ---- */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs text-foreground font-bold">
              1
            </span>
            Approve Gate as cUSDT Operator
          </div>
          {approved && (
            <span className="flex items-center gap-1 text-xs text-chart-3 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approved
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          One-time approval so the gate contract can pull cUSDT from your wallet during
          deposits. Gate address:
          {gateAddr ? (
            <a
              href={`https://sepolia.etherscan.io/address/${gateAddr}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 font-mono text-primary hover:underline inline-flex items-center gap-0.5"
            >
              {gateAddr.slice(0, 10)}…{gateAddr.slice(-6)}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          ) : (
            <span className="ml-1 text-muted-foreground/60">(contract not yet deployed)</span>
          )}
        </p>

        <button
          onClick={handleApproveOperator}
          disabled={globalBusy || approved || !gateAddr}
          className="w-full py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border/60 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {approved ? "✓ Already approved" : "Approve Operator"}
        </button>
      </div>

      {/* ---- Step 2: Deposit ---- */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs text-foreground font-bold">
            2
          </span>
          Deposit cUSDT into Gate
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Move cUSDT into the gate contract. Your amount is encrypted before leaving the
            browser — the contract never sees the plaintext value.
          </p>
          {!approved && (
            <p className="text-chart-4 font-medium">
              ⚠ Complete Step 1 before depositing.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Amount to deposit (cUSDT)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="flex-1 bg-input/30 border border-border/60 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <button
              onClick={handleDeposit}
              disabled={globalBusy || !amount || !approved}
              className="px-4 py-2.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 transition-colors disabled:opacity-50 min-w-[90px] flex items-center justify-center gap-1.5"
            >
              {encryptState === "encrypting" && flowState === "idle" ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Encrypting…</>
              ) : encryptState === "encrypted" && flowState === "idle" ? (
                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Sending…</>
              ) : (
                "Deposit"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ---- Step 3: Route Payment ---- */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs text-foreground font-bold">
            3
          </span>
          Route Encrypted Payment
        </div>

        {/* Recipient */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Recipient wallet address
          </label>
          <input
            type="text"
            placeholder="0x…"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            className="w-full bg-input/30 border border-border/60 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Amount to send (cUSDT, encrypted before broadcast)
          </label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full bg-input/30 border border-border/60 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Routing mode — radio button cards */}
        <div>
          <label className="text-xs text-muted-foreground mb-2.5 block">
            Choose routing mode
          </label>
          <div className="space-y-2.5">
            {ROUTING_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = mode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  onClick={() => setMode(opt.mode)}
                  className={[
                    "w-full text-left rounded-xl border px-4 py-3.5 transition-all",
                    active
                      ? `${opt.bg} ${opt.border} ring-1 ${opt.ring}`
                      : "bg-secondary/20 border-border/40 hover:bg-secondary/40",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={[
                        "mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors",
                        active ? `${opt.border} ${opt.color}` : "border-muted-foreground/40",
                      ].join(" ")}
                    >
                      {active && <div className={`w-1.5 h-1.5 rounded-full ${opt.bg.replace("/10", "")}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Icon className={`w-3.5 h-3.5 ${active ? opt.color : "text-muted-foreground"}`} />
                        <span className={`text-sm font-semibold ${active ? opt.color : "text-foreground"}`}>
                          {opt.label}
                        </span>
                        <span className="text-xs text-muted-foreground/70 font-mono">
                          [{opt.tag}]
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {opt.description}
                      </p>
                      <p className={`mt-1 text-xs font-medium ${active ? opt.color : "text-muted-foreground/60"}`}>
                        {opt.detail}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Encryption state feedback */}
        {isEncryptBusy && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-primary flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            {encryptState === "encrypting"
              ? "Encrypting amount via Zama Relayer…"
              : encryptState === "encrypted"
              ? "Encrypted ✓ — confirm transaction in wallet…"
              : "Sending encrypted transaction…"}
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={globalBusy || !recipient || !amount || !gateAddr}
          className="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 glow-primary"
        >
          {isEncryptBusy || isBusy ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="cipher-text text-sm">
                {encryptState === "encrypting" ? "Encrypting…" : "Processing…"}
              </span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Send Encrypted
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {flowState === "success" && (
          <p className="text-xs text-chart-3 text-center flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Payment confirmed on-chain. Amount stays encrypted forever.
          </p>
        )}
      </div>

      {/* ---- Step 4: Schedule a Payment Intent ---- */}
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs text-foreground font-bold">
            4
          </span>
          <CalendarClock className="w-4 h-4" />
          Schedule a Payment
        </div>

        <p className="text-xs text-muted-foreground">
          Commit an encrypted amount now and settle it any time before the expiry.
          The intent can also be executed by authorized protocols — useful for
          recurring or conditional payments.
        </p>

        {/* Intent recipient */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Recipient wallet address
          </label>
          <input
            type="text"
            placeholder="0x…"
            value={intentRecipient}
            onChange={e => setIntentRecipient(e.target.value)}
            className="w-full bg-input/30 border border-border/60 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Intent amount */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Amount (cUSDT, encrypted before broadcast)
          </label>
          <input
            type="number"
            placeholder="0.00"
            value={intentAmount}
            onChange={e => setIntentAmount(e.target.value)}
            className="w-full bg-input/30 border border-border/60 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Execute-by date */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">
            Execute by (expiry date &amp; time)
          </label>
          <input
            type="datetime-local"
            value={intentExpiry}
            onChange={e => setIntentExpiry(e.target.value)}
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            className="w-full bg-input/30 border border-border/60 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Routing mode for intent */}
        <div>
          <label className="text-xs text-muted-foreground mb-2 block">
            Routing mode
          </label>
          <div className="flex gap-2">
            {ROUTING_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = intentMode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  onClick={() => setIntentMode(opt.mode)}
                  className={[
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-medium transition-all",
                    active
                      ? `${opt.bg} ${opt.border} ${opt.color}`
                      : "bg-secondary/20 border-border/40 text-muted-foreground hover:bg-secondary/40",
                  ].join(" ")}
                >
                  <Icon className="w-3 h-3" />
                  {opt.tag}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {selectedIntentOption.detail}
          </p>
        </div>

        {/* Encrypt state banner */}
        {isIntentEncryptBusy && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-xs text-primary flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            {intentEncryptState === "encrypting"
              ? "Encrypting amount via Zama Relayer…"
              : intentEncryptState === "encrypted"
              ? "Encrypted ✓ — confirm transaction in wallet…"
              : "Submitting intent on-chain…"}
          </div>
        )}

        {/* Schedule button */}
        <button
          onClick={handleSchedulePayment}
          disabled={intentGlobalBusy || !intentRecipient || !intentAmount || !intentExpiry || !gateAddr}
          className="w-full py-3 rounded-lg bg-secondary hover:bg-secondary/80 border border-border/60 text-foreground font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {isIntentEncryptBusy || isBusy ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">
                {intentEncryptState === "encrypting" ? "Encrypting…" : "Scheduling…"}
              </span>
            </>
          ) : (
            <>
              <CalendarClock className="w-4 h-4" />
              Schedule Payment Intent
            </>
          )}
        </button>

        {/* Success — show tx hash */}
        {lastIntentId && (
          <div className="rounded-lg bg-chart-3/5 border border-chart-3/30 px-4 py-3 space-y-1">
            <p className="text-xs text-chart-3 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Intent scheduled — check Dashboard for Pending Intents
            </p>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground font-mono truncate">
                Tx: {lastIntentId.slice(0, 20)}…
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(lastIntentId);
                  toast({ title: "Copied", description: "Transaction hash copied." });
                }}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
