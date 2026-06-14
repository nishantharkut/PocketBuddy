import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { 
  LayoutDashboard, 
  List, 
  ShoppingCart, 
  Settings, 
  ChevronLeft, 
  ChevronRight, 
  Menu, 
  X, 
  Plus,
  Sun,
  Moon
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BottomNav } from "./BottomNav";

type Ctx = { 
  collapsed: boolean; 
  toggle: () => void; 
  mobileOpen: boolean; 
  setMobileOpen: (v: boolean) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
};
const SidebarCtx = createContext<Ctx | null>(null);

const tabs = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, id: "nav-dashboard" },
  { to: "/transactions", label: "History", icon: List, id: "nav-transactions" },
  { to: "/pool", label: "Pool", icon: ShoppingCart, id: "nav-pool" },
  { to: "/settings", label: "Settings", icon: Settings, id: "nav-settings" },
] as const;

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { collapsed } = useContext(SidebarCtx)!;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();

  return (
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-5 ${collapsed ? "pt-6 pb-2 justify-center px-3" : "pt-6 pb-2"}`}>
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-sm rotate-45 bg-primary">
          <div className="h-3 w-3 -rotate-45 rounded-full bg-background" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-display text-[16px] font-bold leading-none tracking-tight text-foreground truncate">
              POCKETBUDDY
            </h1>
            <span className="mt-1 block text-[10px] font-medium tracking-[0.18em] uppercase text-muted-foreground/70">
              Campus Financial Guard
            </span>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <div className="px-3 pb-4 border-b border-border/50 mb-4">
        <CollapseToggle onNavigate={onNavigate} />
      </div>

      {/* Action Button: Log Txn */}
      {user && (
        <div className="mb-4 px-3">
          {!collapsed ? (
            <Link 
              to="/dashboard?log=true" 
              onClick={onNavigate}
              className="flex items-center justify-center gap-2 h-10 w-full rounded-lg bg-foreground text-background text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[3]" />
              <span>Log Transaction</span>
            </Link>
          ) : (
            <Link 
              to="/dashboard?log=true" 
              onClick={onNavigate}
              title="Log Transaction"
              className="flex items-center justify-center h-10 w-10 mx-auto rounded-lg bg-foreground text-background transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer"
            >
              <Plus className="h-5 w-5 stroke-[3]" />
            </Link>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {tabs.map((t) => {
            const active = pathname === t.to || pathname.startsWith(t.to + "/");
            const Icon = t.icon;
            return (
              <li key={t.to}>
                <Link
                  to={t.to}
                  id={t.id}
                  onClick={onNavigate}
                  title={collapsed ? t.label : undefined}
                  className={`group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition-colors ${
                    active
                      ? "bg-surface-raised text-foreground"
                      : "text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                  } ${collapsed ? "justify-center px-2" : ""}`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 w-[2px] rounded-r bg-primary" />
                  )}
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "" : "opacity-60 group-hover:opacity-100"}`} />
                  {!collapsed && <span className="truncate font-medium">{t.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: User profile + Sync Active + collapse */}
      <div className="border-t border-border p-3 space-y-3">
        {/* Sync active */}
        {!collapsed ? (
          <div className="rounded-lg border border-border bg-surface-raised/50 p-3">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-pb-green pulse-dot" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Sync Active</span>
            </div>
            <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
              Auto-tracking on companion
            </p>
          </div>
        ) : (
          <div className="grid place-items-center py-2" title="Sync active">
            <span className="h-2 w-2 rounded-full bg-pb-green pulse-dot" />
          </div>
        )}

        {/* User Profile */}
        {user && (
          <div className="border-t border-border pt-3">
            {!collapsed ? (
              <Link to="/settings" onClick={onNavigate} className="flex items-center gap-3 hover:bg-surface-raised p-2 rounded-lg transition-all">
                <div className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center border border-border shadow-inner shrink-0">
                  <span className="text-xs text-foreground font-bold font-display">
                    {user.email ? user.email.charAt(0).toUpperCase() : "U"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-foreground truncate">{user.fullName || "User"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{user.email || ""}</p>
                </div>
              </Link>
            ) : (
              <Link to="/settings" onClick={onNavigate} title="Settings" className="flex justify-center py-2">
                <div className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center border border-border shadow-inner">
                  <span className="text-xs text-foreground font-bold font-display">
                    {user.email ? user.email.charAt(0).toUpperCase() : "U"}
                  </span>
                </div>
              </Link>
            )}
          </div>
        )}

        <ThemeToggle onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function ThemeToggle({ onNavigate }: { onNavigate?: () => void }) {
  const { theme, toggleTheme, collapsed } = useContext(SidebarCtx)!;
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      id="btn-theme-toggle"
      onClick={() => {
        toggleTheme();
        if (onNavigate) onNavigate();
      }}
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground transition-colors ${collapsed ? "justify-center" : ""}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
    </button>
  );
}

function CollapseToggle({ onNavigate }: { onNavigate?: () => void }) {
  const { collapsed, toggle } = useContext(SidebarCtx)!;
  return (
    <button
      id="btn-sidebar-toggle"
      onClick={() => {
        toggle();
        if (onNavigate) onNavigate();
      }}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={`mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-surface-raised hover:text-foreground transition-colors ${collapsed ? "justify-center" : ""}`}
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>}
    </button>
  );
}

export function AppShell({
  children,
  hideNav = false,
}: {
  children: ReactNode;
  hideNav?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const v = localStorage.getItem("pb_sidebar_collapsed");
    if (v === "1") setCollapsed(true);

    const savedTheme = localStorage.getItem("pb_theme") as "light" | "dark" | null;
    const t = savedTheme || "dark";
    setTheme(t);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(t);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("pb_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("pb_theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  };

  if (hideNav) {
    return (
      <div className="min-h-screen bg-background">
        <main className="w-full px-4 py-4">
          {children}
        </main>
      </div>
    );
  }

  return (
    <SidebarCtx.Provider value={{ collapsed, toggle, mobileOpen, setMobileOpen, theme, toggleTheme }}>
      <div className="min-h-screen bg-background md:flex">
        {/* Desktop sidebar */}
        <aside
          className={`hidden md:block shrink-0 border-r border-border bg-surface transition-[width] duration-200 ease-out ${
            collapsed ? "w-[68px]" : "w-64"
          }`}
        >
          <div className="sticky top-0 h-screen">
            <SidebarBody />
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-black/60"
            />
            <div className="absolute left-0 top-0 h-full w-72 border-r border-border bg-surface pb-20">
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-raised"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarBody onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="pb-20 md:pb-0 px-6 py-6 md:pl-10 md:pr-10 md:py-8 lg:pl-12 lg:pr-12 lg:py-10">{children}</div>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </SidebarCtx.Provider>
  );
}

/** Hamburger trigger for mobile — render inside page headers */
export function MobileMenuButton() {
  const ctx = useContext(SidebarCtx);
  if (!ctx) return null;
  return (
    <button
      id="btn-mobile-menu"
      onClick={() => ctx.setMobileOpen(true)}
      className="md:hidden grid h-9 w-9 place-items-center rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
      aria-label="Open menu"
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}
