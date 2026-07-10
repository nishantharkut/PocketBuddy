
import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { rupees } from "@/lib/format";
import { Clock, AlertCircle, Check, ShieldCheck, Users } from "lucide-react";
import { getProfile, getCartPools, insertCartPool, getCatalog, addCatalogItem } from "@/lib/api/db.functions";

export const Route = createLazyFileRoute("/_authenticated/pool/")({
  component: PoolList,
});

type Pool = any;

// Fallback platforms used ONLY if catalog API fails
const FALLBACK_PLATFORMS = [
  { v: "zepto", l: "Zepto" },
  { v: "blinkit", l: "Blinkit" },
  { v: "swiggy_instamart", l: "Swiggy Instamart" },
  { v: "bigbasket", l: "BigBasket" },
  { v: "jiomart", l: "JioMart" },
  { v: "amazon_now", l: "Amazon Now" },
];

const BRAND_THEMES: Record<string, { bg: string; text: string; name: string; gradient: string; accent: string }> = {
  zepto: {
    bg: "bg-[#5E17EB]",
    text: "text-white",
    name: "Zepto",
    gradient: "from-[#5E17EB] to-[#FF5E00]",
    accent: "text-[#FF5E00]"
  },
  blinkit: {
    bg: "bg-[#F7EC13]",
    text: "text-black",
    name: "Blinkit",
    gradient: "from-[#F7EC13] to-[#14B8A6]",
    accent: "text-[#14B8A6]"
  },
  swiggy_instamart: {
    bg: "bg-[#FC8019]",
    text: "text-white",
    name: "Swiggy Instamart",
    gradient: "from-[#FC8019] to-[#EF4444]",
    accent: "text-[#FC8019]"
  },
  bigbasket: {
    bg: "bg-[#84C225]",
    text: "text-white",
    name: "BigBasket",
    gradient: "from-[#84C225] to-[#69A020]",
    accent: "text-[#84C225]"
  },
  jiomart: {
    bg: "bg-[#0078AD]",
    text: "text-white",
    name: "JioMart",
    gradient: "from-[#0078AD] to-[#005B8C]",
    accent: "text-[#0078AD]"
  },
  amazon_now: {
    bg: "bg-[#FF9900]",
    text: "text-black",
    name: "Amazon Now",
    gradient: "from-[#19222D] to-[#FF9900]",
    accent: "text-[#FF9900]"
  },
};

function getPlatformBorderColor(platform: string): string {
  const map: Record<string, string> = {
    zepto: "border-l-[#5E17EB]",
    blinkit: "border-l-[#F7EC13]",
    swiggy_instamart: "border-l-[#FC8019]",
    bigbasket: "border-l-[#84C225]",
    jiomart: "border-l-[#0078AD]",
    amazon_now: "border-l-[#FF9900]",
  };
  return map[platform] || "border-l-primary";
}

