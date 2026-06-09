import { useState } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { useToast } from "@/hooks/use-toast";
import { addTxRecord } from "@/hooks/useTxHistory";

export type TxFlowState = "idle" | "pending" | "confirming" | "success" | "error";

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

    let hash: `0x${string}`;
    try {
      hash = await contractCall();
    } catch (err: any) {
      setFlowState("error");
      const raw = err?.shortMessage ?? err?.message ?? "";
      const msg = raw.includes("User rejected")
        ? "Transaction rejected by user"
        : raw || "Transaction rejected by user";
      toast({ title: "❌ Failed", description: msg, variant: "destructive" });
      setTimeout(() => setFlowState("idle"), 2500);
      return null;
    }

    setFlowState("confirming");
    const short = `${hash.slice(0, 10)}...${hash.slice(-6)}`;
    toast({
      title: "🔄 Transaction submitted",
      description: `Waiting for confirmation… (tx: ${short}) — view on Etherscan`,
    });

    try {
      if (!publicClient) throw new Error("No public client");
      await publicClient.waitForTransactionReceipt({ hash });
    } catch (err: any) {
      addTxRecord({ action: actionName, status: "failed", txHash: hash });
      setFlowState("error");
      const raw = err?.shortMessage ?? err?.message ?? "Transaction reverted";
      toast({ title: "❌ Failed on-chain", description: raw, variant: "destructive" });
      setTimeout(() => setFlowState("idle"), 2500);
      return null;
    }

    addTxRecord({ action: actionName, status: "success", txHash: hash });
    setFlowState("success");
    toast({
      title: `✅ ${actionName} successful!`,
      description: successDetail ?? "",
    });
    setTimeout(() => setFlowState("idle"), 4000);
    return hash;
  }

  return { flowState, isBusy, runTx, writeContractAsync };
}
