import type { Metadata } from "next";

import { TodayScreen } from "@/components/match/today-screen";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.today.title };

export default function TodayPage() {
  return <TodayScreen />;
}
