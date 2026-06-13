import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, Share2, Trash2, Check, X, AlertCircle, Sparkles, ExternalLink, User, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { rupees, relativeTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import {
  getCartPool,
  getCartPoolItems,
  insertCartPoolItem,
  deleteCartPoolItem,
  updateCartPool,
  updateCartPoolItem,
  getProfile,
  paymentConfirm,
  paymentVerify,
} from "@/lib/api/db.functions";

export const Route = createFileRoute("/pool/$id")({
  ssr: false,
  component: PoolDetail,
});

type Pool = any;
type Item = any;

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

function formatExternalUrl(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function PoolDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();

  // Queries
  const { data: pool } = useQuery({
    queryKey: ["pool", id],
    queryFn: () => getCartPool({ data: { id } }),
  });

  const { data: items } = useQuery({
    queryKey: ["pool-items", id],
    refetchInterval: 3000, // MongoDB polling for real-time reactivity
    queryFn: () => getCartPoolItems({ data: { pool_id: id } }),
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: () => getProfile(),
  });

  // Local state
  const [name, setName] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("pocketbuddy_pool_name") ?? "") : "",
  );
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // Host checkout modal state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [finalDeliveryFee, setFinalDeliveryFee] = useState("");
  const [finalSurgeFee, setFinalSurgeFee] = useState("");
  const [finalDiscount, setFinalDiscount] = useState("");
  const [hostUpi, setHostUpi] = useState("");

  // Roommate selected identity for payment details
  const [selectedPayeeName, setSelectedPayeeName] = useState("");

  // UTR confirmation state
  const [confirmUtrOpen, setConfirmUtrOpen] = useState(false);
  const [utrInput, setUtrInput] = useState("");

  // Pre-fill checkout inputs when modal opens
  useEffect(() => {
    if (pool) {
      setFinalDeliveryFee(String(Math.round(pool.delivery_fee / 100)));
      setFinalSurgeFee("0");
      setFinalDiscount("0");
      setHostUpi(pool.upi_id ?? profile?.upi_id ?? "");
    }
  }, [pool, profile]);

  if (!pool)
    return (
      <AppShell>
        <div className="p-4 space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      </AppShell>
    );

  const isHost = user && pool.host_id === user.id;
  const expired = new Date(pool.expires_at).getTime() <= Date.now() || pool.status !== "open";
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

  // Group items by roommate
  const allItems = (items ?? []) as any[];
  const itemsWithLinks = allItems.filter((i: any) => i.product_url && i.is_purchased !== false);
  const purchasedItems = allItems.filter((i: any) => i.is_purchased !== false);
  const cartTotal = purchasedItems.reduce((s: number, i: any) => s + i.estimated_price, 0);
  const cartPct = Math.min(100, Math.round((cartTotal / pool.min_cart_value) * 100));

  const grouped: Record<string, any[]> = allItems.reduce((acc: any, i: any) => {
    (acc[i.added_by_name] ??= []).push(i);
    return acc;
  }, {});

  const participants = Object.keys(grouped);

  // Split logic
  let deliveryPerPerson = 0;
  let splitBreakdown: Record<string, { itemsTotal: number; share: number; total: number; name: string; paid: boolean; paymentStatus: string; utr: string }> = {};

  if (pool.status === "completed") {
    const activeParticipants = listActiveParticipants(allItems);
    const numPeople = activeParticipants.length;
    const netOverhead = (pool.final_overhead ?? 0) - (pool.final_discount ?? 0);
    const overheadShare = numPeople > 0 ? Math.round(netOverhead / numPeople) : 0;

    activeParticipants.forEach((p) => {
      const pItemsTotal = (grouped[p] ?? [])
        .filter((i) => i.is_purchased !== false)
        .reduce((s, i) => s + i.estimated_price, 0);

      const payment = (pool.payments ?? []).find((pay: any) => pay.name === p);
      const isHostUser = p.toLowerCase() === (pool.created_by_name ?? "").toLowerCase();

      splitBreakdown[p] = {
        name: p,
        itemsTotal: pItemsTotal,
        share: overheadShare,
        total: pItemsTotal + overheadShare,
        paid: isHostUser ? true : (payment ? payment.status === "verified" : false),
        paymentStatus: isHostUser ? "host" : (payment ? payment.status : "unpaid"),
        utr: payment ? payment.utr : "",
      };
    });
  } else {
    // Open state estimates
    const numPeople = participants.length;
    deliveryPerPerson = numPeople > 0 ? Math.round(pool.delivery_fee / numPeople) : pool.delivery_fee;

    participants.forEach((p) => {
      const pItemsTotal = (grouped[p] ?? [])
        .filter((i) => i.is_purchased !== false)
        .reduce((s, i) => s + i.estimated_price, 0);

      const isHostUser = p.toLowerCase() === (pool.created_by_name ?? "").toLowerCase();

      splitBreakdown[p] = {
        name: p,
        itemsTotal: pItemsTotal,
        share: deliveryPerPerson,
        total: pItemsTotal + deliveryPerPerson,
        paid: isHostUser ? true : false,
        paymentStatus: isHostUser ? "host" : "unpaid",
        utr: "",
      };
    });
  }

  function listActiveParticipants(itemsList: any[]) {
    return Array.from(new Set(itemsList.filter((i) => i.is_purchased !== false).map((i) => i.added_by_name)));
  }

  // Actions
  async function addItem() {
    if (!name.trim() || !item.trim() || !price.trim()) {
      toast.error("Fill all fields");
      return;
    }

    const numericPrice = parseFloat(price.trim());
    if (isNaN(numericPrice) || numericPrice <= 0 || numericPrice > 5000) {
      toast.error("Estimated price must be between ₹1 and ₹5,000");
      return;
    }

    localStorage.setItem("pocketbuddy_pool_name", name.trim());
    setBusy(true);
    try {
      await insertCartPoolItem({
        data: {
          pool_id: id,
          added_by_name: name.trim(),
          item_description: item.trim(),
          estimated_price: Math.round(numericPrice * 100),
          product_url: productUrl.trim() || null,
        },
      });
      setItem("");
      setPrice("");
      setProductUrl("");
      toast.success("Item added!");
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to add item");
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(itemId: string) {
    if (!confirm("Remove this item?")) return;
    try {
      await deleteCartPoolItem({ pool_id: id, item_id: itemId });
      toast.success("Item removed");
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete item");
    }
  }

  async function toggleAvailability(itemId: string, currentStatus: boolean) {
    try {
      await updateCartPoolItem({
        pool_id: id,
        item_id: itemId,
        data: { is_purchased: !currentStatus }
      });
      toast.success("Item updated");
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
    } catch (err: any) {
      toast.error("Failed to update item availability");
    }
  }

  async function share() {
    const url = `${window.location.origin}/pool/${id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join my cart pool",
          text: `Add your items to my ${theme.name} pool on PocketBuddy!`,
          url,
        });
        return;
      } catch {
        /* fallthrough */
      }
    }
    await navigator.clipboard.writeText(url);
    toast("Link copied to clipboard!");
  }

  async function completeCheckout() {
    setBusy(true);
    try {
      const overheadValue = Math.round((parseFloat(finalDeliveryFee || "0") + parseFloat(finalSurgeFee || "0")) * 100);
      const discountValue = Math.round(parseFloat(finalDiscount || "0") * 100);

      await updateCartPool({
        id,
        data: {
          status: "completed",
          upi_id: hostUpi.trim() || null,
          final_overhead: overheadValue,
          final_discount: discountValue,
        }
      });

      toast.success("Order split finalized! Roommates can now view and pay.");
      setCheckoutOpen(false);
      qc.invalidateQueries({ queryKey: ["pool", id] });
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to checkout pool");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPool() {
    if (!confirm("Are you sure you want to cancel this pool? This cannot be undone.")) return;
    try {
      await updateCartPool({
        id,
        data: { status: "cancelled" }
      });
      toast("Pool cancelled");
      qc.invalidateQueries({ queryKey: ["pool", id] });
    } catch (err: any) {
      toast.error("Failed to cancel pool");
    }
  }

  // Submit UTR verification record
  async function submitUtrVerification() {
    if (!utrInput.trim() || utrInput.trim().length !== 12 || !/^\d+$/.test(utrInput.trim())) {
      toast.error("Enter a valid 12-digit numeric UPI Ref / UTR number");
      return;
    }
    const targetRoommate = selectedPayeeName || name;
    if (!targetRoommate) {
      toast.error("Please select or type your roommate name first.");
      return;
    }
    setBusy(true);
    try {
      await paymentConfirm({
        pool_id: id,
        data: {
          roommate_name: targetRoommate,
          utr: utrInput.trim()
        }
      });
      toast.success("Notification sent! Host will verify the credit.");
      setConfirmUtrOpen(false);
      setUtrInput("");
      qc.invalidateQueries({ queryKey: ["pool", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm payment");
    } finally {
      setBusy(false);
    }
  }

  // Host verify or reject roommate payment UTR
  async function handleVerifyPayment(roommateName: string, action: "verify" | "reject") {
    try {
      await paymentVerify({
        pool_id: id,
        data: {
          roommate_name: roommateName,
          action
        }
      });
      toast.success(action === "verify" ? `Verified payment for ${roommateName}` : `Rejected payment for ${roommateName}`);
      qc.invalidateQueries({ queryKey: ["pool", id] });
    } catch (err: any) {
      toast.error(err.message || "Verification action failed");
    }
  }

  // Generate UPI pay deep link
  const payeeDetails = splitBreakdown[selectedPayeeName || name];
  const upiPayUrl = pool.upi_id && payeeDetails
    ? `upi://pay?pa=${pool.upi_id}&pn=${encodeURIComponent(pool.created_by_name || "Host")}&am=${(payeeDetails.total / 100).toFixed(2)}&tn=${encodeURIComponent(`PocketBuddy ${theme.name} Pool Split`)}&cu=INR`
    : "";

  const qrCodeUrl = upiPayUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiPayUrl)}`
    : "";

  return (
    <AppShell>
      {/* Dynamic Header Banner */}
      <div className={`sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-[color:var(--surface)] px-4`}>
        <div className="flex items-center gap-3">
          <button onClick={() => nav({ to: isHost ? "/pool" : "/dashboard" })} className="text-muted-foreground">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-[14px] font-bold tracking-[0.15em] flex items-center gap-1.5 uppercase">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Pooler
          </span>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wider bg-muted/50 border-border">
            {theme.name}
          </Badge>
          <Button
            id="btn-share-pool"
            size="icon"
            variant="outline"
            onClick={share}
            className="h-8 w-8 rounded-full"
            title="Share Pool link"
          >
            <Share2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Platform Theme Hero Gradient */}
      <div className={`w-full bg-gradient-to-r ${theme.gradient} px-5 py-6 text-white shadow-inner flex flex-col justify-between relative overflow-hidden`}>
        <div className="absolute right-0 top-0 opacity-15 transform translate-x-4 -translate-y-4">
          <Sparkles className="h-28 w-28" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest opacity-80">Quick Commerce Splitting</p>
          <h2 className="text-2xl font-black mt-1 uppercase tracking-tight">
            {theme.name} Pool
          </h2>
          <p className="text-[12px] opacity-90 mt-0.5">
            Created by {pool.created_by_name} • Wing {pool.wing_label}
          </p>
        </div>

        <div className="mt-6 flex justify-between items-end">
          <div>
            <p className="text-xs opacity-75">Target Cart Total</p>
            <p className="text-lg font-bold tnum">{rupees(cartTotal)} / {rupees(pool.min_cart_value)}</p>
          </div>
          <div>
            {pool.status === "completed" ? (
              <Badge className="bg-green-600 text-white font-bold px-3 py-1">FINALIZED</Badge>
            ) : pool.status === "cancelled" ? (
              <Badge className="bg-red-600 text-white font-bold px-3 py-1">CANCELLED</Badge>
            ) : expired ? (
              <Badge className="bg-gray-600 text-white font-bold px-3 py-1">CLOSED</Badge>
            ) : (
              <span id="timer-pool" className="text-xs font-semibold bg-black/20 rounded-full px-3 py-1 tnum">
                {minsLeft}m left
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 pb-96">
        {/* Progress bar to target minimum */}
        {pool.status === "open" && (
          <Card className="p-3 bg-[color:var(--surface)] border-border">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider">Cart Threshold</span>
              <span className="font-bold text-foreground">{cartPct}% Complete</span>
            </div>
            <Progress id="progress-pool-cart" value={cartPct} className="h-2.5 bg-muted" />
            <p className="mt-2 text-xs text-muted-foreground">
              {cartTotal >= pool.min_cart_value
                ? "🎉 Target cart minimum reached! Split delivery is active."
                : `Need ${rupees(pool.min_cart_value - cartTotal)} more to strip small-cart/delivery fees.`}
            </p>
          </Card>
        )}

        {/* Host controls dashboard panel */}
        {isHost && (
          <Card className="p-4 border border-[color:var(--pb-purple)]/40 bg-[color:var(--surface-raised)] space-y-3 shadow-md">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-xs font-bold text-[color:var(--pb-purple)] tracking-widest uppercase">
                🛡️ Host Console
              </h3>
              <Badge variant="outline" className="text-[10px] border-[color:var(--pb-purple)]/30 text-[color:var(--pb-purple)]">
                Host Mode
              </Badge>
            </div>

            {pool.status === "open" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    id="btn-host-checkout"
                    onClick={() => setCheckoutOpen(true)}
                    className="bg-[color:var(--pb-purple)] text-white hover:bg-[color:var(--pb-purple)]/90"
                  >
                    Complete & Split
                  </Button>
                  <Button
                    id="btn-host-cancel"
                    variant="outline"
                    onClick={cancelPool}
                    className="border-red-500 text-red-500 hover:bg-red-500/10"
                  >
                    Cancel Pool
                  </Button>
                </div>

                {itemsWithLinks.length > 0 && (
                  <div className="bg-[color:var(--surface)] p-3 rounded-lg border border-border space-y-2 mt-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <span>🔗 Roommate Product Links</span>
                      <span className="bg-muted px-1.5 py-0.5 rounded text-[9px] font-bold">{itemsWithLinks.length}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {itemsWithLinks.map((it: any) => (
                        <a
                          key={it.id}
                          href={formatExternalUrl(it.product_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border transition-all shadow-sm ${
                            pool.platform === 'zepto'
                              ? 'bg-[#5E17EB]/5 border-[#5E17EB]/10 text-[#5E17EB] hover:bg-[#5E17EB]/15'
                              : pool.platform === 'blinkit'
                              ? 'bg-yellow-500/5 border-yellow-500/10 text-yellow-700 hover:bg-yellow-500/15 dark:text-yellow-400'
                              : pool.platform === 'swiggy_instamart'
                              ? 'bg-[#FC8019]/5 border-[#FC8019]/10 text-[#FC8019] hover:bg-[#FC8019]/15'
                              : 'bg-muted border-border text-muted-foreground hover:bg-muted-hover'
                          }`}
                        >
                          <span className="max-w-[140px] truncate capitalize">{it.added_by_name}: {it.item_description}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-80" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : pool.status === "completed" ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-semibold">
                  Order complete! Review payment verification queue below:
                </p>

                {/* Host Payment Verification Checklist */}
                <div className="space-y-2 max-h-48 overflow-auto">
                  {(pool.payments ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-1">No payment notifications submitted yet.</p>
                  ) : (
                    (pool.payments as any[]).map((pay) => (
                      <div key={pay.name} className="flex items-center justify-between bg-[color:var(--surface)] p-2 rounded border border-border text-xs">
                        <div>
                          <p className="font-bold capitalize">{pay.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">UTR: {pay.utr}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {pay.status === "verified" ? (
                            <Badge className="bg-green-600 text-white font-bold py-0.5 px-2">VERIFIED ✓</Badge>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleVerifyPayment(pay.name, "verify")}
                                className="h-7 bg-green-600 text-white hover:bg-green-700 py-0.5 px-2"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleVerifyPayment(pay.name, "reject")}
                                className="h-7 border-red-500 text-red-500 hover:bg-red-500/10 py-0.5 px-2"
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2 pt-1.5 border-t border-border">
                  <div className="text-xs bg-muted px-2.5 py-1 rounded border border-border">
                    Final fees: <strong>{rupees(pool.final_overhead)}</strong>
                  </div>
                  {pool.final_discount > 0 && (
                    <div className="text-xs bg-green-500/10 text-green-500 px-2.5 py-1 rounded border border-green-500/20">
                      Saved: <strong>{rupees(pool.final_discount)}</strong>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">This pool is cancelled.</p>
            )}
          </Card>
        )}

        {/* Splits breakdown summary */}
        {participants.length > 0 && (
          <Card id="card-split-summary" className="p-4 bg-[color:var(--surface)] border-border space-y-3 shadow-sm">
            <h3 className="text-xs font-bold text-muted-foreground tracking-widest uppercase border-b border-border pb-1.5">
              {pool.status === "completed" ? "💵 Final Splits" : "📊 Estimated Splits"}
            </h3>
            <div className="space-y-2.5 mt-2">
              {Object.entries(splitBreakdown).map(([pName, details]) => (
                <div key={pName} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    {pool.status === "completed" ? (
                      <span className={`h-2.5 w-2.5 rounded-full ${
                        details.paymentStatus === "verified" || details.paymentStatus === "host"
                          ? "bg-green-500"
                          : details.paymentStatus === "pending"
                            ? "bg-amber-500 animate-pulse"
                            : "bg-red-500"
                      }`} />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                    )}
                    <span className="font-medium capitalize">{pName}</span>
                    {pName === name && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1 border-muted bg-muted/40">You</Badge>
                    )}
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      ({rupees(details.itemsTotal)} + {rupees(details.share)} fee)
                    </span>
                    <span className="font-bold text-sm tnum">{rupees(details.total)}</span>
                    {pool.status === "completed" && (
                      <span className="text-[10px] opacity-85 font-semibold">
                        {details.paymentStatus === "verified" ? (
                          <span className="text-green-500 font-medium">Verified</span>
                        ) : details.paymentStatus === "pending" ? (
                          <span className="text-amber-500 font-medium">Pending Verify</span>
                        ) : details.paymentStatus === "host" ? (
                          <span className="text-[color:var(--pb-purple)] font-bold">Host 👑</span>
                        ) : (
                          <span className="text-red-500 font-medium">Unpaid</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-border flex justify-between text-xs text-muted-foreground font-mono">
              <span>Overhead per person:</span>
              {pool.status === "completed" ? (
                <span>{rupees(splitBreakdown[Object.keys(splitBreakdown)[0]]?.share ?? 0)} each</span>
              ) : (
                <span>{rupees(deliveryPerPerson)} each (delivery: {rupees(pool.delivery_fee)})</span>
              )}
            </div>
          </Card>
        )}

        {/* UPI Payments Portal */}
        {pool.status === "completed" && (
          <Card className="p-4 border-2 border-green-500/20 bg-green-500/5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-green-500/10 pb-2">
              <h3 className="text-xs font-black text-green-600 tracking-widest uppercase flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> UPI Instant Pay
              </h3>
              <Badge className="bg-green-500 text-white text-[10px] font-bold">Secure VPA</Badge>
            </div>

            {!pool.upi_id ? (
              <div className="flex gap-2.5 items-start text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  No host UPI address found. Please contact <strong>{pool.created_by_name}</strong> to pay manually.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground font-medium">Select roommate to view split payment:</label>
                  <select
                    className="w-full bg-[color:var(--surface)] text-foreground border border-border rounded-md py-1.5 px-3 text-sm focus:outline-none"
                    value={selectedPayeeName || name}
                    onChange={(e) => setSelectedPayeeName(e.target.value)}
                  >
                    <option value="" disabled>-- Choose Participant --</option>
                    {participants.filter(p => splitBreakdown[p]).map(p => (
                      <option key={p} value={p}>
                        {p} ({rupees(splitBreakdown[p].total)}) - {
                          splitBreakdown[p].paymentStatus === "verified"
                            ? "Verified ✓"
                            : splitBreakdown[p].paymentStatus === "pending"
                              ? "Pending Verify ⏳"
                              : splitBreakdown[p].paymentStatus === "host"
                                ? "Host 👑"
                                : "Unpaid ❌"
                        }
                      </option>
                    ))}
                  </select>
                </div>

                {payeeDetails ? (
                  <div className="bg-[color:var(--surface)] rounded-xl p-4 border border-border flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Final Pay Share</p>
                      <h4 className="text-2xl font-black text-foreground tnum">{rupees(payeeDetails.total)}</h4>
                      <p className="text-[11px] text-muted-foreground">Paying to UPI ID: <code className="bg-muted px-1.5 py-0.5 rounded font-mono select-all text-foreground">{pool.upi_id}</code></p>
                    </div>

                    {payeeDetails.paymentStatus === "verified" ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-full font-bold">
                        <Check className="h-4 w-4" /> Split Paid & Host Confirmed
                      </div>
                    ) : payeeDetails.paymentStatus === "pending" ? (
                      <div className="text-center space-y-1">
                        <div className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-full font-bold">
                          Pending Host Verification ⏳
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono">UTR: {payeeDetails.utr}</p>
                      </div>
                    ) : payeeDetails.paymentStatus === "host" ? (
                      <div className="flex items-center gap-1.5 text-xs text-[color:var(--pb-purple)] bg-[color:var(--pb-purple)]/10 border border-[color:var(--pb-purple)]/20 px-4 py-2 rounded-full font-bold">
                        👑 Host (You are receiving splits)
                      </div>
                    ) : (
                      <div className="w-full space-y-4 text-center">
                        {/* QR Code Container for desktop */}
                        <div className="hidden sm:flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-border max-w-[200px] mx-auto">
                          <img src={qrCodeUrl} alt="UPI Pay QR" className="h-32 w-32" />
                          <span className="text-[9px] text-gray-500 font-medium">Scan with GPay/Paytm/PhonePe</span>
                        </div>

                        {/* Step 1: Make Payment */}
                        <div className="w-full space-y-2 text-left bg-muted/40 p-3 rounded-lg border border-border/40">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <span className="bg-[color:var(--pb-purple)] text-white w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold">1</span>
                            <span>Pay Wing Host</span>
                          </p>
                          {/* Mobile Click to Pay Button */}
                          <a
                            href={upiPayUrl}
                            className="block w-full sm:hidden"
                            onClick={() => {
                              toast.info("Opening UPI mobile app...");
                            }}
                          >
                            <Button className="w-full bg-[color:var(--pb-purple)] text-white hover:bg-[color:var(--pb-purple)]/90 flex items-center justify-center gap-1.5 h-10 font-bold">
                              Pay via UPI app <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                          <p className="text-[11px] text-muted-foreground mt-1.5">
                            Transfer exactly <strong className="text-foreground">{rupees(payeeDetails.total)}</strong> to the host VPA.
                          </p>
                        </div>

                        {/* Step 2: Confirm Payment */}
                        <div className="w-full space-y-2 text-left bg-green-500/5 p-3 rounded-lg border border-green-500/10">
                          <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="bg-green-600 text-white w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-bold">2</span>
                            <span>Confirm & Enter UTR</span>
                          </p>
                          <Button
                            className="w-full text-xs font-bold bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-1.5 h-10 shadow-sm"
                            onClick={() => {
                              setConfirmUtrOpen(true);
                            }}
                          >
                            Mark as Paid (Enter 12-Digit UTR)
                          </Button>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            Enter the UPI Ref number (UTR) to notify the host to verify your transfer.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center p-6 border border-dashed border-border rounded-xl bg-muted/20 text-xs text-muted-foreground font-medium">
                    💡 Please select your name in the dropdown above to view your share, scan the UPI QR, and confirm your payment.
                  </div>
                )}

                {/* General step-by-step payment checklist */}
                <div className="bg-[color:var(--surface)] p-3.5 rounded-lg border border-border space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    📋 Wing Pool Payment Steps:
                  </p>
                  <ol className="list-decimal pl-4 text-xs space-y-2 text-muted-foreground">
                    <li>Select your roommate identity from the dropdown list.</li>
                    <li>Pay the final split amount to the host UPI ID (via QR code or mobile link).</li>
                    <li>Find the 12-digit UPI transaction reference number (UTR) from your payment receipt.</li>
                    <li>Click <strong>"Mark as Paid"</strong>, paste the UTR, and submit. The host will verify your credit.</li>
                  </ol>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* List of items inside pool */}
        <div id="list-pool-items" className="space-y-4">
          <h3 className="text-xs font-bold text-muted-foreground tracking-widest uppercase border-b border-border pb-1.5">
            🛒 Roommate Carts
          </h3>
          {participants.length === 0 && (
            <p className="text-center py-6 text-xs text-muted-foreground">
              No items in this cart pool yet. Use the canvas below to add your items.
            </p>
          )}

          {Object.entries(grouped).map(([who, its]) => {
            const whoActiveItems = its.filter(it => it.is_purchased !== false);
            const whoTotal = whoActiveItems.reduce((s, it) => s + it.estimated_price, 0);

            return (
              <Card key={who} className="p-3 bg-[color:var(--surface)] border-border">
                <div className="flex justify-between items-center border-b border-border pb-1.5 mb-1.5">
                  <span className="font-bold text-sm text-foreground capitalize flex items-center gap-1">
                    👤 {who}
                  </span>
                  <span className="font-bold text-xs text-muted-foreground tnum">
                    Total: {rupees(whoTotal)}
                  </span>
                </div>

                <div className="divide-y divide-border/60">
                  {its.map((it) => {
                    const isOwnItem = name && it.added_by_name === name;
                    const canEditItem = (pool.status === "open") && (isHost || isOwnItem);

                    return (
                      <div key={it.id} className={`flex items-center justify-between py-2.5 transition-opacity ${it.is_purchased === false ? "opacity-40 line-through" : ""}`}>
                        <div className="flex-1 min-w-0 pr-2 flex flex-col items-start gap-0.5">
                          <p className="text-sm font-semibold text-foreground truncate">{it.item_description}</p>

                          {it.product_url && (
                            <a
                              href={formatExternalUrl(it.product_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1.5 mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all border shadow-sm ${
                                pool.platform === 'zepto'
                                  ? 'bg-[#5E17EB]/10 border-[#5E17EB]/20 text-[#5E17EB] hover:bg-[#5E17EB]/20'
                                  : pool.platform === 'blinkit'
                                  ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-400 font-bold'
                                  : pool.platform === 'swiggy_instamart'
                                  ? 'bg-[#FC8019]/10 border-[#FC8019]/20 text-[#FC8019] hover:bg-[#FC8019]/20'
                                  : 'bg-muted border-border text-muted-foreground hover:bg-muted-hover'
                              }`}
                              title={`Open on ${theme.name}`}
                            >
                              <ExternalLink className="h-2.5 w-2.5 text-current" />
                              <span>Get on {theme.name} ↗</span>
                            </a>
                          )}

                          <p className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5 mt-0.5">
                            {relativeTime(it.created_at)}
                            {it.is_purchased === false && (
                              <Badge className="bg-red-500/10 text-red-500 border-none text-[8px] py-0 px-1 hover:bg-red-500/10">Out of Stock</Badge>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-xs text-foreground tnum">{rupees(it.estimated_price)}</span>

                          {/* Item Actions (Host/Owner) */}
                          {canEditItem && (
                            <div className="flex items-center gap-1.5">
                              {isHost && (
                                <button
                                  onClick={() => toggleAvailability(it.id, it.is_purchased !== false)}
                                  className={`p-1 rounded hover:bg-muted border text-xs font-semibold ${
                                    it.is_purchased !== false
                                      ? "text-green-500 hover:text-green-600 border-green-500/10 bg-green-500/5"
                                      : "text-red-500 hover:text-red-600 border-red-500/10 bg-red-500/5"
                                  }`}
                                  title={it.is_purchased !== false ? "Mark Out of Stock" : "Mark Available"}
                                >
                                  {it.is_purchased !== false ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                </button>
                              )}
                              <button
                                onClick={() => deleteItem(it.id)}
                                className="p-1 rounded text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                title="Remove Item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Floating fast, registration-free item entry canvas form */}
      {pool.status === "open" && (
        <form
          id="form-add-item"
          onSubmit={(e) => {
            e.preventDefault();
            addItem();
          }}
          className="fixed inset-x-0 bottom-0 z-30 space-y-3.5 border-t border-border bg-[color:var(--surface-raised)] px-4 py-4 pb-12 shadow-2xl rounded-t-2xl animate-in slide-in-from-bottom"
        >
          <div className="flex justify-between items-center pb-1">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">⚡ Quick Add Item</h4>
            <span className="text-[10px] text-muted-foreground">Registration Free</span>
          </div>
          <div className="space-y-2.5">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="input-pool-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (e.g. Kanik)"
                className="bg-[color:var(--surface)] text-sm h-10 pl-9"
              />
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ShoppingBag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="input-pool-item"
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="Item (e.g. Milk 500ml)"
                  className="bg-[color:var(--surface)] text-sm h-10 pl-9"
                />
              </div>
              <div className="relative w-28">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">₹</span>
                <Input
                  id="input-pool-price"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Price"
                  className="bg-[color:var(--surface)] text-sm h-10 pl-6 text-right pr-3 font-semibold"
                />
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">🔗</span>
              <Input
                id="input-pool-link"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="Product URL (Optional, paste Zepto/Blinkit link)"
                className="bg-[color:var(--surface)] text-sm h-10 pl-9"
              />
            </div>
            <Button
              id="btn-add-pool-item"
              type="submit"
              disabled={busy}
              className={`w-full text-white font-bold h-10 hover:shadow-lg transition-shadow bg-[color:var(--pb-purple)] hover:bg-[color:var(--pb-purple)]/90`}
            >
              {busy ? "Adding..." : "Add to Cart Split"}
            </Button>
          </div>
        </form>
      )}

      {/* Host Checkout Modal */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent id="dialog-checkout" className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Complete Pool & Split Order</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Complete the checkout by entering final figures from the {theme.name} receipt.
          </p>

          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Actual Delivery Fee (₹)</label>
              <Input
                type="number"
                value={finalDeliveryFee}
                onChange={(e) => setFinalDeliveryFee(e.target.value)}
                placeholder="25"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Surge & Handling Charges (₹)</label>
              <Input
                type="number"
                value={finalSurgeFee}
                onChange={(e) => setFinalSurgeFee(e.target.value)}
                placeholder="5"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Discounts / Promo Code (₹)</label>
              <Input
                type="number"
                style={{ color: "var(--pb-green)" }}
                value={finalDiscount}
                onChange={(e) => setFinalDiscount(e.target.value)}
                placeholder="10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Your UPI Address (for splits)</label>
              <Input
                value={hostUpi}
                onChange={(e) => setHostUpi(e.target.value)}
                placeholder="yourname@upi"
              />
              <p className="text-[10px] text-muted-foreground">
                Roommates will pay this VPA. It automatically locks when order splits.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setCheckoutOpen(false)} disabled={busy}>
              Close
            </Button>
            <Button onClick={completeCheckout} disabled={busy} className="bg-green-600 hover:bg-green-700 text-white">
              {busy ? "Finalizing..." : "Calculate Split & Notify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Roommate UTR Confirmation Dialog */}
      <Dialog open={confirmUtrOpen} onOpenChange={setConfirmUtrOpen}>
        <DialogContent id="dialog-utr-confirm" className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Please scan the UPI QR code or pay using mobile app, then enter the 12-digit UPI reference number (UTR) from your receipt below.
          </p>

          <div className="space-y-3 py-2 text-sm">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">12-Digit UTR / Transaction Ref ID</label>
              <Input
                id="input-utr"
                maxLength={12}
                value={utrInput}
                onChange={(e) => setUtrInput(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 612456789012"
              />
              <p className="text-[10px] text-muted-foreground">
                Found in your payment app (GPay/PhonePe/Paytm) transaction details.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setConfirmUtrOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitUtrVerification} disabled={busy} className="bg-[color:var(--pb-purple)] text-white hover:bg-[color:var(--pb-purple)]/90">
              {busy ? "Submitting..." : "Submit Verification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
