"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { hardhat, sepolia } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const enableLocalChain = process.env.NEXT_PUBLIC_ENABLE_LOCAL_CHAIN === "true";
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const connectors = [
  metaMask({
    dappMetadata: {
      name: "VaxiTrust",
      url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    },
  }),
] as const;

const wagmiConfig = enableLocalChain
  ? createConfig({
      chains: [sepolia, hardhat],
      connectors,
      transports: {
        [sepolia.id]: http(sepoliaRpcUrl),
        [hardhat.id]: http("http://127.0.0.1:8545"),
      },
    })
  : createConfig({
      chains: [sepolia],
      connectors,
      transports: {
        [sepolia.id]: http(sepoliaRpcUrl),
      },
    });

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
      })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
