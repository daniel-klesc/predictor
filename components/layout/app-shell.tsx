import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";

/** 480px centered single-column shell: header / scrollable main / bottom nav. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col">
      <AppHeader />
      <OfflineIndicator />
      <main className="flex-1 overflow-y-auto px-4 pb-4">{children}</main>
      <InstallPrompt />
      <BottomNav />
    </div>
  );
}
