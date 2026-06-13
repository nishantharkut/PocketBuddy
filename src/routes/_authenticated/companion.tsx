import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/format";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/companion")({
  ssr: false,
  component: CompanionPage,
});

type Profile = Tables<"profiles">;
type SyncLog = Tables<"companion_sync_log">;

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

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Profile | null> => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["sync-log", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<SyncLog[]> => {
      const { data } = await supabase.from("companion_sync_log").select("*")
        .eq("user_id", user!.id).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (profile?.pairing_code) setPairing(profile.pairing_code);
    else if (!pairing) setPairing(randomPairingCode());
  }, [profile, pairing]);

  async function testConn() {
    if (!profile?.companion_last_sync) {
      toast("Last sync was never. Open the companion app on your phone.");
      return;
    }
    const mins = (Date.now() - new Date(profile.companion_last_sync).getTime()) / 60000;
    if (mins < 5) toast.success("Connection active ✓");
    else toast(`Last sync was ${Math.round(mins)}m ago. Open the companion app on your phone.`);
  }

  async function unpair() {
    if (!confirm("Unpair this device?")) return;
    if (!user) return;
    await supabase.from("profiles").update({
      companion_paired: false, companion_device_name: null, companion_last_sync: null,
    }).eq("id", user.id);
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Device unpaired.");
  }

  async function verifyPair() {
    if (!user) return;
    await supabase.from("profiles").update({
      companion_paired: true,
      companion_device_name: profile?.companion_device_name ?? "Redmi Note 12",
      companion_last_sync: new Date().toISOString(),
      pairing_code: pairing,
    }).eq("id", user.id);
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Device connected! 🎉");
  }

  return (
    <AppShell>
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-[color:var(--surface)] px-4">
        <button onClick={() => nav({ to: "/settings" })} className="text-muted-foreground"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="text-[14px] font-semibold tracking-[0.15em]">COMPANION DEVICE</h1>
      </div>

      <div className="space-y-4 px-4 py-4">
        {!profile ? <Skeleton className="h-32 w-full" /> : profile.companion_paired ? (
          <>
            <Card id="card-companion-status" className="border-l-4 border-l-[color:var(--pb-green)] bg-[color:var(--surface-raised)] p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[color:var(--pb-green)] pulse-dot" />
                <p className="text-[14px] font-semibold text-[color:var(--pb-green)]">Connected</p>
              </div>
              <p className="mt-1 text-[13px]">{profile.companion_device_name ?? "Unknown device"}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Last sync: {profile.companion_last_sync ? relativeTime(profile.companion_last_sync) : "never"}
              </p>
              <p className="text-[12px] text-muted-foreground">
                UPI apps: {profile.upi_apps_used?.length ? profile.upi_apps_used.join(", ") : "—"}
              </p>
            </Card>

            <div>
              <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">RECENT SYNC ACTIVITY</h3>
              <div id="list-sync-log" className="mt-2 space-y-1.5">
                {(logs ?? []).length === 0 && <p className="text-[12px] text-muted-foreground py-4 text-center">No sync activity yet.</p>}
                {(logs ?? []).map((l) => (
                  <div key={l.id} className="flex items-start justify-between gap-3 rounded-md bg-[color:var(--surface)] p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px]">{l.notification_source}</p>
                      <p className="truncate text-[12px] text-muted-foreground">{l.raw_body}</p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={l.processing_status} />
                      <p className="mt-1 text-[11px] text-muted-foreground">{relativeTime(l.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Button id="btn-test-companion" variant="outline" className="w-full" onClick={testConn}>Test Connection</Button>
              <Button id="btn-unpair" variant="outline" className="w-full border-[color:var(--pb-red)] text-[color:var(--pb-red)]" onClick={unpair}>
                Unpair Device
              </Button>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => toast("APK downloading. Open it from your notifications to install.")}
              className="w-full rounded-lg border-2 border-[color:var(--pb-blue)] bg-[color:var(--surface-raised)] p-5 text-center">
              <div className="text-[15px] font-semibold text-[color:var(--pb-blue)]">⬇ Download PocketBuddy Companion</div>
              <p className="mt-1 text-[12px] text-muted-foreground">Android only • 1.2 MB</p>
            </button>
            <div className="text-center">
              <p className="text-[12px] text-muted-foreground">Your pairing code:</p>
              <div className="mt-2 inline-block rounded-md bg-[color:var(--surface-raised)] px-5 py-3 text-[24px] font-bold tracking-[4px] text-[color:var(--pb-blue)] font-mono">
                {pairing}
              </div>
            </div>
            <Button className="w-full bg-[color:var(--pb-green)] text-white hover:bg-[color:var(--pb-green)]/90" onClick={verifyPair}>
              I've installed it — verify connection
            </Button>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "parsed") return <Badge className="bg-[color:var(--pb-green)]/20 text-[color:var(--pb-green)] text-[10px]">Tracked</Badge>;
  if (status === "pending") return <Badge className="bg-[color:var(--pb-amber)]/20 text-[color:var(--pb-amber)] text-[10px]">Processing</Badge>;
  if (status === "failed") return <Badge className="bg-[color:var(--pb-red)]/20 text-[color:var(--pb-red)] text-[10px]">Failed</Badge>;
  return <Badge variant="outline" className="text-[10px] text-muted-foreground">Duplicate</Badge>;
}
