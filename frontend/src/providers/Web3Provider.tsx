"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { hardhat, sepolia } from "viem/chains";
import { defineChain } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// Polygon Amoy testnet
const amoy = defineChain({
  id: 80002,
  name: "Polygon Amoy",
  network: "amoy",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology"],
    },
    public: {
      http: ["https://rpc-amoy.polygon.technology"],
    },
  },
  blockExplorers: {
    default: {
      name: "PolygonScan",
      url: "https://amoy.polygonscan.com",
    },
  },
});

const enableLocalChain = process.env.NEXT_PUBLIC_ENABLE_LOCAL_CHAIN === "true";
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const amoyRpcUrl = process.env.NEXT_PUBLIC_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
const connectors = [
  metaMask({
    dappMetadata: {
      name: "VaxiTrust",
      url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    },
  }),
] as const;

// Default to Amoy for production, Sepolia for local dev
const useAmoy = process.env.NEXT_PUBLIC_USE_AMOY !== "false";

const wagmiConfig = useAmoy
  ? createConfig({
      chains: [amoy],
      connectors,
      transports: { [amoy.id]: http(amoyRpcUrl) },
    })
  : enableLocalChain
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
      transports: { [sepolia.id]: http(sepoliaRpcUrl) },
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
