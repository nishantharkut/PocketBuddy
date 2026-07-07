import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { BankConsentDialog, type BankConsentPayload } from "@/components/privacy/BankConsentDialog";
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
  Landmark,
  RefreshCw,
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
  financial_institution_code?: string;
  financial_institution_name?: string;
  financial_institution_short_name?: string;
  trust_framework?: string;
  purpose?: string;
  data_categories?: string[];
  selected_accounts?: Array<{
    account_ref?: string;
    masked_account_ref?: string;
    account_type?: string;
    fi_type?: string;
    nickname?: string;
  }>;
  account_count?: number;
  masked_account_refs?: string[];
  device_name?: string;
  device_id?: string;
  raw_text_policy?: string;
  uses_sandbox_data?: boolean;
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
  consent_id?: string;
  record_count?: number;
  sandbox_data?: boolean;
  accounts?: Array<{
    account_ref?: string;
    masked_account_ref?: string;
    account_type?: string;
    fi_type?: string;
    nickname?: string;
  }>;
  account_count?: number;
  created_at?: string;
  records?: Array<{
    direction?: string;
    amount_paise?: number;
    merchant?: string;
    posted_at?: string;
    masked_account_ref?: string;
    account_ref?: string;
    account_type?: string;
    transaction_reference?: string;
  }>;
};

