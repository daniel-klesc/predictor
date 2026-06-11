import type { Metadata } from "next";

import { ThreadListScreen } from "@/components/chat/thread-list-screen";
import { en } from "@/lib/strings/en";

export const metadata: Metadata = { title: en.screens.chat.title };

export default function ChatPage() {
  return <ThreadListScreen />;
}
