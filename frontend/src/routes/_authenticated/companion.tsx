import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getProfile, updateProfile, getCompanionSyncLogs } from "@/lib/api/db.functions";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronDown, Copy, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/companion")({
  ssr: false,
  component: CompanionPage,
});

type Profile = any;
type SyncLog = any;

const LOCAL_WEBHOOK_URL = "http://127.0.0.1:8000/api/ingest/notification";

function getCompanionWebhookUrl() {
  if (typeof window === "undefined") return LOCAL_WEBHOOK_URL;

  const { hostname, origin } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  return isLocalhost ? LOCAL_WEBHOOK_URL : `${origin}/api/ingest/notification`;
}

function randomPairingCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "PB-";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function CompanionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [pairing, setPairing] = useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const { data: profile, refetch: refetchProfile } = useQuery<Profile>({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: () => getProfile(),
    refetchInterval: 5000,
  });

  const { data: logs, refetch: refetchLogs } = useQuery<SyncLog[] | { logs?: SyncLog[] }>({
    queryKey: ["sync-log", user?.id],
    enabled: !!user,
    queryFn: () => getCompanionSyncLogs(),
    refetchInterval: 5000,
  });

  const syncLogs: SyncLog[] = Array.isArray(logs) ? logs : logs?.logs ?? [];
  const latestSyncAt = profile?.companion_last_sync ?? syncLogs[0]?.created_at;
  const hasRealSync = Boolean(profile?.companion_last_sync || syncLogs.length > 0);
  const isConnected = Boolean(profile?.companion_paired || hasRealSync);
  const companionWebhookUrl = getCompanionWebhookUrl();
  const connectorConfig = [
    `POCKETBUDDY_WEBHOOK_URL=${companionWebhookUrl}`,
    `POCKETBUDDY_WEBHOOK_TOKEN=${pairing || ""}`,
    `POCKETBUDDY_USER_ID=${user?.id ?? ""}`,
  ].join("\n");

  useEffect(() => {
    if (profile?.pairing_code) setPairing(profile.pairing_code);
    else if (!pairing) setPairing(randomPairingCode());
  }, [profile, pairing]);

  async function checkRealSync() {
    const [freshProfile, freshLogs] = await Promise.all([
      refetchProfile(),
      refetchLogs(),
      qc.invalidateQueries({ queryKey: ["txns"] }),
    ]);
    const nextLogs = Array.isArray(freshLogs.data) ? freshLogs.data : freshLogs.data?.logs ?? [];
    const nextLatestSyncAt = freshProfile.data?.companion_last_sync ?? nextLogs[0]?.created_at;

    if (!nextLatestSyncAt) {
      toast("No sync received yet. Send a test notification from the Android connector.");
      return;
    }

    const mins = (Date.now() - new Date(nextLatestSyncAt).getTime()) / 60000;
    if (mins < 5) toast.success("Connection active");
    else toast(`Last sync was ${Math.round(mins)}m ago. Send another Android test notification.`);
  }

  async function unpair() {
    if (!confirm("Unpair this device?")) return;
    if (!user) return;
    try {
      await updateProfile({
        data: {
          companion_paired: false,
          companion_device_name: null,
          companion_last_sync: null,
        },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Device unpaired.");
    } catch (err: any) {
      toast.error(err.message || "Failed to unpair device");
    }
  }

  async function savePairingCode() {
    if (!user) return;
    try {
      await updateProfile({
        data: {
          pairing_code: pairing,
        },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Pairing code saved.");
    } catch (err: any) {
      toast.error(err.message || "Failed to save pairing code");
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

  async function copyConnectorConfig() {
    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(connectorConfig);
        copied = true;
      } catch (err) {}
    }
    if (!copied) {
      copied = await fallbackCopyText(connectorConfig);
    }

    if (copied) {
      toast.success("Android config copied.");
    } else {
      toast.error("Failed to copy config. Please copy manually.");
    }
  }

  return (
    <AppShell>
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <button onClick={() => nav({ to: "/settings" })} className="text-muted-foreground cursor-pointer">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">Companion Device</h1>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {!profile ? (
          <Skeleton className="h-32 w-full" />
        ) : isConnected ? (
          <>
            <Card
              id="card-companion-status"
              className="border-l-4 border-l-success bg-surface-raised p-4"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <p className="text-[14px] font-semibold text-success">Connected</p>
              </div>
              <p className="mt-1 text-[13px]">
                {profile.companion_device_name ?? "PocketBuddy Android Connector"}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Last sync: {latestSyncAt ? relativeTime(latestSyncAt) : "never"}
              </p>
              <p className="text-[12px] text-muted-foreground">
                UPI apps: {profile.upi_apps_used?.length ? profile.upi_apps_used.join(", ") : "-"}
              </p>
            </Card>

            <div>
              <h3 className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
                RECENT SYNC ACTIVITY
              </h3>
              <div id="list-sync-log" className="mt-2 space-y-1.5">
                {syncLogs.length === 0 && (
                  <p className="text-[12px] text-muted-foreground py-4 text-center">
                    No sync activity yet.
                  </p>
                )}
                {syncLogs.map((l) => {
                  const isOpen = expandedLogId === l.id;
                  return (
                    <div key={l.id} className="rounded-md bg-surface">
                      <button
                        type="button"
                        onClick={() => setExpandedLogId(isOpen ? null : l.id)}
                        className="flex w-full items-start justify-between gap-3 p-2.5 text-left cursor-pointer"
                        aria-expanded={isOpen}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px]">{l.notification_source}</p>
                          <p className="truncate text-[12px] text-muted-foreground">
                            {l.notification_preview ?? "Structured event received"}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="text-right">
                            <StatusBadge status={l.processing_status} />
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {relativeTime(l.created_at)}
                            </p>
                          </div>
                          <ChevronDown
                            className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>
                      {isOpen && <SyncLogDetails log={l} />}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Button
                id="btn-test-companion"
                variant="outline"
                className="w-full"
                onClick={checkRealSync}
              >
                <RefreshCw />
                Test Connection
              </Button>
              <Button
                id="btn-unpair"
                variant="outline"
                className="w-full border-destructive text-destructive"
                onClick={unpair}
              >
                Unpair Device
              </Button>
            </div>
          </>
        ) : (
          <>
            <Card className="bg-surface-raised p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold">Android Connector</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Build and install from the repository Android module.
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Wireless ready
                </Badge>
              </div>
            </Card>

            <div className="text-center">
              <p className="text-[12px] text-muted-foreground">Your pairing code:</p>
              <div className="mt-2 inline-block rounded-md bg-surface-raised px-5 py-3 text-[24px] font-bold tracking-[4px] text-primary font-mono">
                {pairing}
              </div>
            </div>

            <Card className="bg-surface-raised p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold">Connector config</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Paste these values in the Android setup screen. On AWS this URL works without USB.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={copyConnectorConfig}>
                  <Copy />
                  Copy
                </Button>
              </div>
              <pre className="mt-3 overflow-x-auto rounded-md bg-surface p-3 text-left text-xs leading-5 text-muted-foreground">
                {connectorConfig}
              </pre>
            </Card>

            <Button variant="outline" className="w-full" onClick={savePairingCode}>
              <Save />
              Save Pairing Code
            </Button>
            <Button
              className="w-full bg-success text-white hover:bg-success/90"
              onClick={checkRealSync}
            >
              <RefreshCw />
              Check For Real Sync
            </Button>
          </>
        )}
      </div>
    </AppShell>
  );
}

function SyncLogDetails({ log }: { log: SyncLog }) {
  const formatAmount = (v: any) =>
    typeof v === "number" ? `₹${v.toLocaleString("en-IN")}` : null;

  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Status", value: log.processing_status },
    { label: "Source", value: log.notification_source },
    { label: "Parsed amount", value: formatAmount(log.parsed_amount) },
    { label: "Parsed merchant", value: log.parsed_merchant },
    { label: "Transaction ref", value: log.transaction_reference },
    { label: "Device", value: log.device_name },
    { label: "App package", value: log.source_app ?? log.package_name },
    {
      label: "Received",
      value: log.created_at ? new Date(log.created_at).toLocaleString() : null,
    },
  ].filter((r) => r.value !== null && r.value !== undefined && r.value !== "");

  return (
    <div className="border-t border-border px-2.5 py-3">
      <dl className="grid grid-cols-1 gap-y-1.5 sm:grid-cols-2 sm:gap-x-4">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 sm:block">
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.label}</dt>
            <dd className="text-[12px] font-medium text-foreground break-words text-right sm:text-left">{r.value}</dd>
          </div>
        ))}
      </dl>
      {log.notification_preview && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Notification preview</p>
          <p className="mt-1 rounded-md bg-surface-raised p-2 text-[12px] leading-5 text-muted-foreground break-words">
            {log.notification_preview}
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {  if (status === "parsed")
    return (
      <Badge className="bg-success/20 text-success text-xs">
        Tracked
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge className="bg-warning/20 text-warning text-xs">
        Processing
      </Badge>
    );
  if (status === "auto_verified")
    return (
      <Badge className="bg-success/20 text-success text-[10px]">
        Pool verified
      </Badge>
    );
  if (status === "received")
    return (
      <Badge className="bg-primary/15 text-primary text-[10px]">
        Received
      </Badge>
    );
  if (status === "incomplete")
    return (
      <Badge className="bg-warning/20 text-warning text-[10px]">
        Needs review
      </Badge>
    );
  if (status === "duplicate")
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        Duplicate
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge className="bg-destructive/20 text-destructive text-xs">
        Failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      Ignored
    </Badge>
  );
}
