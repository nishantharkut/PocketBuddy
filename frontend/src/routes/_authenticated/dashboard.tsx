import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  Plus, ChevronRight, AlertTriangle, Users, Utensils, ShoppingBag,
  Bus, Receipt, MoreHorizontal, Wallet, Timer, MessageSquare, Phone, Mail, MapPin, ExternalLink, Compass, TrendingDown,
  ShieldCheck, Sparkles, Image, ZoomIn, ZoomOut, Maximize2, Home, Flame
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
  updateTransaction,
  getCatalog,
  addCatalogItem,
  getTravelSavings,
  scanMenuPhoto,
  verifyCampusFoodItem,
  editFoodItem,
  getVenuePhoto,
  createCampusFoodItem,
  scanReceiptScreenshot,
  getCommunityQuizzes,
  submitQuizResponse,
  submitParserCorrection,
  getWingNettedBalances,
} from "@/lib/api/db.functions";


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

function UnlabelledPaymentPrompt({ txns, foods, qc }: { txns: any[]; foods: any[]; qc: any }) {
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [labelVal, setLabelVal] = useState("");

  const targetTxn = useMemo(() => {
    if (!txns?.length) return null;
    return txns.find(
      (t) =>
        t.category === "food" &&
        (t.amount === 1500 || t.amount === 3000 || t.amount === 4500 || t.amount === 6000)
    );
  }, [txns]);

  if (confirmed || !targetTxn) return null;

  const displayPrice = rupees(targetTxn.amount);
  const merchantName = targetTxn.mapped_merchant_name || targetTxn.raw_merchant_string || "Campus Canteen";

  const handleConfirm = () => {
    setConfirmed(true);
    toast.success(`Marked ${displayPrice} at ${merchantName} for review.`);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!labelVal.trim()) return;
    setConfirmed(true);
    setEditing(false);
    toast.success(`Saved "${labelVal.trim()}" at ${displayPrice} for review.`);
  };

  return (
    <div className="rounded-xl border border-border bg-surface-raised/30 p-3 space-y-2.5 animate-[fadeIn_0.3s_ease-out]">
      <div className="text-muted-foreground font-bold text-[10px] uppercase tracking-wider">
        Payment to review
      </div>
      
      {!editing ? (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">
            You paid <strong className="text-foreground">{displayPrice}</strong> at <strong className="text-foreground">{merchantName}</strong> recently. Was this for <strong className="text-primary">Masala Maggi</strong>?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-wider cursor-pointer"
            >
              Yes, confirm
            </button>
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface-raised/80 text-zinc-400 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
            >
              No, label it
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleCustomSubmit} className="space-y-2">
          <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">
            Label this <strong className="text-foreground">{displayPrice}</strong> payment at <strong className="text-foreground">{merchantName}</strong>:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              required
              value={labelVal}
              onChange={(e) => setLabelVal(e.target.value)}
              placeholder="e.g. Egg Paratha, Chai & Samosa"
              className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="px-3 py-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-primary/90 cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
      )}
    </div>
  );
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