type AAStatus = {
  status?: string;
  provider?: string;
  mode?: string;
  uses_sandbox_data?: boolean;
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
  const [bankConsentDialogOpen, setBankConsentDialogOpen] = useState(false);

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
  const latestSyncAt = profile?.companion_last_sync ?? latestSyncLog?.created_at;
  const legacyRawLogCount = syncLogs.filter((log) => log.raw_payload_received === true).length;
  const rawUploadLabel =
    latestSyncLog?.raw_payload_received === true
      ? "Legacy event seen"
      : latestSyncLog
        ? "Raw upload off"
        : "Waiting for first sync";
  const aaConsents = aaStatus?.consents ?? dataConsents.filter((c) => c.source === "account_aggregator");
  const activeAAConsent = aaConsents.find((c) => c.status === "active");
  const pendingAAConsent = aaConsents.find((c) => c.status === "pending");
  const currentAAConsent = activeAAConsent ?? pendingAAConsent;
  const aaEvents = aaStatus?.events ?? [];
  const aaSnapshots = aaStatus?.snapshots ?? [];
  const aaTrustStatus = humanAAStatus(aaStatus, currentAAConsent);
  const bankConsentRuntimeIsProvider = false;
  const bankConsentPathDescription = "AA-style consent sandbox for controlled read-only access demos.";
  const bankConsentConnectMessage = "Ready to start the local consent sandbox.";
  const bankConsentFallbackMessage = "Read-only consent sandbox. No bank password or OTP is collected.";
  const bankConsentCanStart = !currentAAConsent;
  const bankConsentStartLabel = "Start sandbox";
  const bankConsentPrimaryAction =
    currentAAConsent?.status === "active"
      ? "View sandbox"
      : currentAAConsent?.status === "pending"
        ? "Review consent"
        : bankConsentCanStart
          ? bankConsentStartLabel
          : bankConsentStartLabel;

  function focusBankConsentCard() {
    if (typeof document === "undefined") return;
    document.getElementById("bank-consent-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

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

  async function handleStartAAConsent(payload?: BankConsentPayload) {
    setAaBusyAction("start");
    try {
      await startAccountAggregatorSandboxConsent({
        data: {
          purpose: "Preview the consent sandbox for PocketBuddy insights",
          requested_range_days: payload?.requestedRangeDays ?? 30,
          fi_types: ["DEPOSIT"],
          aa_handle: payload?.aaHandle || null,
          bank_code: payload?.bankCode,
          bank_name: payload?.bankName,
          bank_short_name: payload?.bankShortName,
          selected_accounts: payload?.selectedAccounts ?? [],
        },
      });
      await refreshAA();
      setBankConsentDialogOpen(false);
      toast.success("Sandbox consent started.");
      focusBankConsentCard();
    } catch (err: any) {
      toast.error(err.message || "Failed to start consent sandbox.");
    } finally {
      setAaBusyAction(null);
    }
  }

  async function handleAASandboxAction(action: "approve" | "reject" | "revoke" | "expire" | "fetch_success" | "fetch_failed") {
    if (!currentAAConsent?.id) {
      toast.error("No sandbox consent selected.");
      return;
    }
    if (
      action === "revoke" &&
      !confirm("Revoke sandbox consent? PocketBuddy will stop future sandbox fetches and delete fetched sandbox records tied to this consent.")
    ) {
      return;
    }
    setAaBusyAction(action);
    try {
      await simulateAccountAggregatorSandbox({
        consentId: currentAAConsent.id,
        data: { action },
      });
      await refreshAA();
      toast.success(bankConsentActionToast(action));
    } catch (err: any) {
      toast.error(err.message || "Consent sandbox action failed.");
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
            Data Control Center
          </h1>
        </div>
        <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
      </div>

      <div className="mx-auto max-w-3xl pb-20 space-y-8">

        {/* Data Control Center */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              Privacy Controls
            </p>
            <Badge
              variant="outline"
              className={`w-fit text-[10px] ${
                syncEnabled ? "border-success/35 text-success" : "border-warning/40 text-warning"
              }`}
            >
              {syncEnabled ? "Sync controlled" : "Sync paused"}
            </Badge>
          </div>

          <Card className="bg-surface-raised p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-foreground">
                    Your data sources stay visible and controllable.
                  </p>
                  <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
                    Android sync is the primary live tracking path. The consent sandbox is read-only,
                    revocable, and used to preview a regulated AA-style control flow.
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  size="sm"
                  className="w-full shrink-0 text-xs sm:w-fit"
                  onClick={() => nav({ to: "/companion" })}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Manage sync
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full shrink-0 text-xs sm:w-fit"
                  disabled={Boolean(aaBusyAction) || (!bankConsentCanStart && !currentAAConsent)}
                  onClick={bankConsentCanStart ? () => setBankConsentDialogOpen(true) : focusBankConsentCard}
                >
                  {aaBusyAction === "start" ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  {bankConsentPrimaryAction}
                </Button>
              </div>
            </div>

            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-background/70">
              <SourceRow
                label="Phone auto-sync"
                status={profile?.companion_paired ? (syncEnabled ? "Active" : "Paused") : "Optional"}
                detail={
                  profile?.companion_paired
                    ? `${profile.companion_device_name || activeAndroidConsent?.device_name || "Android connector"} · ${syncEnabled ? "new structured events allowed" : "paused before parsing"}`
                    : "Pair only if you want instant on-device UPI alert parsing."
                }
              />
              <SourceRow
                label="Consent sandbox"
                status={aaTrustStatus}
                detail={
                  currentAAConsent
                    ? `${currentAAConsent.financial_institution_name || currentAAConsent.provider_label || "Connected institution"} - ${currentAAConsent.fetch_status || "fetch not started"}`
                    : bankConsentCanStart
                      ? bankConsentConnectMessage
                      : "Not connected."
                }
              />
              <SourceRow
                label="Raw alert text"
                status={rawUploadLabel}
                detail={
                  legacyRawLogCount
                    ? `${legacyRawLogCount} older masked legacy event${legacyRawLogCount === 1 ? "" : "s"} in recent sync history.`
                    : "Current connector events store structured fields and a masked preview."
                }
              />
            </div>
          </Card>
        </section>

        {/* Data Sources */}
        <section className="space-y-3">
          <div className="max-w-3xl">
            <div>
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
                Data Sources
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Android sync is the live tracking path. The consent sandbox is a separate, read-only
                control-flow demo; revoked sandbox consent stays only in consent activity.
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <DataSourceStatusCard
              icon={<Landmark className="h-4 w-4" />}
              title="Consent sandbox"
              status={currentAAConsent ? humanConsentStatus(currentAAConsent.status) : bankConsentCanStart ? "Ready" : "Off"}
              tone={
                currentAAConsent?.status === "active"
                  ? "success"
                  : currentAAConsent?.status === "pending"
                    ? "warning"
                    : bankConsentCanStart
                      ? "primary"
                      : "muted"
              }
              description={bankConsentPathDescription}
              detail={
                currentAAConsent
                  ? `${currentAAConsent.financial_institution_name || currentAAConsent.provider_label || "Connected institution"} - ${currentAAConsent.fetch_status || "fetch not started"}`
                  : aaConsents.some((consent) => ["revoked", "expired", "rejected"].includes(consent.status || ""))
                    ? "No active sandbox consent. Past revoked or expired requests remain visible in activity only."
                    : bankConsentRuntimeIsProvider
                      ? "No active consent connected."
                      : "No active consent sandbox connected."
              }
              actionLabel={bankConsentCanStart ? bankConsentStartLabel : currentAAConsent ? "Review" : "Unavailable"}
              onAction={bankConsentCanStart ? () => setBankConsentDialogOpen(true) : focusBankConsentCard}
              actionDisabled={!bankConsentCanStart && !currentAAConsent}
              points={["Read-only demo", "Revocable", "No live bank data"]}
              className="order-2"
            />

            <DataSourceStatusCard
              icon={<Smartphone className="h-4 w-4" />}
              title="Phone auto-sync"
              status={profile?.companion_paired ? (syncEnabled ? "Active" : "Paused") : "Off"}
              tone={profile?.companion_paired ? (syncEnabled ? "success" : "warning") : "muted"}
              description="Primary live path for passive expense tracking from supported Android payment alerts."
              detail={
                profile?.companion_paired
                  ? `${profile.companion_device_name || activeAndroidConsent?.device_name || "Android connector"} · ${
                      syncEnabled ? "new structured events allowed" : "paused before parsing"
                    }`
                  : "No phone connected. Pair only if you want on-device alert parsing."
              }
              actionLabel="Manage sync"
              onAction={() => nav({ to: "/companion" })}
              points={["On-device parsing", "Structured fields", "Pause anytime"]}
              className="order-1"
            />
          </div>
        </section>

        {/* Data Receipt */}
        <section className="space-y-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
              Data Receipt
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              A simple view of what PocketBuddy stores for the active trust layer.
            </p>
          </div>
          <Card className="bg-surface-raised p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <ReceiptBlock
                icon={<Landmark className="h-4 w-4" />}
                title="Consent sandbox"
                status={currentAAConsent ? humanConsentStatus(currentAAConsent.status) : "Not connected"}
                rows={[
                  ["Purpose", currentAAConsent?.purpose || "Preview the consent-flow sandbox"],
                  ["Accounts", currentAAConsent?.account_count ? `${currentAAConsent.account_count} masked account${currentAAConsent.account_count === 1 ? "" : "s"}` : "None selected"],
                  ["Fetched records", currentAAConsent?.fetched_records_count ? `${currentAAConsent.fetched_records_count}` : "No fetch yet"],
                  ["Control", currentAAConsent?.status === "active" ? "Can revoke anytime" : bankConsentCanStart ? bankConsentStartLabel : "Unavailable"],
                ]}
              />
              <ReceiptBlock
                icon={<Smartphone className="h-4 w-4" />}
                title="Phone auto-sync"
                status={profile?.companion_paired ? (syncEnabled ? "Active" : "Paused") : "Optional"}
                rows={[
                  ["Uploads", "Amount, merchant, direction, reference, masked preview"],
                  ["Raw alert text", rawUploadLabel],
                  ["Last sync", latestSyncAt ? relativeTime(latestSyncAt) : "Never"],
                  ["Control", profile?.companion_paired ? "Pause or unpair anytime" : "Pair only if needed"],
                ]}
              />
            </div>
          </Card>
        </section>

        {/* Consent Sandbox */}
        <section id="bank-consent-section" className="scroll-mt-20">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Consent Sandbox
          </p>
          <AccountAggregatorSandboxCard
            aaStatus={aaStatus}
            consent={currentAAConsent}
            events={aaEvents}
            snapshots={aaSnapshots}
            busyAction={aaBusyAction}
            onStart={() => setBankConsentDialogOpen(true)}
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
            {/* Bank Consent Controls */}
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Landmark className="mt-0.5 h-4.5 w-4.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-semibold text-foreground">Consent sandbox</p>
                    <Badge variant="outline" className={`text-[9px] ${consentStatusClass(currentAAConsent?.status)}`}>
                      {aaTrustStatus}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {currentAAConsent
                      ? `${currentAAConsent.financial_institution_name || currentAAConsent.provider_label || "Connected institution"} - ${currentAAConsent.fetch_status || "fetch not started"}`
                      : bankConsentFallbackMessage}
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                {currentAAConsent?.status === "active" ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 text-xs sm:flex-none"
                    disabled={Boolean(aaBusyAction)}
                      onClick={() => handleAASandboxAction("fetch_success")}
                    >
                      {aaBusyAction === "fetch_success" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileCheck2 className="h-3.5 w-3.5" />}
                      Refresh sandbox data
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 border-destructive/30 text-xs text-destructive hover:bg-destructive/10 sm:flex-none"
                      disabled={Boolean(aaBusyAction)}
                      onClick={() => handleAASandboxAction("revoke")}
                    >
                      Revoke
                    </Button>
                  </>
                ) : currentAAConsent?.status === "pending" ? (
                  <>
                    <Button
                      size="sm"
                      className="h-8 flex-1 text-xs sm:flex-none"
                      disabled={Boolean(aaBusyAction)}
                      onClick={() => handleAASandboxAction("approve")}
                    >
                      Approve consent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 text-xs sm:flex-none"
                      disabled={Boolean(aaBusyAction)}
                      onClick={() => handleAASandboxAction("reject")}
                    >
                      Reject
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 w-full text-xs sm:w-auto"
                    variant={bankConsentCanStart ? "default" : "outline"}
                    disabled={Boolean(aaBusyAction) || !bankConsentCanStart}
                    onClick={() => setBankConsentDialogOpen(true)}
                  >
                    {bankConsentStartLabel}
                  </Button>
                )}
              </div>
            </div>

            {/* Pause Phone Sync */}
            <div className="flex items-center justify-between gap-4 p-4 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                {syncEnabled ? (
                  <Wifi className="h-4.5 w-4.5 text-success shrink-0" />
                ) : (
                  <WifiOff className="h-4.5 w-4.5 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">
                    {syncEnabled ? "Phone sync active" : "Phone sync paused"}
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
                    <p className="text-[13px] font-semibold text-foreground">Delete My Account</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                      Permanently removes your profile, transactions, subscriptions, consent records, companion logs, and pools you hosted. <b className="text-destructive">This is irreversible.</b>
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
                    This will immediately and permanently delete your account-owned PocketBuddy records. Type <b>delete my account</b> below to confirm.
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
                    Permanently Delete Account
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

      <BankConsentDialog
        open={bankConsentDialogOpen}
        onOpenChange={setBankConsentDialogOpen}
        onConfirm={handleStartAAConsent}
        busy={aaBusyAction === "start"}
        existingBankName={currentAAConsent?.financial_institution_name || currentAAConsent?.provider_label}
        existingConsentStatus={currentAAConsent?.status}
      />
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

function consentStatusClass(status?: string) {
  if (status === "active") return "border-success/35 text-success";
  if (status === "pending") return "border-warning/40 text-warning";
  if (status === "revoked" || status === "rejected" || status === "expired") return "border-destructive/30 text-destructive";
  return "text-muted-foreground";
}

function ConsentDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 p-3 sm:grid-cols-[140px_1fr] sm:gap-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="break-words text-[12px] font-semibold leading-snug text-foreground">{value}</p>
    </div>
  );
}

type AASandboxAction = "approve" | "reject" | "revoke" | "expire" | "fetch_success" | "fetch_failed";

function AccountAggregatorSandboxCard({
  aaStatus,
  consent,
  events,
  snapshots,
  busyAction,
  onStart,
  onAction,
  onRefresh,
}: {
  aaStatus?: AAStatus;
  consent?: DataConsent;
  events: AAEvent[];
  snapshots: AASnapshot[];
  busyAction: string | null;
  onStart: () => void;
  onAction: (action: AASandboxAction) => void;
  onRefresh: () => void;
}) {
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const runtimeStatus = aaStatus?.status || "sandbox_ready";
  const consentStatus = consent?.status || "none";
  const bankConsentStartLabel = "Start sandbox";
  const canUseLocalSandbox = true;
  const canStart = canUseLocalSandbox && !["pending", "active"].includes(consentStatus);
  const canApprove = canUseLocalSandbox && consentStatus === "pending";
  const canFetch = canUseLocalSandbox && consentStatus === "active";
  const disabled = Boolean(busyAction);
  const hasActiveConsent = consentStatus === "active";
  const consentSnapshots = consent?.id ? snapshots.filter((snapshot) => snapshot.consent_id === consent.id) : [];
  const latestSnapshot = hasActiveConsent ? consentSnapshots[0] : undefined;
  const records = hasActiveConsent ? latestSnapshot?.records ?? [] : [];
  const visibleRecords = showAllRecords ? records : records.slice(0, 4);
  const visibleEvents = showAllActivity ? events : events.slice(0, 4);
  const fetchedRecordCount = hasActiveConsent ? latestSnapshot?.record_count || records.length || consent?.fetched_records_count || 0 : 0;
  const institutionName = consent?.financial_institution_name || consent?.provider_label || "No sandbox institution selected";
  const institutionShortName = consent?.financial_institution_short_name || consent?.financial_institution_code || "AA";
  const selectedAccounts = consent?.selected_accounts?.length ? consent.selected_accounts : latestSnapshot?.accounts ?? [];
  const maskedAccountRefs =
    selectedAccounts
      .map((account) => account.masked_account_ref)
      .filter(Boolean)
      .join(", ") ||
    consent?.masked_account_refs?.join(", ") ||
    records.find((record) => record.masked_account_ref)?.masked_account_ref ||
    "Masked account";
  const accountCount = selectedAccounts.length || consent?.account_count || latestSnapshot?.account_count || 0;
  const accountSummary = accountCount > 1 ? `${accountCount} selected accounts` : maskedAccountRefs;
  const scope = consent?.data_categories?.length
    ? consent.data_categories.map((category) => category.replace(/_/g, " ")).join(", ")
    : "Deposit account transactions";
  const lastActivity = consent?.last_fetch_at || events[0]?.created_at || consent?.updated_at || consent?.granted_at;

  return (
    <Card className="overflow-hidden bg-surface-raised">
      <div className="border-b border-border p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-semibold text-foreground">Consent sandbox</p>
                <Badge variant="outline" className={`text-[9px] ${consentStatusClass(consentStatus)}`}>
                  {humanConsentStatus(consentStatus)}
                </Badge>
                <Badge variant="outline" className={`text-[9px] ${aaStatusClass(runtimeStatus)}`}>
                  {humanAARuntimeStatus(runtimeStatus)}
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
                {bankConsentMessage(runtimeStatus, consentStatus)}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 w-full shrink-0 text-xs sm:w-fit" disabled={disabled} onClick={onRefresh}>
            <RefreshCw className={`h-3.5 w-3.5 ${busyAction === "refresh" ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-background/70">
          <div className="flex items-center justify-between gap-3 border-b border-border p-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-foreground">{institutionName}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {consent ? accountSummary : "Start the sandbox to preview consent controls."}
              </p>
            </div>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-[11px] font-bold text-primary">
              {institutionShortName.slice(0, 3).toUpperCase()}
            </div>
          </div>
          <div className="divide-y divide-border">
            <ConsentDetailRow label="Purpose" value={consent?.purpose || "Sandbox consent-flow preview"} />
            <ConsentDetailRow label="Accounts" value={consent ? maskedAccountRefs : "No account selected"} />
            <ConsentDetailRow label="Scope" value={scope} />
            <ConsentDetailRow label="Last activity" value={lastActivity ? relativeTime(lastActivity) : "No activity yet"} />
          </div>
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

        <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-border bg-background/70 p-3">
          {canStart && (
            <Button disabled={disabled} size="sm" className="text-xs" onClick={onStart}>
              {busyAction === "start" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {bankConsentStartLabel}
            </Button>
          )}
          {canApprove && (
            <>
              <Button disabled={disabled} size="sm" className="text-xs" onClick={() => onAction("approve")}>
                Approve consent
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
                Refresh sandbox data
              </Button>
              <Button disabled={disabled} variant="outline" size="sm" className="border-destructive/30 text-xs text-destructive hover:bg-destructive/10" onClick={() => onAction("revoke")}>
                Revoke
              </Button>
            </>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-background/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  Recent sandbox records
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Preview from the latest local sandbox fetch. No live bank data is used.
                </p>
              </div>
              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                {fetchedRecordCount} records
              </Badge>
            </div>

            {records.length ? (
              <div className={`mt-3 space-y-1.5 ${showAllRecords ? "max-h-72 overflow-y-auto pr-1" : ""}`}>
                {visibleRecords.map((record, index) => (
                  <div key={`${record.transaction_reference || index}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-foreground">
                        {record.merchant || "Sandbox transaction"}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {record.direction || "DEBIT"} · {record.masked_account_ref || "masked account"}
                      </p>
                    </div>
                    <p className="shrink-0 text-[12px] font-semibold text-foreground">
                      {formatPaise(record.amount_paise)}
                    </p>
                  </div>
                ))}
                {records.length > 4 && (
                  <Button variant="ghost" size="sm" className="h-8 w-full text-xs" onClick={() => setShowAllRecords((open) => !open)}>
                    {showAllRecords ? "Show less" : `View ${records.length - 4} more`}
                  </Button>
                )}
              </div>
            ) : (
              <EmptySourceState
                text={
                  consentStatus === "active"
                    ? "No sandbox records generated yet. Use Refresh sandbox data to preview the review flow."
                    : "Sandbox records appear here only after active consent and a sandbox fetch."
                }
              />
            )}
          </div>

          <div className="rounded-xl border border-border bg-background/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold text-foreground">Consent activity</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Requests, approvals, fetches and revocations stay visible.
                </p>
              </div>
              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                {events.length} events
              </Badge>
            </div>

            {events.length ? (
              <div className={`mt-3 space-y-2 ${showAllActivity ? "max-h-72 overflow-y-auto pr-1" : ""}`}>
                {visibleEvents.map((event, index) => (
                  <div key={event.id || `${event.event_type}-${index}`} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-[12px] font-semibold text-foreground">{formatAAEvent(event.event_type)}</p>
                      <p className="shrink-0 text-[10px] text-muted-foreground">
                        {event.created_at ? relativeTime(event.created_at) : ""}
                      </p>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {bankConsentEventMessage(event.event_type)}
                    </p>
                  </div>
                ))}
                {events.length > 4 && (
                  <Button variant="ghost" size="sm" className="h-8 w-full text-xs" onClick={() => setShowAllActivity((open) => !open)}>
                    {showAllActivity ? "Show less" : `View ${events.length - 4} more`}
                  </Button>
                )}
              </div>
            ) : (
              <EmptySourceState text="No consent sandbox activity yet." />
            )}
          </div>
        </div>

        {canUseLocalSandbox && consent?.id && (
          <details className="mt-3 rounded-lg border border-border bg-surface p-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">
              Advanced consent states
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={disabled || consentStatus === "revoked"} variant="outline" size="sm" className="text-xs" onClick={() => onAction("expire")}>
                Expire consent
              </Button>
              <Button disabled={disabled || consentStatus !== "active"} variant="outline" size="sm" className="text-xs" onClick={() => onAction("fetch_failed")}>
                Mark fetch failed
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Use only when validating expiry and failure handling for this consent flow.
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
  if (aaStatus?.status === "sandbox_ready") return "Ready";
  if (aaStatus?.status === "misconfigured") return "Local sandbox";
  return "Not connected";
}

function humanAARuntimeStatus(status?: string) {
  if (status === "sandbox_ready") return "Ready";
  if (status === "misconfigured") return "Local sandbox";
  if (status === "not_configured") return "Local sandbox";
  return "Loading";
}

function bankConsentMessage(runtimeStatus?: string, consentStatus?: string) {
  if (runtimeStatus === "not_configured") {
    return "Start the local consent sandbox. It uses demo accounts only and does not connect to a live bank.";
  }
  if (runtimeStatus === "misconfigured") {
    return "Start the local consent sandbox. Provider credentials are not required for this demo flow.";
  }
  if (consentStatus === "active") {
    return "Consent is active. You can fetch consented records, revoke access, or review the activity here.";
  }
  if (consentStatus === "pending") {
    return "Consent is waiting for approval. Nothing is fetched until approval is complete.";
  }
  if (consentStatus === "revoked") {
    return "Consent was revoked. PocketBuddy will not fetch new records from this source.";
  }
  if (consentStatus === "rejected") {
    return "Consent was rejected. You can start a new request when needed.";
  }
  if (consentStatus === "expired") {
    return "Consent expired. Start a new request to continue consent-based tracking.";
  }
  if (runtimeStatus === "sandbox_ready") {
    return "Start the local consent sandbox.";
  }
  return "Checking consent sandbox status.";
}

function bankConsentActionToast(action: AASandboxAction) {
  if (action === "approve") return "Consent approved.";
  if (action === "reject") return "Consent rejected.";
  if (action === "revoke") return "Consent revoked and fetched records deleted.";
  if (action === "expire") return "Consent expired.";
  if (action === "fetch_success") return "Consent data fetched.";
  if (action === "fetch_failed") return "Consent fetch marked failed.";
  return "Consent sandbox updated.";
}

function bankConsentEventMessage(eventType?: string) {
  if (eventType === "consent_reused") return "An existing active consent was reused.";
  if (eventType === "consent_requested") return "A consent request was created and is waiting for approval.";
  if (eventType === "consent_approved") return "Consent was approved and is ready for a data fetch.";
  if (eventType === "consent_rejected") return "Consent was rejected.";
  if (eventType === "consent_revoked") return "Consent was revoked.";
  if (eventType === "consent_expired") return "Consent expired.";
  if (eventType === "fi_fetch_success" || eventType === "fi_fetch_completed") return "Consented records were fetched and kept separate from your live ledger.";
  if (eventType === "fi_fetch_failed") return "The consented data fetch failed and no records were imported.";
  if (eventType === "consent_callback") return "A consent callback was received.";
  if (eventType === "fi_callback") return "A financial information callback was received.";
  if (eventType === "orphan_consent_callback" || eventType === "orphan_fi_callback") return "A callback could not be linked to an active consent.";
  return "Consent sandbox activity was updated.";
}

function aaStatusClass(status?: string) {
  if (status === "sandbox_ready") return "border-success/35 text-success";
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

function ReceiptBlock({
  icon,
  title,
  status,
  rows,
}: {
  icon: ReactNode;
  title: string;
  status: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <p className="truncate text-[13px] font-semibold text-foreground">{title}</p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[9px]">
          {status}
        </Badge>
      </div>
      <div className="mt-3 divide-y divide-border/70">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <p className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </p>
            <p className="min-w-0 text-right text-[11px] leading-snug text-foreground">{value}</p>
          </div>
        ))}
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
  const active = ["Active", "Linked", "Visible", "Armed"].includes(status);
  const paused = status === "Paused";

  return (
    <div className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
      <div className="shrink-0">
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
    </div>
  );
}

function DataSourceStatusCard({
  icon,
  title,
  status,
  tone,
  description,
  detail,
  actionLabel,
  onAction,
  actionDisabled,
  points,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  status: string;
  tone: "success" | "warning" | "primary" | "muted";
  description: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  points: string[];
  className?: string;
}) {
  return (
    <Card className={`bg-surface-raised p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-background text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold text-foreground">{title}</p>
              <Badge variant="outline" className={`shrink-0 whitespace-nowrap text-[9px] ${dataSourceToneClass(tone)}`}>
                {status}
              </Badge>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 min-w-[96px] shrink-0 whitespace-nowrap px-3 text-xs"
          disabled={actionDisabled}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {points.map((point) => (
          <span key={point} className="rounded-full border border-border bg-background/70 px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {point}
          </span>
        ))}
      </div>
    </Card>
  );
}

function dataSourceToneClass(tone: "success" | "warning" | "primary" | "muted") {
  if (tone === "success") return "border-success/35 text-success";
  if (tone === "warning") return "border-warning/40 text-warning";
  if (tone === "primary") return "border-primary/30 text-primary";
  return "text-muted-foreground";
}

function EmptySourceState({ text }: { text: string }) {
  return (
    <div className="p-4">
      <p className="text-[11px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function ConsentLedgerRow({ consent, compact = false }: { consent: DataConsent; compact?: boolean }) {
  const categories = consent.data_categories?.length
    ? consent.data_categories.map((category) => category.replace(/_/g, " ")).join(", ")
    : "Structured transaction fields";
  const status = humanConsentStatus(consent.status);
  const lastActivity = consent.revoked_at || consent.last_sync_at || consent.updated_at || consent.granted_at;
  const isBankConsent = consent.source === "account_aggregator";
  const sourceLabel = isBankConsent
    ? consent.financial_institution_name || consent.provider_label || "Consent sandbox"
    : consent.device_name || "PocketBuddy Android Connector";
  const purpose = consent.purpose || (isBankConsent ? "consent sandbox preview" : "instant payment tracking");
  const rawPolicy = isBankConsent
    ? "Sandbox records only"
    : consent.raw_text_policy === "not_required_for_v2"
      ? "Not required for v2"
      : consent.raw_text_policy || "Masked only";

  return (
    <div className={compact ? "p-3" : "p-4"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold text-foreground">
              {sourceLabel}
            </p>
            <Badge variant="outline" className="text-[9px]">
              {status}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
            Purpose: {purpose}. Fields: {categories}.
          </p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Raw text policy
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-foreground">
            {rawPolicy}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border bg-surface px-2 py-1">
          Source: {isBankConsent ? "Account Aggregator" : "Android connector"}
        </span>
        <span className="rounded-full border border-border bg-surface px-2 py-1">
          {lastActivity ? `Last activity ${relativeTime(lastActivity)}` : "No activity yet"}
        </span>
      </div>
    </div>
  );
}
