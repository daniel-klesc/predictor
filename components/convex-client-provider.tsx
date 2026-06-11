"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";

/**
 * NEXT_PUBLIC_CONVEX_URL must point at your Convex deployment at runtime
 * (see .env.example). The placeholder only keeps `next build` working in
 * environments where no deployment has been provisioned yet — the client
 * never connects until a Convex hook is mounted.
 */
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://placeholder.convex.cloud";

const convex = new ConvexReactClient(convexUrl);

export function ConvexClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
