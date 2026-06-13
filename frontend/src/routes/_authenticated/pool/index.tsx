import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { rupees } from "@/lib/format";
import { getProfile, getCartPools, insertCartPool } from "@/lib/api/db.functions";

export const Route = createFileRoute("/_authenticated/pool/")({
  ssr: false,
  component: PoolList,
});

type Pool = any;

const PLATFORMS = [
  { v: "blinkit" as const, l: "Blinkit" },
  { v: "zepto" as const, l: "Zepto" },
  { v: "swiggy_instamart" as const, l: "Swiggy Instamart" },
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
  }
};

function PoolList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: () => getProfile(),
  });

  const { data: pools } = useQuery({
    queryKey: ["all-pools", profile?.wing_label],
    enabled: !!profile?.wing_label,
    queryFn: () => getCartPools(),
  });

  const now = Date.now();
  const active = (pools ?? []).filter(
    (p) => p.status === "open" && new Date(p.expires_at).getTime() > now,
  );
  const past = (pools ?? []).filter((p) => !active.includes(p));

  return (
    <AppShell>
      <div className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-[color:var(--surface)] px-4">
        <h1 className="text-[14px] font-semibold tracking-[0.15em]">CART POOLS</h1>
      </div>
      <div className="space-y-4 px-4 py-4">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              id="card-create-pool"
              className="w-full rounded-lg border border-dashed border-[color:var(--pb-purple)]/50 bg-[color:var(--surface)] p-5 text-center transition-all hover:bg-[color:var(--surface-raised)] hover:border-[color:var(--pb-purple)] active:scale-95"
            >
              <p className="text-[14px] font-semibold text-[color:var(--pb-purple)]">
                + Start a new cart pool
              </p>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-auto" id="sheet-create-pool">
            <CreatePoolForm
              userId={user?.id}
              userName={profile?.full_name ?? "You"}
              wing={profile?.wing_label ?? "Wing 4B"}
              onDone={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["all-pools"] });
                qc.invalidateQueries({ queryKey: ["pools"] });
              }}
            />
          </SheetContent>
        </Sheet>

        <section>
          <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
            ACTIVE POOLS
          </h3>
          <div className="mt-2 space-y-2">
            {active.length === 0 && (
              <p className="py-4 text-center text-[12px] text-muted-foreground">No active pools.</p>
            )}
            {active.map((p) => (
              <PoolCard key={p.id} pool={p} />
            ))}
          </div>
        </section>

        {past.length > 0 && (
          <details>
            <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
              PAST POOLS ({past.length})
            </summary>
            <div className="mt-2 space-y-2 opacity-50">
              {past.map((p) => (
                <PoolCard key={p.id} pool={p} />
              ))}
            </div>
          </details>
        )}
      </div>
    </AppShell>
  );
}

function PoolCard({ pool }: { pool: Pool }) {
  const minsLeft = Math.max(
    0,
    Math.round((new Date(pool.expires_at).getTime() - Date.now()) / 60000),
  );

  const theme = BRAND_THEMES[pool.platform] || {
    bg: "bg-primary",
    text: "text-primary-foreground",
    name: pool.platform,
    gradient: "from-primary to-accent",
    accent: "text-primary"
  };

  const active = minsLeft > 0 && pool.status === "open";

  return (
    <Link to="/pool/$id" params={{ id: pool.id }} className="block no-underline">
      <Card className={`relative overflow-hidden p-4 border transition-all hover:scale-[1.01] active:scale-[0.99] shadow-sm hover:shadow-md ${
        active
          ? `bg-gradient-to-r ${theme.gradient} text-white border-transparent`
          : "bg-[color:var(--surface)] text-foreground border-border"
      }`}>
        {active && (
          <div className="absolute right-2 top-2">
            <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Open & Join
            </span>
          </div>
        )}

        <div className="flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-black uppercase tracking-tight ${active ? "text-white" : "text-foreground"}`}>
                {theme.name} Pool
              </span>
              <Badge variant="outline" className={`text-[10px] font-bold ${active ? "border-white/40 text-white bg-white/10" : "border-border text-muted-foreground"}`}>
                {pool.wing_label}
              </Badge>
            </div>
            <p className={`text-xs mt-1 ${active ? "text-white/80" : "text-muted-foreground"}`}>
              Host: <span className="font-bold capitalize">{pool.created_by_name || "—"}</span>
            </p>
          </div>

          <div className="mt-4 flex justify-between items-end border-t pt-2.5 border-current/10">
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${active ? "text-white/70" : "text-muted-foreground/80"}`}>
                Min Cart Target
              </p>
              <p className={`text-sm font-black tnum ${active ? "text-white" : "text-foreground"}`}>
                {rupees(pool.min_cart_value)}
              </p>
            </div>
            <div className="text-right">
              {active ? (
                <span className="text-xs font-bold bg-black/25 px-2.5 py-1 rounded-full tnum">
                  ⚡ {minsLeft}m left
                </span>
              ) : (
                <Badge className={`font-bold capitalize ${
                  pool.status === "completed"
                    ? "bg-green-600 text-white"
                    : pool.status === "cancelled"
                    ? "bg-red-600 text-white"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {pool.status}
                </Badge>
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
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]["v"]>("zepto");
  const [minCart, setMinCart] = useState("199");
  const [fee, setFee] = useState("25");
  const [dur, setDur] = useState("30");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!userId) return;
    setBusy(true);
    try {
      const expires = new Date(Date.now() + parseInt(dur, 10) * 60_000).toISOString();
      const data = await insertCartPool({
        data: {
          created_by_name: userName || "You",
          wing_label: wing,
          platform,
          min_cart_value: Math.round(parseFloat(minCart) * 100),
          delivery_fee: Math.round(parseFloat(fee) * 100),
          expires_at: expires,
        },
      });
      toast.success("Pool created! Share with your wing.");
      if (data && navigator.share) {
        navigator
          .share({
            title: "Join my cart pool",
            text: `Join my ${platform} pool on PocketBuddy!`,
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
        <div className="grid grid-cols-3 gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.v}
              onClick={() => setPlatform(p.v)}
              className={`rounded-md border p-3 text-center text-sm ${platform === p.v ? "border-[color:var(--pb-purple)] bg-[color:var(--pb-purple)]/10" : "border-border bg-[color:var(--surface)]"}`}
            >
              {p.l}
            </button>
          ))}
        </div>
        <div>
          <label className="text-[12px] text-muted-foreground">Min cart value</label>
          <div className="mt-1 flex items-center rounded-md border border-input bg-[color:var(--surface)]">
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
          <label className="text-[12px] text-muted-foreground">Delivery fee</label>
          <div className="mt-1 flex items-center rounded-md border border-input bg-[color:var(--surface)]">
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
          <label className="text-[12px] text-muted-foreground">Duration</label>
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
        <Button
          id="btn-create-pool"
          onClick={create}
          disabled={busy}
          className="w-full bg-[color:var(--pb-purple)] text-white hover:bg-[color:var(--pb-purple)]/90"
        >
          Create & Share
        </Button>
      </div>
    </>
  );
}
