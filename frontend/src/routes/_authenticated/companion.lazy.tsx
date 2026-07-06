import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getProfile, updateProfile, getCompanionSyncLogs } from "@/lib/api/db.functions";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  Save,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { absoluteDate, relativeTime } from "@/lib/format";

export const Route = createLazyFileRoute("/_authenticated/companion")({
  component: CompanionPage,
});

type Profile = any;
type SyncLog = any;

const LOCAL_WEBHOOK_URL = "http://127.0.0.1:8000/api/ingest/notification";
const ANDROID_APK_DOWNLOAD_URL =
  "https://d3g6cg7q9hn7hi.cloudfront.net/downloads/PocketBuddy-Connector-v0.1.0.apk";

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
  const isConnected = Boolean(profile?.companion_paired);
  const companionWebhookUrl = getCompanionWebhookUrl();
  const pairingForDisplay = profile?.pairing_code || pairing;
  const isPairingSaved = Boolean(profile?.pairing_code && profile.pairing_code === pairingForDisplay);

  function makeConnectorConfig(pairingCode: string) {
    return [
    `POCKETBUDDY_WEBHOOK_URL=${companionWebhookUrl}`,
      `POCKETBUDDY_WEBHOOK_TOKEN=${pairingCode}`,
    `POCKETBUDDY_USER_ID=${user?.id ?? ""}`,
    `POCKETBUDDY_ACCOUNT_EMAIL=${user?.email ?? ""}`,
    ].join("\n");
  }

  const connectorConfig = makeConnectorConfig(pairingForDisplay);

  useEffect(() => {
    if (profile?.pairing_code) setPairing(profile.pairing_code);
    else if (!pairing) setPairing(randomPairingCode());
  }, [profile, pairing]);

  const isAndroid = typeof window !== "undefined" && /android/i.test(window.navigator.userAgent);

  async function launchAutoConfigure() {
    const savedPairing = await savePairingCode(pairingForDisplay, false);
    if (!savedPairing) return;

    const deepLinkUrl = `pocketbuddy://configure?webhook_url=${encodeURIComponent(companionWebhookUrl)}&user_id=${encodeURIComponent(user?.id ?? "")}&webhook_token=${encodeURIComponent(savedPairing)}&account_email=${encodeURIComponent(user?.email ?? "")}`;
    window.location.href = deepLinkUrl;
  }

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
    if (mins < 5) toast.success("Recent sync confirmed");
    else toast(`Last sync was ${Math.round(mins)}m ago. Send another Android test notification.`);
  }

  async function unpair() {
    if (!confirm("Unpair this device?")) return;
    if (!user) return;
    try {
      await updateProfile({
        data: {
          companion_paired: false,
        },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["sync-log", user.id] });
      toast.success("Device unpaired. Recent sync history is kept.");
    } catch (err: any) {
      toast.error(err.message || "Failed to unpair device");
    }
  }

  async function savePairingCode(code = pairingForDisplay, showToast = true): Promise<string | null> {
    if (!user) return null;
    const nextCode = (code || randomPairingCode()).trim();
    if (!nextCode) return null;

    if (profile?.pairing_code === nextCode) return nextCode;

    try {
      await updateProfile({
        data: {
          pairing_code: nextCode,
        },
      });
      setPairing(nextCode);
      qc.invalidateQueries({ queryKey: ["profile"] });
      if (showToast) toast.success("Pairing token saved.");
      return nextCode;
    } catch (err: any) {
      toast.error(err.message || "Failed to save pairing token");
      return null;
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
    const savedPairing = await savePairingCode(pairingForDisplay, false);
    if (!savedPairing) return;

    const configToCopy = makeConnectorConfig(savedPairing);
    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(configToCopy);
        copied = true;
      } catch (err) {}
    }
    if (!copied) {
      copied = await fallbackCopyText(configToCopy);
    }

    if (copied) {
      toast.success("Pairing token saved and Android config copied.");
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
                <p className="text-[14px] font-semibold text-success">Companion linked</p>
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
              <p className="mt-2 rounded-md bg-surface px-2.5 py-2 text-[12px] text-muted-foreground">
                This phone is linked to your account. New supported payment alerts can sync automatically.
              </p>
            </Card>

            {/* Automated Setup */}
            <Card className="bg-primary/5 border border-primary/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4.5 w-4.5 text-primary shrink-0" />
                <p className="text-[13px] font-bold text-foreground">One-Tap Auto Configure</p>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Skip copying and pasting. Click below to automatically open the Android connector app and apply all configuration fields.
              </p>
              {isAndroid ? (
                <Button 
                  className="w-full bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider py-2.5 h-10 hover:bg-primary/90"
                  onClick={launchAutoConfigure}
                >
                  One-Tap Auto Configure
                </Button>
              ) : (
                <div className="rounded-lg bg-card border border-border p-3 text-[11px] md:text-xs text-muted-foreground leading-normal">
                  💡 <b>Opening this on Desktop?</b> Log in to PocketBuddy on your Android phone's web browser, navigate to settings/companion, and click this button to auto-configure instantly.
                </div>
              )}
            </Card>

            <AndroidInstallGuideCard />

            <Card className="bg-surface-raised p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[13px] font-semibold">Pair another phone or reconnect</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Copy this config, paste it in the Android connector, then save it on the phone.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={copyConnectorConfig}>
                  <Copy />
                  Copy Android config
                </Button>
              </div>
              <details className="mt-3 rounded-md bg-surface p-3 text-left text-xs text-muted-foreground">
                <summary className="cursor-pointer font-semibold text-foreground">Show copied values</summary>
                <pre className="mt-3 overflow-x-auto leading-5">{connectorConfig}</pre>
              </details>
            </Card>


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
                    Install the app once, copy the setup from here, then paste it in the phone app.
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Wireless ready
                </Badge>
              </div>
            </Card>

            {/* Automated Setup */}
            <Card className="bg-primary/5 border border-primary/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4.5 w-4.5 text-primary shrink-0" />
                <p className="text-[13px] font-bold text-foreground">One-Tap Auto Configure</p>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Skip copying and pasting. Click below to automatically open the Android connector app and apply all configuration fields.
              </p>
              {isAndroid ? (
                <Button 
                  className="w-full bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider py-2.5 h-10 hover:bg-primary/90"
                  onClick={launchAutoConfigure}
                >
                  One-Tap Auto Configure
                </Button>
              ) : (
                <div className="rounded-lg bg-card border border-border p-3 text-[11px] md:text-xs text-muted-foreground leading-normal">
                  💡 <b>Opening this on Desktop?</b> Log in to PocketBuddy on your Android phone's web browser, navigate to settings/companion, and click this button to auto-configure instantly.
                </div>
              )}
            </Card>

            <AndroidInstallGuideCard />

            <div className="rounded-xl border border-border bg-surface-raised p-4 text-center">
              <p className="text-[13px] font-semibold text-foreground">No manual code required</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                PocketBuddy creates a private setup key and includes it when you copy the Android config. You do not need to type or remember it.
              </p>
              <Badge variant={isPairingSaved ? "outline" : "secondary"} className="mt-2 text-[10px] md:text-xs">
                {isPairingSaved ? "Setup key saved" : "Setup key will save before copy"}
              </Badge>
            </div>

            <Card className="bg-surface-raised p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold">Connector config</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Tap copy, open the Android app, tap Paste config, then save.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={copyConnectorConfig}>
                  <Copy />
                  Copy Android config
                </Button>
              </div>
              <details className="mt-3 rounded-md bg-surface p-3 text-left text-xs text-muted-foreground">
                <summary className="cursor-pointer font-semibold text-foreground">Show copied values</summary>
                <pre className="mt-3 overflow-x-auto leading-5">{connectorConfig}</pre>
              </details>
            </Card>

            <Button variant="outline" className="w-full" onClick={() => savePairingCode()}>
              <Save />
              Save setup key
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

        <div className="pt-4 border-t border-border/30 mt-6">
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
                <div key={l.id} className="rounded-md bg-surface p-2.5">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 text-left"
                    onClick={() => setExpandedLogId(isOpen ? null : l.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <p className="truncate text-[13px]">{l.notification_source || "notification"}</p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
                        {l.notification_preview ?? "Structured event received"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge status={l.processing_status} />
                      <p className="mt-1 text-[11px] md:text-xs text-muted-foreground">
                        {relativeTime(l.created_at)}
                      </p>
                    </div>
                  </button>

                  {isOpen && <SyncLogDetails log={l} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function AndroidInstallGuideCard() {
  return (
    <Card className="bg-surface-raised p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <p className="text-[14px] font-semibold text-foreground">Install PocketBuddy Connector</p>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Download the Android connector, install it once, then paste the config from this page into the app.
          </p>
        </div>

        <Button asChild className="w-full shrink-0 sm:w-auto">
          <a href={ANDROID_APK_DOWNLOAD_URL} target="_blank" rel="noreferrer">
            <Download />
            Download APK
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>

      <div className="mt-4 grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-3">
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="font-semibold text-foreground">1. Download</p>
          <p className="mt-1 leading-relaxed">Open the APK link on the Android phone where UPI/SMS alerts arrive.</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="font-semibold text-foreground">2. Install</p>
          <p className="mt-1 leading-relaxed">If Android asks, allow installs from the browser for this one app.</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="font-semibold text-foreground">3. Connect</p>
          <p className="mt-1 leading-relaxed">Copy the Android config below, paste it in the connector, and enable notification access.</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-[12px] leading-relaxed text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>
          Google Play Protect can warn because this APK is installed outside the Play Store. If it blocks installation on a demo phone, open Play Store &gt; Play Protect &gt; Settings, temporarily disable app scanning, install PocketBuddy, then turn scanning back on.
        </p>
      </div>
    </Card>
  );
}

function SyncLogDetails({ log }: { log: SyncLog }) {
  const details = [
    ["Status", humanStatus(log.processing_status)],
    ["Received", log.created_at ? absoluteDate(log.created_at) : "-"],
    ["Parsed amount", formatParsedAmount(log.parsed_amount)],
    ["Parsed merchant", log.parsed_merchant || "-"],
    ["Transaction reference", log.transaction_reference || log.transaction_id || "-"],
    ["Device", log.device_name || log.source_app || log.package_name || "-"],
    ["Package", log.package_name || "-"],
  ];

  return (
    <div className="mt-3 rounded-md border border-border bg-background/70 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-0.5 break-words text-[12px] text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-[10px] md:text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Masked notification preview
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-muted-foreground">
          {log.notification_preview || "No notification preview stored."}
        </p>
      </div>
    </div>
  );
}

function formatParsedAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)}`;
}

function humanStatus(status?: string) {
  if (status === "parsed") return "Tracked";
  if (status === "pending") return "Processing";
  if (status === "auto_verified") return "Pool verified";
  if (status === "received") return "Received credit";
  if (status === "incomplete") return "Needs review";
  if (status === "duplicate") return "Duplicate";
  if (status === "failed") return "Failed";
  return "Ignored";
}

function StatusBadge({ status }: { status?: string }) {
  if (status === "parsed")
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
      <Badge className="bg-success/20 text-success text-[10px] md:text-xs">
        Pool verified
      </Badge>
    );
  if (status === "received")
    return (
      <Badge className="bg-primary/15 text-primary text-[10px] md:text-xs">
        Received
      </Badge>
    );
  if (status === "incomplete")
    return (
      <Badge className="bg-warning/20 text-warning text-[10px] md:text-xs">
        Needs review
      </Badge>
    );
  if (status === "duplicate")
    return (
      <Badge variant="outline" className="text-[10px] md:text-xs text-muted-foreground">
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
    <Badge variant="outline" className="text-[10px] md:text-xs text-muted-foreground">
      Ignored
    </Badge>
  );
}
