import { Link, useLocation } from "wouter";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Shield, Send, LayoutDashboard, Settings, Lock } from "lucide-react";
import { useRelayerStatus, type RelayerStatus } from "@/lib/fhevm";

const NAV_LINKS = [
  { href: "/",          label: "Send",      icon: Send },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin",     label: "Admin",     icon: Settings },
];

function RelayerDot({ status }: { status: RelayerStatus }) {
  const map: Record<RelayerStatus, { color: string; label: string }> = {
    connecting: { color: "bg-yellow-400", label: "Relayer connecting…" },
    ready:      { color: "bg-emerald-400", label: "Relayer ready" },
    error:      { color: "bg-red-500",    label: "Relayer not connected" },
  };
  const { color, label } = map[status];
  return (
    <span
      title={label}
      aria-label={label}
      className="relative flex items-center justify-center w-5 h-5"
    >
      {status === "connecting" && (
        <span
          className={`absolute inline-flex h-3 w-3 rounded-full ${color} opacity-75 animate-ping`}
        />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const relayerStatus = useRelayerStatus();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top nav */}
      <header className="border-b border-border/50 bg-card/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
              <Lock className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-base tracking-tight">
              Fort<span className="text-primary">Rail</span>
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const active = location === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  ].join(" ")}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Relayer status dot + Wallet */}
          <div className="flex items-center gap-3">
            <RelayerDot status={relayerStatus} />
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus="avatar"
            />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-4 text-center text-xs text-muted-foreground">
        <span className="flex items-center justify-center gap-1.5">
          <Shield className="w-3 h-3 text-primary" />
          Powered by Zama FHEVM — all amounts encrypted end-to-end
        </span>
      </footer>
    </div>
  );
}
