import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  FileCheck2,
  KeyRound,
  Lock,
  RefreshCw,
  Server,
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
  getCompanionSyncLogs,
  getDataConsents,
  getAccountAggregatorStatus,
  startAccountAggregatorSandboxConsent,
  simulateAccountAggregatorSandbox,
  clearCompanionLogs,
  deleteAccountData,
  confirmTransaction,
  submitParserCorrection,
} from "@/lib/api/db.functions";
import { relativeTime } from "@/lib/format";

export const Route = createLazyFileRoute("/_authenticated/privacy")({
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

type DataConsent = {
  id?: string;
  source?: string;
  status?: "active" | "paused" | "revoked" | string;
  provider?: string;
  provider_label?: string;
  purpose?: string;
  data_categories?: string[];
  device_name?: string;
  device_id?: string;
  raw_text_policy?: string;
  uses_dummy_data?: boolean;
  fetch_status?: string;
  fetched_records_count?: number;
  last_fetch_at?: string;
  granted_at?: string;
  updated_at?: string;
  last_sync_at?: string;
  revoked_at?: string;
};

type SyncLog = {
  id?: string;
  data_origin?: string;
  privacy_mode?: string;
  raw_payload_received?: boolean;
  parser_version?: string;
  source_confidence?: string;
  schema_version?: number;
  processing_status?: string;
  created_at?: string;
};

type AAEvent = {
  id?: string;
  event_type?: string;
  status?: string;
  message?: string;
  created_at?: string;
  consent_id?: string;
  metadata?: Record<string, unknown>;
};

type AASnapshot = {
  id?: string;
  record_count?: number;
  sandbox_dummy_data?: boolean;
  created_at?: string;
  records?: Array<{
    direction?: string;
    amount_paise?: number;
    merchant?: string;
    posted_at?: string;
    masked_account_ref?: string;
    transaction_reference?: string;
  }>;
};

type AAStatus = {
  status?: string;
  provider?: string;
  mode?: string;
  uses_dummy_data?: boolean;
  can_start_sandbox?: boolean;
  can_receive_callbacks?: boolean;
  message?: string;
  required_env?: string[];
  consents?: DataConsent[];
  events?: AAEvent[];
  snapshots?: AASnapshot[];
};

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
  const [aaBusyAction, setAaBusyAction] = useState<string | null>(null);

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

  const { data: consentData } = useQuery<DataConsent[]>({
    queryKey: ["data-consents", user?.id],
    enabled: !!user,
    queryFn: getDataConsents,
  });

  const { data: syncLogData } = useQuery<SyncLog[] | { logs?: SyncLog[] }>({
    queryKey: ["sync-log", user?.id],
    enabled: !!user,
    queryFn: getCompanionSyncLogs,
  });

  const { data: aaStatus, refetch: refetchAAStatus } = useQuery<AAStatus>({
    queryKey: ["aa-status", user?.id],
    enabled: !!user,
    queryFn: getAccountAggregatorStatus,
  });

  const txns: any[] = Array.isArray(allTxns) ? allTxns : [];
  const pendingTxns = txns.filter(
    (t) => t.needs_verification === true || t.status === "incomplete"
  );

  const syncEnabled = profile?.companion_sync_enabled !== false;
  const dataConsents = Array.isArray(consentData) ? consentData : [];
  const androidConsents = dataConsents.filter((c) => c.source === "android_connector");
  const activeAndroidConsent =
    androidConsents.find((c) => c.status === "active") ??
    androidConsents.find((c) => c.status === "paused") ??
    androidConsents[0];
  const syncLogs: SyncLog[] = Array.isArray(syncLogData) ? syncLogData : syncLogData?.logs ?? [];
  const latestSyncLog = syncLogs[0];
  const onDeviceLogCount = syncLogs.filter(
    (log) =>
      log.data_origin === "android_on_device" ||
      log.privacy_mode === "on_device_only" ||
      log.raw_payload_received === false
  ).length;
  const legacyRawLogCount = syncLogs.filter((log) => log.raw_payload_received === true).length;
  const sanitizedShare = syncLogs.length ? Math.round((onDeviceLogCount / syncLogs.length) * 100) : null;
  const connectorTrustLabel = activeAndroidConsent
    ? humanConsentStatus(activeAndroidConsent.status)
    : profile?.companion_paired
      ? syncEnabled
        ? "Linked"
        : "Paused"
      : "Not connected";
  const rawUploadLabel =
    latestSyncLog?.raw_payload_received === true
      ? "Legacy event seen"
      : latestSyncLog
        ? "Raw upload off"
        : "Waiting for first sync";
  const latestParserLabel =
    latestSyncLog?.parser_version ||
    (latestSyncLog?.data_origin === "android_on_device" ? "android-v2" : "Not observed yet");
  const aaConsents = aaStatus?.consents ?? dataConsents.filter((c) => c.source === "account_aggregator");
  const currentAAConsent =
    aaConsents.find((c) => c.status === "active") ??
    aaConsents.find((c) => c.status === "pending") ??
    aaConsents[0];
  const latestAAEvent = aaStatus?.events?.[0];
  const latestAASnapshot = aaStatus?.snapshots?.[0];
  const aaTrustStatus = humanAAStatus(aaStatus, currentAAConsent);

  async function toggleSync() {
    setSavingSync(true);
    try {
      await updateProfile({ data: { companion_sync_enabled: !syncEnabled } });
      await refetchProfile();
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["data-consents"] });
      toast.success(
        !syncEnabled
          ? "Instant sync resumed."
          : "Instant sync paused. New connector events are blocked before transaction parsing."
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
      qc.invalidateQueries({ queryKey: ["data-consents"] });
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
      qc.invalidateQueries({ queryKey: ["data-consents"] });
      toast.success("Companion device unpaired.");
    } catch {
      toast.error("Failed to unpair device.");
    }
  }

  async function refreshAA() {
    const previousBusyAction = aaBusyAction;
    if (!previousBusyAction) setAaBusyAction("refresh");
    try {
      await refetchAAStatus();
      qc.invalidateQueries({ queryKey: ["data-consents"] });
    } finally {
      if (!previousBusyAction) setAaBusyAction(null);
    }
  }

  async function handleStartAAConsent() {
    setAaBusyAction("start");
    try {
      const result = await startAccountAggregatorSandboxConsent({
        data: {
          purpose: "Verify bank transactions for PocketBuddy insights",
          requested_range_days: 30,
          fi_types: ["DEPOSIT"],
        },
      });
      await refreshAA();
      toast.success(result?.message || "AA sandbox consent started.");
    } catch (err: any) {
      toast.error(err.message || "Failed to start AA sandbox consent.");
    } finally {
      setAaBusyAction(null);
    }
  }

  async function handleAASandboxAction(action: "approve" | "reject" | "revoke" | "expire" | "fetch_success" | "fetch_failed") {
    if (!currentAAConsent?.id) {
      toast.error("No AA sandbox consent selected.");
      return;
    }
    setAaBusyAction(action);
    try {
      const result = await simulateAccountAggregatorSandbox({
        consentId: currentAAConsent.id,
        data: { action },
      });
      await refreshAA();
      toast.success(result?.message || "AA sandbox status updated.");
    } catch (err: any) {
      toast.error(err.message || "AA sandbox action failed.");
    } finally {
      setAaBusyAction(null);
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
      const amountFloat = parseFloat(editAmount);
      const correctedAmountPaise = isNaN(amountFloat) ? undefined : Math.round(amountFloat * 100);

      await submitParserCorrection({
        data: {
          transaction_id: txn.id,
          corrected_merchant: editMerchant,
          corrected_category: editCategory,
          corrected_amount: correctedAmountPaise,
        },
      });
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

      <div className="mx-auto max-w-3xl pb-20 space-y-8">

        {/* Trust Layer */}
        <section className="space-y-3">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            Trust Layer
          </p>
          <Card className="bg-surface-raised p-4 sm:p-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-[14px] font-semibold text-foreground">Privacy Trust Layer</p>
                  </div>
                  <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
                    PocketBuddy can track payments without bank login, OTP, MPIN, or raw notification upload from the new connector flow.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit border-primary/30 bg-background/60 text-[10px] text-primary">
                  {connectorTrustLabel}
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <TrustMetric
                  icon={<Smartphone className="h-4 w-4" />}
                  label="Android source"
                  value={profile?.companion_paired ? "Linked" : "Optional"}
                  detail={activeAndroidConsent?.device_name || profile?.companion_device_name || "No phone connected"}
                />
                <TrustMetric
                  icon={<Lock className="h-4 w-4" />}
                  label="Raw alert upload"
                  value={rawUploadLabel}
                  detail={
                    legacyRawLogCount
                      ? `${legacyRawLogCount} legacy event${legacyRawLogCount === 1 ? "" : "s"} in recent log`
                      : "New v2 events are structured before upload"
                  }
                />
                <TrustMetric
                  icon={<FileCheck2 className="h-4 w-4" />}
                  label="Parser proof"
                  value={latestParserLabel}
                  detail={sanitizedShare === null ? "No sync events yet" : `${sanitizedShare}% recent events marked sanitized`}
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-xl border border-border bg-background/70 p-3">
                  <p className="text-[12px] font-semibold text-foreground">What moves through the system</p>
                  <div className="mt-3 space-y-2">
                    <DataFlowRow
                      icon={<Smartphone className="h-3.5 w-3.5" />}
                      title="On your phone"
                      body="Supported UPI/SMS alerts are checked locally and converted into amount, merchant, direction, source app, and reference."
                    />
                    <DataFlowRow
                      icon={<Server className="h-3.5 w-3.5" />}
                      title="To PocketBuddy"
                      body="Only structured transaction fields, parser confidence, and a masked preview are stored for review and audit."
                    />
                    <DataFlowRow
                      icon={<KeyRound className="h-3.5 w-3.5" />}
                      title="Never requested"
                      body="Bank password, MPIN, OTP, full SMS body in v2, notification inbox access from the web app, or permission to initiate payments."
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background/70 p-3">
                  <p className="text-[12px] font-semibold text-foreground">Trusted sources</p>
                  <div className="mt-3 space-y-2">
                    <SourceRow
                      label="Instant UPI Sync"
                      status={connectorTrustLabel}
                      detail={profile?.companion_paired ? "Android connector, on-device parser" : "User-controlled optional connector"}
                    />
                    <SourceRow
                      label="Account Aggregator"
                      status={aaTrustStatus}
                      detail={aaStatus?.message || "AA sandbox status has not loaded yet."}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Data minimization statement */}
        <Card className="bg-surface-raised p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary shrink-0" />
            <p className="text-[13px] font-semibold text-foreground">How PocketBuddy handles your data</p>
          </div>
          <ul className="space-y-1.5 text-[11px] text-muted-foreground leading-relaxed list-none">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
              New connector events store <b className="text-foreground">structured fields and a masked preview</b>, not raw alert text.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
              Legacy raw payloads are classified separately and stored only as masked previews.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
              Consent, sync state, and parser confidence are visible here.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
              You can pause sync, unpair the connector, clear logs, or delete account data.
            </li>
          </ul>
        </Card>

        {/* Consent Ledger */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              Consent Ledger
            </p>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {androidConsents.length || 0} source{androidConsents.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <Card className="overflow-hidden">
            {androidConsents.length === 0 ? (
              <div className="p-5 text-center">
                <p className="text-[13px] font-semibold text-foreground">No connector consent recorded yet</p>
                <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                  Once the Android connector syncs for the first time, its purpose, data fields, and status will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {androidConsents.slice(0, 3).map((consent) => (
                  <ConsentLedgerRow key={consent.id} consent={consent} />
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* Account Aggregator Sandbox */}
        <section>
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Account Aggregator Sandbox
          </p>
          <AccountAggregatorSandboxCard
            aaStatus={aaStatus}
            consent={currentAAConsent}
            latestEvent={latestAAEvent}
            latestSnapshot={latestAASnapshot}
            busyAction={aaBusyAction}
            onStart={handleStartAAConsent}
            onAction={handleAASandboxAction}
            onRefresh={refreshAA}
          />
        </section>

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
                  <Wifi className="h-4.5 w-4.5 text-success shrink-0" />
                ) : (
                  <WifiOff className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">
                    {syncEnabled ? "Sync Active" : "Sync Paused"}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                    {syncEnabled
                      ? "Sanitized connector events can become transactions."
                      : "New connector events are blocked before parsing and stored as metadata-only audit entries."}
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
                <CheckCircle2 className="h-8 w-8 text-success/60" />
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
                              Amount (₹)
                            </label>
                            <input
                              type="number"
                              step="any"
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              placeholder="Amount in Rupees"
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
                    <p className="text-[13px] font-semibold text-foreground">Delete My Account & All Data</p>
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
                    This will immediately and permanently delete everything tied to your account. Type <b>delete my account</b> below to confirm.
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

function humanConsentStatus(status?: string) {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  if (status === "revoked") return "Revoked";
  if (status === "pending") return "Pending";
  if (status === "rejected") return "Rejected";
  if (status === "expired") return "Expired";
  return "Not connected";
}

type AASandboxAction = "approve" | "reject" | "revoke" | "expire" | "fetch_success" | "fetch_failed";

function AccountAggregatorSandboxCard({
  aaStatus,
  consent,
  latestEvent,
  latestSnapshot,
  busyAction,
  onStart,
  onAction,
  onRefresh,
}: {
  aaStatus?: AAStatus;
  consent?: DataConsent;
  latestEvent?: AAEvent;
  latestSnapshot?: AASnapshot;
  busyAction: string | null;
  onStart: () => void;
  onAction: (action: AASandboxAction) => void;
  onRefresh: () => void;
}) {
  const runtimeStatus = aaStatus?.status || "loading";
  const consentStatus = consent?.status || "none";
  const canUseLocalSandbox = Boolean(aaStatus?.can_start_sandbox);
  const canStart = canUseLocalSandbox && !["pending", "active"].includes(consentStatus);
  const canApprove = canUseLocalSandbox && consentStatus === "pending";
  const canFetch = canUseLocalSandbox && consentStatus === "active";
  const disabled = Boolean(busyAction) || runtimeStatus === "loading";

  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[14px] font-semibold text-foreground">AA verification sandbox</p>
              <Badge variant="outline" className={`text-[9px] ${aaStatusClass(runtimeStatus)}`}>
                {humanAARuntimeStatus(runtimeStatus)}
              </Badge>
              {aaStatus?.uses_dummy_data && (
                <Badge variant="secondary" className="text-[9px]">
                  Dummy data only
                </Badge>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
              {aaStatus?.message || "Loading AA sandbox status."}
            </p>
          </div>
          <Button variant="outline" size="sm" className="w-fit shrink-0" disabled={disabled} onClick={onRefresh}>
            <RefreshCw className={`h-3.5 w-3.5 ${busyAction === "refresh" ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <TrustMetric
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Consent"
            value={humanConsentStatus(consentStatus)}
            detail={consent?.purpose || "No AA consent requested yet"}
          />
          <TrustMetric
            icon={<FileCheck2 className="h-4 w-4" />}
            label="Fetch"
            value={consent?.fetch_status || "not started"}
            detail={
              consent?.last_fetch_at
                ? `Last fetch ${relativeTime(consent.last_fetch_at)}`
                : "Financial data fetch needs active consent"
            }
          />
          <TrustMetric
            icon={<Lock className="h-4 w-4" />}
            label="Live bank data"
            value={aaStatus?.uses_dummy_data ? "Not used" : "Disabled"}
            detail="Sandbox records never replace Android/manual transactions"
          />
        </div>

        {aaStatus?.required_env?.length ? (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="text-[12px] font-semibold text-foreground">Missing configuration</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {aaStatus.required_env.map((key) => (
                <span key={key} className="rounded-full border border-warning/30 bg-background/70 px-2 py-1 text-[10px] text-warning">
                  {key}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {latestEvent && (
          <div className="mt-4 rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] font-semibold text-foreground">
                Latest event: {formatAAEvent(latestEvent.event_type)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {latestEvent.created_at ? relativeTime(latestEvent.created_at) : ""}
              </p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {latestEvent.message || "No event message."}
            </p>
          </div>
        )}

        {latestSnapshot?.records?.length ? (
          <div className="mt-4 rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-foreground">
                Latest sandbox fetch
              </p>
              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                {latestSnapshot.record_count || latestSnapshot.records.length} dummy records
              </Badge>
            </div>
            <div className="mt-2 space-y-1.5">
              {latestSnapshot.records.slice(0, 3).map((record, index) => (
                <div key={`${record.transaction_reference || index}`} className="flex items-center justify-between gap-3 rounded-md bg-background/70 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-foreground">
                      {record.merchant || "Sandbox transaction"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {record.direction || "DEBIT"} · {record.masked_account_ref || "masked account"}
                    </p>
                  </div>
                  <p className="shrink-0 text-[12px] font-semibold text-foreground">
                    {formatPaise(record.amount_paise)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {!aaStatus?.can_start_sandbox && (
            <Button disabled variant="outline" size="sm" className="text-xs">
              Enable AA sandbox in env
            </Button>
          )}
          {canStart && (
            <Button disabled={disabled} size="sm" className="text-xs" onClick={onStart}>
              {busyAction === "start" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Start sandbox consent
            </Button>
          )}
          {canApprove && (
            <>
              <Button disabled={disabled} size="sm" className="text-xs" onClick={() => onAction("approve")}>
                Approve sandbox consent
              </Button>
              <Button disabled={disabled} variant="outline" size="sm" className="text-xs" onClick={() => onAction("reject")}>
                Reject
              </Button>
            </>
          )}
          {canFetch && (
            <>
              <Button disabled={disabled} size="sm" className="text-xs" onClick={() => onAction("fetch_success")}>
                {busyAction === "fetch_success" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileCheck2 className="h-3.5 w-3.5" />}
                Fetch sandbox data
              </Button>
              <Button disabled={disabled} variant="outline" size="sm" className="text-xs" onClick={() => onAction("revoke")}>
                Revoke
              </Button>
            </>
          )}
        </div>

        {canUseLocalSandbox && consent?.id && (
          <details className="mt-3 rounded-lg border border-border bg-surface p-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">
              Sandbox edge-case controls
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={disabled || consentStatus === "revoked"} variant="outline" size="sm" className="text-xs" onClick={() => onAction("expire")}>
                Expire consent
              </Button>
              <Button disabled={disabled || consentStatus !== "active"} variant="outline" size="sm" className="text-xs" onClick={() => onAction("fetch_failed")}>
                Simulate fetch failure
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              These controls are local sandbox-only. They help demo rejected, expired, revoked, and failed-fetch states without touching real bank data.
            </p>
          </details>
        )}
      </div>
    </Card>
  );
}

function humanAAStatus(aaStatus?: AAStatus, consent?: DataConsent) {
  if (consent?.status === "active") return "Active";
  if (consent?.status === "pending") return "Pending";
  if (consent?.status === "revoked") return "Revoked";
  if (consent?.status === "rejected") return "Rejected";
  if (consent?.status === "expired") return "Expired";
  if (aaStatus?.status === "sandbox_ready") return "Sandbox ready";
  if (aaStatus?.status === "misconfigured") return "Needs config";
  if (aaStatus?.status === "provider_configured") return "Provider configured";
  return "Not connected";
}

function humanAARuntimeStatus(status?: string) {
  if (status === "sandbox_ready") return "Sandbox ready";
  if (status === "misconfigured") return "Needs config";
  if (status === "provider_configured") return "Provider configured";
  if (status === "not_configured") return "Disabled";
  return "Loading";
}

function aaStatusClass(status?: string) {
  if (status === "sandbox_ready" || status === "provider_configured") return "border-success/35 text-success";
  if (status === "misconfigured") return "border-warning/40 text-warning";
  return "text-muted-foreground";
}

function formatAAEvent(value?: string) {
  return value ? value.replace(/_/g, " ") : "event";
}

function formatPaise(value?: number) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(value) / 100))}`;
}

function TrustMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]">{label}</span>
      </div>
      <p className="mt-2 truncate text-[13px] font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{detail}</p>
    </div>
  );
}

function DataFlowRow({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-2 rounded-lg bg-surface/70 p-2.5">
      <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function SourceRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail: string;
}) {
  const active = status === "Active" || status === "Linked";
  const paused = status === "Paused";

  return (
    <div className="rounded-lg bg-surface/70 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-foreground">{label}</p>
        <Badge
          variant="outline"
          className={`shrink-0 text-[9px] ${
            active
              ? "border-success/35 text-success"
              : paused
                ? "border-warning/40 text-warning"
                : "text-muted-foreground"
          }`}
        >
          {status}
        </Badge>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function ConsentLedgerRow({ consent }: { consent: DataConsent }) {
  const categories = consent.data_categories?.length
    ? consent.data_categories.map((category) => category.replace(/_/g, " ")).join(", ")
    : "Structured transaction fields";
  const status = humanConsentStatus(consent.status);
  const lastActivity = consent.revoked_at || consent.last_sync_at || consent.updated_at || consent.granted_at;

  return (
    <div className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground">
              {consent.device_name || "PocketBuddy Android Connector"}
            </p>
            <Badge variant="outline" className="text-[9px]">
              {status}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Purpose: instant payment tracking. Fields: {categories}.
          </p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Raw text policy
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-foreground">
            {consent.raw_text_policy === "not_required_for_v2" ? "Not required for v2" : consent.raw_text_policy || "Masked only"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border bg-surface px-2 py-1">
          Source: Android connector
        </span>
        <span className="rounded-full border border-border bg-surface px-2 py-1">
          {lastActivity ? `Last activity ${relativeTime(lastActivity)}` : "No activity yet"}
        </span>
      </div>
    </div>
  );
}
