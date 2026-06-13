import { type ReactNode } from "react";
import { TopNav } from "./TopNav";

export function AppShell({
  children,
  hideNav = false,
}: {
  children: ReactNode;
  hideNav?: boolean;
}) {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col font-sans selection:bg-[color:var(--pb-purple)]/30 selection:text-[color:var(--pb-purple)]">
      {!hideNav && <TopNav />}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-6 pb-12 pt-6">
        {children}
      </main>
    </div>
  );
}
