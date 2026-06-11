import type { Metadata } from "next";

import { MatchesScreen } from "@/components/match/matches-screen";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.matches.title };

export default function MatchesPage() {
  return <MatchesScreen />;
}
