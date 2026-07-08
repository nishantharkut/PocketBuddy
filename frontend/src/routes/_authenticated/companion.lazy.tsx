import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useAuth } from "@/lib/auth-context";
import {
  createCompanionPairingToken,
  getProfile,
  updateProfile,
  getCompanionSyncLogs,
  getDataConsents,
} from "@/lib/api/db.functions";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  KeyRound,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { absoluteDate, relativeTime } from "@/lib/format";

export const Route = createLazyFileRoute("/_authenticated/companion")({
  component: CompanionPage,
});

type Profile = any;
type SyncLog = any;
type DataConsent = any;

const LOCAL_WEBHOOK_URL = "http://127.0.0.1:8000/api/ingest/notification-v2";
const ANDROID_APK_DOWNLOAD_URL =
  "https://d3g6cg7q9hn7hi.cloudfront.net/downloads/PocketBuddy-Connector-v0.1.0.apk";

function getCompanionWebhookUrl() {
  const configuredUrl = import.meta.env.VITE_CONNECTOR_WEBHOOK_URL?.trim();
  if (configuredUrl) return configuredUrl;
  if (typeof window === "undefined") return LOCAL_WEBHOOK_URL;

  const { hostname, origin } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  return isLocalhost ? LOCAL_WEBHOOK_URL : `${origin}/api/ingest/notification-v2`;
}

function maskMiddle(value: string, visibleStart = 6, visibleEnd = 4) {
  if (!value) return "";
  if (value.length <= visibleStart + visibleEnd) return "****";
  return `${value.slice(0, visibleStart)}****${value.slice(-visibleEnd)}`;
}

function maskEmail(value: string) {
  const [name, domain] = value.split("@");
  if (!name || !domain) return maskMiddle(value, 3, 2);
  return `${maskMiddle(name, 2, 1)}@${domain}`;
}

function CompanionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [pairing, setPairing] = useState<string>("");
  const [issuingPairing, setIssuingPairing] = useState(false);
  const [setupLink, setSetupLink] = useState("");
  const [setupQr, setSetupQr] = useState("");
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

  const { data: dataConsents } = useQuery<DataConsent[]>({
    queryKey: ["data-consents", user?.id],
    enabled: !!user,
    queryFn: () => getDataConsents(),
    refetchInterval: 5000,
  });

  const syncLogs: SyncLog[] = Array.isArray(logs) ? logs : logs?.logs ?? [];
  const consentRows: DataConsent[] = Array.isArray(dataConsents) ? dataConsents : [];
  const latestAndroidConsent =
    consentRows.find((c) => c.source === "android_connector" && c.status === "active") ??
    consentRows.find((c) => c.source === "android_connector") ??
    null;
  const latestSyncLog = syncLogs[0];
  const latestSyncAt = profile?.companion_last_sync ?? syncLogs[0]?.created_at;
  const isConnected = Boolean(profile?.companion_paired);
  const companionWebhookUrl = getCompanionWebhookUrl();
  const pairingForDisplay = pairing || profile?.pairing_code || profile?.pairing_code_preview || "";

  function makeConnectorConfig(pairingCode: string) {
    return [
      `POCKETBUDDY_WEBHOOK_URL=${companionWebhookUrl}`,
      `POCKETBUDDY_WEBHOOK_TOKEN=${pairingCode}`,
      `POCKETBUDDY_USER_ID=${user?.id ?? ""}`,
      `POCKETBUDDY_ACCOUNT_EMAIL=${user?.email ?? ""}`,
    ].join("\n");
  }

  function makeDisplayConnectorConfig(pairingCode: string) {
    return [
      `POCKETBUDDY_WEBHOOK_URL=${companionWebhookUrl}`,
      `POCKETBUDDY_WEBHOOK_TOKEN=${maskMiddle(pairingCode, 3, 2)}`,
      `POCKETBUDDY_USER_ID=${maskMiddle(user?.id ?? "", 6, 4)}`,
      `POCKETBUDDY_ACCOUNT_EMAIL=${maskEmail(user?.email ?? "")}`,
    ].join("\n");
  }

  const displayConnectorConfig = makeDisplayConnectorConfig(pairingForDisplay);

  useEffect(() => {
    if (profile?.pairing_code) setPairing(profile.pairing_code);
  }, [profile]);

  const isAndroid = typeof window !== "undefined" && /android/i.test(window.navigator.userAgent);

  function buildDeepLink(pairingToken: string) {
    return `pocketbuddy://configure?webhook_url=${encodeURIComponent(companionWebhookUrl)}&user_id=${encodeURIComponent(user?.id ?? "")}&webhook_token=${encodeURIComponent(pairingToken)}&account_email=${encodeURIComponent(user?.email ?? "")}`;
  }

  async function launchAutoConfigure() {
    const savedPairing = await getOrCreatePairingToken(false);
    if (!savedPairing) return;

    const deepLinkUrl = buildDeepLink(savedPairing);
    window.location.href = deepLinkUrl;
  }

  async function preparePhoneSetup() {
    const savedPairing = await getOrCreatePairingToken(false);
    if (!savedPairing) return;
    const deepLinkUrl = buildDeepLink(savedPairing);
    setSetupLink(deepLinkUrl);
    try {
      const qr = await QRCode.toDataURL(deepLinkUrl, {
        width: 184,
        margin: 1,
        color: {
          dark: "#09090b",
          light: "#ffffff",
        },
      });
      setSetupQr(qr);
      toast.success("Setup QR ready. Scan it from your Android phone.");
    } catch (err) {
      toast.error("Could not prepare setup QR. Use one-tap setup on the Android phone.");
    }
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
      qc.invalidateQueries({ queryKey: ["data-consents"] });
      setPairing("");
      setSetupLink("");
      setSetupQr("");
      toast.success("Device unpaired. Recent sync history is kept.");
    } catch (err: any) {
      toast.error(err.message || "Failed to unpair device");
    }
  }

  async function issuePairingToken(showToast = true): Promise<string | null> {
    if (!user) return null;
    setIssuingPairing(true);
    try {
      const result = await createCompanionPairingToken();
      const nextToken = result?.pairing_token;
      if (!nextToken) throw new Error("Pairing token was not returned");
      setPairing(nextToken);
      qc.invalidateQueries({ queryKey: ["profile"] });
      if (showToast) toast.success("Private setup key generated.");
      return nextToken;
    } catch (err: any) {
      toast.error(err.message || "Failed to generate setup key");
      return null;
    } finally {
      setIssuingPairing(false);
    }
  }

  async function getOrCreatePairingToken(showToast = true): Promise<string | null> {
    if (pairing) return pairing;
    return issuePairingToken(showToast);
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
    const savedPairing = await getOrCreatePairingToken(false);
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
      toast.success("Fallback Android config copied.");
    } else {
      toast.error("Failed to copy fallback config.");
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
                This phone is linked to your account. Supported payment alerts are parsed on-device, then shown with a trust path in Transactions.
              </p>
            </Card>

            <ConnectorTrustCard
              isConnected={isConnected}
              consent={latestAndroidConsent}
              latestLog={latestSyncLog}
            />

            <AndroidInstallGuideCard />

            <ConfigureConnectorCard
              isAndroid={isAndroid}
              issuingPairing={issuingPairing}
              setupQr={setupQr}
              setupLink={setupLink}
              displayConnectorConfig={displayConnectorConfig}
              onOneTap={launchAutoConfigure}
              onPrepareQr={preparePhoneSetup}
              onCopyConfig={copyConnectorConfig}
            />


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
                    Install the app once, then link this signed-in PocketBuddy account from the phone.
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Wireless ready
                </Badge>
              </div>
            </Card>

            <ConnectorTrustCard
              isConnected={isConnected}
              consent={latestAndroidConsent}
              latestLog={latestSyncLog}
            />

            <AndroidInstallGuideCard />

            <ConfigureConnectorCard
              isAndroid={isAndroid}
              issuingPairing={issuingPairing}
              setupQr={setupQr}
              setupLink={setupLink}
              displayConnectorConfig={displayConnectorConfig}
              onOneTap={launchAutoConfigure}
              onPrepareQr={preparePhoneSetup}
              onCopyConfig={copyConnectorConfig}
            />
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

function ConfigureConnectorCard({
  isAndroid,
  issuingPairing,
  setupQr,
  setupLink,
  displayConnectorConfig,
  onOneTap,
  onPrepareQr,
  onCopyConfig,
}: {
  isAndroid: boolean;
  issuingPairing: boolean;
  setupQr: string;
  setupLink: string;
  displayConnectorConfig: string;
  onOneTap: () => void;
  onPrepareQr: () => void;
  onCopyConfig: () => void;
}) {
  return (
    <Card className="border border-border bg-surface-raised p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-background text-primary">
          <Smartphone className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Configure connector</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            QR setup and copied config contain the same secure setup values. Use either one after
            installing the APK.
          </p>
        </div>
      </div>

      {isAndroid ? (
        <div className="mt-4 rounded-xl border border-border bg-background p-3">
          <p className="text-[12px] font-semibold text-foreground">Using the Android phone now</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Tap once to open the connector app and prefill the server, account, and setup key.
          </p>
          <Button
            className="mt-3 h-10 w-full bg-primary text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
            onClick={onOneTap}
            disabled={issuingPairing}
          >
            {issuingPairing ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
            One-Tap Auto Configure
          </Button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-background p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-foreground">Set up from another screen</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Generate a QR, scan it with the Android phone, and it will redirect to the connector
                app with the values prefilled.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-9 text-xs"
                onClick={onPrepareQr}
                disabled={issuingPairing}
              >
                {issuingPairing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Smartphone className="h-3.5 w-3.5" />
                )}
                Generate QR setup
              </Button>
            </div>
            {setupQr ? (
              <div className="mx-auto rounded-xl border border-border bg-white p-2">
                <img src={setupQr} alt="PocketBuddy connector setup QR" className="h-36 w-36" />
              </div>
            ) : null}
          </div>
          {setupLink ? (
            <a href={setupLink} className="mt-3 block text-[11px] font-semibold text-primary sm:hidden">
              Open connector on this phone
            </a>
          ) : null}
        </div>
      )}

      <details className="mt-3 rounded-xl border border-border bg-surface p-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-muted-foreground">
          Copy config instead
        </summary>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Same setup values as the QR. Use this only if the app link is blocked.
          </p>
          <Button variant="outline" size="sm" onClick={onCopyConfig} disabled={issuingPairing}>
            <Copy />
            Copy config
          </Button>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-md bg-background p-3 text-xs leading-5 text-muted-foreground">
          {displayConnectorConfig}
        </pre>
      </details>
    </Card>
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
            Download the Android connector on the phone that receives UPI or SMS payment alerts. Pairing is handled from PocketBuddy web.
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
          <p className="mt-1 leading-relaxed">
            Use the QR or config section below to open the connector with values prefilled.
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-[12px] leading-relaxed text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>
          Demo sideload note: because this prototype APK is installed outside the Play Store, Android may show a Play Protect warning. Install only from this PocketBuddy link, and re-enable any browser install permission after setup.
        </p>
      </div>
    </Card>
  );
}

function ConnectorTrustCard({
  isConnected,
  consent,
  latestLog,
}: {
  isConnected: boolean;
  consent: DataConsent | null;
  latestLog?: SyncLog;
}) {
  const consentStatus = humanConsentStatus(consent?.status);
  const rawPayloadLabel =
    latestLog?.raw_payload_received === true
      ? "Legacy raw event seen"
      : latestLog
        ? "Raw upload off"
        : "Not observed yet";
  const parserLabel =
    latestLog?.parser_version ||
    (latestLog?.data_origin === "android_on_device" ? "android-v2" : "Awaiting first sync");

  return (
    <Card className="bg-surface-raised p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-[13px] font-semibold text-foreground">Privacy-safe connector</p>
          </div>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
            The connector is optional. It parses supported payment alerts on the phone and sends only transaction facts plus a masked preview.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-primary/30 bg-background/60 text-[10px] text-primary">
          {isConnected ? consentStatus : "Optional"}
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <TrustPoint
          icon={<Smartphone className="h-3.5 w-3.5" />}
          label="Phone"
          text="Local UPI/SMS parser"
        />
        <TrustPoint
          icon={<Server className="h-3.5 w-3.5" />}
          label="Server"
          text={rawPayloadLabel}
        />
        <TrustPoint
          icon={<FileCheck2 className="h-3.5 w-3.5" />}
          label="Parser"
          text={parserLabel}
        />
      </div>

      <div className="mt-3 grid gap-2 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2">
        <div className="flex gap-2 rounded-md border border-border bg-background/70 p-2.5">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          <span>Uploads amount, merchant, direction, source app, reference, confidence, and masked preview.</span>
        </div>
        <div className="flex gap-2 rounded-md border border-border bg-background/70 p-2.5">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>Never asks for MPIN, OTP, bank login, or permission to initiate a payment.</span>
        </div>
      </div>
    </Card>
  );
}

function TrustPoint({
  icon,
  label,
  text,
}: {
  icon: ReactNode;
  label: string;
  text: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background/70 p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-1 truncate text-[12px] font-semibold text-foreground">{text}</p>
    </div>
  );
}

function humanConsentStatus(status?: string) {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  if (status === "revoked") return "Revoked";
  return "Not connected";
}

function SyncLogDetails({ log }: { log: SyncLog }) {
  const details = [
    ["Status", humanStatus(log.processing_status)],
    ["Received", log.created_at ? absoluteDate(log.created_at) : "-"],
    ["Data origin", humanDataOrigin(log.data_origin)],
    ["Privacy mode", log.privacy_mode || "-"],
    ["Raw payload", humanRawPayload(log.raw_payload_received)],
    ["Parser version", log.parser_version || "-"],
    ["Confidence", log.source_confidence || "-"],
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
  if (status === "sync_disabled_by_user" || status === "sync_paused_by_user") return "Paused by user";
  if (status === "consent_revoked_repair_required") return "Re-pair required";
  if (status === "auto_verified") return "Pool verified";
  if (status === "received") return "Received credit";
  if (status === "incomplete") return "Needs review";
  if (status === "duplicate") return "Duplicate";
  if (status === "failed") return "Failed";
  return "Ignored";
}

function humanDataOrigin(origin?: string) {
  if (origin === "android_on_device") return "Android on-device parser";
  if (origin === "legacy_android_raw_ingest") return "Legacy Android ingest";
  if (origin === "blocked_before_parse") return "Blocked before parsing";
  return "-";
}

function humanRawPayload(value?: boolean) {
  if (value === true) return "Yes - legacy event";
  if (value === false) return "No";
  return "-";
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
  if (status === "sync_disabled_by_user" || status === "sync_paused_by_user")
    return (
      <Badge className="bg-warning/20 text-warning text-[10px] md:text-xs">
        Paused
      </Badge>
    );
  if (status === "consent_revoked_repair_required")
    return (
      <Badge className="bg-destructive/15 text-destructive text-[10px] md:text-xs">
        Re-pair
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
