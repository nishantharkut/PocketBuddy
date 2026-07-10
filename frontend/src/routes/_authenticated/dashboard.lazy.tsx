import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { PlatformIcon } from "@/components/PlatformIcon";
import { DashboardNotifications, type DashboardNotificationItem } from "@/components/DashboardNotifications";
import {
  Plus, ChevronRight, AlertTriangle, Users, Utensils, ShoppingBag,
  Bus, Receipt, MoreHorizontal, Wallet, Timer, MapPin, Compass, TrendingDown, Calendar, ShieldCheck,
  ChevronDown, ChevronUp, BellOff, Clock3
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

const CHECKIN_REMIND_LATER_MS = 4 * 60 * 60 * 1000;

function readDashboardArrivalCount(storageKey: string) {
  try {
    const value = Number(localStorage.getItem(storageKey) ?? "0");
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  } catch {
    return 0;
  }
}

function writeDashboardArrivalCount(storageKey: string, value: number) {
  try {
    localStorage.setItem(storageKey, String(value));
  } catch {
    // Ignore private browsing/storage failures. The dashboard still works.
  }
}

function cleanInsightText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeInsightText(value: unknown) {
  return cleanInsightText(value)
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "")
    .toLowerCase();
}

function sameInsightText(a: unknown, b: unknown) {
  const left = normalizeInsightText(a);
  const right = normalizeInsightText(b);
  return Boolean(left && right && left === right);
}

function splitInsightSentences(value: unknown) {
  const text = cleanInsightText(value).replace(/\s+/g, " ");
  if (!text) return [];
  return text.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [text];
}

function isRepeatedInsight(candidate: string, existing: string[]) {
  if (!candidate) return true;
  return existing.some((entry) => {
    if (!entry) return false;
    if (entry === candidate) return true;
    if (candidate.length < 24 || entry.length < 24) return false;
    return entry.includes(candidate) || candidate.includes(entry);
  });
}

function uniqueInsightText(value: unknown, existing: unknown[] = []) {
  const seen = existing.map(normalizeInsightText).filter(Boolean);
  const unique: string[] = [];

  splitInsightSentences(value).forEach((sentence) => {
    const normalized = normalizeInsightText(sentence);
    if (isRepeatedInsight(normalized, seen)) return;
    seen.push(normalized);
    unique.push(sentence);
  });

  return unique.join(" ").trim();
}

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

function isAttentionSignal(value?: string) {
  return value === "attention" || value === "stressed";
}

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
  food: "#0F766E",
  stationery: "#7C3AED",
  travel: "#2563EB",
  subscription: "#A16207",
  other: "#64748B",
};

const CHECKIN_NOTE_PRESETS = [
  "Exam stretch",
  "Mess closed",
  "Travel day",
  "Cash issue",
] as const;

