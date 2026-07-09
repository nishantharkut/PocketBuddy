import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import {
  Smartphone,
  Edit3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  CreditCard,
  Server,
  Landmark,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  Calendar,
  Receipt,
  Zap,
  ShoppingBag,
  Clock,
  Utensils,
  BookOpen,
  Bus,
  Tv,
  GraduationCap,
  Coins,
  Gamepad2,
  HeartPulse,
  Wifi,
  Package,
  UploadCloud,
  FileSpreadsheet,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { rupees } from "@/lib/format";
import {
  getStats,
  getProfile,
  updateTransaction,
  getCatalog,
  addCatalogItem,
  submitParserCorrection,
  previewStatementImport,
  commitStatementImport,
  applyStatementVendorCategory,
  getStatementImportBatches,
  rollbackStatementImportBatch,
} from "@/lib/api/db.functions";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts";

export const Route = createLazyFileRoute("/_authenticated/transactions")({
  component: TxnsPage,
});


// Fallback categories used only if catalog API fails
const FALLBACK_CATEGORIES = [
  { v: "food", l: "Food" },
  { v: "stationery", l: "Stationery" },
  { v: "travel", l: "Travel" },
  { v: "subscription", l: "Subscription" },
  { v: "other", l: "Other" },
];

function getCatBadgeStyles(cat?: string): string {
  const c = (cat || "other").toLowerCase();
  if (c.includes("food") || c.includes("mess")) return "bg-orange-500/10 text-orange-500 border border-orange-500/20";
  if (c.includes("stationery") || c.includes("book") || c.includes("print")) return "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20";
  if (c.includes("travel") || c.includes("transport") || c.includes("bus")) return "bg-purple-500/10 text-purple-500 border border-purple-500/20";
  if (c.includes("subscription") || c.includes("recharge")) return "bg-blue-500/10 text-blue-500 border border-blue-500/20";
  if (c.includes("income") || c.includes("salary") || c.includes("allowance")) return "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
  return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20";
}
// ── Palette for pie slices ───────────────────────────────────────────────
const PIE_COLORS = [
  "#FF6B4A", "#FFB347", "#F7DC6F", "#82E0AA", "#5DADE2",
  "#AF7AC5", "#F1948A", "#85C1E9", "#F0B27A", "#A3E4D7",
  "#D4AC0D", "#E59866", "#7FB3D8", "#C39BD3", "#F5B7B1",
];

const CATEGORY_ICONS: Record<string, React.ComponentType<any>> = {
  food: Utensils,
  stationery: BookOpen,
  travel: Bus,
  transport: Bus,
  subscription: Tv,
  education: GraduationCap,
  salary: Coins,
  income: Coins,
  allowance: Coins,
  entertainment: Gamepad2,
  shopping: ShoppingBag,
  health: HeartPulse,
  recharge: Wifi,
  other: Package,
};

function getCategoryIcon(cat: string, className = "h-4 w-4") {
  const lower = (cat || "").toLowerCase();
  for (const [key, IconComponent] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key)) return <IconComponent className={className} />;
  }
  return <Package className={className} />;
}

type ViewTab = "daily" | "calendar" | "monthly" | "total";
type TrustTone = "success" | "warning" | "muted" | "primary";
type TrustBadge = { label: string; tone: TrustTone; title: string };

function transactionTrustBadges(txn: any): TrustBadge[] {
  const badges: TrustBadge[] = [];
  const source = String(txn.source || "").toLowerCase();
  const isCompanion = source.startsWith("companion");
  const needsReview = txn.needs_verification === true || txn.verification_status === "needs_review";
  const bankVerified = txn.verification_status === "aa_verified" || txn.data_origin === "account_aggregator";
  const userReviewed = Boolean(txn.user_confirmed_at || txn.user_corrected || txn.verification_status === "user_reviewed");
  const onDevice =
    txn.data_origin === "android_on_device" ||
    txn.privacy_mode === "on_device_only" ||
    (isCompanion && txn.raw_payload_received === false);
  const legacyMasked = txn.raw_payload_received === true || txn.data_origin === "legacy_android_raw_ingest";

  if (bankVerified) {
    badges.push({
      label: "Sandbox source",
      tone: "success",
      title: "Matched through the consent sandbox data path.",
    });
  } else if (needsReview) {
    badges.push({
      label: "Needs review",
      tone: "warning",
      title: "Parsed with lower confidence. Confirm or correct this entry.",
    });
  } else if (txn.needs_category_review) {
    badges.push({
      label: "Classify vendor",
      tone: "warning",
      title: "Repeated statement vendor. Answer once so future imports can classify it.",
    });
  } else if (userReviewed) {
    badges.push({
      label: "Reviewed",
      tone: "success",
      title: "Confirmed or corrected by the user.",
    });
  }

  if (onDevice) {
    badges.push({
      label: "On-device",
      tone: "primary",
      title: "Parsed on the Android phone. Raw notification text was not uploaded.",
    });
  } else if (legacyMasked) {
    badges.push({
      label: "Masked legacy",
      tone: "warning",
      title: "Legacy connector path. Only a masked preview is retained.",
    });
  } else if (source === "manual" || txn.data_origin === "user_entered") {
    badges.push({
      label: "Manual",
      tone: "muted",
      title: "Entered by the user.",
    });
  } else if (source === "statement_import" || txn.data_origin === "bank_statement_upload") {
    badges.push({
      label: "Statement",
      tone: "primary",
      title: "Imported from a user-reviewed bank statement. Raw files and passwords are not stored.",
    });
  } else if (source) {
    badges.push({
      label: "App entry",
      tone: "muted",
      title: "Created inside PocketBuddy.",
    });
  }

  if (!needsReview && isCompanion && txn.parsing_confidence === "high") {
    badges.push({
      label: "High confidence",
      tone: "success",
      title: "Amount and merchant were parsed with high confidence.",
    });
  }

  return badges.slice(0, 3);
}

function trustBadgeClass(tone: TrustTone) {
  if (tone === "success") return "border-success/25 bg-success/10 text-success";
  if (tone === "warning") return "border-warning/30 bg-warning/10 text-warning";
  if (tone === "primary") return "border-primary/25 bg-primary/10 text-primary";
  return "border-border bg-surface-raised/60 text-muted-foreground";
}

function trustLabelForCSV(txn: any) {
  const labels = transactionTrustBadges(txn).map((badge) => badge.label);
  return labels.length ? labels.join(" | ") : "Unlabeled";
}

function transactionTrustDetail(txn: any) {
  if (txn.needs_verification || txn.verification_status === "needs_review") {
    return "Review this entry before relying on it.";
  }
  if (txn.data_origin === "android_on_device" || txn.privacy_mode === "on_device_only") {
    return "Raw alert text stayed on the phone.";
  }
  if (txn.source === "statement_import" || txn.data_origin === "bank_statement_upload") {
    return "Imported from a reviewed statement. Raw file and password were not stored.";
  }
  if (txn.raw_payload_received === true || txn.data_origin === "legacy_android_raw_ingest") {
    return "Legacy alert was stored as masked preview only.";
  }
  if (txn.source === "manual" || txn.data_origin === "user_entered") {
    return "Added manually by you.";
  }
  return "Created inside PocketBuddy.";
}

type TrustPathState = "complete" | "attention" | "pending" | "neutral";
type TrustPathStep = {
  label: string;
  detail: string;
  state: TrustPathState;
  icon: "phone" | "server" | "bank";
};