function PoolList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"active" | "completed" | "cancelled">("active");
  const now = Date.now();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: () => getProfile(),
  });

  const { data: pools, isLoading: poolsLoading } = useQuery({
    queryKey: ["all-pools", profile?.wing_label],
    enabled: !!profile?.wing_label,
    queryFn: () => getCartPools(),
  });

  const isLoading = !pools && (profileLoading || poolsLoading);

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

  const activePools = (pools ?? []).filter(
    (p) => (p.status === "open" && new Date(p.expires_at).getTime() > now) ||
           (p.status === "completed" && !isPoolFullyPaid(p)),
  );
  const completedPools = (pools ?? []).filter(
    (p) => p.status === "completed" && isPoolFullyPaid(p),
  );
  const cancelledPools = (pools ?? []).filter(
    (p) => p.status === "cancelled" || p.status === "closed" || (p.status === "open" && new Date(p.expires_at).getTime() <= now),
  );
  const hostedPendingRequests = (pools ?? [])
    .filter((p) => user && p.host_id === user.id)
    .reduce(
      (total, p) => total + ((p.join_requests ?? []) as any[]).filter((request) => request.status === "pending").length,
      0,
    );
  const collectionPools = activePools.filter((p) => p.status === "completed").length;
  const wingName = profile?.wing_label?.trim() || "your wing";

  const tabOptions = [
    { key: "active", label: `Active (${activePools.length})` },
    { key: "completed", label: `Completed (${completedPools.length})` },
    { key: "cancelled", label: `Cancelled (${cancelledPools.length})` },
  ];

  const createPoolForm = (
    <CreatePoolForm
      userId={user?.id}
      userName={
        (typeof window !== "undefined" && localStorage.getItem("pocketbuddy_pool_name")) ||
        user?.fullName ||
        "Host"
      }
      wing={profile?.wing_label ?? ""}
      onDone={() => {
        setOpen(false);
        qc.invalidateQueries({ queryKey: ["all-pools"] });
        qc.invalidateQueries({ queryKey: ["pools"] });
      }}
    />
  );

  return (
    <AppShell>
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/90 px-6 backdrop-blur-md md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">Cart Pools</h1>
        </div>
      </div>
      <div className="space-y-6 py-6">
        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
            <div className="flex flex-col justify-between gap-4 p-4 sm:gap-7 sm:p-7">
              <div className="max-w-2xl">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Wing cart pool</p>
                <h2 className="mt-2 text-xl font-black leading-tight text-foreground sm:mt-3 sm:text-3xl">
                  Host one shared order. Approve who joins.
                </h2>
                <p className="mt-2 text-sm font-medium leading-6 text-muted-foreground sm:hidden">
                  Open a cart for <span className="font-bold text-foreground">{wingName}</span>, approve roommates, and track repayment after checkout.
                </p>
                <p className="mt-3 hidden text-sm font-medium leading-6 text-muted-foreground sm:block">
                  For snacks, groceries, and room supplies: open one cart for <span className="font-bold text-foreground">{wingName}</span>, accept the roommates you know, and track who has paid after checkout.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <button
                  id="card-create-pool"
                  onClick={() => setOpen(true)}
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98]"
                >
                  Start Cart Pool
                </button>
                <div className="hidden items-start gap-2 rounded-xl border border-border bg-background/70 px-3 py-2.5 text-xs font-semibold leading-5 text-muted-foreground sm:flex">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>A shared link only requests access. The cart unlocks after host approval.</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:hidden">
                <div className="rounded-xl border border-border bg-background/70 px-3 py-2.5">
                  <p className="text-base font-black text-foreground tnum">{activePools.length}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Live</p>
                </div>
                <div className="rounded-xl border border-border bg-background/70 px-3 py-2.5">
                  <p className="text-base font-black text-foreground tnum">{hostedPendingRequests}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Requests</p>
                </div>
                <div className="rounded-xl border border-border bg-background/70 px-3 py-2.5">
                  <p className="text-base font-black text-foreground tnum">{collectionPools}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Collecting</p>
                </div>
              </div>
            </div>

            <div className="hidden border-t border-border bg-background/45 p-5 sm:block sm:p-6 lg:border-l lg:border-t-0">
              <div className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-foreground">Current wing queue</p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">Live pools, pending joins, and collections.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-primary/25 bg-primary/10 text-primary">
                    Host controlled
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border bg-background/70 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-lg font-black text-foreground tnum">{activePools.length}</span>
                    </div>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Live</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/70 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-lg font-black text-foreground tnum">{hostedPendingRequests}</span>
                    </div>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">To approve</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/70 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                      <span className="text-lg font-black text-foreground tnum">{collectionPools}</span>
                    </div>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Collecting</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {[
                    ["Host opens the cart", "Pick app, cutoff, and target amount."],
                    ["Roommates request access", "A leaked link cannot add items by itself."],
                    ["Checkout becomes collection", "Splits and UTRs stay attached to each person."],
                  ].map(([title, body], index) => (
                    <div key={title} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] font-black text-foreground">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-foreground">{title}</p>
                        <p className="mt-0.5 text-xs font-medium leading-5 text-muted-foreground">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {isMobile ? (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-auto" id="sheet-create-pool">
              {createPoolForm}
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent id="dialog-create-pool" aria-describedby={undefined} className="max-h-[85vh] max-w-xl overflow-y-auto bg-background text-foreground border border-border">
              {createPoolForm}
            </DialogContent>
          </Dialog>
        )}

        <section className="space-y-4">
          {/* ── Tab Bar ─────────────────────────────────────────────────── */}
          <div className="flex border-b border-border">
            {tabOptions.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key as any)}
                id={`tab-pool-${t.key}`}
                className={`flex-1 py-2.5 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer relative ${
                  tab === t.key
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {tab === t.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-[fadeIn_0.2s_ease-out]">
            {isLoading ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i} className="p-5 border border-border border-l-4 border-l-muted bg-surface relative overflow-hidden">
                    <div className="flex flex-col justify-between h-full space-y-4">
                      <div>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2.5 flex-1">
                            <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                            <div className="flex flex-wrap items-center gap-1.5 flex-1">
                              <Skeleton className="h-5 w-28" />
                              <Skeleton className="h-4 w-12 rounded-full" />
                            </div>
                          </div>
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <div className="mt-4 space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-9 w-full rounded-xl" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2.5 border-t border-border/50">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  </Card>
                ))}
              </>
            ) : tab === "active" ? (
              <>
                {activePools.length === 0 && (
                  <div className="col-span-full py-12 text-center border border-dashed border-border rounded-xl bg-surface-raised/40">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">No active pools.</p>
                  </div>
                )}
                {activePools.map((p) => (
                  <PoolCard key={p.id} pool={p} />
                ))}
              </>
            ) : tab === "completed" ? (
              <>
                {completedPools.length === 0 && (
                  <div className="col-span-full py-12 text-center border border-dashed border-border rounded-xl bg-surface-raised/40">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">No completed pools.</p>
                  </div>
                )}
                {completedPools.map((p) => (
                  <PoolCard key={p.id} pool={p} />
                ))}
              </>
            ) : (
              <>
                {cancelledPools.length === 0 && (
                  <div className="col-span-full py-12 text-center border border-dashed border-border rounded-xl bg-surface-raised/40">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">No cancelled or closed pools.</p>
                  </div>
                )}
                {cancelledPools.map((p) => (
                  <PoolCard key={p.id} pool={p} />
                ))}
              </>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function PoolCard({ pool }: { pool: Pool }) {
  const { user } = useAuth();
  const minsLeft = Math.max(
    0,
    Math.round((new Date(pool.expires_at).getTime() - Date.now()) / 60000),
  );

  const theme = BRAND_THEMES[pool.platform] || {
    bg: "bg-primary",
    text: "text-primary-foreground",
    name: pool.platform_display_label || pool.platform?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Custom",
    gradient: "from-primary to-accent",
    accent: "text-primary"
  };

  const active = minsLeft > 0 && pool.status === "open";
  const platformBorderColor = getPlatformBorderColor(pool.platform);

  const isFullyPaid = useMemo(() => {
    if (pool.status !== "completed") return false;
    const breakdown = pool.split_breakdown ?? {};
    const roommates = Object.keys(breakdown).filter((rName) => {
      const isHost = rName.toLowerCase() === "you" || rName.toLowerCase() === (pool.created_by_name ?? "").toLowerCase();
      return !isHost;
    });
    if (roommates.length === 0) return true;
    return roommates.every((rName) => breakdown[rName].paid);
  }, [pool.status, pool.split_breakdown, pool.created_by_name]);

  // Roommate summary calculations
  const rSummary = useMemo(() => {
    if (pool.status !== "completed") return null;

    const breakdown = pool.split_breakdown ?? {};
    let unpaidCount = 0;
    let unpaidTotal = 0;
    let myOwed = 0;
    let myStatus = "";

    Object.entries(breakdown).forEach(([rName, details]: [string, any]) => {
      const isHost = rName.toLowerCase() === "you" || rName.toLowerCase() === (pool.created_by_name ?? "").toLowerCase();
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
  }, [pool, user]);

  const itemsCount = pool.items?.length ?? 0;
  const pendingRequestCount = user && pool.host_id === user.id
    ? ((pool.join_requests ?? []) as any[]).filter((request) => request.status === "pending").length
    : 0;
  const totalCartValue = useMemo(() => {
    return (pool.items ?? [])
      .filter((it: any) => it.is_purchased)
      .reduce((sum: number, it: any) => sum + it.estimated_price, 0);
  }, [pool.items]);

  let statusLabel = pool.status;
  if (pool.status === "open" && minsLeft <= 0) {
    statusLabel = "expired";
  } else if (pool.status === "closed") {
    statusLabel = "expired";
  }

  const dateStr = pool.created_at 
    ? new Date(pool.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) 
    : "";

  return (
    <Link to="/pool/$id" params={{ id: pool.id }} className="block no-underline">
      <Card className={`relative overflow-hidden p-5 border border-border border-l-4 ${platformBorderColor} bg-surface transition-all duration-200 hover:bg-surface-raised hover:border-r-white/10 hover:border-t-white/10 hover:border-b-white/10 hover:shadow-lg hover:shadow-black/50 active:scale-[0.99]`}>
        <div className="flex flex-col justify-between h-full">
          <div>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlatformIcon platform={pool.platform} name={theme.name} className="h-6 w-6" />
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span className="text-sm font-black uppercase tracking-wider text-foreground truncate max-w-[150px] sm:max-w-none">
                    {theme.name} Pool
                  </span>
                  <Badge variant="outline" className="text-xs font-bold border-border bg-white/5 text-muted-foreground">
                    {pool.wing_label}
                  </Badge>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 bg-white/5 border px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 ${
                active
                  ? "border-[#16A34A]/30 text-[#16A34A]"
                : statusLabel === "completed"
                  ? (isFullyPaid ? "border-success/25 bg-success/10 text-emerald-700 dark:text-success" : "border-amber-500/30 text-amber-400 bg-amber-500/5")
                  : statusLabel === "cancelled"
                  ? "border-rose-500/20 text-[#FF6B4A]"
                  : "border-zinc-500/20 text-zinc-400"
              }`}>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />}
                {active ? "Active" : (statusLabel === "completed" ? (isFullyPaid ? "Settled" : "Splits Active") : statusLabel)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Host: <span className="font-semibold text-foreground capitalize">{pool.created_by_name || "—"}</span>
            </p>

            {pendingRequestCount > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
                <Users className="h-4 w-4" />
                <span>Review {pendingRequestCount} join request{pendingRequestCount === 1 ? "" : "s"}</span>
              </div>
            )}

            {rSummary && (
              <div className="mt-3">
                {user && pool.host_id === user.id ? (
                  rSummary.unpaidTotal > 0 ? (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 px-3 py-2 rounded-xl text-xs text-amber-400 font-bold shadow-sm shadow-black/25">
                      <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                      <span>Collect: <strong className="text-foreground">{rupees(rSummary.unpaidTotal)}</strong> pending from {rSummary.unpaidCount} roommates</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm shadow-black/10 dark:text-success dark:shadow-black/25">
                      <Check className="h-4 w-4 shrink-0 text-emerald-700 dark:text-success" />
                      <span>All splits collected & verified!</span>
                    </div>
                  )
                ) : (
                  rSummary.myOwed > 0 && (
                    rSummary.myStatus === "verified" ? (
                      <div className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm shadow-black/10 dark:text-success dark:shadow-black/25">
                        <Check className="h-4 w-4 shrink-0 text-emerald-700 dark:text-success" />
                        <span>You paid: <strong className="text-foreground">{rupees(rSummary.myOwed)}</strong> (verified)</span>
                      </div>
                    ) : rSummary.myStatus === "pending" ? (
                      <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/25 px-3 py-2 rounded-xl text-xs text-blue-400 font-bold shadow-sm shadow-black/25 animate-pulse">
                        <Clock className="h-4 w-4 shrink-0 text-blue-500" />
                        <span>Verifying your split of <strong className="text-foreground">{rupees(rSummary.myOwed)}</strong> (UTR submitted)</span>
                      </div>
                    ) : rSummary.myStatus === "needs_review" ? (
                      <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 px-3 py-2 rounded-xl text-xs text-orange-400 font-bold shadow-sm shadow-black/25 animate-pulse">
                        <AlertCircle className="h-4 w-4 shrink-0 text-orange-400" />
                        <span>Your split of <strong className="text-foreground">{rupees(rSummary.myOwed)}</strong> needs host review</span>
                      </div>
                    ) : rSummary.myStatus === "rejected" ? (
                      <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/25 px-3 py-2 rounded-xl text-xs text-rose-400 font-bold shadow-sm shadow-black/25">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                        <span>Your last UTR was rejected. Settle <strong className="text-foreground">{rupees(rSummary.myOwed)}</strong> with host</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/25 px-3 py-2 rounded-xl text-xs text-rose-400 font-bold shadow-sm shadow-black/25">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                        <span>You owe: <strong className="text-foreground">{rupees(rSummary.myOwed)}</strong> to host</span>
                      </div>
                    )
                  )
                )}
              </div>
            )}

            {pool.status === "completed" && (
              <div className="mt-3.5 space-y-2 border-t border-border/50 pt-2.5">
                <p className="text-[9px] md:text-xs text-zinc-500 font-bold uppercase tracking-widest pl-0.5">Roommate Splits Status:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(pool.split_breakdown ?? {}).map(([rName, details]: [string, any]) => {
                    const isHost = rName.toLowerCase() === "you" || rName.toLowerCase() === (pool.created_by_name ?? "").toLowerCase();
                    if (isHost) return null;

                    const status = details.payment_status;
                    let dotColor = "bg-zinc-500";
                    let textColor = "text-zinc-400";
                    let label = "Unpaid";
                    if (status === "verified") {
                      dotColor = "bg-emerald-700 dark:bg-success";
                      textColor = "text-emerald-700 dark:text-success";
                      label = details.settlement_mode === "settle_in_kind" ? "In-Kind" : "Paid";
                    } else if (status === "pending") {
                      dotColor = "bg-amber-500 animate-pulse";
                      textColor = "text-amber-400";
                      label = "UTR pending";
                    } else if (status === "needs_review") {
                      dotColor = "bg-orange-500 animate-pulse";
                      textColor = "text-orange-400";
                      label = "Review";
                    } else if (status === "rejected") {
                      dotColor = "bg-rose-500";
                      textColor = "text-rose-400";
                      label = "Rejected";
                    }

                    return (
                      <span
                        key={rName}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border bg-white/5 text-[10px] font-bold ${textColor}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                        <span className="capitalize">{rName} ({rupees(details.total)}): {label}</span>
                      </span>
                    );
                  })}
                  {Object.keys(pool.split_breakdown ?? {}).filter(k => k.toLowerCase() !== "you" && k.toLowerCase() !== (pool.created_by_name ?? "").toLowerCase()).length === 0 && (
                    <span className="text-[10px] md:text-xs text-zinc-500 italic pl-0.5">No roommate splits generated.</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-between items-end border-t border-border pt-3">
            <div className="flex gap-4">
              <div>
                <p className="text-[9px] md:text-xs text-zinc-500 font-bold uppercase tracking-wider">
                  Min Target
                </p>
                <p className="text-xs font-black text-foreground tnum mt-0.5">
                  {rupees(pool.min_cart_value)}
                </p>
              </div>
              <div className="border-l border-border/40 pl-4">
                <p className="text-[9px] md:text-xs text-zinc-500 font-bold uppercase tracking-wider">
                  Current Cart
                </p>
                <p className={`text-xs font-black tnum mt-0.5 ${
                  totalCartValue >= pool.min_cart_value ? "text-[#16A34A]" : "text-foreground"
                }`}>
                  {rupees(totalCartValue)} <span className="text-[9px] md:text-xs font-normal text-muted-foreground">({itemsCount} items)</span>
                </p>
              </div>
            </div>
            <div className="text-right">
              {active ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold bg-white/5 border border-border px-3 py-1 rounded-full text-foreground tnum">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span>{minsLeft}m left</span>
                </span>
              ) : (
                <span className="text-[10px] md:text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                  {dateStr}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function CreatePoolForm({
  userId,
  userName,
  wing,
  onDone,
}: {
  userId: string | undefined;
  userName: string;
  wing: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState("");
  const [customPlatform, setCustomPlatform] = useState("");
  const [minCart, setMinCart] = useState("199");
  const [fee, setFee] = useState("25");
  const [dur, setDur] = useState("30");
  const [autoNudge, setAutoNudge] = useState(false);
  const [nudgeInterval, setNudgeInterval] = useState("24");
  const [busy, setBusy] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Fetch platforms from catalog
  const { data: catalogPlatforms } = useQuery({
    queryKey: ["catalog", "cart-platforms"],
    queryFn: () => getCatalog("cart-platforms"),
    staleTime: 5 * 60 * 1000,
  });

  const platformOptions = useMemo(() => {
    if (catalogPlatforms && catalogPlatforms.length > 0) {
      return catalogPlatforms.map((p: any) => ({
        v: p.value,
        l: p.label,
        metadata: p.metadata || {},
      }));
    }
    return FALLBACK_PLATFORMS.map((p) => ({ ...p, metadata: {} }));
  }, [catalogPlatforms]);

  function selectPlatform(value: string) {
    setPlatform(value);
    setShowCustomInput(false);
    // Auto-fill suggested min cart / fee from metadata
    const selected = platformOptions.find((p: any) => p.v === value);
    if (selected?.metadata?.default_min_cart) {
      setMinCart(String(Math.round(selected.metadata.default_min_cart / 100)));
    }
    if (selected?.metadata?.default_delivery_fee !== undefined) {
      setFee(String(Math.round(selected.metadata.default_delivery_fee / 100)));
    }
  }

  async function handleAddCustomPlatform() {
    const name = customPlatform.trim();
    if (!name) return;
    try {
      const added = await addCatalogItem("cart-platforms", { label: name });
      qc.invalidateQueries({ queryKey: ["catalog", "cart-platforms"] });
      setPlatform(added.value);
      setCustomPlatform("");
      setShowCustomInput(false);
      toast.success(`"${name}" added as a platform`);
    } catch (err: any) {
      toast.error(err.message || "Failed to add platform");
    }
  }

  async function create() {
    if (!userId) return;
    if (!platform) {
      toast.error("Select or add a platform");
      return;
    }
    setBusy(true);
    try {
      const expires = new Date(Date.now() + parseInt(dur, 10) * 60_000).toISOString();
      const selectedLabel = platformOptions.find((p: any) => p.v === platform)?.l || customPlatform || platform;
      const data = await insertCartPool({
        data: {
          created_by_name: userName || "Host",
          wing_label: wing || "Default Wing",
          platform,
          platform_display_label: selectedLabel,
          min_cart_value: Math.round(parseFloat(minCart) * 100),
          delivery_fee: Math.round(parseFloat(fee) * 100),
          expires_at: expires,
          auto_nudge_enabled: autoNudge,
          nudge_interval_hours: parseInt(nudgeInterval, 10),
        },
      });
      toast.success("Pool created! Share with your wing.");
      if (data && navigator.share) {
        navigator
          .share({
            title: "Join my cart pool",
            text: `Join my ${selectedLabel} pool on PocketBuddy!`,
            url: `${window.location.origin}/pool/${data.id}`,
          })
          .catch(() => {});
      }
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Failed to create pool");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>New Cart Pool</SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Platform / Store</label>
          <div className="flex flex-wrap gap-2">
            {platformOptions.map((p: any) => (
              <button
                key={p.v}
                onClick={() => selectPlatform(p.v)}
                className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-all cursor-pointer ${platform === p.v ? "border-primary bg-primary/10 font-bold text-foreground" : "border-border bg-surface text-muted-foreground hover:bg-surface-raised hover:text-foreground"}`}
              >
                <PlatformIcon platform={p.v} name={p.l} className="h-5 w-5" />
                <span>{p.l}</span>
              </button>
            ))}
            {!showCustomInput ? (
              <button
                onClick={() => { setShowCustomInput(true); setPlatform(""); }}
                className="rounded-md border border-dashed border-primary/30 px-3 py-2.5 text-center text-sm text-primary font-semibold hover:bg-primary/5 hover:border-primary/50 transition-all cursor-pointer"
              >
                + Other
              </button>
            ) : (
              <div className="flex gap-1.5 w-full mt-1">
                <input
                  type="text"
                  value={customPlatform}
                  onChange={(e) => setCustomPlatform(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomPlatform(); }}
                  placeholder="e.g. Canteen Order, Local Shop"
                  autoFocus
                  className="flex-1 rounded-md border border-border bg-surface-raised/40 px-3 py-2 text-sm outline-none text-foreground placeholder:text-zinc-600 focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
                />
                <button
                  onClick={handleAddCustomPlatform}
                  className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-bold hover:bg-primary/90 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowCustomInput(false); setCustomPlatform(""); }}
                  className="rounded-md border border-border px-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Min cart value</label>
          <div className="mt-1 flex items-center rounded-md border border-input bg-surface">
            <span className="px-3 text-sm text-muted-foreground">₹</span>
            <input
              id="input-pool-min"
              type="number"
              value={minCart}
              onChange={(e) => setMinCart(e.target.value)}
              className="flex-1 bg-transparent py-2 pr-3 text-sm outline-none"
            />
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Delivery fee</label>
          <div className="mt-1 flex items-center rounded-md border border-input bg-surface">
            <span className="px-3 text-sm text-muted-foreground">₹</span>
            <input
              id="input-pool-fee"
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="flex-1 bg-transparent py-2 pr-3 text-sm outline-none"
            />
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Duration</label>
          <Select value={dur} onValueChange={setDur}>
            <SelectTrigger id="select-pool-duration" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="45">45 min</SelectItem>
              <SelectItem value="60">1 hour</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground">Auto-Nudge Roommates</span>
              <span className="text-[10px] md:text-xs text-muted-foreground">Automated WhatsApp alerts for unpaid splits</span>
            </div>
            <input
              type="checkbox"
              checked={autoNudge}
              onChange={(e) => setAutoNudge(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary"
            />
          </div>
          {autoNudge && (
            <div className="animate-fade-in">
              <label className="text-xs text-muted-foreground font-semibold">Reminder Frequency</label>
              <Select value={nudgeInterval} onValueChange={setNudgeInterval}>
                <SelectTrigger className="mt-1 text-xs h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">Every 12 hours</SelectItem>
                  <SelectItem value="24">Every 24 hours (Daily)</SelectItem>
                  <SelectItem value="48">Every 2 days</SelectItem>
                  <SelectItem value="72">Every 3 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Button
          id="btn-create-pool"
          onClick={create}
          disabled={busy || !platform}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Create & Share
        </Button>
      </div>
    </>
  );
}
