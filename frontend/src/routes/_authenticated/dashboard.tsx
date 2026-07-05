import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  Plus, ChevronRight, AlertTriangle, Utensils, ShoppingBag,
  Receipt, Wallet, Timer, MapPin, Compass, TrendingDown, X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import {
  rupees,
  shortDate,
  relativeTime,
  getCycleStart,
  getCycleEnd,
  daysBetween,
  isTimeInRange,
  fmtTime,
} from "@/lib/format";
import {
  getProfile,
  getTransactions,
  getCampusFood,
  getSubscriptions,
  getCartPools,
  insertTransaction,
  insertCheckinLog,
  identifyMerchant,
  getDashboardInsights,
  getCampusIntel,
  getWingFeed,
  getWellnessInsights,
  getWellnessCoach,
  updateTransaction,
  getCatalog,
  addCatalogItem,
  getTravelSavings,
  scanMenuPhoto,
  verifyCampusFoodItem,
  submitParserCorrection,
  getWingNettedBalances,
} from "@/lib/api/db.functions";


const ROUTINE_SIGNAL_KEYS = new Set(["food_gap", "late_night", "exam", "runway", "velocity"]);

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      log: search.log === "true" || search.log === true || undefined
    };
  },
  component: Dashboard,
});

type Profile = any;
type Txn = any;
type Food = any;
type Sub = any;
type Pool = any;
type PoolItem = any;

const FALLBACK_CATEGORIES = [
  { v: "food", l: "Food" },
  { v: "stationery", l: "Stationery" },
  { v: "travel", l: "Travel" },
  { v: "subscription", l: "Subscription" },
  { v: "other", l: "Other" },
] as const;

// ── Category accent colours ──────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  food: "#C27D56",
  stationery: "#5E17EB",
  travel: "#2563EB",
  subscription: "#F7EC13",
  other: "#6b7280",
};

