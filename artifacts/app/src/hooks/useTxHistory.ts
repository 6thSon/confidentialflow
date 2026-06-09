import { useState, useEffect, useCallback } from "react";

export const TX_HISTORY_KEY  = "stealthpay_tx_history";
export const TX_HISTORY_EVENT = "stealthpay_tx_added";

export interface TxRecord {
  timestamp: string;
  action: string;
  status: "success" | "failed";
  txHash: string;
  etherscanUrl: string;
}

export function getTxHistory(): TxRecord[] {
  try {
    return JSON.parse(localStorage.getItem(TX_HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addTxRecord(record: {
  action: string;
  status: "success" | "failed";
  txHash: string;
}) {
  const history = getTxHistory();
  history.unshift({
    ...record,
    timestamp: new Date().toLocaleString(),
    etherscanUrl: `https://sepolia.etherscan.io/tx/${record.txHash}`,
  });
  localStorage.setItem(TX_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  window.dispatchEvent(new CustomEvent(TX_HISTORY_EVENT));
}

export function useTxHistory() {
  const [history, setHistory] = useState<TxRecord[]>([]);

  const refresh = useCallback(() => setHistory(getTxHistory()), []);

  useEffect(() => {
    refresh();
    window.addEventListener(TX_HISTORY_EVENT, refresh);
    return () => window.removeEventListener(TX_HISTORY_EVENT, refresh);
  }, [refresh]);

  return { history, refresh };
}