function transactionTrustPathSteps(txn: any): TrustPathStep[] {
  const source = String(txn.source || "").toLowerCase();
  const isCompanion = source.startsWith("companion");
  const needsReview = txn.needs_verification === true || txn.verification_status === "needs_review";
  const bankVerified = txn.verification_status === "aa_verified" || txn.data_origin === "account_aggregator";
  const userReviewed = Boolean(txn.user_confirmed_at || txn.user_corrected || txn.verification_status === "user_reviewed");
  const onDevice =
    txn.data_origin === "android_on_device" ||
    txn.privacy_mode === "on_device_only" ||
    (isCompanion && txn.raw_payload_received === false);
  const legacyMasked = txn.raw_payload_received === true || txn.data_origin === "legacy_android_raw_ingest";
  const manual = source === "manual" || txn.data_origin === "user_entered";
  const statementImport = source === "statement_import" || txn.data_origin === "bank_statement_upload";

  const firstStep: TrustPathStep = onDevice
    ? {
        label: "Phone parsed",
        detail: "Amount, merchant, direction and confidence were extracted on this phone. Raw alert text was not uploaded.",
        state: "complete",
        icon: "phone",
      }
    : legacyMasked
      ? {
          label: "Legacy phone sync",
          detail: "This older connector path kept only a masked notification preview. Review the entry if anything looks off.",
          state: "attention",
          icon: "phone",
        }
      : manual
        ? {
            label: "Manual entry",
            detail: "Added by you inside PocketBuddy. No notification or sandbox record is attached.",
            state: "neutral",
            icon: "phone",
          }
        : statementImport
          ? {
              label: "Statement import",
              detail: "Created from a user-reviewed bank statement row. The raw file and password were not stored.",
              state: "complete",
              icon: "bank",
            }
        : {
            label: "PocketBuddy entry",
            detail: "Created inside the app from structured user activity.",
            state: "neutral",
            icon: "phone",
          };

  const recordStep: TrustPathStep = needsReview
    ? {
        label: "Needs review",
        detail: "PocketBuddy saved this as a reviewable transaction because confidence was not strong enough.",
        state: "attention",
        icon: "server",
      }
    : {
        label: "Recorded safely",
        detail: userReviewed
          ? "You confirmed or corrected this entry before relying on it."
          : "PocketBuddy stored structured transaction fields and privacy labels.",
        state: "complete",
        icon: "server",
      };

  const bankStep: TrustPathStep = bankVerified
    ? {
        label: "Sandbox source",
        detail: "Matched with consent sandbox data.",
        state: "complete",
        icon: "bank",
      }
    : onDevice || isCompanion || legacyMasked
      ? {
          label: "Bank check optional",
          detail: "Use the consent sandbox from Privacy Center to review the read-only control flow without sharing banking passwords.",
          state: "pending",
          icon: "bank",
        }
      : {
          label: "No bank check",
          detail: "This entry is not linked to a consent sandbox record.",
          state: "neutral",
          icon: "bank",
        };

  return [firstStep, recordStep, bankStep];
}

function trustPathStateClass(state: TrustPathState) {
  if (state === "complete") return "border-success/20 bg-success/5 text-success";
  if (state === "attention") return "border-warning/30 bg-warning/10 text-warning";
  if (state === "pending") return "border-primary/20 bg-primary/5 text-primary";
  return "border-border bg-surface-raised/50 text-muted-foreground";
}

function TrustPathIcon({ step }: { step: TrustPathStep }) {
  const className = "h-3.5 w-3.5";
  if (step.icon === "phone") return <Smartphone className={className} />;
  if (step.icon === "bank") return <Landmark className={className} />;
  if (step.state === "attention") return <AlertTriangle className={className} />;
  if (step.state === "complete") return <CheckCircle2 className={className} />;
  return <Server className={className} />;
}

