import { AppShell } from "@/components/app-shell";
import { BrowserNotifier } from "@/components/browser-notifier";
import { ThemeSync } from "@/components/theme-sync";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ThemeSync />
      <BrowserNotifier />
      <AppShell>{children}</AppShell>
    </>
  );
}
