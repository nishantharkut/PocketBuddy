import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, Share2, Trash2, Check, X, AlertCircle, Sparkles, ExternalLink, User, ShoppingBag, Clock, Shield, Link as LinkIcon, Bell } from "lucide-react";
import { toast } from "sonner";
import { rupees, relativeTime } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { signUpFn, signInWithPasswordFn } from "@/lib/api/auth.functions";
import {
  getCartPool,
  getCartPoolItems,
  insertCartPoolItem,
  deleteCartPoolItem,
  updateCartPool,
  updateCartPoolItem,
  getProfile,
  updateProfile,
  paymentConfirm,
  paymentVerify,
  nudgeRoommate,
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

function formatExternalUrl(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function listActiveParticipants(itemsList: any[]) {
  return Array.from(
    new Set(
      itemsList
        .filter((i) => i.is_purchased !== false)
        .map((i) => String(i.added_by_name ?? "").trim())
        .filter(Boolean),
    ),
  );
}



function isHostParticipant(pool: Pool | null | undefined, participantName: string, user: any) {
  if (!pool) return false;
  const pName = participantName.trim().toLowerCase();
  const hostName = (pool.created_by_name ?? "").trim().toLowerCase();

  if (pName === "host" || pName === "you" || pName === hostName) {
    return true;
  }

  if (user && user.fullName) {
    const userFull = user.fullName.trim().toLowerCase();
    if (pName === userFull && pool.host_id === user.id) {
      return true;
    }
  }

  return false;
}

function isPoolFullySettled(pool: Pool | null | undefined, itemsList: any[], user: any) {
  if (!pool || pool.status !== "completed") return false;

  const activeParticipants = listActiveParticipants(itemsList);
  if (activeParticipants.length === 0) return false;

  return activeParticipants.every((participantName) => {
    if (isHostParticipant(pool, participantName, user)) return true;
    const payment = (pool.payments ?? []).find((pay: any) => pay.name.trim().toLowerCase() === participantName.trim().toLowerCase());
    return payment?.status === "verified";
  });
}

function PoolDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();

  // Queries
  const { data: pool } = useQuery({
    queryKey: ["pool", id],
    refetchInterval: 3000, // Poll pool status for real-time updates
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
  const [addItemOpen, setAddItemOpen] = useState(false);

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
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReasonOption, setCancelReasonOption] = useState("Minimum cart value not met");
  const [cancelCustomReason, setCancelCustomReason] = useState("");

  // Track toasting status to avoid spamming on 3-second polls
  const [hasToastedStatus, setHasToastedStatus] = useState<string | null>(null);
  const [hasPrefilledName, setHasPrefilledName] = useState(false);
  const [settledPopupOpen, setSettledPopupOpen] = useState(false);
  const [hasShownSettled, setHasShownSettled] = useState(false);
  useEffect(() => {
    if (pool && hasToastedStatus !== pool.status) {
      setHasToastedStatus(pool.status);
      if (pool.status === "completed") {
        toast.success("Order splits finalized! Settlement is open.");
      } else if (pool.status === "cancelled") {
        toast.error("This pool has been cancelled.");
      }
    }
  }, [pool, hasToastedStatus]);

  // Quick auth state for unauthenticated roommates
  const { login: pbLogin } = useAuth();
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  async function handleQuickAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      toast.error("Please fill in all credentials");
      return;
    }
    if (authMode === "signup" && (!authName || !authPhone)) {
      toast.error("Please enter your name and phone number");
      return;
    }
    const cleanPhone = authPhone.replace(/\D/g, "");
    if (authMode === "signup" && cleanPhone.length < 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    setAuthBusy(true);
    try {
      if (authMode === "signup") {
        const res = await signUpFn({
          data: {
            email: authEmail,
            password: authPassword,
            fullName: authName,
          },
        });
        if (res && res.sessionToken && res.user) {
          pbLogin(res.sessionToken, res.user);
          await updateProfile({
            data: {
              onboarding_completed: true,
              setup_completed: true,
              phone: cleanPhone,
              wing_label: pool.wing_label // Auto-add to the host's wing for rating compatibility
            }
          });
          toast.success("Joined pool successfully!");
          qc.invalidateQueries({ queryKey: ["pool", id] });
        }
      } else {
        const res = await signInWithPasswordFn({
          data: {
            email: authEmail,
            password: authPassword,
          },
        });
        if (res && res.sessionToken && res.user) {
          pbLogin(res.sessionToken, res.user);
          toast.success("Logged in successfully!");
          qc.invalidateQueries({ queryKey: ["pool", id] });
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setAuthBusy(false);
    }
  }

  // Pre-fill checkout inputs when modal opens
  useEffect(() => {
    if (pool) {
      setFinalDeliveryFee(String(Math.round(pool.delivery_fee / 100)));
      setFinalSurgeFee("0");
      setFinalDiscount("0");
      setHostUpi(pool.upi_id ?? profile?.upi_id ?? "");
    }
  }, [pool, profile]);

  // Pre-fill roommate name input automatically
  useEffect(() => {
    if (pool && user && !hasPrefilledName) {
      const isHostUser = pool.host_id === user.id;
      const cachedName = localStorage.getItem("pocketbuddy_pool_name");
      const initialName = isHostUser
        ? (cachedName || pool.created_by_name || "")
        : (cachedName || user.fullName || "");

      setName(initialName);
      setHasPrefilledName(true);

      // Self-heal: If host has a different name than pool.created_by_name, sync it to database
      if (isHostUser && initialName && pool.created_by_name !== initialName) {
        updateCartPool({
          id,
          data: { created_by_name: initialName }
        }).then(() => {
          qc.invalidateQueries({ queryKey: ["pool", id] });
        }).catch(() => {});
      }
    }
  }, [pool, user, hasPrefilledName, id, qc]);

  const allItems = (items ?? []) as any[];
  const isFullySettled = isPoolFullySettled(pool, allItems, user);

  useEffect(() => {
    if (isFullySettled && !hasShownSettled) {
      setSettledPopupOpen(true);
      setHasShownSettled(true);
    }
  }, [isFullySettled, hasShownSettled]);

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
    name: pool.platform_display_label || pool.platform?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Custom",
    gradient: "from-primary to-accent",
    accent: "text-primary"
  };

  // Group items by roommate
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

      const payment = (pool.payments ?? []).find((pay: any) => pay.name.trim().toLowerCase() === p.trim().toLowerCase());
      const isHostUser = isHostParticipant(pool, p, user);

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

      const isHostUser = isHostParticipant(pool, p, user);

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
      if (isHost && name.trim() !== pool.created_by_name) {
        await updateCartPool({
          id,
          data: { created_by_name: name.trim() }
        });
        qc.invalidateQueries({ queryKey: ["pool", id] });
      }

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
      setAddItemOpen(false);
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

  async function fallbackCopyText(text: string): Promise<boolean> {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(textArea);
    return ok;
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

    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch (err) {}
    }
    if (!copied) {
      copied = await fallbackCopyText(url);
    }

    if (copied) {
      toast.success("Link copied to clipboard!");
    } else {
      toast.error("Failed to copy link. Please copy manually.");
    }
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
          checkout_notes: checkoutNotes.trim() || null,
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

  async function cancelPool(reason: string) {
    setBusy(true);
    try {
      await updateCartPool({
        id,
        data: { 
          status: "cancelled",
          cancellation_reason: reason
        }
      });
      toast.success("Pool cancelled successfully.");
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ["pool", id] });
    } catch (err: any) {
      toast.error("Failed to cancel pool");
    } finally {
      setBusy(false);
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

  // Host verify, reject, or settle-in-kind roommate payment
  async function handleVerifyPayment(roommateName: string, action: "verify" | "reject" | "settle_in_kind") {
    try {
      await paymentVerify({
        pool_id: id,
        data: {
          roommate_name: roommateName,
          action
        }
      });
      toast.success(action === "verify" ? `Verified payment for ${roommateName}` : action === "settle_in_kind" ? `Settled in kind for ${roommateName}` : `Rejected payment for ${roommateName}`);
      qc.invalidateQueries({ queryKey: ["pool", id] });
    } catch (err: any) {
      toast.error(err.message || "Verification action failed");
    }
  }

  // Nudge / remind roommates about unpaid splits
  async function handleNudgeRoommate(roommateName: string, owedAmount: number) {
    const formattedAmount = (owedAmount / 100).toFixed(2);
    const poolUrl = window.location.href;
    const platform = theme.name; // e.g. Swiggy Instamart, Zepto
    const message = `Hey ${roommateName}, please settle your ${platform} split of ₹${formattedAmount} for our cart pool. You can pay the host and verify here: ${poolUrl}`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

    try {
      const toastId = toast.loading(`Sending nudge to ${roommateName}...`);
      const res = await nudgeRoommate({
        pool_id: id,
        data: { roommate_name: roommateName }
      });
      toast.dismiss(toastId);
      if (res && res.success && res.mode === "automated") {
        toast.success(`Automated WhatsApp nudge sent to ${roommateName}!`);
        return;
      }
    } catch (err: any) {
      toast.dismiss();
    }

    if (navigator.share) {
      navigator.share({
        title: `PocketBuddy ${platform} Pool Split`,
        text: message,
        url: poolUrl
      }).catch(() => {
        window.open(waUrl, "_blank");
      });
    } else {
      window.open(waUrl, "_blank");
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

  if (!user) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] p-4">
          <Card className="w-full max-w-md bg-surface border border-border overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-primary to-accent opacity-80" />
            <div className="p-6 md:p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 border border-primary/20 text-primary mb-2">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-foreground">
                  {authMode === "signup" ? "Join Cart Pool" : "Welcome Back"}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {authMode === "signup"
                    ? `Register in 5 seconds to join ${pool.created_by_name}'s ${theme.name} cart pool safely.`
                    : "Log in with your email to participate in this cart pool."}
                </p>
              </div>

              <form onSubmit={handleQuickAuth} className="space-y-4">
                {authMode === "signup" && (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="auth-name" className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-0.5">Full name</label>
                      <Input
                        id="auth-name"
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        placeholder="e.g. Deb Mukherjee"
                        className="bg-background text-sm h-10"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="auth-phone" className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-0.5">WhatsApp Phone Number</label>
                      <Input
                        id="auth-phone"
                        value={authPhone}
                        onChange={(e) => setAuthPhone(e.target.value)}
                        placeholder="e.g. 9876543210"
                        className="bg-background text-sm h-10"
                        required
                      />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <label htmlFor="auth-email" className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-0.5">Email address</label>
                  <Input
                    id="auth-email"
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="e.g. deb@iiitm.ac.in"
                    className="bg-background text-sm h-10"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="auth-password" className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-0.5">Password</label>
                  <Input
                    id="auth-password"
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-background text-sm h-10"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={authBusy}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 font-bold uppercase tracking-wider text-xs"
                >
                  {authBusy ? "Authenticating..." : authMode === "signup" ? "Create Account & Join" : "Log In & Join"}
                </Button>
              </form>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")}
                  className="text-xs font-semibold text-primary hover:underline bg-transparent border-0"
                >
                  {authMode === "signup"
                    ? "Already have an account? Log in"
                    : "Don't have an account? Sign up"}
                </button>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Dynamic Header Banner */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => {
            if (isHost) {
              nav({ to: "/pool" });
            } else if (user) {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                nav({ to: "/dashboard" });
              }
            } else {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                nav({ to: "/login" });
              }
            }
          }} className="text-muted-foreground cursor-pointer">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-base sm:text-lg font-black tracking-wider flex items-center gap-2 uppercase truncate text-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            Pooler
          </span>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider bg-muted/50 border-border max-w-[120px] sm:max-w-none truncate whitespace-nowrap">
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
      </div>      {/* Platform Theme Hero Segment */}
      <div className={`w-full bg-card border border-border border-t-4 ${
        ({
          zepto: "border-t-[#5E17EB]",
          blinkit: "border-t-[#F7EC13]",
          swiggy_instamart: "border-t-[#FC8019]",
          bigbasket: "border-t-[#84C225]",
          jiomart: "border-t-[#0078AD]",
        } as Record<string, string>)[pool.platform] || "border-t-primary"
      } px-6 py-8 text-foreground flex flex-col justify-between relative overflow-hidden rounded-2xl shadow-lg shadow-black/30`}>
        <div className="absolute right-0 top-0 opacity-5 transform translate-x-4 -translate-y-4 pointer-events-none">
          <Sparkles className="h-32 w-32 text-foreground" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Cart Pooling</p>
          <div className="flex items-center gap-3 mt-2">
            <PlatformIcon platform={pool.platform} name={theme.name} className="h-9 w-9 text-base" />
            <h2 className="text-2xl font-black uppercase tracking-tight text-foreground">
              {theme.name} Pool
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1 font-medium">
            Created by <span className="text-foreground capitalize font-bold">{pool.created_by_name}</span> • {pool.wing_label?.toLowerCase().startsWith("wing") ? pool.wing_label : `Wing ${pool.wing_label}`}
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 justify-between items-end border-t border-border pt-5">
          <div>
            <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Target Cart Total</p>
            <p className="text-xl font-black text-foreground tnum mt-0.5">{rupees(cartTotal)} <span className="text-zinc-500 text-xs font-semibold">/ {rupees(pool.min_cart_value)} min</span></p>
          </div>
          <div>
            {pool.status === "completed" ? (
              <Badge className="bg-green-600/10 border border-green-600/30 text-green-500 font-bold text-xs px-3 py-1">FINALIZED</Badge>
            ) : pool.status === "cancelled" ? (
              <Badge className="bg-red-600/10 border border-red-600/30 text-red-500 font-bold text-xs px-3 py-1">CANCELLED</Badge>
            ) : expired ? (
              <Badge className="bg-zinc-800 border border-border text-muted-foreground font-bold text-xs px-3 py-1">CLOSED</Badge>
            ) : (
              <span id="timer-pool" className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/5 border border-border rounded-full px-3.5 py-1.5 tnum uppercase tracking-wider text-foreground">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{minsLeft}m left</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 pb-96">
        {/* Status Callouts */}
        {pool.status === "completed" && isFullySettled && (
          <div className="flex flex-col gap-3 p-4 bg-gradient-to-r from-green-500/15 to-emerald-500/5 border border-green-500/30 text-green-400 rounded-xl text-xs shadow-lg shadow-green-950/20">
            <div className="flex gap-2.5 items-start">
              <Sparkles className="h-5 w-5 shrink-0 mt-0.5 text-green-500" />
              <div>
                <p className="font-black uppercase tracking-wider text-green-400 text-sm">Pool Fully Settled</p>
                <p className="text-zinc-300 leading-relaxed mt-1">
                  Congratulations! All roommate splits for this {theme.name} pool have been paid and verified. No outstanding balances remain.
                </p>
              </div>
            </div>
            {pool.checkout_notes && (
              <div className="bg-green-600/5 border border-green-500/10 rounded-lg p-3 text-xs">
                <span className="font-bold text-green-500 uppercase tracking-widest text-[9px] block mb-1">Host Note / Message</span>
                <p className="text-zinc-300 leading-relaxed font-semibold">
                  "{pool.checkout_notes}"
                </p>
              </div>
            )}
          </div>
        )}

        {pool.status === "completed" && !isFullySettled && (
          <div className="flex flex-col gap-3 p-4 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-xs">
            <div className="flex gap-2.5 items-start">
              <Check className="h-4.5 w-4.5 shrink-0 mt-0.5 text-green-500" />
              <div>
                <p className="font-bold uppercase tracking-wider text-green-500">Order Splits Finalized</p>
                <p className="text-zinc-300 leading-relaxed mt-1">
                  The host has checked out this cart pool. Roommates should check their splits below, pay the host via the VPA deep link or QR code, and submit the 12-digit UTR to confirm verification.
                </p>
              </div>
            </div>
            {pool.checkout_notes && (
              <div className="bg-green-600/5 border border-green-500/10 rounded-lg p-3 text-xs">
                <span className="font-bold text-green-500 uppercase tracking-widest text-[9px] block mb-1">Host Note / Message</span>
                <p className="text-zinc-300 leading-relaxed font-semibold">
                  "{pool.checkout_notes}"
                </p>
              </div>
            )}
          </div>
        )}

        {pool.status === "cancelled" && (
          <div className="flex flex-col gap-3 p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-xs">
            <div className="flex gap-2.5 items-start">
              <X className="h-4.5 w-4.5 shrink-0 mt-0.5 text-destructive" />
              <div>
                <p className="font-bold uppercase tracking-wider text-destructive">Cart Pool Cancelled</p>
                <p className="text-zinc-300 leading-relaxed mt-1">
                  This pool has been cancelled by the host. No further actions can be taken.
                </p>
              </div>
            </div>
            {pool.cancellation_reason && (
              <div className="bg-destructive/5 border border-destructive/10 rounded-lg p-3 text-xs">
                <span className="font-bold text-destructive uppercase tracking-widest text-[9px] block mb-1">Reason for Cancellation</span>
                <p className="text-zinc-300 leading-relaxed font-semibold">
                  "{pool.cancellation_reason}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* Progress bar to target minimum */}
        {pool.status === "open" && (
          <Card className="p-5 bg-surface border border-border">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-2 text-zinc-500">
              <span>Cart Threshold Progress</span>
              <span className="text-foreground">{cartPct}% Complete</span>
            </div>
            <Progress id="progress-pool-cart" value={cartPct} className="h-1 bg-surface-raised" />
            <p className="mt-3 text-xs text-muted-foreground font-semibold leading-relaxed">
              {cartTotal >= pool.min_cart_value
                ? "Target cart minimum reached! Small-cart fees are fully stripped."
                : `Need ${rupees(pool.min_cart_value - cartTotal)} more in items to bypass small-cart fees.`}
            </p>
          </Card>
        )}

        {/* Host controls dashboard panel */}
        {isHost && (
          <Card className="p-5 border border-border bg-surface-raised/40 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-xs font-bold text-zinc-400 tracking-[0.2em] uppercase flex items-center gap-1.5 min-w-0">
                <Shield className="h-3.5 w-3.5" />
                <span>Host Control Deck</span>
              </h3>
              <Badge variant="outline" className="text-xs border-primary/35 text-primary font-bold uppercase tracking-wider px-2 py-0.5 whitespace-nowrap shrink-0">
                Host Mode
              </Badge>
            </div>

            {pool.status === "open" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    id="btn-host-checkout"
                    onClick={() => {
                      if (purchasedItems.length === 0) {
                        toast.error("Cannot checkout a pool with no items!");
                        return;
                      }
                      setCheckoutOpen(true);
                    }}
                    className="bg-primary text-primary-foreground font-semibold h-10 uppercase text-xs tracking-wider"
                  >
                    Complete & Split
                  </Button>
                  <Button
                    id="btn-host-cancel"
                    variant="outline"
                    onClick={() => setCancelOpen(true)}
                    className="border-destructive/30 text-destructive hover:bg-destructive/5 h-10 uppercase text-xs tracking-wider font-semibold"
                  >
                    Cancel Pool
                  </Button>
                </div>

                {itemsWithLinks.length > 0 && (
                  <div className="bg-surface p-4 rounded-xl border border-border space-y-3">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 pl-0.5">
                      <LinkIcon className="h-3 w-3 text-zinc-600" />
                      <span>Roommate Item Links</span>
                      <span className="bg-white/5 border border-border px-2 py-0.5 rounded-full text-xs font-bold text-foreground">{itemsWithLinks.length}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {itemsWithLinks.map((it: any) => (
                        <a
                          key={it.id}
                          href={formatExternalUrl(it.product_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface-raised hover:bg-surface-interactive text-xs font-bold transition-all text-foreground hover:border-white/15"
                        >
                          <span className="max-w-[150px] truncate capitalize">{it.added_by_name}: {it.item_description}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-80" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : pool.status === "completed" ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground font-semibold">
                  Order split active. Verify incoming transactions in the queue below:
                </p>

                {/* Host Payment Verification Checklist */}
                <div className="space-y-2.5 max-h-60 overflow-auto pr-1">
                  {(() => {
                    const breakdown = pool.split_breakdown ?? {};
                    const roommates = Object.keys(breakdown).filter((rName) => {
                      const isHost = rName.toLowerCase() === "you" || rName.toLowerCase() === (pool.created_by_name ?? "").toLowerCase();
                      return !isHost;
                    });

                    if (roommates.length === 0) {
                      return <p className="text-xs text-muted-foreground italic py-1 pl-1">No roommates in this pool yet.</p>;
                    }

                    return roommates.map((rName) => {
                      const details = breakdown[rName];
                      const rel = (pool.reliability_scores ?? {})[rName] ?? { score: 90, label: "New roommate", color: "blue" };
                      
                      let badgeColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                      if (rel.color === "green") badgeColor = "bg-green-500/10 text-green-500 border-green-500/20";
                      else if (rel.color === "yellow") badgeColor = "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
                      else if (rel.color === "red") badgeColor = "bg-red-500/10 text-red-500 border-red-500/20";

                      return (
                        <div key={rName} className="flex flex-col gap-2.5 bg-surface p-3.5 rounded-xl border border-border text-xs">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <p className="font-bold capitalize text-foreground flex flex-wrap items-center gap-1.5">
                                {rName}
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${badgeColor} font-bold`}>
                                  {rel.label} ({rel.score}%)
                                </span>
                              </p>
                              {details.email && (
                                <p className="text-[10px] text-zinc-500 font-semibold lowercase">
                                  {details.email}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground font-semibold">
                                Share: {rupees(details.total)}
                              </p>
                              {details.utr && (
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  UTR: {details.utr}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {details.paid ? (
                                <div className="flex flex-col items-end gap-1">
                                  <Badge className="bg-green-600/10 border border-green-600/20 text-green-500 font-bold py-1 px-2.5">
                                    VERIFIED
                                  </Badge>
                                  {details.settlement_mode === "settle_in_kind" && (
                                    <span className="text-[10px] text-amber-500 font-bold bg-amber-500/10 border border-amber-500/20 px-1.5 rounded">
                                      Settled In Kind
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      size="sm"
                                      onClick={() => handleVerifyPayment(rName, "verify")}
                                      className="h-8 bg-green-600 text-white hover:bg-green-700 py-1 px-2 text-[10px] uppercase font-bold tracking-wider"
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleVerifyPayment(rName, "settle_in_kind")}
                                      className="h-8 border-amber-500/20 text-amber-500 hover:bg-amber-500/5 py-1 px-2 text-[10px] uppercase font-bold tracking-wider"
                                    >
                                      In Kind
                                    </Button>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleNudgeRoommate(rName, details.total)}
                                    className="h-8 border-primary/20 text-primary hover:bg-primary/5 py-1 px-2 text-[10px] uppercase font-bold tracking-wider flex items-center justify-center gap-1.5 w-full"
                                  >
                                    <Bell className="h-3.5 w-3.5 shrink-0" />
                                    <span>Nudge Roommate</span>
                                  </Button>
                                  {details.payment_status === "pending" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleVerifyPayment(rName, "reject")}
                                      className="h-7 border-destructive/20 text-destructive hover:bg-destructive/5 py-1 px-2 text-[10px] uppercase font-bold tracking-wider w-full"
                                    >
                                      Reject
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                  <div className="text-xs font-bold bg-white/5 border border-border px-3 py-1.5 rounded-full text-foreground uppercase tracking-wider">
                    Overhead: <strong>{rupees(pool.final_overhead)}</strong>
                  </div>
                  {pool.final_discount > 0 && (
                    <div className="text-xs font-bold bg-success/5 border border-success/20 text-success px-3 py-1.5 rounded-full uppercase tracking-wider">
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
          <Card id="card-split-summary" className="p-5 bg-surface border border-border space-y-4">
            <h3 className="text-xs font-bold text-zinc-500 tracking-[0.25em] uppercase border-b border-border pb-2">
              {pool.status === "completed" ? "Final Split Ledger" : "Estimated Splits"}
            </h3>
            <div className="space-y-3 mt-3">
              {Object.entries(splitBreakdown).map(([pName, details]) => (
                <div key={pName} className="flex justify-between items-start text-xs py-2 border-b border-border/10 last:border-0">
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {pool.status === "completed" ? (
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          details.paymentStatus === "verified" || details.paymentStatus === "host"
                            ? "bg-green-500"
                            : details.paymentStatus === "pending"
                              ? "bg-amber-500 animate-pulse"
                              : "bg-destructive"
                        }`} />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 shrink-0" />
                      )}
                      <span className="font-bold capitalize text-foreground truncate">{pName}</span>
                      {pName === name && (
                        <Badge variant="outline" className="text-xs py-0 px-1.5 border-border bg-white/5 font-black text-muted-foreground uppercase shrink-0">You</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-semibold pl-4">
                      Items: {rupees(details.itemsTotal)} + Share: {rupees(details.share)}
                    </span>
                  </div>
                  <div className="text-right flex flex-col items-end shrink-0 pl-2">
                    <span className="font-black text-foreground tnum">{rupees(details.total)}</span>
                    {pool.status === "completed" && (
                      <span className="text-xs font-black uppercase tracking-wider mt-0.5">
                        {details.paymentStatus === "verified" ? (
                          <span className="text-green-500 font-bold">Paid</span>
                        ) : details.paymentStatus === "pending" ? (
                          <span className="text-amber-500 font-bold animate-pulse">Pending</span>
                        ) : details.paymentStatus === "host" ? (
                          <span className="text-green-500 font-bold">HOST (OWN SHARE)</span>
                        ) : (
                          <span className="text-destructive font-bold">Unpaid</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-border flex flex-wrap justify-between gap-2 text-xs text-zinc-500 font-bold uppercase tracking-wider">
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
        {pool.status === "completed" && !isHost && (
          <Card className="p-5 border border-border bg-surface-raised/40 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-xs font-bold text-zinc-400 tracking-[0.2em] uppercase flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" /> UPI Split Settlement
              </h3>
              <Badge className="bg-white/5 border border-border text-foreground text-xs font-bold uppercase tracking-wider px-2 py-0.5">VPA Direct</Badge>
            </div>

            {!pool.upi_id ? (
              <div className="flex gap-2.5 items-start text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-xl p-4">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="font-semibold leading-relaxed">
                  No host UPI address found. Contact <strong>{pool.created_by_name}</strong> to pay manually.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-0.5">Select roommate to pay:</label>
                  <select
                    className="w-full bg-surface text-foreground border border-border rounded-md py-2 px-3 text-xs font-bold uppercase tracking-wider focus:outline-none focus:border-primary/40"
                    value={selectedPayeeName || name}
                    onChange={(e) => setSelectedPayeeName(e.target.value)}
                  >
                    <option value="" disabled>-- Choose Roommate --</option>
                    {participants.filter(p => splitBreakdown[p]).map(p => (
                      <option key={p} value={p}>
                        {p} ({rupees(splitBreakdown[p].total)}) - {
                          splitBreakdown[p].paymentStatus === "verified"
                            ? "Verified"
                            : splitBreakdown[p].paymentStatus === "pending"
                              ? "Pending Verify"
                              : splitBreakdown[p].paymentStatus === "host"
                                ? "Host Mode"
                                : "Unpaid"
                        }
                      </option>
                    ))}
                  </select>
                </div>

                {payeeDetails ? (
                  <div className="bg-surface rounded-xl p-5 border border-border flex flex-col items-center justify-center text-center space-y-4">
                    <div className="text-center space-y-1">
                      <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Final Pay Share</p>
                      <h4 className="text-2xl font-black text-foreground tnum">{rupees(payeeDetails.total)}</h4>
                      <p className="text-xs text-muted-foreground">UPI ID: <code className="bg-white/5 px-2 py-0.5 rounded border border-border font-mono select-all text-foreground text-xs">{pool.upi_id}</code></p>
                    </div>

                    {payeeDetails.paymentStatus === "verified" ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-500 bg-green-600/10 border border-green-600/20 px-4 py-2 rounded-full font-bold">
                        <Check className="h-4 w-4" /> Paid & Confirmed
                      </div>
                    ) : payeeDetails.paymentStatus === "pending" ? (
                      <div className="text-center space-y-1.5">
                        <div className="inline-flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-full font-bold">
                          Pending Verification
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">UTR: {payeeDetails.utr}</p>
                      </div>
                    ) : payeeDetails.paymentStatus === "host" ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-500 bg-green-600/10 border border-green-600/20 px-4 py-2 rounded-full font-bold">
                        <Check className="h-4 w-4" /> Host User (Automatically Verified)
                      </div>
                    ) : (
                      <div className="w-full space-y-4 text-center">
                        {/* QR Code Container for desktop */}
                        <div className="hidden sm:flex flex-col items-center gap-2 p-4 bg-white rounded-xl border border-border max-w-[200px] mx-auto shadow-md">
                          <img src={qrCodeUrl} alt="UPI Pay QR" className="h-32 w-32" />
                          <span className="text-xs text-gray-500 font-black uppercase tracking-wider">Scan with UPI App</span>
                        </div>

                        {/* Step 1: Make Payment */}
                        <div className="w-full space-y-2 text-left bg-surface-raised/40 p-4 rounded-xl border border-border">
                          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="bg-primary text-primary-foreground w-4 h-4 rounded-full inline-flex items-center justify-center text-xs font-bold">1</span>
                            <span>Pay Host</span>
                          </p>
                          {/* Click to Pay Button (All Screens) */}
                          <a
                            href={upiPayUrl}
                            className="block w-full"
                            onClick={() => {
                              toast.info("Opening UPI mobile app...");
                            }}
                          >
                            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/95 flex items-center justify-center gap-1.5 h-10 font-black uppercase text-xs tracking-wider">
                              Pay via UPI App <ExternalLink className="h-4 w-4" />
                            </Button>
                          </a>
                          <p className="text-xs text-muted-foreground mt-1.5 leading-normal">
                            Transfer exactly <strong className="text-foreground">{rupees(payeeDetails.total)}</strong> to the host.
                          </p>
                        </div>

                        {/* Step 2: Confirm Payment */}
                        <div className="w-full space-y-2 text-left bg-surface-raised/40 p-4 rounded-xl border border-border">
                          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="bg-success text-white w-4 h-4 rounded-full inline-flex items-center justify-center text-xs font-bold">2</span>
                            <span>Verify UTR</span>
                          </p>
                          <Button
                            className="w-full text-xs font-black uppercase tracking-wider bg-success text-white hover:bg-success/90 flex items-center justify-center gap-1.5 h-10 shadow-sm"
                            onClick={() => {
                              setConfirmUtrOpen(true);
                            }}
                          >
                            Enter 12-Digit UTR
                          </Button>
                          <p className="text-xs text-muted-foreground mt-1.5 leading-normal">
                            Enter the UPI Ref / UTR number from your receipt to notify the host to verify your transfer.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center p-6 border border-dashed border-border rounded-xl bg-surface-raised/40 text-xs text-muted-foreground font-semibold">
                    Select your name in the dropdown list above to fetch splits, scan QR, and confirm transfer.
                  </div>
                )}

                {/* General payment checklist */}
                <div className="bg-surface p-4 rounded-xl border border-border space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                    Settlement Checklist:
                  </p>
                  <ol className="list-decimal pl-4 text-xs space-y-2 text-zinc-400 leading-relaxed">
                    <li>Select your roommate name from the dropdown menu.</li>
                    <li>Pay the split total to the host's QR code or VPA.</li>
                    <li>Fetch the 12-digit UTR reference ID from your transaction receipt.</li>
                    <li>Enter and submit the UTR to complete the verification checklist.</li>
                  </ol>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* List of items inside pool */}
        <div id="list-pool-items" className="space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
            <h3 className="text-xs font-bold text-zinc-500 tracking-[0.25em] uppercase flex items-center gap-1.5 min-w-0">
              <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Roommate Carts</span>
            </h3>
            {pool.status === "open" && (
              <Button
                id="btn-open-add-pool-item"
                type="button"
                size="sm"
                onClick={() => setAddItemOpen(true)}
                className="hidden md:inline-flex h-9 shrink-0 items-center gap-2 bg-primary px-4 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-95"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                Add Item
              </Button>
            )}
          </div>
          {participants.length === 0 && (
            <p className="text-center py-8 text-xs text-zinc-500 font-semibold uppercase tracking-wider">
              No items in this cart pool yet.
            </p>
          )}

          {Object.entries(grouped).map(([who, its]) => {
            const whoActiveItems = its.filter(it => it.is_purchased !== false);
            const whoTotal = whoActiveItems.reduce((s, it) => s + it.estimated_price, 0);

            return (
              <Card key={who} className="p-4 bg-surface border border-border space-y-3">
                <div className="flex justify-between items-center border-b border-border/80 pb-2">
                  <span className="font-bold text-xs text-foreground capitalize flex flex-col items-start min-w-0">
                    <span className="flex items-center gap-1.5 font-bold">
                      <User className="h-3.5 w-3.5 text-zinc-500" />
                      <span>{who}</span>
                    </span>
                    {splitBreakdown[who]?.email && (
                      <span className="text-[10px] text-zinc-500 font-semibold lowercase mt-0.5 block truncate max-w-[200px]">
                        {splitBreakdown[who].email}
                      </span>
                    )}
                  </span>
                  <span className="font-black text-xs text-foreground tnum">
                    {rupees(whoTotal)}
                  </span>
                </div>

                <div className="divide-y divide-border/50">
                  {its.map((it) => {
                    const isOwnItem = name && it.added_by_name === name;
                    const canEditItem = (pool.status === "open") && (isHost || isOwnItem);

                    return (
                      <div key={it.id} className={`flex items-center justify-between py-3 transition-opacity ${it.is_purchased === false ? "opacity-30 line-through" : ""}`}>
                        <div className="flex-1 min-w-0 pr-3 flex flex-col items-start gap-1">
                          <p className="text-xs font-bold text-foreground truncate">{it.item_description}</p>

                          {it.product_url && (
                            <a
                              href={formatExternalUrl(it.product_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-0.5 px-2 py-0.5 rounded text-xs font-black uppercase tracking-wider transition-all border border-border bg-white/5 text-muted-foreground hover:text-foreground"
                              title={`Open on ${theme.name}`}
                            >
                              <ExternalLink className="h-2.5 w-2.5 text-current" />
                              <span>View Item ↗</span>
                            </a>
                          )}

                          <p className="text-xs text-zinc-500 font-semibold flex items-center gap-1.5 mt-0.5 uppercase tracking-wider">
                            {relativeTime(it.created_at)}
                            {it.is_purchased === false && (
                              <Badge className="bg-destructive/10 text-destructive border-none text-[11px] py-0.5 px-2 hover:bg-destructive/10">Out of Stock</Badge>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-black text-xs text-foreground tnum">{rupees(it.estimated_price)}</span>

                          {/* Item Actions */}
                          {canEditItem && (
                            <div className="flex items-center gap-1.5">
                              {isHost && (
                                <button
                                  onClick={() => toggleAvailability(it.id, it.is_purchased !== false)}
                                  className={`p-1 rounded border text-xs font-semibold cursor-pointer ${
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
                                className="p-1 rounded text-destructive hover:text-destructive/80 hover:bg-destructive/5 cursor-pointer"
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
          className="fixed inset-x-0 bottom-16 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 space-y-3 border-t border-border bg-card/90 backdrop-blur-md px-4 py-3.5 pb-3.5 shadow-2xl rounded-t-2xl animate-in slide-in-from-bottom max-h-[calc(100vh-6rem)] overflow-y-auto no-scrollbar md:hidden"
        >
          <div className="flex justify-between items-center pb-0.5">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Quick Add Item</h4>
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Registration Free</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-muted/30 border border-border px-3 py-2 rounded-xl text-xs text-zinc-400">
              <User className="h-4 w-4 text-primary shrink-0" />
              <span>Adding as: <strong className="text-foreground">{user?.fullName}</strong> ({user?.email})</span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <ShoppingBag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  id="input-pool-item"
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="Item description (e.g. Bread)"
                  className="bg-background text-xs h-10 pl-9"
                />
              </div>
              <div className="relative w-28">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500">₹</span>
                <Input
                  id="input-pool-price"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Price"
                  className="bg-background text-xs h-10 pl-6 text-right pr-3 font-bold text-foreground"
                />
              </div>
            </div>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                id="input-pool-link"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="Product Link (Optional)"
                className="bg-background text-xs h-10 pl-9"
              />
            </div>
            <Button
              id="btn-add-pool-item"
              type="submit"
              disabled={busy}
              className="w-full text-xs font-black uppercase tracking-wider h-10 bg-primary text-primary-foreground hover:opacity-95"
            >
              {busy ? "Adding..." : "Add to Cart Split"}
            </Button>
          </div>
        </form>
      )}

      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent id="dialog-add-pool-item" className="max-w-[440px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addItem();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Add Item to Cart Pool</DialogTitle>
            </DialogHeader>
            <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
              Add your item estimate now. The host can finalize the actual split after checkout.
            </p>

            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">
                  Adding as
                </label>
                <div className="flex items-center gap-2.5 bg-muted/30 border border-border px-3 py-2.5 rounded-xl text-sm text-zinc-400">
                  <User className="h-4.5 w-4.5 text-primary shrink-0" />
                  <span><strong className="text-foreground">{user?.fullName}</strong> ({user?.email})</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="input-pool-item-dialog" className="text-xs font-semibold text-muted-foreground">
                  Item
                </label>
                <div className="relative">
                  <ShoppingBag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="input-pool-item-dialog"
                    value={item}
                    onChange={(e) => setItem(e.target.value)}
                    placeholder="e.g. Bread, chips, notebook"
                    className="h-10 bg-background pl-9 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                <div className="space-y-1.5">
                  <label htmlFor="input-pool-price-dialog" className="text-xs font-semibold text-muted-foreground">
                    Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500">₹</span>
                    <Input
                      id="input-pool-price-dialog"
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="80"
                      className="h-10 bg-background pl-6 pr-3 text-right text-sm font-bold text-foreground"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="input-pool-link-dialog" className="text-xs font-semibold text-muted-foreground">
                    Product link, optional
                  </label>
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                      id="input-pool-link-dialog"
                      value={productUrl}
                      onChange={(e) => setProductUrl(e.target.value)}
                      placeholder="Paste item URL"
                      className="h-10 bg-background pl-9 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setAddItemOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                id="btn-add-pool-item-dialog"
                type="submit"
                disabled={busy}
                className="bg-primary text-primary-foreground hover:opacity-95"
              >
                {busy ? "Adding..." : "Add to Cart Split"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
                style={{ color: "var(--success)" }}
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
              <p className="text-xs text-muted-foreground">
                Roommates will pay this VPA. It automatically locks when order splits.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Checkout Notes / Instructions (Optional)</label>
              <textarea
                value={checkoutNotes}
                onChange={(e) => setCheckoutNotes(e.target.value)}
                placeholder="e.g. Ordered Zepto, expected in 15 mins. Pay ASAP!"
                className="w-full min-h-[60px] bg-background border border-border rounded-md py-1.5 px-3 text-xs outline-none focus:border-primary/40 resize-none text-foreground"
              />
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
              <p className="text-xs text-muted-foreground">
                Found in your payment app (GPay/PhonePe/Paytm) transaction details.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setConfirmUtrOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submitUtrVerification} disabled={busy} className="bg-primary text-white hover:bg-primary/90">
              {busy ? "Submitting..." : "Submit Verification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Host Cancel Pool Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent id="dialog-cancel-pool" className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Cancel Cart Pool</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Please state why you are cancelling this pool. This reason will be shown to all roommates.
          </p>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Select Reason</label>
              <div className="flex flex-col gap-2">
                {[
                  "Minimum cart value not met",
                  "Store is out of stock of key items",
                  "Changed mind / ordered separately",
                  "Other Reason (Type below)"
                ].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setCancelReasonOption(r);
                    }}
                    className={`text-left py-2.5 px-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      cancelReasonOption === r
                        ? "bg-destructive/10 border-destructive text-destructive"
                        : "bg-surface border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {cancelReasonOption === "Other Reason (Type below)" && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Custom Reason</label>
                <textarea
                  value={cancelCustomReason}
                  onChange={(e) => setCancelCustomReason(e.target.value)}
                  placeholder="Type cancellation details..."
                  className="w-full min-h-[60px] bg-background border border-border rounded-md py-2 px-3 text-xs outline-none focus:border-destructive/40 resize-none text-foreground"
                />
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>
              Close
            </Button>
            <Button
              onClick={() => {
                const finalReason = cancelReasonOption === "Other Reason (Type below)"
                  ? cancelCustomReason.trim()
                  : cancelReasonOption;
                cancelPool(finalReason || "Host cancelled pool");
              }}
              disabled={busy || (cancelReasonOption === "Other Reason (Type below)" && !cancelCustomReason.trim())}
              className="bg-destructive text-white hover:bg-destructive/90 font-bold uppercase text-xs tracking-wider"
            >
              {busy ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settlement Complete Celebration Modal */}
      <Dialog open={settledPopupOpen} onOpenChange={setSettledPopupOpen}>
        <DialogContent id="dialog-settlement-complete" className="max-w-[400px] text-center p-6 space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/30 text-green-500 animate-bounce">
            <Sparkles className="h-8 w-8 animate-pulse" />
          </div>
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-black uppercase tracking-tight text-foreground text-center">
              Settlement Complete!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <p className="text-zinc-300 leading-relaxed font-semibold">
              All roommates have paid their splits, and all payments are fully verified!
            </p>
            <p className="text-muted-foreground leading-normal">
              This pool is now fully settled. The transactions have been logged into your personal finance ledger.
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setSettledPopupOpen(false)} className="bg-green-600 hover:bg-green-700 text-white font-bold uppercase tracking-wider text-xs px-6 py-2.5">
              Awesome
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
