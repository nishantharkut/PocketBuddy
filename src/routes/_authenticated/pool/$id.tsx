import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Share2 } from "lucide-react";
import { toast } from "sonner";
import { rupees, relativeTime } from "@/lib/format";
import { getCartPool, getCartPoolItems, insertCartPoolItem } from "@/lib/api/db.functions";

export const Route = createFileRoute("/_authenticated/pool/$id")({
  ssr: false,
  component: PoolDetail,
});

type Pool = any;
type Item = any;

function PoolDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: pool } = useQuery({
    queryKey: ["pool", id],
    queryFn: () => getCartPool({ data: { id } }),
  });

  const { data: items } = useQuery({
    queryKey: ["pool-items", id],
    refetchInterval: 3000, // MongoDB real-time replacement polling
    queryFn: () => getCartPoolItems({ data: { pool_id: id } }),
  });

  const [name, setName] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("pocketbuddy_pool_name") ?? "" : ""
  );
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!pool) return <AppShell><div className="p-4"><Skeleton className="h-40 w-full" /></div></AppShell>;

  const expired = new Date(pool.expires_at).getTime() <= Date.now() || pool.status !== "open";
  const minsLeft = Math.max(0, Math.round((new Date(pool.expires_at).getTime() - Date.now()) / 60000));
  const cartTotal = (items ?? []).reduce((s: number, i: any) => s + i.estimated_price, 0);
  const cartPct = Math.min(100, Math.round((cartTotal / pool.min_cart_value) * 100));
  const grouped = (items ?? []).reduce<Record<string, any[]>>((acc, i: any) => {
    (acc[i.added_by_name] ??= []).push(i); return acc;
  }, {});
  const people = Object.keys(grouped);
  const deliveryPerPerson = people.length ? Math.round(pool.delivery_fee / people.length) : 0;

  async function addItem() {
    if (!user) return;
    if (!name || !item || !price) { toast.error("Fill all fields"); return; }
    localStorage.setItem("pocketbuddy_pool_name", name);
    setBusy(true);
    try {
      await insertCartPoolItem({
        data: {
          pool_id: id,
          added_by_name: name,
          item_description: item,
          estimated_price: Math.round(parseFloat(price) * 100),
        },
      });
      setItem(""); setPrice("");
      toast.success("Item added!");
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to add item");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!pool) return;
    const url = `${window.location.origin}/pool/${id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my cart pool", text: `Join my ${pool.platform} pool on PocketBuddy!`, url });
        return;
      } catch { /* fallthrough */ }
    }
    await navigator.clipboard.writeText(url);
    toast("Link copied!");
  }

  return (
    <AppShell>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-[color:var(--surface)] px-4">
        <button onClick={() => nav({ to: "/pool" })} className="text-muted-foreground"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="text-[14px] font-semibold tracking-[0.15em]">POOL</h1>
      </div>

      <div className="space-y-4 px-4 py-4 pb-72">
        <div className="bg-[color:var(--surface)] rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold capitalize">{pool.platform.replace("_", " ")}</span>
              <Badge variant="outline" className="text-muted-foreground">{pool.wing_label}</Badge>
              <span id="timer-pool" className={`text-[12px] font-medium text-[color:var(--pb-purple)] tnum ${minsLeft < 5 && minsLeft > 0 ? "countdown-pulse" : ""}`}>
                {expired ? "expired" : `${minsLeft}m left`}
              </span>
            </div>
            <Button id="btn-share-pool" size="sm" variant="outline" onClick={share} className="border-[color:var(--pb-purple)] text-[color:var(--pb-purple)]">
              <Share2 className="h-3 w-3 mr-1" /> Share
            </Button>
          </div>
          <div className="mt-3">
            <Progress id="progress-pool-cart" value={cartPct} className="h-2" />
            <p className="mt-1 text-[12px] tnum">{rupees(cartTotal)} / {rupees(pool.min_cart_value)} minimum</p>
          </div>
        </div>

        <Card id="card-split-summary" className="bg-[color:var(--surface-raised)] p-3">
          <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">SPLIT BREAKDOWN</h3>
          <div className="mt-2 space-y-1">
            {people.map((p) => {
              const itemsTotal = grouped[p].reduce((s, i) => s + i.estimated_price, 0);
              return (
                <p key={p} className="text-[13px] tnum">{p}: {rupees(itemsTotal + deliveryPerPerson)}</p>
              );
            })}
            {people.length === 0 && <p className="text-[12px] text-muted-foreground">No items yet.</p>}
          </div>
          <hr className="my-2 border-border" />
          <p className="text-[12px] text-muted-foreground tnum">
            Delivery {rupees(pool.delivery_fee)} ÷ {people.length || 1} people = {rupees(deliveryPerPerson)} each
          </p>
        </Card>

        <div id="list-pool-items">
          {Object.entries(grouped).map(([who, its]) => (
            <div key={who} className="mt-3">
              <div className="text-[11px] font-semibold text-muted-foreground tracking-wide border-b border-border pb-1">{who}</div>
              {its.map((it) => (
                <div key={it.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-[13px]">{it.item_description}</p>
                    <p className="text-[11px] text-muted-foreground">{relativeTime(it.created_at)}</p>
                  </div>
                  <p className="text-[13px] font-semibold tnum">{rupees(it.estimated_price)}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <form id="form-add-item" onSubmit={(e) => { e.preventDefault(); addItem(); }}
        className="fixed inset-x-0 bottom-16 z-30 space-y-2 border-t border-border bg-[color:var(--surface)] p-3">
        {expired ? (
          <div className="rounded bg-[color:var(--pb-amber)]/20 p-2 text-center text-[12px] text-[color:var(--pb-amber)]">This pool is closed</div>
        ) : (
          <>
            <Input id="input-pool-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            <div className="flex gap-2">
              <Input id="input-pool-item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g., Amul Milk 500ml" className="flex-1" />
              <Input id="input-pool-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="₹" className="w-20" />
            </div>
            <Button id="btn-add-pool-item" type="submit" disabled={busy} className="w-full bg-[color:var(--pb-purple)] text-white hover:bg-[color:var(--pb-purple)]/90">
              Add to cart
            </Button>
          </>
        )}
      </form>
    </AppShell>
  );
}
