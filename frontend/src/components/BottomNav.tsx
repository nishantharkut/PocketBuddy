import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, List, ShoppingCart, Settings } from "lucide-react";

const tabs = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, id: "nav-dashboard" },
  { to: "/transactions", label: "History", icon: List, id: "nav-transactions" },
  { to: "/pool", label: "Pool", icon: ShoppingCart, id: "nav-pool" },
  { to: "/settings", label: "Settings", icon: Settings, id: "nav-settings" },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/90 backdrop-blur-lg shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid h-16 grid-cols-4">
        {tabs.map((t) => {
          const active = pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <li key={t.to} className="relative">
              <Link
                to={t.to}
                id={t.id}
                className={`flex h-full flex-col items-center justify-center gap-1 transition-colors duration-150 ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-10 bg-primary rounded-full" />
                )}
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-medium tracking-wide">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
