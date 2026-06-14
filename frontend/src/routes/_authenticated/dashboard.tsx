import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
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
} from "@/lib/api/db.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  component: Dashboard,
});

type Profile = any;
type Txn = any;
type Food = any;
type Sub = any;
type Pool = any;
type PoolItem = any;

const CATEGORIES = [
  { v: "food", l: "Food" },
  { v: "stationery", l: "Stationery" },
  { v: "travel", l: "Travel" },
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
                    ? "linear-gradient(to top, #C27D56, #D9A05B)"
                    : "rgba(255,255,255,0.1)",
                }}
              />
            </div>
            <span className={`text-[8px] font-bold uppercase tracking-wide ${isToday ? "text-accent-bronze" : "text-zinc-600"}`}>
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
  return (
    <div className="flex items-end gap-1 tnum">
      {days > 0 && <><span className="text-[22px] font-black leading-none text-foreground">{days}</span><span className="text-[9px] text-zinc-500 font-bold mb-1">d</span></>}
      <span className="text-[22px] font-black leading-none text-foreground">{pad(hrs)}</span>
      <span className="text-[9px] text-zinc-500 font-bold mb-1">h</span>
      <span className="text-[22px] font-black leading-none text-foreground">{pad(mins)}</span>
      <span className="text-[9px] text-zinc-500 font-bold mb-1">m</span>
      <span className="text-[22px] font-black leading-none" style={{ color: secs % 2 === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)", transition: "color 0.3s" }}>{pad(secs)}</span>
      <span className="text-[9px] text-zinc-500 font-bold mb-1">s</span>
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
  icon, accent, title, body, onDismiss,
}: {
  icon: string; accent: string; title: string; body: string; onDismiss: () => void;
}) {
  return (
    <div
      className="relative rounded-2xl border p-4 overflow-hidden animate-[nudgePop_0.4s_cubic-bezier(0.34,1.56,0.64,1)]"
      style={{ background: `${accent}0D`, borderColor: `${accent}30` }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${accent}10, transparent 60%)` }} />
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: accent }}>{title}</p>
          <p className="text-[12px] text-zinc-300 leading-relaxed">{body}</p>
        </div>
        <button onClick={onDismiss} className="text-zinc-600 hover:text-zinc-400 text-xs shrink-0 cursor-pointer leading-none">✕</button>
      </div>
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();

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

  // Burnout score derived from insights
  const calc = useMemo(() => {
    if (!profile) return null;
    const totalAllowance = profile.monthly_allowance / 100;
    const cycleStart = getCycleStart(profile.cycle_start_day);
    const cycleEnd = getCycleEnd(cycleStart);
    const cycleTxns = (txns ?? []).filter((t) => new Date(t.created_at) >= cycleStart);
    const totalSpent = cycleTxns.reduce((s, t) => s + t.amount, 0) / 100;
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
    };
  }, [profile, txns]);

  // ── Burnout Risk Score (0–100) ────────────────────────────────────────
  const burnoutScore = useMemo(() => {
    let score = 0;
    if (insights?.food?.gap_hours) {
      const gap = insights.food.gap_hours;
      if (gap > 20) score += 40;
      else if (gap > 12) score += 25;
      else if (gap > 8) score += 10;
    }
    if (insights?.exam?.in_exam_period) score += 20;
    if ((insights?.velocity?.pct_change ?? 0) > 30) score += 15;
    if ((insights?.late_night?.txn_count ?? 0) > 5) score += 15;
    if ((insights?.food?.delivery_count_30d ?? 0) > (insights?.food?.mess_count_30d ?? 0)) score += 10;
    if (calc && calc.runwayDays < 7) score += 20;
    return Math.min(100, score);
  }, [insights, calc]);

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
  const [adding, setAdding] = useState(false);
  const [showFoodSheet, setShowFoodSheet] = useState(false);

  // Exam check-in
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInExpanded, setCheckInExpanded] = useState(false);
  const [stressNote, setStressNote] = useState("");
  const checkinChecked = useRef(false);

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

  const foodGapHours = useMemo(() => {
    const lastFood = (txns ?? []).find((t) => t.category === "food");
    return lastFood ? (Date.now() - new Date(lastFood.created_at).getTime()) / 3600000 : 0;
  }, [txns]);

  // ── Smart nudges derived from insights ──────────────────────────────────
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());
  const dismiss = (id: string) => setDismissedNudges((s) => new Set([...s, id]));

  const nudges = useMemo(() => {
    const list: { id: string; icon: string; accent: string; title: string; body: string }[] = [];
    if (!insights) {
      // Hardcoded fallback when no data yet
      list.push({
        id: "onboard",
        icon: "👋",
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
        icon: "🍕",
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
        icon: "🌙",
        accent: "#5E17EB",
        title: "Late-night spending detected",
        body: `₹${Math.round(lateTotal)} spent between 11PM–4AM this month. Late orders often cost 1.5× more with surge fees — try stocking room snacks.`,
      });
    }

    // Exam stress
    if (insights.exam?.in_exam_period) {
      list.push({
        id: "exam_stress",
        icon: "📚",
        accent: "#ef4444",
        title: `Exam period — ${insights.exam.days_left}d left`,
        body: "Your budget matters most right now. Aim for mess meals to keep daily food cost under ₹80. Campus canteens are usually open late.",
      });
    }

    // Spending velocity spike
    const vel = insights.velocity?.pct_change ?? 0;
    if (vel > 30) {
      list.push({
        id: "velocity_spike",
        icon: "📈",
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
        icon: "💸",
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

  return (
    <AppShell>
      <div className="pb-16 pt-8">
        {/* Top bar mobile */}
        <div className="flex md:hidden items-center justify-between px-2 mb-6">
          <h1 id="logo-dashboard" className="text-[12px] font-black tracking-[0.2em] text-foreground uppercase">
            Dashboard
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav({ to: "/companion" })}
              title={compStatus === "green" ? "Companion syncing" : compStatus === "amber" ? "Companion idle" : "No companion"}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-surface border border-border"
            >
              <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${compStatus === "green" ? "bg-success" : compStatus === "amber" ? "bg-warning" : "bg-destructive"}`} />
            </button>
            <Badge variant="outline" id="badge-wing" className="bg-white/5 border-border text-foreground font-bold text-[10px]">
              {profile?.wing_label ?? "—"}
            </Badge>
          </div>
        </div>

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

            {/* Runway Hero */}
            <div id="card-runway-status" className="bg-surface rounded-2xl border border-border relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent-bronze via-accent-amber to-accent-copper opacity-80" />
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Runway Status</p>
                  <div className="hidden md:flex items-center gap-3">
                    <Badge variant="outline" className="bg-white/5 border-border text-foreground font-bold text-[10px] px-2.5 py-0.5">
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
                    <p className="mt-3 text-xs md:text-sm text-zinc-400 font-semibold leading-relaxed">
                      Remaining allowance until <span className="text-foreground font-bold">{rupees(calc.totalAllowance * 100)}</span> resets on <span className="text-foreground font-bold">{shortDate(calc.cycleEnd)}</span>
                    </p>

                    <div className="mt-8 grid grid-cols-3 gap-3 md:gap-6 border-t border-border pt-6">
                      <div className="flex flex-col gap-1">
                        <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Balance</p>
                        <p className="text-[18px] md:text-[22px] font-black text-foreground tnum">{rupees(calc.remaining * 100)}</p>
                      </div>
                      <div className="flex flex-col gap-1 border-l border-border pl-4 md:pl-6">
                        <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Safe Limit</p>
                        <p className="text-[18px] md:text-[22px] font-black text-foreground tnum">{rupees(calc.safeDailyLimit * 100)}</p>
                      </div>
                      <div className="flex flex-col gap-1 border-l border-border pl-4 md:pl-6">
                        <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Today</p>
                        <p className="text-[18px] md:text-[22px] font-black text-foreground tnum">{rupees(calc.spentToday * 100)}</p>
                      </div>
                    </div>

                    <div className="mt-8">
                      <Progress id="progress-runway" value={calc.pct} className="h-1 bg-surface-raised" />
                      <div className="mt-3 text-[11px] text-muted-foreground flex items-center justify-between font-medium">
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
                        <span className="font-bold text-foreground">{calc.pct}% Spent</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Behaviour Analytics Row ─────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* 7-day spend bar chart */}
              <div className="bg-surface border border-border rounded-2xl p-5">
                <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">7-Day Spend</p>
                {insights?.daily_spend_7d ? (
                  <>
                    <SpendBar days={insights.daily_spend_7d} />
                    {(insights.velocity?.pct_change ?? 0) !== 0 && (
                      <p className={`mt-3 text-[10px] font-bold ${insights.velocity.pct_change > 0 ? "text-destructive" : "text-success"}`}>
                        {insights.velocity.pct_change > 0 ? "▲" : "▼"} {Math.abs(insights.velocity.pct_change)}% vs last week
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-end gap-1.5 h-16">
                    {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                      <div key={i} className="flex flex-col items-center gap-1 flex-1">
                        <div className="w-full rounded-sm bg-white/10" style={{ height: `${20 + Math.random() * 60}%`, minHeight: "8px" }} />
                        <span className="text-[8px] text-zinc-600 font-bold">{d}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Category breakdown donut */}
              <div className="bg-surface border border-border rounded-2xl p-5">
                <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">Spend by Category</p>
                {insights?.category_breakdown?.length ? (
                  <CategoryDonut breakdown={insights.category_breakdown} />
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-accent-bronze" />
                    <p className="text-[11px] text-zinc-500">No data yet — start logging transactions</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Food & Wellness Strip ───────────────────────────────── */}
            <div className="bg-surface border border-border rounded-2xl p-5">
              <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-500 uppercase mb-4">Food & Wellness</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Food gap */}
                <div className="flex flex-col gap-1">
                  <p className="text-[8px] text-zinc-600 uppercase tracking-wider font-bold">Last meal</p>
                  {insights ? (
                    <p className={`text-[15px] font-black tnum ${insights.food.gap_hours > 12 ? "text-destructive" : insights.food.gap_hours > 6 ? "text-warning" : "text-success"}`}>
                      {insights.food.gap_hours > 0 ? `${Math.round(insights.food.gap_hours)}h ago` : "—"}
                    </p>
                  ) : (
                    <p className="text-[15px] font-black text-zinc-400">{foodGapHours > 0 ? `${Math.round(foodGapHours)}h ago` : "—"}</p>
                  )}
                  <p className="text-[9px] text-zinc-600">food gap</p>
                </div>

                {/* Delivery vs mess */}
                <div className="flex flex-col gap-1">
                  <p className="text-[8px] text-zinc-600 uppercase tracking-wider font-bold">Delivery</p>
                  <p className="text-[15px] font-black text-foreground">
                    {insights?.food?.delivery_count_30d ?? "—"}×
                  </p>
                  <p className="text-[9px] text-zinc-600">vs {insights?.food?.mess_count_30d ?? "—"} mess visits</p>
                </div>

                {/* Late night */}
                <div className="flex flex-col gap-1">
                  <p className="text-[8px] text-zinc-600 uppercase tracking-wider font-bold">Late Night 🌙</p>
                  <p className="text-[15px] font-black text-foreground tnum">
                    {insights ? rupees(insights.late_night.total_paise) : "—"}
                  </p>
                  <p className="text-[9px] text-zinc-600">{insights?.late_night?.txn_count ?? 0} txns after 11PM</p>
                </div>

                {/* Sub bleed */}
                <div className="flex flex-col gap-1">
                  <p className="text-[8px] text-zinc-600 uppercase tracking-wider font-bold">Sub Bleed</p>
                  <p className="text-[15px] font-black text-foreground tnum">
                    {insights ? rupees(insights.subscriptions.monthly_bleed_paise) : "—"}
                  </p>
                  <p className="text-[9px] text-zinc-600">/month in {insights?.subscriptions?.count ?? 0} subs</p>
                </div>
              </div>

              {/* Mess vs delivery bar */}
              {insights?.food && (insights.food.delivery_count_30d + insights.food.mess_count_30d) > 0 && (
                <div className="mt-5 pt-4 border-t border-border">
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mb-2">Mess vs Delivery ratio (30d)</p>
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
                    <span className="text-[8px] text-success font-bold">Mess {insights.food.mess_count_30d}</span>
                    <span className="text-[8px] text-warning font-bold">Delivery {insights.food.delivery_count_30d}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Active Pools */}
            <section id="section-active-pools" className="space-y-4 pt-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-bold tracking-[0.25em] text-zinc-500 uppercase">Active Wing Pools</h3>
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
                    <p className="text-[11px] text-zinc-500 mt-1">Start one now to split quick commerce delivery fees.</p>
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
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black uppercase tracking-wider text-foreground">{p.platform.replace("_", " ")}</span>
                                <Badge variant="outline" className="text-muted-foreground bg-white/5 border-border text-[9px] font-bold">{p.wing_label}</Badge>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border border-border bg-background tnum ${minsLeft < 5 ? "text-destructive animate-pulse border-destructive/20 bg-destructive/5" : "text-foreground"}`}>
                                {minsLeft}m left
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">Host: <span className="font-semibold text-foreground capitalize">{p.created_by_name || "—"}</span></p>
                          </div>
                          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Cart</span>
                              <span className="text-xs font-black text-foreground">{rupees(total)} <span className="text-zinc-500 font-normal text-[10px]">/ {rupees(p.min_cart_value)} min</span></span>
                            </div>
                            <div className="flex flex-col text-right">
                              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Split Est.</span>
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

            {/* ── Burnout Risk + Survive Countdown ─────────────────── */}
            <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at top right, ${burnoutScore >= 70 ? "rgba(239,68,68,0.08)" : burnoutScore >= 40 ? "rgba(245,158,11,0.06)" : "rgba(74,222,128,0.05)"}, transparent 65%)` }} />
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Burnout Risk Index</p>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${burnoutScore >= 70 ? "text-destructive border-destructive/30 bg-destructive/10" : burnoutScore >= 40 ? "text-warning border-warning/30 bg-warning/10" : "text-success border-success/30 bg-success/10"}`}>
                  {burnoutScore >= 70 ? "⚠ HIGH" : burnoutScore >= 40 ? "△ MODERATE" : "✓ HEALTHY"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <BurnoutGauge score={burnoutScore} />
                <div className="flex-1 space-y-2.5">
                  <div>
                    <p className="text-[8px] text-zinc-600 uppercase tracking-wider font-bold mb-0.5">Survive Until Broke</p>
                    {surviveUntilMs > 0 ? (
                      <SurviveCountdown runwayMs={surviveUntilMs} />
                    ) : (
                      <p className="text-[13px] font-black text-zinc-400">—</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Food gap", val: insights?.food?.gap_hours ? `${Math.round(insights.food.gap_hours)}h` : "—", danger: (insights?.food?.gap_hours ?? 0) > 10 },
                      { label: "Velocity", val: insights?.velocity?.pct_change ? `${insights.velocity.pct_change > 0 ? "+" : ""}${insights.velocity.pct_change}%` : "—", danger: (insights?.velocity?.pct_change ?? 0) > 30 },
                      { label: "Exam period", val: insights?.exam?.in_exam_period ? `${insights.exam.days_left}d left` : "No", danger: !!insights?.exam?.in_exam_period },
                    ].map(({ label, val, danger }) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-[9px] text-zinc-600">{label}</span>
                        <span className={`text-[9px] font-bold ${danger ? "text-warning" : "text-zinc-400"}`}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── AI Campus Intelligence (Bedrock) ──────────────────── */}
            <div className="bg-surface border border-border rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, rgba(140,120,83,0.07), transparent 60%)" }} />
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-accent-bronze to-accent-amber flex items-center justify-center shrink-0">
                  <span style={{ fontSize: "9px", fontWeight: 900, color: "#0A0A0A" }}>AI</span>
                </div>
                <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Campus Intelligence</p>
                {campusIntel?.source === "bedrock" && (
                  <span className="ml-auto text-[8px] font-black text-accent-bronze uppercase tracking-wider border border-accent-bronze/30 px-1.5 py-0.5 rounded-full">Bedrock</span>
                )}
              </div>
              {campusIntel?.summary ? (
                <p className="text-[12px] text-zinc-300 leading-relaxed">{campusIntel.summary}</p>
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
                    <p className="text-[8px] text-zinc-600 uppercase tracking-wider">This Week</p>
                    <p className="text-[12px] font-black text-foreground tnum">{rupees((campusIntel.spend_7d ?? 0) * 100)}</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-zinc-600 uppercase tracking-wider">Last Meal</p>
                    <p className={`text-[12px] font-black tnum ${(campusIntel.last_food_hours ?? 0) > 8 ? "text-warning" : "text-success"}`}>
                      {campusIntel.last_food_hours > 0 ? `${Math.round(campusIntel.last_food_hours)}h ago` : "—"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Wing Activity Feed ────────────────────────────────── */}
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Wing Activity</p>
                <span className="flex items-center gap-1.5 text-[8px] text-zinc-600 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Live
                </span>
              </div>
              <div className="space-y-3">
                {(wingFeed?.events ?? [
                  { icon: "🛒", text: "New Zepto pool started in Wing 4B", mins_ago: 3 },
                  { icon: "📍", text: "'BH-2 Night Canteen' identified and added to campus directory", mins_ago: 12 },
                  { icon: "🍽️", text: "A student checked in — ate at campus mess", mins_ago: 28 },
                ]).map((ev: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 animate-[fadeIn_0.4s_ease-out]" style={{ animationDelay: `${i * 80}ms` }}>
                    <span className="text-sm shrink-0 mt-0.5">{ev.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-zinc-300 leading-snug">{ev.text}</p>
                      <p className="text-[9px] text-zinc-600 mt-0.5 font-bold">
                        {ev.mins_ago === 0 ? "just now" : ev.mins_ago < 60 ? `${ev.mins_ago}m ago` : `${Math.floor(ev.mins_ago / 60)}h ago`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Exam banner */}
            {insights?.exam?.in_exam_period && (
              <div className="relative rounded-2xl overflow-hidden border border-red-500/20 bg-red-500/5 p-5">
                <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top, rgba(239,68,68,0.1), transparent 70%)" }} />
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[8px] font-black text-red-400 uppercase tracking-widest">📚 Exam Mode Active</span>
                  <span className="text-[8px] text-red-400 font-bold">· {insights.exam.days_left}d left</span>
                </div>
                <p className="text-[12px] text-zinc-300 leading-relaxed">
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
                  <p className="text-[10px] font-bold text-destructive tracking-widest uppercase">Runway Warning</p>
                </div>
                <p className="text-xs font-medium text-foreground leading-relaxed">
                  Daily limit is <span className="text-destructive font-bold">{rupees(calc.safeDailyLimit * 100)}</span>. Skip delivery orders tonight.
                </p>
                {bestFood && (
                  <div className="mt-4 rounded-lg border border-success/20 bg-success/5 p-3.5 space-y-1">
                    <p className="text-[9px] font-bold tracking-widest text-success uppercase">Dine In Option</p>
                    <p className="text-xs text-foreground leading-relaxed">
                      <span className="font-bold">{bestFood.venue_name}</span> has{" "}
                      <span className="font-semibold">{bestFood.item_name}</span> for{" "}
                      <strong className="text-success">{rupees(bestFood.price)}</strong>.
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setShowFoodSheet(true)}
                  className="mt-3 text-[11px] font-bold text-foreground hover:underline uppercase tracking-wider cursor-pointer"
                >
                  All Campus Foods →
                </button>
              </Card>
            )}

            {/* Collisions */}
            {collisions.length > 0 && (
              <section id="section-collisions" className="space-y-3">
                <h3 className="text-[10px] font-bold tracking-[0.25em] text-zinc-500 uppercase px-1">Budget Collisions</h3>
                <div className="space-y-3">
                  {collisions.length > 1 && (
                    <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 text-[11px]">
                      <p className="font-bold tracking-wider text-[9px] text-destructive uppercase mb-1">Cumulative Debit Impact</p>
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
                            <Badge className="ml-2 bg-white/5 border border-border text-[9px] font-bold px-1.5 py-0">Auto</Badge>
                          )}
                        </p>
                        <p className="text-xs font-bold text-destructive tnum">−{rupees(c.amount)}</p>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <p className="text-zinc-500 font-semibold">{shortDate(new Date(c.next_debit_date))}</p>
                        <p className="text-zinc-500">
                          Limit: <span className="text-foreground font-bold">{rupees(c.newLimit * 100)}</span>
                          {c.critical && <span className="ml-1.5 text-destructive font-bold">⚠</span>}
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
                <h3 className="text-[10px] font-bold tracking-[0.25em] text-zinc-500 uppercase">Recent Ledger</h3>
                <Link to="/transactions" id="link-see-all-txns" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
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
                              <span className="text-[9px] font-black tracking-widest text-zinc-500 uppercase">{t.category}</span>
                            )}
                            {t.source !== "manual" && (
                              <>
                                <span className="text-[9px] text-zinc-600 font-bold">•</span>
                                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider">{t.source.split("_")[1]}</span>
                              </>
                            )}
                            {!t.is_mapped && (
                              <button
                                id={`btn-identify-${t.id}`}
                                onClick={() => setIdentifying(t)}
                                className="ml-1 rounded-full px-2 py-0.5 text-[9px] font-bold bg-white/5 border border-border hover:bg-white/10 hover:border-white/15 transition-all cursor-pointer uppercase text-foreground"
                              >
                                Identify?
                              </button>
                            )}
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
                    className="w-full text-[10px] uppercase tracking-wider font-bold h-9 bg-surface-raised hover:bg-surface-interactive border-border"
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

        {/* Add txn */}
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent id="dialog-add-transaction">
            <AddTxnForm onClose={() => { setAdding(false); qc.invalidateQueries(); }} />
          </DialogContent>
        </Dialog>

        {/* Food options */}
        <Sheet open={showFoodSheet} onOpenChange={setShowFoodSheet}>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-auto">
            <SheetHeader><SheetTitle>Campus Food Options</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              {Object.entries(
                ((foods ?? []) as Food[]).reduce<Record<string, Food[]>>((acc, f) => {
                  (acc[f.venue_name] ??= []).push(f);
                  return acc;
                }, {}),
              ).map(([venue, items]) => (
                <div key={venue}>
                  <h4 className="text-[12px] font-semibold text-muted-foreground">{venue}</h4>
                  <div className="mt-1 space-y-1">
                    {items.map((it) => {
                      const open = isTimeInRange(new Date(), it.available_from, it.available_until);
                      return (
                        <div key={it.id} className="flex items-center justify-between rounded bg-surface p-2">
                          <div>
                            <p className="text-sm">{it.item_name}</p>
                            <p className={`text-[11px] ${open ? "text-success" : "text-muted-foreground"}`}>
                              {open ? "Open Now" : `Opens at ${fmtTime(it.available_from)}`}
                            </p>
                          </div>
                          <span className="tnum text-sm font-semibold">{rupees(it.price)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        {/* Check-in dialog */}
        <Dialog open={showCheckIn} onOpenChange={() => { /* not dismissible */ }}>
          <DialogContent
            id="dialog-checkin"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Hey, it's been a while since your last meal.</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground">It's exam season. Quick check:</p>
            <p className="text-[12px] text-warning">Last food transaction was {Math.round(foodGapHours)} hours ago</p>
            <div className="mt-3 space-y-2">
              <button
                id="btn-checkin-ate"
                onClick={handleCheckInAte}
                className="w-full rounded-md border-l-4 border-l-success bg-surface p-3 text-left text-[13px]"
              >
                I ate at mess / cooked / ordered in
              </button>
              <div className="rounded-md border-l-4 border-l-destructive bg-surface p-3">
                <button
                  id="btn-checkin-skipped"
                  onClick={() => setCheckInExpanded(true)}
                  className="w-full text-left text-[13px]"
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
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

function IdentifyForm({ txn, onClose }: { txn: Txn; onClose: () => void }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState<string>("food");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name) { toast.error("Enter shop name"); return; }
    setBusy(true);
    try {
      await identifyMerchant({ data: { txn_id: txn.id, raw_merchant_string: txn.raw_merchant_string, display_name: name, category: cat } });
      toast.success("Mapped! This helps everyone on campus.");
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
        {CATEGORIES.map((c) => (
          <button key={c.v} onClick={() => setCat(c.v)} className={`rounded-md border p-3 text-center text-sm ${cat === c.v ? "border-primary bg-primary/10" : "border-border bg-surface"}`}>{c.l}</button>
        ))}
      </div>
      <DialogFooter>
        <Button id="btn-save-merchant" disabled={busy} onClick={save} className="w-full bg-success text-white hover:bg-success/90">
          Save for everyone on campus
        </Button>
      </DialogFooter>
    </>
  );
}

function AddTxnForm({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [cat, setCat] = useState<string>("food");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!amount || !merchant) { toast.error("Fill all fields"); return; }
    setBusy(true);
    try {
      await insertTransaction({ data: { amount: Math.round(parseFloat(amount) * 100), raw_merchant_string: merchant, mapped_merchant_name: merchant, category: cat, source: "manual" } });
      toast.success("Transaction logged.");
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
      <div className="flex items-center rounded-md border border-input bg-surface">
        <span className="px-3 text-sm text-muted-foreground">₹</span>
        <input id="input-txn-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1 bg-transparent py-2 pr-3 text-sm outline-none" placeholder="Amount" />
      </div>
      <Input id="input-txn-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="BH-2 Night Canteen" />
      <div className="grid grid-cols-2 gap-2">
        {CATEGORIES.map((c) => (
          <button key={c.v} onClick={() => setCat(c.v)} className={`rounded-md border p-3 text-center text-sm ${cat === c.v ? "border-primary bg-primary/10" : "border-border bg-surface"}`}>{c.l}</button>
        ))}
      </div>
      <DialogFooter>
        <Button id="btn-submit-txn" disabled={busy} onClick={save} className="w-full">Add</Button>
      </DialogFooter>
    </>
  );
}
