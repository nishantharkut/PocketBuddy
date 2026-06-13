import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, List, ShoppingCart, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const tabs = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, id: "nav-dashboard" },
  { to: "/transactions", label: "History", icon: List, id: "nav-transactions" },
  { to: "/pool", label: "Pool", icon: ShoppingCart, id: "nav-pool" },
  { to: "/settings", label: "Settings", icon: Settings, id: "nav-settings" },
] as const;

export function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-[color:var(--surface)]/80 backdrop-blur-md supports-[backdrop-filter]:bg-[color:var(--surface)]/60 shadow-sm transition-all">
      <div className="flex h-16 items-center px-4 md:px-6 w-full max-w-5xl mx-auto">
        <Link to="/dashboard" className="flex items-center gap-2 mr-6 transition-transform hover:scale-105">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[color:var(--pb-purple)] to-[color:var(--pb-blue)] flex items-center justify-center shadow-lg shadow-[color:var(--pb-purple)]/20">
            <span className="text-white font-bold text-lg leading-none tracking-tighter">P</span>
          </div>
          <span className="font-bold text-lg tracking-tight hidden sm:block bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            PocketBuddy
          </span>
        </Link>
        <div className="flex flex-1 items-center space-x-1 sm:space-x-2">
          {tabs.map((t) => {
            const active = pathname === t.to || pathname.startsWith(t.to + "/");
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                id={t.id}
                className={`group flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all duration-300 ease-out hover:bg-white/5 active:scale-95 ${
                  active
                    ? "bg-[color:var(--pb-purple)]/10 text-[color:var(--pb-purple)] shadow-[0_0_15px_-3px_var(--pb-purple)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon
                  className={`h-4 w-4 transition-transform duration-300 ${
                    active ? "scale-110" : "group-hover:scale-110"
                  }`}
                />
                <span className="hidden sm:block">{t.label}</span>
              </Link>
            );
          })}
        </div>
        
        {user && (
          <div className="ml-auto flex items-center space-x-3">
            <Link 
              to="/dashboard" 
              className="flex items-center justify-center h-8 px-3 rounded-full bg-[color:var(--pb-purple)] text-white text-xs font-semibold tracking-wide hover:bg-[color:var(--pb-purple)]/90 transition-colors shadow-md shadow-[color:var(--pb-purple)]/20 active:scale-95"
            >
              + Log Txn
            </Link>
            <Link to="/settings" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[color:var(--pb-blue)]/80 to-[color:var(--pb-purple)]/80 flex items-center justify-center border border-white/10 shadow-inner">
                <span className="text-xs text-white font-medium">
                  {user.email ? user.email.charAt(0).toUpperCase() : "U"}
                </span>
              </div>
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
