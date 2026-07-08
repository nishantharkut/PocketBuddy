import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  Plus, ChevronRight, AlertTriangle, Users, Utensils, ShoppingBag,
  Bus, Receipt, MoreHorizontal, Wallet, Timer, MessageSquare, Phone, Mail, MapPin, ExternalLink, Compass, TrendingDown, Calendar,
  ChevronDown, ChevronUp
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
  getRunwayForecast,
  getCampusIntel,
  getWingFeed,
  getWellnessInsights,
  updateTransaction,
  getCatalog,
  addCatalogItem,
  getTravelSavings,
  scanMenuPhoto,
  createCampusFoodItem,
  editCampusFoodItem,
  deleteCampusFoodItem,
  verifyCampusFoodItem,
  getFoodSignals,
  submitFoodSignalResponse,
  submitParserCorrection,
  getWingNettedBalances,
  confirmSubscription,
  ignoreSubscription,
} from "@/lib/api/db.functions";


const getTrustBadgeLabel = (item: any, isPending: boolean = false) => {
  // 1. Prefer backend-provided trust/status fields
  if (item.trust_badge) {
    const tb = String(item.trust_badge).toLowerCase();
    if (tb === "partner verified" || tb === "official") return "Official";
    if (tb === "student confirmed" || tb === "trusted") return "Trusted";
    if (tb === "campus baseline" || tb === "baseline" || tb === "") return "";
    return item.trust_badge;
  }

  const status = String(item.status || "").toLowerCase();
  if (status === "disputed_hidden" || Number(item.dispute_count ?? 0) > 0) {
    return "Disputed";
  }
  if (isPending || status === "pending_verification" || status === "needs_review") {
    return "Needs confirmation";
  }

  // 2. Fallback to source_type/source
  const src = String(item.source_type || item.source || "").toLowerCase();
  if (src === "partner_verified" || src === "partner_api") return "Official";
  if (src === "student_confirmed" || src === "trusted_direct_edit") return "Trusted";
  if (src === "curated_baseline" || src === "baseline") return "";
  if (src === "transaction_seen") return "Seen in payments";
  if (src === "menu_scan_pending" || src === "price_change_review" || src === "needs_review") {
    return "Needs confirmation";
  }

  if (Number(item.confirmation_count ?? 0) > 0 || Number(item.verification_votes ?? 0) > 0) {
    return "Needs confirmation";
  }
  return "";
};

const getTrustBadgeClass = (label: string) => {
  switch (label) {
    case "Official":
    case "Partner verified":
      return "border-blue-500/20 bg-blue-500/5 text-blue-400";
    case "Trusted":
    case "Student confirmed":
      return "border-emerald-500/20 bg-emerald-500/5 text-emerald-400";
    case "Disputed":
      return "border-red-500/20 bg-red-500/5 text-red-400";
    case "Needs confirmation":
    case "Needs review":
    case "Price review":
      return "border-amber-500/20 bg-amber-500/5 text-amber-400";
    case "Seen in payments":
      return "border-violet-500/20 bg-violet-500/5 text-violet-400";
    default:
      return "border-zinc-500/20 bg-zinc-500/5 text-zinc-400";
  }
};

const getPriceFreshnessClass = (state: string) => {
  switch (state) {
    case "fresh":
      return "text-success";
    case "recent":
    case "baseline":
      return "text-zinc-400";
    case "needs_price_check":
    case "under_review":
    case "price_spike_review":
      return "text-warning";
    default:
      return "text-zinc-400";
  }
};

const getFoodReviewSourceLabel = (item: any) => {
  const source = String(item.source_type || item.source || "").toLowerCase();
  if (source === "manual_menu_add" || source === "student_menu_submission") return "Added manually";
  if (source === "community_item_quiz") return "From food signal";
  if (source === "manual_correction") return "Suggested correction";
  if (source === "price_change_review" || source === "price_spike_quiz" || source === "receipt_price_spike_review") return "Price check signal";
  if (source === "ocr_menu_scan" || source === "demo_menu_scan" || source === "menu_scan_pending") return "Submitted from menu scan";
  return "Campus review candidate";
};

export const Route = createLazyFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Profile = any;
type Txn = any;
type Food = any;
type Sub = any;
type Pool = any;
type PoolItem = any;

function transactionTrustLabel(txn: any) {
  if (txn.verification_status === "aa_verified" || txn.data_origin === "account_aggregator") return "Sandbox source";
  if (txn.needs_verification || txn.verification_status === "needs_review") return "Needs review";
  if (txn.user_confirmed_at || txn.user_corrected || txn.verification_status === "user_reviewed") return "Reviewed";
  if (
    txn.data_origin === "android_on_device" ||
    txn.privacy_mode === "on_device_only" ||
    ((txn.source || "").startsWith("companion") && txn.raw_payload_received === false)
  ) {
    return "On-device";
  }
  if (txn.raw_payload_received === true || txn.data_origin === "legacy_android_raw_ingest") return "Masked legacy";
  if (txn.source === "manual" || txn.data_origin === "user_entered") return "Manual";
  return null;
}

function transactionTrustClass(label: string | null) {
  if (label === "Needs review") return "text-warning bg-warning/10 border-warning/20";
  if (label === "Reviewed" || label === "Sandbox source") return "text-success bg-success/10 border-success/20";
  if (label === "On-device") return "text-primary bg-primary/10 border-primary/20";
  return "text-zinc-500 bg-white/5 border-border";
}

const isPoolFullyPaid = (p: any) => {
  if (p.status !== "completed") return false;
  const breakdown = p.split_breakdown ?? {};
  const roommates = Object.keys(breakdown).filter((rName) => {
    const isHost = rName.toLowerCase() === "you" || rName.toLowerCase() === (p.created_by_name ?? "").toLowerCase();
    return !isHost;
  });
  if (roommates.length === 0) return true;
  return roommates.every((rName) => breakdown[rName].paid);
};

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
        <text x={cx} y={cy - 6} textAnchor="middle" fill={color} fontSize="26" fontWeight="900" fontFamily="var(--font-sans)">{score}</text>
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
          <span className="text-[11px] md:text-xs text-zinc-400 font-black leading-none">{part.label}</span>
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
            <span className="text-[10px] md:text-xs text-zinc-400 capitalize truncate">{seg.category}</span>
            <span className="text-[10px] md:text-xs font-bold text-foreground ml-auto">{seg.pct}%</span>
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
            <Link to="/pool" className="h-8 rounded-lg bg-primary text-primary-foreground px-3 flex items-center justify-center text-[10px] md:text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all">
              Join Swiggy Pool
            </Link>
            <Link to="/runway" className="h-8 rounded-lg bg-surface border border-border text-foreground px-3 flex items-center justify-center text-[10px] md:text-xs font-bold uppercase tracking-wider hover:bg-surface-raised transition-all">
              Runway Sandbox
            </Link>
            <button onClick={() => setSelectedPlan(null)} className="h-8 rounded-lg bg-surface-raised text-zinc-400 px-3 text-[10px] md:text-xs font-bold uppercase tracking-wider hover:text-zinc-200 transition-all cursor-pointer">
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
            <Link to="/runway" className="h-8 rounded-lg bg-primary text-primary-foreground px-3 flex items-center justify-center text-[10px] md:text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all">
              Track Projections
            </Link>
            <button onClick={() => setSelectedPlan(null)} className="h-8 rounded-lg bg-surface-raised text-zinc-400 px-3 text-[10px] md:text-xs font-bold uppercase tracking-wider hover:text-zinc-200 transition-all cursor-pointer">
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
            <Link to="/runway" className="h-8 rounded-lg bg-primary text-primary-foreground px-3 flex items-center justify-center text-[10px] md:text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all">
              Check Runway
            </Link>
            <button onClick={() => setSelectedPlan(null)} className="h-8 rounded-lg bg-surface-raised text-zinc-400 px-3 text-[10px] md:text-xs font-bold uppercase tracking-wider hover:text-zinc-200 transition-all cursor-pointer">
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