function SpendingSmartCheck({ 
  calc, 
  insights, 
  profile, 
  foods, 
  txns 
}: { 
  calc: any; 
  insights: any; 
  profile: any; 
  foods: any; 
  txns: any; 
}) {
  const nav = useNavigate();
  const [selectedOption, setSelectedOption] = useState<null | "delivery" | "secondary" | "primary">(null);

  // Detect default segment from profile data
  const defaultSegment = useMemo(() => {
    if (profile?.mess_enrolled) return "hostel";
    const hostelBlock = (profile?.hostel_block || "").toLowerCase();
    if (hostelBlock.includes("pg") || hostelBlock.includes("paying guest") || hostelBlock.includes("flat") || hostelBlock.includes("rented")) {
      return "pg";
    }
    if (hostelBlock === "none" || hostelBlock === "day scholar" || hostelBlock === "commuter") {
      return "day";
    }
    return "hostel"; // Fallback default
  }, [profile]);

  const [segment, setSegment] = useState<"hostel" | "pg" | "day">(defaultSegment);
  const safeDaily = calc?.safeDailyLimit ?? 200;

  // PG Fridge Roulette state
  const [fridgeEggs, setFridgeEggs] = useState(false);
  const [fridgeBread, setFridgeBread] = useState(false);
  const [fridgeMaggi, setFridgeMaggi] = useState(false);
  const [fridgeVeggies, setFridgeVeggies] = useState(false);

  // Day Scholar Commute & Chai state
  const [commuteMode, setCommuteMode] = useState<"metro" | "pool" | "solo">("metro");
  const [chaiType, setChaiType] = useState<"tapri" | "cafe">("tapri");

  // Reset selection when tab changes
  useEffect(() => {
    setSelectedOption(null);
  }, [segment]);

  // Dynamic Averages
  const canteenCost = useMemo(() => {
    if (foods && foods.length > 0) {
      const activeItems = foods.filter((f: any) => f.status === "active");
      if (activeItems.length > 0) {
        return Math.round(activeItems.reduce((sum: number, f: any) => sum + f.price, 0) / activeItems.length / 100);
      }
    }
    return 100;
  }, [foods]);

  const deliveryCost = useMemo(() => {
    const delivTxns = (txns ?? []).filter((t: any) => {
      const name = (t.raw_merchant_string || t.mapped_merchant_name || "").toLowerCase();
      return name.includes("zomato") || name.includes("swiggy") || name.includes("ubereats") || name.includes("delivery");
    });
    if (delivTxns.length > 0) {
      return Math.round(delivTxns.reduce((sum: number, t: any) => sum + t.amount, 0) / delivTxns.length / 100);
    }
    return 250;
  }, [txns]);

  const pgCookingCost = useMemo(() => {
    const groceryTxns = (txns ?? []).filter((t: any) => t.category === "groceries");
    if (groceryTxns.length > 0) {
      const avgGrocerySpend = groceryTxns.reduce((sum: number, t: any) => sum + t.amount, 0) / groceryTxns.length / 100;
      return Math.max(35, Math.round(avgGrocerySpend / 10));
    }
    return 60;
  }, [txns]);

  const messMealCost = useMemo(() => {
    if (profile?.mess_enrolled) {
      if (profile.mess_billing_model === "per_meal" && profile.mess_per_meal_cost) {
        return Math.round(profile.mess_per_meal_cost / 100);
      }
      return 0; // Prepaid
    }
    return 0;
  }, [profile]);

  // PG Fridge Roulette Recipe Logic
  const rouletteRecipe = useMemo(() => {
    const activeCount = [fridgeEggs, fridgeBread, fridgeMaggi, fridgeVeggies].filter(Boolean).length;
    if (activeCount === 0) {
      return { recipe: "Empty fridge? Tap to order groceries in bulk.", cost: deliveryCost, savings: 0, isDelivery: true };
    }
    
    let recipeName = "";
    let estimatedCost = 25; // base condiments
    
    if (fridgeMaggi && fridgeVeggies) {
      recipeName = "Street-style Veggie Masala Maggi";
      estimatedCost += 20;
    } else if (fridgeEggs && fridgeBread) {
      recipeName = "Classic Egg Toast / French Toast";
      estimatedCost += 30;
    } else if (fridgeMaggi) {
      recipeName = "Classic Cheese/Spicy Dry Maggi";
      estimatedCost += 15;
    } else if (fridgeEggs) {
      recipeName = "Spicy Egg Bhurji scrambled";
      estimatedCost += 20;
    } else if (fridgeBread) {
      recipeName = "Crispy Garlic Butter Toast";
      estimatedCost += 10;
    } else if (fridgeVeggies) {
      recipeName = "Stir-fry Healthy Veggies";
      estimatedCost += 25;
    }

    const savings = Math.max(0, deliveryCost - estimatedCost);
    return {
      recipe: recipeName,
      cost: estimatedCost,
      savings,
      isDelivery: false
    };
  }, [fridgeEggs, fridgeBread, fridgeMaggi, fridgeVeggies, deliveryCost]);

  // Day Scholar calculations
  const dayScholarCosts = useMemo(() => {
    const commuteCosts = { metro: 30, pool: 80, solo: 220 };
    const chaiCosts = { tapri: 15, cafe: 110 };
    
    const total = commuteCosts[commuteMode] + chaiCosts[chaiType];
    const bestPotential = commuteCosts["metro"] + chaiCosts["tapri"];
    const savings = Math.max(0, total - bestPotential);
    
    return { total, savings };
  }, [commuteMode, chaiType]);

  // Apply savings to runway helper
  const handleApplySavings = (savingsAmount: number) => {
    const simulatedDaily = Math.max(20, Math.round(safeDaily - (savingsAmount / 7)));
    localStorage.setItem("pb_sandbox_simulated_daily_spend", simulatedDaily.toString());
    toast.success("Applied to Runway Flight Sandbox!");
    nav({ to: "/runway" });
  };

  // Map choices based on segment
  const choices = useMemo(() => {
    if (segment === "hostel") {
      return {
        delivery: { label: "Order Zomato / Swiggy", cost: deliveryCost, icon: ShoppingBag },
        secondary: { label: "Eat at Campus Canteen", cost: canteenCost, icon: Compass },
        primary: { label: "Eat at Hostel Mess", cost: messMealCost, icon: Utensils }
      };
    } else if (segment === "pg") {
      return {
        delivery: { label: "Order Zomato / Swiggy", cost: deliveryCost, icon: ShoppingBag },
        secondary: { label: "Eat at Campus Canteen", cost: canteenCost, icon: Compass },
        primary: { label: "Cook at PG", cost: pgCookingCost, icon: Flame }
      };
    } else {
      return {
        delivery: { label: "Order Zomato / Swiggy", cost: deliveryCost, icon: ShoppingBag },
        secondary: { label: "Eat at Campus Canteen", cost: canteenCost, icon: Compass },
        primary: { label: "Eat Home-Cooked Food", cost: 0, icon: Home }
      };
    }
  }, [segment, deliveryCost, canteenCost, pgCookingCost, messMealCost]);

  // Find a smart meal combo suggestion from their campus that fits under their daily budget limit
  const suggestedCombo = useMemo(() => {
    if (!foods || foods.length === 0) return null;
    const activeItems = foods.filter((f: any) => f.status === "active");
    if (activeItems.length === 0) return null;
    const sorted = [...activeItems].sort((a, b) => a.price - b.price);
    const foodItem = sorted.find((f: any) => f.category === "food" && (f.price / 100) < safeDaily * 0.7);
    const drinkItem = sorted.find((f: any) => 
      (f.category === "drink" || f.category === "beverage" || 
       f.item_name.toLowerCase().includes("chai") || f.item_name.toLowerCase().includes("tea") || 
       f.item_name.toLowerCase().includes("coffee")) && 
      (f.price / 100) < safeDaily * 0.25
    );
    if (foodItem) {
      return `${foodItem.item_name}${drinkItem ? ` + ${drinkItem.item_name}` : ""}`;
    }
    return sorted[0].item_name;
  }, [foods, safeDaily]);

  if (selectedOption) {
    const choice = choices[selectedOption];
    const diff = choice.cost - safeDaily;
    const isOver = diff > 0;
    const absDiff = Math.abs(diff);

    // Apply simulated savings to local storage when continuing to runway
    const handleApplyAndNav = () => {
      const savedDaily = isOver ? 0 : absDiff;
      const simulatedDaily = Math.max(20, safeDaily - savedDaily);
      localStorage.setItem("pb_sandbox_simulated_daily_spend", simulatedDaily.toString());
      toast.success("Applied to Runway Flight Sandbox!");
      nav({ to: "/runway" });
    };

    return (
      <Card className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden transition-all duration-300">
        <div className="absolute inset-0 pointer-events-none" style={{ 
          background: isOver 
            ? "radial-gradient(ellipse at top right, rgba(239,68,68,0.04), transparent 65%)" 
            : "radial-gradient(ellipse at top right, rgba(34,197,94,0.04), transparent 65%)"
        }} />
        
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black tracking-wider text-zinc-500 uppercase">
            Plan: {choice.label} (₹{choice.cost})
          </span>
          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
            isOver ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
          }`}>
            {isOver ? `₹${absDiff} Over Limit` : `₹${absDiff} Saved`}
          </span>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
            {isOver ? (
              <>
                Your delivery order is <strong className="text-red-400">₹{absDiff} above</strong> your daily safe limit of <strong className="text-foreground font-bold font-black">₹{safeDaily}</strong>. Doing this daily will slash your runway early!
              </>
            ) : (
              <>
                Great choice! This fits within your daily safe limit of <strong className="text-foreground font-bold font-black">₹{safeDaily}</strong>. You'll add <strong className="text-emerald-400">+{Math.max(1, Math.round(absDiff / (safeDaily || 1)))} days</strong> of runway extensions.
                {selectedOption === "secondary" && suggestedCombo && (
                  <span className="block mt-1.5 text-[11px] text-zinc-400 font-medium">
                    💡 Suggestion: Try ordering the <strong className="text-foreground">{suggestedCombo}</strong> from the campus menu to stay under budget!
                  </span>
                )}
              </>
            )}
          </p>

          <div className="flex gap-2">
            {selectedOption === "delivery" ? (
              <Link 
                to="/pool" 
                className="flex-1 h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center text-xs font-black uppercase tracking-wider transition-all active:scale-[0.98]"
              >
                Join Swiggy Pool
              </Link>
            ) : (
              <button 
                onClick={handleApplyAndNav}
                className="flex-1 h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center text-xs font-black uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
              >
                Check Runway
              </button>
            )}
            <button 
              onClick={() => setSelectedOption(null)} 
              className="px-4 h-9 rounded-xl bg-surface-raised border border-border text-zinc-400 hover:text-zinc-200 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              Change
            </button>
          </div>
        </div>
      </Card>
    );
  }

  const Icon1 = choices.delivery.icon;
  const Icon2 = choices.secondary.icon;
  const Icon3 = choices.primary.icon;

  return (
    <Card className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden space-y-4">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(255,107,0,0.03), transparent 65%)" }} />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="h-4.5 w-4.5 text-primary" />
          <p className="text-xs font-black tracking-[0.15em] text-zinc-400 uppercase">Tonight's Plan Optimizer</p>
        </div>
      </div>

      {/* Profile Selector tabs */}
      <div className="flex bg-surface-raised p-1 rounded-xl border border-border/60">
        <button
          type="button"
          onClick={() => setSegment("hostel")}
          className={`flex-1 text-center py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            segment === "hostel"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Hostel
        </button>
        <button
          type="button"
          onClick={() => setSegment("pg")}
          className={`flex-1 text-center py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            segment === "pg"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          PG
        </button>
        <button
          type="button"
          onClick={() => setSegment("day")}
          className={`flex-1 text-center py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            segment === "day"
              ? "bg-background text-foreground shadow-sm border border-border/60"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Day Scholar
        </button>
      </div>

      <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
        What's your plan for dinner tonight? Click an option to see the immediate effect on your Runway.
      </p>

      {/* HOSTEL FLOW */}
      {segment === "hostel" && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setSelectedOption("delivery")}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface-raised/40 hover:bg-surface hover:border-primary/40 transition-all text-xs font-bold text-foreground cursor-pointer group"
          >
            <span className="flex items-center gap-2.5">
              <Icon1 className="h-4 w-4 text-pb-red" />
              <span>{choices.delivery.label}</span>
            </span>
            <span className="font-mono text-zinc-400 group-hover:text-primary transition-colors font-medium">~₹{choices.delivery.cost}</span>
          </button>

          <button
            onClick={() => setSelectedOption("secondary")}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface-raised/40 hover:bg-surface hover:border-primary/40 transition-all text-xs font-bold text-foreground cursor-pointer group"
          >
            <span className="flex items-center gap-2.5">
              <Icon2 className="h-4 w-4 text-pb-amber" />
              <span>{choices.secondary.label}</span>
            </span>
            <span className="font-mono text-zinc-400 group-hover:text-primary transition-colors font-medium">~₹{choices.secondary.cost}</span>
          </button>

          <button
            onClick={() => setSelectedOption("primary")}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border bg-surface-raised/40 hover:bg-surface hover:border-primary/40 transition-all text-xs font-bold text-foreground cursor-pointer group"
          >
            <span className="flex items-center gap-2.5">
              <Icon3 className="h-4 w-4 text-pb-green" />
              <span>{choices.primary.label}</span>
            </span>
            <span className="font-mono text-zinc-400 group-hover:text-primary transition-colors font-medium font-bold">~₹{choices.primary.cost}</span>
          </button>
        </div>
      )}

      {/* PG RESIDENT FLOW (FRIDGE ROULETTE) */}
      {segment === "pg" && (
        <div className="space-y-3.5 animate-[fadeIn_0.2s_ease-out]">
          <div className="space-y-1">
            <p className="text-xs font-black text-primary tracking-wide uppercase">PG Fridge Roulette</p>
            <p className="text-[11px] text-zinc-400 font-medium">Select what is currently in your kitchen/fridge:</p>
          </div>

          {/* Ingredient Pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { name: "Eggs", active: fridgeEggs },
              { name: "Bread", active: fridgeBread },
              { name: "Maggi", active: fridgeMaggi },
              { name: "Veggies", active: fridgeVeggies }
            ].map(item => (
              <button
                key={item.name}
                type="button"
                onClick={() => {
                  if (item.name === "Eggs") setFridgeEggs(!fridgeEggs);
                  if (item.name === "Bread") setFridgeBread(!fridgeBread);
                  if (item.name === "Maggi") setFridgeMaggi(!fridgeMaggi);
                  if (item.name === "Veggies") setFridgeVeggies(!fridgeVeggies);
                }}
                className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  item.active 
                    ? "bg-primary/10 border-primary text-primary" 
                    : "bg-surface-raised/40 border-border text-zinc-500 hover:bg-surface-raised/80"
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>

          {/* Dynamic Recipe Card */}
          <div className="bg-surface-raised/35 border border-border/40 p-4 rounded-xl space-y-3">
            <div className="flex justify-between items-start text-xs gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block font-mono">SUGGESTED DISH</span>
                <span className="font-bold text-foreground truncate block mt-0.5 font-display">{rouletteRecipe.recipe}</span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block font-mono">EST. COST</span>
                <span className="font-mono font-bold text-foreground mt-0.5 block">₹{rouletteRecipe.cost}</span>
              </div>
            </div>

            {!rouletteRecipe.isDelivery ? (
              <>
                <p className="text-[11px] text-zinc-400 leading-normal font-medium">
                  Cooking this will save you <strong className="text-emerald-400">₹{rouletteRecipe.savings}</strong> over food delivery. It extends your runway by <strong>+{Math.max(1, Math.round(rouletteRecipe.savings / (safeDaily || 1)))} days</strong>.
                </p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleApplySavings(rouletteRecipe.savings * 5)}
                    className="flex-1 h-8 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black uppercase tracking-wider cursor-pointer"
                  >
                    Lock In Savings
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <Link
                  to="/pool"
                  className="flex-1 h-8 rounded-xl bg-surface-raised border border-border text-zinc-300 hover:text-foreground text-xs font-bold uppercase transition-all cursor-pointer flex items-center justify-center"
                >
                  Order Grocery Restock
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DAY SCHOLAR SEGMENT FLOW (COMMUTE & CHAI POOL) */}
      {segment === "day" && (
        <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="space-y-3">
            <div>
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1.5 font-mono">1. Select Today's Commute</span>
              <div className="grid grid-cols-3 gap-1.5 bg-surface-raised p-0.5 rounded-lg border border-border/50">
                {[
                  { key: "metro", label: "Metro/Bus", sub: "₹30" },
                  { key: "pool", label: "Pool Cab", sub: "₹80" },
                  { key: "solo", label: "Solo Cab", sub: "₹220" }
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setCommuteMode(item.key as any)}
                    className={`py-1.5 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                      commuteMode === item.key 
                        ? "bg-background text-foreground shadow border border-border/50" 
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <span className="block">{item.label}</span>
                    <span className="block text-[8px] font-mono text-zinc-400 mt-0.5">{item.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1.5 font-mono">2. Select Campus Drink Hangout</span>
              <div className="grid grid-cols-2 gap-1.5 bg-surface-raised p-0.5 rounded-lg border border-border/50">
                {[
                  { key: "tapri", label: "Tapri Chai", sub: "₹15" },
                  { key: "cafe", label: "Cafe Coffee", sub: "₹110" }
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setChaiType(item.key as any)}
                    className={`py-1.5 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                      chaiType === item.key 
                        ? "bg-background text-foreground shadow border border-border/50" 
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <span className="block">{item.label}</span>
                    <span className="block text-[8px] font-mono text-zinc-400 mt-0.5">{item.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Calculator Output */}
          <div className="bg-surface-raised/35 border border-border/40 p-4 rounded-xl space-y-3">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block font-mono">ESTIMATED SPEND</span>
                <span className="font-mono text-base font-black text-foreground block mt-0.5">₹{dayScholarCosts.total}</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block font-mono">POTENTIAL SAVINGS</span>
                <span className="font-mono text-base font-black text-success block mt-0.5">₹{dayScholarCosts.savings}</span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400 leading-normal font-medium">
              {dayScholarCosts.total > safeDaily ? (
                <>
                  ⚠️ Spending ₹{dayScholarCosts.total} exceeds your daily safe limit of <strong>₹{safeDaily}</strong>! Consider carpooling or taking transit to save.
                </>
              ) : (
                <>
                  Nice! You are staying under budget. Commuting by {commuteMode === "metro" ? "Transit" : commuteMode === "pool" ? "Shared Cab" : "Solo Cab"} and choosing {chaiType === "tapri" ? "Tapri Chai" : "Cafe Coffee"} extends your runway.
                </>
              )}
            </p>

            <div className="flex gap-2">
              {commuteMode === "solo" ? (
                <Link to="/travel" className="flex-1 h-8 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center text-xs font-black uppercase tracking-wider transition-all active:scale-[0.98]">
                  Find Travel Pools
                </Link>
              ) : (
                <button 
                  onClick={() => handleApplySavings(dayScholarCosts.savings * 5)}
                  className="flex-1 h-8 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
                >
                  Apply to Runway
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
const getVenueDetails = (venueName: string) => {
  return {
    phone: null as string | null,
    upi: null as string | null,
    displayName: venueName || "Campus Food"
  };
};

const renderSparkline = (history: any[]) => {
  if (!history || history.length < 2) return null;
  // Sort history by changed_at timestamp
  const sorted = [...history].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
  const prices = sorted.map((h) => h.price / 100);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;
  
  // Plot 5 points matching coordinates on a 36x14 pixel space
  const points = prices.map((p, index) => {
    const x = (index / (prices.length - 1)) * 36;
    const y = 12 - ((p - minPrice) / range) * 10;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const isUp = prices[prices.length - 1] > prices[0];
  const lineColor = isUp ? "#f87171" : "#4ade80"; // soft red if price rose, green if price fell or stable

  return (
    <div className="flex items-center gap-1 shrink-0" title={`Price History: ${prices.map(p => `₹${p}`).join(" → ")}`}>
      <svg width="36" height="14" className="overflow-visible select-none">
        <polyline
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          points={points}
        />
      </svg>
      <span className={`text-[7px] font-black leading-none ${isUp ? "text-red-400" : "text-green-400"}`}>
        {isUp ? "↑" : "↓"}
      </span>
    </div>
  );
};

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

  // Burnout score is now calculated on the backend via /api/insights/wellness

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

  const { data: quizzes, refetch: refetchQuizzes } = useQuery({
    queryKey: ["quizzes", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => getCommunityQuizzes(),
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

  // UPI QR Dialog State
  const [upiPayItem, setUpiPayItem] = useState<any | null>(null);
  const [upiConfirming, setUpiConfirming] = useState(false);

  // Expanded Photo View State
  const [expandedPhotoVenue, setExpandedPhotoVenue] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [venuePhotos, setVenuePhotos] = useState<Record<string, string>>({});

  const photoCanvasRef = useRef<HTMLDivElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panScroll, setPanScroll] = useState({ left: 0, top: 0 });

  const handlePanMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1 || !photoCanvasRef.current) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    setPanScroll({
      left: photoCanvasRef.current.scrollLeft,
      top: photoCanvasRef.current.scrollTop
    });
  };

  const handlePanMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || zoomScale <= 1 || !photoCanvasRef.current) return;
    e.preventDefault();
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    photoCanvasRef.current.scrollLeft = panScroll.left - dx;
    photoCanvasRef.current.scrollTop = panScroll.top - dy;
  };

  const handlePanMouseUpOrLeave = () => {
    setIsPanning(false);
  };

  const activeVenuePhoto = useMemo(() => {
    if (!expandedPhotoVenue) return null;
    const firstPhoto = (foods ?? []).find((it: any) => it.venue_name === expandedPhotoVenue && it.s3_image_uri)?.s3_image_uri;
    const dbPhoto = venuePhotos[expandedPhotoVenue];
    return firstPhoto || dbPhoto || null;
  }, [expandedPhotoVenue, foods, venuePhotos]);

  useEffect(() => {
    if (expandedPhotoVenue === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoomScale((s) => Math.min(3, s + 0.25));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoomScale((s) => Math.max(0.5, s - 0.25));
      } else if (e.key.toLowerCase() === "r" || e.key === "0") {
        e.preventDefault();
        setZoomScale(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedPhotoVenue]);

  // Inline Menu Edit State
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [confirmedItemIds, setConfirmedItemIds] = useState<string[]>([]);

  // Premium Dining Upgrade States
  const [maxBudgetFilter, setMaxBudgetFilter] = useState<number | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [reconciledReceipt, setReconciledReceipt] = useState<any | null>(null);
  const [scanVenueMode, setScanVenueMode] = useState<"select" | "custom">("select");
  const [manualVenueMode, setManualVenueMode] = useState<"select" | "custom">("select");

  // Food trust contribution state
  const [dismissedQuizId, setDismissedQuizId] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [quizLocation, setQuizLocation] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false);
  const [quizReceiptFile, setQuizReceiptFile] = useState<File | null>(null);
  const [quizReceiptBusy, setQuizReceiptBusy] = useState(false);
  const [recurringItemName, setRecurringItemName] = useState("");
  const [dismissedCenterQuizId, setDismissedCenterQuizId] = useState<string | null>(null);

  const safeDailyLimit = wellness?.safe_daily_limit_rs ?? 150.0;
  const remainingAllowance = wellness?.remaining_allowance_rs ?? 4500.0;

  const safetyLevel = safeDailyLimit >= 120 ? "safe" : safeDailyLimit >= 50 ? "elevated" : "critical";
  const safetyColor = safetyLevel === "safe" ? "text-success border-success/30 bg-success/5" : safetyLevel === "elevated" ? "text-warning border-warning/30 bg-warning/5" : "text-destructive border-destructive/30 bg-destructive/5";
  const safetyLabel = safetyLevel === "safe" ? "Safe Spend" : safetyLevel === "elevated" ? "Elevated Risk" : "Budget Critical";

  const groupedMenus = useMemo(() => {
    return Object.entries(
      ((foods ?? []) as Food[]).reduce<Record<string, Food[]>>((acc, f) => {
        (acc[f.venue_name] ??= []).push(f);
        return acc;
      }, {}),
    ).sort(([venueA], [venueB]) => {
      if (scanVenue && venueA.toLowerCase().includes(scanVenue.toLowerCase())) return -1;
      if (scanVenue && venueB.toLowerCase().includes(scanVenue.toLowerCase())) return 1;
      return venueA.localeCompare(venueB);
    });
  }, [foods, scanVenue]);

  const hasVisibleCanteens = useMemo(() => {
    return groupedMenus.some(([_, items]) => {
      const filtered = items.filter((it) => maxBudgetFilter === null || (it.price / 100) <= maxBudgetFilter);
      return filtered.length > 0;
    });
  }, [groupedMenus, maxBudgetFilter]);

  const activeVenues = useMemo(() => {
    if (!foods || !Array.isArray(foods)) return [];
    return Array.from(new Set(foods.map((f: any) => f.venue_name).filter(Boolean)));
  }, [foods]);

  // Edit Mutation
  const editMutation = useMutation({
    mutationFn: editFoodItem,
    onSuccess: (res: any) => {
      setEditingItemId(null);
      qc.invalidateQueries({ queryKey: ["foods"] });
      qc.invalidateQueries({ queryKey: ["pending-foods"] });
      if (typeof refetchPending === "function") {
        refetchPending();
      }
      toast.success(res?.message || (res?.status === "pending_verification" ? "Correction sent for community verification." : "Menu item updated."));
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to save correction.");
    }
  });

  const handleEditSave = (id: string) => {
    const rawVal = parseFloat(editPrice);
    if (isNaN(rawVal) || rawVal <= 0) {
      toast.error("Please enter a valid price.");
      return;
    }
    const priceInPaise = Math.round(rawVal * 100);
    editMutation.mutate({ id, item_name: editName.trim(), price: priceInPaise });
  };

  // Manual Add Menu Form State
  const [manualVenue, setManualVenue] = useState("");
  const [manualItemName, setManualItemName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  // Manual Creation Mutation
  const manualCreateMutation = useMutation({
    mutationFn: createCampusFoodItem,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["foods"] });
      toast.success(
        res?.status === "active"
          ? "Food item added to the menu."
          : "Food item saved for community verification."
      );
      setManualItemName("");
      setManualPrice("");
    },
    onError: () => {
      toast.error("Failed to add food item.");
    },
    onSettled: () => {
      setManualBusy(false);
    }
  });
  // Submit Quiz Mutation
  const [submittingQuizId, setSubmittingQuizId] = useState<string | null>(null);
  const submitQuizMutation = useMutation({
    mutationFn: submitQuizResponse,
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["foods"] });
      qc.invalidateQueries({ queryKey: ["txns"] });
      refetchQuizzes();
      toast.success(res?.message || "Response recorded! Thank community.");
    },
    onError: () => {
      toast.error("Failed to submit quiz response.");
    },
    onSettled: () => {
      setSubmittingQuizId(null);
    }
  });

  const handleQuizAnswer = async (quiz: any, answer: string, imageB64Override?: string) => {
    setSubmittingQuizId(quiz.id);
    
    // Copy current state values to prevent race conditions during state reset
    const loc = quizLocation.trim();
    const customCat = customCategory.trim();

    // Reset inputs
    setQuizLocation("");
    setCustomCategory("");
    setShowCustomCategoryInput(false);
    setQuizReceiptFile(null);
    setSelectedOption(null);

    submitQuizMutation.mutate({
      quiz_id: quiz.id,
      quiz_type: quiz.type,
      venue_name: quiz.venue_name,
      response_val: answer,
      price: quiz.price,
      item_name: quiz.item_name,
      old_price: quiz.old_price,
      new_price: quiz.new_price,
      custom_category: customCat || undefined,
      location: loc || undefined,
      image_b64: imageB64Override
    });
  };

  const handleQuizReceiptUpload = async (file: File, quiz: any) => {
    setQuizReceiptBusy(true);
    try {
      const b64 = await fileToBase64(file);
      await handleQuizAnswer(quiz, "Yes", b64);
    } catch (err) {
      toast.error("Failed to process screenshot.");
    } finally {
      setQuizReceiptBusy(false);
    }
  };

  const activeQuizId = quizzes?.[0]?.id;
  useEffect(() => {
    setQuizLocation("");
    setCustomCategory("");
    setShowCustomCategoryInput(false);
    setQuizReceiptFile(null);
    setSelectedOption(null);
    setRecurringItemName("");
  }, [activeQuizId]);

  const activeMenuQuiz = useMemo(() => {
    return quizzes?.find(
      (q: any) => (q.type === "item_name" || q.type === "meal_guess") && q.id !== dismissedCenterQuizId
    ) || null;
  }, [quizzes, dismissedCenterQuizId]);

  const activeTrustQuiz = useMemo(() => {
    return quizzes?.find(
      (q: any) => q.type !== "item_name" && q.type !== "meal_guess" && q.id !== dismissedQuizId
    ) || null;
  }, [quizzes, dismissedQuizId]);

  const foodRoutineLabel = insights?.food?.routine_label || (
    profile?.mess_enrolled
      ? "Hostel mess + campus food"
      : "Mixed meal routine"
  );

  const trustedMenuCount = insights?.food?.trusted_menu_count ?? (foods ?? []).filter((f: any) => (f.verification_votes ?? 0) >= (f.verification_threshold ?? 3)).length;
  const pendingMenuCount = insights?.food?.pending_menu_count ?? 0;
  const freshMenuCount = insights?.food?.fresh_menu_count ?? (foods ?? []).filter((f: any) => !f.price_spike_alert).length;
  const campusDirectCount = insights?.food?.campus_direct_count_30d ?? insights?.food?.mess_count_30d ?? 0;
  const cookingSignalCount = insights?.food?.cooking_signal_count_30d ?? 0;
  const avgMealCostPaise = insights?.food?.avg_meal_cost_paise ?? bestFood?.price ?? 0;
  const foodSavingsEstimate = useMemo(() => {
    const deliveryCount = insights?.food?.delivery_count_30d ?? 0;
    const deliverySpend = insights?.food?.delivery_spend_paise ?? 0;
    if (!deliveryCount || !deliverySpend || !avgMealCostPaise) return 0;
    const avgDeliveryPaise = deliverySpend / deliveryCount;
    return Math.max(0, Math.round((avgDeliveryPaise - avgMealCostPaise) / 100));
  }, [insights, avgMealCostPaise]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualVenue.trim()) {
      toast.error("Please enter a canteen name.");
      return;
    }
    if (!manualItemName.trim()) {
      toast.error("Please enter a food item name.");
      return;
    }
    const parsedPrice = parseFloat(manualPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      toast.error("Please enter a valid positive price.");
      return;
    }
    setManualBusy(true);
    manualCreateMutation.mutate({
      venue_name: manualVenue.trim(),
      item_name: manualItemName.trim(),
      price: Math.round(parsedPrice * 100),
      campus: profile?.college_name || "ABV-IIITM Gwalior",
      status: "pending_verification"
    });
  };

  // Fetch venue photo function
  const fetchVenuePhoto = async (venue: string) => {
    try {
      const res = await getVenuePhoto(venue);
      if (res && res.image_b64) {
        setVenuePhotos(prev => ({ ...prev, [venue]: res.image_b64 }));
      }
    } catch {
      // Ignore if no photo exists
    }
  };

  useEffect(() => {
    if (!showFoodSheet || !foods) return;
    const uniqueVenues = Array.from(new Set((foods as any[]).map((f) => f.venue_name)));
    uniqueVenues.forEach((v) => {
      if (venuePhotos[v] === undefined) {
        fetchVenuePhoto(v);
      }
    });
  }, [showFoodSheet, foods]);

  const { data: pendingFoods, refetch: refetchPending } = useQuery({
    queryKey: ["pending-foods"],
    queryFn: () => getCampusFood("pending_verification"),
    enabled: !!user,
  });

  const verifyMutation = useMutation({
    mutationFn: verifyCampusFoodItem,
    onSuccess: (res, variables) => {
      refetchPending();
      qc.invalidateQueries({ queryKey: ["foods"] });
      if (variables?.id && variables.vote === "up") {
        setConfirmedItemIds(prev => [...prev, variables.id]);
      }
      toast.success(
        res.status === "merged_into_active"
          ? "Correction merged into the trusted menu."
          : res.status === "promoted_to_active"
          ? "Item promoted to trusted campus menu."
          : res.status === "rejected"
          ? "Candidate rejected after community review."
          : res.status === "already_voted"
          ? "You have already voted on this item."
          : variables?.vote === "down"
          ? "Marked as wrong for review."
          : "Thank you for verifying."
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
      if (res?.status === "needs_review") {
        toast.info(res.message || "Menu photo needs manual review.");
      } else {
        toast.success(res.message || "Menu candidates saved for review.");
      }
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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

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
    try {
      const b64Data = await fileToBase64(scanFile);
      scanMutation.mutate({
        data: {
          venue_name: scanVenue.trim(),
          campus: profile?.college_name || "ABV-IIITM Gwalior",
          image_b64: b64Data,
        }
      });
    } catch (err) {
      toast.error("Failed to process image file.");
      setScanBusy(false);
    }
  };

  // Receipt Verification Mutation
  const receiptMutation = useMutation({
    mutationFn: scanReceiptScreenshot,
    onSuccess: (res) => {
      setReconciledReceipt(res);
      setReceiptFile(null);
      if (res?.status === "needs_review") {
        toast.info(res.message || "Receipt saved for review.");
      } else {
        toast.success(res?.message || "Receipt saved.");
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to process receipt image. Ensure it is a clear payment confirmation screenshot.");
    },
    onSettled: () => {
      setReceiptBusy(false);
    }
  });

  const handleReceiptUpload = async (file: File) => {
    setReceiptBusy(true);
    try {
      const b64Data = await fileToBase64(file);
      receiptMutation.mutate({ image_b64: b64Data });
    } catch (err) {
      toast.error("Failed to read image file.");
      setReceiptBusy(false);
    }
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


  const foodGapHours = useMemo(() => {
    const lastFood = (txns ?? []).find((t) => t.category === "food");
    return lastFood ? (Date.now() - new Date(lastFood.created_at).getTime()) / 3600000 : 0;
  }, [txns]);

  // ── Smart nudges derived from insights ──────────────────────────────────
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());
  const dismiss = (id: string) => setDismissedNudges((s) => new Set([...s, id]));
  const [currentWarningIndex, setCurrentWarningIndex] = useState(0);

  const nudges = useMemo(() => {
    const list: { id: string; icon: any; accent: string; title: string; body: string }[] = [];
    if (!insights) {
      // Hardcoded fallback when no data yet
      list.push({
        id: "onboard",
        icon: Wallet,
        accent: "#8C7853",
        title: "Welcome to PocketBuddy",
        body: "Your spending guard is active. Start logging transactions or pair the Android companion to begin tracking automatically.",
      });
      return list;
    }

    // Food delivery nudge
    const delivCount = insights.food?.delivery_count_30d ?? 0;
    const campusDirectForNudge = insights.food?.campus_direct_count_30d ?? insights.food?.mess_count_30d ?? 0;
    if (delivCount > 5 && delivCount > campusDirectForNudge) {
      list.push({
        id: "delivery_overuse",
        icon: Utensils,
        accent: "#FC8019",
        title: "Delivery is dominating meals",
        body: `You've used delivery ${delivCount}× this month vs ${campusDirectForNudge} campus/direct meals. Plan two ${foodRoutineLabel.toLowerCase()} meals this week to protect your runway.`,
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
        body: "Your budget matters most right now. Use your lowest-friction meal routine — mess, PG cooking, home food, or campus canteen — before defaulting to delivery.",
      });
    }

    // Spending velocity spike
    const vel = insights.velocity?.pct_change ?? 0;
    const spend7 = (insights.velocity?.spend_7d_paise ?? 0) / 100;
    const spendPrior = (insights.velocity?.spend_prior_7d_paise ?? 0) / 100;
    const diff = spend7 - spendPrior;

    // Only nudge if the percentage change is above 30% AND the actual increase is more than ₹500
    if (vel > 30 && diff > 500) {
      const velocityDisplay = vel >= 100 ? `${(vel / 100).toFixed(1)}×` : `${vel}%`;
      list.push({
        id: "velocity_spike",
        icon: AlertTriangle,
        accent: "#f59e0b",
        title: `Spending up ${velocityDisplay} this week`,
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
  }, [insights, calc, foodRoutineLabel]);

  const visibleNudges = nudges.filter((n) => !dismissedNudges.has(n.id)).slice(0, 2);

  // Unified warnings feed for mobile carousel/ticker
  const activeWarnings = useMemo(() => {
    const list: {
      id: string;
      type: string;
      icon: any;
      accent: string;
      title: string;
      body: string;
      onAction?: () => void;
      actionText?: string;
      onDismiss?: () => void;
    }[] = [];

    // 1. Add active nudges
    visibleNudges.forEach((n) => {
      list.push({
        id: n.id,
        type: "nudge",
        icon: n.icon,
        accent: n.accent,
        title: n.title,
        body: n.body,
        onDismiss: () => dismiss(n.id)
      });
    });

    // 2. Add price spikes
    if (insights?.food?.price_spikes) {
      insights.food.price_spikes.forEach((spike: any, idx: number) => {
        list.push({
          id: `price_spike_${idx}`,
          type: "price_spike",
          icon: TrendingDown,
          accent: "#ef4444",
          title: "Price change to verify",
          body: `Payments at ${spike.venue_name} suggest the price of ${spike.item_name} rose from ${rupees(spike.old_price * 100)} to ${rupees(spike.new_price * 100)} (+${spike.pct_increase}%).`,
          onAction: () => setShowFoodSheet(true),
          actionText: "Verify Menu"
        });
      });
    }

    return list;
  }, [visibleNudges, insights]);

  // Keep currentWarningIndex in bounds
  useEffect(() => {
    if (currentWarningIndex >= activeWarnings.length) {
      setCurrentWarningIndex(0);
    }
  }, [activeWarnings.length, currentWarningIndex]);

  // Mobile warnings carousel auto-cycle
  useEffect(() => {
    if (activeWarnings.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentWarningIndex((prev) => (prev + 1) % activeWarnings.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeWarnings.length]);

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

        {/* Mobile Rotating Alerts Ticker (Visible on mobile only, auto-cycling) */}
        {activeWarnings.length > 0 && (
          <div className="block md:hidden mb-6 animate-[fadeIn_0.3s_ease-out]">
            {(() => {
              const active = activeWarnings[currentWarningIndex % activeWarnings.length];
              if (!active) return null;
              
              const Icon = active.icon;
              return (
                <div 
                  className="relative rounded-2xl border p-4 overflow-hidden bg-surface/40 backdrop-blur-md transition-all duration-300"
                  style={{ borderColor: `${active.accent}30` }}
                >
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at top left, ${active.accent}08, transparent 70%)` }} />
                  
                  {/* Indicators / Progress Dot */}
                  {activeWarnings.length > 1 && (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      {activeWarnings.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setCurrentWarningIndex(idx);
                          }}
                          className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                            idx === (currentWarningIndex % activeWarnings.length)
                              ? "w-3"
                              : "w-1.5 opacity-40"
                          }`}
                          style={{ backgroundColor: active.accent }}
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex items-start gap-3 pr-10">
                    <div className="p-2 rounded-xl bg-white/5 border border-white/10 shrink-0">
                      <Icon className="h-4.5 w-4.5" style={{ color: active.accent }} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-[10px] font-black tracking-widest uppercase" style={{ color: active.accent }}>
                        {active.title}
                      </p>
                      <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                        {active.body}
                      </p>
                      
                      {/* Action buttons inside the carousel */}
                      <div className="flex items-center gap-2 pt-1.5">
                        {active.onAction && (
                          <button
                            type="button"
                            onClick={active.onAction}
                            className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-lg border transition-all cursor-pointer"
                            style={{ 
                              borderColor: `${active.accent}40`, 
                              color: active.accent,
                              background: `${active.accent}0a`
                            }}
                          >
                            {active.actionText}
                          </button>
                        )}
                        {active.onDismiss && (
                          <button
                            type="button"
                            onClick={active.onDismiss}
                            className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-2 py-1 hover:text-zinc-400 cursor-pointer"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Desktop Stacked Warnings (Visible on desktop/tablet only) */}
        <div className="hidden md:block space-y-2 mb-6">
          {visibleNudges.length > 0 && (
            <div className="space-y-2">
              {visibleNudges.map((n) => (
                <NudgeCard key={n.id} {...n} onDismiss={() => dismiss(n.id)} />
              ))}
            </div>
          )}

          {/* Food Guard updates */}
          {(insights?.food?.price_spikes && insights.food.price_spikes.length > 0) && (
            <div className="space-y-2 animate-[fadeIn_0.3s_ease-out]">
              {/* Price Spike Notification */}
              {insights?.food?.price_spikes?.map((spike: any, idx: number) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid place-items-center h-8 w-8 rounded-lg bg-destructive/10 text-destructive shrink-0">
                      <TrendingDown className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-black text-destructive uppercase tracking-wider">Price change to verify</p>
                      <p className="text-zinc-300 font-medium leading-relaxed mt-0.5">
                        Payments at <strong className="text-foreground">{spike.venue_name}</strong> suggest the price of <strong className="text-foreground">{spike.item_name}</strong> rose from {rupees(spike.old_price * 100)} to <strong className="text-destructive font-mono">{rupees(spike.new_price * 100)}</strong> (+{spike.pct_increase}%).
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFoodSheet(true)}
                    className="shrink-0 bg-destructive/10 hover:bg-destructive/15 border border-destructive/20 text-destructive px-3.5 py-1.5 rounded-xl font-bold uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Verify Menu
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

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
              
              <div className="p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase flex items-center gap-1.5 font-display">
                    <span>Student Wellness Index</span>
                  </p>
                  
                  {wellness && (
                    <Badge variant="outline" className="font-bold text-xs px-2 py-0.5" style={{
                      borderColor: wellness.status === "steady" ? "rgba(22,163,74,0.3)" : wellness.status === "watch" ? "rgba(217,119,6,0.3)" : "rgba(220,38,38,0.3)",
                      color: wellness.status === "steady" ? "var(--pb-green)" : wellness.status === "watch" ? "var(--pb-amber)" : "var(--pb-red)",
                      background: wellness.status === "steady" ? "rgba(22,163,74,0.05)" : wellness.status === "watch" ? "rgba(217,119,6,0.05)" : "rgba(220,38,38,0.05)"
                    }}>
                      {wellness.status === "steady" ? "STEADY" : wellness.status === "watch" ? "WATCH" : "STRESSED"}
                    </Badge>
                  )}
                </div>

                {wellnessLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-1/4 bg-white/5" />
                    <Skeleton className="h-4 w-3/4 bg-white/5" />
                    <Skeleton className="h-12 w-full bg-white/5" />
                  </div>
                ) : wellnessError ? (
                  <div className="rounded-xl border border-dashed border-destructive/20 bg-destructive/5 p-4">
                    <p className="text-xs font-semibold text-destructive uppercase tracking-wider">Wellness metrics unavailable</p>
                    <p className="text-xs text-zinc-500 mt-1">We couldn't load your wellness metrics. Please try again later.</p>
                  </div>
                ) : (txns ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-surface-raised/40 p-4 text-center">
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
                ) : (
                  <>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-3xl md:text-4xl font-black tracking-tighter text-foreground tnum leading-none font-display" style={{
                        color: wellness.status === "steady" ? "var(--pb-green)" : wellness.status === "watch" ? "var(--pb-amber)" : "var(--pb-red)"
                      }}>
                        {wellness.score}
                      </span>
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest font-mono">/ 100 Wellness Score</span>
                    </div>

                    <p className="text-xs md:text-sm text-zinc-300 font-medium leading-relaxed mb-4">
                      {wellness.status === "stressed" 
                        ? "We noticed a stack of stressful signals today. Remember, your runway and meals don't define you. Taking it one step at a time is enough. You can do this." 
                        : wellness.message}
                    </p>

                    {/* Contributing Signals */}
                    <div className="border-t border-border pt-4 mt-2 mb-4">
                      <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-3 font-mono">Contributing Signals</p>
                      
                      <div className="flex flex-wrap gap-2">
                        {wellness.signals?.map((sig: any) => (
                          <div key={sig.key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-surface-raised/40 text-xs font-medium" style={{
                            borderColor: sig.severity === "stressed" 
                              ? "rgba(239,68,68,0.25)" 
                              : sig.severity === "watch" 
                                ? "rgba(245,158,11,0.25)" 
                                : "var(--border)"
                          }}>
                            <span className="text-zinc-400 font-medium">{sig.label}:</span>
                            <span className="font-bold text-foreground">{sig.value}</span>
                            <span className="w-1.5 h-1.5 rounded-full" style={{
                              background: sig.severity === "stressed" 
                                ? "var(--pb-red)" 
                                : sig.severity === "watch" 
                                  ? "var(--pb-amber)" 
                                  : "var(--pb-green)"
                            }} title={sig.detail} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Conditional layouts based on status */}
                    {wellness.status === "watch" && (
                      <div className="border-t border-border pt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <span className="text-xs font-bold tracking-widest text-zinc-500 uppercase mb-1 sm:mb-0 sm:mr-2 font-mono">Quick Check-in:</span>
                        <div className="flex flex-wrap gap-2 flex-1">
                          <button
                            id="btn-wellness-ate"
                            onClick={() => handleWellnessAction("ate")}
                            className="flex-1 min-h-[44px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-success hover:text-success/90 bg-success/5 hover:bg-success/10 border border-success/20 hover:border-success/30 rounded-xl transition-all cursor-pointer"
                          >
                            I Ate Meal
                          </button>
                          <button
                            id="btn-wellness-break"
                            onClick={() => handleWellnessAction("break")}
                            className="flex-1 min-h-[44px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-warning hover:text-warning/90 bg-warning/5 hover:bg-warning/10 border border-warning/20 hover:border-warning/30 rounded-xl transition-all cursor-pointer"
                          >
                            I Need a Break
                          </button>
                          <button
                            id="btn-wellness-spending"
                            onClick={() => handleWellnessAction("spending")}
                            className="flex-1 min-h-[44px] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground hover:text-foreground/90 bg-white/5 hover:bg-white/10 border border-border hover:border-white/15 rounded-xl transition-all cursor-pointer"
                          >
                            I'll Plan Spending
                          </button>
                        </div>
                      </div>
                    )}

                    {wellness.status === "stressed" && (
                      <div className="border-t border-border pt-4 mt-4 space-y-4">
                        <form onSubmit={handleRedCheckinSubmit} className="space-y-3">
                          <p className="text-xs font-bold tracking-widest text-zinc-500 uppercase pl-1 font-mono">Submit Feedback Check-in</p>
                          <textarea 
                            value={redCheckinText} 
                            onChange={(e) => setRedCheckinText(e.target.value)} 
                            placeholder="How are you feeling today? Write down any notes, feelings or stress points..." 
                            className="w-full min-h-[88px] bg-background/50 border border-border rounded-xl p-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 resize-none text-foreground placeholder:text-muted-foreground/50 leading-relaxed transition-all" 
                            disabled={redCheckinSubmitting} 
                          />
                          <button 
                            type="submit" 
                            disabled={redCheckinSubmitting || !redCheckinText.trim()} 
                            className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2"
                          >
                            {redCheckinSubmitting ? "Submitting..." : "Submit Check-in"}
                          </button>
                        </form>

                        <div className="rounded-xl border border-red-950/40 bg-red-950/10 p-4 space-y-2.5">
                          <p className="text-xs font-bold tracking-[0.15em] text-red-400 uppercase flex items-center gap-1.5 font-mono">
                            <Phone className="h-3.5 w-3.5" />
                            <span>Campus Counseling Services</span>
                          </p>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            If you feel overwhelmed, please reach out to the campus support team. It is completely confidential, free, and designed for students.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-zinc-500 font-medium pt-1">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3 w-3 shrink-0 text-zinc-600" />
                              <span>Wellness Cell, Room 102, Admin Block</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3 shrink-0 text-zinc-600" />
                              <a href="tel:+911123456789" className="hover:text-primary transition-colors hover:underline flex items-center gap-0.5">
                                +91 11 2345 6789
                                <ExternalLink className="h-2 w-2" />
                              </a>
                            </div>
                            <div className="flex items-center gap-1.5 col-span-full">
                              <Mail className="h-3 w-3 shrink-0 text-zinc-600" />
                              <a href="mailto:wellness@institute.edu" className="hover:text-primary transition-colors hover:underline flex items-center gap-0.5">
                                wellness@institute.edu
                                <ExternalLink className="h-2 w-2" />
                              </a>
                            </div>
                          </div>
                        </div>
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

            {calc && <SpendingSmartCheck calc={calc} insights={insights} profile={profile} foods={foods} txns={txns} />}

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
                  <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-border bg-surface-raised/30">
                    <p className="text-xs text-zinc-500">Log transactions to see a 7-day spend pattern.</p>
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
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-[0.2em] text-zinc-500 uppercase">Food & Wellness</p>
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                    Turns your meal routine into safer menu choices, verified prices, and runway-aware food decisions.
                  </p>
                </div>
                <span className="rounded-full border border-border bg-surface-raised px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {foodRoutineLabel}
                </span>
              </div>
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

                {/* Routine mix */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">Routine Mix</p>
                  <p className="text-[16px] font-black text-foreground">
                    {insights?.food?.delivery_count_30d ?? "—"}×
                  </p>
                  <p className="text-xs text-zinc-600">
                    {campusDirectCount} campus/direct{cookingSignalCount ? ` · ${cookingSignalCount} cooking` : ""}
                  </p>
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

              {/* Campus/direct vs delivery bar */}
              {insights?.food && (insights.food.delivery_count_30d + campusDirectCount) > 0 && (
                <div className="mt-5 pt-4 border-t border-border">
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-2">Campus/direct vs delivery mix (30d)</p>
                  <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                    <div
                      className="bg-success rounded-full transition-all"
                      style={{ width: `${(campusDirectCount / Math.max(campusDirectCount + insights.food.delivery_count_30d, 1)) * 100}%` }}
                    />
                    <div
                      className="bg-warning rounded-full transition-all"
                      style={{ width: `${(insights.food.delivery_count_30d / Math.max(campusDirectCount + insights.food.delivery_count_30d, 1)) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-success font-bold">Campus/direct {campusDirectCount}</span>
                    <span className="text-[10px] text-warning font-bold">Delivery {insights.food.delivery_count_30d}</span>
                  </div>
                </div>
              )}

              {/* Food Guard Panel */}
              <div className="mt-5 pt-4 border-t border-border space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-success shrink-0" />
                    <p className="text-xs font-black tracking-wider text-foreground uppercase">Food Guard</p>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-success/10 text-success border border-success/20">
                      Active
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFoodSheet(true);
                      setFoodTab(pendingMenuCount > 0 ? "verify" : "scan");
                    }}
                    className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/10"
                  >
                    Help improve campus food
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border bg-surface-raised/25 p-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Trusted</p>
                    <p className="mt-0.5 text-sm font-black text-success tnum">{trustedMenuCount}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-raised/25 p-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Pending</p>
                    <p className="mt-0.5 text-sm font-black text-warning tnum">{pendingMenuCount}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-raised/25 p-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Fresh</p>
                    <p className="mt-0.5 text-sm font-black text-foreground tnum">{freshMenuCount}</p>
                  </div>
                </div>

                {/* Main Dynamic Recommendation */}
                <div className="rounded-xl border border-success/15 bg-success/[0.02] p-3.5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-success uppercase tracking-widest">Safe Dining Pick</span>
                    {bestFood && (
                      <span className="text-[9px] text-zinc-500 font-medium">
                        {bestFood.venue_name.toLowerCase().includes("canteen") || bestFood.venue_name.toLowerCase().includes("center") || bestFood.venue_name.toLowerCase().includes("dhaba") ? "Campus venue" : "Delivery/aggregator"}
                      </span>
                    )}
                  </div>
                  {bestFood ? (
                    <div className="space-y-1">
                      <p className="text-xs text-foreground leading-relaxed">
                        Grab <span className="font-bold text-primary">{bestFood.item_name}</span> at <span className="font-bold text-foreground">{bestFood.venue_name}</span> for <strong className="text-success font-mono">{rupees(bestFood.price)}</strong>.
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed flex items-center gap-1.5 flex-wrap">
                        <span>Based on campus menu signals</span> · <span>{trustedMenuCount ? "Community verified" : "Needs more verification"}</span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No active campus menus parsed yet.</p>
                  )}
                </div>

                {/* Budget Runway impact helper */}
                {insights?.food && (
                  <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
                    {insights.food.delivery_count_30d > 3 && foodSavingsEstimate > 0 ? (
                      <span><strong>Runway move:</strong> Replacing 2 delivery orders this week with your usual campus/direct meal can save about <strong>₹{foodSavingsEstimate * 2}</strong>.</span>
                    ) : avgMealCostPaise > 0 ? (
                      <span>Your current {foodRoutineLabel.toLowerCase()} averages about <strong>{rupees(avgMealCostPaise)}</strong> per logged meal.</span>
                    ) : (
                      <span>Log a few meals or confirm campus menu prices to make Food Guard recommendations sharper.</span>
                    )}
                  </p>
                )}

                {(activeMenuQuiz || activeTrustQuiz) ? (
                  <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-3.5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Help improve campus food</p>
                        <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
                          Optional 10-second check. Your answer helps verify prices and menus for everyone without sharing raw payment details.
                        </p>
                      </div>
                      <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                        No popup
                      </span>
                    </div>

                    {activeMenuQuiz ? (
                      <div className="space-y-2.5">
                        <p className="text-xs font-semibold leading-relaxed text-foreground">
                          Students often pay <strong className="font-mono text-primary">{rupees(activeMenuQuiz.price)}</strong> at <strong>{activeMenuQuiz.venue_name}</strong>. What item is this?
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {activeMenuQuiz.options.map((opt: string) => (
                            <button
                              key={opt}
                              type="button"
                              disabled={submittingQuizId === activeMenuQuiz.id}
                              onClick={() => handleQuizAnswer(activeMenuQuiz, opt).then(() => setDismissedCenterQuizId(activeMenuQuiz.id))}
                              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[10px] font-bold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 disabled:opacity-50"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Or type item name"
                            value={recurringItemName}
                            onChange={(e) => setRecurringItemName(e.target.value)}
                            className="h-8 flex-1 bg-surface text-xs"
                          />
                          <Button
                            type="button"
                            disabled={submittingQuizId === activeMenuQuiz.id || !recurringItemName.trim()}
                            onClick={() => {
                              handleQuizAnswer(activeMenuQuiz, recurringItemName.trim()).then(() => {
                                setRecurringItemName("");
                                setDismissedCenterQuizId(activeMenuQuiz.id);
                              });
                            }}
                            className="h-8 px-3 text-[10px] font-black uppercase"
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDismissedCenterQuizId(activeMenuQuiz.id)}
                            className="h-8 px-3 bg-transparent text-[10px] font-black uppercase"
                          >
                            Later
                          </Button>
                        </div>
                      </div>
                    ) : activeTrustQuiz ? (
                      <div className="space-y-2.5">
                        <p className="text-xs font-semibold leading-relaxed text-foreground">{activeTrustQuiz.question}</p>
                        <p className="text-[10px] text-zinc-500 font-medium">{activeTrustQuiz.detail}</p>

                        {activeTrustQuiz.type === "category" && (
                          <Input
                            placeholder="Optional location, e.g. BH-2 Hostel"
                            value={quizLocation}
                            onChange={(e) => setQuizLocation(e.target.value)}
                            className="h-8 bg-surface text-xs"
                          />
                        )}

                        {activeTrustQuiz.type === "price_spike" && (
                          <label className="flex h-12 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface text-center transition-colors hover:bg-surface-raised">
                            <span className="text-[10px] font-bold text-zinc-300">
                              {quizReceiptFile ? quizReceiptFile.name : "Attach receipt screenshot if you have one"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={quizReceiptBusy}
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setQuizReceiptFile(e.target.files[0]);
                                  handleQuizReceiptUpload(e.target.files[0], activeTrustQuiz);
                                }
                              }}
                            />
                          </label>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                          {activeTrustQuiz.options.map((opt: string) => {
                            const isSelected = selectedOption === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                disabled={submittingQuizId === activeTrustQuiz.id}
                                onClick={() => {
                                  setSelectedOption(opt);
                                  setShowCustomCategoryInput(false);
                                }}
                                className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors disabled:opacity-50 ${
                                  isSelected
                                    ? "border-primary bg-primary/15 text-primary"
                                    : "border-border bg-surface text-foreground hover:border-primary/30 hover:bg-primary/10"
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                          {activeTrustQuiz.type === "category" && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOption("__custom__");
                                setShowCustomCategoryInput(true);
                              }}
                              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                                selectedOption === "__custom__"
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border bg-surface text-foreground hover:border-primary/30 hover:bg-primary/10"
                              }`}
                            >
                              + Custom
                            </button>
                          )}
                        </div>

                        {activeTrustQuiz.type === "category" && showCustomCategoryInput && (
                          <Input
                            placeholder="Type category"
                            value={customCategory}
                            onChange={(e) => setCustomCategory(e.target.value)}
                            className="h-8 bg-surface text-xs"
                          />
                        )}

                        <div className="flex gap-2">
                          <Button
                            type="button"
                            disabled={submittingQuizId === activeTrustQuiz.id || (!selectedOption && !customCategory.trim())}
                            onClick={() => {
                              const finalAnswer = selectedOption === "__custom__" ? customCategory.trim() : (selectedOption || "");
                              if (!finalAnswer) return;
                              handleQuizAnswer(activeTrustQuiz, finalAnswer).then(() => setDismissedQuizId(activeTrustQuiz.id));
                            }}
                            className="h-8 flex-1 text-[10px] font-black uppercase"
                          >
                            {submittingQuizId === activeTrustQuiz.id ? "Saving..." : "Save Answer"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDismissedQuizId(activeTrustQuiz.id)}
                            className="h-8 bg-transparent px-3 text-[10px] font-black uppercase"
                          >
                            Later
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-surface-raised/25 p-3.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">No contribution needed right now</p>
                    <p className="mt-1 text-[11px] text-zinc-400 leading-relaxed">
                      Food Guard will ask for help only when enough students create a privacy-safe pattern worth verifying.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowFoodSheet(true);
                          setFoodTab("scan");
                        }}
                        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-foreground transition-colors hover:bg-surface-raised"
                      >
                        Scan menu
                      </button>
                      {pendingMenuCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowFoodSheet(true);
                            setFoodTab("verify");
                          }}
                          className="rounded-lg border border-warning/20 bg-warning/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-warning transition-colors hover:bg-warning/15"
                        >
                          Review pending
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Price point crowdsource label trigger (Interactive feature) */}
                <UnlabelledPaymentPrompt txns={txns} foods={foods} qc={qc} />
              </div>
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

        {/* Menu Photo Viewer Modal with Zoom Controls */}
        <Dialog 
          open={expandedPhotoVenue !== null} 
          onOpenChange={(o) => {
            if (!o) {
              setExpandedPhotoVenue(null);
              setZoomScale(1);
            }
          }}
        >
          <DialogContent className="w-[95%] sm:max-w-2xl bg-background border border-border text-foreground space-y-4 rounded-xl mx-auto p-5 overflow-hidden">
            <DialogHeader className="flex flex-row justify-between items-center pr-6">
              <DialogTitle className="text-sm font-black uppercase tracking-wider text-foreground">
                {expandedPhotoVenue} Menu
              </DialogTitle>
              {/* Zoom Toolbar */}
              <div className="flex items-center gap-1.5 bg-surface-raised/40 border border-border/60 px-2 py-1 rounded-lg select-none shrink-0">
                <button
                  type="button"
                  onClick={() => setZoomScale((s) => Math.max(0.5, s - 0.25))}
                  disabled={zoomScale <= 0.5}
                  className="p-1 hover:bg-white/5 disabled:opacity-30 rounded text-zinc-400 hover:text-foreground cursor-pointer transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-bold font-mono text-zinc-400 min-w-[36px] text-center">
                  {Math.round(zoomScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomScale((s) => Math.min(3, s + 0.25))}
                  disabled={zoomScale >= 3}
                  className="p-1 hover:bg-white/5 disabled:opacity-30 rounded text-zinc-400 hover:text-foreground cursor-pointer transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <div className="h-3 w-[1px] bg-border/80 mx-0.5" />
                <button
                  type="button"
                  onClick={() => setZoomScale(1)}
                  className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 hover:bg-white/5 rounded text-zinc-400 hover:text-foreground cursor-pointer transition-colors"
                >
                  Reset
                </button>
              </div>
            </DialogHeader>

            {/* Scrollable image canvas */}
            <div 
              ref={photoCanvasRef}
              onMouseDown={handlePanMouseDown}
              onMouseMove={handlePanMouseMove}
              onMouseUp={handlePanMouseUpOrLeave}
              onMouseLeave={handlePanMouseUpOrLeave}
              className={`w-full h-[60vh] min-h-[300px] border border-border/50 bg-black/85 rounded-lg overflow-auto flex items-center justify-center relative p-4 scrollbar-thin select-none ${
                zoomScale > 1 
                  ? (isPanning ? "cursor-grabbing" : "cursor-grab") 
                  : "cursor-default"
              }`}
            >
              {activeVenuePhoto ? (
                <div 
                  className="transition-transform duration-200 ease-out"
                  style={{ 
                    transform: `scale(${zoomScale})`, 
                    transformOrigin: "center center" 
                  }}
                >
                  <img
                    src={activeVenuePhoto}
                    alt={`${expandedPhotoVenue} Menu`}
                    className="max-h-[58vh] max-w-full object-contain pointer-events-none select-none"
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No menu photo available.</p>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground text-center font-medium leading-relaxed">
              💡 Use pinch-to-zoom, trackpad scroll, or the toolbar buttons above to zoom and pan.
            </div>
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
                  type="button"
                  onClick={() => setFoodTab("menus")}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer ${
                    foodTab === "menus"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Trusted Menus
                </button>
                <button
                  type="button"
                  onClick={() => setFoodTab("verify")}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer ${
                    foodTab === "verify"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Pending Review
                </button>
                <button
                  type="button"
                  onClick={() => setFoodTab("scan")}
                  className={`flex-1 py-2 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer ${
                    foodTab === "scan"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Add Menu
                </button>
              </div>
            </SheetHeader>

            {foodTab === "menus" && (
              <div className="mt-4 space-y-4 animate-[fadeIn_0.2s_ease-out]">
                  {/* Dining Runway Advisor & Safety Gauge */}
                  <div className="bg-surface border border-border p-4 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Dining Runway Advisor</h4>
                        <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">Automated balance-to-menu budgeting</p>
                      </div>
                      <div className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border ${safetyColor}`}>
                        {safetyLabel}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-surface-raised/20 p-3 rounded-xl">
                      <div className="text-center border-r border-border/40">
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Remaining Allowance</p>
                        <p className="text-base font-black text-foreground mt-0.5">₹{remainingAllowance.toFixed(0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Safe Daily Limit</p>
                        <p className="text-base font-black text-primary font-mono mt-0.5">₹{safeDailyLimit.toFixed(0)}</p>
                      </div>
                    </div>

                    <p className="text-[10px] text-zinc-400 leading-relaxed font-semibold">
                      <strong className="text-foreground">Runway Advice:</strong> With a daily limit of <span className="text-primary font-bold">₹{safeDailyLimit.toFixed(0)}</span>, you can safely afford {" "}
                      {safeDailyLimit >= 80 ? (
                        <>1 <strong className="text-foreground">Veg Thali</strong> (₹80) or up to {Math.floor(safeDailyLimit / 15)} cups of <strong className="text-foreground">Masala Chai</strong> (₹15)</>
                      ) : (
                        <>up to {Math.floor(safeDailyLimit / 15)} cups of <strong className="text-foreground">Masala Chai</strong> (₹15) or {Math.floor(safeDailyLimit / 30)} <strong className="text-foreground">Veg Maggi</strong> (₹30)</>
                      )}{" "}
                      today before impacting your monthly allowance forecast.
                    </p>

                    {/* Budget Filters */}
                    <div className="flex gap-2 items-center flex-wrap pt-2 border-t border-border/50">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-black shrink-0">Budget Filter:</span>
                      <button
                        type="button"
                        onClick={() => setMaxBudgetFilter(null)}
                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer border transition-all ${
                          maxBudgetFilter === null
                            ? "bg-primary border-primary text-primary-foreground font-black"
                            : "bg-surface-raised/40 border-border text-zinc-400 hover:text-foreground font-bold"
                        }`}
                      >
                        All Prices
                      </button>
                      <button
                        type="button"
                        onClick={() => setMaxBudgetFilter(40)}
                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer border transition-all ${
                          maxBudgetFilter === 40
                            ? "bg-warning border-warning/40 text-warning-foreground font-black"
                            : "bg-surface-raised/40 border-border text-zinc-400 hover:text-foreground font-bold"
                        }`}
                      >
                        Under ₹40
                      </button>
                      <button
                        type="button"
                        onClick={() => setMaxBudgetFilter(safeDailyLimit)}
                        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer border transition-all ${
                          maxBudgetFilter === safeDailyLimit
                            ? "bg-success border-success/40 text-success-foreground font-black"
                            : "bg-surface-raised/40 border-border text-zinc-400 hover:text-foreground font-bold"
                        }`}
                      >
                        Under Safe Limit (₹{Math.round(safeDailyLimit)})
                      </button>
                    </div>
                  </div>


                  {groupedMenus.map(([venue, items]) => {
                    const filteredItems = items.filter((it) => {
                      if (maxBudgetFilter === null) return true;
                      return (it.price / 100) <= maxBudgetFilter;
                    });
                    if (filteredItems.length === 0) return null;

                    const firstPhoto = items.find((it) => it.s3_image_uri)?.s3_image_uri;
                    const dbPhoto = venuePhotos[venue];
                    const hasPhoto = !!firstPhoto || (dbPhoto !== undefined && dbPhoto !== null);
                    const isPhotoExpanded = expandedPhotoVenue === venue;

                    const vDetails = getVenueDetails(venue);
                    const verifiedItems = items.filter((it) => (it.verification_votes ?? 0) >= (it.verification_threshold ?? 3)).length;
                    const stableItems = items.filter((it) => !it.price_spike_alert).length;

                    return (
                      <div key={venue} className="space-y-2 border border-border bg-surface-raised/10 p-4 rounded-2xl">
                      <div className="flex justify-between items-start flex-wrap gap-3 pb-3 border-b border-border/50">
                        <div className="space-y-1">
                          <h4 className="text-sm font-extrabold text-foreground tracking-tight">{venue}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            {hasPhoto ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setZoomScale(1);
                                  setExpandedPhotoVenue(venue);
                                }}
                                className="text-[10px] text-amber-500 hover:text-amber-400 font-black uppercase tracking-wider hover:underline cursor-pointer bg-transparent border-0 flex items-center gap-1 transition-all"
                              >
                                <Image className="w-3.5 h-3.5" />
                                View Menu Photo
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setScanVenue(venue);
                                  setFoodTab("scan");
                                }}
                                className="text-[10px] text-zinc-400 hover:text-zinc-300 font-black uppercase tracking-wider hover:underline cursor-pointer bg-transparent border-0 flex items-center gap-1 transition-all"
                              >
                                <Image className="w-3.5 h-3.5 opacity-60" />
                                Upload Photo
                              </button>
                            )}
                            {vDetails.phone && (
                              <>
                                <span className="text-zinc-700 text-[9px] select-none">•</span>
                                <a
                                  href={`tel:${vDetails.phone}`}
                                  className="text-[10px] text-zinc-400 hover:text-foreground font-black uppercase tracking-wider inline-flex items-center gap-1 hover:underline transition-all"
                                >
                                  <Phone className="w-3.5 h-3.5 text-zinc-500" />
                                  Call
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1 bg-white/5 border border-border/60 px-2 py-0.5 rounded-lg text-[10px] font-bold text-zinc-300">
                            <ShieldCheck className="h-3 w-3 text-success" />
                            <span>{verifiedItems}/{items.length} verified</span>
                            <span className="text-zinc-500 font-normal font-mono">· {stableItems} stable</span>
                          </div>
                          <Badge variant="outline" className={`font-bold text-[9px] px-2 py-0.5 border flex items-center gap-1.5 ${
                            (items[0]?.crowd_density || "").includes("High")
                              ? "bg-red-500/5 text-red-500 border-red-500/20"
                              : (items[0]?.crowd_density || "").includes("Moderate")
                                ? "bg-amber-500/5 text-amber-500 border-amber-500/20"
                                : "bg-emerald-500/5 text-emerald-500 border-emerald-500/20"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                              (items[0]?.crowd_density || "").includes("High")
                                ? "bg-red-500"
                                : (items[0]?.crowd_density || "").includes("Moderate")
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                            }`} />
                            Crowd: {items[0]?.crowd_density || "Low Queue"}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-1 mt-3">
                        {filteredItems.map((it) => {
                          const open = isTimeInRange(new Date(), it.available_from, it.available_until);
                          const isDirectUpi = it.venue_name.toLowerCase().includes("canteen") || it.venue_name.toLowerCase().includes("center") || it.venue_name.toLowerCase().includes("dhaba");
                          const isEditing = editingItemId === it.id;

                          return (
                            <div key={it.id} className="flex items-center justify-between rounded-xl bg-surface border border-border p-3 gap-4 hover:bg-surface-raised/10 transition-colors">
                              {isEditing ? (
                                <div className="flex flex-col gap-2 w-full">
                                  <div className="flex gap-2">
                                    <Input
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      placeholder="Item Name"
                                      className="bg-surface-raised border-border text-foreground placeholder:text-muted-foreground text-xs font-semibold flex-1 h-8"
                                    />
                                    <Input
                                      value={editPrice}
                                      onChange={(e) => setEditPrice(e.target.value)}
                                      placeholder="Price (₹)"
                                      type="number"
                                      step="0.01"
                                      className="bg-surface-raised border-border text-foreground placeholder:text-muted-foreground text-xs font-semibold w-24 h-8 font-mono"
                                    />
                                  </div>
                                  <p className="text-[9px] text-zinc-500 font-semibold leading-relaxed">
                                    Student corrections go to pending verification. Trusted menu data changes only after enough independent confirmations.
                                  </p>
                                  <div className="flex gap-1.5 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => setEditingItemId(null)}
                                      className="px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold text-[9px] uppercase cursor-pointer border border-border transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleEditSave(it.id)}
                                      disabled={editMutation.isPending}
                                      className="px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[9px] uppercase cursor-pointer disabled:opacity-50 transition-colors"
                                    >
                                      {editMutation.isPending ? "Saving..." : "Send Correction"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-xs font-bold text-foreground truncate">{it.item_name}</p>
                                      {it.verification_votes >= 3 && (
                                        <span className="inline-flex items-center gap-0.5 px-1 py-0.25 rounded bg-emerald-500/10 border border-emerald-500/20 text-[7px] text-emerald-500 font-bold uppercase tracking-wider shrink-0" title="Verified by multiple campus transactions">
                                          Verified
                                        </span>
                                      )}
                                      {it.was_corrected && (
                                        <span className="inline-flex items-center gap-0.5 px-1 py-0.25 rounded bg-primary/10 border border-primary/20 text-[7px] text-primary font-bold uppercase tracking-wider shrink-0" title={`Auto-corrected from "${it.original_name}"`}>
                                          Corrected
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingItemId(it.id);
                                          setEditName(it.item_name);
                                          setEditPrice((it.price / 100).toString());
                                        }}
                                        className="text-[9px] text-zinc-500 hover:text-primary font-bold uppercase tracking-wider cursor-pointer bg-transparent border-0 transition-colors"
                                      >
                                        Suggest Correction
                                      </button>
                                    </div>
                                    <p className={`text-[10px] ${open ? "text-success font-semibold" : "text-muted-foreground"}`}>
                                      {open ? "Available Now" : `Available ${fmtTime(it.available_from)} - ${fmtTime(it.available_until)}`}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wide uppercase ${
                                        isDirectUpi ? "bg-success/10 text-success border border-success/20" : "bg-warning/10 text-warning border border-warning/20"
                                      }`}>
                                        {isDirectUpi ? "Campus/direct" : "Delivery/aggregator"}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-3 shrink-0">
                                    {renderSparkline(it.price_history)}
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="tnum text-xs font-black text-primary font-mono shrink-0">{rupees(it.price)}</span>
                                      {it.price_stable ? (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-success/10 text-success text-[7px] font-black uppercase tracking-wider border border-success/20">
                                          ✓ Stable Price
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[7px] font-black uppercase tracking-wider border border-amber-500/20">
                                          ⚠ {it.price_change_pct > 0 ? `+${it.price_change_pct}% Hike` : `${it.price_change_pct}% Hike`}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {!hasVisibleCanteens && (
                  <p className="py-8 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                    {maxBudgetFilter !== null ? "No menu items match your budget filter." : "No active menus defined yet."}
                  </p>
                )}
              </div>
            )}

            {foodTab === "verify" && (
              <div className="mt-4 space-y-4 animate-[fadeIn_0.2s_ease-out]">
                <div className="bg-warning/5 border border-warning/10 p-3.5 rounded-xl text-[10px] text-zinc-400 leading-relaxed font-semibold">
                  <span className="text-warning font-black">Pending Menu Candidates:</span> These come from privacy-safe campus patterns, menu scans, or manual corrections. Tap <strong className="text-foreground">Confirm Price</strong> only when you recognize the item and price. Candidates need <strong className="text-warning">3 confirmations</strong> to become trusted.
                </div>

                {Object.entries(
                  ((pendingFoods ?? []) as Food[]).reduce<Record<string, Food[]>>((acc, f) => {
                    (acc[f.venue_name] ??= []).push(f);
                    return acc;
                  }, {}),
                ).map(([venue, items]) => {
                  const vDetails = getVenueDetails(venue);
                  return (
                    <div key={venue} className="space-y-2 border border-warning/20 bg-warning/5 p-4 rounded-2xl">
                      <div className="flex justify-between items-start pb-1 border-b border-warning/10">
                        <h4 className="text-xs font-black uppercase tracking-wider text-warning">{venue}</h4>
                        {vDetails.phone && (
                          <a
                            href={`tel:${vDetails.phone}`}
                            className="text-[9px] text-zinc-400 hover:text-foreground font-bold uppercase tracking-wider inline-flex items-center gap-0.5 hover:underline"
                          >
                            <Phone className="h-3 w-3" />
                            Call
                          </a>
                        )}
                      </div>

                      <div className="space-y-1">
                        {items.map((pit) => {
                          const votes = pit.verification_votes ?? 0;
                          const hasConfirmed = confirmedItemIds.includes(pit.id);
                          return (
                            <div 
                              key={pit.id} 
                              className={`flex items-center justify-between rounded-xl border p-3 gap-4 transition-all duration-300 ${
                                hasConfirmed 
                                  ? "bg-success/5 border-success/30 shadow-[0_0_12px_rgba(34,197,94,0.05)]" 
                                  : "bg-surface border-border"
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <p className="text-xs font-bold text-foreground truncate">{pit.item_name}</p>
                                <p className={`text-[9px] font-bold uppercase tracking-wider leading-none mt-0.5 ${
                                  hasConfirmed ? "text-success" : "text-zinc-500"
                                }`}>
                                  {hasConfirmed ? "✓ Confirmed by You" : `Votes: ${votes}/3 Confirmed`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`tnum text-xs font-black font-mono shrink-0 ${
                                  hasConfirmed ? "text-success" : "text-warning"
                                }`}>{rupees(pit.price)}</span>
                                <button
                                  type="button"
                                  onClick={() => handleVerifyVote(pit.id, "up")}
                                  disabled={verifyMutation.isPending || hasConfirmed}
                                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all duration-300 ${
                                    hasConfirmed
                                      ? "bg-success/15 border border-success/30 text-success cursor-default"
                                      : "bg-warning/15 hover:bg-warning/20 border border-warning/20 text-warning"
                                  }`}
                                >
                                  {hasConfirmed ? "Confirmed" : "Confirm Price"}
                                </button>
                                {!hasConfirmed && (
                                  <button
                                    type="button"
                                    onClick={() => handleVerifyVote(pit.id, "down")}
                                    disabled={verifyMutation.isPending}
                                    className="px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all duration-300 bg-surface hover:bg-destructive/10 border border-border hover:border-destructive/25 text-zinc-500 hover:text-destructive"
                                  >
                                    Wrong
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {(!pendingFoods || pendingFoods.length === 0) && (
                  <p className="py-8 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">No suggested items pending verification.</p>
                )}
              </div>
            )}

            {foodTab === "scan" && (
              <div className="space-y-6 py-4 animate-[fadeIn_0.2s_ease-out]">
                {/* Section 1: Scan Menu Board Image */}
                <div className="space-y-4 border border-border bg-surface-raised/20 p-4 rounded-2xl">
                  <h3 className="text-xs font-black uppercase tracking-wider text-primary">Scan Menu Photo</h3>
                  <p className="text-[10px] text-zinc-400 font-semibold leading-relaxed">
                    Upload a clear menu card or price board photo. OCR will parse candidate items for community review before they become trusted.
                  </p>
                  <form onSubmit={handleScanSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Canteen / Venue Name</label>
                      {scanVenueMode === "select" && activeVenues.length > 0 ? (
                        <select
                          value={scanVenue}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "__new__") {
                              setScanVenueMode("custom");
                              setScanVenue("");
                            } else {
                              setScanVenue(val);
                              setManualVenue(val);
                            }
                          }}
                          className="w-full bg-surface border border-border text-xs font-semibold rounded-lg p-2 h-9 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">-- Select Existing Canteen --</option>
                          {activeVenues.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                          <option value="__new__">+ Register New Canteen...</option>
                        </select>
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            id="input-scan-venue"
                            placeholder="e.g. Hostel 4 Canteen, Nescafe, Main Cafeteria"
                            value={scanVenue}
                            onChange={(e) => {
                              setScanVenue(e.target.value);
                              setManualVenue(e.target.value);
                            }}
                            className="bg-surface border-border text-xs font-semibold flex-1"
                            required
                          />
                          {activeVenues.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setScanVenueMode("select");
                                setScanVenue(activeVenues[0]);
                                setManualVenue(activeVenues[0]);
                              }}
                              className="px-2 py-1 text-[9px] bg-zinc-850 hover:bg-zinc-800 text-zinc-300 font-bold uppercase rounded border border-border/80 cursor-pointer shrink-0"
                            >
                              Dropdown List
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Menu Photo</label>
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-32 border border-dashed border-border rounded-xl cursor-pointer bg-surface hover:bg-surface-raised transition-all">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <ShoppingBag className="w-8 h-8 text-muted-foreground mb-2" />
                            <p className="text-xs text-zinc-300 font-semibold">
                              {scanFile ? scanFile.name : "Select or Drop Menu Photo"}
                            </p>
                            <p className="text-[10px] text-zinc-500 mt-1">Use a straight, well-lit PNG/JPG under 5MB</p>
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
                      className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-black uppercase text-xs h-10 tracking-wider disabled:opacity-50 cursor-pointer"
                    >
                      {scanBusy ? "Reading menu... Please wait" : "Scan for Review"}
                    </Button>
                  </form>
                </div>

                {/* Section 2: Manually Add Food Item */}
                <div className="space-y-4 border border-border bg-surface-raised/20 p-4 rounded-2xl">
                  <h3 className="text-xs font-black uppercase tracking-wider text-warning">Manually Add Item</h3>
                  <p className="text-[10px] text-zinc-400 font-semibold leading-relaxed">
                    Useful for items that are ordered verbally or have unlisted custom pricing.
                  </p>
                  <form onSubmit={handleManualSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Canteen / Venue Name</label>
                      {manualVenueMode === "select" && activeVenues.length > 0 ? (
                        <select
                          value={manualVenue}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "__new__") {
                              setManualVenueMode("custom");
                              setManualVenue("");
                            } else {
                              setManualVenue(val);
                              setScanVenue(val);
                            }
                          }}
                          className="w-full bg-surface border border-border text-xs font-semibold rounded-lg p-2 h-9 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">-- Select Existing Canteen --</option>
                          {activeVenues.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                          <option value="__new__">+ Register New Canteen...</option>
                        </select>
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            placeholder="e.g. BH-2 Night Canteen, Juice Center"
                            value={manualVenue}
                            onChange={(e) => {
                              setManualVenue(e.target.value);
                              setScanVenue(e.target.value);
                            }}
                            className="bg-surface border-border text-xs font-semibold flex-1"
                            required
                          />
                          {activeVenues.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setManualVenueMode("select");
                                setManualVenue(activeVenues[0]);
                                setScanVenue(activeVenues[0]);
                              }}
                              className="px-2 py-1 text-[9px] bg-zinc-850 hover:bg-zinc-800 text-zinc-300 font-bold uppercase rounded border border-border/80 cursor-pointer shrink-0"
                            >
                              Dropdown List
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <div className="space-y-1.5 flex-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Item Name</label>
                        <Input
                          placeholder="e.g. Masala Chai, Veg Maggi"
                          value={manualItemName}
                          onChange={(e) => setManualItemName(e.target.value)}
                          className="bg-surface border-border text-xs font-semibold"
                          required
                        />
                      </div>

                      <div className="space-y-1.5 w-28">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Price (₹)</label>
                        <Input
                          placeholder="e.g. 15"
                          value={manualPrice}
                          onChange={(e) => setManualPrice(e.target.value)}
                          type="number"
                          step="0.01"
                          className="bg-surface border-border text-xs font-semibold font-mono"
                          required
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={manualBusy}
                      className="w-full bg-warning hover:bg-warning/95 text-warning-foreground font-black uppercase text-xs h-10 tracking-wider disabled:opacity-50 cursor-pointer"
                    >
                      {manualBusy ? "Saving item..." : "Save for Verification"}
                    </Button>
                  </form>
                </div>
              </div>
            )}
        </ResponsiveFoodPanel>

        {/* UPI Payment Dialog */}
        <Dialog open={!!upiPayItem} onOpenChange={(o) => !o && setUpiPayItem(null)}>
          <DialogContent className="sm:max-w-md bg-background border border-border text-foreground" id="dialog-upi-payment">
            {upiPayItem && (() => {
              const details = getVenueDetails(upiPayItem.venue_name);
              const hasVerifiedUpi = Boolean(details.upi);
              const upiUri = hasVerifiedUpi ? `upi://pay?pa=${details.upi}&pn=${encodeURIComponent(details.displayName)}&am=${(upiPayItem.price / 100).toFixed(2)}&cu=INR` : "";
              const qrCodeUrl = hasVerifiedUpi ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiUri)}` : "";

              return (
                <div className="space-y-4">
                  <DialogHeader>
                    <DialogTitle className="text-sm font-black uppercase tracking-wider text-foreground">
                      {hasVerifiedUpi ? "Quick UPI Payment" : "Record Campus Payment"}
                    </DialogTitle>
                  </DialogHeader>
                  
                  <div className="text-center space-y-2">
                    <p className="text-xs text-zinc-400 font-medium">
                      Pay <strong className="text-foreground">{upiPayItem.item_name}</strong> at <strong className="text-foreground">{upiPayItem.venue_name}</strong>
                    </p>
                    <p className="text-2xl font-black text-primary font-mono">{rupees(upiPayItem.price)}</p>
                  </div>

                  {hasVerifiedUpi ? (
                    <>
                      <div className="flex justify-center p-3 bg-white rounded-2xl w-48 h-48 mx-auto border border-border">
                        <img
                          src={qrCodeUrl}
                          alt="UPI QR Code"
                          className="w-full h-full object-contain"
                        />
                      </div>

                      <div className="bg-surface-raised border border-border rounded-xl p-3 text-center space-y-1">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Verified UPI ID</p>
                        <p className="text-xs font-mono font-bold text-foreground select-all">{details.upi}</p>
                        <button
                          type="button"
                          onClick={() => {
                            if (!details.upi) return;
                            navigator.clipboard.writeText(details.upi);
                            toast.success("UPI ID copied!");
                          }}
                          className="text-[9px] text-primary font-bold uppercase tracking-wider hover:underline mt-1 cursor-pointer block mx-auto bg-transparent border-0 font-sans"
                        >
                          Copy UPI ID
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="bg-surface-raised border border-border rounded-xl p-3 text-center space-y-1">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">No verified UPI stored</p>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Pay at the counter or through your usual UPI app, then mark it paid here so your food routine and runway stay accurate.
                      </p>
                    </div>
                  )}

                  {/* Screenshot Receipt Review */}
                  <div className="border-t border-border/50 pt-3 space-y-2">
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest text-center">
                      Receipt Review
                    </p>
                    <div className="flex items-center justify-center">
                      <label className="flex flex-col items-center justify-center w-full h-20 border border-dashed border-border rounded-xl cursor-pointer bg-surface hover:bg-surface-raised/60 transition-all select-none">
                        <div className="flex flex-col items-center justify-center p-3 text-center">
                          <ShoppingBag className="w-5 h-5 text-zinc-400 mb-1" />
                          <p className="text-[10px] text-zinc-300 font-semibold truncate max-w-xs">
                            {receiptFile ? receiptFile.name : "Upload Payment Screenshot"}
                          </p>
                          <p className="text-[8px] text-zinc-500 mt-0.5">Extract receiver and amount for review</p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={receiptBusy}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setReceiptFile(e.target.files[0]);
                              handleReceiptUpload(e.target.files[0]);
                            }
                          }}
                        />
                      </label>
                    </div>
                    {receiptBusy && (
                      <p className="text-[9px] text-center text-primary font-bold animate-pulse">Reading receipt for review...</p>
                    )}
                  </div>

                  <div className="flex gap-2 border-t border-border/50 pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setUpiPayItem(null)}
                      className="flex-1 bg-transparent hover:bg-white/5 text-zinc-300 font-bold uppercase text-xs h-10 tracking-wider"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={upiConfirming}
                      onClick={async () => {
                        setUpiConfirming(true);
                        try {
                          await insertTransaction({
                            data: {
                              amount: upiPayItem.price,
                              raw_merchant_string: upiPayItem.venue_name,
                              mapped_merchant_name: upiPayItem.venue_name,
                              category: "food",
                              source: "manual",
                            }
                          });
                          toast.success("Payment recorded!");
                          setUpiPayItem(null);
                          qc.invalidateQueries({ queryKey: ["txns"] });
                        } catch (err) {
                          toast.error("Failed to record payment.");
                        } finally {
                          setUpiConfirming(false);
                        }
                      }}
                      className="flex-1 bg-primary hover:bg-primary/95 text-primary-foreground font-black uppercase text-xs h-10 tracking-wider"
                    >
                      {upiConfirming ? "Recording..." : "I've Paid"}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Receipt Review Dialog */}
        <Dialog open={!!reconciledReceipt} onOpenChange={(o) => !o && setReconciledReceipt(null)}>
          <DialogContent className="sm:max-w-md bg-background border border-border text-foreground text-center space-y-4" id="dialog-receipt-reconciled">
            <DialogHeader>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 border border-primary/30 text-primary">
                <Receipt className="h-5 w-5" />
              </div>
              <DialogTitle className="text-sm font-black uppercase tracking-wider text-primary mt-2">
                Receipt saved for review
              </DialogTitle>
            </DialogHeader>
            {reconciledReceipt && (
              <div className="space-y-4">
                <p className="text-xs text-zinc-300 font-semibold leading-relaxed">
                  We processed your screenshot and saved a pending candidate. Please confirm the details before it affects menus or spending.
                </p>
                <div className="bg-surface border border-border p-3.5 rounded-xl space-y-2 font-mono text-xs text-left">
                  <div className="flex justify-between border-b border-border/50 pb-1.5">
                    <span className="text-[10px] text-zinc-500 uppercase font-black font-sans">Merchant</span>
                    <span className="font-bold text-foreground">{reconciledReceipt.venue_name || "Needs review"}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/50 pb-1.5">
                    <span className="text-[10px] text-zinc-500 uppercase font-black font-sans">Item</span>
                    <span className="font-bold text-primary">{reconciledReceipt.item_name || "Not auto-selected"}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/50 pb-1.5">
                    <span className="text-[10px] text-zinc-500 uppercase font-black font-sans">Amount Parsed</span>
                    <span className="font-bold text-success">{reconciledReceipt.amount != null ? `₹${reconciledReceipt.amount.toFixed(2)}` : "Needs review"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-zinc-500 uppercase font-black font-sans">Reference ID</span>
                    <span className="font-bold text-zinc-400 select-all">{reconciledReceipt.transaction_id || "Not found"}</span>
                  </div>
                </div>
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                  No spending totals or menu prices change until this is confirmed.
                </p>
                <Button
                  onClick={() => {
                    setReconciledReceipt(null);
                    setUpiPayItem(null);
                  }}
                  className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-black uppercase text-xs h-10 tracking-wider cursor-pointer"
                >
                  Close
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Check-in dialog */}
        <Dialog open={showCheckIn} onOpenChange={setShowCheckIn}>
          <DialogContent id="dialog-checkin">
            <DialogHeader>
              <DialogTitle>Hey, it's been a while since your last meal.</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground">It's exam season. Quick check:</p>
            <p className="text-[12px] text-warning">Last food transaction was {Math.round(foodGapHours)} hours ago</p>
            <div className="mt-3 space-y-2">
              <button
                id="btn-checkin-ate"
                onClick={handleCheckInAte}
                className="w-full rounded-md border-l-4 border-l-success bg-surface p-3 text-left text-[13px] cursor-pointer hover:bg-surface-raised transition-colors"
              >
                I ate at mess / cooked / ordered in
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
                      value={stressNote}
                      onChange={(e) => setStressNote(e.target.value)}
                      placeholder="e.g., was studying, mess closed, no money"
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
                onClick={() => setShowCheckIn(false)}
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
