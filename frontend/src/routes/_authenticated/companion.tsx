import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getProfile, updateProfile, getCompanionSyncLogs } from "@/lib/api/db.functions";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Copy, RefreshCw, Save } from "lucide-react";
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
    "POCKETBUDDY_WEBHOOK_TOKEN=",
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

  async function copyConnectorConfig() {
    try {
      await navigator.clipboard.writeText(connectorConfig);
      toast.success("Android config copied.");
    } catch (err: any) {
      toast.error(err.message || "Failed to copy config");
    }
  }

  return (
    <AppShell>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
        <button onClick={() => nav({ to: "/settings" })} className="text-muted-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[14px] font-semibold tracking-[0.15em]">COMPANION DEVICE</h1>
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
              <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
                RECENT SYNC ACTIVITY
              </h3>
              <div id="list-sync-log" className="mt-2 space-y-1.5">
                {syncLogs.length === 0 && (
                  <p className="text-[12px] text-muted-foreground py-4 text-center">
                    No sync activity yet.
                  </p>
                )}
                {syncLogs.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-start justify-between gap-3 rounded-md bg-surface p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px]">{l.notification_source}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {l.notification_preview ?? "Structured event received"}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={l.processing_status} />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {relativeTime(l.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
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
                <Badge variant="outline" className="text-[10px]">
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
              <pre className="mt-3 overflow-x-auto rounded-md bg-surface p-3 text-left text-[11px] leading-5 text-muted-foreground">
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

function StatusBadge({ status }: { status: string }) {
  if (status === "parsed")
    return (
      <Badge className="bg-success/20 text-success text-[10px]">
        Tracked
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge className="bg-warning/20 text-warning text-[10px]">
        Processing
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge className="bg-destructive/20 text-destructive text-[10px]">
        Failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      Duplicate
    </Badge>
  );
}