function MealRunwayCheck({ calc, runwayView }: { calc: any; runwayView?: any }) {
  const [selectedPlan, setSelectedPlan] = useState<null | "delivery" | "routine" | "shared">(null);
  const routine = runwayView?.foodRoutine ?? {};
  const safeDailyPaise = runwayView?.safeDailyPaise ?? Math.round((calc?.safeDailyLimit ?? 200) * 100);
  const foodCapPaise = routine?.recommended_daily_food_cap ?? safeDailyPaise;
  const deliveryCostPaise = routine?.delivery?.avg_order || 25_000;
  const routineType = routine?.type ?? "mixed";
  const routineMeta: Record<string, { label: string; option: string; detail: string }> = {
    hostel_mess: {
      label: "Hostel mess / campus meals",
      option: "Use mess or campus meal",
      detail: "Best when your mess is prepaid or predictable. It keeps delivery from eating into the safe/day number.",
    },
    pg_cooking: {
      label: "PG cooking / groceries",
      option: "Cook or heat PG meal",
      detail: "Use groceries or a prepped PG meal before delivery. This is the strongest lever for students outside hostel mess.",
    },
    day_scholar: {
      label: "Day scholar meals",
      option: "Packed/home meal + campus snack",
      detail: "Keep one predictable packed or campus meal so commute snacks do not quietly shrink runway.",
    },
    mixed: {
      label: "Mixed meal routine",
      option: "Choose routine campus meal",
      detail: "Pick the repeatable low-cost meal first, then use delivery only when the daily limit can absorb it.",
    },
  };
  const activeRoutine = routineMeta[routineType] ?? routineMeta.mixed;
  const routineMealCostPaise =
    routine?.routine_meal_cost ||
    Math.max(4_000, Math.min(foodCapPaise || 14_000, Math.round((foodCapPaise || 14_000) / 2)));
  const sharedCostPaise = Math.max(
    4_000,
    Math.min(deliveryCostPaise, Math.round((deliveryCostPaise + routineMealCostPaise) / 2))
  );
  const plans = [
    {
      id: "routine" as const,
      label: activeRoutine.option,
      cost: routineMealCostPaise,
      icon: Utensils,
      tone: "text-pb-green",
      border: "border-pb-green/20",
      bg: "bg-pb-green/5",
      detail: activeRoutine.detail,
    },
    {
      id: "shared" as const,
      label: routineType === "pg_cooking" ? "Split groceries with roommate" : "Pool / shared campus order",
      cost: sharedCostPaise,
      icon: Users,
      tone: "text-primary",
      border: "border-primary/20",
      bg: "bg-primary/5",
      detail:
        routineType === "pg_cooking"
          ? "A shared grocery run reduces per-meal cost without forcing hostel-mess assumptions."
          : "Pooling cuts delivery fees and keeps the order closer to your safe food cap.",
    },
    {
      id: "delivery" as const,
      label: "Individual delivery order",
      cost: deliveryCostPaise,
      icon: ShoppingBag,
      tone: "text-pb-red",
      border: "border-pb-red/20",
      bg: "bg-pb-red/5",
      detail: "Convenient, but this is usually the fastest way food pace starts reducing runway.",
    },
  ];
  const selected = plans.find((plan) => plan.id === selectedPlan);
  const savedVsDelivery = selected ? Math.max(0, deliveryCostPaise - selected.cost) : 0;
  const safeUsage = selected && safeDailyPaise > 0 ? Math.round((selected.cost / safeDailyPaise) * 100) : 0;
  const capGap = selected ? selected.cost - foodCapPaise : 0;
  const SelectedIcon = selected?.icon;

  if (selected && SelectedIcon) {
    return (
      <Card id="card-interactive-runway-check" className={`bg-surface border ${selected.border} p-4 relative overflow-hidden transition-all duration-300`}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(255,107,0,0.04), transparent 65%)" }} />
        <div className="relative space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`w-fit ${selected.border} ${selected.bg} ${selected.tone} text-[10px] uppercase tracking-wider font-semibold`}>
                {activeRoutine.label}
              </Badge>
              <Badge variant="outline" className="w-fit border-border bg-surface-raised text-[10px] md:text-xs uppercase tracking-wider font-semibold">
                {rupees(selected.cost)} today
              </Badge>
            </div>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 h-10 w-10 rounded-xl border ${selected.border} ${selected.bg} ${selected.tone} flex items-center justify-center shrink-0`}>
                <SelectedIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm sm:text-base font-semibold text-foreground">{selected.label}</h4>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">{selected.detail}</p>
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-surface-raised/60 p-3 text-xs leading-relaxed text-muted-foreground">
              {capGap > 0 ? (
                <>
                  This is <span className="font-semibold text-pb-amber">{rupees(capGap)} above</span> your food cap of{" "}
                  <span className="font-semibold text-foreground">{rupees(foodCapPaise)}</span>. Choose lighter spends for the rest of today.
                </>
              ) : (
                <>
                  This stays within your food cap of <span className="font-semibold text-foreground">{rupees(foodCapPaise)}</span> and uses{" "}
                  <span className="font-semibold text-foreground">{safeUsage}%</span> of your safe daily limit.
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border/70 pt-3">
            <p className="text-xs text-zinc-500 leading-relaxed">
              {savedVsDelivery > 0
                ? `Choosing this instead of individual delivery keeps about ${rupees(savedVsDelivery)} inside your runway today.`
                : "This option is useful only when today's safe/day can absorb the full cost."}
            </p>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Link to="/runway" className="h-8 rounded-lg bg-primary text-primary-foreground px-3 flex items-center justify-center text-[10px] md:text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all">
                Full Runway
              </Link>
              <button onClick={() => setSelectedPlan(null)} className="h-8 rounded-lg bg-surface-raised text-zinc-400 px-3 text-[10px] md:text-xs font-bold uppercase tracking-wider hover:text-zinc-200 transition-all cursor-pointer">
                Change
              </button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card id="card-interactive-runway-check" className="bg-surface border border-border rounded-2xl p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(255,107,0,0.04), transparent 65%)" }} />
      <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Compass className="h-4.5 w-4.5 text-primary" />
            <p className="text-xs font-bold tracking-[0.15em] text-zinc-500 uppercase">Meal check</p>
          </div>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-medium max-w-2xl">
            Pick the likely meal and see if it fits today.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-primary/20 bg-primary/10 text-primary text-[10px] md:text-xs uppercase tracking-wider font-semibold">
          Food cap {rupees(foodCapPaise)}
        </Badge>
      </div>

      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-3">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const saved = Math.max(0, deliveryCostPaise - plan.cost);
          return (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className="w-full text-left p-3 rounded-xl border border-border bg-surface-raised/60 hover:bg-surface hover:border-primary/35 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 shrink-0 ${plan.tone}`} />
                    <span className="text-xs font-semibold text-foreground">{plan.label}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground tnum">{rupees(plan.cost)}</p>
                  {saved > 0 && <p className="text-[10px] md:text-xs font-bold text-pb-green">Saves {rupees(saved)} vs delivery</p>}
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-primary transition-transform group-hover:translate-x-0.5 shrink-0" />
              </div>
            </button>
          );
        })}
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

  const { data: runwayForecast } = useQuery({
    queryKey: ["runway-forecast", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    retry: false,
    queryFn: () => getRunwayForecast(),
  });

  const { data: wellness, isLoading: wellnessLoading, isError: wellnessError } = useQuery({
    queryKey: ["wellness-insights", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => getWellnessInsights(),
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

  // Burnout score derived from insights
  const calc = useMemo(() => {
    if (!profile) return null;
    const totalAllowance = profile.monthly_allowance / 100;
    const cycleStart = getCycleStart(profile.cycle_start_day);
    const cycleEnd = getCycleEnd(cycleStart);
    const cycleTxns = (txns ?? []).filter((t) => new Date(t.created_at) >= cycleStart && t.direction !== "credit");
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
        .filter((t) => new Date(t.created_at).toDateString() === todayStr && t.direction !== "credit")
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

  // Burnout score is now calculated on the backend via /api/insights/wellness

  const runwayView = useMemo(() => {
    if (!runwayForecast && !calc) return null;
    const currentCycle = runwayForecast?.current_cycle;
    const projection = runwayForecast?.projection;
    const foodRoutine = runwayForecast?.food_routine;
    const decision = runwayForecast?.decision_engine;
    const allowancePaise = currentCycle?.available_funding ?? Math.round((calc?.totalAllowance ?? 0) * 100);
    const spentPaise = currentCycle?.spent ?? Math.round((calc?.totalSpent ?? 0) * 100);
    const pct = allowancePaise > 0 ? Math.min(100, Math.round((spentPaise / allowancePaise) * 100)) : calc?.pct ?? 0;
    return {
      days: projection?.days_until_broke ?? calc?.runwayDays ?? 0,
      safeDailyPaise: projection?.safe_daily_spend ?? Math.round((calc?.safeDailyLimit ?? 0) * 100),
      remainingPaise: currentCycle?.remaining ?? Math.round((calc?.remaining ?? 0) * 100),
      spentTodayPaise: Math.round((calc?.spentToday ?? 0) * 100),
      allowancePaise,
      cycleEnd: currentCycle?.end ? new Date(currentCycle.end) : calc?.cycleEnd,
      daysLeft: currentCycle?.days_left ?? calc?.daysLeft ?? 0,
      projectedDailyPaise: projection?.projected_daily_spend ?? 0,
      shortfallProbability: projection?.shortfall_probability ?? 0,
      nextAction: decision?.next_best_action,
      pct,
      status: runwayForecast?.status ?? "healthy",
      foodRoutine,
      decision,
      possibleCommitments: runwayForecast?.possible_commitments ?? [],
      possibleCommitmentsTotal: runwayForecast?.possible_commitments_total ?? 0,
    };
  }, [runwayForecast, calc]);

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

  const menuFoodGapHours = useMemo(() => {
    const lastFood = (txns ?? []).find((t) => t.category === "food");
    return lastFood ? (Date.now() - new Date(lastFood.created_at).getTime()) / 3600000 : undefined;
  }, [txns]);

  const { data: foods } = useQuery({
    queryKey: [
      "foods",
      runwayView?.safeDailyPaise,
      menuFoodGapHours ? Math.floor(menuFoodGapHours) : null,
      runwayView?.foodRoutine?.routine_type,
      profile?.mess_enrolled,
    ],
    staleTime: 30_000,
    queryFn: () =>
      getCampusFood({
        safeFoodBudgetPaise: runwayView?.safeDailyPaise,
        mealGapHours: menuFoodGapHours,
        foodRoutineType: runwayView?.foodRoutine?.routine_type,
        messEnrolled: profile?.mess_enrolled,
      }),
  });

  // Best food suggestion
  const bestFood = useMemo(() => {
    if (!foods?.length) return null;
    const now = new Date();
    const foodScore = (food: Food) => {
      const available = isTimeInRange(now, food.available_from, food.available_until);
      const trustScore = Number(food.trust_score ?? 50);
      const price = Number(food.price ?? 0);
      const budgetBonus =
        food.budget_fit === "safe"
          ? 24
          : food.budget_fit === "tight"
            ? 8
            : food.budget_fit === "avoid_today"
              ? -36
              : 0;
      const sourcePenalty =
        food.source_type === "external_snapshot"
          ? -14
          : food.source_type === "price_change_review" || food.source_type === "menu_scan_pending"
            ? -60
            : 0;
      const freshnessBonus =
        food.price_freshness_state === "needs_price_check"
          ? -22
          : food.price_freshness_state === "fresh" || food.price_freshness_state === "recent"
            ? 4
            : 0;
      return (available ? 40 : -20) + trustScore + budgetBonus + sourcePenalty + freshnessBonus - Math.min(price / 1000, 12);
    };
    return [...foods]
      .filter((food) => Number(food.price ?? 0) > 0 && !["pending_verification", "rejected", "merged_into_active", "needs_review", "disputed_hidden"].includes(String(food.status ?? "active")))
      .sort((a, b) => foodScore(b) - foodScore(a))[0] ?? null;
  }, [foods]);

  const runwayColor = runwayView
    ? runwayView.days >= 15
      ? "var(--success)"
      : runwayView.days >= 7
        ? "var(--warning)"
        : "var(--destructive)"
    : "var(--primary)";
  const runwayStatusLabel = runwayView?.status === "shortfall" ? "Shortfall" : runwayView?.status === "watch" ? "Watch" : "Healthy";
  const runwayStatusClass =
    runwayView?.status === "shortfall"
      ? "bg-destructive/10 border-destructive/25 text-destructive"
      : runwayView?.status === "watch"
        ? "bg-warning/10 border-warning/25 text-warning"
        : "bg-success/10 border-success/25 text-success";

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

  const recent = (txns ?? []).slice(0, 5);

  // Dialogs
  const [identifying, setIdentifying] = useState<Txn | null>(null);
  const [editingTxn, setEditingTxn] = useState<Txn | null>(null);
  const [adding, setAdding] = useState(false);
  const [showFoodSheet, setShowFoodSheet] = useState(false);
  const [isWellnessExpanded, setIsWellnessExpanded] = useState(false);

  // Food scanner and crowdsourced verification state & hooks
  const [foodTab, setFoodTab] = useState<"menus" | "add" | "signals" | "verify">("menus");
  const [scanVenue, setScanVenue] = useState("");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [manualVenue, setManualVenue] = useState("");
  const [manualItemName, setManualItemName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editingFoodName, setEditingFoodName] = useState("");
  const [editingFoodPrice, setEditingFoodPrice] = useState("");

  const { data: pendingFoods, refetch: refetchPending } = useQuery({
    queryKey: ["pending-foods", "review_queue"],
    queryFn: () => getCampusFood("review_queue"),
    enabled: showFoodSheet && foodTab === "verify",
  });

  const { data: foodSignals, refetch: refetchFoodSignals } = useQuery({
    queryKey: ["food-signals"],
    queryFn: () => getFoodSignals(),
    enabled: showFoodSheet && foodTab === "signals",
  });

  const reviewFoods = useMemo(() => {
    return pendingFoods || [];
  }, [pendingFoods]);

  const pendingItems = useMemo(() => {
    return reviewFoods.filter(it => !it.dispute_count || Number(it.dispute_count) === 0);
  }, [reviewFoods]);

  const disputedItems = useMemo(() => {
    return reviewFoods.filter(it => Number(it.dispute_count ?? 0) > 0);
  }, [reviewFoods]);

  const canRemoveFoodCandidate = (item: any) => {
    const ownerId = item?.submitted_by || item?.scanned_by;
    return Boolean(user?.id && ownerId === user.id);
  };

  const verifyMutation = useMutation({
    mutationFn: verifyCampusFoodItem,
    onSuccess: (res) => {
      refetchPending();
      qc.invalidateQueries({ queryKey: ["foods"] });
      toast.success(
        res.status === "promoted_to_active"
          ? "Item promoted to active campus menu!"
          : res.status === "merged_into_active"
          ? "Correction merged into the trusted menu."
          : res.status === "disputed_hidden"
          ? "Item hidden from recommendations for review."
          : res.status === "rejected"
          ? "Item rejected after community dispute."
          : res.status === "submitter_cannot_self_confirm"
          ? "Another student needs to confirm your submission."
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

  const createFoodMutation = useMutation({
    mutationFn: createCampusFoodItem,
    onSuccess: (res: any) => {
      toast.success(res.message || "Menu item saved for campus verification.");
      setManualVenue("");
      setManualItemName("");
      setManualPrice("");
      setFoodTab("verify");
      refetchPending();
      qc.invalidateQueries({ queryKey: ["foods"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save menu item.");
    },
  });

  const editFoodMutation = useMutation({
    mutationFn: editCampusFoodItem,
    onSuccess: (res: any) => {
      toast.success(res.message || "Correction saved for campus verification.");
      setEditingFoodId(null);
      setEditingFoodName("");
      setEditingFoodPrice("");
      refetchPending();
      qc.invalidateQueries({ queryKey: ["foods"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save food correction.");
    },
  });

  const deleteFoodMutation = useMutation({
    mutationFn: deleteCampusFoodItem,
    onSuccess: () => {
      toast.success("Menu candidate removed.");
      refetchPending();
      qc.invalidateQueries({ queryKey: ["foods"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Only your pending submissions can be removed.");
    },
  });

  const foodSignalMutation = useMutation({
    mutationFn: submitFoodSignalResponse,
    onSuccess: (res: any) => {
      toast.success(res.message || "Food signal saved.");
      refetchFoodSignals();
      refetchPending();
      qc.invalidateQueries({ queryKey: ["foods"] });
      qc.invalidateQueries({ queryKey: ["txns"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to submit food signal.");
    },
  });

  const handleManualFoodSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const priceRupees = Number(manualPrice);
    if (!manualVenue.trim() || !manualItemName.trim() || !Number.isFinite(priceRupees) || priceRupees <= 0) {
      toast.error("Enter venue, item, and a positive price.");
      return;
    }
    createFoodMutation.mutate({
      data: {
        venue_name: manualVenue.trim(),
        item_name: manualItemName.trim(),
        price: Math.round(priceRupees * 100),
        campus: profile?.college_name || "ABV-IIITM Gwalior",
      },
    });
  };

  const startFoodEdit = (item: Food) => {
    setEditingFoodId(item.id);
    setEditingFoodName(String(item.item_name || ""));
    setEditingFoodPrice(String(Number(item.price || 0) / 100));
  };

  const submitFoodEdit = (item: Food) => {
    const priceRupees = Number(editingFoodPrice);
    if (!editingFoodName.trim() || !Number.isFinite(priceRupees) || priceRupees <= 0) {
      toast.error("Enter an item name and positive price.");
      return;
    }
    editFoodMutation.mutate({
      id: item.id,
      data: {
        item_name: editingFoodName.trim(),
        price: Math.round(priceRupees * 100),
      },
    });
  };

  const submitFoodSignal = (signal: any, response: string) => {
    foodSignalMutation.mutate({
      data: {
        quiz_id: signal.id,
        quiz_type: signal.type,
        response_val: response,
        venue_name: signal.venue_name,
        price: signal.price,
        item_name: signal.item_name,
        old_price: signal.old_price,
        new_price: signal.new_price,
      },
    });
  };

  const scanMutation = useMutation({
    mutationFn: scanMenuPhoto,
    onSuccess: (res) => {
      toast.success(res.message || "Menu photo saved for campus review.");
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
  const [stressNote, setStressNote] = useState("");
  const checkinChecked = useRef(false);

  // Red State Wellness Check-in
  const [redCheckinText, setRedCheckinText] = useState("");
  const [redCheckinSubmitting, setRedCheckinSubmitting] = useState(false);

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


  const foodGapHours = menuFoodGapHours ?? 0;

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
        body: "Your spending tracker is active. Start logging transactions or pair the Android companion to begin tracking automatically.",
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
        body: runwayView?.foodRoutine?.action?.detail ?? `You've ordered ${delivCount}× via delivery this month. Keep food near ${rupees(runwayView?.foodRoutine?.recommended_daily_food_cap ?? 0)}/day to protect runway.`,
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

    // Exam stress
    if (insights.exam?.in_exam_period) {
      list.push({
        id: "exam_stress",
        icon: AlertTriangle,
        accent: "#ef4444",
        title: `Exam period — ${insights.exam.days_left}d left`,
        body: runwayView?.foodRoutine?.action?.detail ?? "Your budget matters most right now. Keep meals predictable and avoid using exam buffer for routine food.",
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
    if (subBleed > 300 && runwayView && runwayView.safeDailyPaise < 15_000) {
      list.push({
        id: "sub_bleed",
        icon: Receipt,
        accent: "#C27D56",
        title: "Subscription bleed warning",
        body: `₹${Math.round(subBleed)}/month in active subscriptions. With your current runway, consider pausing non-essential ones.`,
      });
    }

    return list;
  }, [insights, calc, runwayView]);

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
        stress_note: stressNote,
      },
    });
    localStorage.setItem("pocketbuddy_last_checkin", String(Date.now()));
    setShowCheckIn(false);
    setStressNote("");
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
    let stress_note = "";
    let toastMsg = "";

    if (action === "ate") {
      response = "wellness_ate";
      stress_note = "User tapped wellness check-in: I ate";
      toastMsg = "Great, logged! Keep fueling through the week 💪";

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
      stress_note = "User tapped wellness check-in: I need a break";
      toastMsg = "Take a breather. A 15-minute break does wonders ☕";
    } else {
      response = "wellness_plan_spending";
      stress_note = "User tapped wellness check-in: I'll plan spending";
      toastMsg = "Smart! Planning your spends keeps your runway safe 📊";
    }

    try {
      await insertCheckinLog({
        data: {
          response,
          stress_note,
          suggestion_given: "wellness_index",
          food_gap_hours: foodGapHoursNum,
        },
      });
      toast.success(toastMsg);
      qc.invalidateQueries({ queryKey: ["wellness-insights"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["txns"] });
      qc.invalidateQueries({ queryKey: ["wing-feed"] });
    } catch (err) {
      toast.error("Failed to submit check-in");
    }
  }

  async function handleRedCheckinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!redCheckinText.trim() || !user || !wellness) return;
    setRedCheckinSubmitting(true);
    try {
      const foodGapSig = wellness.avg_food_gap_hours_7d || 0;
      await insertCheckinLog({
        data: {
          response: "wellness_text_response",
          stress_note: `User wellness check-in: ${redCheckinText}`,
          food_gap_hours: foodGapSig,
          suggestion_given: "wellness_index",
        },
      });
      toast.success("Thank you for sharing. Hang in there!");
      setRedCheckinText("");
      qc.invalidateQueries({ queryKey: ["wellness-insights"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["txns"] });
      qc.invalidateQueries({ queryKey: ["wing-feed"] });
    } catch (err) {
      toast.error("Failed to submit check-in");
    } finally {
      setRedCheckinSubmitting(false);
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
        <div className="hidden">
          <button
            onClick={() => nav({ to: "/companion" })}
            title={compStatus === "green" ? "Companion syncing" : compStatus === "amber" ? "Companion idle" : "No companion"}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-surface border border-border transition-colors hover:bg-surface-raised"
          >
            <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${compStatus === "green" ? "bg-success" : compStatus === "amber" ? "bg-warning" : "bg-destructive"}`} />
          </button>
          <Badge variant="outline" id="badge-wing" className="bg-white/5 border-border text-foreground font-bold text-[10px] md:text-xs">
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

            {/* Student Wellness Index Card */}
            <div id="card-wellness-index" className="bg-surface rounded-2xl border border-border relative overflow-hidden transition-all duration-300 hover:border-white/10">
              <div className="absolute top-0 left-0 w-full h-[2px]" style={{
                background: wellness?.status === "steady"
                  ? "linear-gradient(to right, #10b981, #34d399)"
                  : wellness?.status === "watch"
                    ? "linear-gradient(to right, #f59e0b, #fbbf24)"
                    : "linear-gradient(to right, #ef4444, #f87171)"
              }} />

              {wellnessLoading ? (
                <div className="p-4 md:p-5 space-y-3">
                  <Skeleton className="h-5 w-1/4" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : wellnessError ? (
                <div className="p-4 md:p-5 rounded-xl border border-dashed border-destructive/20 bg-destructive/5">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider">Wellness metrics unavailable</p>
                  <p className="text-xs text-zinc-500 mt-1">We couldn't load your wellness metrics. Please try again later.</p>
                </div>
              ) : (txns ?? []).length === 0 ? (
                <div className="p-4 md:p-5 rounded-xl border border-dashed border-border bg-surface-raised/40 text-center">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">No Transaction History</p>
                  <p className="text-xs text-zinc-500 mt-1">Add a few spends to build your wellness pattern.</p>
                  <div className="mt-3">
                    <Button
                      variant="secondary"
                      className="text-xs uppercase tracking-wider font-bold h-7 bg-surface-raised border-border"
                      onClick={() => setAdding(true)}
                    >
                      Log Transaction
                    </Button>
                  </div>
                </div>
              ) : (wellness?.status === "steady" && !isWellnessExpanded) ? (
                <div
                  className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
                  onClick={() => setIsWellnessExpanded(true)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[var(--pb-green)] shrink-0 animate-pulse" />
                    <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase font-mono shrink-0">Student Wellness Index:</p>
                    <span className="text-sm font-black text-[var(--pb-green)] tnum shrink-0">{wellness.score}</span>
                    <Badge variant="outline" className="font-bold text-[9px] px-1.5 py-0 tracking-wider uppercase bg-[rgba(22,163,74,0.05)] border-[rgba(22,163,74,0.3)] text-[var(--pb-green)] shrink-0">
                      Steady
                    </Badge>
                    <span className="text-xs text-zinc-400 font-medium truncate hidden sm:inline ml-2">
                      {wellness.message || "Your spending and meal habits are currently steady and within safe bounds."}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-widest font-mono hidden sm:inline">Details</span>
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              ) : (
                <div className="p-5 md:p-6">
                  {/* Expanded Header: restore large prominent score numbers and badge side-by-side */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-border/40 pb-3">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase font-mono">
                        Student Wellness Index
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl md:text-4xl font-black tracking-tighter text-foreground tnum leading-none font-display" style={{
                          color: wellness.status === "steady" ? "var(--pb-green)" : wellness.status === "watch" ? "var(--pb-amber)" : "var(--pb-red)"
                        }}>{wellness.score}</span>
                        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest font-mono">/ 100 Wellness Score</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-bold text-xs px-2.5 py-1 tracking-wider uppercase" style={{
                        borderColor: wellness.status === "steady" ? "rgba(22,163,74,0.3)" : wellness.status === "watch" ? "rgba(217,119,6,0.3)" : "rgba(220,38,38,0.3)",
                        color: wellness.status === "steady" ? "var(--pb-green)" : wellness.status === "watch" ? "var(--pb-amber)" : "var(--pb-red)",
                        background: wellness.status === "steady" ? "rgba(22,163,74,0.05)" : wellness.status === "watch" ? "rgba(217,119,6,0.05)" : "rgba(220,38,38,0.05)"
                      }}>
                        {wellness.status === "steady" ? "STEADY" : wellness.status === "watch" ? "WATCH" : "STRESSED"}
                      </Badge>

                      {wellness?.status === "steady" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsWellnessExpanded(false);
                          }}
                          className="p-1 hover:bg-white/5 rounded transition-colors text-zinc-500 hover:text-zinc-300 cursor-pointer"
                          title="Collapse Card"
                        >
                          <ChevronUp className="w-4.5 h-4.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs md:text-sm text-zinc-300 font-medium leading-relaxed mb-4">
                    {wellness.status === "stressed"
                      ? "We noticed a stack of stressful signals today. Remember, your runway and meals don't define you. Taking it one step at a time is enough. You can do this."
                      : wellness.message}
                  </p>

                  <div className="border-t border-border/40 pt-3 mt-1 mb-3">
                    <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-2.5 font-mono">Contributing Signals</p>

                    <div className="flex flex-wrap gap-2">
                      {wellness.signals?.map((sig: any) => (
                        <div key={sig.key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-surface-raised/20 text-xs font-medium" style={{
                          borderColor: sig.severity === "stressed"
                            ? "rgba(239,68,68,0.25)"
                            : sig.severity === "watch"
                              ? "rgba(245,158,11,0.25)"
                              : "var(--border)"
                        }} title={sig.detail}>
                          <span className="text-zinc-400">{sig.label}:</span>
                          <span className="font-bold text-foreground">{sig.value}</span>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{
                            background: sig.severity === "stressed"
                              ? "var(--pb-red)"
                              : sig.severity === "watch"
                                ? "var(--pb-amber)"
                                : "var(--pb-green)"
                          }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {wellness.status === "watch" && (
                    <div className="border-t border-border/40 pt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <span className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-1 sm:mb-0 sm:mr-2 font-mono">Quick Check-in:</span>
                      <div className="flex flex-wrap gap-2 flex-1">
                        <button
                          id="btn-wellness-ate"
                          onClick={() => handleWellnessAction("ate")}
                          className="flex-1 min-h-[38px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-success hover:text-success/90 bg-success/5 hover:bg-success/10 border border-success/20 hover:border-success/30 rounded-xl transition-all cursor-pointer"
                        >
                          I Ate Meal
                        </button>
                        <button
                          id="btn-wellness-break"
                          onClick={() => handleWellnessAction("break")}
                          className="flex-1 min-h-[38px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-warning hover:text-warning/90 bg-warning/5 hover:bg-warning/10 border border-warning/20 hover:border-warning/30 rounded-xl transition-all cursor-pointer"
                        >
                          I Need a Break
                        </button>
                        <button
                          id="btn-wellness-spending"
                          onClick={() => handleWellnessAction("spending")}
                          className="flex-1 min-h-[38px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground hover:text-foreground/90 bg-white/5 hover:bg-white/10 border border-border hover:border-white/15 rounded-xl transition-all cursor-pointer"
                        >
                          I'll Plan Spending
                        </button>
                      </div>
                    </div>
                  )}

                  {wellness.status === "stressed" && (
                    <div className="border-t border-border/40 pt-4 mt-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Column 1: Check-in Form */}
                        <form onSubmit={handleRedCheckinSubmit} className="space-y-2.5">
                          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase pl-0.5 font-mono">Submit Feedback Check-in</p>
                          <textarea
                            value={redCheckinText}
                            onChange={(e) => setRedCheckinText(e.target.value)}
                            placeholder="How are you feeling today? Write down any notes, feelings or stress points..."
                            className="w-full min-h-[96px] bg-background/50 border border-border rounded-xl p-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 resize-none text-foreground placeholder:text-muted-foreground/50 leading-relaxed transition-all"
                            disabled={redCheckinSubmitting}
                          />
                          <button
                            type="submit"
                            disabled={redCheckinSubmitting || !redCheckinText.trim()}
                            className="w-full min-h-[38px] rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2"
                          >
                            {redCheckinSubmitting ? "Submitting..." : "Submit Check-in"}
                          </button>
                        </form>

                        {/* Column 2: Counseling Services Info */}
                        <div className="rounded-xl border border-red-950/40 bg-red-950/10 p-3.5 flex flex-col justify-between space-y-2">
                          <div>
                            <p className="text-xs font-bold tracking-[0.15em] text-red-400 uppercase flex items-center gap-1.5 font-mono mb-1.5">
                              <Phone className="h-3.5 w-3.5 text-red-400" />
                              <span>Campus Counseling Services</span>
                            </p>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                              If you feel overwhelmed, please reach out to the campus support team. It is completely confidential and free for all students.
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5 text-xs text-zinc-500 font-medium pt-1 border-t border-red-950/20">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                              <span>Wellness Cell, Room 102, Admin Block</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                              <a href="tel:+911123456789" className="hover:text-primary transition-colors hover:underline flex items-center gap-0.5">
                                +91 11 2345 6789
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                              <a href="mailto:wellness@institute.edu" className="hover:text-primary transition-colors hover:underline flex items-center gap-0.5">
                                wellness@institute.edu
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Runway Hero */}
            <div id="card-runway-status" className="bg-surface rounded-2xl border border-border relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-bronze via-accent-amber to-accent-copper opacity-80" />
              <div className="p-6 md:p-8">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
                  <div>
                    <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Runway Status</p>
                    <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                      How long your money can last at the current pace.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    {runwayView && (
                      <Badge variant="outline" className={`${runwayStatusClass} font-semibold text-[10px] uppercase tracking-wider px-2.5 py-0.5`}>
                        {runwayStatusLabel}
                      </Badge>
                    )}
                    <Badge variant="outline" className="hidden">
                      {profile?.wing_label ?? "—"}
                    </Badge>
                    <button
                      onClick={() => nav({ to: "/companion" })}
                      title="Companion Status"
                      className="hidden"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${compStatus === "green" ? "bg-success" : compStatus === "amber" ? "bg-warning" : "bg-destructive"}`} />
                    </button>
                  </div>
                </div>

                {!runwayView ? (
                  <Skeleton className="mt-2 h-20 w-full max-w-xs" />
                ) : (
                  <>
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-stretch">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2.5">
                          <h2 className="text-[56px] sm:text-[70px] md:text-[80px] font-bold tracking-tighter text-foreground tnum leading-none" style={{ color: runwayColor }}>
                            <CountUp to={runwayView.days} />
                          </h2>
                          <span className="text-[16px] md:text-[20px] font-bold tracking-widest text-zinc-500 uppercase">Days</span>
                        </div>
                        <p className="mt-3 max-w-2xl text-[13px] md:text-sm text-zinc-400 font-medium leading-6 tracking-normal">
                          You can safely spend <span className="text-foreground font-bold">{rupees(runwayView.safeDailyPaise)}/day</span> until your allowance resets.
                        </p>
                        <p className="mt-2 text-[11px] md:text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                          Reset in {runwayView.daysLeft} days{runwayView.cycleEnd ? ` (${shortDate(runwayView.cycleEnd)})` : ""}
                        </p>
                        <p className="hidden">
                          Reset in {runwayView.daysLeft} days{runwayView.cycleEnd ? ` · ${shortDate(runwayView.cycleEnd)}` : ""}
                        </p>
                        <p className="hidden">
                          {runwayView.daysLeft} days until reset · {Math.round((runwayView.shortfallProbability ?? 0) * 100)}% shortfall risk
                        </p>
                      </div>

                      <div className="xl:border-l xl:border-border/70 xl:pl-6 flex flex-col justify-between gap-4">
                        <div>
                          <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.2em] text-primary">Next best action</p>
                          <h3 className="mt-2 text-sm sm:text-base font-semibold text-foreground">
                            {runwayView.nextAction?.title ?? "Keep your current pace"}
                          </h3>
                          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                            {runwayView.nextAction?.detail ?? "Your current runway can reach reset if today stays inside the safe daily limit."}
                          </p>
                        </div>
                        <div>
                          <Link to="/runway" className="inline-flex h-8 rounded-lg bg-primary text-primary-foreground px-3 items-center justify-center text-[10px] md:text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all">
                            Open Runway
                          </Link>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4 border-t border-border pt-5">
                      <div className="min-w-0">
                        <p className="text-[10px] md:text-xs text-zinc-500 font-semibold uppercase tracking-wider">Balance</p>
                        <p className="mt-1 text-[17px] md:text-[20px] font-semibold text-foreground tnum">{rupees(runwayView.remainingPaise)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] md:text-xs text-primary font-semibold uppercase tracking-wider">Safe/day</p>
                        <p className="mt-1 text-[17px] md:text-[20px] font-semibold text-foreground tnum">{rupees(runwayView.safeDailyPaise)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] md:text-xs text-zinc-500 font-semibold uppercase tracking-wider">Food pace</p>
                        <p className="mt-1 text-[17px] md:text-[20px] font-semibold text-foreground tnum">{rupees(runwayView.foodRoutine?.food_daily_pace ?? 0)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] md:text-xs text-zinc-500 font-semibold uppercase tracking-wider">Today</p>
                        <p className="mt-1 text-[17px] md:text-[20px] font-semibold text-foreground tnum">{rupees(runwayView.spentTodayPaise)}</p>
                      </div>
                    </div>

                    <div className="mt-5">
                      <Progress id="progress-runway" value={runwayView.pct} className="h-1 bg-surface-raised" />
                      <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground font-medium sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
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
                          {(calc?.unpaidPoolDebt ?? 0) > 0 && (
                            <span className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] md:text-xs font-semibold text-amber-500">
                              Pool dues included {rupees((calc?.unpaidPoolDebt ?? 0) * 100)}
                            </span>
                          )}
                        </div>
                        <span className="font-bold text-foreground">{runwayView.pct}% Spent</span>
                      </div>
                    </div>

                    {false && runwayView?.decision?.absorbed?.length ? (
                      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
                        {runwayView?.decision?.absorbed?.map((factor: any) => (
                          <div key={factor.kind} className="rounded-xl border border-border/70 bg-surface-raised/60 p-3 min-w-0">
                            <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-zinc-500 truncate">{factor.label}</p>
                            <p className="mt-1 text-sm font-black text-foreground tnum">
                              {rupees(factor.daily_amount ?? factor.amount)}
                              {factor.daily_amount ? <span className="text-[9px] md:text-xs text-zinc-500">/day</span> : null}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* Possible commitments runway warn banner */}
            {runwayView && runwayView.possibleCommitments && runwayView.possibleCommitments.length > 0 && (
              <Card
                id="card-possible-commitments-alert"
                className="border-amber-500/20 bg-amber-500/5 p-5 rounded-2xl relative overflow-hidden mt-4"
              >
                <div style={{ display: "flex", alignItems: "start", gap: "14px" }}>
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#f59e0b",
                      marginTop: "6px",
                      boxShadow: "0 0 8px #f59e0b",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Unconfirmed Commitments
                    </p>
                    <p className="text-[13px] text-zinc-400 mt-1.5 leading-relaxed">
                      <strong className="text-foreground">{rupees(runwayView.possibleCommitmentsTotal)}</strong> in possible recurring debits may hit before your allowance reset. These are currently excluded from your runway.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
                      {runwayView.possibleCommitments.map((sub: any) => (
                        <div
                          key={sub.id}
                          className="bg-surface-raised border border-border/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <PlatformIcon platform={sub.label} className="h-9 w-9 rounded-xl" />
                            <div>
                              <p className="text-xs font-semibold text-foreground">{sub.label}</p>
                              <p style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "2px" }}>
                                {rupees(sub.amount)} · expected {shortDate(new Date(sub.due_at))} ({Math.round(sub.confidence)}% confidence)
                              </p>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <Button
                              size="sm"
                              className="bg-amber-500 text-black hover:bg-amber-600 h-8 text-[11px] font-bold uppercase tracking-wider"
                              onClick={async () => {
                                try {
                                  await confirmSubscription({ data: { id: sub.id } });
                                  qc.invalidateQueries({ queryKey: ["runway-forecast"] });
                                  qc.invalidateQueries({ queryKey: ["all-subs"] });
                                  toast.success(`Tracked ${sub.label}!`);
                                } catch (err: any) {
                                  toast.error(err.message || "Failed to confirm");
                                }
                              }}
                            >
                              Track commitment
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border text-muted-foreground hover:text-foreground h-8 text-[11px] font-bold uppercase tracking-wider"
                              onClick={async () => {
                                try {
                                  await ignoreSubscription({ data: { id: sub.id } });
                                  qc.invalidateQueries({ queryKey: ["runway-forecast"] });
                                  qc.invalidateQueries({ queryKey: ["all-subs"] });
                                  toast(`Ignored ${sub.label}.`);
                                } catch (err: any) {
                                  toast.error(err.message || "Failed to ignore");
                                }
                              }}
                            >
                              Not recurring
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {runwayView && <MealRunwayCheck calc={calc} runwayView={runwayView} />}

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
                        <span className="text-[10px] md:text-xs text-zinc-600 font-bold">{d}</span>
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

            {/* ── Food & Wellness Strip ───────────────────────────────── */}
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Food & Wellness</p>
                    <button
                      onClick={() => { setShowFoodSheet(true); setFoodTab("menus"); }}
                      className="text-xs font-bold text-primary hover:underline uppercase tracking-wider cursor-pointer bg-primary/10 px-2.5 py-0.5 rounded border border-primary/20"
                    >
                      Campus Food Guard
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                    Meal gaps, delivery, groceries, and subscriptions feed directly into runway.
                  </p>
                </div>
                {runwayView?.foodRoutine?.label && (
                  <Badge variant="outline" className="w-fit border-border bg-surface-raised text-[10px] md:text-xs uppercase tracking-wider font-black">
                    {runwayView.foodRoutine.label}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Food gap */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider font-bold">Last meal</p>
                  {insights ? (
                    <p className={`text-[16px] font-black tnum ${insights.food.gap_hours > 12 ? "text-destructive" : insights.food.gap_hours > 6 ? "text-warning" : "text-success"}`}>
                      {insights.food.gap_hours > 0 ? `${Math.round(insights.food.gap_hours)}h ago` : "—"}
                    </p>
                  ) : (
                    <p className="text-[16px] font-black text-zinc-400">{foodGapHours > 0 ? `${Math.round(foodGapHours)}h ago` : "—"}</p>
                  )}
                  <p className="text-xs text-zinc-500">food gap</p>
                </div>

                {/* Delivery vs mess */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider font-bold">Delivery</p>
                  <p className="text-[16px] font-black text-foreground">
                    {runwayView?.foodRoutine?.delivery?.count ?? insights?.food?.delivery_count_30d ?? "—"}×
                  </p>
                  <p className="text-xs text-zinc-500">
                    {runwayView?.foodRoutine ? `${rupees(runwayView.foodRoutine.food_daily_pace ?? 0)}/day food pace` : `vs ${insights?.food?.mess_count_30d ?? "—"} mess visits`}
                  </p>
                </div>

                {/* Late night */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider font-bold">Late Night</p>
                  <p className="text-[16px] font-black text-foreground tnum">
                    {insights ? rupees(insights.late_night.total_paise) : "—"}
                  </p>
                  <p className="text-xs text-zinc-500">{insights?.late_night?.txn_count ?? 0} txns after 11PM</p>
                </div>

                {/* Sub bleed */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider font-bold">Sub Bleed</p>
                  <p className="text-[16px] font-black text-foreground tnum">
                    {insights ? rupees(insights.subscriptions.monthly_bleed_paise) : "—"}
                  </p>
                  <p className="text-xs text-zinc-500">/month in {insights?.subscriptions?.count ?? 0} subs</p>
                </div>
              </div>

              {/* Mess vs delivery bar */}
              {insights?.food && (insights.food.delivery_count_30d + insights.food.mess_count_30d) > 0 && (
                <div className="mt-5 pt-4 border-t border-border">
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-2">Routine meal vs delivery ratio (30d)</p>
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
                    <span className="text-[10px] md:text-xs text-success font-bold">Mess {insights.food.mess_count_30d}</span>
                    <span className="text-[10px] md:text-xs text-warning font-bold">Delivery {insights.food.delivery_count_30d}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Active Pools */}
            <section id="section-active-pools" className="space-y-4 pt-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold tracking-[0.25em] text-zinc-500 uppercase">Active Pools</h3>
                <Link
                  to="/pool"
                  id="btn-new-pool-dash"
                  className="text-[10px] md:text-xs font-bold text-foreground bg-surface-raised border border-border hover:bg-surface-interactive transition-all px-3.5 py-1.5 rounded-full uppercase tracking-wider cursor-pointer"
                >
                  + New Pool
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(() => {
                  const activeDashboardPools = (pools ?? []).filter(
                    (p) => (p.status === "open" && new Date(p.expires_at).getTime() > Date.now()) ||
                           (p.status === "completed" && !isPoolFullyPaid(p))
                  );

                  if (activeDashboardPools.length === 0) {
                    return (
                      <div className="col-span-full py-10 text-center border border-dashed border-border rounded-2xl bg-surface-raised/40">
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">No active pools in your wing.</p>
                        <p className="text-xs text-zinc-500 mt-1">Start one now to split delivery fees with your wing.</p>
                      </div>
                    );
                  }

                  return activeDashboardPools.map((p) => {
                    const total = p.status === "completed"
                      ? (p.items ?? []).filter((it: any) => it.is_purchased).reduce((s: number, i: any) => s + i.estimated_price, 0)
                      : (p.items ?? []).reduce((s: number, i: any) => s + i.estimated_price, 0);
                    const minsLeft = Math.max(0, Math.round((new Date(p.expires_at).getTime() - Date.now()) / 60000));
                    const perPerson = (p.items ?? []).length
                      ? Math.round(p.delivery_fee / new Set((p.items ?? []).map((i: any) => i.added_by_name)).size)
                      : 0;

                    const rSummary = p.status === "completed" ? (() => {
                      const breakdown = p.split_breakdown ?? {};
                      let unpaidCount = 0;
                      let unpaidTotal = 0;
                      let myOwed = 0;
                      let myStatus = "";
                      Object.entries(breakdown).forEach(([rName, details]: [string, any]) => {
                        const isHost = rName.toLowerCase() === "you" || rName.toLowerCase() === (p.created_by_name ?? "").toLowerCase();
                        if (isHost) return;
                        if (!details.paid) {
                          unpaidCount += 1;
                          unpaidTotal += details.total;
                        }
                        const isMe = user && (rName.toLowerCase() === user.fullName.trim().toLowerCase());
                        if (isMe) {
                          myOwed = details.total;
                          myStatus = details.payment_status;
                        }
                      });
                      return { unpaidCount, unpaidTotal, myOwed, myStatus };
                    })() : null;

                    return (
                      <Link key={p.id} to="/pool/$id" params={{ id: p.id }} className="group">
                        <Card className="bg-surface relative overflow-hidden border border-border p-5 transition-all duration-300 hover:border-white/15 hover:bg-surface-raised h-full flex flex-col justify-between hover:shadow-lg hover:shadow-black/40">
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <PlatformIcon platform={p.platform} name={p.platform_display_label || p.platform.replace("_", " ")} className="h-5 w-5" />
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                  <span className="text-xs font-black uppercase tracking-wider text-foreground truncate max-w-[120px] sm:max-w-none">{p.platform_display_label || p.platform.replace("_", " ")}</span>
                                  <Badge variant="outline" className="hidden">{p.wing_label}</Badge>
                                </div>
                              </div>
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border border-border bg-background tnum shrink-0 ${minsLeft < 5 && p.status === "open" ? "text-destructive animate-pulse border-destructive/20 bg-destructive/5" : "text-foreground"}`}>
                                {p.status === "open" ? `${minsLeft}m left` : "Splits Active"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Host: <span className="font-semibold text-foreground capitalize">{p.created_by_name || "—"}</span></p>

                            {rSummary && (
                              <div className="mt-3">
                                {user && p.host_id === user.id ? (
                                  rSummary.unpaidTotal > 0 ? (
                                    <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl text-[10px] text-amber-500 font-bold">
                                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                                      <span>Collect: <strong className="text-foreground">{rupees(rSummary.unpaidTotal)}</strong> pending ({rSummary.unpaidCount})</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 rounded-xl text-[10px] text-green-500 font-bold">
                                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                                      <span>All splits collected & verified!</span>
                                    </div>
                                  )
                                ) : (
                                  rSummary.myOwed > 0 && (
                                    rSummary.myStatus === "verified" ? (
                                      <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 rounded-xl text-[10px] text-green-500 font-bold">
                                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                                        <span>Paid: <strong className="text-foreground">{rupees(rSummary.myOwed)}</strong></span>
                                      </div>
                                    ) : rSummary.myStatus === "pending" ? (
                                      <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5 rounded-xl text-[10px] text-blue-500 font-bold animate-pulse">
                                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                                        <span>Verifying split of <strong className="text-foreground">{rupees(rSummary.myOwed)}</strong></span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 rounded-xl text-[10px] text-rose-500 font-bold">
                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                                        <span>Owe: <strong className="text-foreground">{rupees(rSummary.myOwed)}</strong></span>
                                      </div>
                                    )
                                  )
                                )}
                              </div>
                            )}
                          </div>
                          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-[10px] md:text-xs text-zinc-500 font-bold uppercase tracking-wider">Cart</span>
                              <span className="text-xs font-black text-foreground">
                                {rupees(total)}
                                {p.status === "open" && (
                                  <span className="text-zinc-500 font-normal text-[10px] md:text-xs"> / {rupees(p.min_cart_value)} min</span>
                                )}
                              </span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-[10px] md:text-xs text-zinc-500 font-bold uppercase tracking-wider">
                                {p.status === "completed" ? "Your Split" : "Split Est."}
                              </span>
                              <span className="text-xs font-black text-success">
                                {p.status === "completed" && rSummary
                                  ? rupees(rSummary.myOwed || (total / (Object.keys(p.split_breakdown ?? {}).length || 1)))
                                  : rupees(perPerson)}
                                <span className="text-zinc-500 font-normal text-[10px] md:text-xs">
                                  {p.status === "completed" ? "" : " / person"}
                                </span>
                              </span>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    );
                  });
                })()}
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
                  <span className="text-[10px] md:text-xs font-black px-2 py-0.5 rounded-full border text-emerald-500 border-emerald-500/20 bg-emerald-500/5">
                    NETTED ACTIVE
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Nishant owes others (you_owe) */}
                  {nettedBalances.balances?.you_owe?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] md:text-xs font-bold text-zinc-400 uppercase tracking-wider">You Owe</p>
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
                      <p className="text-[11px] md:text-xs font-bold text-zinc-400 uppercase tracking-wider">Owes You</p>
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
                      <p className="text-[11px] md:text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
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
                  <span className="text-[11px] md:text-xs font-black px-2.5 py-1 rounded-full border text-primary border-primary/30 bg-primary/5 flex items-center gap-1">
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
                  <span className="ml-auto text-[10px] md:text-xs font-black text-primary uppercase tracking-wider border border-primary/30 px-1.5 py-0.5 rounded-full">Bedrock</span>
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
                    <p className="text-[10px] md:text-xs text-zinc-600 uppercase tracking-wider">This Week</p>
                    <p className="text-xs font-black text-foreground tnum">{rupees((campusIntel.spend_7d ?? 0) * 100)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] md:text-xs text-zinc-600 uppercase tracking-wider">Last Meal</p>
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
                <Badge variant="outline" className="bg-success/5 border-success/20 text-success font-bold text-[10px] md:text-xs font-mono">
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
                <span className="flex items-center gap-1.5 text-[10px] md:text-xs text-zinc-600 font-bold">
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
                        <p className="text-[10px] md:text-xs text-zinc-600 mt-0.5 font-bold">
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
                  <span className="text-xs font-black text-red-400 uppercase tracking-widest">Exam Mode Active</span>
                  <span className="text-xs text-red-400 font-bold">· {insights.exam.days_left}d left</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Stress and skipped meals are correlated. PocketBuddy is watching your food gap — check in if you skip a meal.
                </p>
                <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full" style={{ width: `${Math.min(100, (insights.exam.days_left / 14) * 100)}%` }} />
                </div>
              </div>
            )}

            {/* Alert Widget */}
            {runwayView && (runwayView.days < 7 || runwayView.safeDailyPaise < 15_000) && (
              <Card id="card-runway-alert" className="border-destructive/30 bg-destructive/5 p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[3px] h-full bg-destructive" />
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                  <p className="text-xs font-bold text-destructive tracking-widest uppercase">Runway Action</p>
                </div>
                <p className="text-xs font-medium text-foreground leading-relaxed">
                  Safe limit is <span className="text-destructive font-bold">{rupees(runwayView.safeDailyPaise)}</span>. {runwayView.decision?.next_best_action?.detail ?? runwayView.foodRoutine?.action?.detail ?? "Reduce today's flexible spend to protect the allowance cycle."}
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
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-3.5 bg-destructive rounded-full" />
                  <h3 className="text-xs font-bold tracking-[0.25em] text-zinc-500 uppercase">Budget Collisions</h3>
                </div>
                <Card className="bg-surface border-border p-4 space-y-4">
                  {collisions.length > 1 && (
                    <div className="relative overflow-hidden bg-destructive/5 border border-destructive/15 rounded-xl p-4 text-xs shadow-sm">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-destructive/10 rounded-full blur-xl pointer-events-none" />
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-bold tracking-wider text-xs text-destructive uppercase">Cumulative Debit Impact</p>
                          <p className="font-medium text-zinc-400 leading-relaxed">
                            If all {collisions.length} debits hit this week, your safe limit drops to <strong className="text-foreground">{rupees(cumulativeCollisionLimit * 100)}</strong>/day.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="divide-y divide-border/60">
                    {collisions.map((c, idx) => {
                      const isNetflix = (c.service_name ?? c.name).toLowerCase().includes("netflix");
                      const isSpotify = (c.service_name ?? c.name).toLowerCase().includes("spotify");
                      const isYoutube = (c.service_name ?? c.name).toLowerCase().includes("youtube");

                      const brandColorClass = isNetflix
                        ? "text-red-500 bg-red-500/10 border-red-500/20"
                        : isSpotify
                        ? "text-green-500 bg-green-500/10 border-green-500/20"
                        : isYoutube
                        ? "text-red-500 bg-red-500/10 border-red-500/20"
                        : "text-primary bg-primary/10 border-primary/20";

                      return (
                        <div
                          key={c.id}
                          className="py-3 first:pt-0 last:pb-0 relative overflow-hidden flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${brandColorClass}`}>
                                {c.service_name ?? c.name}
                              </span>
                              {c.detected_from === "auto_detected" && (
                                <Badge className="bg-zinc-800 text-zinc-400 border border-zinc-700/60 text-[9px] font-bold px-1.5 py-0 uppercase tracking-widest font-mono">
                                  Auto
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs font-black text-destructive tnum flex items-center gap-0.5">
                              <span>−</span>
                              <span>{rupees(c.amount)}</span>
                            </p>
                          </div>

                          <div className="flex items-center justify-between text-xs text-zinc-500">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{shortDate(new Date(c.next_debit_date))}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span>Limit:</span>
                              <span className="text-foreground font-black tnum">{rupees(c.newLimit * 100)}</span>
                              {c.critical && (
                                <span className="ml-1.5 text-red-500 bg-red-500/10 border border-red-500/20 text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-full uppercase animate-pulse">
                                  Critical
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
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
                  <div className="p-4"><Skeleton className="h-32 w-full border-none" /></div>
                ) : recent.length === 0 ? (
                  <p className="py-8 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">No transactions logged</p>
                ) : (
                  <div className="divide-y divide-border">
                    {recent.map((t, i) => {
                      const trustLabel = transactionTrustLabel(t);
                      return (
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
                              <span className="text-[10px] md:text-xs font-black tracking-widest text-zinc-500 uppercase">{t.category}</span>
                            )}
                            {trustLabel && (
                              <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-wider border px-1.5 py-0.5 rounded ${transactionTrustClass(trustLabel)}`}>
                                {trustLabel}
                              </span>
                            )}
                            {!t.is_mapped && (
                              <button
                                id={`btn-identify-${t.id}`}
                                onClick={() => setIdentifying(t)}
                                className="ml-1 rounded-full px-3 py-1 text-[11px] md:text-xs font-bold bg-white/5 border border-border hover:bg-white/10 hover:border-white/15 transition-all cursor-pointer uppercase text-foreground"
                              >
                                Identify?
                              </button>
                            )}
                            <button
                              id={`btn-edit-ledger-${t.id}`}
                              onClick={() => setEditingTxn(t)}
                              className="ml-1 rounded-full px-3 py-1 text-[11px] md:text-xs font-bold bg-white/5 border border-border hover:bg-white/10 hover:border-white/15 transition-all cursor-pointer uppercase text-foreground"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-black text-foreground tnum">{rupees(t.amount)}</p>
                          <p className="text-[10px] md:text-xs text-zinc-500 font-semibold mt-0.5">{relativeTime(t.created_at)}</p>
                        </div>
                      </div>
                      );
                    })}
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
                  Eat Now
                </button>
                <button
                  onClick={() => setFoodTab("add")}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all ${
                    foodTab === "add"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Add Menu
                </button>
                <button
                  onClick={() => setFoodTab("signals")}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all ${
                    foodTab === "signals"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Signals
                </button>
                <button
                  onClick={() => setFoodTab("verify")}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all ${
                    foodTab === "verify"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Verify Menu
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
                  <div key={venue} className="space-y-2 pt-2">
                    {(() => {
                      const firstItem = items[0];
                      const open = firstItem ? isTimeInRange(new Date(), firstItem.available_from, firstItem.available_until) : false;
                      return (
                        <div className="flex items-center justify-between pl-0.5 mb-1.5">
                          <h4 className="text-xs md:text-sm font-bold uppercase tracking-wider text-zinc-400">{venue}</h4>
                          {firstItem && (
                            <div className="flex items-center gap-1.5 text-xs md:text-sm">
                              <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-success animate-pulse" : "bg-zinc-600"}`} />
                              <span className={open ? "text-success font-semibold" : "text-zinc-500 font-semibold"}>
                                {open ? "Open now" : `Closed (Opens ${fmtTime(firstItem.available_from)} - ${fmtTime(firstItem.available_until)})`}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="space-y-2">
                      {items.map((it) => {
                        const trustLabel = getTrustBadgeLabel(it);
                        const isSafeBudget = it.price <= (insights?.safe_daily_limit_paise || (runwayView?.safeDailyPaise ?? 23800));
                        const freshnessState = String(it.price_freshness_state || "");
                        const showFreshness =
                          freshnessState === "needs_price_check" ||
                          freshnessState === "under_review" ||
                          freshnessState === "price_spike_review" ||
                          freshnessState === "recent";
                        const routineState = String(it.routine_fit?.state || "");
                        const showRoutineFit = routineState && routineState !== "flexible";
                        const mealGapCopy =
                          it.meal_gap_context?.state === "meal_gap_checkin"
                            ? "Meal gap: check in"
                            : insights?.food?.gap_hours >= 12
                              ? `Meal gap: ${Math.round(insights.food.gap_hours)}h`
                              : `Last meal ${Math.round(insights?.food?.gap_hours ?? 0)}h ago`;
                        const mealGapTitle =
                          it.meal_gap_context?.message ||
                          (insights?.food?.gap_hours >= 12
                            ? "Check in the meal source before using today's food budget again."
                            : "Recent food timing context");
                        return (
                          <div key={it.id} className="flex flex-col gap-2 rounded-xl bg-surface border border-border p-3">
                            <div className="flex items-start justify-between w-full">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-bold text-foreground">{it.item_name}</p>
                                  {trustLabel && (
                                    <Badge variant="outline" className={`text-xs uppercase tracking-wider px-2 py-0.5 ${getTrustBadgeClass(trustLabel)}`}>
                                      {trustLabel}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <span className="tnum text-sm md:text-base font-black text-primary font-mono shrink-0">{rupees(it.price)}</span>
                            </div>

                            <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-border/30">
                              <span className="text-xs px-2 py-0.5 rounded bg-surface-raised text-zinc-400 font-semibold flex items-center gap-1">
                                <span className={`h-1.5 w-1.5 rounded-full ${isSafeBudget ? "bg-success" : "bg-destructive"}`} />
                                {isSafeBudget ? "Within today's food budget" : "Over daily safe budget"}
                              </span>
                              {it.source_type === "student_confirmed" && (
                                <span className="text-xs px-2 py-0.5 rounded bg-surface-raised text-zinc-400 font-semibold flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                                  Student confirmed
                                </span>
                              )}
                              {showFreshness && (
                                <span
                                  className={`text-xs px-2 py-0.5 rounded bg-surface-raised font-semibold flex items-center gap-1 ${getPriceFreshnessClass(freshnessState)}`}
                                  title={it.price_freshness_reason || "Price freshness signal"}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${freshnessState === "needs_price_check" ? "bg-warning" : "bg-zinc-500"}`} />
                                  {it.price_freshness_badge || "Price checked"}
                                </span>
                              )}
                              {showRoutineFit && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded bg-surface-raised text-zinc-400 font-semibold flex items-center gap-1"
                                  title={it.routine_fit?.message}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                  {routineState === "mess_first" ? "Mess-first routine" : "Routine fit"}
                                </span>
                              )}
                              {insights?.food?.gap_hours > 0 && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded bg-surface-raised text-zinc-400 font-semibold flex items-center gap-1"
                                  title={mealGapTitle}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                                  {mealGapCopy}
                                </span>
                              )}
                            </div>

                            {editingFoodId === it.id ? (
                              <div className="grid gap-2 rounded-lg border border-border bg-surface-raised p-2 md:grid-cols-[1fr_120px_auto]">
                                <Input
                                  value={editingFoodName}
                                  onChange={(e) => setEditingFoodName(e.target.value)}
                                  placeholder="Item name"
                                  className="h-8 text-xs"
                                />
                                <Input
                                  value={editingFoodPrice}
                                  onChange={(e) => setEditingFoodPrice(e.target.value)}
                                  placeholder="Price"
                                  inputMode="decimal"
                                  className="h-8 text-xs"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={editFoodMutation.isPending}
                                    onClick={() => submitFoodEdit(it)}
                                    className="h-8 px-3 text-xs"
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingFoodId(null)}
                                    className="h-8 px-3 text-xs"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startFoodEdit(it)}
                                className="self-start text-xs font-bold uppercase tracking-wider text-primary hover:text-primary/80"
                              >
                                Suggest edit
                              </button>
                            )}
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

            {foodTab === "add" && (
              <div className="space-y-5 py-4 animate-[fadeIn_0.2s_ease-out]">
                <form onSubmit={handleManualFoodSubmit} className="space-y-3 rounded-xl border border-border bg-surface p-3">
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Add one menu item</h4>
                    <p className="text-xs text-zinc-400">
                      New items stay in campus review before they affect recommendations.
                    </p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_120px]">
                    <Input
                      value={manualVenue}
                      onChange={(e) => setManualVenue(e.target.value)}
                      placeholder="Venue, e.g. BH-2 Night Canteen"
                      className="bg-surface-raised border-border text-xs font-semibold"
                    />
                    <Input
                      value={manualItemName}
                      onChange={(e) => setManualItemName(e.target.value)}
                      placeholder="Item, e.g. Ginger Tea"
                      className="bg-surface-raised border-border text-xs font-semibold"
                    />
                    <Input
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      placeholder="Price"
                      inputMode="decimal"
                      className="bg-surface-raised border-border text-xs font-semibold"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={createFoodMutation.isPending}
                    className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-black uppercase text-xs h-9 tracking-wider"
                  >
                    Save for verification
                  </Button>
                </form>

                <form onSubmit={handleScanSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-3">
                  <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Bulk add from menu photo</h4>
                    <p className="text-xs text-zinc-400">
                      OCR candidates also go to review; they are not used as trusted recommendations immediately.
                    </p>
                  </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Canteen / Venue Name</label>
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
                  <label className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Menu Image (Max 5MB)</label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border border-dashed border-border rounded-xl cursor-pointer bg-surface hover:bg-surface-raised transition-all">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <ShoppingBag className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-xs text-zinc-300 font-semibold">
                          {scanFile ? scanFile.name : "Select or Drop Menu Photo"}
                        </p>
                        <p className="text-[10px] md:text-xs text-zinc-500 mt-1">PNG, JPG or JPEG up to 5MB</p>
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
                  {scanBusy ? "Reading menu photo..." : "Scan menu for review"}
                </Button>
                </form>
              </div>
            )}

            {foodTab === "signals" && (
              <div className="space-y-4 py-4 animate-[fadeIn_0.2s_ease-out]">
                <div className="rounded-xl border border-border bg-surface-raised p-3.5 text-xs text-zinc-300">
                  <p className="font-semibold text-foreground">Food Signals turn repeated payments into better campus menus.</p>
                  <p className="mt-1 text-zinc-400">
                    These are not random prompts. PocketBuddy asks only when a payment pattern has enough independent evidence or a trusted menu needs confirmation.
                  </p>
                </div>

                {!foodSignals ? (
                  <div className="space-y-2">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                  </div>
                ) : foodSignals.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface p-6 text-center">
                    <p className="text-sm font-semibold text-foreground">No food signals need input right now.</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      New signals appear when PocketBuddy sees repeated campus food payments or menu price changes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {foodSignals.map((signal: any) => (
                      <div key={signal.id} className="rounded-xl border border-border bg-surface p-3.5 text-xs">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-primary">{signal.title || "Food Signal"}</p>
                            <p className="text-sm font-bold text-foreground">{signal.question}</p>
                            {signal.detail && <p className="text-xs text-zinc-400">{signal.detail}</p>}
                            {signal.privacy_note && <p className="text-[11px] text-zinc-500">{signal.privacy_note}</p>}
                          </div>
                          {signal.price ? (
                            <span className="tnum shrink-0 rounded-lg bg-surface-raised px-2 py-1 font-mono text-xs font-black text-primary">
                              {rupees(signal.price)}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {(signal.options || []).map((option: string) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => submitFoodSignal(signal, option)}
                              disabled={foodSignalMutation.isPending}
                              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-bold text-foreground hover:border-primary/50 hover:text-primary disabled:opacity-50"
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {foodTab === "verify" && (
              <div className="space-y-4 py-4 animate-[fadeIn_0.2s_ease-out] max-h-[50vh] overflow-y-auto">
                <div className="bg-surface-raised border border-border p-3.5 rounded-xl text-xs text-zinc-300 leading-relaxed font-normal space-y-1.5">
                  <p>Menu candidates are not used in recommendations until enough independent students confirm them.</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 border-t border-border/30 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      <strong className="text-success font-semibold">Confirm:</strong> I saw this item on campus
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                      <strong className="text-destructive font-semibold">Dispute:</strong> This looks wrong
                    </span>
                  </div>
                </div>

                {!pendingFoods ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14" />
                    <Skeleton className="h-14" />
                  </div>
                ) : reviewFoods.length === 0 ? (
                  <div className="py-10 text-center space-y-3">
                    <p className="text-sm text-zinc-300 font-semibold">No menu items need review right now.</p>
                    <p className="text-xs text-zinc-400 max-w-sm mx-auto font-normal">
                      Add a menu item or scan a canteen menu to help PocketBuddy build trusted campus food options.
                    </p>
                    <Button
                      id="btn-switch-to-scan"
                      onClick={() => setFoodTab("add")}
                      className="bg-primary hover:bg-primary/95 text-primary-foreground font-black uppercase text-xs h-8 px-4 tracking-wider cursor-pointer"
                    >
                      Add Menu
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Needs confirmation section */}
                    {pendingItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 pl-0.5">Needs confirmation</h4>
                        <div className="space-y-2">
                          {pendingItems.map((it: any) => (
                            <div key={it.id} className="bg-surface border border-border p-3.5 rounded-xl text-xs">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-3">
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs md:text-sm font-bold text-foreground truncate">{it.item_name}</p>
                                    {getTrustBadgeLabel(it, true) && (
                                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 ${
                                        getTrustBadgeClass(getTrustBadgeLabel(it, true))
                                      }`}>
                                        {getTrustBadgeLabel(it, true)}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                                    {it.venue_name} · {rupees(it.price)}
                                  </p>
                                  <p className="text-xs font-bold text-primary">
                                    {(it.verification_threshold ?? 5) - (it.confirmation_count ?? Math.max(0, it.verification_votes ?? 0)) > 0
                                      ? `Needs ${Math.max(0, (it.verification_threshold ?? 5) - (it.confirmation_count ?? Math.max(0, it.verification_votes ?? 0)))} more confirmations`
                                      : "Pending final approval"}
                                    <span className="text-zinc-500 font-normal"> · {getFoodReviewSourceLabel(it)}</span>
                                  </p>
                                </div>

                                <div className="flex gap-2 w-full sm:w-auto sm:shrink-0 pt-2 sm:pt-0 border-t border-border/20 sm:border-0">
                                  <button
                                    onClick={() => handleVerifyVote(it.id, "up")}
                                    disabled={verifyMutation.isPending}
                                    className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-success/10 hover:bg-success/20 border border-success/20 text-success font-bold text-xs uppercase cursor-pointer text-center"
                                    title="I saw this item and price on campus"
                                  >
                                    ✓ Confirm
                                  </button>
                                  <button
                                    onClick={() => handleVerifyVote(it.id, "down")}
                                    disabled={verifyMutation.isPending}
                                    className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-destructive font-bold text-xs uppercase cursor-pointer text-center"
                                    title="This item or price looks wrong"
                                  >
                                    ✕ Dispute
                                  </button>
                                  {canRemoveFoodCandidate(it) && (
                                    <button
                                      onClick={() => deleteFoodMutation.mutate({ id: it.id })}
                                      disabled={deleteFoodMutation.isPending}
                                      className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-zinc-300 font-bold text-xs uppercase cursor-pointer text-center"
                                      title="Remove this pending submission"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Needs review / Disputed section */}
                    {disputedItems.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-destructive pl-0.5">Needs review</h4>
                        <div className="space-y-2">
                          {disputedItems.map((it: any) => (
                            <div key={it.id} className="bg-surface border border-border p-3.5 rounded-xl text-xs">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-3">
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-xs md:text-sm font-bold text-foreground truncate">{it.item_name}</p>
                                    {getTrustBadgeLabel(it, true) && (
                                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 ${
                                        getTrustBadgeClass(getTrustBadgeLabel(it, true))
                                      }`}>
                                        {getTrustBadgeLabel(it, true)}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                                    {it.venue_name} · {rupees(it.price)}
                                  </p>
                                  <p className="text-xs font-bold text-primary">
                                    <span className="text-destructive">
                                      {it.dispute_count} student{it.dispute_count === 1 ? "" : "s"} disputed this
                                    </span>
                                    <span className="text-zinc-500 font-normal"> · {getFoodReviewSourceLabel(it)}</span>
                                  </p>
                                </div>

                                <div className="flex gap-2 w-full sm:w-auto sm:shrink-0 pt-2 sm:pt-0 border-t border-border/20 sm:border-0">
                                  <button
                                    onClick={() => handleVerifyVote(it.id, "up")}
                                    disabled={verifyMutation.isPending}
                                    className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-success/10 hover:bg-success/20 border border-success/20 text-success font-bold text-xs uppercase cursor-pointer text-center"
                                    title="I saw this item and price on campus"
                                  >
                                    ✓ Confirm
                                  </button>
                                  <button
                                    onClick={() => handleVerifyVote(it.id, "down")}
                                    disabled={verifyMutation.isPending}
                                    className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-destructive font-bold text-xs uppercase cursor-pointer text-center"
                                    title="This item or price looks wrong"
                                  >
                                    ✕ Dispute
                                  </button>
                                  {canRemoveFoodCandidate(it) && (
                                    <button
                                      onClick={() => deleteFoodMutation.mutate({ id: it.id })}
                                      disabled={deleteFoodMutation.isPending}
                                      className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-zinc-300 font-bold text-xs uppercase cursor-pointer text-center"
                                      title="Remove this pending submission"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
        </ResponsiveFoodPanel>

        {/* Check-in dialog */}
        <Dialog open={showCheckIn} onOpenChange={setShowCheckIn}>
          <DialogContent id="dialog-checkin" className="max-w-md bg-surface border border-border p-5 rounded-2xl">
            <DialogHeader className="space-y-1">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">Runway Health Alert</span>
              </div>
              <DialogTitle className="text-sm md:text-base font-bold text-foreground">
                Hey, it's been a while since your last meal.
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                No food transactions logged for the last <strong className="text-foreground">{Math.round(foodGapHours)} hours</strong>. Skipped meals or unlogged cash transactions skew your daily runway forecast.
              </p>

              <div className="space-y-2 mt-3">
                <button
                  id="btn-checkin-ate"
                  onClick={handleCheckInAte}
                  className="w-full flex items-center justify-between rounded-xl border border-success/20 bg-success/5 hover:bg-success/10 p-3.5 text-left text-xs font-semibold text-success transition-all cursor-pointer"
                >
                  <span>I ate at mess / cooked / home meal</span>
                  <span className="text-[10px] opacity-75 font-normal tracking-wide">Log Mess visit</span>
                </button>

                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5">
                  <button
                    id="btn-checkin-skipped"
                    onClick={() => setCheckInExpanded(true)}
                    className="w-full flex items-center justify-between text-left text-xs font-semibold text-destructive cursor-pointer"
                  >
                    <span>I skipped a meal / couldn't eat</span>
                    <span className="text-[10px] opacity-75 font-normal">Check in</span>
                  </button>
                  {checkInExpanded && (
                    <div className="mt-3 space-y-2.5 animate-[fadeIn_0.15s_ease-out]">
                      <p className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">What happened?</p>
                      <Input
                        id="input-checkin-note"
                        value={stressNote}
                        onChange={(e) => setStressNote(e.target.value)}
                        placeholder="e.g. studying for exams, mess was closed, etc."
                        className="bg-surface border-border text-xs h-9 text-foreground font-semibold"
                      />
                      <Button
                        id="btn-submit-checkin-skipped"
                        className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-black uppercase tracking-wider h-9"
                        onClick={handleCheckInSkipped}
                      >
                        Submit Health Check
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setShowCheckIn(false); setShowFoodSheet(true); setFoodTab("menus"); }}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground font-black uppercase text-xs h-9 tracking-wider hover:bg-primary/95 transition-all cursor-pointer text-center"
                >
                  Campus Eat Now
                </button>
                <button
                  onClick={() => setShowCheckIn(false)}
                  className="flex-1 rounded-xl bg-surface-raised border border-border text-zinc-400 font-bold uppercase text-xs h-9 tracking-wider hover:text-zinc-200 transition-all cursor-pointer text-center"
                >
                  Not now
                </button>
              </div>
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
          <p className="text-[10px] md:text-xs text-zinc-500 pl-1">This category will be saved for future use.</p>
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
          <p className="text-[10px] md:text-xs text-zinc-500 pl-1">This category will be saved for future use.</p>
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
            <p className="text-[10px] md:text-xs text-zinc-500 pl-1">This category will be saved for future use.</p>
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
