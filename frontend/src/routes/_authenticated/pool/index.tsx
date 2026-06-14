import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { PlatformIcon } from "@/components/PlatformIcon";
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
import { Clock } from "lucide-react";
import { getProfile, getCartPools, insertCartPool, getCatalog, addCatalogItem } from "@/lib/api/db.functions";

export const Route = createFileRoute("/_authenticated/pool/")({
  ssr: false,
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
};

function getPlatformBorderColor(platform: string): string {
  const map: Record<string, string> = {
    zepto: "border-l-[#5E17EB]",
    blinkit: "border-l-[#F7EC13]",
    swiggy_instamart: "border-l-[#FC8019]",
    bigbasket: "border-l-[#84C225]",
    jiomart: "border-l-[#0078AD]",
  };
  return map[platform] || "border-l-primary";
}

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
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">Cart Pools</h1>
        </div>
      </div>
      <div className="space-y-6 py-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              id="card-create-pool"
              className="w-full rounded-xl border border-dashed border-primary/30 hover:border-primary/60 bg-surface/50 p-6 text-center transition-all duration-200 hover:bg-surface-raised active:scale-[0.98] cursor-pointer shadow-sm hover:shadow-lg hover:shadow-black/20"
            >
              <p className="text-xs font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors">
                + Start a New Cart Pool
              </p>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-auto" id="sheet-create-pool">
            <CreatePoolForm
              userId={user?.id}
              userName={user?.fullName || "Host"}
              wing={profile?.wing_label ?? ""}
              onDone={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["all-pools"] });
                qc.invalidateQueries({ queryKey: ["pools"] });
              }}
            />
          </SheetContent>
        </Sheet>

        <section className="space-y-3">
          <h3 className="text-xs font-bold tracking-[0.25em] text-zinc-500 uppercase px-1">
            Active Pools
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {active.length === 0 && (
              <div className="col-span-full py-10 text-center border border-dashed border-border rounded-xl bg-surface-raised/40">
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">No active pools.</p>
              </div>
            )}
            {active.map((p) => (
              <PoolCard key={p.id} pool={p} />
            ))}
          </div>
        </section>

        {past.length > 0 && (
          <details className="group pt-2">
            <summary className="cursor-pointer text-xs font-bold tracking-[0.25em] text-zinc-500 uppercase list-none flex items-center gap-1 hover:text-foreground transition-colors select-none">
              <span className="transition-transform group-open:rotate-90">▶</span>
              Past Pools ({past.length})
            </summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 opacity-65 group-open:animate-[fadeIn_0.2s_ease-out]">
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
    name: pool.platform_display_label || pool.platform?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Custom",
    gradient: "from-primary to-accent",
    accent: "text-primary"
  };

  const active = minsLeft > 0 && pool.status === "open";
  const platformBorderColor = getPlatformBorderColor(pool.platform);

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
              {active && (
                <span className="inline-flex items-center gap-1.5 bg-white/5 border border-border px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider text-foreground shrink-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Open
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Host: <span className="font-semibold text-foreground capitalize">{pool.created_by_name || "—"}</span>
            </p>
          </div>

          <div className="mt-5 flex justify-between items-end border-t border-border pt-3">
            <div>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                Min Cart Target
              </p>
              <p className="text-sm font-black text-foreground tnum mt-0.5">
                {rupees(pool.min_cart_value)}
              </p>
            </div>
            <div className="text-right">
              {active ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold bg-white/5 border border-border px-3 py-1 rounded-full text-foreground tnum">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span>{minsLeft}m left</span>
                </span>
              ) : (
                <Badge className={`text-xs font-bold uppercase tracking-wider ${
                  pool.status === "completed"
                    ? "bg-green-600/15 border border-green-600/30 text-green-500"
                    : pool.status === "cancelled"
                    ? "bg-red-600/15 border border-red-600/30 text-red-500"
                    : "bg-surface-raised text-muted-foreground"
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
  const qc = useQueryClient();
  const [platform, setPlatform] = useState("");
  const [customPlatform, setCustomPlatform] = useState("");
  const [minCart, setMinCart] = useState("199");
  const [fee, setFee] = useState("25");
  const [dur, setDur] = useState("30");
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
