import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import {
  ChevronLeft, ChevronRight, Download, TrendingUp, TrendingDown, Minus,
  Flame, Calendar, Receipt, Zap, ShoppingBag, Clock,
  Utensils, BookOpen, Bus, Tv, GraduationCap, Coins, Gamepad2, HeartPulse, Wifi, Package
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { rupees } from "@/lib/format";
import { getStats } from "@/lib/api/db.functions";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts";

export const Route = createFileRoute("/_authenticated/stats")({
  ssr: false,
  component: StatsPage,
});

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

function StatsPage() {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState<"income" | "expenses">("expenses");

  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats", user?.id, month, year],
    enabled: !!user,
    queryFn: () => getStats(month, year),
    staleTime: 30_000,
  });

  const monthName = new Date(year, month - 1).toLocaleString("en-IN", { month: "long" });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const breakdown = activeTab === "income"
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

  // Custom label for pie chart
  const renderLabel = ({ cx, cy, midAngle, outerRadius, name, pct }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 16;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (pct < 3) return null;
    const truncatedName = name.length > 10 ? name.slice(0, 10) + "…" : name;
    return (
      <text x={x} y={y} fill="var(--foreground)" textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central" fontSize={10} fontWeight={700} fontFamily="'DM Sans', sans-serif">
        {truncatedName}
        <tspan dx={2} fill="var(--muted-foreground)" fontSize={9}>{pct}%</tspan>
      </text>
    );
  };

  // CSV export
  function exportCSV() {
    if (!stats?.daily_groups) return;
    const rows: string[] = ["Date,Description,Category,Amount (paise),Source,Type"];
    for (const day of stats.daily_groups) {
      for (const t of day.transactions) {
        const desc = (t.mapped_merchant_name || t.raw_merchant_string || "").replace(/,/g, ";");
        rows.push(`${day.date},"${desc}",${t.category || "other"},${t.amount},${t.source},${t.is_income ? "income" : "expense"}`);
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

  const netAmount = stats?.summary?.net ?? 0;

  // Yearly bar chart data
  const yearlyBarData = useMemo(() => {
    return (stats?.yearly_months ?? []).map((m: any) => ({
      name: m.month_name,
      income: Math.round(m.income / 100),
      expenses: Math.round(m.expenses / 100),
      month: m.month,
    }));
  }, [stats?.yearly_months]);

  // Daily expense bar data
  const dailyBarData = useMemo(() => {
    return (stats?.daily_expense_bars ?? []).map((d: any) => ({
      day: d.label,
      amount: Math.round(d.amount / 100),
    }));
  }, [stats?.daily_expense_bars]);

  // Hourly heatmap data
  const hourlyData = useMemo(() => {
    return (stats?.hourly_data ?? []).map((h: any) => ({
      hour: `${h.hour}:00`,
      amount: Math.round(h.amount / 100),
      label: h.hour < 12 ? `${h.hour || 12} AM` : `${h.hour === 12 ? 12 : h.hour - 12} PM`,
    }));
  }, [stats?.hourly_data]);

  // Day of week bar data
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
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">
            Stats & Analytics
          </h1>
        </div>
      </div>

      <div className="py-4 pb-32 space-y-6 animate-[fadeIn_0.3s_ease-out]">

        {/* ── Month Navigation ────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <button onClick={prevMonth} id="btn-stats-prev-month"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border hover:bg-surface-raised transition-colors cursor-pointer">
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
          <div className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:gap-3">
            <h2 className="text-lg font-black font-display tracking-tight text-foreground">
              {monthName} {year}
            </h2>
            <button
              onClick={exportCSV}
              id="btn-export-csv"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 text-[10px] font-black uppercase tracking-[0.08em] text-foreground transition-all hover:bg-surface-raised"
            >
              <Download className="h-4 w-4 text-primary" />
              <span>Export CSV</span>
            </button>
          </div>
          <button onClick={nextMonth} id="btn-stats-next-month"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border hover:bg-surface-raised transition-colors cursor-pointer">
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>
        </div>

        {/* ── Summary Cards ───────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface rounded-xl border border-border p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Income</p>
            <p className="text-sm font-black tnum text-[#5DADE2]">{rupees(stats?.summary?.income ?? 0)}</p>
          </div>
          <div className="bg-surface rounded-xl border border-border p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Expenses</p>
            <p className="text-sm font-black tnum text-[#FF6B4A]">{rupees(stats?.summary?.expenses ?? 0)}</p>
          </div>
          <div className="bg-surface rounded-xl border border-border p-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Net</p>
            <p className={`text-sm font-black tnum ${netAmount >= 0 ? "text-foreground" : "text-[#FF6B4A]"}`}>
              {netAmount >= 0 ? "+" : ""}{rupees(Math.abs(netAmount))}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full bg-white/5 border-none rounded-2xl" />
            <Skeleton className="h-40 w-full bg-white/5 border-none rounded-2xl" />
            <Skeleton className="h-48 w-full bg-white/5 border-none rounded-2xl" />
          </div>
        ) : (
          <>
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
                <button onClick={() => setActiveTab("income")} id="btn-stats-income"
                  className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer relative ${
                    activeTab === "income" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  <span>Income</span>
                  <span className="ml-1.5 text-[#5DADE2] font-black tnum">{rupees(stats?.summary?.income ?? 0)}</span>
                  {activeTab === "income" && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#5DADE2]" />}
                </button>
                <button onClick={() => setActiveTab("expenses")} id="btn-stats-expenses"
                  className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer relative ${
                    activeTab === "expenses" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  <span>Expenses</span>
                  <span className="ml-1.5 text-[#FF6B4A] font-black tnum">{rupees(stats?.summary?.expenses ?? 0)}</span>
                  {activeTab === "expenses" && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF6B4A]" />}
                </button>
              </div>

              {pieData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                    No {activeTab} data for this month
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
                          <span className="inline-flex items-center justify-center w-9 h-6 rounded-md text-[10px] font-black tnum shrink-0"
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
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="w-2 h-2 rounded-full bg-[#5DADE2]" /> Income
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
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
                              <p className="text-[10px] text-muted-foreground">{payload[0].payload.count} txns</p>
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
                              <span className="text-[10px] font-black tnum text-muted-foreground w-5 shrink-0">
                                {i + 1}.
                              </span>
                              <span className="text-xs font-bold text-foreground truncate">{m.name}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">{m.count}×</span>
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
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground capitalize">{stats.biggest_txn.category}</p>
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
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">
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
          </>
        )}
      </div>
    </AppShell>
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
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[9px] text-muted-foreground tnum">{sub}</p>}
    </div>
  );
}
