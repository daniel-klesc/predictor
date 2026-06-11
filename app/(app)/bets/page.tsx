import type { Metadata } from "next";

import { BetsScreen } from "@/components/bets/bets-screen";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.bets.title };

export default function BetsPage() {
  return <BetsScreen />;
}
