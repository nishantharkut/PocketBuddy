import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
  Lock,
  PauseCircle,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  getProfile,
  updateProfile,
  getTransactions,
  clearCompanionLogs,
  deleteAccountData,
  updateTransaction,
  confirmTransaction,
  submitParserCorrection,
} from "@/lib/api/db.functions";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/privacy")({
  ssr: false,
  component: PrivacyPage,
});

const CATEGORIES = [
  "food",
  "transport",
  "subscription",
  "utilities",
  "shopping",
  "entertainment",
  "health",
  "education",
  "hostel",
  "travel",
  "other",
];

function PrivacyPage() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [editMerchant, setEditMerchant] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteInput, setConfirmDeleteInput] = useState("");
  const [clearingLogs, setClearingLogs] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [savingSync, setSavingSync] = useState(false);

  const { data: profile, refetch: refetchProfile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: getProfile,
  });

  const { data: allTxns } = useQuery({
    queryKey: ["txns", user?.id],
    enabled: !!user,
    queryFn: getTransactions,
  });

  const txns: any[] = Array.isArray(allTxns) ? allTxns : [];
  const pendingTxns = txns.filter(
    (t) => t.needs_verification === true || t.status === "incomplete"
  );

  const syncEnabled = profile?.companion_sync_enabled !== false;

  async function toggleSync() {
    setSavingSync(true);
    try {
      await updateProfile({ data: { companion_sync_enabled: !syncEnabled } });
      await refetchProfile();
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(
        !syncEnabled ? "Sync resumed." : "Sync paused — notifications will be logged but not processed."
      );
    } catch {
      toast.error("Failed to update sync setting.");
    } finally {
      setSavingSync(false);
    }
  }

  async function handleClearLogs() {
    if (!confirm("Clear all sync history? This cannot be undone.")) return;
    setClearingLogs(true);
    try {
      await clearCompanionLogs();
      qc.invalidateQueries({ queryKey: ["sync-log"] });
      toast.success("Sync log history cleared.");
    } catch {
      toast.error("Failed to clear logs.");
    } finally {
      setClearingLogs(false);
    }
  }

  async function handleUnpair() {
    if (!confirm("Unpair companion device? You can re-pair at any time.")) return;
    try {
      await updateProfile({
        data: {
          companion_paired: false,
          companion_device_name: null,
          companion_last_sync: null,
          companion_device_id: null,
        },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Companion device unpaired.");
    } catch {
      toast.error("Failed to unpair device.");
    }
  }

  async function handleDeleteAccount() {
    if (confirmDeleteInput.trim().toLowerCase() !== "delete my account") {
      toast.error("Please type the exact confirmation phrase.");
      return;
    }
    setDeletingAccount(true);
    try {
      await deleteAccountData();
      qc.clear();
      await logout();
      nav({ to: "/login", replace: true });
      toast.success("Account deleted.");
    } catch {
      toast.error("Failed to delete account.");
      setDeletingAccount(false);
    }
  }

  function startEditTxn(txn: any) {
    setEditingTxnId(txn.id);
    setEditMerchant(txn.mapped_merchant_name || txn.raw_merchant_string || "");
    setEditCategory(txn.category || "other");
    setEditAmount(txn.amount ? String(txn.amount / 100) : "");
  }

  async function saveEditTxn(txn: any) {
    try {
      await submitParserCorrection({
        data: {
          transaction_id: txn.id,
          corrected_merchant: editMerchant,
          corrected_category: editCategory,
        },
      });
      await confirmTransaction({ id: txn.id });
      qc.invalidateQueries({ queryKey: ["txns"] });
      setEditingTxnId(null);
      toast.success("Transaction confirmed and updated.");
    } catch {
      toast.error("Failed to save.");
    }
  }

  async function dismissTxn(txnId: string) {
    try {
      await confirmTransaction({ id: txnId });
      qc.invalidateQueries({ queryKey: ["txns"] });
      toast.success("Transaction dismissed from review inbox.");
    } catch {
      toast.error("Failed to dismiss.");
    }
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48 rounded" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <Link
            to="/settings"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
          </Link>
          <h1 className="text-base font-black tracking-wider text-foreground uppercase truncate">
            Privacy Center
          </h1>
        </div>
        <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
      </div>

      <div className="mx-auto max-w-2xl pb-20 space-y-8">

        {/* Data minimization statement */}
        <Card className="border-primary/20 bg-primary/5 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary shrink-0" />
            <p className="text-[13px] font-bold text-foreground">How PocketBuddy handles your data</p>
          </div>
          <ul className="space-y-1.5 text-[11px] text-muted-foreground leading-relaxed list-none">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
              Notification text is <b className="text-foreground">masked before storage</b> — only the amount and merchant are kept.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
              Your raw notification bodies are <b className="text-foreground">never persisted</b> on any server.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
              All data is scoped to your account — no cross-user analytics.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
              You can delete everything below with one click.
            </li>
          </ul>
        </Card>

        {/* Sync Controls */}
        <section>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Sync Controls
          </p>
          <Card className="overflow-hidden">
            {/* Pause Sync */}
            <div className="flex items-center justify-between gap-4 p-4 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                {syncEnabled ? (
                  <Wifi className="h-4.5 w-4.5 text-green-500 shrink-0" />
                ) : (
                  <WifiOff className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">
                    {syncEnabled ? "Sync Active" : "Sync Paused"}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                    {syncEnabled
                      ? "Incoming notifications are being processed."
                      : "Notifications are logged but not processed into transactions."}
                  </p>
                </div>
              </div>
              <Switch
                id="toggle-sync"
                checked={syncEnabled}
                disabled={savingSync}
                onCheckedChange={toggleSync}
              />
            </div>

            {/* Clear Sync Logs */}
            <div className="flex items-center justify-between gap-4 p-4 border-b border-border">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">Clear Sync Log History</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Permanently delete all notification sync log entries from this account.
                </p>
              </div>
              <Button
                id="btn-clear-sync-logs"
                variant="outline"
                size="sm"
                disabled={clearingLogs}
                onClick={handleClearLogs}
                className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50"
              >
                {clearingLogs ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Clear
              </Button>
            </div>

            {/* Unpair Device */}
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">Unpair Companion Device</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  {profile?.companion_paired
                    ? `Currently paired: ${profile.companion_device_name || "Unknown device"}`
                    : "No companion device is currently paired."}
                </p>
              </div>
              {profile?.companion_paired ? (
                <Button
                  id="btn-unpair-device"
                  variant="outline"
                  size="sm"
                  onClick={handleUnpair}
                  className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Unpair
                </Button>
              ) : (
                <Badge variant="secondary" className="text-[10px] shrink-0">Not Paired</Badge>
              )}
            </div>
          </Card>
        </section>

        {/* Review Inbox */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              Review Inbox
            </p>
            {pendingTxns.length > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {pendingTxns.length} need review
              </Badge>
            )}
          </div>
          <Card className="overflow-hidden">
            {pendingTxns.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500/60" />
                <p className="text-[13px] font-semibold text-foreground">All clear</p>
                <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
                  No transactions are flagged for review. Low-confidence or incomplete transactions will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pendingTxns.map((txn: any) => (
                  <div key={txn.id} className="p-4 space-y-3">
                    {editingTxnId === txn.id ? (
                      <div className="space-y-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Editing</p>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                              Merchant
                            </label>
                            <input
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              value={editMerchant}
                              onChange={(e) => setEditMerchant(e.target.value)}
                              placeholder="Merchant name"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                              Category
                            </label>
                            <select
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c.charAt(0).toUpperCase() + c.slice(1)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-xs bg-primary text-primary-foreground"
                            onClick={() => saveEditTxn(txn)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Save & Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => setEditingTxnId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[13px] font-semibold text-foreground truncate">
                              {txn.mapped_merchant_name || txn.raw_merchant_string || "Unknown merchant"}
                            </p>
                            {txn.parsing_confidence && (
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1.5 py-0.5 ${
                                  txn.parsing_confidence === "low"
                                    ? "border-red-400/50 text-red-400"
                                    : "border-amber-400/50 text-amber-400"
                                }`}
                              >
                                {txn.parsing_confidence} confidence
                              </Badge>
                            )}
                            {txn.status === "incomplete" && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 border-muted-foreground/50 text-muted-foreground">
                                incomplete
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            ₹{txn.amount ? (txn.amount / 100).toFixed(0) : "—"} · {txn.category || "no category"} · {txn.created_at ? relativeTime(txn.created_at) : ""}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => startEditTxn(txn)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[10px] text-muted-foreground"
                            onClick={() => dismissTxn(txn.id)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* Danger Zone */}
        <section>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Danger Zone
          </p>
          <Card className="border-destructive/30 overflow-hidden">
            {!confirmDeleteOpen ? (
              <div className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Delete My Account & All Data</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                      Permanently removes your profile, all transactions, subscriptions, companion logs, and cart pool data. <b className="text-destructive">This is irreversible.</b>
                    </p>
                  </div>
                </div>
                <Button
                  id="btn-start-delete-account"
                  variant="outline"
                  size="sm"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50"
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Account
                </Button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="rounded-lg bg-destructive/10 border border-destructive/25 p-3">
                  <p className="text-[12px] text-destructive font-semibold leading-relaxed">
                    ⚠️ This will immediately and permanently delete everything tied to your account. Type <b>delete my account</b> below to confirm.
                  </p>
                </div>
                <input
                  id="input-confirm-delete"
                  autoFocus
                  className="w-full rounded-md border border-destructive/40 bg-background px-3 py-2.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-destructive"
                  placeholder="delete my account"
                  value={confirmDeleteInput}
                  onChange={(e) => setConfirmDeleteInput(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    id="btn-confirm-delete-account"
                    disabled={deletingAccount || confirmDeleteInput.trim().toLowerCase() !== "delete my account"}
                    className="flex-1 h-9 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold uppercase tracking-wider"
                    onClick={handleDeleteAccount}
                  >
                    {deletingAccount ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Permanently Delete Everything
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => {
                      setConfirmDeleteOpen(false);
                      setConfirmDeleteInput("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
