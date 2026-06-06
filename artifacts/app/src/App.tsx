import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { wagmiConfig, rainbowKitTheme } from "@/lib/wagmi";
import {
  relayerInstance,
  zamaSigner,
  zamaStorage,
  SEPOLIA_CHAIN_ID,
  RelayerStatusContext,
  type RelayerStatus,
} from "@/lib/fhevm";
import Layout from "@/components/Layout";
import SendPage from "@/pages/Send";
import DashboardPage from "@/pages/Dashboard";
import AdminPage from "@/pages/Admin";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

/* ------------------------------------------------------------------ */
/*  RouterWithZama                                                       */
/*  - Polls relayerInstance.status to derive UI status (dot colour).   */
/*  - ZamaProvider is mounted immediately (it handles async init       */
/*    internally); routes render without a loading gate.               */
/* ------------------------------------------------------------------ */

function sdkStatusToRelayer(s: string): RelayerStatus {
  if (s === "ready") return "ready";
  if (s === "error") return "error";
  return "connecting";
}

function RouterWithZama() {
  const [relayerStatus, setRelayerStatus] = useState<RelayerStatus>(
    sdkStatusToRelayer(relayerInstance.status),
  );

  useEffect(() => {
    let id: ReturnType<typeof setInterval>;
    let retries = 0;
    const MAX_RETRIES = 20;

    /* getPublicParams() triggers the WASM worker init.
       Without it, RelayerWeb stays "idle" indefinitely (lazy init). */
    async function kickInit() {
      try {
        await relayerInstance.getPublicParams(SEPOLIA_CHAIN_ID);
      } catch (_) {
        /* status will be "error"; the setInterval retry loop calls kickInit again */
      }
    }

    kickInit();

    id = setInterval(() => {
      const s = relayerInstance.status;
      if (s === "ready") {
        setRelayerStatus("ready");
        clearInterval(id);
      } else if (s === "error") {
        retries++;
        if (retries >= MAX_RETRIES) {
          setRelayerStatus("error");
          clearInterval(id);
        } else {
          kickInit();
        }
      }
    }, 500);

    return () => clearInterval(id);
  }, []);

  return (
    <RelayerStatusContext.Provider value={relayerStatus}>
      <ZamaProvider
        relayer={relayerInstance}
        signer={zamaSigner}
        storage={zamaStorage}
      >
        <Layout>
          <Switch>
            <Route path="/" component={SendPage} />
            <Route path="/dashboard" component={DashboardPage} />
            <Route path="/admin" component={AdminPage} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </ZamaProvider>
    </RelayerStatusContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  App root                                                             */
/* ------------------------------------------------------------------ */

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowKitTheme}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <RouterWithZama />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