function isFiniteHours(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatMealGapHours(
  hours: number | null | undefined,
  options: {
    missingLabel?: string;
    justNowLabel?: string;
    includeAgo?: boolean;
  } = {},
) {
  const {
    missingLabel = "—",
    justNowLabel = "Just now",
    includeAgo = true,
  } = options;

  if (!isFiniteHours(hours) || hours < 0) return missingLabel;
  if (hours < 1) return justNowLabel;

  const rounded = Math.round(hours);
  return includeAgo ? `${rounded}h ago` : `${rounded}h`;
}

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
                    ? "var(--primary)"
                    : "color-mix(in srgb, var(--muted-foreground) 24%, transparent)",
                }}
              />
            </div>
            <span className={`text-[8px] font-bold uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>
              {d.date}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Survive-Until countdown ──────────────────────────────────────────────
// ── Category donut (pure SVG) ────────────────────────────────────────────
function CategoryDonut({ breakdown }: { breakdown: { category: string; pct: number; amount_paise: number }[] }) {
  const r = 36, cx = 44, cy = 44, stroke = 10;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const top5 = breakdown.slice(0, 5);

  return (
    <div className="flex items-center gap-5">
      <svg width="88" height="88" viewBox="0 0 88 88" className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="color-mix(in srgb, var(--muted-foreground) 18%, transparent)" strokeWidth={stroke} />
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
            <span className="text-[10px] md:text-xs text-muted-foreground capitalize truncate">{seg.category}</span>
            <span className="text-[10px] md:text-xs font-bold text-foreground ml-auto">{seg.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Nudge popup card ─────────────────────────────────────────────────────
/* removed: Smart Nudges now render in DashboardNotifications instead of body cards */
/*
function RemovedNudgeCard({
  icon: Icon, accent, title, body, onDismiss,
}: {
  icon: any; accent: string; title: string; body: string; onDismiss: () => void;
}) {
  return (
    <div
      className="relative rounded-2xl border p-4 overflow-hidden animate-[nudgePop_0.4s_cubic-bezier(0.34,1.56,0.64,1)]"
      style={{ background: `${accent}0D`, borderColor: `${accent}30` }}
    >
      <div className="flex items-start gap-3">
        <button onClick={onDismiss} className="text-zinc-600 hover:text-zinc-400 text-xs shrink-0 cursor-pointer leading-none">✕</button>
      </div>
    </div>
  );
}

*/
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
  const routineType = routine?.type ?? "mixed";
  const routineCostSource = String(routine?.routine_meal_cost_source ?? "");
  const routineCostBasis = String(routine?.routine_meal_cost_basis ?? "");
  const routineCostConfidence = String(routine?.routine_meal_cost_confidence ?? "low");
  const deliveryCostPaise =
    routine?.delivery_meal_cost ||
    routine?.delivery?.avg_order ||
    Math.max(9_000, Math.min(25_000, (foodCapPaise || 9_000) + 2_000));
  const deliveryCostBasis = String(routine?.delivery_cost_basis ?? "");
  const deliveryCostConfidence = String(routine?.delivery_cost_confidence ?? (routine?.delivery?.count > 1 ? "high" : "low"));
  const sharedCostPaise =
    routine?.shared_meal_cost ||
    Math.max(4_000, Math.min(deliveryCostPaise, Math.round(deliveryCostPaise * 0.85)));
  const sharedCostBasis = String(routine?.shared_cost_basis ?? "");
  const sharedCostConfidence = String(routine?.shared_cost_confidence ?? "low");
  const routineMeta: Record<string, { label: string; option: string; detail: string }> = {
    hostel_mess: {
      label: "Hostel mess / campus meals",
      option: "Use hostel mess",
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
    typeof routine?.routine_meal_cost === "number"
      ? routine.routine_meal_cost
      : Math.max(4_000, Math.min(foodCapPaise || 14_000, Math.round((foodCapPaise || 14_000) / 2)));
  const routineOptionLabel = String(routine?.routine_option_label ?? activeRoutine.option);
  const routineDetail =
    routineCostSource === "mess_included"
      ? "Your mess plan is already accounted for in runway, so this meal does not add extra spend today."
      : routineCostSource === "mess_per_meal"
        ? "This uses your configured mess rate and is the most stable routine option for today."
        : activeRoutine.detail;

  const renderPlanCost = (cost: number, source: string, confidence: string) => {
    if (source === "mess_included" && cost <= 0) return "Covered";
    const amount = rupees(cost);
    return confidence === "low" ? `Est. ${amount}` : amount;
  };

  const plans = [
    {
      id: "routine" as const,
      label: routineOptionLabel,
      cost: routineMealCostPaise,
      costSource: routineCostSource,
      costConfidence: routineCostConfidence,
      basis: routineCostBasis,
      icon: Utensils,
      tone: "text-pb-green",
      border: "border-pb-green/20",
      bg: "bg-pb-green/5",
      detail: routineDetail,
    },
    {
      id: "shared" as const,
      label: routineType === "pg_cooking" ? "Split groceries with roommate" : "Pool / shared campus order",
      cost: sharedCostPaise,
      costSource: String(routine?.shared_cost_source ?? "shared"),
      costConfidence: sharedCostConfidence,
      basis: sharedCostBasis,
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
      costSource: "delivery",
      costConfidence: deliveryCostConfidence,
      basis: deliveryCostBasis,
      icon: ShoppingBag,
      tone: "text-pb-red",
      border: "border-pb-red/20",
      bg: "bg-pb-red/5",
      detail:
        deliveryCostConfidence === "low"
          ? "PocketBuddy is using a delivery estimate until it sees more delivery payments."
          : "Convenient, but this is usually the fastest way food pace starts reducing runway.",
    },
  ];

  const planViews = plans.map((plan) => {
    const isCovered = plan.costSource === "mess_included" && plan.cost <= 0;
    const capGap = Math.max(0, plan.cost - foodCapPaise);
    const saved = Math.max(0, deliveryCostPaise - plan.cost);
    const safeUsage = !isCovered && safeDailyPaise > 0 ? Math.round((plan.cost / safeDailyPaise) * 100) : 0;
    const withinCap = isCovered || capGap <= 0;
    const fitLabel = isCovered ? "Covered" : withinCap ? "Within cap" : `+${rupees(capGap)}`;
    const fitTone = isCovered
      ? "border-emerald-500/15 bg-emerald-500/8 text-emerald-400"
      : withinCap
        ? "border-primary/15 bg-primary/8 text-primary"
        : "border-amber-500/15 bg-amber-500/8 text-amber-400";
    const confidenceLabel =
      plan.costConfidence === "high" ? "Observed" : plan.costConfidence === "medium" ? "Recent pattern" : "Estimate";
    const supportLine = isCovered
      ? "Already accounted for in runway."
      : capGap > 0
        ? `${rupees(capGap)} above today's food cap.`
        : saved > 0 && plan.id !== "delivery"
          ? `Keeps ${rupees(saved)} inside runway vs solo delivery.`
          : "Fits today's runway without extra pressure.";
    const score =
      (isCovered ? 100 : 0) +
      (withinCap ? 28 : -Math.min(24, Math.round(capGap / 1000))) +
      (plan.id === "routine" ? 8 : plan.id === "shared" ? 4 : -8) +
      (plan.costConfidence === "high" ? 6 : plan.costConfidence === "medium" ? 3 : 0) +
      Math.min(18, Math.round(saved / 1000)) -
      Math.round(Math.max(plan.cost, 0) / 1000);
    return {
      ...plan,
      isCovered,
      capGap,
      saved,
      safeUsage,
      withinCap,
      fitLabel,
      fitTone,
      confidenceLabel,
      supportLine,
      score,
    };
  });

  const recommendedPlan = planViews.reduce((best, current) => (current.score > best.score ? current : best), planViews[0]);
  const activePlan = planViews.find((plan) => plan.id === selectedPlan) ?? recommendedPlan;
  const activeIsRecommended = activePlan.id === recommendedPlan.id;
  const activeSummary = activePlan.isCovered
    ? "Already covered by your mess plan."
    : activePlan.capGap > 0
      ? `${rupees(activePlan.capGap)} above today's cap.`
      : activePlan.id !== "delivery" && activePlan.saved > 0
        ? `Saves ${rupees(activePlan.saved)} vs solo delivery.`
        : `${activePlan.safeUsage}% of your safe daily limit.`;
  const activeContext = activePlan.id === "delivery" && activePlan.costConfidence === "low"
    ? "Delivery estimate will improve as more food payment history arrives."
    : activePlan.basis || activePlan.supportLine;
  const recommendedSummary = recommendedPlan.isCovered
    ? "covered by your mess plan"
    : recommendedPlan.capGap > 0
      ? `${rupees(recommendedPlan.capGap)} above cap`
      : recommendedPlan.id !== "delivery" && recommendedPlan.saved > 0
        ? `saves ${rupees(recommendedPlan.saved)} vs solo delivery`
        : "fits today's cap";

  return (
    <Card id="card-interactive-runway-check" className="bg-surface border border-border rounded-2xl p-4">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-zinc-400" />
              <p className="text-xs font-bold tracking-[0.15em] text-zinc-500 uppercase">Meal check</p>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Use the option that fits today's runway best.
            </p>
          </div>
          <Badge variant="outline" className="w-fit border-border bg-surface-raised text-[10px] md:text-xs uppercase tracking-wider font-semibold text-zinc-500">
            Cap {rupees(foodCapPaise)}
          </Badge>
        </div>

        <div className="text-xs leading-relaxed text-zinc-500">
          <span className="font-semibold text-foreground">Recommended:</span>{" "}
          <span className="text-foreground">{recommendedPlan.label}</span>
          <span className="text-zinc-500">, {recommendedSummary}.</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/80 bg-surface-raised/20">
          {planViews.map((plan) => {
            const Icon = plan.icon;
            const isActive = activePlan.id === plan.id;
            const isRecommended = recommendedPlan.id === plan.id;
            return (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full text-left px-3 py-3 transition-colors cursor-pointer ${
                  isActive
                    ? "bg-surface"
                    : "hover:bg-surface/70"
                }`}
              >
                <div className={`flex items-start justify-between gap-3 ${plan.id !== planViews[planViews.length - 1].id ? "border-b border-border/70 pb-3" : ""}`}>
                  <div className="min-w-0 flex items-start gap-2.5">
                    <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${isActive ? "bg-primary" : isRecommended ? "bg-zinc-400" : "bg-transparent border border-border"}`} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-zinc-400"}`} />
                        <span className="text-xs font-semibold text-foreground">{plan.label}</span>
                        <span className="text-[11px] text-zinc-500">
                          {plan.fitLabel} • {plan.confidenceLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                        {isActive ? activeSummary : plan.supportLine}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground tnum">
                      {renderPlanCost(plan.cost, plan.costSource, plan.costConfidence)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {isActive ? (activeIsRecommended ? "Recommended" : "Selected") : isRecommended ? "Best fit" : ""}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 border-t border-border/70 pt-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-zinc-500 max-w-2xl">
            {activeContext}
          </p>
          <Link
            to="/runway"
            className="h-8 rounded-lg border border-border bg-surface-raised px-3 flex items-center justify-center text-[10px] md:text-xs font-semibold text-foreground hover:bg-surface transition-all shrink-0"
          >
            Full runway
          </Link>
        </div>
      </div>
    </Card>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const notificationStorageKey = `pocketbuddy_dashboard_hidden_notifications_${user?.id ?? "anon"}`;
  const dashboardVisitStorageKey = `pocketbuddy_dashboard_arrivals_${user?.id ?? "anon"}`;
  const dashboardVisitRecordedRef = useRef<string | null>(null);
  const [dashboardVisitOrdinal, setDashboardVisitOrdinal] = useState(0);

  useEffect(() => {
    if (dashboardVisitRecordedRef.current === dashboardVisitStorageKey) return;
    dashboardVisitRecordedRef.current = dashboardVisitStorageKey;

    const current = readDashboardArrivalCount(dashboardVisitStorageKey);
    const next = Math.min(current + 1, 2);
    writeDashboardArrivalCount(dashboardVisitStorageKey, next);
    setDashboardVisitOrdinal(next);
  }, [dashboardVisitStorageKey]);

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

  // Runway score derived from insights
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
  }, [profile, txns, insights, user?.id]);

  // Routine score is calculated on the backend via /api/insights/wellness

  const runwayView = useMemo(() => {
    if (!runwayForecast) return null;
    const currentCycle = runwayForecast?.current_cycle;
    const projection = runwayForecast?.projection;
    const stressBand = projection?.stress_band;
    const foodRoutine = runwayForecast?.food_routine;
    const decision = runwayForecast?.decision_engine;
    const allowancePaise = currentCycle?.available_funding ?? 0;
    const spentPaise = currentCycle?.spent ?? 0;
    const pct = allowancePaise > 0 ? Math.min(100, Math.round((spentPaise / allowancePaise) * 100)) : 0;
    return {
      setupRequired: runwayForecast?.status === "setup_required" || runwayForecast?.setup_required,
      setupReason: runwayForecast?.setup_reason ?? currentCycle?.setup_reason,
      days: projection?.days_until_broke ?? 0,
      expectedDays: stressBand?.expected?.days_until_broke ?? projection?.days_until_broke ?? 0,
      stressDays: stressBand?.stress?.days_until_broke ?? projection?.days_until_broke ?? 0,
      calmDays: stressBand?.calm?.days_until_broke ?? projection?.days_until_broke ?? 0,
      safeDailyPaise: projection?.safe_daily_spend ?? 0,
      remainingPaise: currentCycle?.remaining ?? 0,
      spentTodayPaise: Math.round((calc?.spentToday ?? 0) * 100),
      allowancePaise,
      cycleEnd: currentCycle?.end ? new Date(currentCycle.end) : undefined,
      daysLeft: currentCycle?.days_left ?? 0,
      projectedDailyPaise: projection?.projected_daily_spend ?? 0,
      shortfallProbability: projection?.shortfall_probability ?? 0,
      riskSources: stressBand?.risk_sources,
      nextAction: decision?.next_best_action,
      pct,
      status: runwayForecast?.status ?? "healthy",
      foodRoutine,
      decision,
      possibleCommitments: runwayForecast?.possible_commitments ?? [],
      possibleCommitmentsTotal: (runwayForecast?.possible_commitments ?? []).reduce((sum: number, sub: any) => sum + sub.amount, 0),
    };
  }, [runwayForecast, calc]);

  // ── Survive-Until runway timestamp ─────────────────────────────────────
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

  const activeDashboardPools = useMemo(
    () =>
      (pools ?? []).filter(
        (p) =>
          (p.status === "open" && new Date(p.expires_at).getTime() > Date.now()) ||
          (p.status === "completed" && !isPoolFullyPaid(p)),
      ),
    [pools],
  );

  const menuFoodGapHours = useMemo(() => {
    const serverGap = insights?.food?.gap_hours;
    if (insights?.food?.last_signal_source && typeof serverGap === "number" && Number.isFinite(serverGap)) return serverGap;
    const lastFood = (txns ?? []).find((t) => t.category === "food");
    return lastFood ? (Date.now() - new Date(lastFood.created_at).getTime()) / 3600000 : undefined;
  }, [insights, txns]);

  const { data: foods } = useQuery({
    queryKey: [
      "foods",
      runwayView?.foodRoutine?.recommended_daily_food_cap ?? runwayView?.safeDailyPaise,
      menuFoodGapHours ? Math.floor(menuFoodGapHours) : null,
      runwayView?.foodRoutine?.type,
      profile?.mess_enrolled,
    ],
    staleTime: 30_000,
    queryFn: () =>
      getCampusFood({
        safeFoodBudgetPaise: runwayView?.foodRoutine?.recommended_daily_food_cap ?? runwayView?.safeDailyPaise,
        mealGapHours: menuFoodGapHours,
        foodRoutineType: runwayView?.foodRoutine?.type,
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

  const runwayStatusLabel = runwayView?.setupRequired ? "Setup needed" : runwayView?.status === "shortfall" ? "Shortfall" : runwayView?.status === "watch" ? "Watch" : "Healthy";
  const runwayStatusClass =
    runwayView?.setupRequired
      ? "bg-primary/10 border-primary/25 text-primary"
      : runwayView?.status === "shortfall"
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
      .filter((s) => ["confirmed", "active", "missed"].includes(String(s.status ?? "confirmed")))
      .filter((s) => {
        const d = new Date(s.next_debit_date);
        return d >= today && d <= week;
      })
      .map((s) => {
        const amount = Number(s.amount ?? s.amount_paise ?? 0);
        const newLimit =
          calc.daysLeft > 0 ? Math.round((calc.remaining - amount / 100) / calc.daysLeft) : 0;
        return { ...s, amount, newLimit, critical: newLimit < 80 };
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
  const [isWellnessExpanded, setIsWellnessExpanded] = useState(false);
  const wellnessStatus = String(wellness?.status ?? "");
  const wellnessIsSteady = wellnessStatus === "steady";
  const wellnessIsWatch = wellnessStatus === "watch";
  const wellnessToneColor = wellnessIsSteady
    ? "var(--pb-green)"
    : wellnessIsWatch
      ? "var(--pb-amber)"
      : "var(--pb-red)";
  const wellnessToneBorder = wellnessIsSteady
    ? "rgba(22,163,74,0.3)"
    : wellnessIsWatch
      ? "rgba(217,119,6,0.3)"
      : "rgba(220,38,38,0.3)";
  const wellnessToneBackground = wellnessIsSteady
    ? "rgba(22,163,74,0.05)"
    : wellnessIsWatch
      ? "rgba(217,119,6,0.05)"
      : "rgba(220,38,38,0.05)";

  // Student Fuel Swapper State
  const [showFoodSheet, setShowFoodSheet] = useState(false);

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
  const [checkInMealSource, setCheckInMealSource] = useState<"mess" | "cooked" | "home" | "outside_cash" | null>(null);
  const [checkInNote, setCheckInNote] = useState("");
  const [checkInSaving, setCheckInSaving] = useState<"ate" | "skipped" | null>(null);
  const checkinChecked = useRef(false);
  const checkInStorageKey = `pocketbuddy_last_checkin_${user?.id ?? "anon"}`;
  const checkInSnoozeKey = `pocketbuddy_checkin_snooze_${user?.id ?? "anon"}`;
  const checkInStopKey = `pocketbuddy_checkin_stop_${user?.id ?? "anon"}_${profile?.exam_start_date ?? "no_start"}_${profile?.exam_end_date ?? "no_end"}`;

  useEffect(() => {
    if (checkinChecked.current || !profile || !txns || !insights) return;
    checkinChecked.current = true;
    const now = new Date();
    if (!profile.exam_start_date || !profile.exam_end_date) return;
    const inExam =
      now >= new Date(profile.exam_start_date) &&
      now <= new Date(profile.exam_end_date + "T23:59:59");
    if (!inExam) return;
    const lastFood = txns.find((t) => t.category === "food");
    const fallbackHours = lastFood ? (Date.now() - new Date(lastFood.created_at).getTime()) / 3600000 : 999;
    const hours = insights.food?.last_signal_source && typeof insights.food?.gap_hours === "number" ? insights.food.gap_hours : fallbackHours;
    if (hours < 16) return;
    if (localStorage.getItem(checkInStopKey)) return;
    const snoozedAt = localStorage.getItem(checkInSnoozeKey);
    if (snoozedAt && Date.now() - parseInt(snoozedAt, 10) < CHECKIN_REMIND_LATER_MS) return;
    const lastCk = localStorage.getItem(checkInStorageKey);
    if (lastCk && Date.now() - parseInt(lastCk, 10) < 16 * 3600000) return;
    setShowCheckIn(true);
  }, [profile, txns, insights, checkInStorageKey, checkInSnoozeKey, checkInStopKey]);

  useEffect(() => {
    if (!showCheckIn) {
      setCheckInExpanded(false);
      setCheckInMealSource(null);
      setCheckInNote("");
    }
  }, [showCheckIn]);

  const search = Route.useSearch();
  useEffect(() => {
    if (search.log) {
      setAdding(true);
      nav({ to: "/dashboard", search: (prev: any) => ({ ...prev, log: undefined }), replace: true });
    }
  }, [search.log]);

  useEffect(() => {
    const openLogTransaction = () => setAdding(true);
    window.addEventListener("pocketbuddy:open-log-transaction", openLogTransaction);
    return () => window.removeEventListener("pocketbuddy:open-log-transaction", openLogTransaction);
  }, []);

  const hasFoodGapSignal = isFiniteHours(menuFoodGapHours);
  const foodGapHours = hasFoodGapSignal ? menuFoodGapHours : 0;
  const examActive = Boolean(insights?.exam?.in_exam_period);
  const examMealGapHours =
    typeof insights?.food?.gap_hours === "number" && insights?.food?.last_signal_source
      ? insights.food.gap_hours
      : foodGapHours;
  const examNeedsMealSignal = examActive && (!insights?.food?.last_signal_source || examMealGapHours >= 8);
  const examFoodCapPaise = runwayView?.foodRoutine?.recommended_daily_food_cap ?? runwayView?.safeDailyPaise ?? 0;
  const examMealSignalSource =
    insights?.food?.last_signal_source === "checkin"
      ? "Check-in"
      : insights?.food?.last_signal_source === "transaction"
        ? "Payment"
        : "Missing";
  const routineMealSignalLine = insights?.food?.last_signal_source
    ? `Last meal signal: ${examMealSignalSource.toLowerCase()}, ${formatMealGapHours(insights.food.gap_hours)}`
    : hasFoodGapSignal
      ? `Last meal signal: recent food spend, ${formatMealGapHours(foodGapHours)}`
      : "Last meal signal: no payment or check-in yet";
  const checkInMealSignalLine = hasFoodGapSignal
    ? `No food payment or check-in for ${Math.max(1, Math.round(foodGapHours))}h.`
    : "No recent meal signal.";
  const wellnessPrimaryAction = wellness?.primary_action as
    | { key?: string; title?: string; detail?: string; cta_label?: string; destination?: string }
    | undefined;
  const wellnessActionDestination = String(wellnessPrimaryAction?.destination ?? "");
  const isPrimaryWellnessAction = (destination: string) => wellnessActionDestination === destination;

  // ── Smart nudges derived from insights ──────────────────────────────────
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
        accent: "#8C7853",
        title: "After-hours payment signal",
        body: `₹${Math.round(lateTotal)} spent after-hours in the last 30 days. Keep a low-cost snack or mess backup so late orders do not shrink runway.`,
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
    if (subBleed > 300 && runwayView && !runwayView.setupRequired && runwayView.safeDailyPaise < 15_000) {
      list.push({
        id: "sub_bleed",
        icon: Receipt,
        accent: "#C27D56",
        title: "Subscription bleed warning",
        body: `₹${Math.round(subBleed)}/month in active subscriptions. With your current runway, consider pausing non-essential ones.`,
      });
    }

    return list;
  }, [insights, calc, runwayView, examActive]);

  function handleCheckInRemindLater(showToast = true) {
    if (checkInSaving) return;
    localStorage.setItem(checkInSnoozeKey, String(Date.now()));
    setShowCheckIn(false);
    setCheckInExpanded(false);
    setCheckInMealSource(null);
    setCheckInNote("");
    if (showToast) {
      toast.info("Meal check-in hidden for a few hours.");
    }
  }

  function handleCheckInStopAsking() {
    if (checkInSaving) return;
    localStorage.setItem(checkInStopKey, String(Date.now()));
    localStorage.removeItem(checkInSnoozeKey);
    setShowCheckIn(false);
    setCheckInExpanded(false);
    setCheckInMealSource(null);
    setCheckInNote("");
    toast.info("Meal check-in prompts paused for this exam window.");
  }

  async function handleCheckInAte() {
    if (!user || checkInSaving) return;
    if (!checkInMealSource) {
      toast.error("Select where you ate so PocketBuddy updates the right meal signal.");
      return;
    }
    setCheckInSaving("ate");
    try {
      await insertCheckinLog({
        data: {
          response: "meal_logged",
          food_gap_hours: foodGapHours,
          meal_source: checkInMealSource,
          suggestion_given: "meal_gap_checkin",
        },
      });
      localStorage.setItem(checkInStorageKey, String(Date.now()));
      setShowCheckIn(false);
      setCheckInExpanded(false);
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["wellness-insights"] });
      qc.invalidateQueries({ queryKey: ["campus-intel"] });
      qc.invalidateQueries({ queryKey: ["foods"] });
      qc.invalidateQueries({ queryKey: ["runway-forecast"] });
      qc.invalidateQueries({ queryKey: ["wing-feed"] });
      toast.success("Meal check-in saved. Runway and campus food signals are updated.");
    } catch (err: any) {
      toast.error(err?.message || "Could not save meal check-in.");
    } finally {
      setCheckInSaving(null);
    }
  }

  async function handleCheckInSkipped() {
    if (!user || checkInSaving) return;
    setCheckInSaving("skipped");
    const suggestion = bestFood
      ? `${bestFood.venue_name} ${bestFood.item_name} ${rupees(bestFood.price)}`
      : "Campus Café";
    try {
      await insertCheckinLog({
        data: {
          response: "meal_skipped",
          food_gap_hours: foodGapHours,
          suggestion_given: suggestion,
          context_note: checkInNote,
        },
      });
      localStorage.setItem(checkInSnoozeKey, String(Date.now()));
      setShowCheckIn(false);
      setCheckInNote("");
      setCheckInExpanded(false);
      qc.invalidateQueries({ queryKey: ["wellness-insights"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
      qc.invalidateQueries({ queryKey: ["campus-intel"] });
      qc.invalidateQueries({ queryKey: ["runway-forecast"] });
      qc.invalidateQueries({ queryKey: ["wing-feed"] });
      if (bestFood) {
        toast(`Logged. Campus Food Guard suggests ${bestFood.item_name} at ${bestFood.venue_name} (${rupees(bestFood.price)}).`);
      } else {
        toast("Logged. Campus Food Guard can help when you are ready to eat.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not save delayed meal note.");
    } finally {
      setCheckInSaving(null);
    }
  }

  const topCategory = insights?.category_breakdown?.[0];
  const spend7TotalPaise = (insights?.daily_spend_7d ?? []).reduce(
    (sum: number, day: any) => sum + (day.amount_paise ?? 0),
    0,
  );
  const velocityPct = insights?.velocity?.pct_change ?? 0;
  const quickStats = [
    {
      label: "7-day spend",
      value: insights?.daily_spend_7d ? rupees(spend7TotalPaise) : "—",
      detail: velocityPct ? `${velocityPct > 0 ? "+" : ""}${velocityPct}% vs last week` : "Weekly pace",
    },
    {
      label: "Top category",
      value: topCategory?.category ?? "—",
      detail: topCategory ? rupees(topCategory.amount_paise) : "No category yet",
    },
    {
      label: "Food pace",
      value: runwayView?.foodRoutine && !runwayView.setupRequired ? rupees(runwayView.foodRoutine.food_daily_pace ?? 0) : "—",
      detail: examFoodCapPaise > 0 ? `${rupees(examFoodCapPaise)} target` : "Routine signal",
    },
    {
      label: "After-hours",
      value: insights ? rupees(insights.late_night.total_paise) : "—",
      detail: `${insights?.late_night?.txn_count ?? 0} payments`,
    },
  ];
  const wellnessScore = Number(wellness?.score);
  const hasWellnessScore = Number.isFinite(wellnessScore);
  const routineStatusLabel = wellnessLoading
    ? "Loading"
    : wellnessError
      ? "Unavailable"
      : hasWellnessScore
        ? wellnessIsSteady
          ? "Steady"
          : wellnessIsWatch
            ? "Watch"
            : "Needs attention"
        : "No signal";
  const routineStatusClass = wellnessLoading || wellnessError || !hasWellnessScore
    ? "border-border bg-surface-raised text-muted-foreground"
    : wellnessIsSteady
      ? "border-success/20 bg-success/5 text-success"
      : wellnessIsWatch
        ? "border-warning/20 bg-warning/5 text-warning"
        : "border-destructive/20 bg-destructive/5 text-destructive";
  const routineFoodMetrics = [
    {
      label: "Routine",
      value: hasWellnessScore ? `${Math.round(wellnessScore)}/100` : "-",
      detail: routineStatusLabel,
      icon: ShieldCheck,
    },
    {
      label: "Meal signal",
      value: formatMealGapHours(
        insights?.food?.last_signal_source ? insights.food.gap_hours : hasFoodGapSignal ? foodGapHours : null,
        { missingLabel: "No signal", includeAgo: false },
      ),
      detail: examMealSignalSource,
      icon: Utensils,
    },
    {
      label: "Food pace",
      value: runwayView?.foodRoutine && !runwayView.setupRequired ? rupees(runwayView.foodRoutine.food_daily_pace ?? 0) : "-",
      detail: examFoodCapPaise > 0 ? `${rupees(examFoodCapPaise)} target` : "Runway target",
      icon: Receipt,
    },
    {
      label: "After-hours",
      value: insights ? rupees(insights.late_night.total_paise) : "-",
      detail: `${insights?.late_night?.txn_count ?? 0} payments`,
      icon: Clock3,
    },
  ];
  const showRunwayWarning = Boolean(runwayView && !runwayView.setupRequired && (runwayView.days < 7 || runwayView.safeDailyPaise < 15_000));
  const showExamWarning = Boolean(insights?.exam?.in_exam_period);
  const showPossibleCommitments = Boolean(runwayView?.possibleCommitments?.length);
  const firstName = (user?.fullName || "Student").trim().split(/\s+/)[0] || "Student";
  const poolPendingPaise = activeDashboardPools.reduce((sum, pool) => {
    if (pool.status !== "completed") return sum;
    return sum + Object.values(pool.split_breakdown ?? {}).reduce((inner: number, details: any) => {
      if (!details || details.paid) return inner;
      return inner + Number(details.total ?? 0);
    }, 0);
  }, 0);
  const openPoolCount = activeDashboardPools.filter((pool) => pool.status === "open").length;
  const latestTxn = recent[0];
  const latestTxnMerchant = latestTxn
    ? latestTxn.mapped_merchant_name ?? latestTxn.raw_merchant_string ?? "Latest transaction"
    : null;
  const featureInsightCards = [
    {
      key: "pool",
      label: "Pool",
      icon: Users,
      to: "/pool" as const,
      action: "Open pools",
      accent: {
        ring: "border-emerald-500/25 hover:border-emerald-500/45 focus-visible:ring-emerald-500/35",
        icon: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        strip: "bg-emerald-500",
        action: "text-emerald-700 dark:text-emerald-300",
      },
      value: activeDashboardPools.length ? `${activeDashboardPools.length} active` : "No active pools",
      detail: poolPendingPaise > 0
        ? `${rupees(poolPendingPaise)} pending settlement`
        : openPoolCount > 0
          ? `${openPoolCount} shared cart${openPoolCount === 1 ? "" : "s"} open`
          : "Start a shared cart when needed",
      facts: [
        { label: "Open", value: String(openPoolCount) },
        { label: "Pending", value: poolPendingPaise > 0 ? rupees(poolPendingPaise) : "0" },
      ],
    },
    {
      key: "travel",
      label: "Travel",
      icon: Compass,
      to: "/travel" as const,
      action: "Check fare",
      accent: {
        ring: "border-sky-500/25 hover:border-sky-500/45 focus-visible:ring-sky-500/35",
        icon: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        strip: "bg-sky-500",
        action: "text-sky-700 dark:text-sky-300",
      },
      value: Number(travelSavings?.total_saved ?? 0) > 0 ? `₹${travelSavings.total_saved}` : "Fare check ready",
      detail: "Compare quotes before campus rides",
      facts: [
        { label: "Saved", value: Number(travelSavings?.total_saved ?? 0) > 0 ? `₹${travelSavings.total_saved}` : "0" },
        { label: "Mode", value: "Quote" },
      ],
    },
    {
      key: "runway",
      label: "Runway",
      icon: Timer,
      to: "/runway" as const,
      action: "Open runway",
      accent: {
        ring: runwayView?.status === "shortfall"
          ? "border-red-500/25 hover:border-red-500/45 focus-visible:ring-red-500/35"
          : runwayView?.status === "watch"
            ? "border-amber-500/25 hover:border-amber-500/45 focus-visible:ring-amber-500/35"
            : "border-amber-500/25 hover:border-amber-500/45 focus-visible:ring-amber-500/35",
        icon: runwayView?.status === "shortfall"
          ? "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300"
          : runwayView?.status === "watch"
            ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        strip: runwayView?.status === "shortfall" ? "bg-red-500" : "bg-amber-500",
        action: runwayView?.status === "shortfall"
          ? "text-red-700 dark:text-red-300"
          : "text-amber-700 dark:text-amber-300",
      },
      value: runwayView
        ? runwayView.setupRequired
          ? "Setup needed"
          : `${runwayView.expectedDays}d`
        : "Loading",
      detail: runwayView && !runwayView.setupRequired
        ? `${rupees(runwayView.safeDailyPaise)}/day safe · ${Math.round((runwayView.shortfallProbability ?? 0) * 100)}% risk`
        : "Add allowance for projections",
      facts: [
        { label: "Safe/day", value: runwayView && !runwayView.setupRequired ? rupees(runwayView.safeDailyPaise) : "-" },
        { label: "Risk", value: runwayView && !runwayView.setupRequired ? `${Math.round((runwayView.shortfallProbability ?? 0) * 100)}%` : "-" },
      ],
      progress: runwayView && !runwayView.setupRequired ? runwayView.pct : null,
      progressLabel: runwayView && !runwayView.setupRequired ? `${runwayView.pct}% used` : "",
    },
    {
      key: "transactions",
      label: "Transactions",
      icon: Receipt,
      to: "/transactions" as const,
      action: "Open transactions",
      accent: {
        ring: "border-violet-500/25 hover:border-violet-500/45 focus-visible:ring-violet-500/35",
        icon: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
        strip: "bg-violet-500",
        action: "text-violet-700 dark:text-violet-300",
      },
      value: latestTxn ? rupees(latestTxn.amount) : "No entries",
      detail: latestTxn ? `${latestTxnMerchant} · ${relativeTime(latestTxn.created_at)}` : "Sync or log your first spend",
      facts: [
        { label: "7-day", value: insights?.daily_spend_7d ? rupees(spend7TotalPaise) : "-" },
        { label: "Top", value: topCategory?.category ?? "-" },
      ],
    },
  ];
  const showInlineSmartNudges = dashboardVisitOrdinal === 1;
  const inlineNudgeIds = new Set(["velocity_spike", "late_night", "delivery_overuse", "sub_bleed", "short_runway"]);
  const inlineSmartNudges = showInlineSmartNudges
    ? nudges.filter((nudge) => inlineNudgeIds.has(nudge.id)).slice(0, 2)
    : [];
  const getNudgeActions = (nudge: any) =>
    nudge.id === "delivery_overuse" || nudge.id === "late_night"
      ? [{
        label: "Campus food",
        variant: "secondary" as const,
        onClick: () => {
          setShowFoodSheet(true);
          setFoodTab("menus");
        },
      }]
      : nudge.id === "onboard"
        ? [
          {
            label: "Log spend",
            variant: "primary" as const,
            onClick: () => setAdding(true),
          },
          {
            label: "Pair phone",
            variant: "secondary" as const,
            onClick: () => nav({ to: "/companion" }),
          },
        ]
        : [{
          label: "Open Runway",
          variant: "secondary" as const,
          onClick: () => nav({ to: "/runway" }),
        }];
  const dashboardNotifications = useMemo<DashboardNotificationItem[]>(() => {
    const items: DashboardNotificationItem[] = [];

    const nudgesForBell = showInlineSmartNudges ? [] : nudges;
    nudgesForBell.forEach((nudge) => {
      items.push({
        id: `nudge-${nudge.id}`,
        title: nudge.title,
        body: nudge.body,
        icon: nudge.icon,
        tone: nudge.id === "velocity_spike" || nudge.id === "sub_bleed" || nudge.id === "late_night" ? "warning" : "neutral",
        actions: getNudgeActions(nudge),
      });
    });

    if (showPossibleCommitments && runwayView && false) {
      items.push({
        id: "possible-commitments",
        title: "Unconfirmed commitments",
        body: `${rupees(runwayView!.possibleCommitmentsTotal)} may renew before reset. Confirm recurring debits to include them in runway.`,
        icon: Receipt,
        tone: "neutral",
        content: (
          <div className="space-y-2">
            {runwayView!.possibleCommitments.slice(0, 3).map((sub: any) => {
              const daysLeft = Math.max(1, runwayView!.daysLeft || 0);
              const newSafeDailyPaise = Math.max(0, Math.floor(((runwayView!.remainingPaise || 0) - (sub.amount || 0)) / daysLeft));
              return (
                <div key={sub.id} className="rounded-lg border border-border bg-surface-raised/40 p-2.5">
                  <div className="flex items-start gap-2.5">
                    <PlatformIcon platform={sub.label} className="h-7 w-7 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-foreground">{sub.label}</p>
                        <span className="shrink-0 text-xs font-semibold text-foreground tnum">{rupees(sub.amount)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Due {shortDate(new Date(sub.due_at))} · safe/day becomes {rupees(newSafeDailyPaise)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          className="h-8 min-w-[72px] px-3 text-[11px] font-semibold"
                          onClick={async () => {
                            try {
                              await confirmSubscription({ data: { id: sub.id } });
                              qc.invalidateQueries({ queryKey: ["runway-forecast"] });
                              qc.invalidateQueries({ queryKey: ["all-subs"] });
                              toast.success(`Tracked ${sub.label}.`);
                            } catch (err: any) {
                              toast.error(err.message || "Failed to confirm");
                            }
                          }}
                        >
                          Track
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 min-w-[104px] border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground shadow-sm hover:border-foreground/15 hover:bg-surface-interactive"
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
                  </div>
                </div>
              );
            })}
            {runwayView!.possibleCommitments.length > 3 && (
              <p className="text-[11px] text-muted-foreground">
                +{runwayView!.possibleCommitments.length - 3} more in Runway.
              </p>
            )}
          </div>
        ),
        actions: [
          {
            label: "Open Runway",
            variant: "secondary",
            onClick: () => nav({ to: "/runway" }),
          },
        ],
      });
    }

    return items;
  }, [
    nudges,
    showInlineSmartNudges,
    showRunwayWarning,
    runwayView,
    showExamWarning,
    examNeedsMealSignal,
    examFoodCapPaise,
    insights?.exam?.days_left,
    showPossibleCommitments,
    nav,
    qc,
  ]);
  const rawCampusIntelHeadline = cleanInsightText(campusIntel?.headline);
  const campusIntelHeadlineLooksLikeLabel = Boolean(
    rawCampusIntelHeadline &&
    rawCampusIntelHeadline.length <= 56 &&
    !/[.!?]$/.test(rawCampusIntelHeadline),
  );
  const rawCampusIntelBody = cleanInsightText(campusIntel?.next_action) || cleanInsightText(campusIntel?.summary);
  const campusIntelHeadline = campusIntelHeadlineLooksLikeLabel ? rawCampusIntelHeadline : "";
  const campusIntelBodyText = uniqueInsightText(
    rawCampusIntelBody || rawCampusIntelHeadline,
    campusIntelHeadline ? [campusIntelHeadline] : [],
  );
  const campusIntelWhy = uniqueInsightText(campusIntel?.why, [
    campusIntelHeadline,
    ...splitInsightSentences(campusIntelBodyText),
  ]);
  const showCampusIntelHeadline = Boolean(campusIntelHeadline && !sameInsightText(campusIntelHeadline, campusIntelBodyText));
  const showCampusIntelWhy = Boolean(campusIntelWhy);
  const inlineTopNudge = inlineSmartNudges[0];
  const topPriority = inlineTopNudge
    ? {
      title: inlineTopNudge.title,
      body: inlineTopNudge.body,
      icon: inlineTopNudge.icon,
      action: getNudgeActions(inlineTopNudge)[0],
    }
    : dashboardNotifications[0]
      ? {
        title: dashboardNotifications[0].title,
        body: dashboardNotifications[0].body,
        icon: dashboardNotifications[0].icon,
        action: dashboardNotifications[0].actions?.[0],
      }
      : null;
  const TopPriorityIcon = topPriority?.icon;

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
          <DashboardNotifications items={dashboardNotifications} storageKey={notificationStorageKey} />
        </div>
      </div>

      <div className="pb-16">
        <section className="mb-5 space-y-4">
          <div className="relative isolate">
            <div className="pointer-events-none absolute -inset-x-3 -inset-y-3 -z-10 rounded-[1.75rem] bg-surface-raised sm:-inset-x-4" />
            <div className="flex flex-col gap-3 px-1 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  Hi, {firstName}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Pool, travel, runway, and transaction status at a glance.
                </p>
              </div>
              {topPriority && TopPriorityIcon && (
                <button
                  type="button"
                  disabled={!topPriority.action}
                  onClick={() => topPriority.action?.onClick()}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 text-left shadow-sm transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-foreground/15 hover:bg-surface-raised hover:shadow-md disabled:cursor-default disabled:hover:translate-y-0 lg:max-w-[28rem]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-warning/25 bg-warning/10 text-warning">
                    <TopPriorityIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Top priority</span>
                    <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{topPriority.title}</span>
                  </span>
                  {topPriority.action && (
                    <span className="hidden shrink-0 items-center gap-1 text-[11px] font-semibold text-primary sm:inline-flex">
                      {topPriority.action.label}
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:auto-rows-fr">
              {featureInsightCards.map((card) => {
                const Icon = card.icon;
                const compactValue = String(card.value).length > 12;
                return (
                  <Link
                    key={card.key}
                    to={card.to}
                    aria-label={`${card.action}: ${card.value}`}
                    className={`group relative flex h-full min-h-[158px] cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border bg-surface p-4 shadow-sm outline-none transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-surface-raised hover:shadow-md active:translate-y-0 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${card.accent.ring}`}
                  >
                    <span className={`absolute inset-x-0 top-0 h-1 ${card.accent.strip}`} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            {card.label}
                          </p>
                          {card.key === "runway" && runwayView && (
                            <Badge variant="outline" className={`${runwayStatusClass} px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.12em]`}>
                              {runwayStatusLabel}
                            </Badge>
                          )}
                        </div>
                        <p className={`mt-2 truncate font-semibold leading-[1.08] text-foreground tnum ${compactValue ? "text-lg sm:text-xl" : "text-[1.45rem] sm:text-[1.55rem]"}`}>
                          {card.value}
                        </p>
                      </div>
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-transform duration-200 group-hover:scale-[1.03] ${card.accent.icon}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="grid grid-cols-2 gap-2">
                        {card.facts.map((fact) => (
                          <div key={fact.label} className="min-w-0 rounded-lg border border-border bg-surface-raised/40 px-2.5 py-2">
                            <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{fact.label}</p>
                            <p className="mt-1 truncate text-[0.8rem] font-semibold leading-none text-foreground tnum">{fact.value}</p>
                          </div>
                        ))}
                      </div>
                      {card.progress != null ? (
                        <div className="mt-3 flex items-center gap-2">
                          <Progress value={card.progress} className="h-1 bg-surface-raised" />
                          <span className="shrink-0 text-[10px] font-semibold text-muted-foreground tnum">{card.progressLabel}</span>
                        </div>
                      ) : (
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {card.detail}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
                      <span className={`text-[11px] font-semibold ${card.accent.action}`}>{card.action}</span>
                      <span className="grid h-7 w-7 place-items-center rounded-full border border-border bg-surface-raised text-muted-foreground transition-[border-color,color,transform] duration-200 group-hover:translate-x-0.5 group-hover:border-current group-hover:text-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {inlineSmartNudges.length > 0 && (
            <div id="section-dashboard-smart-nudges" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {inlineSmartNudges.map((nudge) => {
                const Icon = nudge.icon;
                const actions = getNudgeActions(nudge).slice(0, 2);
                const isWarning = nudge.id === "velocity_spike" || nudge.id === "sub_bleed" || nudge.id === "late_night";
                return (
                  <div
                    key={nudge.id}
                    className={`rounded-2xl border bg-surface p-4 ${
                      isWarning ? "border-warning/25" : "border-border"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-surface-raised ${
                        isWarning ? "border-warning/25 text-warning" : "border-border text-muted-foreground"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Needs attention</p>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Today</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{nudge.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{nudge.body}</p>
                        {actions.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {actions.map((action) => (
                              <Button
                                key={action.label}
                                type="button"
                                size="sm"
                                variant={action.variant === "primary" ? "default" : "outline"}
                                className={
                                  action.variant === "primary"
                                    ? "h-8 px-3 text-[11px] font-semibold"
                                    : "h-8 border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive"
                                }
                                onClick={() => action.onClick()}
                              >
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Smart Nudges row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* ── Main Column ─────────────────────────────────────────────── */}
          <div className="md:col-span-7 lg:col-span-8 flex flex-col gap-6 animate-[fadeIn_0.3s_ease-out]">

            {(showRunwayWarning || showExamWarning || showPossibleCommitments) && (
              <div className="order-0 grid grid-cols-1 gap-3 xl:grid-cols-2">
                {showRunwayWarning && runwayView && (
                  <div id="card-runway-alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-destructive/20 bg-background/60 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-destructive">Runway action</p>
                          <span className="text-[11px] font-semibold text-muted-foreground">{rupees(runwayView.safeDailyPaise)}/day safe limit</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
                          {runwayView.decision?.next_best_action?.title ?? runwayView.nextAction?.title ?? "Keep the next spend planned."}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Expected {runwayView.expectedDays}d, stress case {runwayView.stressDays}d. Open Runway for the full simulator.
                        </p>
                        <Link to="/runway" className="mt-3 inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90">
                          Open Runway
                        </Link>
                      </div>
                    </div>
                  </div>
                )}

                {showExamWarning && (
                  <div id="card-exam-food-alert" className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-raised text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Exam food</p>
                          <span className="text-[11px] font-semibold text-muted-foreground">{insights?.exam?.days_left ?? 0}d left</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
                          {examNeedsMealSignal ? "No recent meal signal." : "Meal signal is current."}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Keep the next meal near {examFoodCapPaise > 0 ? rupees(examFoodCapPaise) : "today's target"} while the exam window is active.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {examNeedsMealSignal && (
                            <Button size="sm" className="h-8 px-3 text-[11px] font-semibold" onClick={() => setShowCheckIn(true)}>
                              Check in
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive"
                            onClick={() => {
                              setShowFoodSheet(true);
                              setFoodTab("menus");
                            }}
                          >
                            Campus food
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {showPossibleCommitments && runwayView && (
                  <div id="card-possible-commitments-alert" className="rounded-2xl border border-border bg-surface p-4 xl:col-span-2">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-raised text-muted-foreground">
                          <Receipt className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Unconfirmed commitments</p>
                          <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
                            {rupees(runwayView.possibleCommitmentsTotal)} in possible recurring debits may hit before reset.
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            Confirm only the ones that are real so Runway does not understate future spend.
                          </p>
                        </div>
                      </div>
                      <Link to="/runway" className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive">
                        Open Runway
                      </Link>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-3">
                      {runwayView.possibleCommitments.slice(0, 3).map((sub: any) => {
                        const daysLeft = Math.max(1, runwayView.daysLeft || 0);
                        const newSafeDailyPaise = Math.max(0, Math.floor(((runwayView.remainingPaise || 0) - (sub.amount || 0)) / daysLeft));
                        return (
                          <div key={sub.id} className="rounded-xl border border-border bg-surface-raised/35 p-3">
                            <div className="flex items-start gap-2.5">
                              <PlatformIcon platform={sub.label} className="h-8 w-8 shrink-0 rounded-lg" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="truncate text-xs font-semibold text-foreground">{sub.label}</p>
                                  <span className="shrink-0 text-xs font-semibold text-foreground tnum">{rupees(sub.amount)}</span>
                                </div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  Due {shortDate(new Date(sub.due_at))}; safe/day becomes {rupees(newSafeDailyPaise)}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <Button
                                    size="sm"
                                    className="h-8 min-w-[72px] px-3 text-[11px] font-semibold"
                                    onClick={async () => {
                                      try {
                                        await confirmSubscription({ data: { id: sub.id } });
                                        qc.invalidateQueries({ queryKey: ["runway-forecast"] });
                                        qc.invalidateQueries({ queryKey: ["all-subs"] });
                                        toast.success(`Tracked ${sub.label}.`);
                                      } catch (err: any) {
                                        toast.error(err.message || "Failed to confirm");
                                      }
                                    }}
                                  >
                                    Track
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 min-w-[104px] border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground shadow-sm hover:border-foreground/15 hover:bg-surface-interactive"
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
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {runwayView.possibleCommitments.length > 3 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        +{runwayView.possibleCommitments.length - 3} more in Runway.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div id="card-routine-food-signals" className="order-1 rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-raised text-muted-foreground">
                    <Utensils className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Routine & Food</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Meal timing, routine score, and food spend signals feeding Runway.
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={`${routineStatusClass} w-fit shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider`}>
                  {routineStatusLabel}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                {routineFoodMetrics.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <div key={metric.label} className="min-w-0 rounded-xl border border-border bg-surface-raised/35 p-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {metric.label}
                        </p>
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold text-foreground tnum">{metric.value}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{metric.detail}</p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                  <p>{routineMealSignalLine}</p>
                  {wellnessPrimaryAction?.detail && wellnessPrimaryAction.detail !== wellness?.message && (
                    <p className="mt-1 truncate">{wellnessPrimaryAction.detail}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {examNeedsMealSignal && (
                    <Button size="sm" className="h-8 px-3 text-[11px] font-semibold" onClick={() => setShowCheckIn(true)}>
                      Check in
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive"
                    onClick={() => {
                      setShowFoodSheet(true);
                      setFoodTab("menus");
                    }}
                  >
                    Campus food
                  </Button>
                </div>
              </div>
            </div>

            <div className="hidden">
              <div id="card-runway-focus" className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-raised text-muted-foreground">
                      <Timer className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Runway</p>
                      <p className="mt-1 text-sm font-medium leading-relaxed text-muted-foreground">
                        How long this allowance can keep going.
                      </p>
                    </div>
                  </div>
                  {runwayView && (
                    <Badge variant="outline" className={`${runwayStatusClass} shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider`}>
                      {runwayStatusLabel}
                    </Badge>
                  )}
                </div>

                {!runwayView ? (
                  <div className="mt-5 space-y-3">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : runwayView.setupRequired ? (
                  <div className="mt-5">
                    <p className="text-base font-semibold text-foreground">Allowance setup needed</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {runwayView.setupReason ?? "Add allowance to activate safe/day guidance."}
                    </p>
                    <Link to="/settings" className="mt-4 inline-flex h-8 items-center justify-center rounded-lg border border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive">
                      Open Settings
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-border bg-surface-raised/35 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Expected</p>
                        <p className="mt-1 text-xl font-semibold leading-none text-foreground tnum">{runwayView.expectedDays}d</p>
                      </div>
                      <div className="rounded-xl border border-border bg-surface-raised/35 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Safe/day</p>
                        <p className="mt-1 text-base font-semibold leading-none text-foreground tnum">{rupees(runwayView.safeDailyPaise)}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-surface-raised/35 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Risk</p>
                        <p className="mt-1 text-base font-semibold leading-none text-foreground tnum">{Math.round((runwayView.shortfallProbability ?? 0) * 100)}%</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <Progress id="progress-runway-focus" value={runwayView.pct} className="h-1 bg-surface-raised" />
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {runwayView.pct}% spent. Balance {rupees(runwayView.remainingPaise)}. Reset in {runwayView.daysLeft}d.
                      </p>
                    </div>
                    <Link to="/runway" className="mt-4 inline-flex h-8 items-center justify-center rounded-lg border border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive">
                      Open Runway
                    </Link>
                  </>
                )}
              </div>

              <div id="card-food-guard-focus" className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-raised text-muted-foreground">
                      <Utensils className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Food Guard</p>
                      <p className="mt-1 text-sm font-medium leading-relaxed text-muted-foreground">
                        Meal signal, food pace, and campus options.
                      </p>
                    </div>
                  </div>
                  {runwayView?.foodRoutine?.label && !runwayView?.setupRequired && (
                    <Badge variant="outline" className="shrink-0 border-border bg-surface-raised px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground">
                      {runwayView.foodRoutine.label}
                    </Badge>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border bg-surface-raised/35 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Meal</p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">
                      {formatMealGapHours(insights?.food?.last_signal_source ? insights.food.gap_hours : hasFoodGapSignal ? foodGapHours : null, { missingLabel: "No signal", includeAgo: false })}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-raised/35 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Food pace</p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground tnum">
                      {runwayView?.foodRoutine && !runwayView.setupRequired ? rupees(runwayView.foodRoutine.food_daily_pace ?? 0) : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-raised/35 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Delivery</p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground tnum">
                      {!runwayView?.setupRequired ? runwayView?.foodRoutine?.delivery?.count ?? insights?.food?.delivery_count_30d ?? "—" : insights?.food?.delivery_count_30d ?? "—"}x
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  {routineMealSignalLine}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {examNeedsMealSignal && (
                    <Button size="sm" className="h-8 px-3 text-[11px] font-semibold" onClick={() => setShowCheckIn(true)}>
                      Check in
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive"
                    onClick={() => {
                      setShowFoodSheet(true);
                      setFoodTab("menus");
                    }}
                  >
                    Campus Food
                  </Button>
                </div>
              </div>
            </div>

            {/* Routine Signal Index Card */}
            <div id="card-wellness-index" className="hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-border" />

              {wellnessLoading ? (
                <div className="p-4 md:p-5 space-y-3">
                  <Skeleton className="h-5 w-1/4" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : wellnessError ? (
                <div className="p-4 md:p-5 rounded-xl border border-dashed border-destructive/20 bg-destructive/5">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider">Routine signals unavailable</p>
                  <p className="text-xs text-zinc-500 mt-1">We couldn't load your routine signals. Please try again later.</p>
                </div>
              ) : (txns ?? []).length === 0 ? (
                <div className="p-4 md:p-5 rounded-xl border border-dashed border-border bg-surface-raised/40 text-center">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">No Transaction History</p>
                  <p className="text-xs text-zinc-500 mt-1">Add a few spends to build your routine pattern.</p>
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
              ) : (
                (wellnessIsSteady && !isWellnessExpanded) ? (
                  <div
                    className="p-4 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
                    onClick={() => setIsWellnessExpanded(true)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[var(--pb-green)] shrink-0" />
                      <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase font-mono shrink-0">Routine Signal Index:</p>
                      <span className="text-sm font-black text-[var(--pb-green)] tnum shrink-0">{wellness.score}</span>
                      <Badge variant="outline" className="font-bold text-[9px] px-1.5 py-0 tracking-wider uppercase bg-[rgba(22,163,74,0.05)] border-[rgba(22,163,74,0.3)] text-[var(--pb-green)] shrink-0">
                        Steady
                      </Badge>
                      <span className="text-xs text-zinc-400 font-medium truncate hidden sm:inline ml-2">
                        {wellness.message || "Your spending and meal signals are currently steady and within today's runway targets."}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
                      <span className="text-[10px] uppercase font-bold tracking-widest font-mono hidden sm:inline">Details</span>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                ) : (
                  <div className="p-5 md:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-border/40 pb-3">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase font-mono">
                          Routine Signal Index
                        </p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl md:text-4xl font-black tracking-tighter text-foreground tnum leading-none font-display" style={{
                            color: wellnessToneColor
                          }}>{wellness.score}</span>
                          <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest font-mono">/ 100 Routine Score</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-bold text-xs px-2.5 py-1 tracking-wider uppercase" style={{
                          borderColor: wellnessToneBorder,
                          color: wellnessToneColor,
                          background: wellnessToneBackground
                        }}>
                          {wellnessIsSteady ? "STEADY" : wellnessIsWatch ? "WATCH" : "NEEDS ATTENTION"}
                        </Badge>

                        {wellnessIsSteady && (
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
                      {wellness.message || "Several routine signals are stacked today. PocketBuddy only uses spends and check-ins here; start with one meal signal and one planned spend decision."}
                    </p>

                    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-raised/25 px-3 py-2 text-[11px] font-semibold text-zinc-500">
                      <Utensils className="h-3.5 w-3.5 text-zinc-400" />
                      <span>{routineMealSignalLine}</span>
                    </div>

                    <div className="border-t border-border/40 pt-3 mt-1 mb-3">
                      <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-2.5 font-mono">Contributing Signals</p>

                      <div className="flex flex-wrap gap-2">
                        {wellness.signals?.map((sig: any) => (
                          <div key={sig.key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-surface-raised/20 text-xs font-medium" style={{
                            borderColor: isAttentionSignal(sig.severity)
                              ? "rgba(239,68,68,0.25)"
                              : sig.severity === "watch"
                                ? "rgba(245,158,11,0.25)"
                                : "var(--border)"
                          }} title={sig.detail}>
                            <span className="text-zinc-400">{sig.label}:</span>
                            <span className="font-bold text-foreground">{sig.value}</span>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{
                              background: isAttentionSignal(sig.severity)
                                ? "var(--pb-red)"
                                : sig.severity === "watch"
                                  ? "var(--pb-amber)"
                                  : "var(--pb-green)"
                            }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {!wellnessIsSteady && (
                      <div className="border-t border-border/40 pt-3 space-y-2">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <span className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-1 sm:mb-0 sm:mr-2 font-mono">
                            {wellnessPrimaryAction?.title ? `${wellnessPrimaryAction.title}:` : "Next actions:"}
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                            <button
                              id="btn-wellness-meal-checkin"
                              type="button"
                              onClick={() => setShowCheckIn(true)}
                              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider border rounded-lg transition-all cursor-pointer ${
                                isPrimaryWellnessAction("checkin")
                                  ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                                  : "text-foreground bg-surface-raised hover:bg-surface-interactive border-border"
                              }`}
                            >
                              Meal Check-in
                            </button>
                            <button
                              id="btn-wellness-food-guard"
                              type="button"
                              onClick={() => { setShowFoodSheet(true); setFoodTab("menus"); }}
                              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider border rounded-lg transition-all cursor-pointer ${
                                isPrimaryWellnessAction("food")
                                  ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                                  : "text-foreground bg-surface-raised hover:bg-surface-interactive border-border"
                              }`}
                            >
                              Campus Food
                            </button>
                            <Link
                              id="btn-wellness-runway"
                              to="/runway"
                              className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center border ${
                                isPrimaryWellnessAction("runway")
                                  ? "text-primary-foreground bg-primary border-primary hover:bg-primary/90"
                                  : "text-foreground bg-surface-raised border-border hover:bg-surface-interactive"
                              }`}
                            >
                              Review Runway
                            </Link>
                          </div>
                        </div>
                        {wellnessPrimaryAction?.detail && wellnessPrimaryAction.detail !== wellness.message && (
                          <p className="text-[11px] leading-relaxed text-zinc-500">
                            {wellnessPrimaryAction.detail}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            {/* Runway summary */}
            <div id="card-runway-status" className="hidden">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Timer className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-bold tracking-[0.18em] text-zinc-500 uppercase">Runway</p>
                    {runwayView && (
                      <Badge variant="outline" className={`${runwayStatusClass} font-semibold text-[10px] uppercase tracking-wider px-2 py-0.5`}>
                        {runwayStatusLabel}
                      </Badge>
                    )}
                  </div>
                  {!runwayView ? (
                    <Skeleton className="mt-3 h-8 w-44" />
                  ) : runwayView.setupRequired ? (
                    <>
                      <p className="mt-2 text-sm font-semibold text-foreground">Allowance setup needed</p>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        {runwayView.setupReason ?? "Add allowance to activate safe/day guidance."}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Expected</p>
                          <p className="text-3xl font-semibold leading-none text-foreground tnum">
                            <CountUp to={runwayView.expectedDays} /> <span className="text-sm text-muted-foreground">days</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Safe/day</p>
                          <p className="text-lg font-semibold text-foreground tnum">{rupees(runwayView.safeDailyPaise)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Stress case</p>
                          <p className="text-lg font-semibold text-foreground tnum">{runwayView.stressDays} days</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Risk</p>
                          <p className="text-lg font-semibold text-foreground tnum">{Math.round((runwayView.shortfallProbability ?? 0) * 100)}%</p>
                        </div>
                      </div>
                      <div className="mt-3 max-w-xl">
                        <Progress id="progress-runway" value={runwayView.pct} className="h-1 bg-surface-raised" />
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                          <span><span className="font-semibold text-foreground">{runwayView.pct}%</span> spent</span>
                          <span>Balance <span className="font-semibold text-foreground">{rupees(runwayView.remainingPaise)}</span></span>
                          <span>Reset in {runwayView.daysLeft}d{runwayView.cycleEnd ? ` · ${shortDate(runwayView.cycleEnd)}` : ""}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
                  {runwayView?.setupRequired ? (
                    <Link to="/settings" className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive">
                      Open Settings
                    </Link>
                  ) : (
                    <Link to="/runway" className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive">
                      Open Runway
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="order-4 rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Quick stats</p>
                  <p className="mt-1 text-xs text-muted-foreground">One glance at pace, category, food, and late spends.</p>
                </div>
                <Link to="/transactions" className="inline-flex h-8 w-fit items-center justify-center rounded-lg border border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive">
                  View Transactions
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {quickStats.map((item) => (
                  <div key={item.label} className="min-w-0 rounded-xl border border-border bg-surface-raised/35 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
                    <p className="mt-1 truncate text-sm font-semibold capitalize text-foreground tnum">{item.value}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
              {insights?.daily_spend_7d ? (
                <div className="mt-4 rounded-xl border border-border bg-surface-raised/25 p-3">
                  <SpendBar days={insights.daily_spend_7d} />
                </div>
              ) : null}
            </div>

            {/* ── Food & Routine Strip ─────────────────────────────────── */}
            <div className="hidden">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Food & Routine</p>
                    <button
                      onClick={() => { setShowFoodSheet(true); setFoodTab("menus"); }}
                      className="text-xs font-bold text-primary hover:underline uppercase tracking-wider cursor-pointer bg-primary/10 px-2.5 py-0.5 rounded border border-primary/20"
                    >
                      Campus Food
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                    Meal check-ins, food payments, delivery, and subscriptions all feed today's runway.
                  </p>
                </div>
                {runwayView?.foodRoutine?.label && !runwayView?.setupRequired && (
                  <Badge variant="outline" className="w-fit border-border bg-surface-raised text-[10px] md:text-xs uppercase tracking-wider font-black">
                    {runwayView.foodRoutine.label}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Food gap */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider font-bold">Meal signal</p>
                  {insights ? (
                    <p
                      className={`text-[16px] font-black tnum ${
                        insights.food.last_signal_source
                          ? insights.food.gap_hours > 12
                            ? "text-destructive"
                            : insights.food.gap_hours > 6
                              ? "text-warning"
                              : "text-success"
                          : "text-zinc-400"
                      }`}
                    >
                      {formatMealGapHours(
                        insights.food.last_signal_source ? insights.food.gap_hours : null,
                      )}
                    </p>
                  ) : (
                    <p className="text-[16px] font-black text-zinc-400">
                      {formatMealGapHours(hasFoodGapSignal ? foodGapHours : null)}
                    </p>
                  )}
                  <p className="text-xs text-zinc-500">
                    {insights?.food?.last_signal_source === "checkin"
                      ? "from check-in"
                      : insights?.food?.last_signal_source === "transaction"
                        ? "from payment"
                        : "payment/check-in"}
                  </p>
                </div>

                {/* Delivery vs mess */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider font-bold">Delivery</p>
                  <p className="text-[16px] font-black text-foreground">
                    {!runwayView?.setupRequired ? runwayView?.foodRoutine?.delivery?.count ?? insights?.food?.delivery_count_30d ?? "—" : insights?.food?.delivery_count_30d ?? "—"}×
                  </p>
                  <p className="text-xs text-zinc-500">
                    {runwayView?.foodRoutine && !runwayView?.setupRequired ? `${rupees(runwayView.foodRoutine.food_daily_pace ?? 0)}/day food pace` : `vs ${insights?.food?.mess_count_30d ?? "—"} mess visits`}
                  </p>
                </div>

                {/* Late night */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider font-bold">After-hours</p>
                  <p className="text-[16px] font-black text-foreground tnum">
                    {insights ? rupees(insights.late_night.total_paise) : "—"}
                  </p>
                  <p className="text-xs text-zinc-500">{insights?.late_night?.txn_count ?? 0} payments, 11PM-5AM campus time</p>
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
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-2">Routine meals vs delivery (30d)</p>
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
                    <span className="text-[10px] md:text-xs text-success font-bold">Routine {insights.food.mess_count_30d}</span>
                    <span className="text-[10px] md:text-xs text-warning font-bold">Delivery {insights.food.delivery_count_30d}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Active Pools */}
            {activeDashboardPools.length > 0 && (
            <section id="section-active-pools" className="order-2 space-y-4 pt-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Active Pools</h3>
                <Link
                  to="/pool"
                  id="btn-new-pool-dash"
                  className="text-[10px] md:text-xs font-bold text-foreground bg-surface-raised border border-border hover:bg-surface-interactive transition-all px-3.5 py-1.5 rounded-full uppercase tracking-wider cursor-pointer"
                >
                  + New Pool
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeDashboardPools.map((p) => {
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
                        <Card className="bg-surface relative overflow-hidden border border-border p-5 transition-all duration-200 hover:border-foreground/15 hover:bg-surface-raised h-full flex flex-col justify-between hover:shadow-md">
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <PlatformIcon platform={p.platform} name={p.platform_display_label || p.platform.replace("_", " ")} className="h-5 w-5" />
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground truncate max-w-[120px] sm:max-w-none">{p.platform_display_label || p.platform.replace("_", " ")}</span>
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
                              <span className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-[0.12em]">Cart</span>
                              <span className="text-xs font-semibold text-foreground">
                                {rupees(total)}
                                {p.status === "open" && (
                                  <span className="text-muted-foreground font-normal text-[10px] md:text-xs"> / {rupees(p.min_cart_value)} min</span>
                                )}
                              </span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-[0.12em]">
                                {p.status === "completed" ? "Your Split" : "Split Est."}
                              </span>
                              <span className="text-xs font-semibold text-success">
                                {p.status === "completed" && rSummary
                                  ? rupees(rSummary.myOwed || (total / (Object.keys(p.split_breakdown ?? {}).length || 1)))
                                  : rupees(perPerson)}
                                <span className="text-muted-foreground font-normal text-[10px] md:text-xs">
                                  {p.status === "completed" ? "" : " / person"}
                                </span>
                              </span>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
              </div>
            </section>
            )}
          </div>

          {/* ── Sidebar ─────────────────────────────────────────────────── */}
          <div className="md:col-span-5 lg:col-span-4 space-y-5">

            {/* ── Wing Netting & Suggested Settlements ─────────────────── */}
            {nettedBalances && (nettedBalances.balances?.you_owe?.length > 0 || nettedBalances.balances?.owes_you?.length > 0 || nettedBalances.suggested_settlements?.length > 0) && (
              <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden transition-colors duration-200 hover:border-foreground/15">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-success" />
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <p className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Wing Netting & Settlements</p>
                  <span className="text-[10px] md:text-xs font-semibold px-2 py-0.5 rounded-full border text-success border-success/20 bg-success/5 uppercase tracking-[0.12em]">
                    Netted active
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Nishant owes others (you_owe) */}
                  {nettedBalances.balances?.you_owe?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] md:text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">You Owe</p>
                      <div className="space-y-1.5">
                        {nettedBalances.balances.you_owe.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between bg-surface-raised/40 px-3 py-2 rounded-lg text-xs border border-border">
                            <span className="font-semibold text-foreground">{item.name}</span>
                            <span className="font-semibold text-destructive tnum">{rupees(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Others owe Nishant (owes_you) */}
                  {nettedBalances.balances?.owes_you?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] md:text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em]">Owes You</p>
                      <div className="space-y-1.5">
                        {nettedBalances.balances.owes_you.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between bg-surface-raised/40 px-3 py-2 rounded-lg text-xs border border-border">
                            <span className="font-semibold text-foreground">{item.name}</span>
                            <span className="font-semibold text-success tnum">{rupees(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested settlements path */}
                  {nettedBalances.suggested_settlements?.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-border/60">
                      <p className="text-[11px] md:text-xs font-semibold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
                        <span>Optimized settlement plan</span>
                      </p>
                      <div className="space-y-1.5">
                        {nettedBalances.suggested_settlements.map((item: any, idx: number) => (
                          <p key={idx} className="text-xs text-muted-foreground bg-success/5 border border-success/10 px-3 py-2 rounded-lg font-medium leading-relaxed">
                            {item.text}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Interactive Student Allocation Planner ─────────────────── */}

            {/* ── AI Campus Intelligence (Bedrock) ──────────────────── */}
            <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 relative overflow-hidden">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-lg border border-border bg-background/50 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Campus Intelligence</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">One grounded next step for today.</p>
                  </div>
                </div>
                {campusIntel?.source === "bedrock" && (
                  <span className="shrink-0 text-[10px] md:text-xs font-black text-primary uppercase tracking-wider border border-primary/30 px-1.5 py-0.5 rounded-md">
                    Bedrock
                  </span>
                )}
              </div>
              {campusIntelHeadline || campusIntelBodyText ? (
                <div>
                  {showCampusIntelHeadline && (
                    <h3 className="text-base font-semibold text-foreground leading-snug">{campusIntelHeadline}</h3>
                  )}
                  {campusIntelBodyText && (
                    <p className={showCampusIntelHeadline ? "mt-2 text-sm text-foreground/90 leading-relaxed" : "text-sm text-foreground/90 leading-relaxed"}>
                      {campusIntelBodyText}
                    </p>
                  )}
                  {showCampusIntelWhy && (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{campusIntelWhy}</p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
                    <div className="rounded-xl border border-border bg-surface-raised/35 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">7-day spend</p>
                      <p className="mt-1 text-sm font-semibold text-foreground tnum">
                        {campusIntel.spend_7d != null ? rupees(Math.round(Number(campusIntel.spend_7d) * 100)) : "-"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-raised/35 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Last meal</p>
                      <p className="mt-1 text-sm font-semibold text-foreground tnum">
                        {Number(campusIntel.last_food_hours ?? 0) > 0 ? `${Math.round(Number(campusIntel.last_food_hours))}h ago` : "No signal"}
                      </p>
                    </div>
                  </div>

                  {campusIntel.food_option && (
                    <div className="mt-4 rounded-xl border border-border bg-surface-raised/40 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Campus food option</p>
                          <p className="mt-1 truncate text-sm font-semibold text-foreground">
                            {campusIntel.food_option.item} · {campusIntel.food_option.venue}
                          </p>
                          {campusIntel.food_option.reason && (
                            <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{campusIntel.food_option.reason}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 sm:shrink-0">
                          <span className="text-sm font-semibold text-foreground tnum">₹{campusIntel.food_option.price_rs}</span>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 min-w-[78px] gap-1 border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground shadow-sm hover:border-foreground/15 hover:bg-surface-interactive"
                            onClick={() => { setShowFoodSheet(true); setFoodTab("menus"); }}
                          >
                            Food
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              )}
            </div>

            {/* ── Campus Fare Guard (Travel Savings) ────────────────── */}
            <div className="hidden">
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
                <p className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Wing Activity</p>
                <span className="flex items-center gap-1.5 text-[10px] md:text-xs text-muted-foreground font-semibold">
                  <span className={`w-1.5 h-1.5 rounded-full ${wingEvents.length ? "bg-success animate-pulse" : "bg-muted-foreground/40"}`} />
                  {wingEvents.length ? "Live" : "No Live Events"}
                </span>
              </div>
              <div className="space-y-3">
                {wingEvents.length ? (
                  wingEvents.map((ev: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 animate-[fadeIn_0.4s_ease-out]" style={{ animationDelay: `${i * 80}ms` }}>
                      <span className="shrink-0 mt-0.5 text-muted-foreground">
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
                        <p className="text-xs text-foreground leading-snug">{ev.text}</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 font-semibold">
                          {ev.mins_ago === 0 ? "just now" : ev.mins_ago < 60 ? `${ev.mins_ago}m ago` : `${Math.floor(ev.mins_ago / 60)}h ago`}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-surface-raised/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">No wing activity yet</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Start a cart pool, identify a merchant, or check in from the dashboard to populate this feed.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Collisions */}
            {collisions.length > 0 && (
              <section id="section-collisions" className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-3.5 bg-destructive rounded-full" />
                  <h3 className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Budget Collisions</h3>
                </div>
                <Card className="bg-surface border-border p-4 space-y-4">
                  {collisions.length > 1 && (
                    <div className="relative overflow-hidden bg-destructive/5 border border-destructive/15 rounded-xl p-4 text-xs shadow-sm">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-destructive/10 rounded-full blur-xl pointer-events-none" />
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-bold tracking-wider text-xs text-destructive uppercase">Cumulative Debit Impact</p>
                          <p className="font-medium text-muted-foreground leading-relaxed">
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
                              <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded border ${brandColorClass}`}>
                                {c.service_name ?? c.name}
                              </span>
                              {c.detected_from === "auto_detected" && (
                                <Badge className="bg-surface-raised text-muted-foreground border border-border text-[9px] font-semibold px-1.5 py-0 uppercase tracking-[0.12em]">
                                  Auto
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-destructive tnum flex items-center gap-0.5">
                              <span>−</span>
                              <span>{rupees(c.amount)}</span>
                            </p>
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{shortDate(new Date(c.next_debit_date))}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span>Limit:</span>
                              <span className="text-foreground font-semibold tnum">{rupees(c.newLimit * 100)}</span>
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
                <h3 className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">Recent Ledger</h3>
                <Link to="/transactions" id="link-see-all-txns" className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                  See all →
                </Link>
              </div>
              <Card className="bg-surface border-border p-1 overflow-hidden">
                {!txns ? (
                  <div className="p-4"><Skeleton className="h-32 w-full border-none" /></div>
                ) : recent.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground font-semibold uppercase tracking-[0.12em]">No transactions logged</p>
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
                          <p className={`text-xs font-semibold truncate ${t.is_mapped ? "text-foreground" : "text-muted-foreground italic"}`}>
                            {t.mapped_merchant_name ?? t.raw_merchant_string}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            {t.category && (
                              <span className="text-[10px] md:text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t.category}</span>
                            )}
                            {trustLabel && (
                              <span className={`text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.12em] border px-1.5 py-0.5 rounded ${transactionTrustClass(trustLabel)}`}>
                                {trustLabel}
                              </span>
                            )}
                            {!t.is_mapped && (
                              <button
                                id={`btn-identify-${t.id}`}
                                onClick={() => setIdentifying(t)}
                                className="ml-1 rounded-full px-3 py-1 text-[11px] md:text-xs font-semibold bg-surface-raised border border-border hover:bg-surface-interactive hover:border-foreground/15 transition-colors cursor-pointer uppercase text-foreground"
                              >
                                Identify?
                              </button>
                            )}
                            <button
                              id={`btn-edit-ledger-${t.id}`}
                              onClick={() => setEditingTxn(t)}
                              className="ml-1 rounded-full px-3 py-1 text-[11px] md:text-xs font-semibold bg-surface-raised border border-border hover:bg-surface-interactive hover:border-foreground/15 transition-colors cursor-pointer uppercase text-foreground"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-semibold text-foreground tnum">{rupees(t.amount)}</p>
                          <p className="text-[10px] md:text-xs text-muted-foreground font-semibold mt-0.5">{relativeTime(t.created_at)}</p>
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
                        const safeBudgetLimit = insights?.safe_daily_limit_paise ?? (!runwayView?.setupRequired ? runwayView?.safeDailyPaise : undefined);
                        const isSafeBudget = typeof safeBudgetLimit === "number" && safeBudgetLimit > 0 ? it.price <= safeBudgetLimit : null;
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
                              ? `Meal gap: ${formatMealGapHours(insights.food.gap_hours, { includeAgo: false })}`
                              : `Last meal ${formatMealGapHours(insights?.food?.gap_hours)}`;
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
                              {isSafeBudget !== null && (
                                <span className="text-xs px-2 py-0.5 rounded bg-surface-raised text-zinc-400 font-semibold flex items-center gap-1">
                                  <span className={`h-1.5 w-1.5 rounded-full ${isSafeBudget ? "bg-success" : "bg-destructive"}`} />
                                  {isSafeBudget ? "Within today's food budget" : "Over daily safe budget"}
                                </span>
                              )}
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
                              {insights?.food?.last_signal_source && (
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
                  <label className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Menu Photo / PDF (Max 5MB)</label>
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border border-dashed border-border rounded-xl cursor-pointer bg-surface hover:bg-surface-raised transition-all">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <ShoppingBag className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-xs text-zinc-300 font-semibold">
                          {scanFile ? scanFile.name : "Select or Drop Menu Photo"}
                        </p>
                        <p className="text-[10px] md:text-xs text-zinc-500 mt-1">PNG, JPG, JPEG or PDF up to 5MB</p>
                      </div>
                      <input
                        type="file"
                        accept="image/*,application/pdf,.pdf"
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
        <Dialog
          open={showCheckIn}
          onOpenChange={(open) => {
            if (!open) {
              handleCheckInRemindLater(false);
              return;
            }
            setShowCheckIn(true);
          }}
        >
          <DialogContent id="dialog-checkin" className="max-w-md max-h-[85vh] overflow-y-auto bg-surface border border-border p-4 sm:p-5 rounded-2xl">
            <DialogHeader className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Utensils className="h-4 w-4" />
                <span className="text-[11px] font-medium">Food Guard</span>
              </div>
              <DialogTitle className="text-sm md:text-base font-semibold text-foreground">
                Did you eat without a payment?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                {checkInMealSignalLine} Use this only for mess, cooked food, home food, or cash. No expense is added.
              </p>

              <div className="space-y-2 mt-3">
                <div className="rounded-xl border border-border bg-surface-raised/40 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">I already ate</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Select where the meal came from.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {[
                      ["mess", "Mess"],
                      ["cooked", "Cooked"],
                      ["home", "Home"],
                      ["outside_cash", "Cash / outside"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        disabled={Boolean(checkInSaving)}
                        onClick={() => setCheckInMealSource(value as typeof checkInMealSource)}
                        className={`h-8 rounded-lg border px-2 text-[11px] font-medium transition-all ${
                          checkInMealSource === value
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-surface text-zinc-400 hover:text-foreground hover:bg-surface-interactive"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    id="btn-checkin-ate"
                    onClick={handleCheckInAte}
                    disabled={Boolean(checkInSaving) || !checkInMealSource}
                    className="w-full h-9 rounded-lg border border-foreground bg-foreground text-background text-xs font-medium hover:bg-foreground/90 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {checkInSaving === "ate" ? "Saving..." : "Save meal check-in"}
                  </button>
                </div>

                <div className="rounded-xl border border-border bg-surface-raised/30 p-3.5">
                  <button
                    id="btn-checkin-skipped"
                    onClick={() => setCheckInExpanded(true)}
                    className="w-full flex items-center justify-between text-left text-xs font-semibold text-foreground cursor-pointer"
                  >
                    <span>I have not eaten yet</span>
                    <span className="text-[10px] text-zinc-500">Optional note</span>
                  </button>
                  {checkInExpanded && (
                    <div className="mt-3 space-y-2.5 animate-[fadeIn_0.15s_ease-out]">
                      <div className="flex flex-wrap gap-1.5">
                        {CHECKIN_NOTE_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            disabled={Boolean(checkInSaving)}
                            onClick={() => setCheckInNote(preset)}
                            className={`rounded-md border px-2.5 py-1 text-[10px] transition-colors ${
                              checkInNote === preset
                                ? "border-foreground bg-foreground text-background"
                                : "border-border bg-surface text-zinc-500 hover:text-foreground"
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <Input
                        id="input-checkin-note"
                        value={checkInNote}
                        onChange={(e) => setCheckInNote(e.target.value)}
                        placeholder="e.g. mess closed, exam prep, cash issue"
                        className="bg-surface border-border text-xs h-9 text-foreground"
                      />
                      <Button
                        id="btn-submit-checkin-skipped"
                        className="w-full bg-surface border border-border text-foreground hover:bg-surface-interactive text-xs font-medium h-9"
                        onClick={handleCheckInSkipped}
                        disabled={Boolean(checkInSaving)}
                      >
                        {checkInSaving === "skipped" ? "Saving..." : "Log delayed meal"}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full border-zinc-300 bg-surface-raised text-xs font-medium text-foreground hover:bg-surface-interactive dark:border-zinc-700"
                    onClick={() => handleCheckInStopAsking()}
                    disabled={Boolean(checkInSaving)}
                  >
                    <BellOff className="mr-1.5 h-3.5 w-3.5" />
                    Stop asking
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full border-zinc-300 bg-surface text-xs font-medium text-foreground hover:bg-surface-interactive dark:border-zinc-700"
                    onClick={() => handleCheckInRemindLater(true)}
                    disabled={Boolean(checkInSaving)}
                  >
                    <Clock3 className="mr-1.5 h-3.5 w-3.5" />
                    Remind me later
                  </Button>
                </div>
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