function TransactionTrustPath({ txn }: { txn: any }) {
  const steps = transactionTrustPathSteps(txn);

  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-background/70 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Transaction trust path
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Phone sync and bank verification are separate sources.
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map((step) => (
          <div key={step.label} className={`rounded-lg border p-2.5 ${trustPathStateClass(step.state)}`}>
            <div className="flex items-center gap-1.5">
              <TrustPathIcon step={step} />
              <p className="text-[11px] font-semibold text-foreground">{step.label}</p>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {step.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TxnsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<"ledger" | "analytics">(search.view ?? "ledger");
  const [viewTab, setViewTab] = useState<ViewTab>(search.tab ?? "daily");
  const [activePieTab, setActivePieTab] = useState<"income" | "expenses">("expenses");

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [editingTxn, setEditingTxn] = useState<any | null>(null);
  const [statementImportOpen, setStatementImportOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    setViewMode(search.view ?? "ledger");
    setViewTab(search.tab ?? "daily");
  }, [search.view, search.tab]);

  const updateViewMode = (mode: "ledger" | "analytics") => {
    setViewMode(mode);
    setSelectedDay(null);
    navigate({
      to: "/transactions",
      search: { view: mode, tab: viewTab }
    });
  };

  const updateViewTab = (tab: ViewTab) => {
    setViewTab(tab);
    setSelectedDay(null);
    navigate({
      to: "/transactions",
      search: { view: viewMode, tab }
    });
  };

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: () => getProfile(),
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats", user?.id, month, year],
    enabled: !!user,
    queryFn: () => getStats(month, year),
    staleTime: 30_000,
  });

  const { data: statementBatches } = useQuery({
    queryKey: ["statement-import-batches", user?.id],
    enabled: !!user,
    queryFn: getStatementImportBatches,
    staleTime: 30_000,
  });

  // Catalog-driven categories
  const { data: catalogCategories } = useQuery({
    queryKey: ["catalog", "transaction-categories"],
    enabled: !!user,
    queryFn: () => getCatalog("transaction-categories"),
    staleTime: 5 * 60 * 1000,
  });

  const categories = useMemo(() => {
    if (catalogCategories && catalogCategories.length > 0) {
      return catalogCategories.map((c: any) => ({ v: c.value, l: c.label }));
    }
    return FALLBACK_CATEGORIES;
  }, [catalogCategories]);

  const monthName = new Date(year, month - 1).toLocaleString("en-IN", { month: "long" });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // CSV export
  function exportCSV() {
    if (!stats?.daily_groups) return;
    const rows: string[] = ["Date,Description,Category,Amount (paise),Source,Trust,Type"];
    for (const day of stats.daily_groups) {
      for (const t of day.transactions) {
        const desc = (t.mapped_merchant_name || t.raw_merchant_string || "").replace(/,/g, ";");
        rows.push(`${day.date},"${desc}",${t.category || "other"},${t.amount},${t.source},"${trustLabelForCSV(t)}",${t.is_income ? "income" : "expense"}`);
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pocketbuddy_${monthName}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs: { key: ViewTab; label: string }[] = [
    { key: "daily", label: "Daily" },
    { key: "calendar", label: "Calendar" },
    { key: "monthly", label: "Monthly" },
    { key: "total", label: "Total" },
  ];

  // Filter daily groups if a specific day is selected (from calendar click)
  const filteredDailyGroups = useMemo(() => {
    if (!stats?.daily_groups) return [];
    let groups = stats.daily_groups;
    if (selectedDay !== null) {
      groups = groups.filter((g: any) => g.day === selectedDay);
    }
    if (selectedCategory !== "all") {
      return groups
        .map((g: any) => {
          const txns = g.transactions.filter((t: any) => {
            if (selectedCategory === "income") {
              return t.is_income;
            }
            return (t.category || "other").toLowerCase() === selectedCategory.toLowerCase() && !t.is_income;
          });
          const income = txns.filter((t: any) => t.is_income).reduce((s: number, t: any) => s + t.amount, 0);
          const expenses = txns.filter((t: any) => !t.is_income).reduce((s: number, t: any) => s + t.amount, 0);
          return {
            ...g,
            income,
            expenses,
            transactions: txns,
          };
        })
        .filter((g: any) => g.transactions.length > 0);
    }
    return groups;
  }, [stats?.daily_groups, selectedDay, selectedCategory]);

  const netAmount = stats?.summary?.net ?? 0;

  const breakdown = activePieTab === "income"
    ? (stats?.income_breakdown ?? [])
    : (stats?.expense_breakdown ?? []);

  const pieData = useMemo(() => {
    return breakdown.map((item: any, i: number) => ({
      name: item.category,
      value: item.amount,
      pct: item.pct,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [breakdown]);

  const renderLabel = ({ cx, cy, midAngle, outerRadius, name, pct }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 16;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (pct < 3) return null;
    const truncatedName = name.length > 10 ? name.slice(0, 10) + "…" : name;
    return (
      <text x={x} y={y} fill="var(--foreground)" textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central" fontSize={10} fontWeight={700} fontFamily="var(--font-sans)">
        {truncatedName}
        <tspan dx={2} fill="var(--muted-foreground)" fontSize={9}>{pct}%</tspan>
      </text>
    );
  };

  const yearlyBarData = useMemo(() => {
    return (stats?.yearly_months ?? []).map((m: any) => ({
      name: m.month_name,
      income: Math.round(m.income / 100),
      expenses: Math.round(m.expenses / 100),
      month: m.month,
    }));
  }, [stats?.yearly_months]);

  const dailyBarData = useMemo(() => {
    return (stats?.daily_expense_bars ?? []).map((d: any) => ({
      day: d.label,
      amount: Math.round(d.amount / 100),
    }));
  }, [stats?.daily_expense_bars]);

  const hourlyData = useMemo(() => {
    return (stats?.hourly_data ?? []).map((h: any) => ({
      hour: `${h.hour}:00`,
      amount: Math.round(h.amount / 100),
      label: h.hour < 12 ? `${h.hour || 12} AM` : `${h.hour === 12 ? 12 : h.hour - 12} PM`,
    }));
  }, [stats?.hourly_data]);

  const dowData = useMemo(() => {
    return (stats?.day_of_week_data ?? []).map((d: any) => ({
      day: d.day,
      amount: Math.round(d.amount / 100),
      count: d.count,
    }));
  }, [stats?.day_of_week_data]);

  return (
    <AppShell>
      {/* Page Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-background/85 backdrop-blur-md px-4 py-2 sm:px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">
            {viewMode === "ledger" ? "Transactions" : "Stats & Analytics"}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setStatementImportOpen(true)}
            id="btn-open-statement-import"
            title="Import bank statement"
            aria-label="Import bank statement"
            className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-full border border-border bg-surface text-foreground transition-all hover:bg-surface-raised sm:w-auto sm:px-3"
          >
            <UploadCloud className="h-4 w-4 text-primary" />
            <span className="hidden text-[10px] font-black uppercase tracking-[0.08em] sm:inline md:text-xs">Import</span>
          </button>
          <button
            onClick={exportCSV}
            id="btn-export-csv"
            title="Export CSV"
            aria-label="Export CSV"
            disabled={!stats?.daily_groups?.length}
            className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-full border border-border bg-surface text-foreground transition-all hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-3"
          >
            <Download className="h-4 w-4 text-primary" />
            <span className="hidden text-[10px] font-black uppercase tracking-[0.08em] sm:inline md:text-xs">Export</span>
          </button>
        </div>
      </div>

      <div className="py-4 pb-32 space-y-5 animate-[fadeIn_0.3s_ease-out]">

        {/* ── Month Navigation ────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <button onClick={prevMonth} id="btn-txn-prev-month"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border hover:bg-surface-raised transition-colors cursor-pointer">
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
          <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:gap-3">
            <h2 className="text-lg font-black font-display tracking-tight text-foreground">
              {viewMode === "ledger" && viewTab === "monthly" ? `${year}` : `${monthName} ${year}`}
            </h2>
          </div>
          <button onClick={nextMonth} id="btn-txn-next-month"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border hover:bg-surface-raised transition-colors cursor-pointer">
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>
        </div>

        {/* ── Summary Bar ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 bg-surface rounded-xl border border-border p-3">
          <div className="text-center">
            <p className="text-[9px] md:text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Income</p>
            <p className="text-xs font-black tnum text-[#5DADE2]">{rupees(stats?.summary?.income ?? 0)}</p>
          </div>
          <div className="text-center border-x border-border/50">
            <p className="text-[9px] md:text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Expenses</p>
            <p className="text-xs font-black tnum text-[#FF6B4A]">{rupees(stats?.summary?.expenses ?? 0)}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] md:text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Net</p>
            <p className={`text-xs font-black tnum ${netAmount >= 0 ? "text-foreground" : "text-[#FF6B4A]"}`}>
              {netAmount >= 0 ? "+" : ""}{rupees(Math.abs(netAmount))}
            </p>
          </div>
        </div>

        {/* ── Primary View Mode Switcher (Sliding Pill) ── */}
        <div className="flex bg-surface border border-border rounded-xl p-1 relative select-none">
          <button
            onClick={() => updateViewMode("ledger")}
            className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer rounded-lg z-10 ${
              viewMode === "ledger" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Transactions
          </button>
          <button
            onClick={() => updateViewMode("analytics")}
            className={`flex-1 py-2 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer rounded-lg z-10 ${
              viewMode === "analytics" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Analytics
          </button>
          <div
            className="absolute top-1 bottom-1 left-1 rounded-lg bg-surface-raised border border-border/60 transition-all duration-200 ease-out shadow-sm"
            style={{
              width: "calc(50% - 4px)",
              transform: viewMode === "analytics" ? "translateX(100%)" : "none",
            }}
          />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full border-none rounded-2xl" />
            <Skeleton className="h-40 w-full border-none rounded-2xl" />
            <Skeleton className="h-48 w-full border-none rounded-2xl" />
          </div>
        ) : (
          <>
            {viewMode === "ledger" ? (
              <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
                {/* ── Tab Bar ─────────────────────────────────────────────────── */}
                <div className="flex border-b border-border">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => updateViewTab(t.key)}
                      id={`tab-txn-${t.key}`}
                      className={`flex-1 py-2.5 text-center text-xs font-bold uppercase tracking-[0.08em] transition-all cursor-pointer ${
                        viewTab === t.key
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="relative inline-flex justify-center px-1 pb-2">
                        {t.label}
                        {viewTab === t.key && (
                          <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-primary" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>

                {/* ── Category Filters ────────────────────────────────────────── */}
                {viewTab === "daily" && (
                  <div className="-mx-4 px-4 overflow-x-auto scrollbar-none flex items-center gap-1.5 py-1">
                    <button
                      onClick={() => setSelectedCategory("all")}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer ${
                        selectedCategory === "all"
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-surface text-muted-foreground border-border hover:text-foreground hover:bg-surface-raised"
                      }`}
                    >
                      All
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c.v}
                        onClick={() => setSelectedCategory(c.v)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer ${
                          selectedCategory === c.v
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-surface text-muted-foreground border-border hover:text-foreground hover:bg-surface-raised"
                        }`}
                      >
                        {c.l}
                      </button>
                    ))}
                    <button
                      onClick={() => setSelectedCategory("income")}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer ${
                        selectedCategory === "income"
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-surface text-muted-foreground border-border hover:text-foreground hover:bg-surface-raised"
                      }`}
                    >
                      Income
                    </button>
                  </div>
                )}

                {/* ═══════════ DAILY TAB ═══════════ */}
                {viewTab === "daily" && (
                  <DailyView
                    groups={filteredDailyGroups}
                    month={month}
                    year={year}
                    selectedDay={selectedDay}
                    onClearDay={() => setSelectedDay(null)}
                    onEdit={setEditingTxn}
                  />
                )}

                {/* ═══════════ CALENDAR TAB ═══════════ */}
                {viewTab === "calendar" && (
                  <CalendarView
                    daily={stats?.daily ?? []}
                    daysInMonth={stats?.days_in_month ?? 30}
                    month={month}
                    year={year}
                    onDayClick={(day: number) => {
                      setSelectedDay(day);
                      updateViewTab("daily");
                    }}
                  />
                )}

                {/* ═══════════ MONTHLY TAB ═══════════ */}
                {viewTab === "monthly" && (
                  <MonthlyView
                    yearlyMonths={stats?.yearly_months ?? []}
                    weeks={stats?.weeks ?? []}
                    currentMonth={month}
                    year={year}
                    onMonthClick={(m: number) => { setMonth(m); updateViewTab("daily"); }}
                  />
                )}

                {/* ═══════════ TOTAL TAB ═══════════ */}
                {viewTab === "total" && (
                  <TotalView
                    stats={stats}
                    monthName={monthName}
                    year={year}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-6 animate-[fadeIn_0.2s_ease-out]">
                {/* ── Quick Stats Grid ────────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <QuickStatCard
                    icon={<Receipt className="h-4 w-4" />}
                    label="Transactions"
                    value={String(stats?.txn_counts?.total ?? 0)}
                    accent="#5DADE2"
                  />
                  <QuickStatCard
                    icon={<Zap className="h-4 w-4" />}
                    label="Avg Daily"
                    value={rupees(stats?.avg_daily_expense ?? 0)}
                    accent="#FFB347"
                  />
                  <QuickStatCard
                    icon={<Flame className="h-4 w-4" />}
                    label="Streak"
                    value={`${stats?.streaks?.current ?? 0}d`}
                    sub={`Max: ${stats?.streaks?.max ?? 0}d`}
                    accent="#FF6B4A"
                  />
                  <QuickStatCard
                    icon={<TrendingUp className="h-4 w-4" />}
                    label="vs Last Month"
                    value={`${stats?.compared_expenses_pct ?? 0}%`}
                    accent={
                      (stats?.compared_expenses_pct ?? 0) > 100 ? "#FF6B4A"
                      : (stats?.compared_expenses_pct ?? 0) < 80 ? "#82E0AA"
                      : "#FFB347"
                    }
                  />
                </div>

                {/* ── PIE CHART: Income / Expenses Toggle ─────────────────── */}
                <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                  <div className="flex border-b border-border">
                    <button onClick={() => setActivePieTab("income")} id="btn-stats-income"
                      className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer relative ${
                        activePieTab === "income" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}>
                      <span>Income</span>
                      <span className="ml-1.5 text-[#5DADE2] font-black tnum">{rupees(stats?.summary?.income ?? 0)}</span>
                      {activePieTab === "income" && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#5DADE2]" />}
                    </button>
                    <button onClick={() => setActivePieTab("expenses")} id="btn-stats-expenses"
                      className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer relative ${
                        activePieTab === "expenses" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}>
                      <span>Expenses</span>
                      <span className="ml-1.5 text-[#FF6B4A] font-black tnum">{rupees(stats?.summary?.expenses ?? 0)}</span>
                      {activePieTab === "expenses" && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF6B4A]" />}
                    </button>
                  </div>

                  {pieData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                        No {activePieTab} data for this month
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 md:p-6">
                      <div className="flex flex-col md:flex-row md:items-center md:gap-8">
                        <div className="flex-shrink-0 mx-auto md:mx-0" style={{ width: 280, height: 280 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                                paddingAngle={2} dataKey="value" label={renderLabel}
                                labelLine={{ stroke: "var(--border)", strokeWidth: 1 }}
                                animationBegin={0} animationDuration={800} animationEasing="ease-out">
                                {pieData.map((entry: any) => (
                                  <Cell key={entry.name} fill={entry.fill} stroke="var(--background)" strokeWidth={2} />
                                ))}
                              </Pie>
                              <Tooltip content={({ payload }) => {
                                if (!payload?.length) return null;
                                const d = payload[0].payload;
                                return (
                                  <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
                                    <p className="text-xs font-bold text-foreground capitalize">{d.name}</p>
                                    <p className="text-xs text-muted-foreground tnum">{rupees(d.value)} · {d.pct}%</p>
                                  </div>
                                );
                              }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 mt-4 md:mt-0 space-y-1">
                          {pieData.map((item: any) => (
                            <div key={item.name}
                              className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-surface-raised/60 transition-colors border-b border-border/30 last:border-b-0">
                              <span className="inline-flex items-center justify-center w-9 h-6 rounded-md text-[10px] md:text-xs font-black tnum shrink-0"
                                style={{ backgroundColor: `${item.fill}22`, color: item.fill }}>
                                {Math.round(item.pct)}%
                              </span>
                              <span className="shrink-0 mr-1">{getCategoryIcon(item.name, "h-4 w-4 text-muted-foreground")}</span>
                              <span className="text-xs font-bold text-foreground capitalize flex-1 truncate">{item.name}</span>
                              <span className="text-xs font-black text-foreground tnum shrink-0">{rupees(item.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* ── DAILY EXPENSE BAR CHART ─────────────────────────────── */}
                  {dailyBarData.length > 0 && (
                    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground font-display">
                          Daily Expenses — {monthName}
                        </h3>
                      </div>
                      <div className="p-4" style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dailyBarData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="day" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                              axisLine={false} tickLine={false} interval={Math.floor(dailyBarData.length / 10)} />
                            <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                              axisLine={false} tickLine={false}
                              tickFormatter={(v: number) => `₹${v}`} />
                            <Tooltip content={({ payload, label }) => {
                              if (!payload?.length) return null;
                              return (
                                <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
                                  <p className="text-xs font-bold text-foreground">Day {label}</p>
                                  <p className="text-xs text-[#FF6B4A] tnum font-bold">₹{payload[0].value}</p>
                                </div>
                              );
                            }} />
                            <Bar dataKey="amount" radius={[3, 3, 0, 0]} maxBarSize={16}>
                              {dailyBarData.map((_: any, i: number) => (
                                <Cell key={i} fill={i === dailyBarData.length - 1 ? "#FF6B00" : "#FF6B4A44"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* ── YEARLY TREND BAR CHART ──────────────────────────────── */}
                  {yearlyBarData.some((d: any) => d.income > 0 || d.expenses > 0) && (
                    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground font-display">
                            {year} Monthly Trend
                          </h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-[10px] md:text-xs text-muted-foreground">
                            <span className="w-2 h-2 rounded-full bg-[#5DADE2]" /> Income
                          </span>
                          <span className="flex items-center gap-1 text-[10px] md:text-xs text-muted-foreground">
                            <span className="w-2 h-2 rounded-full bg-[#FF6B4A]" /> Expenses
                          </span>
                        </div>
                      </div>
                      <div className="p-4" style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={yearlyBarData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                              axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                              axisLine={false} tickLine={false}
                              tickFormatter={(v: number) => `₹${v}`} />
                            <Tooltip content={({ payload, label }) => {
                              if (!payload?.length) return null;
                              return (
                                <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
                                  <p className="text-xs font-bold text-foreground mb-1">{label}</p>
                                  {payload.map((p: any) => (
                                    <p key={p.dataKey} className="text-xs tnum" style={{ color: p.fill || p.color }}>
                                      {p.dataKey === "income" ? "Income" : "Expenses"}: ₹{p.value}
                                    </p>
                                  ))}
                                </div>
                              );
                            }} />
                            <Bar dataKey="income" fill="#5DADE2" radius={[3, 3, 0, 0]} maxBarSize={20} />
                            <Bar dataKey="expenses" fill="#FF6B4A" radius={[3, 3, 0, 0]} maxBarSize={20} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* ── SPENDING BY DAY OF WEEK ─────────────────────────────── */}
                  {dowData.some((d: any) => d.amount > 0) && (
                    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-[#AF7AC5]" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground font-display">
                          Spending by Day of Week
                        </h3>
                      </div>
                      <div className="p-4" style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dowData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                              axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                              axisLine={false} tickLine={false}
                              tickFormatter={(v: number) => `₹${v}`} />
                            <Tooltip content={({ payload, label }) => {
                              if (!payload?.length) return null;
                              return (
                                <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
                                  <p className="text-xs font-bold text-foreground">{label}</p>
                                  <p className="text-xs text-[#AF7AC5] tnum font-bold">₹{payload[0].value}</p>
                                  <p className="text-[10px] md:text-xs text-muted-foreground">{payload[0].payload.count} txns</p>
                                </div>
                              );
                            }} />
                            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={32}>
                              {dowData.map((_: any, i: number) => (
                                <Cell key={i} fill={i >= 5 ? "#AF7AC5" : "#AF7AC566"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* ── HOURLY SPENDING PATTERN (Area Chart) ────────────────── */}
                  {hourlyData.some((h: any) => h.amount > 0) && (
                    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                        <Clock className="h-4 w-4 text-[#F7DC6F]" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground font-display">
                          Spending by Hour of Day
                        </h3>
                      </div>
                      <div className="p-4" style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={hourlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="hourlyGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#F7DC6F" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="#F7DC6F" stopOpacity={0.05} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 8, fill: "var(--muted-foreground)" }}
                              axisLine={false} tickLine={false} interval={2} />
                            <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                              axisLine={false} tickLine={false}
                              tickFormatter={(v: number) => `₹${v}`} />
                            <Tooltip content={({ payload, label }) => {
                              if (!payload?.length) return null;
                              return (
                                <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl">
                                  <p className="text-xs font-bold text-foreground">{label}</p>
                                  <p className="text-xs text-[#F7DC6F] tnum font-bold">₹{payload[0].value}</p>
                                </div>
                              );
                            }} />
                            <Area type="monotone" dataKey="amount" stroke="#F7DC6F" strokeWidth={2}
                              fill="url(#hourlyGrad)" dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* ── TOP MERCHANTS ────────────────────────────────────────── */}
                  {(stats?.top_merchants ?? []).length > 0 && (
                    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-[#82E0AA]" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground font-display">
                          Top Merchants
                        </h3>
                      </div>
                      <div className="divide-y divide-border/30">
                        {stats.top_merchants.slice(0, 8).map((m: any, i: number) => {
                          const maxAmt = stats.top_merchants[0]?.amount ?? 1;
                          const pct = Math.round((m.amount / maxAmt) * 100);
                          return (
                            <div key={i} className="px-4 py-3 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="text-[10px] md:text-xs font-black tnum text-muted-foreground w-5 shrink-0">
                                    {i + 1}.
                                  </span>
                                  <span className="text-xs font-bold text-foreground truncate">{m.name}</span>
                                  <span className="text-[10px] md:text-xs text-muted-foreground shrink-0">{m.count}×</span>
                                </div>
                                <span className="text-xs font-black tnum text-foreground shrink-0 ml-2">
                                  {rupees(m.amount)}
                                </span>
                              </div>
                              <div className="h-1 rounded-full bg-surface-raised overflow-hidden ml-7">
                                <div className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── WEEKLY BREAKDOWN TABLE ───────────────────────────────── */}
                  {(stats?.weeks ?? []).length > 0 && (
                    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                      <div className="px-4 py-3 border-b border-border">
                        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground font-display">
                          Weekly Breakdown
                        </h3>
                      </div>
                      <div className="divide-y divide-border/50">
                        {stats.weeks.map((w: any, i: number) => (
                          <div key={i} className="flex items-center justify-between px-4 py-3">
                            <span className="text-xs font-semibold text-muted-foreground tnum">{w.label}</span>
                            <div className="flex items-center gap-4 text-right">
                              <span className="text-xs tnum font-bold text-[#5DADE2]">{rupees(w.income)}</span>
                              <span className="text-xs tnum font-bold text-[#FF6B4A]">{rupees(w.expenses)}</span>
                              <span className={`text-xs tnum font-black w-20 text-right ${
                                w.net >= 0 ? "text-foreground" : "text-[#FF6B4A]"
                              }`}>
                                {w.net >= 0 ? "+" : ""}{rupees(Math.abs(w.net))}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── BIGGEST TRANSACTION ──────────────────────────────────── */}
                  {stats?.biggest_txn && (
                    <div className="bg-surface rounded-2xl border border-border p-4 md:p-5 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="h-4 w-4 text-[#FFB347]" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground font-display">
                          Biggest Expense This Month
                        </h3>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#FFB347]/10 flex items-center justify-center">
                          {getCategoryIcon(stats.biggest_txn.category, "h-5 w-5 text-[#FFB347]")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{stats.biggest_txn.merchant}</p>
                          <p className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground capitalize">{stats.biggest_txn.category}</p>
                        </div>
                        <p className="text-lg font-black tnum text-[#FF6B4A]">{rupees(stats.biggest_txn.amount)}</p>
                      </div>
                    </div>
                  )}

                  {/* ── COMPARISON CARD ─────────────────────────────────────── */}
                  {(stats?.compared_expenses_pct ?? 0) > 0 && (
                    <div className="bg-surface rounded-2xl border border-border p-4 md:p-5 flex flex-col justify-center">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">
                            Compared Expenses (Last month)
                          </p>
                          <p className="text-2xl font-black tnum text-foreground">{stats.compared_expenses_pct}%</p>
                        </div>
                        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                          stats.compared_expenses_pct > 100 ? "bg-[#FF6B4A]/10"
                          : stats.compared_expenses_pct < 80 ? "bg-[#82E0AA]/10" : "bg-[#FFB347]/10"
                        }`}>
                          {stats.compared_expenses_pct > 100
                            ? <TrendingUp className="h-5 w-5 text-[#FF6B4A]" />
                            : stats.compared_expenses_pct < 80
                              ? <TrendingDown className="h-5 w-5 text-[#82E0AA]" />
                              : <Minus className="h-5 w-5 text-[#FFB347]" />}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {stats.compared_expenses_pct > 100
                          ? "You're spending more this month compared to last month."
                          : stats.compared_expenses_pct < 80
                            ? "Great job! You're spending less than last month."
                            : "Your spending is about the same as last month."}
                      </p>
                    </div>
                  )}

                  {/* ── SOURCE BREAKDOWN ────────────────────────────────────── */}
                  <div className="bg-surface rounded-2xl border border-border p-4 md:p-5 flex flex-col justify-center">
                    <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground font-display mb-3">
                      Expense Source
                    </h3>
                    <div className="space-y-2">
                      {[
                        { label: "Companion (Auto-tracked)", value: stats?.source_breakdown?.companion ?? 0, color: "#5DADE2" },
                        { label: "Manual", value: stats?.source_breakdown?.manual ?? 0, color: "#FFB347" },
                      ].map((s) => {
                        const total = (stats?.source_breakdown?.companion ?? 0) + (stats?.source_breakdown?.manual ?? 0);
                        const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                        return (
                          <div key={s.label} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-foreground">{s.label}</span>
                              <span className="text-xs font-black tnum text-foreground">{rupees(s.value)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, backgroundColor: s.color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Transaction Dialog */}
      <Dialog open={!!editingTxn} onOpenChange={(o) => { if (!o) setEditingTxn(null); }}>
        <DialogContent className="sm:max-w-md bg-background border border-border text-foreground" id="dialog-edit-transaction">
          {editingTxn && (
            <EditTxnForm
              txn={editingTxn}
              categories={categories}
              onClose={() => {
                setEditingTxn(null);
                qc.invalidateQueries({ queryKey: ["stats"] });
                qc.invalidateQueries({ queryKey: ["txns"] });
                qc.invalidateQueries({ queryKey: ["insights"] });
                qc.invalidateQueries({ queryKey: ["wellness-insights"] });
                qc.invalidateQueries({ queryKey: ["catalog", "transaction-categories"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <StatementImportDialog
        open={statementImportOpen}
        onOpenChange={setStatementImportOpen}
        batches={Array.isArray(statementBatches) ? statementBatches : []}
        categories={categories}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["stats", user?.id, month, year] });
          qc.invalidateQueries({ queryKey: ["statement-import-batches", user?.id] });
          qc.invalidateQueries({ queryKey: ["txns", user?.id] });
          qc.invalidateQueries({ queryKey: ["runway"] });
        }}
      />
    </AppShell>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   DAILY VIEW — Date-grouped transaction list
   ═══════════════════════════════════════════════════════════════════════ */
function DailyView({
  groups, month, year, selectedDay, onClearDay, onEdit,
}: {
  groups: any[]; month: number; year: number;
  selectedDay: number | null; onClearDay: () => void; onEdit: (t: any) => void;
}) {
  const [expandedTrustId, setExpandedTrustId] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <p className="py-12 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">
        No transactions found.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {selectedDay !== null && (
        <button onClick={onClearDay}
          className="text-xs text-primary font-bold uppercase tracking-wider mb-2 cursor-pointer hover:underline">
          ← Show all days
        </button>
      )}

      {groups.map((group: any) => (
        <div key={group.date} className="bg-surface rounded-2xl border border-border overflow-hidden">
          {/* Date Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-surface-raised/50 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <span className="text-lg font-black text-foreground tnum">{group.day}</span>
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                {group.weekday}
              </span>
              <span className="text-[10px] md:text-xs font-semibold text-muted-foreground tnum">
                {String(month).padStart(2, "0")}.{year}
              </span>
            </div>
            <div className="flex items-center gap-3 text-right">
              <span className="text-[10px] md:text-xs font-bold tnum text-[#5DADE2]">{rupees(group.income)}</span>
              <span className="text-[10px] md:text-xs font-bold tnum text-[#FF6B4A]">{rupees(group.expenses)}</span>
            </div>
          </div>

          {/* Transactions */}
          <div className="divide-y divide-border/30">
            {group.transactions.map((t: any, index: number) => {
              const trustId = String(t.id ?? `${group.date}-${index}`);
              const trustOpen = expandedTrustId === trustId;
              const trustBadges = transactionTrustBadges(t);
              return (
                <div key={trustId} className="px-4 py-3 hover:bg-surface-raised/40 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${getCatBadgeStyles(t.category)}`}>
                          {t.category || "other"}
                        </span>
                        {trustBadges.map((badge) => (
                          <span
                            key={`${trustId}-${badge.label}`}
                            title={badge.title}
                            className={`text-[9px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full border ${trustBadgeClass(badge.tone)}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs font-bold text-foreground truncate">
                        {t.mapped_merchant_name ?? t.raw_merchant_string}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] md:text-xs text-muted-foreground">
                        {transactionTrustDetail(t)}
                      </p>
                      <button
                        type="button"
                        onClick={() => setExpandedTrustId(trustOpen ? null : trustId)}
                        aria-expanded={trustOpen}
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80"
                      >
                        {trustOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        Trust path
                      </button>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <span className={`text-xs font-black tnum ${t.is_income ? "text-[#5DADE2]" : "text-[#FF6B4A]"}`}>
                        {t.is_income ? "+" : ""}{rupees(t.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onEdit(t)}
                        className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-all cursor-pointer"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {trustOpen && <TransactionTrustPath txn={t} />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CALENDAR VIEW — Monthly grid
   ═══════════════════════════════════════════════════════════════════════ */
function CalendarView({
  daily, daysInMonth, month, year, onDayClick,
}: {
  daily: any[]; daysInMonth: number; month: number; year: number;
  onDayClick: (day: number) => void;
}) {
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dailyMap: Record<number, any> = {};
  for (const d of daily) { dailyMap[d.day] = d; }

  // Build grid cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {weekdays.map((wd, i) => (
          <div key={wd} className={`py-2 text-center text-[10px] font-bold uppercase tracking-wider ${
            i === 0 ? "text-[#FF6B4A]" : i === 6 ? "text-[#5DADE2]" : "text-muted-foreground"
          }`}>
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="border-b border-r border-border/30 min-h-[4.5rem]" />;
          }
          const d = dailyMap[day];
          const hasData = d && (d.income > 0 || d.expenses > 0);
          const dayOfWeek = (firstDayOfWeek + day - 1) % 7;
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          return (
            <button
              key={day}
              onClick={() => hasData && onDayClick(day)}
              className={`border-b border-r border-border/30 min-h-[4.5rem] p-3 text-left transition-colors w-full h-full flex flex-col items-start justify-start ${
                hasData ? "cursor-pointer hover:bg-surface-raised/60" : "cursor-default"
              }`}
            >
              <span className={`text-[10px] font-bold ${
                isWeekend ? (dayOfWeek === 0 ? "text-[#FF6B4A]" : "text-[#5DADE2]") : "text-muted-foreground"
              }`}>
                {day}
              </span>
              {d && d.income > 0 && (
                <p className="text-[8px] sm:text-[9px] font-bold tnum text-[#5DADE2] truncate mt-0.5">
                  {rupees(d.income)}
                </p>
              )}
              {d && d.expenses > 0 && (
                <p className="text-[8px] sm:text-[9px] font-bold tnum text-[#FF6B4A] truncate">
                  {rupees(d.expenses)}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MONTHLY VIEW — Yearly with weekly breakdown
   ═══════════════════════════════════════════════════════════════════════ */
function MonthlyView({
  yearlyMonths, weeks, currentMonth, year, onMonthClick,
}: {
  yearlyMonths: any[]; weeks: any[];
  currentMonth: number; year: number; onMonthClick: (m: number) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(currentMonth);

  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden divide-y divide-border/50">
      {yearlyMonths.map((m: any) => {
        const hasData = m.income > 0 || m.expenses > 0;
        const isExpanded = expanded === m.month;
        const isCurrent = m.month === currentMonth;

        return (
          <div key={m.month}>
            <button
              onClick={() => {
                if (isCurrent) {
                  setExpanded(isExpanded ? null : m.month);
                } else {
                  onMonthClick(m.month);
                }
              }}
              className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors cursor-pointer hover:bg-surface-raised/60 ${
                isCurrent ? "bg-surface-raised/30" : ""
              }`}
            >
              <div className="text-left">
                <span className={`text-sm font-bold ${isCurrent ? "text-primary" : "text-foreground"}`}>
                  {m.month_name}
                </span>
                {isCurrent && hasData && (
                  <p className="text-[9px] md:text-xs text-muted-foreground mt-0.5 tnum">
                    {m.month}.1 ~ {m.month}.{new Date(year, m.month, 0).getDate()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 sm:gap-4 text-right">
                <div className="flex flex-col items-end">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">Income</span>
                  <p className="text-xs tnum font-black text-[#5DADE2]">{hasData ? rupees(m.income) : "₹0"}</p>
                </div>
                <div className="flex flex-col items-end border-l border-border/40 pl-3">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">Expenses</span>
                  <p className="text-xs tnum font-black text-[#FF6B4A]">{hasData ? rupees(m.expenses) : "₹0"}</p>
                </div>
                <div className="flex flex-col items-end border-l border-border/40 pl-3">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">Balance</span>
                  <p className={`text-xs tnum font-black ${
                    m.net > 0
                      ? "text-[#16A34A]"
                      : m.net < 0
                        ? "text-[#FF6B4A]"
                        : "text-muted-foreground"
                  }`}>
                    {hasData ? (m.net > 0 ? "+" : "") + rupees(m.net) : "₹0"}
                  </p>
                </div>
              </div>
            </button>

            {/* Weekly sub-rows for the current expanded month */}
            {isExpanded && isCurrent && weeks.length > 0 && (
              <div className="border-t border-border/30 bg-surface-raised/20 divide-y divide-border/10">
                {weeks.map((w: any, i: number) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3 gap-2">
                    <span className="text-xs font-bold text-foreground tnum">{w.label}</span>
                    <div className="flex items-center gap-3 sm:gap-4 justify-end">
                      <div className="flex flex-col items-end">
                        <span className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">Income</span>
                        <span className="text-[10px] md:text-xs tnum font-semibold text-[#5DADE2]">{rupees(w.income)}</span>
                      </div>
                      <div className="flex flex-col items-end border-l border-border/30 pl-2.5">
                        <span className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">Expenses</span>
                        <span className="text-[10px] md:text-xs tnum font-semibold text-[#FF6B4A]">{rupees(w.expenses)}</span>
                      </div>
                      <div className="flex flex-col items-end border-l border-border/30 pl-2.5">
                        <span className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">Balance</span>
                        <span className={`text-[10px] tnum font-bold ${
                          w.net > 0
                            ? "text-[#16A34A]"
                            : w.net < 0
                              ? "text-[#FF6B4A]"
                              : "text-muted-foreground"
                        }`}>
                          {(w.net > 0 ? "+" : "") + rupees(w.net)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TOTAL VIEW — Budget and accounts summary
   ═══════════════════════════════════════════════════════════════════════ */
function TotalView({
  stats, monthName, year,
}: {
  stats: any; monthName: string; year: number;
}) {
  const comparedPct = stats?.compared_expenses_pct ?? 0;
  const companion = stats?.source_breakdown?.companion ?? 0;
  const manual = stats?.source_breakdown?.manual ?? 0;
  const statementImport = stats?.source_breakdown?.statement_import ?? 0;
  const totalExpenses = stats?.summary?.expenses ?? 0;

  return (
    <div className="space-y-4">
      {/* Accounts Summary */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground font-display flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" /> Accounts
          </h3>
          <span className="text-[10px] md:text-xs font-semibold text-muted-foreground tnum">
            {month(monthName)}.1.{String(year).slice(2)} ~ {month(monthName)}.{stats?.days_in_month ?? 30}.{String(year).slice(2)}
          </span>
        </div>

        <div className="space-y-3">
          {comparedPct > 0 && (
            <div className="flex items-center justify-between py-2 border-b border-border/30">
              <span className="text-xs text-muted-foreground">Compared Expenses (Last month)</span>
              <span className="text-xs font-black tnum text-foreground">{comparedPct}%</span>
            </div>
          )}
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-xs text-muted-foreground">Expenses (Companion)</span>
            <span className="text-xs font-black tnum text-foreground">{rupees(companion)}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-xs text-muted-foreground">Expenses (Manual)</span>
            <span className="text-xs font-black tnum text-foreground">{rupees(manual)}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <span className="text-xs text-muted-foreground">Expenses (Statement imports)</span>
            <span className="text-xs font-black tnum text-foreground">{rupees(statementImport)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-xs font-bold text-foreground">Total Expenses</span>
            <span className="text-xs font-black tnum text-[#FF6B4A]">{rupees(totalExpenses)}</span>
          </div>
        </div>
      </div>

    </div>
  );
}

// Fix month helper that returns month number from name
function month(name: string): string {
  const months: Record<string, string> = {
    January: "1", February: "2", March: "3", April: "4",
    May: "5", June: "6", July: "7", August: "8",
    September: "9", October: "10", November: "11", December: "12",
  };
  return months[name] || "1";
}

/* ═══════════════════════════════════════════════════════════════════════
   EDIT TRANSACTION FORM
   ═══════════════════════════════════════════════════════════════════════ */
type StatementPreviewRow = {
  row_id: string;
  posted_at: string;
  description: string;
  amount_paise: number;
  direction: "debit" | "credit";
  category: string;
  confidence: "high" | "medium" | "low";
  reference?: string | null;
  balance_paise?: number | null;
  duplicate_candidate?: boolean;
  duplicate_reason?: string | null;
  notes?: string[];
};

type StatementVendorPrompt = {
  group_key: string;
  display_name: string;
  category: string;
  count: number;
  weekly_count?: number;
  monthly_count?: number;
  total_paise: number;
  reason: string;
};

function StatementImportDialog({
  open,
  onOpenChange,
  batches,
  categories,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: any[];
  categories: { v: string; l: string }[];
  onChanged: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<any | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [vendorPrompts, setVendorPrompts] = useState<StatementVendorPrompt[]>([]);
  const [vendorChoices, setVendorChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [applyingVendorKey, setApplyingVendorKey] = useState<string | null>(null);
  const [rollingBackBatch, setRollingBackBatch] = useState<string | null>(null);

  const rows: StatementPreviewRow[] = preview?.rows ?? [];
  const selectedCount = rows.filter((row) => selectedRows.has(row.row_id)).length;
  const duplicateCount = rows.filter((row) => row.duplicate_candidate).length;
  const recentBatches = (batches ?? []).slice(0, 4);

  function resetPreview() {
    setPreview(null);
    setSelectedRows(new Set());
  }

  async function handlePreview() {
    if (!file) {
      toast.error("Choose a statement file first.");
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.append("file", file);
      if (password.trim()) data.append("password", password.trim());
      if (bankName.trim()) data.append("bank_name", bankName.trim());
      const result = await previewStatementImport({ data });
      const nextRows: StatementPreviewRow[] = result?.rows ?? [];
      setPreview(result);
      setSelectedRows(new Set(nextRows.filter((row) => !row.duplicate_candidate).map((row) => row.row_id)));
      toast.success(`Previewed ${nextRows.length} statement rows.`);
    } catch (err: any) {
      toast.error(err.message || "Could not preview this statement.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!preview || selectedCount === 0) {
      toast.error("Select at least one row to import.");
      return;
    }
    setBusy(true);
    try {
      const result = await commitStatementImport({
        data: {
          file_name: preview.file_name || file?.name || "statement",
          bank_name: bankName.trim() || preview.bank_name || undefined,
          account_label: accountLabel.trim() || undefined,
          skip_duplicates: true,
          rows: rows.map((row) => ({
            row_id: row.row_id,
            posted_at: row.posted_at,
            description: row.description,
            amount_paise: row.amount_paise,
            direction: row.direction,
            category: row.category,
            confidence: row.confidence,
            reference: row.reference || undefined,
            balance_paise: row.balance_paise ?? undefined,
            selected: selectedRows.has(row.row_id),
          })),
        },
      });
      const prompts: StatementVendorPrompt[] = result.vendor_review_prompts ?? [];
      setVendorPrompts(prompts);
      setVendorChoices(Object.fromEntries(prompts.map((prompt) => [prompt.group_key, ""])));
      toast.success(
        prompts.length
          ? `Imported ${result.inserted_count ?? 0} rows. ${prompts.length} repeated vendor${prompts.length > 1 ? "s need" : " needs"} one answer.`
          : `Imported ${result.inserted_count ?? 0} rows. ${result.duplicate_count ?? 0} duplicate skipped.`
      );
      resetPreview();
      setFile(null);
      setPassword("");
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "Statement import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVendorCategory(prompt: StatementVendorPrompt) {
    const category = vendorChoices[prompt.group_key];
    if (!category || category === "other") {
      toast.error("Choose a specific category for this vendor.");
      return;
    }
    setApplyingVendorKey(prompt.group_key);
    try {
      const result = await applyStatementVendorCategory({
        data: {
          group_key: prompt.group_key,
          category,
          display_name: prompt.display_name,
        },
      });
      toast.success(`Mapped ${result.updated_count ?? prompt.count} payments to ${category}.`);
      setVendorPrompts((prev) => prev.filter((item) => item.group_key !== prompt.group_key));
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "Could not save this vendor mapping.");
    } finally {
      setApplyingVendorKey(null);
    }
  }

  async function handleRollback(batchId: string) {
    setRollingBackBatch(batchId);
    try {
      const result = await rollbackStatementImportBatch({ batchId });
      toast.success(`Removed ${result.deleted_count ?? 0} imported rows.`);
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "Could not undo this import.");
    } finally {
      setRollingBackBatch(null);
    }
  }

  function toggleRow(rowId: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function selectAllNonDuplicates() {
    setSelectedRows(new Set(rows.filter((row) => !row.duplicate_candidate).map((row) => row.row_id)));
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        resetPreview();
        setVendorPrompts([]);
        setVendorChoices({});
      }
    }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-background border border-border text-foreground sm:max-w-3xl" id="dialog-statement-import">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import bank statement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs font-semibold text-foreground">Use this when Android auto-sync is unavailable or you need to catch up older transactions.</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              CSV is most reliable. Text-based PDFs are supported; scanned PDFs are not. PocketBuddy stores only selected transaction rows, not the uploaded file or PDF password.
            </p>
          </div>

          {vendorPrompts.length > 0 && (
            <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-3" id="statement-vendor-review-prompts">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-warning">Repeated vendors found</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Answer once. PocketBuddy will use it for matching statement rows now and future imports.
                </p>
              </div>
              <div className="space-y-2">
                {vendorPrompts.map((prompt) => (
                  <div key={prompt.group_key} className="rounded-lg border border-border bg-background/80 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{prompt.display_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {prompt.count} payments - {rupees(prompt.total_paise)} total
                          {prompt.weekly_count ? ` - ${prompt.weekly_count} in a week` : ""}
                        </p>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[260px] sm:flex-row">
                        <Select
                          value={vendorChoices[prompt.group_key] || ""}
                          onValueChange={(value) => setVendorChoices((prev) => ({ ...prev, [prompt.group_key]: value }))}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="What is it for?" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories
                              .filter((category) => !["other", "income", "salary", "allowance", "refund"].includes(category.v))
                              .map((category) => (
                                <SelectItem key={category.v} value={category.v}>
                                  {category.l}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          disabled={applyingVendorKey === prompt.group_key}
                          onClick={() => handleVendorCategory(prompt)}
                          className="h-9 shrink-0"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Statement file</label>
              <Input
                id="input-statement-file"
                type="file"
                accept=".csv,.tsv,.txt,.pdf,text/csv,application/pdf"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  resetPreview();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">PDF password</label>
              <Input
                id="input-statement-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Only if statement asks for it"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Bank name</label>
              <Input
                id="input-statement-bank"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                placeholder="e.g. SBI, HDFC, ICICI"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Account label</label>
              <Input
                id="input-statement-account-label"
                value={accountLabel}
                onChange={(event) => setAccountLabel(event.target.value)}
                placeholder="e.g. Salary account, hostel spends"
              />
            </div>
          </div>

          {!preview ? (
            <Button id="btn-preview-statement" disabled={busy || !file} onClick={handlePreview} className="w-full">
              <UploadCloud className="mr-2 h-4 w-4" />
              Preview rows before import
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">{selectedCount} of {rows.length} rows selected</p>
                  <p className="text-[11px] text-muted-foreground">
                    {duplicateCount ? `${duplicateCount} duplicate candidate${duplicateCount > 1 ? "s" : ""} skipped by default.` : "No duplicate candidates detected."}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllNonDuplicates}>Select clean rows</Button>
                  <Button variant="outline" size="sm" onClick={resetPreview}>Change file</Button>
                </div>
              </div>

              <div className="max-h-[300px] overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {rows.map((row) => {
                  const checked = selectedRows.has(row.row_id);
                  return (
                    <button
                      key={row.row_id}
                      type="button"
                      onClick={() => toggleRow(row.row_id)}
                      className={`w-full p-3 text-left transition-colors hover:bg-surface-raised/60 ${checked ? "bg-surface-raised/40" : "bg-background"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-foreground truncate">{row.description}</span>
                            <Badge variant="outline" className={getCatBadgeStyles(row.category)}>{row.category}</Badge>
                            {row.duplicate_candidate && <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">Duplicate</Badge>}
                            {row.confidence !== "high" && <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">Review</Badge>}
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {new Date(row.posted_at).toLocaleDateString("en-IN")} - {row.direction === "credit" ? "Credit" : "Debit"}
                            {row.reference ? ` - Ref ${row.reference}` : ""}
                          </p>
                          {row.duplicate_reason && <p className="mt-1 text-[11px] text-warning">Possible duplicate: {row.duplicate_reason}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`text-sm font-black tnum ${row.direction === "credit" ? "text-success" : "text-[#FF6B4A]"}`}>
                            {row.direction === "credit" ? "+" : "-"}{rupees(row.amount_paise)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{checked ? "Selected" : "Skipped"}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {recentBatches.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-surface/70 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Recent statement imports</p>
              {recentBatches.map((batch) => (
                <div key={batch.id || batch._id} className="flex items-center justify-between gap-3 rounded-lg bg-background/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">{batch.bank_name || batch.file_name || "Statement import"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {batch.status || "completed"} - {batch.inserted_count ?? 0} rows
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={batch.status === "rolled_back" || rollingBackBatch === (batch.id || batch._id)}
                    onClick={() => handleRollback(batch.id || batch._id)}
                    className="shrink-0"
                  >
                    <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                    Undo
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          {preview ? (
            <Button id="btn-import-statement-rows" disabled={busy || selectedCount === 0} onClick={handleImport} className="w-full">
              Import selected rows
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTxnForm({ txn, categories, onClose }: { txn: any; categories: { v: string; l: string }[]; onClose: () => void }) {
  const [name, setName] = useState(txn.mapped_merchant_name ?? txn.raw_merchant_string);
  const [direction, setDirection] = useState<"debit" | "credit">(txn.direction === "credit" ? "credit" : "debit");
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
        try {
          await addCatalogItem("transaction-categories", { label: customCat.trim() });
        } catch {}
      }

      const originalDirection = txn.direction === "credit" ? "credit" : "debit";
      if (txn.source === "statement_import" && txn.statement_vendor_key && direction === originalDirection) {
        await applyStatementVendorCategory({
          data: {
            group_key: txn.statement_vendor_key,
            category: finalCategory,
            display_name: name.trim(),
          },
        });
        toast.success("Vendor answer saved for matching statement rows.");
      } else if (txn.source !== "manual" || txn.needs_verification) {
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
            <p className="text-[10px] md:text-xs text-zinc-500 pl-1">This category will be saved and available for future transactions.</p>
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

/* ── Quick Stat Card Component ────────────────────────────────────────── */
function QuickStatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <div className="bg-surface rounded-xl border border-border p-3 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: accent }} />
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
      </div>
      <p className="text-sm font-black tnum text-foreground">{value}</p>
      <p className="text-[9px] md:text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[9px] md:text-xs text-muted-foreground tnum">{sub}</p>}
    </div>
  );
}
