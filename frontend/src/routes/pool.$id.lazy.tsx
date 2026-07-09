import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
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
import { ChevronLeft, Share2, Trash2, Check, X, AlertCircle, Sparkles, ExternalLink, User, ShoppingBag, Clock, Shield, Link as LinkIcon, Bell, Eye, EyeOff, Smartphone, Plus, Minus, Pencil, CheckCircle2, ClipboardList } from "lucide-react";
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
  createAmazonCheckoutSession,
  confirmAmazonCheckoutCallback,
  processAmazonRoommatePayment,
} from "@/lib/api/db.functions";

export const Route = createLazyFileRoute("/pool/$id")({
  component: PoolDetail,
});

type Pool = any;
type Item = any;
type SplitBreakdownEntry = {
  itemsTotal: number;
  share: number;
  total: number;
  name: string;
  email?: string;
  paid: boolean;
  paymentStatus: string;
  paymentLabel?: string;
  paymentTone?: string;
  paymentDetail?: string;
  isOverdue?: boolean;
  overdueHours?: number;
  utr: string;
  settlementMode?: string | null;
  confidence?: string | null;
  verificationSource?: string | null;
  reviewReason?: string | null;
  expectedAmount?: number;
  matchedAmount?: number | null;
};

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

function statusToneClass(tone?: string, status?: string) {
  const key = tone || status;
  if (key === "success" || status === "verified") return "bg-green-600/10 border-green-600/25 text-green-500";
  if (key === "danger" || status === "rejected") return "bg-destructive/10 border-destructive/25 text-destructive";
  if (status === "needs_review") return "bg-orange-500/10 border-orange-500/25 text-orange-400";
  return "bg-orange-600/10 border-orange-600/25 text-orange-600";
}

function paymentStatusLabel(status?: string) {
  if (status === "verified") return "Verified";
  if (status === "pending") return "UTR pending";
  if (status === "needs_review") return "Needs review";
  if (status === "rejected") return "Rejected";
  if (status === "host") return "Host share";
  return "Unpaid";
}

