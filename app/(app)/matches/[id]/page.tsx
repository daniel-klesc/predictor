import type { Metadata } from "next";

import { MatchDetailScreen } from "@/components/match/match-detail-screen";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.matchDetail.title };

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MatchDetailScreen matchId={id} />;
}
