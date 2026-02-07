"use client";

import { type ReactNode, useEffect } from "react";
import { base } from "wagmi/chains";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import sdk from "@farcaster/frame-sdk";

function MiniAppReady() {
  useEffect(() => {
    sdk.actions.ready({});
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MiniKitProvider
      apiKey={process.env.NEXT_PUBLIC_CDP_CLIENT_API_KEY}
      chain={base}
    >
      <MiniAppReady />
      {children}
    </MiniKitProvider>
  );
}
