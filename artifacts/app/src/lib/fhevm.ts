/* FHE client-side helpers using @zama-fhe/relayer-sdk/web */

/* Hardcoded Zama Relayer endpoint — do not read from env at runtime */
const RELAYER_URL = "https://relayer.zama.ai";

/* 30-second budget for any Relayer operation */
const ENCRYPT_TIMEOUT_MS = 30_000;

/* Singleton + dedup guard: a second call before the first resolves
   returns the same promise instead of spawning a second create(). */
let relayerInstance: any = null;
let initPromise: Promise<any> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let id: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    id = setTimeout(
      () =>
        reject(
          new Error(
            `${label} timed out after ${ms / 1000}s. ` +
              "The Zama Relayer may be unavailable. Try again."
          )
        ),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(id!));
}

export async function getRelayer(): Promise<any> {
  if (relayerInstance) return relayerInstance;
  if (initPromise) return initPromise;

  /* Use the /web subpath — the root package has no "." export.
   * RelayerWeb is a runtime export; the TS declaration file omits it. */
  // @ts-ignore
  const { RelayerWeb } = await import("@zama-fhe/relayer-sdk/web");

  if (!RelayerWeb) {
    throw new Error(
      "RelayerWeb not found in @zama-fhe/relayer-sdk/web. " +
        "The SDK may have changed its export shape."
    );
  }

  initPromise = withTimeout(
    RelayerWeb.create({
      gatewayUrl: RELAYER_URL,
      networkUrl:
        import.meta.env.VITE_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org",
    }),
    ENCRYPT_TIMEOUT_MS,
    "Relayer initialization"
  ).then((instance: any) => {
    relayerInstance = instance;
    return instance;
  });

  return initPromise;
}

export async function encryptUint64(
  value: bigint,
  contractAddress: string,
  userAddress: string,
  onEncrypted?: () => void
): Promise<{ handle: `0x${string}`; inputProof: `0x${string}` }> {
  const relayer = await getRelayer();
  const input = relayer.createEncryptedInput(contractAddress, userAddress);
  input.add64(value);

  /* encrypt() may be sync or async depending on SDK version — await both cases */
  const { handles, inputProof } = await withTimeout(
    Promise.resolve(input.encrypt()),
    ENCRYPT_TIMEOUT_MS,
    "Encryption"
  );

  onEncrypted?.();

  return {
    handle: handles[0] as `0x${string}`,
    inputProof: inputProof as `0x${string}`,
  };
}

/* Formats an encrypted handle for display */
export function formatEncryptedHandle(handle: `0x${string}`): string {
  if (!handle || handle === "0x" + "0".repeat(64)) return "0x0000…0000";
  return handle.slice(0, 10) + "…" + handle.slice(-8);
}
