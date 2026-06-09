import { ExternalLink, History } from "lucide-react";
import { useTxHistory, type TxRecord } from "@/hooks/useTxHistory";

function StatusBadge({ status }: { status: TxRecord["status"] }) {
  return status === "success" ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-chart-3/15 text-chart-3 border border-chart-3/20">
      success
    </span>
  ) : (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/15 text-destructive border border-destructive/20">
      failed
    </span>
  );
}

export default function TxHistoryTable() {
  const { history } = useTxHistory();

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <History className="w-4 h-4" />
        Transaction History
        {history.length > 0 && (
          <span className="ml-auto text-xs bg-secondary/60 px-1.5 py-0.5 rounded font-mono">
            {history.length}
          </span>
        )}
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 text-center py-4">
          No transactions yet — activity will appear here after each action.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/40 text-muted-foreground">
                <th className="text-left pb-2 pr-3 font-medium">Time</th>
                <th className="text-left pb-2 pr-3 font-medium">Action</th>
                <th className="text-left pb-2 pr-3 font-medium">Status</th>
                <th className="text-left pb-2 font-medium">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {history.map((rec, i) => (
                <tr
                  key={i}
                  className="border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors"
                >
                  <td className="py-2 pr-3 text-muted-foreground/70 whitespace-nowrap">
                    {rec.timestamp}
                  </td>
                  <td className="py-2 pr-3 font-medium">{rec.action}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={rec.status} />
                  </td>
                  <td className="py-2">
                    <a
                      href={rec.etherscanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      View on Etherscan
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
