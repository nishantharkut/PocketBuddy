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
  { v: "food", l: "🍜 Food" },
  { v: "stationery", l: "📎 Stationery" },
  { v: "travel", l: "🛺 Travel" },
  { v: "other", l: "📦 Other" },
] as const;

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

  const { data: foods } = useQuery({
    queryKey: ["foods"],
    staleTime: 5 * 60_000,
    queryFn: () => getCampusFood(),
  });

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
    refetchInterval: 5000, // MongoDB real-time replacement polling
    queryFn: async (): Promise<(Pool & { items: PoolItem[] })[]> => {
      const ps = await getCartPools();
      return ps ?? [];
    },
  });

  // Runway calculation
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
      ? "var(--pb-green)"
      : calc.runwayDays >= 7
        ? "var(--pb-amber)"
        : "var(--pb-red)"
    : "var(--pb-blue)";

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
    const week = new Date(today);
    week.setDate(week.getDate() + 7);
    return subs
      .filter((s) => new Date(s.next_debit_date) <= week)
      .map((s) => {
        const newLimit =
          calc.daysLeft > 0 ? Math.round((calc.remaining - s.amount / 100) / calc.daysLeft) : 0;
        return { ...s, newLimit, critical: newLimit < 80 };
      });
  }, [subs, calc]);

  // Recent
  const recent = (txns ?? []).slice(0, 8);

  // Identify / Add dialogs state
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
        stress_note: stressNote || null,
        food_gap_hours: foodGapHours,
        suggestion_given: suggestion,
      },
    });
    localStorage.setItem("pocketbuddy_last_checkin", String(Date.now()));
    setShowCheckIn(false);
    setStressNote("");
    setCheckInExpanded(false);
    if (bestFood) {
      toast(
        `${bestFood.venue_name} has ${bestFood.item_name} (${rupees(bestFood.price)}) — go grab something.`,
      );
    }
  }

  return (
    <AppShell>
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-[color:var(--surface)] px-4">
        <h1 id="logo-dashboard" className="text-[14px] font-semibold tracking-[0.15em]">
          POCKETBUDDY
        </h1>
        <button
          onClick={() => nav({ to: "/companion" })}
          title={
            compStatus === "green"
              ? "Companion syncing"
              : compStatus === "amber"
                ? "Companion idle"
                : "No companion"
          }
          className="flex items-center gap-1.5"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full pulse-dot ${
              compStatus === "green"
                ? "bg-[color:var(--pb-green)]"
                : compStatus === "amber"
                  ? "bg-[color:var(--pb-amber)]"
                  : "bg-[color:var(--pb-red)]"
            }`}
          />
        </button>
        <Badge variant="outline" id="badge-wing" className="text-muted-foreground">
          {profile?.wing_label ?? "—"}
        </Badge>
      </div>

      <div className="space-y-4 px-4 py-4">
        {/* Runway */}
        <Card id="card-runway-status" className="bg-[color:var(--surface-raised)] p-4">
          <p className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
            RUNWAY STATUS
          </p>
          {!calc ? (
            <Skeleton className="mt-2 h-8 w-48" />
          ) : (
            <>
              <h2 className="mt-2 text-[28px] font-bold tnum" style={{ color: runwayColor }}>
                <CountUp to={calc.runwayDays} /> DAYS REMAINING
              </h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                until {rupees(calc.totalAllowance * 100)} resets on {shortDate(calc.cycleEnd)}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Pill>Balance: {rupees(calc.remaining * 100)}</Pill>
                <Pill>Daily Limit: {rupees(calc.safeDailyLimit * 100)}</Pill>
                <Pill>Today: {rupees(calc.spentToday * 100)}</Pill>
              </div>
              <Progress id="progress-runway" value={calc.pct} className="mt-3 h-2" />
              <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                {profile?.companion_paired ? (
                  <>
                    <span className="h-1 w-1 rounded-full bg-[color:var(--pb-green)]" />
                    Auto-tracking via {profile.companion_device_name ?? "companion"}
                  </>
                ) : (
                  <Link to="/companion" className="text-[color:var(--pb-amber)]">
                    ⚠ Manual tracking only — connect companion
                  </Link>
                )}
              </p>
            </>
          )}
        </Card>

        {/* Alert */}
        {calc && (calc.runwayDays < 7 || calc.safeDailyLimit < 150) && (
          <Card
            id="card-runway-alert"
            className="border-l-4 border-l-[color:var(--pb-amber)] bg-[color:var(--surface)] p-4"
          >
            <p className="text-[11px] font-semibold text-[color:var(--pb-amber)] flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[color:var(--pb-amber)]" /> RUNWAY ALERT
            </p>
            <p className="mt-2 text-[13px] leading-relaxed">
              Your daily budget is {rupees(calc.safeDailyLimit * 100)}. Skip ordering delivery
              tonight.
            </p>
            {bestFood && (
              <p className="mt-1 text-[13px]">
                → {bestFood.venue_name} has {bestFood.item_name} ({rupees(bestFood.price)}), open
                until {fmtTime(bestFood.available_until)}.
              </p>
            )}
            <button
              onClick={() => setShowFoodSheet(true)}
              className="mt-2 text-[12px] text-[color:var(--pb-blue)]"
            >
              View all campus food options →
            </button>
          </Card>
        )}

        {/* Active pools */}
        <section id="section-active-pools">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
              ACTIVE POOLS
            </h3>
            <Link
              to="/pool"
              id="btn-new-pool-dash"
              className="text-[12px] text-[color:var(--pb-purple)]"
            >
              + New Pool
            </Link>
          </div>
          <div className="mt-2 space-y-2">
            {(pools ?? []).length === 0 && (
              <p className="py-4 text-center text-[12px] text-muted-foreground">
                No active pools in your wing.
              </p>
            )}
            {(pools ?? []).map((p) => {
              const total = (p.items ?? []).reduce((s: number, i: any) => s + i.estimated_price, 0);
              const minsLeft = Math.max(
                0,
                Math.round((new Date(p.expires_at).getTime() - Date.now()) / 60000),
              );
              const perPerson = (p.items ?? []).length
                ? Math.round(
                    p.delivery_fee / new Set((p.items ?? []).map((i: any) => i.added_by_name)).size,
                  )
                : 0;
              return (
                <Link key={p.id} to="/pool/$id" params={{ id: p.id }}>
                  <Card className="p-3 reactbits-card z-10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">
                          {p.platform.replace("_", " ")}
                        </span>
                        <Badge variant="outline" className="text-muted-foreground">
                          {p.wing_label}
                        </Badge>
                      </div>
                      <span
                        className={`text-[12px] font-medium text-[color:var(--pb-purple)] tnum ${minsLeft < 5 ? "countdown-pulse" : ""}`}
                      >
                        {minsLeft}m left
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Host: {p.created_by_name || "—"} • Cart: {rupees(total)}/
                      {rupees(p.min_cart_value)} min
                    </p>
                    <p className="mt-1 text-[12px] text-[color:var(--pb-green)]">
                      {(p.items ?? []).length} items • Split delivery: {rupees(perPerson)}/person
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Collisions */}
        {collisions.length > 0 && (
          <section id="section-collisions">
            <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
              UPCOMING COLLISIONS
            </h3>
            <div className="mt-2 space-y-2">
              {collisions.map((c) => (
                <Card
                  key={c.id}
                  className={`p-3 reactbits-card z-10 ${c.critical ? "border-l-4 border-l-[color:var(--pb-red)]" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[13px]">
                      {c.service_name} • {shortDate(new Date(c.next_debit_date))}
                      {c.detected_from === "auto_detected" && (
                        <Badge className="ml-2 bg-[color:var(--pb-purple)]/20 text-[color:var(--pb-purple)] text-[10px]">
                          Auto-detected
                        </Badge>
                      )}
                    </p>
                    <p className="text-[13px] font-semibold text-[color:var(--pb-red)] tnum">
                      −{rupees(c.amount)}
                    </p>
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Daily food budget drops to {rupees(c.newLimit * 100)}
                    {c.critical && (
                      <span className="ml-2 text-[color:var(--pb-red)] font-medium">
                        ⚠ CRITICAL
                      </span>
                    )}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Recent */}
        <section id="section-recent">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
              RECENT
            </h3>
            <Link
              to="/transactions"
              id="link-see-all-txns"
              className="text-[12px] text-[color:var(--pb-blue)]"
            >
              See all →
            </Link>
          </div>
          <div className="mt-2 space-y-1.5">
            {!txns ? (
              <Skeleton className="h-32 w-full" />
            ) : recent.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-muted-foreground">
                No transactions yet.
              </p>
            ) : (
              recent.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl reactbits-card p-3 mb-2 z-10"
                  style={{ animation: `pb-stagger 300ms ${i * 50}ms backwards ease-out` }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[13px] truncate ${t.is_mapped ? "" : "italic text-[color:var(--pb-amber)]"}`}
                    >
                      {t.mapped_merchant_name ?? t.raw_merchant_string}
                    </p>
                    <div className="mt-0.5 flex gap-1">
                      {t.category && (
                        <Badge
                          variant="outline"
                          className="text-[9px] py-0 px-1.5 text-muted-foreground"
                        >
                          {t.category}
                        </Badge>
                      )}
                      {t.source !== "manual" && (
                        <Badge className="text-[9px] py-0 px-1.5 bg-[color:var(--pb-purple)]/20 text-[color:var(--pb-purple)]">
                          📲 {t.source.split("_")[1]}
                        </Badge>
                      )}
                      {!t.is_mapped && (
                        <button
                          id={`btn-identify-${t.id}`}
                          onClick={() => setIdentifying(t)}
                          className="rounded bg-[color:var(--pb-amber)]/20 px-1.5 py-0 text-[9px] text-[color:var(--pb-amber)]"
                        >
                          Identify?
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold tnum">{rupees(t.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {relativeTime(t.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <Button
            id="btn-add-transaction"
            variant="outline"
            className="mt-4 w-full reactbits-btn"
            onClick={() => setAdding(true)}
          >
            Log Transaction
          </Button>
        </section>
      </div>

      <style>{`@keyframes pb-stagger { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Identify dialog */}
      <Dialog open={!!identifying} onOpenChange={(o) => !o && setIdentifying(null)}>
        <DialogContent id="dialog-merchant-mapping">
          {identifying && (
            <IdentifyForm
              txn={identifying}
              onClose={() => {
                setIdentifying(null);
                qc.invalidateQueries();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add txn */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent id="dialog-add-transaction">
          <AddTxnForm
            onClose={() => {
              setAdding(false);
              qc.invalidateQueries();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Food options */}
      <Sheet open={showFoodSheet} onOpenChange={setShowFoodSheet}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-auto">
          <SheetHeader>
            <SheetTitle>Campus Food Options</SheetTitle>
          </SheetHeader>
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
                      <div
                        key={it.id}
                        className="flex items-center justify-between rounded bg-[color:var(--surface)] p-2"
                      >
                        <div>
                          <p className="text-sm">{it.item_name}</p>
                          <p
                            className={`text-[11px] ${open ? "text-[color:var(--pb-green)]" : "text-muted-foreground"}`}
                          >
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
      <Dialog
        open={showCheckIn}
        onOpenChange={() => {
          /* not dismissible */
        }}
      >
        <DialogContent
          id="dialog-checkin"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Hey, it's been a while since your last meal.</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">It's exam season. Quick check:</p>
          <p className="text-[12px] text-[color:var(--pb-amber)]">
            Last food transaction was {Math.round(foodGapHours)} hours ago
          </p>
          <div className="mt-3 space-y-2">
            <button
              id="btn-checkin-ate"
              onClick={handleCheckInAte}
              className="w-full rounded-md border-l-4 border-l-[color:var(--pb-green)] bg-[color:var(--surface)] p-3 text-left text-[13px]"
            >
              ✓ I ate at mess / cooked / ordered in
            </button>
            <div className="rounded-md border-l-4 border-l-[color:var(--pb-red)] bg-[color:var(--surface)] p-3">
              <button
                id="btn-checkin-skipped"
                onClick={() => setCheckInExpanded(true)}
                className="w-full text-left text-[13px]"
              >
                ✗ Skipped / couldn't eat
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
                    className="w-full border-[color:var(--pb-red)] text-[color:var(--pb-red)]"
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
    </AppShell>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[color:var(--surface)] px-2.5 py-1 text-[11px] tnum">
      {children}
    </span>
  );
}

function IdentifyForm({ txn, onClose }: { txn: Txn; onClose: () => void }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState<string>("food");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name) {
      toast.error("Enter shop name");
      return;
    }
    setBusy(true);
    try {
      await identifyMerchant({
        data: {
          raw_merchant_string: txn.raw_merchant_string,
          display_name: name,
          category: cat,
        },
      });
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
      <DialogHeader>
        <DialogTitle>What is this shop?</DialogTitle>
      </DialogHeader>
      <code className="block rounded bg-[color:var(--surface-raised)] px-3 py-1.5 text-xs">
        {txn.raw_merchant_string}
      </code>
      <div>
        <label className="text-[12px] text-muted-foreground">Shop name on campus</label>
        <Input
          id="input-map-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Hostel 1 Night Canteen"
          className="mt-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.v}
            onClick={() => setCat(c.v)}
            className={`rounded-md border p-3 text-center text-sm ${cat === c.v ? "border-[color:var(--pb-blue)] bg-[color:var(--pb-blue)]/10" : "border-border bg-[color:var(--surface)]"}`}
          >
            {c.l}
          </button>
        ))}
      </div>
      <DialogFooter>
        <Button
          id="btn-save-merchant"
          disabled={busy}
          onClick={save}
          className="w-full bg-[color:var(--pb-green)] text-white hover:bg-[color:var(--pb-green)]/90"
        >
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
    if (!amount || !merchant) {
      toast.error("Fill all fields");
      return;
    }
    setBusy(true);
    try {
      await insertTransaction({
        data: {
          amount: Math.round(parseFloat(amount) * 100),
          raw_merchant_string: merchant,
          mapped_merchant_name: merchant,
          category: cat,
          source: "manual",
        },
      });
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
      <DialogHeader>
        <DialogTitle>Log a transaction</DialogTitle>
      </DialogHeader>
      <div className="flex items-center rounded-md border border-input bg-[color:var(--surface)]">
        <span className="px-3 text-sm text-muted-foreground">₹</span>
        <input
          id="input-txn-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 bg-transparent py-2 pr-3 text-sm outline-none"
          placeholder="Amount"
        />
      </div>
      <Input
        id="input-txn-merchant"
        value={merchant}
        onChange={(e) => setMerchant(e.target.value)}
        placeholder="BH-2 Night Canteen"
      />
      <div className="grid grid-cols-2 gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.v}
            onClick={() => setCat(c.v)}
            className={`rounded-md border p-3 text-center text-sm ${cat === c.v ? "border-[color:var(--pb-blue)] bg-[color:var(--pb-blue)]/10" : "border-border bg-[color:var(--surface)]"}`}
          >
            {c.l}
          </button>
        ))}
      </div>
      <DialogFooter>
        <Button id="btn-submit-txn" disabled={busy} onClick={save} className="w-full">
          Add
        </Button>
      </DialogFooter>
    </>
  );
}