function CountUp({ to, duration = 400 }: { to: number; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <span className="tnum">{v}</span>;
}

// ── Mini bar chart ───────────────────────────────────────────────────────
function SpendBar({ days }: { days: { date: string; amount_paise: number }[] }) {
  const max = Math.max(...days.map((d) => d.amount_paise), 1);
  return (
    <div className="flex items-end gap-1.5 h-16">
      {days.map((d, i) => {
        const pct = (d.amount_paise / max) * 100;
        const isToday = i === days.length - 1;
        return (
          <div key={d.date} className="flex flex-col items-center gap-1 flex-1">
            <div className="relative w-full flex items-end" style={{ height: "44px" }}>
              <div
                className="w-full rounded-sm transition-all duration-700"
                style={{
                  height: `${Math.max(pct, 6)}%`,
                  background: isToday
                    ? "linear-gradient(to top, var(--primary), var(--color-pb-amber))"
                    : "rgba(255,255,255,0.1)",
                }}
              />
            </div>
            <span className={`text-[8px] font-bold uppercase tracking-wide ${isToday ? "text-primary" : "text-zinc-600"}`}>
              {d.date}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Burnout Risk Gauge (SVG arc) ────────────────────────────────────────
function BurnoutGauge({ score }: { score: number }) {
  const r = 54, cx = 70, cy = 70;
  const startAngle = 200, endAngle = 340;
  const range = endAngle - startAngle;
  const angleNow = startAngle + (score / 100) * range;
  const toRad = (a: number) => (a * Math.PI) / 180;
  const arcX = (a: number) => cx + r * Math.cos(toRad(a));
  const arcY = (a: number) => cy + r * Math.sin(toRad(a));
  const largeArc = range > 180 ? 1 : 0;
  const trackPath = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${largeArc} 1 ${arcX(endAngle)} ${arcY(endAngle)}`;
  const filledAngle = startAngle + (score / 100) * range;
  const filledLargeArc = (filledAngle - startAngle) > 180 ? 1 : 0;
  const fillPath = score > 0
    ? `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${filledLargeArc} 1 ${arcX(filledAngle)} ${arcY(filledAngle)}`
    : "";
  const color = score >= 70 ? "#ef4444" : score >= 40 ? "#f59e0b" : "#4ade80";
  const label = score >= 70 ? "HIGH RISK" : score >= 40 ? "MODERATE" : "HEALTHY";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="140" height="100" viewBox="0 0 140 100">
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" strokeLinecap="round" />
        {fillPath && (
          <path d={fillPath} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}88)`, transition: "all 1s ease" }} />
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" fill={color} fontSize="26" fontWeight="900" fontFamily="monospace">{score}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontWeight="700" letterSpacing="2">{label}</text>
      </svg>
    </div>
  );
}

// ── Survive-Until countdown ──────────────────────────────────────────────
function SurviveCountdown({ runwayMs }: { runwayMs: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, runwayMs - Date.now());
  const days = Math.floor(remaining / 86400000);
  const hrs = Math.floor((remaining % 86400000) / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const parts = [
    ...(days > 0 ? [{ value: String(days), label: "d" }] : []),
    { value: pad(hrs), label: "h" },
    { value: pad(mins), label: "m" },
    { value: pad(secs), label: "s", pulse: true },
  ];
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 tnum">
      {parts.map((part) => (
        <span key={part.label} className="inline-flex items-baseline gap-1 whitespace-nowrap">
          <span
            className="text-[23px] font-black leading-none text-foreground transition-opacity duration-300"
            style={{ opacity: part.pulse && secs % 2 !== 0 ? 0.68 : 1 }}
          >
            {part.value}
          </span>
          <span className="text-[11px] text-zinc-400 font-black leading-none">{part.label}</span>
        </span>
      ))}
    </div>
  );
}

// ── Category donut (pure SVG) ────────────────────────────────────────────
function CategoryDonut({ breakdown }: { breakdown: { category: string; pct: number; amount_paise: number }[] }) {
  const r = 36, cx = 44, cy = 44, stroke = 10;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const top5 = breakdown.slice(0, 5);

  return (
    <div className="flex items-center gap-5">
      <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        {top5.map((seg, i) => {
          const dashArr = (seg.pct / 100) * circ;
          const dashOff = circ - offset;
          const color = CAT_COLORS[seg.category] ?? "#6b7280";
          const el = (
            <circle
              key={seg.category}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={`${dashArr} ${circ - dashArr}`}
              strokeDashoffset={dashOff}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 1s ease" }}
            />
          );
          offset += dashArr + 2;
          return el;
        })}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0">
        {top5.map((seg) => (
          <div key={seg.category} className="flex items-center gap-2 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CAT_COLORS[seg.category] ?? "#6b7280" }} />
            <span className="text-[10px] text-zinc-400 capitalize truncate">{seg.category}</span>
            <span className="text-[10px] font-bold text-foreground ml-auto">{seg.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Nudge popup card ─────────────────────────────────────────────────────
function NudgeCard({
  icon: Icon, accent, title, body, onDismiss,
}: {
  icon: any; accent: string; title: string; body: string; onDismiss: () => void;
}) {
  return (
    <div
      className="relative rounded-2xl border p-4 overflow-hidden animate-[nudgePop_0.4s_cubic-bezier(0.34,1.56,0.64,1)]"
      style={{ background: `${accent}0D`, borderColor: `${accent}30` }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${accent}10, transparent 60%)` }} />
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-white/5 border border-white/10 shrink-0">
          <Icon className="h-4.5 w-4.5" style={{ color: accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: accent }}>{title}</p>
          <p className="text-xs text-zinc-300 leading-relaxed">{body}</p>
        </div>
        <button onClick={onDismiss} className="text-zinc-600 hover:text-zinc-400 text-xs shrink-0 cursor-pointer leading-none">✕</button>
      </div>
    </div>
  );
}

function ResponsiveFoodPanel({
  open,
  onOpenChange,
  isMobile,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMobile: boolean;
  children: ReactNode;
}) {
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-auto bg-background text-foreground border-t border-border">
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="dialog-campus-dining-hub" className="max-h-[85vh] max-w-4xl overflow-y-auto bg-background text-foreground border border-border">
        {children}
      </DialogContent>
    </Dialog>
  );
}

function SpendingSmartCheck({ calc }: { calc: any }) {
  const [selectedPlan, setSelectedPlan] = useState<null | "delivery" | "mess" | "maggi">(null);
  const safeDaily = calc?.safeDailyLimit ?? 200;

  if (selectedPlan === "delivery") {
    const isAboveLimit = 250 > safeDaily;
    const gap = 250 - safeDaily;
    return (
      <Card className="bg-surface border-border p-5 relative overflow-hidden transition-all duration-300">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(239,68,68,0.05), transparent 65%)" }} />
        <h4 className="text-xs font-bold tracking-[0.12em] text-zinc-500 uppercase mb-2">Food Plan: Delivery</h4>
        <div className="space-y-3">
          <p className="text-xs text-zinc-300 leading-relaxed font-medium">
            {isAboveLimit ? (
              <>
                A typical Swiggy/Zomato delivery order (~₹250) is <span className="text-pb-red font-bold">₹{gap} above</span> your safe daily spend limit of <span className="font-bold text-foreground">₹{safeDaily}</span>. Doing this daily will slash your runway early!
              </>
            ) : (
              <>
                A typical Swiggy/Zomato order (~₹250) fits within your current safe limit of <span className="font-bold text-foreground">₹{safeDaily}</span>. However, you can save more by pooling orders.
              </>
            )}
          </p>
          <div className="flex gap-2 flex-wrap">
            <Link to="/pool" className="h-8 rounded-lg bg-primary text-primary-foreground px-3 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-all">
              Join Swiggy Pool
            </Link>
            <Link to="/runway" className="h-8 rounded-lg bg-surface border border-border text-foreground px-3 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider hover:bg-surface-raised transition-all">
              Runway Sandbox
            </Link>
            <button onClick={() => setSelectedPlan(null)} className="h-8 rounded-lg bg-surface-raised text-zinc-400 px-3 text-[10px] font-bold uppercase tracking-wider hover:text-zinc-200 transition-all cursor-pointer">
              Change
            </button>
          </div>
        </div>
      </Card>
    );
  }

  if (selectedPlan === "mess") {
    return (
      <Card className="bg-surface border-border p-5 relative overflow-hidden transition-all duration-300">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(34,197,94,0.05), transparent 65%)" }} />
        <h4 className="text-xs font-bold tracking-[0.12em] text-zinc-500 uppercase mb-2">Food Plan: Hostel Mess</h4>
        <div className="space-y-3">
          <p className="text-xs text-zinc-300 leading-relaxed font-medium">
            Awesome! You've already prepaid for the hostel mess. Eating at the mess today saves ₹250 of discretionary money, helping extend your runway length.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Link to="/runway" className="h-8 rounded-lg bg-primary text-primary-foreground px-3 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-all">
              Track Projections
            </Link>
            <button onClick={() => setSelectedPlan(null)} className="h-8 rounded-lg bg-surface-raised text-zinc-400 px-3 text-[10px] font-bold uppercase tracking-wider hover:text-zinc-200 transition-all cursor-pointer">
              Change
            </button>
          </div>
        </div>
      </Card>
    );
  }

  if (selectedPlan === "maggi") {
    return (
      <Card className="bg-surface border-border p-5 relative overflow-hidden transition-all duration-300">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(245,158,11,0.05), transparent 65%)" }} />
        <h4 className="text-xs font-bold tracking-[0.12em] text-zinc-500 uppercase mb-2">Food Plan: Maggi / Tapri</h4>
        <div className="space-y-3">
          <p className="text-xs text-zinc-300 leading-relaxed font-medium">
            Budget saver! Spending only ~₹40 for tea or late night Maggi helps you stay well below your daily pace, building a safe buffer for unexpected campus expenses.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Link to="/runway" className="h-8 rounded-lg bg-primary text-primary-foreground px-3 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-all">
              Check Runway
            </Link>
            <button onClick={() => setSelectedPlan(null)} className="h-8 rounded-lg bg-surface-raised text-zinc-400 px-3 text-[10px] font-bold uppercase tracking-wider hover:text-zinc-200 transition-all cursor-pointer">
              Change
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(255,107,0,0.03), transparent 65%)" }} />
      <div className="flex items-center gap-2 mb-3">
        <Compass className="h-4.5 w-4.5 text-primary" />
        <p className="text-xs font-bold tracking-[0.15em] text-zinc-500 uppercase">Interactive Runway Check</p>
      </div>
      <p className="text-xs text-zinc-300 leading-relaxed font-medium mb-4">
        What's your plan for dinner tonight? Choose an option to see how it affects your Runway countdown.
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setSelectedPlan("delivery")}
          className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-surface-raised hover:bg-surface hover:border-primary/40 transition-all text-xs font-semibold text-foreground cursor-pointer group"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-pb-red" />
            <span>Order Swiggy / Zomato Delivery</span>
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
        </button>

        <button
          onClick={() => setSelectedPlan("mess")}
          className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-surface-raised hover:bg-surface hover:border-primary/40 transition-all text-xs font-semibold text-foreground cursor-pointer group"
        >
          <span className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-pb-green" />
            <span>Eat at Campus Hostel Mess</span>
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
        </button>

        <button
          onClick={() => setSelectedPlan("maggi")}
          className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-surface-raised hover:bg-surface hover:border-primary/40 transition-all text-xs font-semibold text-foreground cursor-pointer group"
        >
          <span className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-pb-amber" />
            <span>Late Night Maggi / Tapri (₹40)</span>
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </Card>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const isMobile = useIsMobile();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => getProfile(),
  });

  const { data: txns } = useQuery({
    queryKey: ["txns", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => getTransactions(),
  });

  const { data: insights } = useQuery({
    queryKey: ["insights", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: () => getDashboardInsights(),
  });

  const { data: wellness, isLoading: wellnessLoading, isError: wellnessError } = useQuery({
    queryKey: ["wellness-insights", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => getWellnessInsights(),
  });

  const { data: routineCoach } = useQuery({
    queryKey: ["wellness-coach", user?.id],
    enabled: !!user && !!wellness && (txns ?? []).length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => getWellnessCoach(),
  });

  const { data: campusIntel } = useQuery({
    queryKey: ["campus-intel", user?.id],
    enabled: !!user,
    staleTime: 120_000,
    retry: false,
    queryFn: () => getCampusIntel(),
  });

  const { data: wingFeed } = useQuery({
    queryKey: ["wing-feed", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
    queryFn: () => getWingFeed(),
  });
  const { data: travelSavings } = useQuery({
    queryKey: ["travel-savings", user?.id],
    enabled: !!user,
    queryFn: () => getTravelSavings(),
  });
  const { data: nettedBalances } = useQuery({
    queryKey: ["netted-balances", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => getWingNettedBalances(),
  });
  const wingEvents = wingFeed?.events ?? [];

  // Routine and runway metrics derived from insights
  const calc = useMemo(() => {
    if (!profile) return null;
    const totalAllowance = profile.monthly_allowance / 100;
    const cycleStart = getCycleStart(profile.cycle_start_day);
    const cycleEnd = getCycleEnd(cycleStart);
    const cycleTxns = (txns ?? []).filter((t) => new Date(t.created_at) >= cycleStart);
    const unpaidPoolDebt = (insights?.unpaid_pool_debt_paise ?? 0) / 100;
    const totalSpent = (cycleTxns.reduce((s, t) => s + t.amount, 0) / 100) + unpaidPoolDebt;
    const remaining = Math.max(0, totalAllowance - totalSpent);
    const today = new Date();
    const daysSinceStart = Math.max(1, daysBetween(cycleStart, today));
    const avgDailySpend = totalSpent / daysSinceStart;
    const daysLeft = Math.max(0, daysBetween(today, cycleEnd));
    const runwayDays = avgDailySpend > 0 ? Math.floor(remaining / avgDailySpend) : daysLeft;
    const safeDailyLimit = daysLeft > 0 ? Math.round(remaining / daysLeft) : 0;
    const todayStr = today.toDateString();
    const spentToday =
      (txns ?? [])
        .filter((t) => new Date(t.created_at).toDateString() === todayStr)
        .reduce((s, t) => s + t.amount, 0) / 100;
    return {
      totalAllowance,
      totalSpent,
      remaining,
      cycleEnd,
      daysLeft,
      runwayDays: Math.min(runwayDays, daysLeft + 5),
      safeDailyLimit,
      spentToday,
      pct: Math.min(100, Math.round((totalSpent / totalAllowance) * 100)),
      unpaidPoolDebt,
    };
  }, [profile, txns, insights]);

  // Routine check status is calculated on the backend via /api/insights/wellness

  // ── Survive-Until runway timestamp ─────────────────────────────────────
  const surviveUntilMs = useMemo(() => {
    if (!calc || !insights) return 0;
    const avgDailyPaise = (insights.velocity?.spend_7d_paise ?? 0) / 7;
    if (avgDailyPaise <= 0) {
      // fallback: use daysLeft * 24h
      return Date.now() + calc.daysLeft * 86400000;
    }
    const remainingPaise = calc.remaining * 100;
    const msUntilBroke = (remainingPaise / avgDailyPaise) * 86400000;
    return Date.now() + msUntilBroke;
  }, [calc, insights]);

  const { data: subs } = useQuery({
    queryKey: ["subs", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => getSubscriptions(),
  });

  const { data: pools } = useQuery({
    queryKey: ["pools", profile?.wing_label],
    enabled: !!profile?.wing_label,
    staleTime: 15_000,
    refetchInterval: 5000,
    queryFn: async (): Promise<(Pool & { items: PoolItem[] })[]> => {
      const ps = await getCartPools();
      return ps ?? [];
    },
  });

  const { data: foods } = useQuery({
    queryKey: ["foods"],
    staleTime: 30_000,
    queryFn: () => getCampusFood(),
  });

  // Best food suggestion
  const bestFood = useMemo(() => {
    if (!foods?.length) return null;
    const now = new Date();
    const available = foods.filter((f) => isTimeInRange(now, f.available_from, f.available_until));
    if (available.length) {
      return [...available].sort((a, b) => a.price - b.price)[0];
    }
    return foods[0];
  }, [foods]);

  const runwayColor = calc
    ? calc.runwayDays >= 15
      ? "var(--success)"
      : calc.runwayDays >= 7
        ? "var(--warning)"
        : "var(--destructive)"
    : "var(--primary)";

  // Companion indicator
  const compStatus = useMemo(() => {
    if (!profile) return "red";
    if (!profile.companion_paired) return "red";
    if (!profile.companion_last_sync) return "amber";
    const mins = (Date.now() - new Date(profile.companion_last_sync).getTime()) / 60000;
    return mins < 30 ? "green" : "amber";
  }, [profile]);

  // Subscription collisions
  const collisions = useMemo(() => {
    if (!subs || !calc) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = new Date(today);
    week.setDate(week.getDate() + 7);
    return subs
      .filter((s) => s.is_active !== false)
      .filter((s) => {
        const d = new Date(s.next_debit_date);
        return d >= today && d <= week;
      })
      .map((s) => {
        const newLimit =
          calc.daysLeft > 0 ? Math.round((calc.remaining - s.amount / 100) / calc.daysLeft) : 0;
        return { ...s, newLimit, critical: newLimit < 80 };
      });
  }, [subs, calc]);

  const cumulativeCollisionLimit = useMemo(() => {
    if (!collisions.length || !calc) return 0;
    const totalAmount = collisions.reduce((sum, s) => sum + s.amount, 0);
    return calc.daysLeft > 0 ? Math.max(0, Math.round((calc.remaining - totalAmount / 100) / calc.daysLeft)) : 0;
  }, [collisions, calc]);

  const recent = (txns ?? []).slice(0, 8);

  // Dialogs
  const [identifying, setIdentifying] = useState<Txn | null>(null);
  const [editingTxn, setEditingTxn] = useState<Txn | null>(null);
  const [adding, setAdding] = useState(false);
  const [showFoodSheet, setShowFoodSheet] = useState(false);

  // Food scanner and crowdsourced verification state & hooks
  const [foodTab, setFoodTab] = useState<"menus" | "scan" | "verify">("menus");
  const [scanVenue, setScanVenue] = useState("");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  const { data: pendingFoods, refetch: refetchPending } = useQuery({
    queryKey: ["pending-foods"],
    queryFn: () => getCampusFood("pending_verification"),
    enabled: showFoodSheet && foodTab === "verify",
  });

  const verifyMutation = useMutation({
    mutationFn: verifyCampusFoodItem,
    onSuccess: (res) => {
      refetchPending();
      qc.invalidateQueries({ queryKey: ["foods"] });
      toast.success(
        res.status === "promoted_to_active"
          ? "Item promoted to active campus menu!"
          : res.status === "already_voted"
          ? "You have already voted on this item."
          : "Thank you for verifying!"
      );
    },
    onError: () => {
      toast.error("Failed to submit verification vote.");
    }
  });

  const handleVerifyVote = (id: string, vote: "up" | "down") => {
    verifyMutation.mutate({ id, vote });
  };

  const scanMutation = useMutation({
    mutationFn: scanMenuPhoto,
    onSuccess: (res) => {
      toast.success(res.message || `Successfully parsed menu!`);
      setScanVenue("");
      setScanFile(null);
      setFoodTab("verify"); // Switch to verification page to see it
      refetchPending();
      qc.invalidateQueries({ queryKey: ["foods"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to scan menu. Make sure the image is under 5MB.");
    },
    onSettled: () => {
      setScanBusy(false);
    }
  });

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanVenue.trim()) {
      toast.error("Please enter a venue name.");
      return;
    }
    if (!scanFile) {
      toast.error("Please select a menu image.");
      return;
    }
    setScanBusy(true);
    const fd = new FormData();
    fd.append("venue_name", scanVenue.trim());
    fd.append("campus", profile?.college_name || "ABV-IIITM Gwalior");
    fd.append("image", scanFile);

    scanMutation.mutate({ data: fd });
  };

  // Exam check-in
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInExpanded, setCheckInExpanded] = useState(false);
  const [checkInNote, setCheckInNote] = useState("");
  const checkinChecked = useRef(false);

  const [dismissedRoutineNudgeKey, setDismissedRoutineNudgeKey] = useState(
    () => localStorage.getItem("pocketbuddy_routine_nudge_dismissed_key") || ""
  );
  const [routineActionState, setRoutineActionState] = useState<null | {
    kind: "ate" | "spending" | "break";
    startedAt: number;
    endsAt?: number;
  }>(null);
  const [routineTick, setRoutineTick] = useState(Date.now());

  useEffect(() => {
    if (routineActionState?.kind !== "break") return;
    const id = window.setInterval(() => setRoutineTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [routineActionState?.kind]);

  useEffect(() => {
    if (checkinChecked.current || !profile || !txns) return;
    checkinChecked.current = true;
    const now = new Date();
    if (!profile.exam_start_date || !profile.exam_end_date) return;
    const inExam =
      now >= new Date(profile.exam_start_date) &&
      now <= new Date(profile.exam_end_date + "T23:59:59");
    if (!inExam) return;
    const lastFood = txns.find((t) => t.category === "food");
    const hours = lastFood ? (Date.now() - new Date(lastFood.created_at).getTime()) / 3600000 : 999;
    if (hours < 16) return;
    const lastCk = localStorage.getItem("pocketbuddy_last_checkin");
    if (lastCk && Date.now() - parseInt(lastCk, 10) < 16 * 3600000) return;
    setShowCheckIn(true);
  }, [profile, txns]);

  const search = Route.useSearch();
  useEffect(() => {
    if (search.log) {
      setAdding(true);
      nav({ to: "/dashboard", search: (prev: any) => ({ ...prev, log: undefined }), replace: true });
    }
  }, [search.log]);


  const foodGapHours = useMemo(() => {
    const lastFood = (txns ?? []).find((t) => t.category === "food");
    return lastFood ? (Date.now() - new Date(lastFood.created_at).getTime()) / 3600000 : 0;
  }, [txns]);

  // ── Smart nudges derived from insights ──────────────────────────────────
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());
  const dismiss = (id: string) => setDismissedNudges((s) => new Set([...s, id]));

  const nudges = useMemo(() => {
    const list: { id: string; icon: any; accent: string; title: string; body: string }[] = [];
    if (!insights) {
      // Hardcoded fallback when no data yet
      list.push({
        id: "onboard",
        icon: Wallet,
        accent: "#8C7853",
        title: "Welcome to PocketBuddy",
        body: "Your AI spending guard is active. Start logging transactions or pair the Android companion to begin tracking automatically.",
      });
      return list;
    }

    // Food delivery nudge
    const delivCount = insights.food?.delivery_count_30d ?? 0;
    const messCount = insights.food?.mess_count_30d ?? 0;
    if (delivCount > 5 && delivCount > messCount) {
      list.push({
        id: "delivery_overuse",
        icon: Utensils,
        accent: "#FC8019",
        title: "Heavy on delivery apps",
        body: `You've ordered ${delivCount}× via delivery this month vs ${messCount} mess visits. Switching 3 meals/week to mess saves ~₹${Math.round(delivCount * 35)} monthly.`,
      });
    }

    // Late night spend
    const lateTotal = (insights.late_night?.total_paise ?? 0) / 100;
    if (lateTotal > 500) {
      list.push({
        id: "late_night",
        icon: Timer,
        accent: "#5E17EB",
        title: "Late-night spending detected",
        body: `₹${Math.round(lateTotal)} spent between 11PM–4AM this month. Late orders often cost 1.5× more with surge fees — try stocking room snacks.`,
      });
    }

    // Exam window
    if (insights.exam?.in_exam_period) {
      list.push({
        id: "exam_window",
        icon: AlertTriangle,
        accent: "#ef4444",
        title: `Exam window — ${insights.exam.days_left}d left`,
        body: "Your budget matters most right now. Aim for mess meals to keep daily food cost under ₹80. Campus canteens are usually open late.",
      });
    }

    // Spending velocity spike
    const vel = insights.velocity?.pct_change ?? 0;
    if (vel > 30) {
      list.push({
        id: "velocity_spike",
        icon: AlertTriangle,
        accent: "#f59e0b",
        title: `Spending up ${vel}% this week`,
        body: `You're spending significantly more than last week. At this pace your runway shrinks by ~${Math.round(vel / 10)} extra days.`,
      });
    }

    // Subscription bleed
    const subBleed = (insights.subscriptions?.monthly_bleed_paise ?? 0) / 100;
    if (subBleed > 300 && calc && calc.safeDailyLimit < 150) {
      list.push({
        id: "sub_bleed",
        icon: Receipt,
        accent: "#C27D56",
        title: "Subscription bleed warning",
        body: `₹${Math.round(subBleed)}/month in active subscriptions. With your current runway, consider pausing non-essential ones.`,
      });
    }

    return list;
  }, [insights, calc]);

  const visibleNudges = nudges.filter((n) => !dismissedNudges.has(n.id)).slice(0, 2);

  async function handleCheckInAte() {
    if (!user) return;
    await insertTransaction({
      data: {
        amount: 0,
        raw_merchant_string: "Self-reported: Ate at mess",
        mapped_merchant_name: "Self-reported",
        category: "food",
        source: "manual",
      },
    });
    await insertCheckinLog({
      data: {
        response: "ate",
        food_gap_hours: foodGapHours,
      },
    });
    localStorage.setItem("pocketbuddy_last_checkin", String(Date.now()));
    setShowCheckIn(false);
    qc.invalidateQueries({ queryKey: ["txns"] });
    toast.success("Great, keep fueling through exams 💪");
  }

  async function handleCheckInSkipped() {
    if (!user) return;
    const suggestion = bestFood
      ? `${bestFood.venue_name} ${bestFood.item_name} ${rupees(bestFood.price)}`
      : "Campus Café";
    await insertCheckinLog({
      data: {
        response: "skipped",
        food_gap_hours: foodGapHours,
        suggestion_given: suggestion,
        stress_note: checkInNote,
      },
    });
    localStorage.setItem("pocketbuddy_last_checkin", String(Date.now()));
    setShowCheckIn(false);
    setCheckInNote("");
    setCheckInExpanded(false);
    if (bestFood) {
      toast(`${bestFood.venue_name} has ${bestFood.item_name} (${rupees(bestFood.price)}) — go grab something.`);
    }
  }

  async function handleWellnessAction(action: "ate" | "break" | "spending") {
    if (!user || !wellness) return;
    const foodGapSig = wellness.signals?.find((s: any) => s.key === "food_gap")?.value || "0";
    const foodGapHoursNum = parseFloat(foodGapSig);

    let response = "";
    let checkin_note = "";
    let toastMsg = "";

    if (action === "ate") {
      response = "wellness_ate";
      checkin_note = "Routine check: ate a meal";
      toastMsg = "Meal logged. Routine check updated.";
      
      try {
        await insertTransaction({
          data: {
            amount: 0,
            raw_merchant_string: "Self-reported: Ate at mess",
            mapped_merchant_name: "Self-reported",
            category: "food",
            source: "manual",
          },
        });
      } catch (err) {
        // transaction insert optional failure handling
      }
    } else if (action === "break") {
      response = "wellness_need_break";
      checkin_note = "Routine check: taking a 15-minute reset";
      toastMsg = "Reset logged. Check back after the break.";
    } else {
      response = "wellness_plan_spending";
      checkin_note = "Routine check: planning today's spending";
      toastMsg = "Spend plan logged. Runway check updated.";
    }

    try {
      await insertCheckinLog({
        data: {
          response,
          stress_note: checkin_note,
          suggestion_given: "routine_check",
          food_gap_hours: foodGapHoursNum,
        },
      });
      const startedAt = Date.now();
      setRoutineActionState({
        kind: action,
        startedAt,
        endsAt: action === "break" ? startedAt + 15 * 60_000 : undefined,
      });
      setRoutineTick(startedAt);
      toast.success(toastMsg);
      qc.invalidateQueries({ queryKey: ["wellness-insights"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["txns"] });
      qc.invalidateQueries({ queryKey: ["wing-feed"] });
    } catch (err) {
      toast.error("Failed to submit check-in");
    }
  }

  const routineSignals = ((wellness?.signals ?? []) as any[]).filter((sig) => ROUTINE_SIGNAL_KEYS.has(sig.key));
  const elevatedRoutineSignals = routineSignals.filter((sig) => sig.severity === "watch" || sig.severity === "stressed");
  const primaryRoutineSignal = elevatedRoutineSignals[0] ?? routineSignals[0];
  const shownRoutineSignals = routineSignals.slice(0, 5);
  const routineNudgeKey = wellness
    ? `${wellness.status}:${routineSignals.map((sig) => `${sig.key}:${sig.severity}:${sig.value}`).join("|")}`
    : "";
  const showRoutineNudge = !!wellness && wellness.status !== "steady" && routineNudgeKey !== dismissedRoutineNudgeKey;
  const showRoutinePanel = showRoutineNudge || !!routineActionState;
  const spendRoomRs = calc ? Math.max(0, calc.safeDailyLimit - calc.spentToday) : 0;
  const resetRemainingMs = routineActionState?.kind === "break" && routineActionState.endsAt
    ? Math.max(0, routineActionState.endsAt - routineTick)
    : 0;
  const resetMins = Math.floor(resetRemainingMs / 60_000);
  const resetSecs = Math.floor((resetRemainingMs % 60_000) / 1000);
  const routineTone =
    wellness?.status === "steady"
      ? { text: "text-success", border: "border-success/25", bg: "bg-success/5", dot: "bg-success", ring: "border-success/30" }
      : wellness?.status === "watch"
        ? { text: "text-warning", border: "border-warning/25", bg: "bg-warning/5", dot: "bg-warning", ring: "border-warning/30" }
        : { text: "text-destructive", border: "border-destructive/25", bg: "bg-destructive/5", dot: "bg-destructive", ring: "border-destructive/30" };
  const primarySignalKey = primaryRoutineSignal?.key;
  const routineSuggestion = (() => {
    if (primarySignalKey === "food_gap" || primarySignalKey === "exam") {
      const foodText = bestFood
        ? `${bestFood.venue_name}: ${bestFood.item_name} for ${rupees(bestFood.price)}.`
        : "Use mess or a simple canteen plate.";
      return {
        title: "Close the meal gap",
        detail: `${foodText} Keep it under today's safe spend if you are ordering outside.`,
        cta: "Food options",
        action: "food" as const,
      };
    }
    if (primarySignalKey === "runway" || primarySignalKey === "velocity") {
      return {
        title: "Set today's spend ceiling",
        detail: calc
          ? `${rupees(calc.safeDailyLimit * 100)} safe today, ${rupees(spendRoomRs * 100)} left after current spends.`
          : "Open runway to set a safe spend target for the rest of today.",
        cta: "Open runway",
        action: "runway" as const,
      };
    }
    if (primarySignalKey === "late_night") {
      return {
        title: "Avoid a late order spiral",
        detail: "Stock a low-cost snack or use a shared order instead of a solo delivery tonight.",
        cta: "Plan spend",
        action: "spending" as const,
      };
    }
    return {
      title: "Keep the day steady",
      detail: calc
        ? `Stay near ${rupees(calc.safeDailyLimit * 100)} today and keep meals on schedule.`
        : "Keep meals regular and stay within today's safe spend target.",
      cta: "Plan spend",
      action: "spending" as const,
    };
  })();
  const routineSuggestionDetail = routineCoach?.message || routineSuggestion.detail;

  function dismissRoutineNudge() {
    if (routineNudgeKey) {
      localStorage.setItem("pocketbuddy_routine_nudge_dismissed_key", routineNudgeKey);
      setDismissedRoutineNudgeKey(routineNudgeKey);
    }
    setRoutineActionState(null);
  }

  function handleRoutineSuggestionAction() {
    if (routineSuggestion.action === "food") {
      setShowFoodSheet(true);
    } else if (routineSuggestion.action === "runway") {
      nav({ to: "/runway" });
    } else {
      void handleWellnessAction("spending");
    }
  }

  return (
    <AppShell>
      {/* Page Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <h1 id="logo-dashboard" className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">
            Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => nav({ to: "/companion" })}
            title={compStatus === "green" ? "Companion syncing" : compStatus === "amber" ? "Companion idle" : "No companion"}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-surface border border-border transition-colors hover:bg-surface-raised"
          >
            <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${compStatus === "green" ? "bg-success" : compStatus === "amber" ? "bg-warning" : "bg-destructive"}`} />
          </button>
          <Badge variant="outline" id="badge-wing" className="bg-white/5 border-border text-foreground font-bold text-[10px]">
            {profile?.wing_label ?? "—"}
          </Badge>
        </div>
      </div>

      <div className="pb-16">

        {/* ── Smart Nudges row ──────────────────────────────────────────── */}
        {visibleNudges.length > 0 && (
          <div className="mb-6 space-y-2">
            {visibleNudges.map((n) => (
              <NudgeCard key={n.id} {...n} onDismiss={() => dismiss(n.id)} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* ── Main Column ─────────────────────────────────────────────── */}
          <div className="md:col-span-7 lg:col-span-8 space-y-6 animate-[fadeIn_0.3s_ease-out]">

            {/* Routine Check Card */}
            <div id="card-routine-check" className="bg-surface rounded-2xl border border-border relative overflow-hidden transition-all duration-300 hover:border-primary/20">
              <div className={`absolute top-0 left-0 h-[2px] w-full ${wellness?.status === "steady" ? "bg-success" : wellness?.status === "watch" ? "bg-warning" : "bg-destructive"}`} />

              <div className="p-5 md:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase font-display">Routine Check</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      Money, meal, and timing signals from your week.
                    </p>
                  </div>

                  {wellness && (
                    <Badge variant="outline" className={`font-bold text-[10px] px-2.5 py-0.5 uppercase tracking-wider ${routineTone.border} ${routineTone.bg} ${routineTone.text}`}>
                      {wellness.label}
                    </Badge>
                  )}
                </div>

                {wellnessLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-1/3 bg-surface-raised" />
                    <Skeleton className="h-14 w-full bg-surface-raised" />
                    <Skeleton className="h-16 w-full bg-surface-raised" />
                  </div>
                ) : wellnessError ? (
                  <div className="rounded-xl border border-dashed border-destructive/20 bg-destructive/5 p-4">
                    <p className="text-xs font-semibold text-destructive uppercase tracking-wider">Routine check unavailable</p>
                    <p className="text-xs text-muted-foreground mt-1">We could not load your routine signals. Please try again later.</p>
                  </div>
                ) : (txns ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-surface-raised/40 p-4 text-center">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">No transaction history</p>
                    <p className="text-xs text-muted-foreground mt-1">Add a few spends to build your meal and runway pattern.</p>
                    <div className="mt-3">
                      <Button
                        variant="secondary"
                        className="text-xs uppercase tracking-wider font-bold h-8 bg-surface-raised border-border"
                        onClick={() => setAdding(true)}
                      >
                        Log Transaction
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`rounded-xl border ${routineTone.border} ${routineTone.bg} p-4`}>
                      <div className="grid gap-4 lg:grid-cols-[136px_1fr_auto] lg:items-center">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Routine Index</p>
                          <div className="mt-1.5 flex items-end gap-1.5">
                            <span className={`text-4xl md:text-5xl font-black tracking-tighter leading-none tnum font-display ${routineTone.text}`}>
                              {wellness.score}
                            </span>
                            <span className="pb-1 text-xs font-black uppercase tracking-wider text-muted-foreground">/100</span>
                          </div>
                          <Progress value={wellness.score} className="mt-2 h-1.5 bg-surface-raised" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${routineTone.dot}`} />
                            <p className={`text-[11px] font-black uppercase tracking-wider ${routineTone.text}`}>
                              {wellness.label}
                            </p>
                            {routineCoach?.source === "bedrock" && (
                              <span className="rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                                Bedrock
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm font-black text-foreground leading-snug">
                            {routineSuggestion.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                            {routineSuggestionDetail}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={handleRoutineSuggestionAction}
                          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer lg:min-w-[112px]"
                        >
                          {routineSuggestion.cta}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {shownRoutineSignals.map((sig: any) => (
                        <div
                          key={sig.key}
                          title={sig.detail}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-surface-raised/45 px-3 py-1.5 text-xs"
                        >
                          <span className="font-medium text-muted-foreground">{sig.label}:</span>
                          <span className="font-black text-foreground tnum">{sig.value}</span>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                              sig.severity === "stressed" ? "bg-destructive" : sig.severity === "watch" ? "bg-warning" : "bg-success"
                            }`} />
                        </div>
                      ))}
                    </div>

                    {showRoutinePanel && (
                      <div className="rounded-xl border border-border bg-background/35 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-wider text-foreground">Suggested check-in</p>
                            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                              {routineActionState
                                ? "Action captured. Use the next step below to finish the loop."
                                : "Optional. Dismiss it if meals or spending are already handled today."}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={dismissRoutineNudge}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-colors cursor-pointer shrink-0"
                            aria-label="Dismiss routine nudge"
                            title="Dismiss"
                          >
                            <X className="h-3 w-3" />
                            Not now
                          </button>
                        </div>

                        {routineActionState ? (
                          <div className="mt-3 rounded-lg border border-border bg-surface p-3">
                            {routineActionState.kind === "ate" && (
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-success uppercase tracking-wider">Meal gap updated</p>
                                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                                    Logged a self-reported meal for mess, home food, or canteen. The meal gap signal will refresh with your dashboard data.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowFoodSheet(true)}
                                  className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-surface-raised px-3 text-[11px] font-bold text-foreground hover:bg-surface-interactive transition-colors cursor-pointer shrink-0"
                                >
                                  Find campus food
                                </button>
                              </div>
                            )}

                            {routineActionState.kind === "spending" && (
                              <div className="space-y-3">
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="rounded-md bg-surface-raised/70 p-2">
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Safe today</p>
                                    <p className="mt-1 text-sm font-black text-foreground tnum">{calc ? rupees(calc.safeDailyLimit * 100) : "—"}</p>
                                  </div>
                                  <div className="rounded-md bg-surface-raised/70 p-2">
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Spent</p>
                                    <p className="mt-1 text-sm font-black text-foreground tnum">{calc ? rupees(calc.spentToday * 100) : "—"}</p>
                                  </div>
                                  <div className="rounded-md bg-surface-raised/70 p-2">
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Room left</p>
                                    <p className={`mt-1 text-sm font-black tnum ${spendRoomRs > 0 ? "text-success" : "text-destructive"}`}>{calc ? rupees(spendRoomRs * 100) : "—"}</p>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    {spendRoomRs > 0
                                      ? "Keep optional spends under the room left today, and prefer mess or shared orders if food is the next spend."
                                      : "You are past today's safe room. Hold optional spends and use prepaid mess or shared orders where possible."}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => nav({ to: "/runway" })}
                                    className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shrink-0"
                                  >
                                    Open runway
                                  </button>
                                </div>
                              </div>
                            )}

                            {routineActionState.kind === "break" && (
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-warning uppercase tracking-wider">
                                    {resetRemainingMs > 0 ? "Reset timer running" : "Reset window complete"}
                                  </p>
                                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                                    Step away from the screen, get water, stretch, then come back to the spend plan.
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="rounded-lg border border-warning/20 bg-warning/5 px-3 py-1.5 text-sm font-black text-warning tnum">
                                    {String(resetMins).padStart(2, "0")}:{String(resetSecs).padStart(2, "0")}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setRoutineActionState(null)}
                                    className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-surface-raised px-3 text-[11px] font-bold text-foreground hover:bg-surface-interactive transition-colors cursor-pointer"
                                  >
                                    Done
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              id="btn-wellness-ate"
                              onClick={() => handleWellnessAction("ate")}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-success/20 bg-success/5 px-2.5 text-[11px] font-bold text-success hover:bg-success/10 transition-colors cursor-pointer"
                            >
                              <Utensils className="h-3.5 w-3.5 shrink-0" />
                              Ate meal
                            </button>
                            <button
                              id="btn-wellness-spending"
                              onClick={() => handleWellnessAction("spending")}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 text-[11px] font-bold text-foreground hover:bg-surface-interactive transition-colors cursor-pointer"
                            >
                              <Wallet className="h-3.5 w-3.5 shrink-0" />
                              Plan spend
                            </button>
                            <button
                              id="btn-wellness-break"
                              onClick={() => handleWellnessAction("break")}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-warning/20 bg-warning/5 px-2.5 text-[11px] font-bold text-warning hover:bg-warning/10 transition-colors cursor-pointer"
                            >
                              <Timer className="h-3.5 w-3.5 shrink-0" />
                              15-min reset
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Runway Hero */}
            <div id="card-runway-status" className="bg-surface rounded-2xl border border-border relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-bronze via-accent-amber to-accent-copper opacity-80" />
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Runway Status</p>
                  <div className="hidden md:flex items-center gap-3">
                    <Badge variant="outline" className="bg-white/5 border-border text-foreground font-bold text-xs px-2.5 py-0.5">
                      {profile?.wing_label ?? "—"}
                    </Badge>
                    <button
                      onClick={() => nav({ to: "/companion" })}
                      title="Companion Status"
                      className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-raised border border-border hover:border-white/15 transition-all"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${compStatus === "green" ? "bg-success" : compStatus === "amber" ? "bg-warning" : "bg-destructive"}`} />
                    </button>
                  </div>
                </div>

                {!calc ? (
                  <Skeleton className="mt-2 h-20 w-full max-w-xs bg-white/5" />
                ) : (
                  <>
                    <div className="flex items-baseline gap-2.5">
                      <h2 className="text-[56px] md:text-[76px] font-black tracking-tighter text-foreground tnum leading-none" style={{ color: runwayColor }}>
                        <CountUp to={calc.runwayDays} />
                      </h2>
                      <span className="text-[16px] md:text-[20px] font-bold tracking-widest text-zinc-500 uppercase">Days</span>
                    </div>
                    <p className="mt-3 max-w-full text-[13px] md:text-sm text-zinc-400 font-medium leading-6 tracking-normal">
                      Remaining allowance until <span className="text-foreground font-bold">{rupees(calc.totalAllowance * 100)}</span> resets on <span className="text-foreground font-bold">{shortDate(calc.cycleEnd)}</span>
                    </p>

                    <div className="mt-8 grid grid-cols-3 gap-2 md:gap-6 border-t border-border pt-6">
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="text-xs text-zinc-500 font-bold whitespace-nowrap">Balance</p>
                        <p className="text-[18px] md:text-[22px] font-black text-foreground tnum">{rupees(calc.remaining * 100)}</p>
                      </div>
                      <div className="flex min-w-0 flex-col gap-1 border-l border-border pl-3 md:pl-6">
                        <p className="text-xs text-zinc-500 font-bold whitespace-nowrap">Safe limit</p>
                        <p className="text-[18px] md:text-[22px] font-black text-foreground tnum">{rupees(calc.safeDailyLimit * 100)}</p>
                      </div>
                      <div className="flex min-w-0 flex-col gap-1 border-l border-border pl-3 md:pl-6">
                        <p className="text-xs text-zinc-500 font-bold whitespace-nowrap">Today</p>
                        <p className="text-[18px] md:text-[22px] font-black text-foreground tnum">{rupees(calc.spentToday * 100)}</p>
                      </div>
                    </div>

                    <div className="mt-8">
                      <Progress id="progress-runway" value={calc.pct} className="h-1 bg-surface-raised" />
                      <div className="mt-3 text-xs text-muted-foreground flex flex-col md:flex-row md:items-center justify-between gap-2 font-medium">
                        {profile?.companion_paired ? (
                          <span className="flex items-center gap-1.5 text-zinc-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                            Auto-tracking via {profile.companion_device_name ?? "companion"}
                          </span>
                        ) : (
                          <Link to="/companion" className="text-warning flex items-center gap-1.5 hover:underline">
                            <span className="w-1.5 h-1.5 bg-warning rounded-full" /> Manual tracking mode
                          </Link>
                        )}
                        {calc.unpaidPoolDebt > 0 && (
                          <span className="text-amber-500 flex items-center gap-1.5 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            ⚠️ Includes {rupees(calc.unpaidPoolDebt * 100)} unpaid pool debt
                          </span>
                        )}
                        <span className="font-bold text-foreground">{calc.pct}% Spent</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {calc && <SpendingSmartCheck calc={calc} />}

            {/* ── Behaviour Analytics Row ─────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* 7-day spend bar chart */}
              <div className="bg-surface border border-border rounded-2xl p-5">
                <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">7-Day Spend</p>
                {insights?.daily_spend_7d ? (
                  <>
                    <SpendBar days={insights.daily_spend_7d} />
                    {(insights.velocity?.pct_change ?? 0) !== 0 && (
                      <p className={`mt-3 text-xs font-bold ${insights.velocity.pct_change > 0 ? "text-destructive" : "text-success"}`}>
                        {insights.velocity.pct_change > 0 ? "▲" : "▼"} {Math.abs(insights.velocity.pct_change)}% vs last week
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-end gap-1.5 h-16">
                    {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                      <div key={i} className="flex flex-col items-center gap-1 flex-1">
                        <div className="w-full rounded-sm bg-white/10" style={{ height: `${20 + Math.random() * 60}%`, minHeight: "8px" }} />
                        <span className="text-[10px] text-zinc-600 font-bold">{d}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Category breakdown donut */}
              <div className="bg-surface border border-border rounded-2xl p-5">
                <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">Spend by Category</p>
                {insights?.category_breakdown?.length ? (
                  <CategoryDonut breakdown={insights.category_breakdown} />
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-primary animate-spin" />
                    <p className="text-xs text-zinc-500">No data yet — start logging transactions</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Food & Routine Strip ───────────────────────────────── */}
            <div className="bg-surface border border-border rounded-2xl p-5">
              <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">Food & Routine</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Food gap */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">Last meal</p>
                  {insights ? (
                    <p className={`text-[16px] font-black tnum ${insights.food.gap_hours > 12 ? "text-destructive" : insights.food.gap_hours > 6 ? "text-warning" : "text-success"}`}>
                      {insights.food.gap_hours > 0 ? `${Math.round(insights.food.gap_hours)}h ago` : "—"}
                    </p>
                  ) : (
                    <p className="text-[16px] font-black text-zinc-400">{foodGapHours > 0 ? `${Math.round(foodGapHours)}h ago` : "—"}</p>
                  )}
                  <p className="text-xs text-zinc-600">food gap</p>
                </div>

                {/* Delivery vs mess */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">Delivery</p>
                  <p className="text-[16px] font-black text-foreground">
                    {insights?.food?.delivery_count_30d ?? "—"}×
                  </p>
                  <p className="text-xs text-zinc-600">vs {insights?.food?.mess_count_30d ?? "—"} mess visits</p>
                </div>

                {/* Late night */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">Late Night</p>
                  <p className="text-[16px] font-black text-foreground tnum">
                    {insights ? rupees(insights.late_night.total_paise) : "—"}
                  </p>
                  <p className="text-xs text-zinc-600">{insights?.late_night?.txn_count ?? 0} txns after 11PM</p>
                </div>

                {/* Sub bleed */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">Sub Bleed</p>
                  <p className="text-[16px] font-black text-foreground tnum">
                    {insights ? rupees(insights.subscriptions.monthly_bleed_paise) : "—"}
                  </p>
                  <p className="text-xs text-zinc-600">/month in {insights?.subscriptions?.count ?? 0} subs</p>
                </div>
              </div>

              {/* Mess vs delivery bar */}
              {insights?.food && (insights.food.delivery_count_30d + insights.food.mess_count_30d) > 0 && (
                <div className="mt-5 pt-4 border-t border-border">
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-2">Mess vs Delivery ratio (30d)</p>
                  <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                    <div
                      className="bg-success rounded-full transition-all"
                      style={{ width: `${(insights.food.mess_count_30d / Math.max(insights.food.mess_count_30d + insights.food.delivery_count_30d, 1)) * 100}%` }}
                    />
                    <div
                      className="bg-warning rounded-full transition-all"
                      style={{ width: `${(insights.food.delivery_count_30d / Math.max(insights.food.mess_count_30d + insights.food.delivery_count_30d, 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-success font-bold">Mess {insights.food.mess_count_30d}</span>
                    <span className="text-[10px] text-warning font-bold">Delivery {insights.food.delivery_count_30d}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Active Pools */}
            <section id="section-active-pools" className="space-y-4 pt-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold tracking-[0.25em] text-zinc-500 uppercase">Active Wing Pools</h3>
                <Link
                  to="/pool"
                  id="btn-new-pool-dash"
                  className="text-[10px] font-bold text-foreground bg-surface-raised border border-border hover:bg-surface-interactive transition-all px-3.5 py-1.5 rounded-full uppercase tracking-wider cursor-pointer"
                >
                  + New Pool
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(pools ?? []).filter((p) => p.status === "open" && new Date(p.expires_at).getTime() > Date.now()).length === 0 && (
                  <div className="col-span-full py-10 text-center border border-dashed border-border rounded-2xl bg-surface-raised/40">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">No active pools in your wing.</p>
                    <p className="text-xs text-zinc-500 mt-1">Start one now to split delivery fees with your wing.</p>
                  </div>
                )}
                {(pools ?? [])
                  .filter((p) => p.status === "open" && new Date(p.expires_at).getTime() > Date.now())
                  .map((p) => {
                    const total = (p.items ?? []).reduce((s: number, i: any) => s + i.estimated_price, 0);
                    const minsLeft = Math.max(0, Math.round((new Date(p.expires_at).getTime() - Date.now()) / 60000));
                    const perPerson = (p.items ?? []).length
                      ? Math.round(p.delivery_fee / new Set((p.items ?? []).map((i: any) => i.added_by_name)).size)
                      : 0;
                    return (
                      <Link key={p.id} to="/pool/$id" params={{ id: p.id }} className="group">
                        <Card className="bg-surface relative overflow-hidden border border-border p-5 transition-all duration-300 hover:border-white/15 hover:bg-surface-raised h-full flex flex-col justify-between hover:shadow-lg hover:shadow-black/40">
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <PlatformIcon platform={p.platform} name={p.platform_display_label || p.platform.replace("_", " ")} className="h-5 w-5" />
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                  <span className="text-xs font-black uppercase tracking-wider text-foreground truncate max-w-[120px] sm:max-w-none">{p.platform_display_label || p.platform.replace("_", " ")}</span>
                                  <Badge variant="outline" className="text-muted-foreground bg-white/5 border-border text-[10px] font-bold">{p.wing_label}</Badge>
                                </div>
                              </div>
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border border-border bg-background tnum shrink-0 ${minsLeft < 5 ? "text-destructive animate-pulse border-destructive/20 bg-destructive/5" : "text-foreground"}`}>
                                {minsLeft}m left
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Host: <span className="font-semibold text-foreground capitalize">{p.created_by_name || "—"}</span></p>
                          </div>
                          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Cart</span>
                              <span className="text-xs font-black text-foreground">{rupees(total)} <span className="text-zinc-500 font-normal text-[10px]">/ {rupees(p.min_cart_value)} min</span></span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Split Est.</span>
                              <span className="text-xs font-black text-success">{rupees(perPerson)} <span className="text-zinc-500 font-normal text-[10px]">/ person</span></span>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
              </div>
            </section>
          </div>

          {/* ── Sidebar ─────────────────────────────────────────────────── */}
          <div className="md:col-span-5 lg:col-span-4 space-y-5">

            {/* ── Wing Netting & Suggested Settlements ─────────────────── */}
            {nettedBalances && (nettedBalances.balances?.you_owe?.length > 0 || nettedBalances.balances?.owes_you?.length > 0 || nettedBalances.suggested_settlements?.length > 0) && (
              <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:border-white/10">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 opacity-80" />
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <p className="text-xs font-bold tracking-[0.12em] text-zinc-500 uppercase">Wing Netting & Settlements</p>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full border text-emerald-500 border-emerald-500/20 bg-emerald-500/5">
                    NETTED ACTIVE
                  </span>
                </div>
                
                <div className="space-y-4">
                  {/* Nishant owes others (you_owe) */}
                  {nettedBalances.balances?.you_owe?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">You Owe</p>
                      <div className="space-y-1.5">
                        {nettedBalances.balances.you_owe.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg text-xs border border-border">
                            <span className="font-semibold text-zinc-300">{item.name}</span>
                            <span className="font-bold text-red-400 font-mono">{rupees(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Others owe Nishant (owes_you) */}
                  {nettedBalances.balances?.owes_you?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Owes You</p>
                      <div className="space-y-1.5">
                        {nettedBalances.balances.owes_you.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg text-xs border border-border">
                            <span className="font-semibold text-zinc-300">{item.name}</span>
                            <span className="font-bold text-green-400 font-mono">{rupees(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested settlements path */}
                  {nettedBalances.suggested_settlements?.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-border/60">
                      <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span>💡 Optimized Settlement Plan</span>
                      </p>
                      <div className="space-y-1.5">
                        {nettedBalances.suggested_settlements.map((item: any, idx: number) => (
                          <p key={idx} className="text-xs text-zinc-300 bg-emerald-500/5 border border-emerald-500/10 px-3 py-2 rounded-lg font-medium leading-relaxed">
                            {item.text}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Survive Until Broke Card ─────────────────── */}
            <Link to="/runway" className="block group">
              <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden transition-all duration-300 hover:border-primary/40 hover:scale-[1.01] active:scale-[0.99] cursor-pointer">
                <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(255,107,0,0.05), transparent 65%)" }} />
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <p className="text-xs font-bold tracking-[0.12em] text-zinc-500 uppercase group-hover:text-primary transition-colors">Survive Until Broke</p>
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-full border text-primary border-primary/30 bg-primary/5 flex items-center gap-1">
                    LIVE COUNTDOWN
                    <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                <div className="space-y-3">
                  {surviveUntilMs > 0 ? (
                    <SurviveCountdown runwayMs={surviveUntilMs} />
                  ) : (
                    <p className="text-[13px] font-black text-zinc-400">—</p>
                  )}
                  <p className="text-xs text-zinc-400 leading-relaxed mt-2">
                    Estimated exact date your allowance will run out. Click to view detailed forecasts.
                  </p>
                </div>
              </div>
            </Link>

            {/* ── AI Campus Intelligence (Bedrock) ──────────────────── */}
            <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, rgba(255,107,0,0.07), transparent 60%)" }} />
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5.5 h-5.5 rounded-full bg-gradient-to-br from-primary to-pb-amber flex items-center justify-center shrink-0">
                  <span style={{ fontSize: "11px", fontWeight: 900, color: "#0A0A0A" }}>AI</span>
                </div>
                <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Campus Intelligence</p>
                {campusIntel?.source === "bedrock" && (
                  <span className="ml-auto text-[10px] font-black text-primary uppercase tracking-wider border border-primary/30 px-1.5 py-0.5 rounded-full">Bedrock</span>
                )}
              </div>
              {campusIntel?.summary ? (
                <p className="text-[13px] text-zinc-300 leading-relaxed">{campusIntel.summary}</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="h-2.5 rounded bg-white/5 w-full animate-pulse" />
                  <div className="h-2.5 rounded bg-white/5 w-4/5 animate-pulse" />
                  <div className="h-2.5 rounded bg-white/5 w-3/5 animate-pulse" />
                </div>
              )}
              {campusIntel && (
                <div className="mt-3 pt-3 border-t border-border flex gap-4">
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider">This Week</p>
                    <p className="text-xs font-black text-foreground tnum">{rupees((campusIntel.spend_7d ?? 0) * 100)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Last Meal</p>
                    <p className={`text-xs font-black tnum ${(campusIntel.last_food_hours ?? 0) > 8 ? "text-warning" : "text-success"}`}>
                      {campusIntel.last_food_hours > 0 ? `${Math.round(campusIntel.last_food_hours)}h ago` : "—"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Campus Fare Guard (Travel Savings) ────────────────── */}
            <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(22,163,74,0.05), transparent 60%)" }} />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Compass className="h-4.5 w-4.5 text-primary" />
                  <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase font-display">Campus Fare Guard</p>
                </div>
                <Badge variant="outline" className="bg-success/5 border-success/20 text-success font-bold text-[10px] font-mono">
                  Saved ₹{travelSavings?.total_saved ?? 0}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                Avoid local transport overcharging. Check fares, view cheap transit combos, and negotiate fares with copyable student scripts.
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  onClick={() => nav({ to: "/travel" })}
                  className="w-full text-xs font-bold uppercase tracking-wider h-8 bg-surface-raised border border-border text-foreground hover:bg-surface-interactive hover:border-white/10 cursor-pointer"
                >
                  Open Fare Guard
                </Button>
              </div>
            </div>

            {/* ── Wing Activity Feed ────────────────────────────────── */}
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Wing Activity</p>
                <span className="flex items-center gap-1.5 text-[10px] text-zinc-600 font-bold">
                  <span className={`w-1.5 h-1.5 rounded-full ${wingEvents.length ? "bg-success animate-pulse" : "bg-zinc-600"}`} />
                  {wingEvents.length ? "Live" : "No Live Events"}
                </span>
              </div>
              <div className="space-y-3">
                {wingEvents.length ? (
                  wingEvents.map((ev: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 animate-[fadeIn_0.4s_ease-out]" style={{ animationDelay: `${i * 80}ms` }}>
                      <span className="shrink-0 mt-0.5 text-zinc-500">
                        {ev.type === "pool_created" ? (
                          <ShoppingBag className="h-4 w-4" />
                        ) : ev.type === "merchant_mapped" ? (
                          <MapPin className="h-4 w-4" />
                        ) : ev.text.includes("skipping") ? (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        ) : ev.text.includes("fare") || ev.text.includes("Fare") ? (
                          <Compass className="h-4 w-4 text-primary" />
                        ) : ev.text.includes("Saved") || ev.text.includes("saved") ? (
                          <TrendingDown className="h-4 w-4 text-success" />
                        ) : (
                          <Utensils className="h-4 w-4 text-success" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-300 leading-snug">{ev.text}</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5 font-bold">
                          {ev.mins_ago === 0 ? "just now" : ev.mins_ago < 60 ? `${ev.mins_ago}m ago` : `${Math.floor(ev.mins_ago / 60)}h ago`}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-surface-raised/40 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">No wing activity yet</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                      Start a cart pool, identify a merchant, or check in from the dashboard to populate this feed.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Exam banner */}
            {insights?.exam?.in_exam_period && (
              <div className="relative rounded-2xl overflow-hidden border border-red-500/20 bg-red-500/5 p-5">
                <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top, rgba(239,68,68,0.1), transparent 70%)" }} />
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-black text-red-400 uppercase tracking-widest">Exam Window Active</span>
                  <span className="text-xs text-red-400 font-bold">· {insights.exam.days_left}d left</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Meal gaps can stretch during exams. PocketBuddy is watching the food gap and spend pace so you can reset early.
                </p>
                <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full" style={{ width: `${Math.min(100, (insights.exam.days_left / 14) * 100)}%` }} />
                </div>
              </div>
            )}

            {/* Alert Widget */}
            {calc && (calc.runwayDays < 7 || calc.safeDailyLimit < 150) && (
              <Card id="card-runway-alert" className="border-destructive/30 bg-destructive/5 p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[3px] h-full bg-destructive" />
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                  <p className="text-xs font-bold text-destructive tracking-widest uppercase">Runway Warning</p>
                </div>
                <p className="text-xs font-medium text-foreground leading-relaxed">
                  Daily limit is <span className="text-destructive font-bold">{rupees(calc.safeDailyLimit * 100)}</span>. Skip delivery orders tonight.
                </p>
                {bestFood && (
                  <div className="mt-4 rounded-lg border border-success/20 bg-success/5 p-3.5 space-y-1">
                    <p className="text-xs font-bold tracking-widest text-success uppercase">Dine In Option</p>
                    <p className="text-xs text-foreground leading-relaxed">
                      <span className="font-bold">{bestFood.venue_name}</span> has{" "}
                      <span className="font-semibold">{bestFood.item_name}</span> for{" "}
                      <strong className="text-success">{rupees(bestFood.price)}</strong>.
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setShowFoodSheet(true)}
                  className="mt-3 text-xs font-bold text-foreground hover:underline uppercase tracking-wider cursor-pointer"
                >
                  All Campus Foods →
                </button>
              </Card>
            )}

            {/* Collisions */}
            {collisions.length > 0 && (
              <section id="section-collisions" className="space-y-3">
                <h3 className="text-xs font-bold tracking-[0.25em] text-zinc-500 uppercase px-1">Budget Collisions</h3>
                <div className="space-y-3">
                  {collisions.length > 1 && (
                    <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 text-xs">
                      <p className="font-bold tracking-wider text-xs text-destructive uppercase mb-1">Cumulative Debit Impact</p>
                      <p className="font-medium text-zinc-400 leading-relaxed">
                        If all {collisions.length} debits hit this week, your safe limit drops to <strong className="text-foreground">{rupees(cumulativeCollisionLimit * 100)}</strong>/day.
                      </p>
                    </div>
                  )}
                  {collisions.map((c) => (
                    <Card
                      key={c.id}
                      className={`bg-surface border-border p-4 relative overflow-hidden ${c.critical ? "border-l-2 border-l-destructive" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-bold text-foreground flex items-center">
                          {c.service_name ?? c.name}
                          {c.detected_from === "auto_detected" && (
                            <Badge className="ml-2 bg-white/5 border border-border text-[10px] font-bold px-1.5 py-0">Auto</Badge>
                          )}
                        </p>
                        <p className="text-xs font-bold text-destructive tnum">−{rupees(c.amount)}</p>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <p className="text-zinc-500 font-semibold">{shortDate(new Date(c.next_debit_date))}</p>
                        <p className="text-zinc-500">
                          Limit: <span className="text-foreground font-bold">{rupees(c.newLimit * 100)}</span>
                          {c.critical && <span className="ml-1.5 text-destructive font-black text-xs font-mono uppercase tracking-widest bg-destructive/10 border border-destructive/20 px-1 py-0.5 rounded">CRITICAL</span>}
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Recent Ledger */}
            <section id="section-recent" className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold tracking-[0.25em] text-zinc-500 uppercase">Recent Ledger</h3>
                <Link to="/transactions" id="link-see-all-txns" className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  See all →
                </Link>
              </div>
              <Card className="bg-surface border-border p-1 overflow-hidden">
                {!txns ? (
                  <div className="p-4"><Skeleton className="h-32 w-full bg-white/5 border-none" /></div>
                ) : recent.length === 0 ? (
                  <p className="py-8 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">No transactions logged</p>
                ) : (
                  <div className="divide-y divide-border">
                    {recent.map((t, i) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between p-3.5 hover:bg-surface-raised transition-colors duration-150"
                        style={{ animation: `pb-stagger 300ms ${i * 40}ms backwards ease-out` }}
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <p className={`text-xs font-bold truncate ${t.is_mapped ? "text-foreground" : "text-zinc-400 italic"}`}>
                            {t.mapped_merchant_name ?? t.raw_merchant_string}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            {t.category && (
                              <span className="text-[10px] font-black tracking-widest text-zinc-500 uppercase">{t.category}</span>
                            )}
                            {t.source !== "manual" && (
                              <>
                                <span className="text-[10px] text-zinc-600 font-bold">•</span>
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">{t.source.split("_")[1]}</span>
                              </>
                            )}
                            {t.needs_verification && (
                              <>
                                <span className="text-[10px] text-zinc-600 font-bold">•</span>
                                <span className="text-[9px] font-black text-warning bg-warning/10 border border-warning/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  Verify Parser
                                </span>
                              </>
                            )}
                            {!t.is_mapped && (
                              <button
                                id={`btn-identify-${t.id}`}
                                onClick={() => setIdentifying(t)}
                                className="ml-1 rounded-full px-3 py-1 text-[11px] font-bold bg-white/5 border border-border hover:bg-white/10 hover:border-white/15 transition-all cursor-pointer uppercase text-foreground"
                              >
                                Identify?
                              </button>
                            )}
                            <button
                              id={`btn-edit-ledger-${t.id}`}
                              onClick={() => setEditingTxn(t)}
                              className="ml-1 rounded-full px-3 py-1 text-[11px] font-bold bg-white/5 border border-border hover:bg-white/10 hover:border-white/15 transition-all cursor-pointer uppercase text-foreground"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-black text-foreground tnum">{rupees(t.amount)}</p>
                          <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">{relativeTime(t.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-3">
                  <Button
                    id="btn-add-transaction"
                    variant="secondary"
                    className="w-full text-xs uppercase tracking-wider font-bold h-9 bg-surface-raised hover:bg-surface-interactive border-border"
                    onClick={() => setAdding(true)}
                  >
                    Log Transaction
                  </Button>
                </div>
              </Card>
            </section>
          </div>
        </div>

        <style>{`
          @keyframes pb-stagger { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes nudgePop { from { opacity: 0; transform: scale(0.95) translateY(-8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        `}</style>

        {/* Identify dialog */}
        <Dialog open={!!identifying} onOpenChange={(o) => !o && setIdentifying(null)}>
          <DialogContent id="dialog-merchant-mapping">
            {identifying && (
              <IdentifyForm txn={identifying} onClose={() => { setIdentifying(null); qc.invalidateQueries(); }} />
            )}
          </DialogContent>
        </Dialog>

        {/* Edit transaction dialog */}
        <Dialog open={!!editingTxn} onOpenChange={(o) => !o && setEditingTxn(null)}>
          <DialogContent className="sm:max-w-md bg-background border border-border text-foreground" id="dialog-edit-transaction">
            {editingTxn && (
              <EditTxnForm
                txn={editingTxn}
                onClose={() => {
                  setEditingTxn(null);
                  qc.invalidateQueries({ queryKey: ["txns"] });
                  qc.invalidateQueries({ queryKey: ["insights"] });
                  qc.invalidateQueries({ queryKey: ["wellness-insights"] });
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Add txn */}
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent id="dialog-add-transaction">
            <AddTxnForm onClose={() => { setAdding(false); qc.invalidateQueries(); }} />
          </DialogContent>
        </Dialog>

        {/* Food options */}
        <ResponsiveFoodPanel open={showFoodSheet} onOpenChange={setShowFoodSheet} isMobile={isMobile}>
            <SheetHeader>
              <SheetTitle className="text-sm font-black uppercase tracking-wider text-foreground">Campus Dining Hub</SheetTitle>
              <div className="flex border-b border-border mt-2">
                <button
                  onClick={() => setFoodTab("menus")}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all ${
                    foodTab === "menus"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Active Menus
                </button>
                <button
                  onClick={() => setFoodTab("scan")}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all ${
                    foodTab === "scan"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Scan Menu Board
                </button>
                <button
                  onClick={() => setFoodTab("verify")}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all ${
                    foodTab === "verify"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Verify Pending
                </button>
              </div>
            </SheetHeader>

            {foodTab === "menus" && (
              <div className="mt-4 space-y-4 animate-[fadeIn_0.2s_ease-out]">
                {Object.entries(
                  ((foods ?? []) as Food[]).reduce<Record<string, Food[]>>((acc, f) => {
                    (acc[f.venue_name] ??= []).push(f);
                    return acc;
                  }, {}),
                ).map(([venue, items]) => (
                  <div key={venue} className="space-y-1.5">
                    <h4 className="text-[12px] font-black uppercase tracking-wider text-zinc-500">{venue}</h4>
                    <div className="space-y-1">
                      {items.map((it) => {
                        const open = isTimeInRange(new Date(), it.available_from, it.available_until);
                        return (
                          <div key={it.id} className="flex items-center justify-between rounded-xl bg-surface border border-border p-3">
                            <div>
                              <p className="text-xs font-bold text-foreground">{it.item_name}</p>
                              <p className={`text-[10px] ${open ? "text-success font-semibold" : "text-muted-foreground"}`}>
                                {open ? "Available Now" : `Available ${fmtTime(it.available_from)} - ${fmtTime(it.available_until)}`}
                              </p>
                            </div>
                            <span className="tnum text-xs font-black text-primary font-mono">{rupees(it.price)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {(!foods || foods.length === 0) && (
                  <p className="py-8 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">No active menus defined yet.</p>
                )}
              </div>
            )}

            {foodTab === "scan" && (
              <form onSubmit={handleScanSubmit} className="space-y-4 py-4 animate-[fadeIn_0.2s_ease-out]">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Canteen / Venue Name</label>
                  <Input
                    id="input-scan-venue"
                    placeholder="e.g. Hostel 4 Canteen, Nescafe, Main Cafeteria"
                    value={scanVenue}
                    onChange={(e) => setScanVenue(e.target.value)}
                    className="bg-surface border-border text-xs font-semibold"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Menu Image (Max 5MB)</label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border border-dashed border-border rounded-xl cursor-pointer bg-surface hover:bg-surface-raised transition-all">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <ShoppingBag className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-xs text-zinc-300 font-semibold">
                          {scanFile ? scanFile.name : "Select or Drop Menu Photo"}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-1">PNG, JPG or JPEG up to 5MB</p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setScanFile(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                <Button
                  id="btn-submit-scan"
                  type="submit"
                  disabled={scanBusy}
                  className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-black uppercase text-xs h-10 tracking-wider disabled:opacity-50"
                >
                  {scanBusy ? "OCR Scanning & Structuring (AWS Nova)..." : "Analyze Menu with AI"}
                </Button>
              </form>
            )}

            {foodTab === "verify" && (
              <div className="space-y-3 py-4 animate-[fadeIn_0.2s_ease-out] max-h-[50vh] overflow-y-auto">
                <div className="bg-surface-raised border border-border p-3.5 rounded-xl text-xs text-zinc-400 leading-relaxed font-medium">
                  <span className="font-bold text-foreground">Crowdsourced Menu Verification:</span> Verify items scanned by other students. Items require <strong>+3 votes</strong> to go live, or <strong>-3 votes</strong> to be deleted.
                </div>

                {!pendingFoods ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 bg-white/5" />
                    <Skeleton className="h-14 bg-white/5" />
                  </div>
                ) : pendingFoods.length === 0 ? (
                  <div className="py-10 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                    No pending items to verify. Great job!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingFoods.map((it: any) => (
                      <div key={it.id} className="flex items-center justify-between bg-surface border border-border p-3.5 rounded-xl text-xs">
                        <div className="space-y-1 min-w-0 pr-4">
                          <p className="font-bold text-foreground truncate">{it.item_name}</p>
                          <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
                            {it.venue_name} · {rupees(it.price)}
                          </p>
                          <p className="text-[9px] font-bold text-primary tracking-widest uppercase">
                            Votes: {it.verification_votes > 0 ? `+${it.verification_votes}` : it.verification_votes}
                          </p>
                        </div>

                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => handleVerifyVote(it.id, "up")}
                            disabled={verifyMutation.isPending}
                            className="px-3 py-2 rounded-lg bg-success/10 hover:bg-success/20 border border-success/20 text-success font-bold text-[10px] uppercase cursor-pointer"
                          >
                            ✓ Upvote
                          </button>
                          <button
                            onClick={() => handleVerifyVote(it.id, "down")}
                            disabled={verifyMutation.isPending}
                            className="px-3 py-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-destructive font-bold text-[10px] uppercase cursor-pointer"
                          >
                            ✕ Downvote
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
        </ResponsiveFoodPanel>

        {/* Check-in dialog */}
        <Dialog open={showCheckIn} onOpenChange={(open) => {
          setShowCheckIn(open);
          if (!open) {
            localStorage.setItem("pocketbuddy_last_checkin", String(Date.now()));
          }
        }}>
          <DialogContent id="dialog-checkin">
            <DialogHeader>
              <DialogTitle>Hey, how are your meals going?</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground">Quick routine check-in:</p>
            <p className="text-[12px] text-warning">Last food transaction was {Math.round(foodGapHours)} hours ago</p>
            <div className="mt-3 space-y-2">
              <button
                id="btn-checkin-ate"
                onClick={handleCheckInAte}
                className="w-full rounded-md border-l-4 border-l-success bg-surface p-3 text-left text-[13px] cursor-pointer hover:bg-surface-raised transition-colors"
              >
                I had a proper meal (mess, home food, or canteen)
              </button>
              <div className="rounded-md border-l-4 border-l-destructive bg-surface p-3">
                <button
                  id="btn-checkin-skipped"
                  onClick={() => setCheckInExpanded(true)}
                  className="w-full text-left text-[13px] cursor-pointer"
                >
                  Skipped / couldn't eat
                </button>
                {checkInExpanded && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[12px] text-muted-foreground">What happened?</p>
                    <Input
                      id="input-checkin-note"
                      value={checkInNote}
                      onChange={(e) => setCheckInNote(e.target.value)}
                      placeholder="e.g., was studying, no food around, busy"
                    />
                    <Button
                      variant="outline"
                      className="w-full border-destructive text-destructive"
                      onClick={handleCheckInSkipped}
                    >
                      Submit
                    </Button>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  localStorage.setItem("pocketbuddy_last_checkin", String(Date.now()));
                  setShowCheckIn(false);
                }}
              >
                Not now
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

function IdentifyForm({ txn, onClose }: { txn: Txn; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [cat, setCat] = useState<string>("food");
  const [customCat, setCustomCat] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: catalogCategories } = useQuery({
    queryKey: ["catalog", "transaction-categories"],
    queryFn: () => getCatalog("transaction-categories"),
    staleTime: 5 * 60 * 1000,
  });

  const categories = useMemo(() => {
    if (catalogCategories && catalogCategories.length > 0) {
      return catalogCategories.map((c: any) => ({ v: c.value, l: c.label }));
    }
    return [...FALLBACK_CATEGORIES];
  }, [catalogCategories]);

  async function save() {
    if (!name) { toast.error("Enter shop name"); return; }
    if (cat === "other" && !customCat.trim()) { toast.error("Enter custom category"); return; }
    setBusy(true);
    try {
      let finalCategory = cat;
      if (cat === "other" && customCat.trim()) {
        finalCategory = customCat.trim().toLowerCase();
        try { await addCatalogItem("transaction-categories", { label: customCat.trim() }); } catch {}
      }
      await identifyMerchant({ data: { txn_id: txn.id, raw_merchant_string: txn.raw_merchant_string, display_name: name, category: finalCategory } });
      toast.success("Mapped! This helps everyone on campus.");
      qc.invalidateQueries({ queryKey: ["catalog", "transaction-categories"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to identify merchant");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogHeader><DialogTitle>What is this shop?</DialogTitle></DialogHeader>
      <code className="block rounded bg-surface-raised px-3 py-1.5 text-xs">{txn.raw_merchant_string}</code>
      <div>
        <label className="text-[12px] text-muted-foreground">Shop name on campus</label>
        <Input id="input-map-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Hostel 1 Night Canteen" className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {categories.map((c) => (
          <button key={c.v} onClick={() => setCat(c.v)} className={`rounded-md border p-3 text-center text-sm ${cat === c.v ? "border-primary bg-primary/10" : "border-border bg-surface"}`}>{c.l}</button>
        ))}
      </div>
      {cat === "other" && (
        <div className="space-y-1">
          <label className="text-[12px] text-muted-foreground">Custom Category</label>
          <Input id="input-map-custom-category" value={customCat} onChange={(e) => setCustomCat(e.target.value)} placeholder="e.g., Laundry, Books, Printing" />
          <p className="text-[10px] text-zinc-500 pl-1">This category will be saved for future use.</p>
        </div>
      )}
      <DialogFooter>
        <Button id="btn-save-merchant" disabled={busy} onClick={save} className="w-full bg-success text-white hover:bg-success/90">
          Save for everyone on campus
        </Button>
      </DialogFooter>
    </>
  );
}

function AddTxnForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [cat, setCat] = useState<string>("food");
  const [customCat, setCustomCat] = useState("");
  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [busy, setBusy] = useState(false);

  const { data: catalogCategories } = useQuery({
    queryKey: ["catalog", "transaction-categories"],
    queryFn: () => getCatalog("transaction-categories"),
    staleTime: 5 * 60 * 1000,
  });

  const categories = useMemo(() => {
    if (catalogCategories && catalogCategories.length > 0) {
      return catalogCategories.map((c: any) => ({ v: c.value, l: c.label }));
    }
    return [...FALLBACK_CATEGORIES];
  }, [catalogCategories]);

  async function save() {
    if (!amount || !merchant) { toast.error("Fill all fields"); return; }
    if (cat === "other" && !customCat.trim()) { toast.error("Enter custom category"); return; }
    setBusy(true);
    try {
      let finalCategory = cat;
      if (cat === "other" && customCat.trim()) {
        finalCategory = customCat.trim().toLowerCase();
        try { await addCatalogItem("transaction-categories", { label: customCat.trim() }); } catch {}
      }
      await insertTransaction({
        data: {
          amount: Math.round(parseFloat(amount) * 100),
          raw_merchant_string: merchant,
          mapped_merchant_name: merchant,
          category: finalCategory,
          source: "manual",
          direction: direction,
        }
      });
      toast.success("Transaction logged.");
      qc.invalidateQueries({ queryKey: ["catalog", "transaction-categories"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to log transaction");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogHeader><DialogTitle>Log a transaction</DialogTitle></DialogHeader>

      {/* Type Toggle */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          type="button"
          onClick={() => {
            setDirection("debit");
            if (cat === "salary" || cat === "income") setCat("food");
          }}
          className={`rounded-md border p-2 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            direction === "debit"
              ? "border-destructive bg-destructive/10 text-destructive-foreground"
              : "border-border bg-surface text-muted-foreground hover:text-foreground"
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => {
            setDirection("credit");
            setCat("salary");
          }}
          className={`rounded-md border p-2 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            direction === "credit"
              ? "border-success bg-success/10 text-success"
              : "border-border bg-surface text-muted-foreground hover:text-foreground"
          }`}
        >
          Income
        </button>
      </div>

      <div className="flex items-center rounded-md border border-input bg-surface">
        <span className="px-3 text-sm text-muted-foreground">₹</span>
        <input id="input-txn-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1 bg-transparent py-2 pr-3 text-sm outline-none" placeholder="Amount" />
      </div>
      <Input id="input-txn-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={direction === "credit" ? "Sender (e.g. Parents, Friend)" : "e.g. Night Canteen"} />
      <div className="grid grid-cols-2 gap-2">
        {categories.map((c) => (
          <button key={c.v} onClick={() => setCat(c.v)} className={`rounded-md border p-3 text-center text-sm ${cat === c.v ? "border-primary bg-primary/10" : "border-border bg-surface"}`}>{c.l}</button>
        ))}
      </div>
      {cat === "other" && (
        <div className="space-y-1">
          <label className="text-[12px] text-muted-foreground">Custom Category</label>
          <Input id="input-txn-custom-category" value={customCat} onChange={(e) => setCustomCat(e.target.value)} placeholder="e.g., Laundry, Books, Printing" />
          <p className="text-[10px] text-zinc-500 pl-1">This category will be saved for future use.</p>
        </div>
      )}
      <DialogFooter>
        <Button id="btn-submit-txn" disabled={busy} onClick={save} className="w-full">Add</Button>
      </DialogFooter>
    </>
  );
}

function EditTxnForm({ txn, onClose }: { txn: Txn; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(txn.mapped_merchant_name ?? txn.raw_merchant_string);
  const [direction, setDirection] = useState<"debit" | "credit">(txn.direction === "credit" ? "credit" : "debit");

  const { data: catalogCategories } = useQuery({
    queryKey: ["catalog", "transaction-categories"],
    queryFn: () => getCatalog("transaction-categories"),
    staleTime: 5 * 60 * 1000,
  });

  const categories = useMemo(() => {
    if (catalogCategories && catalogCategories.length > 0) {
      return catalogCategories.map((c: any) => ({ v: c.value, l: c.label }));
    }
    return [...FALLBACK_CATEGORIES];
  }, [catalogCategories]);

  const knownValues = categories.map((c) => c.v);
  const isKnownCat = knownValues.includes(txn.category ?? "");
  const [cat, setCat] = useState<string>(isKnownCat ? (txn.category ?? "food") : "other");
  const [customCat, setCustomCat] = useState(isKnownCat ? "" : (txn.category ?? ""));
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Enter merchant display name");
      return;
    }
    if (cat === "other" && !customCat.trim()) {
      toast.error("Enter custom category");
      return;
    }
    setBusy(true);
    try {
      let finalCategory = cat;
      if (cat === "other" && customCat.trim()) {
        finalCategory = customCat.trim().toLowerCase();
        try { await addCatalogItem("transaction-categories", { label: customCat.trim() }); } catch {}
      }

      if (txn.source !== "manual" || txn.needs_verification) {
        await submitParserCorrection({
          data: {
            transaction_id: txn.id,
            corrected_merchant: name.trim(),
            corrected_category: finalCategory,
            corrected_direction: direction,
          }
        });
        toast.success("Correction logged & transaction updated.");
      } else {
        await updateTransaction({
          id: txn.id,
          data: {
            mapped_merchant_name: name.trim(),
            category: finalCategory,
            direction: direction,
          },
        });
        toast.success("Transaction updated.");
      }
      qc.invalidateQueries({ queryKey: ["catalog", "transaction-categories"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update transaction");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Transaction</DialogTitle>
      </DialogHeader>
      
      <div className="space-y-4 py-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Original Reference</label>
          <code className="block rounded bg-surface-raised px-3 py-1.5 text-xs select-all border border-border truncate">{txn.raw_merchant_string}</code>
        </div>

        {/* Type Toggle */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setDirection("debit");
                if (cat === "salary" || cat === "income") setCat("food");
              }}
              className={`rounded-md border p-2 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                direction === "debit"
                  ? "border-destructive bg-destructive/10 text-destructive-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => {
                setDirection("credit");
                setCat("salary");
              }}
              className={`rounded-md border p-2 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                direction === "credit"
                  ? "border-success bg-success/10 text-success"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              Income
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Display Name</label>
          <Input
            id="input-edit-txn-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Canteen, Stationery Shop"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Category</label>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((c) => (
              <button
                key={c.v}
                type="button"
                onClick={() => setCat(c.v)}
                className={`rounded-md border p-3 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  cat === c.v ? "border-primary bg-primary/10 text-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.l}
              </button>
            ))}
          </div>
        </div>

        {cat === "other" && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Custom Category</label>
            <Input
              id="input-edit-txn-custom-category"
              value={customCat}
              onChange={(e) => setCustomCat(e.target.value)}
              placeholder="e.g., Laundry, Books, Printing"
            />
            <p className="text-[10px] text-zinc-500 pl-1">This category will be saved for future use.</p>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button id="btn-save-edit-txn" disabled={busy} onClick={save} className="w-full bg-success text-white hover:bg-success/90">
          Save Changes
        </Button>
      </DialogFooter>
    </>
  );
}
