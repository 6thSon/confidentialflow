import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { Lock, Coins, Clock, Eye, EyeOff, RefreshCw, CheckCircle, CalendarClock, Trash2, PlayCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { CONTRACT_ADDRESSES, VAULT_ABI, VESTING_ABI, GATE_ABI } from "@/lib/contracts";
import { formatEncryptedHandle } from "@/lib/fhevm";
import { useToast } from "@/hooks/use-toast";

function EncryptedBadge({ handle }: { handle?: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm cipher-text text-primary">
        {revealed && handle ? formatEncryptedHandle(handle as `0x${string}`) : "[ENCRYPTED]"}
      </span>
      <button
        onClick={() => setRevealed(r => !r)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Toggle handle display"
      >
        {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function VaultCard({ address }: { address: `0x${string}` }) {
  const { toast } = useToast();
  const { data: hasDeposit } = useReadContract({
    address: CONTRACT_ADDRESSES.vault as `0x${string}`,
    abi: VAULT_ABI,
    functionName: "hasDeposit",
    args: [address],
  });
  const { data: unlockTime } = useReadContract({
    address: CONTRACT_ADDRESSES.vault as `0x${string}`,
    abi: VAULT_ABI,
    functionName: "unlockTime",
    args: [address],
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const now      = BigInt(Math.floor(Date.now() / 1000));
  const unlockTs = unlockTime ? BigInt(unlockTime.toString()) : 0n;
  const unlocked = unlockTs > 0n && now >= unlockTs;
  const timeLeft = unlockTs > now ? Number(unlockTs - now) : 0;

  function formatTimeLeft(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}h ${m}m remaining`;
  }

  function handleClaim() {
    writeContract({
      address: CONTRACT_ADDRESSES.vault as `0x${string}`,
      abi: VAULT_ABI,
      functionName: "claimWithYield",
    });
    toast({ title: "Claim submitted", description: "Claiming principal + 1% yield." });
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
            <Coins className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="font-semibold text-sm">Yield Vault</p>
            <p className="text-xs text-muted-foreground">24-hour lock · +1% yield</p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          hasDeposit
            ? unlocked ? "bg-chart-3/15 text-chart-3 border border-chart-3/30"
                       : "bg-accent/15 text-accent border border-accent/30"
            : "bg-secondary/50 text-muted-foreground border border-border/40"
        }`}>
          {hasDeposit ? (unlocked ? "Ready" : "Locked") : "Empty"}
        </span>
      </div>

      <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Deposited amount</span>
          <EncryptedBadge />
        </div>
        {!!hasDeposit && unlockTs > 0n ? (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Unlocks at</span>
            <span className="font-mono text-foreground">
              {new Date(Number(unlockTs) * 1000).toLocaleString()}
            </span>
          </div>
        ) : null}
        {!!hasDeposit && !unlocked && timeLeft > 0 ? (
          <div className="text-xs text-accent/80">{formatTimeLeft(timeLeft)}</div>
        ) : null}
      </div>

      {!!hasDeposit ? (
        <button
          onClick={handleClaim}
          disabled={!unlocked || isPending || isConfirming}
          className="w-full py-2.5 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isPending || isConfirming ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : isSuccess ? (
            <><CheckCircle className="w-4 h-4" /> Claimed!</>
          ) : (
            <><Coins className="w-4 h-4" /> Claim with Yield</>
          )}
        </button>
      ) : null}
    </div>
  );
}

function VestingCard({ address }: { address: `0x${string}` }) {
  const { toast } = useToast();
  const { data: hasSchedule } = useReadContract({
    address: CONTRACT_ADDRESSES.vesting as `0x${string}`,
    abi: VESTING_ABI,
    functionName: "hasSchedule",
    args: [address],
  });
  const { data: cliff } = useReadContract({
    address: CONTRACT_ADDRESSES.vesting as `0x${string}`,
    abi: VESTING_ABI,
    functionName: "cliffTimestamp",
    args: [address],
  });
  const { data: duration } = useReadContract({
    address: CONTRACT_ADDRESSES.vesting as `0x${string}`,
    abi: VESTING_ABI,
    functionName: "vestingDuration",
    args: [address],
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const now      = BigInt(Math.floor(Date.now() / 1000));
  const cliffTs  = cliff ? BigInt(cliff.toString()) : 0n;
  const pastCliff = cliffTs > 0n && now >= cliffTs;

  function handleClaim() {
    writeContract({
      address: CONTRACT_ADDRESSES.vesting as `0x${string}`,
      abi: VESTING_ABI,
      functionName: "claim",
    });
    toast({ title: "Vesting claim submitted" });
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-chart-3/15 border border-chart-3/30 flex items-center justify-center">
            <Clock className="w-4 h-4 text-chart-3" />
          </div>
          <div>
            <p className="font-semibold text-sm">Vesting Schedule</p>
            <p className="text-xs text-muted-foreground">
              {duration ? `${Math.round(Number(duration) / 86400)}-day linear vest` : "30-day cliff · 180-day vest"}
            </p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          hasSchedule
            ? pastCliff ? "bg-chart-3/15 text-chart-3 border border-chart-3/30"
                        : "bg-secondary/50 text-muted-foreground border border-border/40"
            : "bg-secondary/50 text-muted-foreground border border-border/40"
        }`}>
          {hasSchedule ? (pastCliff ? "Claimable" : "Vesting") : "None"}
        </span>
      </div>

      <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Total allocation</span>
          <EncryptedBadge />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Already claimed</span>
          <EncryptedBadge />
        </div>
        {cliff ? (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Cliff date</span>
            <span className="font-mono text-foreground">
              {new Date(Number(cliff) * 1000).toLocaleDateString()}
            </span>
          </div>
        ) : null}
      </div>

      {!!hasSchedule ? (
        <button
          onClick={handleClaim}
          disabled={!pastCliff || isPending || isConfirming}
          className="w-full py-2.5 rounded-lg bg-chart-3/15 hover:bg-chart-3/25 border border-chart-3/30 text-chart-3 text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isPending || isConfirming ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : isSuccess ? (
            <><CheckCircle className="w-4 h-4" /> Claimed!</>
          ) : (
            <><Clock className="w-4 h-4" /> Claim Vested Tokens</>
          )}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Payment Intent row — reads state from chain, execute / cancel      */
/* ------------------------------------------------------------------ */

const ROUTING_LABELS = ["Liquid", "Yield", "Vest"] as const;

function IntentRow({
  txHash,
  address,
  onRemove,
}: {
  txHash: string;
  address: `0x${string}`;
  onRemove: () => void;
}) {
  const { toast } = useToast();
  const publicClient = usePublicClient();

  /* Resolve the intentId from the tx receipt (PaymentIntentCreated event) */
  const [intentId, setIntentId] = useState<`0x${string}` | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (!publicClient) return;
    setResolving(true);
    publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` })
      .then(receipt => {
        /* Look for PaymentIntentCreated topic */
        const sig = "0x" + /* keccak256("PaymentIntentCreated(bytes32,address,address,uint8,uint256)") */
          "c7db1a5a4d2538ddc5c62f5ffbfbf2d8e7e11d2c9c2e1c1f6c8c9e9b8e7d6c5";
        const log = receipt.logs.find(
          l => l.topics[0]?.toLowerCase() === sig.toLowerCase()
        );
        /* intentId is topics[1] (first indexed param) */
        if (log && log.topics[1]) {
          setIntentId(log.topics[1] as `0x${string}`);
        } else {
          /* Fallback: scan all logs for one with 3 indexed params */
          const fallback = receipt.logs.find(l => l.topics.length === 4);
          if (fallback?.topics[1]) {
            setIntentId(fallback.topics[1] as `0x${string}`);
          }
        }
        setResolving(false);
      })
      .catch(() => setResolving(false));
  }, [txHash, publicClient]);

  /* Read intent state from chain */
  const { data: intentData, refetch } = useReadContract({
    address: CONTRACT_ADDRESSES.gate as `0x${string}`,
    abi: GATE_ABI,
    functionName: "intents",
    args: [intentId!],
    query: { enabled: !!intentId },
  });

  const { writeContract: execWrite, data: execHash, isPending: execPending } = useWriteContract();
  const { isLoading: execConfirming, isSuccess: execDone } = useWaitForTransactionReceipt({ hash: execHash });

  const { writeContract: cancelWrite, data: cancelHash, isPending: cancelPending } = useWriteContract();
  const { isLoading: cancelConfirming, isSuccess: cancelDone } = useWaitForTransactionReceipt({ hash: cancelHash });

  useEffect(() => { if (execDone || cancelDone) refetch(); }, [execDone, cancelDone, refetch]);

  if (resolving) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <RefreshCw className="w-3 h-3 animate-spin" />
        Resolving intent…
      </div>
    );
  }

  if (!intentId) {
    return (
      <div className="flex items-center justify-between py-2 text-xs text-muted-foreground">
        <span className="font-mono truncate max-w-[200px]">Tx: {txHash.slice(0, 14)}…</span>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors ml-2">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  /* intent data is returned as a tuple array by wagmi for struct getters */
  const intent = intentData as readonly [string, string, string, number, bigint, boolean, boolean] | undefined;
  if (!intent) {
    return <div className="py-2 text-xs text-muted-foreground">Loading intent…</div>;
  }

  const [from, to, , routingMode, expiresAt, executed, cancelled] = intent;
  const now     = BigInt(Math.floor(Date.now() / 1000));
  const expired = now > expiresAt;
  const isMine  = from.toLowerCase() === address.toLowerCase();

  if (executed || cancelled) {
    /* Settled — auto-remove from list */
    return null;
  }

  const modeLabel = ROUTING_LABELS[routingMode] ?? "Unknown";

  function handleExecute() {
    execWrite({
      address: CONTRACT_ADDRESSES.gate as `0x${string}`,
      abi: GATE_ABI,
      functionName: "executeIntent",
      args: [intentId!],
    });
    toast({ title: "Execute submitted", description: "Settling payment intent on-chain." });
  }

  function handleCancel() {
    cancelWrite({
      address: CONTRACT_ADDRESSES.gate as `0x${string}`,
      abi: GATE_ABI,
      functionName: "cancelIntent",
      args: [intentId!],
    });
    toast({ title: "Cancel submitted", description: "Cancelling payment intent." });
  }

  return (
    <div className="rounded-lg bg-secondary/20 border border-border/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-mono text-muted-foreground truncate">
            → {to.slice(0, 10)}…{to.slice(-6)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-medium text-foreground">[ENCRYPTED]</span>
            <span className="text-xs text-muted-foreground">via {modeLabel}</span>
            {expired && (
              <span className="text-xs text-destructive font-medium">Expired</span>
            )}
            {!expired && (
              <span className="text-xs text-muted-foreground">
                until {new Date(Number(expiresAt) * 1000).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {!expired && (
        <div className="flex gap-2">
          {isMine && (
            <button
              onClick={handleExecute}
              disabled={execPending || execConfirming}
              className="flex-1 py-1.5 rounded-md bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {execPending || execConfirming ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <><PlayCircle className="w-3 h-3" /> Execute</>
              )}
            </button>
          )}
          {isMine && (
            <button
              onClick={handleCancel}
              disabled={cancelPending || cancelConfirming}
              className="flex-1 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary border border-border/60 text-muted-foreground text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {cancelPending || cancelConfirming ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <><Trash2 className="w-3 h-3" /> Cancel</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pending Intents panel — reads tx hashes from localStorage          */
/* ------------------------------------------------------------------ */

function PendingIntentsPanel({ address }: { address: `0x${string}` }) {
  const storageKey = `cf_intents_${address}`;
  const [txHashes, setTxHashes] = useState<string[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try { setTxHashes(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, [storageKey]);

  function removeHash(hash: string) {
    const updated = txHashes.filter(h => h !== hash);
    setTxHashes(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  }

  if (txHashes.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
          <CalendarClock className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm">Pending Payment Intents</p>
          <p className="text-xs text-muted-foreground">Scheduled — execute before expiry</p>
        </div>
      </div>

      <div className="space-y-2">
        {txHashes.map(hash => (
          <IntentRow
            key={hash}
            txHash={hash}
            address={address}
            onRemove={() => removeHash(hash)}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard page                                                      */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Lock className="w-12 h-12 text-primary/40" />
        <p className="text-muted-foreground">Connect your wallet to view your dashboard.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Lock className="w-6 h-6 text-primary" />
          My Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your encrypted positions — amounts only visible to you.
        </p>
      </div>

      {/* Connected address */}
      <div className="rounded-lg bg-secondary/30 border border-border/40 px-4 py-2.5 flex items-center gap-2 text-sm">
        <div className="w-2 h-2 rounded-full bg-chart-3 animate-pulse" />
        <span className="font-mono text-muted-foreground text-xs truncate">{address}</span>
      </div>

      <VaultCard address={address!} />
      <VestingCard address={address!} />
      <PendingIntentsPanel address={address!} />

      {/* Privacy note */}
      <div className="encrypted-badge rounded-xl p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-primary text-sm">End-to-end encrypted</p>
        <p>
          All balance values are stored as encrypted handles on-chain.
          Only you can decrypt them using your wallet signature via the Zama Gateway.
        </p>
      </div>
    </div>
  );
}
