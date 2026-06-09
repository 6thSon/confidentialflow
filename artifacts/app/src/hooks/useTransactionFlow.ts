import { useState } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { useToast } from "@/hooks/use-toast";
import { addTxRecord } from "@/hooks/useTxHistory";

export type TxFlowState = "idle" | "pending" | "confirming" | "success" | "error";

/* Friendly error messages for known on-chain revert reasons. */
const KNOWN_ERRORS: Record<string, string> = {
  "Sender is sanctioned":
    "🚫 Your wallet has been sanctioned and cannot send payments",
  "Recipient is sanctioned":
    "🚫 The recipient wallet is sanctioned and cannot receive payments",
  "no deposit":
    "💳 You must deposit cUSDT into the gate before routing payments",
  "insufficient balance":
    "💳 Insufficient balance in gate — deposit more cUSDT first",
  "User rejected":
    "Transaction cancelled — rejected in wallet",
};

function parseErrorMessage(raw: string): string {
  for (const [key, friendly] of Object.entries(KNOWN_ERRORS)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return friendly;
  }
  return raw || "Unknown error";
}

interface RunTxOptions {
  actionName: string;
  pendingDetail?: string;
  contractCall: () => Promise<`0x${string}`>;
  successDetail?: string;
}

export function useTransactionFlow() {
  const [flowState, setFlowState] = useState<TxFlowState>("idle");
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const isBusy = flowState === "pending" || flowState === "confirming";

  async function runTx({
    actionName,
    pendingDetail,
    contractCall,
    successDetail,
  }: RunTxOptions): Promise<`0x${string}` | null> {
    setFlowState("pending");
    toast({
      title: `⏳ ${actionName} pending`,
      description: pendingDetail ?? "Check your wallet to confirm",
    });

    /* ── Step 1: Submit — get transaction hash ──────────────────────── */
    let hash: `0x${string}`;
    try {
      hash = await contractCall();
    } catch (err: any) {
      setFlowState("error");
      const raw = err?.shortMessage ?? err?.message ?? "";
      toast({
        title: "❌ Failed",
        description: parseErrorMessage(raw),
        variant: "destructive",
      });
      setTimeout(() => setFlowState("idle"), 2500);
      return null;
    }

    /* ── Step 2: Wait for receipt with 1 confirmation ───────────────── */
    setFlowState("confirming");
    const short = `${hash.slice(0, 10)}…${hash.slice(-6)}`;
    const explorerUrl = `https://sepolia.etherscan.io/tx/${hash}`;
    toast({
      title: "🔄 Transaction submitted",
      description: `Waiting for on-chain confirmation… (${short})`,
    });

    let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;
    try {
      if (!publicClient) throw new Error("No public client");
      receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
    } catch (err: any) {
      /* Network / timeout error — tx may or may not have confirmed. */
      addTxRecord({ action: actionName, status: "failed", txHash: hash });
      setFlowState("error");
      const raw = err?.shortMessage ?? err?.message ?? "Could not fetch receipt";
      toast({
        title: "❌ Receipt error",
        description: `${parseErrorMessage(raw)} — ${explorerUrl}`,
        variant: "destructive",
      });
      setTimeout(() => setFlowState("idle"), 2500);
      return null;
    }

    /* ── Step 3: Check on-chain status ──────────────────────────────── */
    if (receipt.status === "reverted") {
      addTxRecord({ action: actionName, status: "failed", txHash: hash });
      setFlowState("error");
      toast({
        title: "❌ Transaction reverted on-chain",
        description: `The contract rejected this transaction. Check Etherscan for the revert reason: ${explorerUrl}`,
        variant: "destructive",
      });
      setTimeout(() => setFlowState("idle"), 2500);
      return null;
    }

    /* ── Step 4: Confirmed success ──────────────────────────────────── */
    addTxRecord({ action: actionName, status: "success", txHash: hash });
    setFlowState("success");
    toast({
      title: `✅ ${actionName} confirmed on-chain!`,
      description: successDetail ?? `View on Etherscan: ${explorerUrl}`,
    });
    setTimeout(() => setFlowState("idle"), 4000);
    return hash;
  }

  return { flowState, isBusy, runTx, writeContractAsync };
}
