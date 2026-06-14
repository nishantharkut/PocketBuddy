import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { Smartphone, Edit3, ChevronLeft, ChevronRight, Download, CreditCard } from "lucide-react";
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
import { getStats, getProfile, updateTransaction, getCatalog, addCatalogItem } from "@/lib/api/db.functions";

export const Route = createFileRoute("/_authenticated/transactions")({
  ssr: false,
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

type ViewTab = "daily" | "calendar" | "monthly" | "total";

function TxnsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [viewTab, setViewTab] = useState<ViewTab>("daily");
  const [editingTxn, setEditingTxn] = useState<any | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

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

  return (
    <AppShell>
      {/* Page Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">Transaction History</h1>
        </div>
      </div>

      <div className="py-4 pb-32 space-y-5 animate-[fadeIn_0.3s_ease-out]">

        {/* ── Month Navigation ────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} id="btn-txn-prev-month"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border hover:bg-surface-raised transition-colors cursor-pointer">
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
          <h2 className="text-lg font-black font-display tracking-tight text-foreground">
            {viewTab === "monthly" ? `${year}` : `${monthName} ${year}`}
          </h2>
          <button onClick={nextMonth} id="btn-txn-next-month"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border hover:bg-surface-raised transition-colors cursor-pointer">
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>
        </div>

        {/* ── Tab Bar ─────────────────────────────────────────────────── */}
        <div className="flex border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setViewTab(t.key); setSelectedDay(null); }}
              id={`tab-txn-${t.key}`}
              className={`flex-1 py-2.5 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer relative ${
                viewTab === t.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {viewTab === t.key && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* ── Summary Bar ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 bg-surface rounded-xl border border-border p-3">
          <div className="text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Income</p>
            <p className="text-xs font-black tnum text-[#5DADE2]">{rupees(stats?.summary?.income ?? 0)}</p>
          </div>
          <div className="text-center border-x border-border/50">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Expenses</p>
            <p className="text-xs font-black tnum text-[#FF6B4A]">{rupees(stats?.summary?.expenses ?? 0)}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Total</p>
            <p className="text-xs font-black tnum text-foreground">{rupees(Math.abs(stats?.summary?.net ?? 0))}</p>
          </div>
        </div>

        {/* ── Category Filters ────────────────────────────────────────── */}
        {!isLoading && viewTab === "daily" && (
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

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full bg-white/5 border-none rounded-2xl" />
            <Skeleton className="h-40 w-full bg-white/5 border-none rounded-2xl" />
          </div>
        ) : (
          <>
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
                  setViewTab("daily");
                }}
              />
            )}

            {/* ═══════════ MONTHLY TAB ═══════════ */}
            {viewTab === "monthly" && (
              <MonthlyView
                yearlyMonths={stats?.yearly_months ?? []}
                weeks={stats?.weeks ?? []}
                currentMonth={month}
                onMonthClick={(m: number) => { setMonth(m); setViewTab("daily"); }}
              />
            )}

            {/* ═══════════ TOTAL TAB ═══════════ */}
            {viewTab === "total" && (
              <TotalView
                stats={stats}
                monthName={monthName}
                year={year}
                onExport={exportCSV}
              />
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
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                {group.weekday}
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground tnum">
                {String(month).padStart(2, "0")}.{year}
              </span>
            </div>
            <div className="flex items-center gap-3 text-right">
              <span className="text-[10px] font-bold tnum text-[#5DADE2]">{rupees(group.income)}</span>
              <span className="text-[10px] font-bold tnum text-[#FF6B4A]">{rupees(group.expenses)}</span>
            </div>
          </div>

          {/* Transactions */}
          <div className="divide-y divide-border/30">
            {group.transactions.map((t: any) => {
              const isCompanion = (t.source || "").startsWith("companion");
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-raised/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${getCatBadgeStyles(t.category)}`}>
                        {t.category || "other"}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-foreground truncate">
                      {t.mapped_merchant_name ?? t.raw_merchant_string}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {isCompanion ? "Companion" : "Manual"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <span className={`text-xs font-black tnum ${t.is_income ? "text-[#5DADE2]" : "text-[#FF6B4A]"}`}>
                      {t.is_income ? "+" : ""}{rupees(t.amount)}
                    </span>
                    <button
                      onClick={() => onEdit(t)}
                      className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-all cursor-pointer"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                  </div>
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
  yearlyMonths, weeks, currentMonth, onMonthClick,
}: {
  yearlyMonths: any[]; weeks: any[];
  currentMonth: number; onMonthClick: (m: number) => void;
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
                  <p className="text-[9px] text-muted-foreground mt-0.5 tnum">
                    {m.month}.1 ~ {m.month}.{new Date(2026, m.month, 0).getDate()}
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
                        <span className="text-[10px] tnum font-semibold text-[#5DADE2]">{rupees(w.income)}</span>
                      </div>
                      <div className="flex flex-col items-end border-l border-border/30 pl-2.5">
                        <span className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground">Expenses</span>
                        <span className="text-[10px] tnum font-semibold text-[#FF6B4A]">{rupees(w.expenses)}</span>
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
   TOTAL VIEW — Budget, accounts summary, export
   ═══════════════════════════════════════════════════════════════════════ */
function TotalView({
  stats, monthName, year, onExport,
}: {
  stats: any; monthName: string; year: number; onExport: () => void;
}) {
  const comparedPct = stats?.compared_expenses_pct ?? 0;
  const companion = stats?.source_breakdown?.companion ?? 0;
  const manual = stats?.source_breakdown?.manual ?? 0;
  const totalExpenses = stats?.summary?.expenses ?? 0;

  return (
    <div className="space-y-4">
      {/* Accounts Summary */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground font-display flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" /> Accounts
          </h3>
          <span className="text-[10px] font-semibold text-muted-foreground tnum">
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
          <div className="flex items-center justify-between py-2">
            <span className="text-xs font-bold text-foreground">Total Expenses</span>
            <span className="text-xs font-black tnum text-[#FF6B4A]">{rupees(totalExpenses)}</span>
          </div>
        </div>
      </div>

      {/* Export Button */}
      <button
        onClick={onExport}
        id="btn-export-txn-csv"
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface border border-border text-xs font-bold uppercase tracking-wider text-foreground hover:bg-surface-raised transition-all cursor-pointer"
      >
        <Download className="h-4 w-4" />
        Export Data to CSV
      </button>
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
        // Also add to the catalog for reuse
        try {
          await addCatalogItem("transaction-categories", { label: customCat.trim() });
        } catch {
          // Idempotent — ignore if it already exists
        }
      }
      await updateTransaction({
        id: txn.id,
        data: {
          mapped_merchant_name: name.trim(),
          category: finalCategory,
          direction: direction,
        },
      });
      toast.success("Transaction updated.");
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
            <p className="text-[10px] text-zinc-500 pl-1">This category will be saved and available for future transactions.</p>
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
