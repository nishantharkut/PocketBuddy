import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, LayoutDashboard, List, ShoppingCart, Compass } from "lucide-react";

const tabs = [
  { to: "/dashboard", search: undefined, label: "Dashboard", icon: LayoutDashboard, id: "nav-dashboard" },
  { to: "/transactions", search: { view: "ledger", tab: "daily" }, label: "Transactions", icon: List, id: "nav-transactions" },
  { to: "/runway", search: undefined, label: "Runway", icon: Activity, id: "nav-runway" },
  { to: "/pool", search: undefined, label: "Pool", icon: ShoppingCart, id: "nav-pool" },
  { to: "/travel", search: undefined, label: "Travel", icon: Compass, id: "nav-travel" },
] as const;

export function BottomNav() {
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/90 backdrop-blur-lg shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid h-16 grid-cols-5">
        {tabs.map((t) => {
          const active = pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <li key={t.id} className="relative">
              <Link
                to={t.to}
                search={t.search}
                id={t.id}
                className={`flex h-full flex-col items-center justify-center gap-1 transition-colors duration-150 ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                )}
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-semibold tracking-normal">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