function itemQuantity(it: any) {
  const qty = Number(it?.quantity ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function itemUnitPrice(it: any) {
  const unit = Number(it?.unit_price ?? 0);
  if (Number.isFinite(unit) && unit > 0) return unit;
  return Math.round(Number(it?.estimated_price ?? 0) / itemQuantity(it));
}

function cartStatusLabel(status?: string) {
  if (status === "added") return "Added";
  if (status === "substituted") return "Substitute";
  if (status === "unavailable") return "Unavailable";
  if (status === "skipped") return "Skipped";
  if (status === "mixed") return "Mixed";
  return "Pending";
}

function cartStatusClass(status?: string) {
  if (status === "added") return "border-green-600/25 bg-green-600/10 text-green-600";
  if (status === "substituted") return "border-blue-600/20 bg-blue-600/5 text-blue-600";
  if (status === "unavailable" || status === "skipped") return "border-destructive/25 bg-destructive/10 text-destructive";
  if (status === "mixed") return "border-border bg-muted/30 text-muted-foreground";
  return "border-border bg-muted/20 text-muted-foreground";
}

function cartStatusReason(status?: string) {
  if (status === "substituted") return "Host added a substitute for this product.";
  if (status === "unavailable") return "This product was unavailable in the app.";
  if (status === "skipped") return "Host skipped this item before checkout.";
  return "This item was updated by the host.";
}

function needsRoommateAttention(it: any) {
  return Boolean(it?.item_update_reason) || ["substituted", "unavailable", "skipped"].includes(it?.cart_status || "") || it?.is_purchased === false;
}

function itemNoticeLabel(it: any) {
  if (it?.item_update_reason && (!it?.cart_status || it.cart_status === "pending")) return "Updated";
  return cartStatusLabel(it?.cart_status || "skipped");
}

function itemNoticeReason(it: any) {
  if (it?.item_update_reason) return it.item_update_reason;
  if (it?.cart_status_reason) return it.cart_status_reason;
  if (it?.is_purchased === false) return "This item is no longer part of the split.";
  return cartStatusReason(it?.cart_status);
}

function itemActivityTime(it: any) {
  return new Date(it?.item_updated_at || it?.cart_status_updated_at || it?.created_at || 0).getTime();
}

function participantKey(value: any) {
  return String(value ?? "").trim().toLowerCase();
}



function isHostParticipant(pool: Pool | null | undefined, participantName: string, user: any) {
  if (!pool) return false;
  const pName = participantKey(participantName);
  const hostName = participantKey(pool.created_by_name);

  if (pName === "host" || pName === hostName) {
    return true;
  }

  if (pName === "you") {
    if (user && pool.host_id === user.id) {
      return true;
    }
    return false;
  }

  if (user && user.fullName) {
    const userFull = participantKey(user.fullName);
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
  const [itemQty, setItemQty] = useState(1);
  const [productUrl, setProductUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [expandedRoommates, setExpandedRoommates] = useState<Record<string, boolean>>({});
  const [cartBuilderExpanded, setCartBuilderExpanded] = useState(false);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editItemQty, setEditItemQty] = useState(1);
  const [editProductUrl, setEditProductUrl] = useState("");

  // Host checkout modal state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [finalDeliveryFee, setFinalDeliveryFee] = useState("");
  const [finalSurgeFee, setFinalSurgeFee] = useState("");
  const [finalDiscount, setFinalDiscount] = useState("");
  const [hostUpi, setHostUpi] = useState("");

  // UTR confirmation state
  const [confirmUtrOpen, setConfirmUtrOpen] = useState(false);
  const [utrInput, setUtrInput] = useState("");
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReasonOption, setCancelReasonOption] = useState("Minimum cart value not met");
  const [cancelCustomReason, setCancelCustomReason] = useState("");

  // Amazon Pay sandbox contract states
  const [showAmazonMockGateway, setShowAmazonMockGateway] = useState(false);
  const [amazonSessionId, setAmazonSessionId] = useState("");

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
  const [showAuthPassword, setShowAuthPassword] = useState(false);
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
        <div className="animate-[fadeIn_0.2s_ease-out] space-y-6">
          {/* Header area */}
          <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left/Main Column - Items List */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="p-6 bg-surface border-border">
                <div className="flex items-center justify-between mb-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24" />
                </div>
                <div className="space-y-3.5">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between border-b border-border/40 pb-3">
                      <div className="flex items-center gap-3 flex-1">
                        <Skeleton className="h-8 w-8 rounded-md" />
                        <div className="space-y-1.5 flex-1">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      </div>
                      <Skeleton className="h-5 w-16" />
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Right Column - Status/Splits */}
            <div className="space-y-4">
              <Card className="p-6 bg-surface border-border space-y-4">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </Card>
              <Card className="p-6 bg-surface border-border space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </Card>
            </div>
          </div>
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
  const roommateRequestItems = allItems.filter((i: any) => !isHostParticipant(pool, i.added_by_name, user));
  const hostRunnerItems = roommateRequestItems.filter((i: any) => i.product_url);
  const missingLinkItems = roommateRequestItems.filter((i: any) => !i.product_url && i.is_purchased !== false);
  const cartRunnerGroups = Object.values(
    hostRunnerItems.reduce((acc: Record<string, any>, it: any) => {
      const url = formatExternalUrl(it.product_url);
      if (!url) return acc;
      const key = url.toLowerCase();
      const group = acc[key] ??= {
        key,
        url,
        title: it.item_description,
        items: [],
        totalQty: 0,
        totalEstimate: 0,
      };
      group.items.push(it);
      group.totalQty += itemQuantity(it);
      group.totalEstimate += Number(it.estimated_price ?? 0);
      return acc;
    }, {}),
  ) as any[];
  const resolvedCartGroups = cartRunnerGroups.filter((group: any) =>
    group.items.every((it: any) => ["added", "substituted", "unavailable", "skipped"].includes(it.cart_status || "")),
  ).length;
  const pendingRoommateRequests = roommateRequestItems.filter((i: any) => i.is_purchased !== false && (!i.cart_status || i.cart_status === "pending"));
  const visibleCartRunnerGroups = cartBuilderExpanded ? cartRunnerGroups : cartRunnerGroups.slice(0, 8);
  const hiddenCartRunnerGroups = cartRunnerGroups.length - visibleCartRunnerGroups.length;
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
  let splitBreakdown: Record<string, SplitBreakdownEntry> = {};

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
      const serverSplit = (pool.split_breakdown ?? {})[p] ?? {};
      const fallbackStatus = isHostUser ? "host" : (payment ? payment.status : "unpaid");

      splitBreakdown[p] = {
        name: p,
        itemsTotal: pItemsTotal,
        share: overheadShare,
        total: pItemsTotal + overheadShare,
        paid: isHostUser ? true : (payment ? payment.status === "verified" : false),
        paymentStatus: serverSplit.payment_status ?? fallbackStatus,
        paymentLabel: serverSplit.payment_label ?? paymentStatusLabel(fallbackStatus),
        paymentTone: serverSplit.payment_tone,
        paymentDetail: serverSplit.payment_detail,
        isOverdue: Boolean(serverSplit.is_overdue),
        overdueHours: serverSplit.overdue_hours ?? 0,
        utr: payment ? payment.utr : "",
        settlementMode: payment?.settlement_mode ?? null,
        confidence: payment?.confidence ?? null,
        verificationSource: payment?.verification_source ?? serverSplit.verification_source ?? null,
        reviewReason: payment?.review_reason ?? serverSplit.review_reason ?? null,
        expectedAmount: serverSplit.expected_amount ?? pItemsTotal + overheadShare,
        matchedAmount: serverSplit.matched_amount ?? null,
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
        paymentLabel: isHostUser ? "Host share" : "Unpaid",
        paymentTone: isHostUser ? "success" : "warning",
        paymentDetail: "",
        isOverdue: false,
        overdueHours: 0,
        utr: "",
        settlementMode: null,
        confidence: null,
        verificationSource: null,
        reviewReason: null,
        expectedAmount: pItemsTotal + deliveryPerPerson,
        matchedAmount: null,
      };
    });
  }

  const selfPayeeName = (
    (user?.id
      ? participants.find((p) =>
          allItems.some(
            (it: any) =>
              it.added_by_user_id === user.id &&
              participantKey(it.added_by_name) === participantKey(p),
          ),
        )
      : "") ||
    participants.find((p) => participantKey(p) === participantKey(user?.fullName)) ||
    participants.find((p) => participantKey(p) === participantKey(name)) ||
    ""
  );

  // Actions
  async function addItem() {
    if (!name.trim() || !item.trim() || !price.trim()) {
      toast.error("Fill all fields");
      return;
    }

    const numericPrice = parseFloat(price.trim());
    if (isNaN(numericPrice) || numericPrice <= 0 || numericPrice > 5000) {
      toast.error("Unit price must be between ₹1 and ₹5,000");
      return;
    }
    if (!Number.isInteger(itemQty) || itemQty < 1 || itemQty > 50) {
      toast.error("Quantity must be between 1 and 50");
      return;
    }
    const totalPrice = numericPrice * itemQty;
    if (totalPrice <= 0 || totalPrice > 5000) {
      toast.error("Total item estimate must be between ₹1 and ₹5,000");
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
          estimated_price: Math.round(totalPrice * 100),
          quantity: itemQty,
          unit_price: Math.round(numericPrice * 100),
          product_url: isHost ? null : productUrl.trim() || null,
        },
      });
      setItem("");
      setPrice("");
      setItemQty(1);
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

  function openEditItem(it: any) {
    const unitPrice = itemUnitPrice(it) / 100;
    setEditingItem(it);
    setEditItemName(it.item_description || "");
    setEditPrice(Number.isInteger(unitPrice) ? String(unitPrice) : unitPrice.toFixed(2).replace(/\.?0+$/, ""));
    setEditItemQty(itemQuantity(it));
    setEditProductUrl(it.product_url || "");
    setEditItemOpen(true);
  }

  function resetEditItem() {
    setEditingItem(null);
    setEditItemName("");
    setEditPrice("");
    setEditItemQty(1);
    setEditProductUrl("");
    setEditItemOpen(false);
  }

  async function saveEditedItem() {
    if (!editingItem) return;
    if (!editItemName.trim()) {
      toast.error("Please enter an item name");
      return;
    }

    const numericPrice = parseFloat(editPrice.trim());
    if (isNaN(numericPrice) || numericPrice <= 0 || numericPrice > 5000) {
      toast.error("Unit price must be between ₹1 and ₹5,000");
      return;
    }
    if (!Number.isInteger(editItemQty) || editItemQty < 1 || editItemQty > 50) {
      toast.error("Quantity must be between 1 and 50");
      return;
    }

    const totalPrice = numericPrice * editItemQty;
    if (totalPrice <= 0 || totalPrice > 5000) {
      toast.error("Total item estimate must be between ₹1 and ₹5,000");
      return;
    }

    const editingHostItem = isHostParticipant(pool, editingItem.added_by_name, user);
    setBusy(true);
    try {
      await updateCartPoolItem({
        pool_id: id,
        item_id: editingItem.id,
        data: {
          item_description: editItemName.trim(),
          estimated_price: Math.round(totalPrice * 100),
          quantity: editItemQty,
          unit_price: Math.round(numericPrice * 100),
          product_url: editingHostItem ? null : editProductUrl.trim() || null,
        },
      });
      toast.success("Item updated");
      resetEditItem();
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
      qc.invalidateQueries({ queryKey: ["pool", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update item");
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(itemId: string) {
    if (!confirm("Remove this item from your cart?")) return;
    try {
      await deleteCartPoolItem({ pool_id: id, item_id: itemId });
      toast.success("Item removed");
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete item");
    }
  }

  async function toggleAvailability(itemId: string, currentStatus: boolean) {
    const nextStatus = currentStatus ? "unavailable" : "pending";
    try {
      await updateCartPoolItem({
        pool_id: id,
        item_id: itemId,
        data: {
          is_purchased: !currentStatus,
          cart_status: nextStatus,
          cart_status_reason: currentStatus
            ? "Host marked this product unavailable in the delivery app."
            : "Host moved this product back to the active cart.",
        }
      });
      toast.success(currentStatus ? "Roommate will see this item as unavailable." : "Item restored to the active cart.");
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
    } catch (err: any) {
      toast.error("Failed to update item availability");
    }
  }

  async function skipRoommateItem(it: any) {
    if (!confirm(`Skip "${it.item_description}" and notify ${it.added_by_name}?`)) return;
    try {
      await updateCartPoolItem({
        pool_id: id,
        item_id: it.id,
        data: {
          is_purchased: false,
          cart_status: "skipped",
          cart_status_reason: "Host removed this item from the shared cart.",
        },
      });
      toast.success(`${it.added_by_name} will see this item as skipped.`);
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
      qc.invalidateQueries({ queryKey: ["pool", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to skip item");
    }
  }

  async function updateCartRunnerGroup(groupItems: any[], status: "added" | "substituted" | "unavailable" | "skipped") {
    const isPurchased = status === "added" || status === "substituted";
    const reason =
      status === "added"
        ? "Host added this product to the delivery cart."
        : status === "substituted"
          ? "Host added a substitute or equivalent product."
          : status === "unavailable"
            ? "This product was unavailable in the delivery app."
            : "Host skipped this product before checkout.";
    setBusy(true);
    try {
      await Promise.all(groupItems.map((it) =>
        updateCartPoolItem({
          pool_id: id,
          item_id: it.id,
          data: {
            cart_status: status,
            is_purchased: isPurchased,
            cart_status_reason: reason,
          },
        }),
      ));
      toast.success(
        status === "added"
          ? "Marked product as added."
          : status === "substituted"
            ? "Marked product as substituted. Roommates will see the update."
            : status === "unavailable"
              ? "Marked product unavailable and notified roommates in the cart."
              : "Skipped product and notified roommates in the cart.",
      );
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
      qc.invalidateQueries({ queryKey: ["pool", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update cart runner");
    } finally {
      setBusy(false);
    }
  }

  async function copyCartPlan() {
    const linkedLines = cartRunnerGroups.map((group: any) =>
      `- ${group.title} x${group.totalQty} (${group.url})`,
    );
    const missingLines = missingLinkItems.map((it: any) =>
      `- ${it.item_description} x${itemQuantity(it)} (${it.added_by_name}, no link)`,
    );
    const text = [
      `${theme.name} Pool Cart Plan`,
      linkedLines.length ? "Linked requests:" : "",
      ...linkedLines,
      missingLines.length ? "Manual search:" : "",
      ...missingLines,
    ].filter(Boolean).join("\n");

    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (err) {}
    }
    if (!copied) {
      copied = await fallbackCopyText(text);
    }
    if (copied) {
      toast.success("Cart plan copied.");
    } else {
      toast.error("Failed to copy cart plan.");
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
    if (!hostUpi.trim()) {
      toast.error("Enter your UPI address before manual split checkout.");
      return;
    }

    const deliveryAmount = parseFloat(finalDeliveryFee || "0");
    const surgeAmount = parseFloat(finalSurgeFee || "0");
    const discountAmount = parseFloat(finalDiscount || "0");
    if (![deliveryAmount, surgeAmount, discountAmount].every((value) => Number.isFinite(value) && value >= 0)) {
      toast.error("Final fees and discounts must be valid non-negative amounts.");
      return;
    }

    if (pendingRoommateRequests.length > 0) {
      const proceed = confirm(`${pendingRoommateRequests.length} roommate request${pendingRoommateRequests.length === 1 ? "" : "s"} still need host review. Finalize anyway?`);
      if (!proceed) return;
    }

    setBusy(true);
    try {
      const overheadValue = Math.round((deliveryAmount + surgeAmount) * 100);
      const discountValue = Math.round(discountAmount * 100);

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

  async function initiateAmazonCheckout() {
    const deliveryAmount = parseFloat(finalDeliveryFee || "0");
    const surgeAmount = parseFloat(finalSurgeFee || "0");
    const discountAmount = parseFloat(finalDiscount || "0");
    if (![deliveryAmount, surgeAmount, discountAmount].every((value) => Number.isFinite(value) && value >= 0)) {
      toast.error("Final fees and discounts must be valid non-negative amounts.");
      return;
    }

    if (pendingRoommateRequests.length > 0) {
      const proceed = confirm(`${pendingRoommateRequests.length} roommate request${pendingRoommateRequests.length === 1 ? "" : "s"} still need host review. Continue to sandbox checkout?`);
      if (!proceed) return;
    }

    setBusy(true);
    try {
      const overheadValue = Math.round((deliveryAmount + surgeAmount) * 100);
      const discountValue = Math.round(discountAmount * 100);
      
      const res = await createAmazonCheckoutSession({
        pool_id: id,
        data: {
          final_overhead: overheadValue,
          final_discount: discountValue,
          checkout_notes: checkoutNotes.trim() || null,
          upi_id: hostUpi.trim() || null,
        }
      });
      
      setAmazonSessionId(res.checkoutSessionId);
      setCheckoutOpen(false);
      setShowAmazonMockGateway(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to create Amazon checkout session");
    } finally {
      setBusy(false);
    }
  }

  async function handleAmazonGatewayCallback() {
    setBusy(true);
    try {
      await confirmAmazonCheckoutCallback({
        pool_id: id,
        session_id: amazonSessionId,
      });
      toast.success("Amazon Pay sandbox checkout approved and order split finalized!");
      setShowAmazonMockGateway(false);
      qc.invalidateQueries({ queryKey: ["pool", id] });
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
    } catch (err: any) {
      toast.error(err.message || "Failed to approve Amazon Pay checkout");
    } finally {
      setBusy(false);
    }
  }

  async function handleAmazonRoommateReimburse(roommateName: string, amount: number) {
    setBusy(true);
    try {
      await processAmazonRoommatePayment({
        pool_id: id,
        data: {
          roommate_name: roommateName,
          amount: amount,
        }
      });
      toast.success("Sandbox settlement recorded for this split.");
      qc.invalidateQueries({ queryKey: ["pool", id] });
      qc.invalidateQueries({ queryKey: ["pool-items", id] });
    } catch (err: any) {
      toast.error(err.message || "Reimbursement failed");
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
    const targetRoommate = selfPayeeName;
    if (!targetRoommate) {
      toast.error("Your account is not attached to a payable split in this pool.");
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
      toast.success(action === "verify" ? `Marked credit seen for ${roommateName}` : action === "settle_in_kind" ? `Settled in kind for ${roommateName}` : `Rejected payment for ${roommateName}`);
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
      if (res?.success) {
        toast.success(res.message || `WhatsApp nudge sent to ${roommateName}!`);
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
  const payeeDetails = selfPayeeName ? splitBreakdown[selfPayeeName] : undefined;
  const upiPayUrl = pool.upi_id && payeeDetails
    ? `upi://pay?pa=${pool.upi_id}&pn=${encodeURIComponent(pool.created_by_name || "Host")}&am=${(payeeDetails.total / 100).toFixed(2)}&tn=${encodeURIComponent(`PocketBuddy ${theme.name} Pool Split`)}&cu=INR`
    : "";

  const qrCodeUrl = upiPayUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiPayUrl)}`
    : "";
  const settlementSummary = pool.settlement_summary ?? {};
  const hostAndroidStatus = pool.host_android_status ?? settlementSummary.host_android_status;
  const editingHostItem = editingItem ? isHostParticipant(pool, editingItem.added_by_name, user) : false;

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
                  <div className="relative">
                    <Input
                      id="auth-password"
                      type={showAuthPassword ? "text" : "password"}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="********"
                      className="bg-background text-sm h-10 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-foreground focus:outline-none"
                      aria-label={showAuthPassword ? "Hide password" : "Show password"}
                      title={showAuthPassword ? "Hide password" : "Show password"}
                    >
                      {showAuthPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
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
            <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
            Pooler
          </span>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-[10px] md:text-xs sm:text-xs font-semibold uppercase tracking-wider bg-muted/50 border-border max-w-[120px] sm:max-w-none truncate whitespace-nowrap">
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
          amazon_now: "border-t-[#FF9900]",
        } as Record<string, string>)[pool.platform] || "border-t-primary"
      } px-6 py-8 text-foreground flex flex-col justify-between relative overflow-hidden rounded-2xl shadow-sm`}>
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
          <div className="flex flex-col gap-3 rounded-xl border border-green-600/25 bg-green-600/10 p-4 text-xs text-green-600">
            <div className="flex gap-2.5 items-start">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-green-600" />
              <div>
                <p className="font-black uppercase tracking-wider text-green-600 text-sm">Pool Fully Settled</p>
                <p className="text-muted-foreground leading-relaxed mt-1">
                  All roommate splits for this {theme.name} pool are paid and verified. No outstanding balances remain.
                </p>
              </div>
            </div>
            {pool.checkout_notes && (
              <div className="bg-background/50 border border-green-600/15 rounded-lg p-3 text-xs">
                <span className="font-bold text-green-600 uppercase tracking-widest text-[9px] md:text-xs block mb-1">Host Note / Message</span>
                <p className="text-muted-foreground leading-relaxed font-semibold">
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
                <span className="font-bold text-green-500 uppercase tracking-widest text-[9px] md:text-xs block mb-1">Host Note / Message</span>
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
                <span className="font-bold text-destructive uppercase tracking-widest text-[9px] md:text-xs block mb-1">Reason for Cancellation</span>
                <p className="text-zinc-300 leading-relaxed font-semibold">
                  "{pool.cancellation_reason}"
                </p>
              </div>
            )}
          </div>
        )}

        {pool.status === "closed" && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 text-xs">
            <div className="flex gap-2.5 items-start">
              <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-muted-foreground" />
              <div>
                <p className="font-bold uppercase tracking-wider text-foreground">Pool Closed</p>
                <p className="text-muted-foreground leading-relaxed mt-1">
                  The join window has expired. Items remain visible for reference, but checkout and payment collection are not active.
                </p>
              </div>
            </div>
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
                {hostAndroidStatus && (
                  <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs ${
                    hostAndroidStatus.can_auto_verify
                      ? "border-green-500/25 bg-green-500/10 text-green-500"
                      : "border-orange-600/25 bg-orange-600/10 text-orange-600"
                  }`}>
                    <Smartphone className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-black uppercase tracking-wider">{hostAndroidStatus.label}</p>
                      <p className="mt-0.5 leading-relaxed text-muted-foreground">
                        {hostAndroidStatus.can_auto_verify
                          ? "Incoming roommate credits can auto-match after checkout when sender or UTR is clear."
                          : "Pair the Android connector before checkout if you want repayment credits to auto-match."}
                      </p>
                    </div>
                    {!hostAndroidStatus.can_auto_verify && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => nav({ to: "/companion" })}
                        className="h-8 shrink-0 border-orange-600/30 text-orange-600 hover:bg-orange-600/10 text-[10px] font-bold uppercase"
                      >
                        Setup
                      </Button>
                    )}
                  </div>
                )}

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

                {(cartRunnerGroups.length > 0 || missingLinkItems.length > 0) && (
                  <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                          <LinkIcon className="h-3.5 w-3.5 text-zinc-500" />
                          <span>Cart Builder</span>
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
                          Product links are merged so the host adds each item once and tracks progress here.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:min-w-[210px]">
                          <Badge variant="outline" className="h-7 justify-center border-border bg-muted/20 text-[10px] font-bold text-foreground">
                            {cartRunnerGroups.length} links
                          </Badge>
                          <Badge variant="outline" className="h-7 justify-center border-border bg-muted/20 text-[10px] font-bold text-foreground">
                            {resolvedCartGroups} done
                          </Badge>
                          {missingLinkItems.length > 0 && (
                            <Badge variant="outline" className="h-7 justify-center border-border bg-muted/20 text-[10px] font-bold text-foreground">
                              {missingLinkItems.length} missing
                            </Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={copyCartPlan}
                          className="h-8 w-full gap-1.5 text-[10px] font-bold uppercase tracking-wider sm:w-auto"
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                          Copy Plan
                        </Button>
                      </div>
                    </div>

                    {cartRunnerGroups.length > 0 && (
                      <div className="overflow-hidden rounded-lg border border-border bg-background/40">
                        {visibleCartRunnerGroups.map((group: any) => {
                          const statuses = Array.from(new Set(group.items.map((it: any) => it.cart_status || "pending")));
                          const status = statuses.length === 1 ? String(statuses[0]) : "mixed";
                          const roommateBreakdown = group.items
                            .map((it: any) => `${it.added_by_name} x${itemQuantity(it)}`)
                            .join(" / ");

                          return (
                            <div key={group.key} className="border-b border-border/60 p-3 last:border-b-0">
                              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="max-w-[300px] truncate text-xs font-bold text-foreground capitalize">
                                      {group.title}
                                    </p>
                                    <Badge variant="outline" className={`h-5 px-1.5 text-[10px] font-bold uppercase ${cartStatusClass(status)}`}>
                                      {cartStatusLabel(status)}
                                    </Badge>
                                  </div>
                                  <p className="text-xs font-semibold text-muted-foreground leading-relaxed">
                                    Qty <strong className="text-foreground">{group.totalQty}</strong> - Est. <strong className="text-foreground">{rupees(group.totalEstimate)}</strong> - <span className="text-zinc-500">{roommateBreakdown}</span>
                                  </p>
                                </div>

                                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 xl:flex xl:items-center">
                                  <a
                                    href={group.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-muted/40"
                                  >
                                    Open <ExternalLink className="h-3 w-3" />
                                  </a>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateCartRunnerGroup(group.items, "added")}
                                    disabled={busy}
                                    className="h-8 border-green-600/25 px-2.5 text-[10px] font-bold uppercase tracking-wider text-green-600 hover:bg-green-600/10"
                                  >
                                    Added
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateCartRunnerGroup(group.items, "substituted")}
                                    disabled={busy}
                                    className="h-8 border-border px-2.5 text-[10px] font-bold uppercase tracking-wider text-foreground hover:bg-muted/40"
                                  >
                                    Substitute
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateCartRunnerGroup(group.items, "unavailable")}
                                    disabled={busy}
                                    className="h-8 border-destructive/25 px-2.5 text-[10px] font-bold uppercase tracking-wider text-destructive hover:bg-destructive/10"
                                  >
                                    Unavailable
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateCartRunnerGroup(group.items, "skipped")}
                                    disabled={busy}
                                    className="h-8 border-border px-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/40"
                                  >
                                    Skip
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {cartRunnerGroups.length > 8 && (
                          <div className="border-t border-border/60 bg-muted/10 px-3 py-2.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setCartBuilderExpanded((value) => !value)}
                              className="h-8 w-full justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                            >
                              {cartBuilderExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                              {cartBuilderExpanded ? "Show fewer links" : `Show ${hiddenCartRunnerGroups} more links`}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {pendingRoommateRequests.length > 0 && (
                      <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs font-semibold leading-relaxed text-muted-foreground">
                        <strong className="text-foreground">{pendingRoommateRequests.length} active request{pendingRoommateRequests.length === 1 ? "" : "s"} pending host review.</strong>{" "}
                        Mark linked requests as added, substituted, unavailable, or skipped before checkout when possible.
                      </div>
                    )}

                    {missingLinkItems.length > 0 && (
                      <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs font-semibold leading-relaxed text-muted-foreground">
                        <strong className="text-foreground">{missingLinkItems.length} active item{missingLinkItems.length === 1 ? "" : "s"} missing links.</strong>{" "}
                        Ask roommates to add product links, or search them manually from the list below.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : pool.status === "completed" ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                      {isFullySettled ? "Settlement closed" : "Collection queue"}
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
                      {isFullySettled
                        ? "All roommate splits are verified. This pool is now a receipt."
                        : "Review pending UTRs, nudge unpaid roommates, or close an agreed in-kind settlement."}
                    </p>
                  </div>
                  {!isFullySettled && (
                    <Badge variant="outline" className="w-fit border-orange-600/25 bg-orange-600/10 text-orange-600 text-[10px] font-black uppercase tracking-wider">
                      {settlementSummary.next_action || "Action needed"}
                    </Badge>
                  )}
                </div>

                {!isFullySettled && hostAndroidStatus && (
                  <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs ${
                    hostAndroidStatus.can_auto_verify
                      ? "border-green-500/25 bg-green-500/10 text-green-400"
                      : "border-orange-600/25 bg-orange-600/10 text-orange-600"
                  }`}>
                    <Smartphone className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-black uppercase tracking-wider">{hostAndroidStatus.label}</p>
                      <p className="mt-0.5 leading-relaxed text-zinc-400">{hostAndroidStatus.detail}</p>
                    </div>
                    {!hostAndroidStatus.can_auto_verify && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => nav({ to: "/companion" })}
                        className="h-8 shrink-0 border-orange-600/30 text-orange-600 hover:bg-orange-600/10 text-[10px] font-bold uppercase"
                      >
                        Setup
                      </Button>
                    )}
                  </div>
                )}

                {settlementSummary.total_roommates > 0 && (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl border border-border bg-surface p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Outstanding</p>
                      <p className="mt-1 text-base font-black text-foreground tnum">{rupees(settlementSummary.outstanding_total ?? 0)}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Review</p>
                      <p className="mt-1 text-base font-black text-foreground tnum">{(settlementSummary.pending ?? 0) + (settlementSummary.needs_review ?? 0) + (settlementSummary.rejected ?? 0)}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Overdue</p>
                      <p className="mt-1 text-base font-black text-foreground tnum">{settlementSummary.overdue ?? 0}</p>
                    </div>
                  </div>
                )}

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
                      const rel = (pool.reliability_scores ?? {})[rName] ?? {
                        score: 60,
                        label: "New roommate",
                        color: "blue",
                        explanation: "No completed split history yet.",
                        signals: { completed_splits: 0, unsettled_splits: 0, late_splits: 0 },
                      };
                      
                      let badgeColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                      if (rel.color === "green") badgeColor = "bg-green-500/10 text-green-500 border-green-500/20";
                      else if (rel.color === "yellow") badgeColor = "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
                      else if (rel.color === "red") badgeColor = "bg-red-500/10 text-red-500 border-red-500/20";

                      return (
                        <div key={rName} className="rounded-lg border border-border bg-surface px-3.5 py-3 text-xs">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold capitalize text-foreground">{rName}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${badgeColor} font-bold`}>
                                  {rel.label} ({rel.score ?? 60}%)
                                </span>
                                {!details.paid && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${statusToneClass(details.payment_tone, details.payment_status)}`}>
                                    {details.payment_label || paymentStatusLabel(details.payment_status)}
                                  </span>
                                )}
                                {details.is_overdue && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-destructive/25 bg-destructive/10 text-destructive font-bold">
                                    Overdue {Math.round(details.overdue_hours || 0)}h
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-black text-foreground tnum">{rupees(details.total)}</p>
                              <p className="text-[10px] md:text-xs text-zinc-500 font-semibold leading-relaxed">
                                {rel.explanation}
                              </p>
                              {rel.signals && (
                                <p className="text-[10px] md:text-xs text-zinc-600 font-semibold">
                                  {rel.signals.completed_splits ?? 0} settled / {rel.signals.unsettled_splits ?? 0} open / {rel.signals.late_splits ?? 0} late
                                </p>
                              )}
                              {details.email && (
                                <p className="text-[10px] md:text-xs text-zinc-500 font-semibold lowercase">
                                  {details.email}
                                </p>
                              )}
                              {details.utr && (
                                <p className="text-[10px] md:text-xs text-muted-foreground font-mono">
                                  UTR: {details.utr}
                                </p>
                              )}
                              {details.payment_detail && !details.paid && (
                                <p className="text-[10px] md:text-xs text-zinc-400 font-semibold leading-relaxed max-w-[320px]">
                                  {details.payment_detail}
                                </p>
                              )}
                            </div>
                            <div className="flex w-full items-center md:w-auto">
                              {details.paid ? (
                                <div className="flex w-full flex-wrap items-center justify-between gap-2 md:w-auto md:justify-end">
                                  <Badge className="bg-green-600/10 border border-green-600/20 text-green-500 font-bold py-1 px-2.5">
                                    VERIFIED
                                  </Badge>
                                  {(details.settlementMode === "settle_in_kind" || details.settlement_mode === "settle_in_kind") && (
                                    <span className="text-[10px] md:text-xs text-muted-foreground font-bold bg-muted/20 border border-border px-1.5 rounded">
                                      Settled In Kind
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="grid w-full grid-cols-2 gap-1.5 md:w-[260px]">
                                  <Button
                                    size="sm"
                                    onClick={() => handleVerifyPayment(rName, "verify")}
                                    className="h-8 bg-green-600 text-white hover:bg-green-700 py-1 px-2 text-[10px] md:text-xs uppercase font-bold tracking-wider"
                                  >
                                    Credit Seen
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleNudgeRoommate(rName, details.total)}
                                    className="h-8 border-primary/20 text-primary hover:bg-primary/5 py-1 px-2 text-[10px] md:text-xs uppercase font-bold tracking-wider flex items-center justify-center gap-1.5"
                                  >
                                    <Bell className="h-3.5 w-3.5 shrink-0" />
                                    <span>Nudge</span>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleVerifyPayment(rName, "settle_in_kind")}
                                    className="h-8 border-border text-muted-foreground hover:bg-muted/40 py-1 px-2 text-[10px] md:text-xs uppercase font-bold tracking-wider"
                                  >
                                    In Kind
                                  </Button>
                                  {(details.payment_status === "pending" || details.payment_status === "needs_review") && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleVerifyPayment(rName, "reject")}
                                      className="h-8 border-destructive/20 text-destructive hover:bg-destructive/5 py-1 px-2 text-[10px] md:text-xs uppercase font-bold tracking-wider"
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
                            : details.paymentStatus === "pending" || details.paymentStatus === "needs_review"
                              ? "bg-orange-500"
                              : details.paymentStatus === "rejected"
                                ? "bg-destructive"
                                : details.isOverdue
                                  ? "bg-destructive"
                                  : "bg-zinc-500"
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
                          <span className="text-orange-600 font-bold">UTR Pending</span>
                        ) : details.paymentStatus === "needs_review" ? (
                          <span className="text-orange-400 font-bold">Needs Review</span>
                        ) : details.paymentStatus === "rejected" ? (
                          <span className="text-destructive font-bold">Rejected</span>
                        ) : details.paymentStatus === "host" ? (
                          <span className="text-green-500 font-bold">HOST (OWN SHARE)</span>
                        ) : details.isOverdue ? (
                          <span className="text-destructive font-bold">Overdue</span>
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
                <Shield className="h-4 w-4 text-primary" /> UPI Split Settlement
              </h3>
              <Badge className="bg-white/5 border border-border text-foreground text-xs font-bold uppercase tracking-wider px-2 py-0.5">VPA Direct</Badge>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-0.5">Your settlement identity</label>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3">
                  <User className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-foreground">
                      {selfPayeeName || user?.fullName || name || "No split matched"}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold leading-relaxed text-muted-foreground">
                      {selfPayeeName
                        ? "Locked to your logged-in account. You can submit a UTR only for this split."
                        : "This account has no payable split in the pool."}
                    </p>
                  </div>
                </div>
              </div>

              {hostAndroidStatus && (
                <div className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                  hostAndroidStatus.can_auto_verify
                    ? "border-green-500/20 bg-green-500/10 text-green-400"
                    : "border-orange-600/25 bg-orange-600/10 text-orange-600"
                }`}>
                  <Smartphone className="h-4 w-4 shrink-0 mt-0.5" />
                  <p className="leading-relaxed text-zinc-300">
                    <span className="font-bold text-current">{hostAndroidStatus.label}: </span>
                    {hostAndroidStatus.can_auto_verify
                      ? "host credits can auto-match when sender or UTR is clear."
                      : "UTRs will wait for host review until the host Android connector is active."}
                  </p>
                </div>
              )}

              {payeeDetails ? (
                <div className="bg-surface rounded-xl p-5 border border-border flex flex-col items-center justify-center text-center space-y-4">
                  <div className="text-center space-y-1">
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Final Pay Share</p>
                    <h4 className="text-2xl font-black text-foreground tnum">{rupees(payeeDetails.total)}</h4>
                    {pool.upi_id && (
                      <p className="text-xs text-muted-foreground">UPI ID: <code className="bg-white/5 px-2 py-0.5 rounded border border-border font-mono select-all text-foreground text-xs">{pool.upi_id}</code></p>
                    )}
                  </div>

                  {payeeDetails.paymentStatus === "verified" ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-500 bg-green-600/10 border border-green-600/20 px-4 py-2 rounded-full font-bold">
                      <Check className="h-4 w-4" /> Paid & Confirmed
                    </div>
                  ) : payeeDetails.paymentStatus === "pending" ? (
                    <div className="text-center space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 text-xs text-orange-600 bg-orange-600/10 border border-orange-600/20 px-4 py-2 rounded-full font-bold">
                        Pending Verification
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">UTR: {payeeDetails.utr}</p>
                      {payeeDetails.paymentDetail && (
                        <p className="text-xs text-muted-foreground leading-relaxed">{payeeDetails.paymentDetail}</p>
                      )}
                    </div>
                  ) : payeeDetails.paymentStatus === "needs_review" ? (
                    <div className="text-center space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-4 py-2 rounded-full font-bold">
                        Needs Host Review
                      </div>
                      {payeeDetails.utr && <p className="text-xs text-muted-foreground font-mono">UTR: {payeeDetails.utr}</p>}
                      <p className="text-xs text-muted-foreground leading-relaxed">{payeeDetails.paymentDetail || payeeDetails.reviewReason}</p>
                    </div>
                  ) : payeeDetails.paymentStatus === "host" ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-500 bg-green-600/10 border border-green-600/20 px-4 py-2 rounded-full font-bold">
                      <Check className="h-4 w-4" /> Host User (Automatically Verified)
                    </div>
                  ) : (
                    <div className="w-full space-y-4 text-center">
                      
                      {/* UPI Section: Rendered ONLY if pool.upi_id exists */}
                      {pool.upi_id ? (
                        <>
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
                        </>
                      ) : (
                        /* UPI Missing warning: rendered instead of Step 1 & Step 2 */
                        <div className="space-y-3">
                          <div className="flex gap-2.5 items-start text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-xl p-4 text-left">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <p className="font-semibold leading-relaxed">
                              No host UPI address found. Contact <strong>{pool.created_by_name}</strong> to pay manually.
                            </p>
                          </div>
                          {pool.host_phone && (
                            <Button
                              onClick={() => {
                                const cleanPhone = pool.host_phone.replace(/\D/g, "");
                                const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
                                const text = encodeURIComponent(
                                  `Hey ${pool.created_by_name}, your ${pool.platform_display_label || "delivery"} cart pool is settled but no UPI VPA was provided in PocketBuddy. Can you please share your UPI ID so I can settle my split?`
                                );
                                window.open(`https://wa.me/${targetPhone}?text=${text}`, "_blank");
                              }}
                              className="w-full text-xs font-black uppercase tracking-wider bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-1.5 h-10 shadow-sm rounded-xl"
                            >
                              <span>Contact {pool.created_by_name} on WhatsApp</span>
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Step 3: Amazon Pay sandbox settlement - always available in demo */}
                      <div className="w-full space-y-2 text-left bg-surface-raised/40 p-4 rounded-xl border border-border">
                        <p className="text-xs font-bold text-[#FF9900] uppercase tracking-widest flex items-center gap-1.5">
                          <span className="bg-[#FF9900] text-black w-4 h-4 rounded-full inline-flex items-center justify-center text-xs font-bold">{pool.upi_id ? '3' : '1'}</span>
                          <span>Amazon Pay Sandbox</span>
                        </p>
                        <Button
                          className="w-full text-xs font-black uppercase tracking-wider bg-[#FF9900] hover:bg-[#E48A00] text-black flex items-center justify-center gap-1.5 h-10 shadow-sm border border-[#D58000]"
                          onClick={() => {
                            handleAmazonRoommateReimburse(selfPayeeName, payeeDetails.total);
                          }}
                          disabled={busy || !selfPayeeName}
                        >
                          Simulate Settlement
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-normal">
                          Demo-only settlement using the sandbox flow. Manual UTR remains the real fallback.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center p-6 border border-dashed border-border rounded-xl bg-surface-raised/40 text-xs text-muted-foreground font-semibold">
                  This account does not have a payable split in this pool. Add an item first, or ask the host to check the participant list.
                </div>
              )}

              {/* General payment checklist */}
              <div className="bg-surface p-4 rounded-xl border border-border space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Settlement Checklist:
                </p>
                <ol className="list-decimal pl-4 text-xs space-y-2 text-zinc-400 leading-relaxed">
                  <li>Confirm the split shown above belongs to your logged-in account.</li>
                  <li>Pay the split total to the host's QR code or VPA.</li>
                  <li>Fetch the 12-digit UTR reference ID from your transaction receipt.</li>
                  <li>Enter and submit the UTR to complete the verification checklist.</li>
                </ol>
              </div>
            </div>
          </Card>
        )}

        {/* List of items inside pool */}
        <div id="list-pool-items" className="space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-zinc-500 tracking-[0.25em] uppercase flex items-center gap-1.5 min-w-0">
                <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Cart Requests</span>
              </h3>
              {participants.length > 0 && (
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {participants.length} roommate{participants.length === 1 ? "" : "s"} - {purchasedItems.length} active item{purchasedItems.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
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
            const whoQuantity = whoActiveItems.reduce((s, it) => s + itemQuantity(it), 0);
            const attentionItems = its.filter(needsRoommateAttention);
            const orderedItems = [...its].sort((a, b) => {
              const aNeedsAttention = needsRoommateAttention(a) ? 1 : 0;
              const bNeedsAttention = needsRoommateAttention(b) ? 1 : 0;
              if (aNeedsAttention !== bNeedsAttention) return bNeedsAttention - aNeedsAttention;
              return itemActivityTime(b) - itemActivityTime(a);
            });
            const isExpanded = expandedRoommates[who] ?? false;
            const visibleItems = isExpanded ? orderedItems : orderedItems.slice(0, 8);
            const hiddenCount = orderedItems.length - visibleItems.length;
            const shownUpdates = attentionItems.slice(0, 3);

            return (
              <Card key={who} className="overflow-hidden border border-border bg-surface">
                <div className="flex flex-col gap-2 border-b border-border/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      <span className="truncate text-xs font-bold capitalize text-foreground">{who}</span>
                      <Badge variant="outline" className="h-5 border-border bg-muted/20 px-1.5 text-[10px] font-bold text-muted-foreground">
                        {whoActiveItems.length} item{whoActiveItems.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    {splitBreakdown[who]?.email && (
                      <p className="mt-0.5 truncate text-[10px] font-semibold lowercase text-zinc-500">
                        {splitBreakdown[who].email}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                    <span>{whoQuantity} unit{whoQuantity === 1 ? "" : "s"}</span>
                    <span className="font-black text-foreground tnum">{rupees(whoTotal)}</span>
                  </div>
                </div>

                {attentionItems.length > 0 && (
                  <div className="border-b border-border/60 px-4 py-3">
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex items-start gap-2.5">
                        <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-foreground">
                              Item Updates
                            </p>
                            <Badge variant="outline" className="h-5 border-border bg-background px-1.5 text-[10px] font-bold text-muted-foreground">
                              {attentionItems.length} update{attentionItems.length === 1 ? "" : "s"}
                            </Badge>
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {shownUpdates.map((it: any) => {
                              return (
                                <p key={it.id} className="text-xs font-semibold leading-relaxed text-muted-foreground">
                                  <span className="font-bold text-foreground">{it.item_description}</span>
                                  <span className="text-zinc-500"> - {itemNoticeLabel(it)}: {itemNoticeReason(it)}</span>
                                </p>
                              );
                            })}
                            {attentionItems.length > shownUpdates.length && (
                              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                +{attentionItems.length - shownUpdates.length} more update{attentionItems.length - shownUpdates.length === 1 ? "" : "s"} in this cart
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="divide-y divide-border/50">
                  {visibleItems.map((it) => {
                    const isOwnItem = name && it.added_by_name === name;
                    const canEditItem = (pool.status === "open") && (isHost || isOwnItem);
                    const itemBelongsToHost = isHostParticipant(pool, it.added_by_name, user);
                    const hostManagingRoommateItem = Boolean(isHost && !itemBelongsToHost);
                    const itemNeedsAttention = needsRoommateAttention(it);

                    return (
                      <div key={it.id} className={`flex items-center justify-between gap-3 px-4 py-3 transition-opacity ${it.is_purchased === false ? "opacity-50" : ""}`}>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex max-w-full flex-wrap items-center gap-1.5">
                            <p className={`truncate text-xs font-bold text-foreground ${it.is_purchased === false ? "line-through" : ""}`}>{it.item_description}</p>
                            {itemQuantity(it) > 1 && (
                              <Badge variant="outline" className="h-5 border-border bg-muted/20 px-1.5 py-0 text-[10px] font-bold text-muted-foreground">
                                x{itemQuantity(it)}
                              </Badge>
                            )}
                            {it.cart_status && it.cart_status !== "pending" && (
                              <Badge variant="outline" className={`h-5 px-1.5 py-0 text-[10px] font-bold uppercase ${cartStatusClass(it.cart_status)}`}>
                                {cartStatusLabel(it.cart_status)}
                              </Badge>
                            )}
                            {it.item_update_reason && (!it.cart_status || it.cart_status === "pending") && (
                              <Badge variant="outline" className="h-5 border-border bg-muted/20 px-1.5 py-0 text-[10px] font-bold uppercase text-muted-foreground">
                                Updated
                              </Badge>
                            )}
                          </div>

                          <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            {relativeTime(it.created_at)}
                            {itemQuantity(it) > 1 && (
                              <span className="text-zinc-600">- {rupees(itemUnitPrice(it))} each</span>
                            )}
                            {it.product_url && !itemBelongsToHost && (
                              <a
                                href={formatExternalUrl(it.product_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded border border-border bg-muted/20 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                                title={`Open on ${theme.name}`}
                              >
                                Link <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                            {it.is_purchased === false && (
                              <Badge variant="outline" className="h-5 border-border bg-muted/20 px-1.5 py-0 text-[10px] font-bold text-muted-foreground">
                                Excluded
                              </Badge>
                            )}
                          </p>
                          {itemNeedsAttention && (
                            <p className="flex items-start gap-1.5 text-[10px] font-semibold leading-relaxed text-muted-foreground">
                              <Bell className="mt-0.5 h-3 w-3 shrink-0" />
                              <span>{itemNoticeReason(it)}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-xs font-black text-foreground tnum">{rupees(it.estimated_price)}</span>

                          {/* Item Actions */}
                          {canEditItem && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => openEditItem(it)}
                                className="cursor-pointer rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                                title="Edit item"
                                aria-label="Edit item"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {isHost && (
                                <button
                                  onClick={() => toggleAvailability(it.id, it.is_purchased !== false)}
                                  className={`cursor-pointer rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted/40 ${it.is_purchased !== false ? "hover:text-destructive" : "hover:text-green-600"}`}
                                  title={it.is_purchased !== false ? "Mark unavailable and notify roommate" : "Restore item to active cart"}
                                >
                                  {it.is_purchased !== false ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                                </button>
                              )}
                              <button
                                onClick={() => hostManagingRoommateItem ? skipRoommateItem(it) : deleteItem(it.id)}
                                className="cursor-pointer rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-destructive"
                                title={hostManagingRoommateItem ? "Skip item and notify roommate" : "Remove item"}
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
                {orderedItems.length > 8 && (
                  <div className="border-t border-border/60 bg-muted/10 px-4 py-2.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedRoommates((current) => ({ ...current, [who]: !isExpanded }))}
                      className="h-8 w-full justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Floating quick item entry form */}
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
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{isHost ? "Qty" : "Qty + Link"}</span>
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
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3 py-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quantity</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setItemQty((qty) => Math.max(1, qty - 1))}
                  className="h-8 w-8 rounded-md"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="grid h-8 min-w-9 place-items-center rounded-md border border-border bg-background px-2 text-sm font-black text-foreground tnum">
                  {itemQty}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setItemQty((qty) => Math.min(50, qty + 1))}
                  className="h-8 w-8 rounded-md"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {!isHost && (
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  id="input-pool-link"
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  placeholder="Product link, optional"
                  className="bg-background text-xs h-10 pl-9"
                />
              </div>
            )}
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

              <div className={`grid gap-3 ${isHost ? "" : "sm:grid-cols-[120px_1fr]"}`}>
                <div className="space-y-1.5">
                  <label htmlFor="input-pool-price-dialog" className="text-xs font-semibold text-muted-foreground">
                    Unit price
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

                {!isHost && (
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
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quantity</p>
                  <p className="text-xs font-semibold text-zinc-500">
                    Line total: {price ? rupees(Math.round((parseFloat(price) || 0) * itemQty * 100)) : "Not set"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setItemQty((qty) => Math.max(1, qty - 1))}
                    className="h-9 w-9 rounded-md"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="grid h-9 min-w-10 place-items-center rounded-md border border-border bg-background px-2 text-base font-black text-foreground tnum">
                    {itemQty}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setItemQty((qty) => Math.min(50, qty + 1))}
                    className="h-9 w-9 rounded-md"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
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

      <Dialog open={editItemOpen} onOpenChange={(open) => open ? setEditItemOpen(true) : resetEditItem()}>
        <DialogContent id="dialog-edit-pool-item" className="max-w-[440px]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveEditedItem();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Edit Item</DialogTitle>
            </DialogHeader>
            <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
              Update the item before checkout. The split recalculates from quantity and unit price.
            </p>

            <div className="space-y-3 text-sm">
              {editingItem && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest pl-0.5">
                    Owner
                  </label>
                  <div className="flex items-center justify-between gap-2.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-zinc-400">
                    <span className="min-w-0 truncate">
                      <strong className="text-foreground capitalize">{editingItem.added_by_name}</strong>
                    </span>
                    {editingHostItem && (
                      <Badge variant="outline" className="h-5 border-border bg-background px-1.5 text-[10px] font-bold text-muted-foreground">
                        Host item
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="input-edit-pool-item" className="text-xs font-semibold text-muted-foreground">
                  Item
                </label>
                <div className="relative">
                  <ShoppingBag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    id="input-edit-pool-item"
                    value={editItemName}
                    onChange={(e) => setEditItemName(e.target.value)}
                    placeholder="Item name"
                    className="h-10 bg-background pl-9 text-sm"
                  />
                </div>
              </div>

              <div className={`grid gap-3 ${editingHostItem ? "" : "sm:grid-cols-[120px_1fr]"}`}>
                <div className="space-y-1.5">
                  <label htmlFor="input-edit-pool-price" className="text-xs font-semibold text-muted-foreground">
                    Unit price
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500">₹</span>
                    <Input
                      id="input-edit-pool-price"
                      type="number"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="80"
                      className="h-10 bg-background pl-6 pr-3 text-right text-sm font-bold text-foreground"
                    />
                  </div>
                </div>

                {!editingHostItem && (
                  <div className="space-y-1.5">
                    <label htmlFor="input-edit-pool-link" className="text-xs font-semibold text-muted-foreground">
                      Product link, optional
                    </label>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <Input
                        id="input-edit-pool-link"
                        value={editProductUrl}
                        onChange={(e) => setEditProductUrl(e.target.value)}
                        placeholder="Paste item URL"
                        className="h-10 bg-background pl-9 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quantity</p>
                  <p className="text-xs font-semibold text-zinc-500">
                    Line total: {editPrice ? rupees(Math.round((parseFloat(editPrice) || 0) * editItemQty * 100)) : "Not set"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setEditItemQty((qty) => Math.max(1, qty - 1))}
                    className="h-9 w-9 rounded-md"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="grid h-9 min-w-10 place-items-center rounded-md border border-border bg-background px-2 text-base font-black text-foreground tnum">
                    {editItemQty}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => setEditItemQty((qty) => Math.min(50, qty + 1))}
                    className="h-9 w-9 rounded-md"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={resetEditItem} disabled={busy}>
                Cancel
              </Button>
              <Button
                id="btn-save-pool-item-dialog"
                type="submit"
                disabled={busy}
                className="bg-primary text-primary-foreground hover:opacity-95"
              >
                {busy ? "Saving..." : "Save Changes"}
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

          {pendingRoommateRequests.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs font-semibold leading-relaxed text-muted-foreground">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p>
                  <strong className="text-foreground">{pendingRoommateRequests.length} roommate request{pendingRoommateRequests.length === 1 ? "" : "s"} still pending review.</strong>{" "}
                  You can still finalize, but marking unavailable or skipped items first keeps the split clearer.
                </p>
              </div>
            </div>
          )}

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

          <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-col sm:space-x-0">
            <div className="flex flex-col gap-2 w-full">
              <Button 
                onClick={initiateAmazonCheckout} 
                disabled={busy} 
                className="w-full bg-[#FF9900] hover:bg-[#E48A00] text-black font-extrabold flex items-center justify-center gap-2 rounded-xl py-2.5 h-11 border border-[#D58000] shadow-sm tracking-wide"
              >
                <span>{busy ? "Connecting..." : "Pay & Split via Amazon Pay Sandbox"}</span>
              </Button>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCheckoutOpen(false)} disabled={busy} className="flex-1 rounded-xl h-10">
                  Close
                </Button>
                <Button onClick={completeCheckout} disabled={busy} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-10 font-bold">
                  {busy ? "Finalizing..." : "Manual UPI Split"}
                </Button>
              </div>
            </div>
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
              <label className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Select Reason</label>
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
                <label className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Custom Reason</label>
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

      {/* Settlement complete receipt modal */}
      <Dialog open={settledPopupOpen} onOpenChange={setSettledPopupOpen}>
        <DialogContent id="dialog-settlement-complete" className="max-w-[400px] p-6 space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-green-600/25 bg-green-600/10 text-green-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-black uppercase tracking-tight text-foreground">
              Settlement Complete
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-center text-xs">
            <p className="text-foreground leading-relaxed font-semibold">
              All roommate splits are paid and verified.
            </p>
            <p className="text-muted-foreground leading-normal">
              This pool is now a settled receipt in your PocketBuddy ledger.
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setSettledPopupOpen(false)} className="bg-primary text-primary-foreground hover:opacity-95 font-bold uppercase tracking-wider text-xs px-6 py-2.5">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Amazon Pay Sandbox Gateway Overlay */}
      <Dialog open={showAmazonMockGateway} onOpenChange={(val) => {
        if (!val) {
          setShowAmazonMockGateway(false);
          setCheckoutOpen(true);
        }
      }}>
        <DialogContent id="dialog-amazon-pay-gateway" className="max-w-[420px] bg-white text-black p-0 border border-zinc-200 overflow-hidden shadow-2xl rounded-2xl">
          {/* Header Bar */}
          <div className="bg-[#19222D] text-white px-5 py-4 flex items-center justify-between border-b border-zinc-800">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg tracking-tight text-[#FF9900]">amazon</span>
              <span className="font-light text-lg text-zinc-300">pay</span>
            </div>
            <Badge variant="outline" className="text-[#FF9900] border-[#FF9900]/40 font-mono text-[9px] md:text-xs uppercase tracking-widest px-2 py-0.5">
              Sandbox Mode
            </Badge>
          </div>

          <div className="p-6 space-y-5 text-left text-sm">
            <div className="border-b border-zinc-100 pb-3">
              <h2 className="text-base font-bold text-zinc-800 tracking-tight">Confirm Sandbox Checkout</h2>
              <p className="text-[11px] md:text-xs text-zinc-500 mt-0.5">
                Simulate approval for this pool checkout. No live payment method is charged.
              </p>
            </div>

            <div className="bg-zinc-50 border border-zinc-200/60 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Merchant:</span>
                <span className="text-zinc-800 font-bold">PocketBuddy Pool Checkout</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Transaction ID:</span>
                <span className="text-zinc-800 font-mono select-all font-semibold">{amazonSessionId.slice(0, 18)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Authorized Amount:</span>
                <span className="text-zinc-800 font-extrabold text-sm">{rupees(Math.round(((items ?? []).reduce((s: number, it: any) => s + it.estimated_price, 0) + (parseFloat(finalDeliveryFee || "0") + parseFloat(finalSurgeFee || "0")) * 100 - parseFloat(finalDiscount || "0") * 100)))}</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] md:text-xs leading-relaxed rounded-xl p-3.5 flex gap-2 font-medium">
              <Sparkles className="h-4 w-4 shrink-0 text-[#FF9900]" />
              <div>
                <strong>Prototype Notice:</strong> This flow simulates the Amazon Pay checkout contract for demo purposes. Confirming will finalize the pool split and notify your roommates.
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button 
                onClick={handleAmazonGatewayCallback} 
                disabled={busy} 
                className="w-full bg-[#FF9900] hover:bg-[#E48A00] text-black font-extrabold py-2.5 h-11 border border-[#D58000] shadow-sm rounded-xl"
              >
                {busy ? "Approving..." : "Approve Sandbox Checkout"}
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => {
                  setShowAmazonMockGateway(false);
                  setCheckoutOpen(true);
                }} 
                disabled={busy} 
                className="w-full text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/50 py-2 text-xs font-bold"
              >
                Cancel and return to checkout
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
