import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { rupees, getCycleStart, shortDate } from "@/lib/format";
import {
  getProfile,
  getSubscriptions,
  updateProfile,
  updateSubscriptionIsActive,
  deleteSubscription,
  getTransactions,
  deleteRecentTransactions,
  insertSubscription,
} from "@/lib/api/db.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  component: SettingsPage,
});

type Profile = any;
type Sub = any;

function SettingsPage() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: () => getProfile(),
  });

  const { data: subs } = useQuery({
    queryKey: ["all-subs", user?.id],
    enabled: !!user,
    queryFn: () => getSubscriptions(),
  });

  // Profile form state
  const [allowance, setAllowance] = useState("");
  const [cycleDay, setCycleDay] = useState("1");
  const [hostel, setHostel] = useState("");
  const [wing, setWing] = useState("");
  const [room, setRoom] = useState("");
  const [examStart, setExamStart] = useState("");
  const [examEnd, setExamEnd] = useState("");
  const [mess, setMess] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setAllowance(String(Math.round(profile.monthly_allowance / 100)));
    setCycleDay(String(profile.cycle_start_day));
    setHostel(profile.hostel_block);
    setWing(profile.wing_label);
    setRoom(profile.room_number);
    setExamStart(profile.exam_start_date ?? "");
    setExamEnd(profile.exam_end_date ?? "");
    setMess(profile.mess_enrolled);
  }, [profile]);

  const [addingSub, setAddingSub] = useState(false);

  async function saveProfile() {
    if (!user) return;
    try {
      await updateProfile({
        data: {
          monthly_allowance: Math.round(parseFloat(allowance) * 100),
          cycle_start_day: parseInt(cycleDay, 10),
          hostel_block: hostel,
          wing_label: wing,
          room_number: room,
          exam_start_date: examStart || null,
          exam_end_date: examEnd || null,
          mess_enrolled: mess,
        },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    }
  }

  async function toggleSub(id: string, val: boolean, name: string) {
    try {
      await updateSubscriptionIsActive({ data: { id, is_active: val } });
      qc.invalidateQueries({ queryKey: ["all-subs"] });
      toast(`${name} ${val ? "enabled" : "paused"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update subscription");
    }
  }

  async function delSub(id: string) {
    if (!confirm("Remove this subscription?")) return;
    try {
      await deleteSubscription({ data: { id } });
      qc.invalidateQueries({ queryKey: ["all-subs"] });
      toast.success("Removed.");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete subscription");
    }
  }

  async function exportCsv() {
    if (!user) return;
    try {
      const txns = await getTransactions();
      const rows = [
        ["date", "merchant", "category", "amount_inr", "source"],
        ...(txns ?? []).map((t: any) => [
          t.created_at,
          t.mapped_merchant_name ?? t.raw_merchant_string,
          t.category ?? "",
          String(t.amount / 100),
          t.source,
        ]),
      ];
      const csv = rows
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      downloadBlob(csv, "transactions.csv", "text/csv");
      toast.success("CSV downloaded.");
    } catch (err: any) {
      toast.error("Failed to export transactions");
    }
  }

  async function exportReport() {
    if (!user || !profile) return;
    try {
      const txns = await getTransactions();
      const start = getCycleStart(profile.cycle_start_day);
      const cycleTxns = (txns ?? []).filter((t: any) => new Date(t.created_at) >= start);
      const total = cycleTxns.reduce((s: any, t: any) => s + t.amount, 0) / 100;
      const byCat: Record<string, number> = {};
      cycleTxns.forEach((t: any) => {
        byCat[t.category ?? "unmapped"] = (byCat[t.category ?? "unmapped"] ?? 0) + t.amount / 100;
      });
      const lines = [
        "POCKETBUDDY SPENDING REPORT",
        `Generated: ${new Date().toLocaleString("en-IN")}`,
        `Cycle start: ${start.toLocaleDateString("en-IN")}`,
        "",
        `Total spent this cycle: ₹${total.toFixed(0)}`,
        `Monthly allowance: ₹${(profile.monthly_allowance / 100).toFixed(0)}`,
        "",
        "By category:",
        ...Object.entries(byCat).map(([k, v]) => `  ${k}: ₹${v.toFixed(0)}`),
      ];
      downloadBlob(lines.join("\n"), "spending-report.txt", "text/plain");
      toast.success("Report downloaded.");
    } catch (err: any) {
      toast.error("Failed to export report");
    }
  }

  async function resetCycle() {
    if (!user || !profile) return;
    if (!confirm("Delete all transactions in the current cycle?")) return;
    try {
      const start = getCycleStart(profile.cycle_start_day);
      await deleteRecentTransactions({ data: { startDate: start.toISOString() } });
      qc.invalidateQueries();
      toast.success("Cycle reset.");
    } catch (err: any) {
      toast.error("Failed to reset cycle");
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logout();
    nav({ to: "/login", replace: true });
  }

  if (!profile)
    return (
      <AppShell>
        <div className="p-4">
          <Skeleton className="h-screen w-full" />
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <div className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-[color:var(--surface)] px-4">
        <h1 className="text-[14px] font-semibold tracking-[0.15em]">SETTINGS</h1>
      </div>
      <div className="space-y-6 px-4 py-4">
        {/* Profile */}
        <section id="section-settings-profile" className="space-y-2">
          <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
            CAMPUS PROFILE
          </h3>
          <FieldRow label="Allowance (₹)">
            <Input type="number" value={allowance} onChange={(e) => setAllowance(e.target.value)} />
          </FieldRow>
          <FieldRow label="Cycle day">
            <Select value={cycleDay} onValueChange={setCycleDay}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 5, 10, 15, 28].map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Hostel block">
            <Input value={hostel} onChange={(e) => setHostel(e.target.value)} />
          </FieldRow>
          <FieldRow label="Wing">
            <Input value={wing} onChange={(e) => setWing(e.target.value)} />
          </FieldRow>
          <FieldRow label="Room">
            <Input value={room} onChange={(e) => setRoom(e.target.value)} />
          </FieldRow>
          <FieldRow label="Exam start">
            <Input type="date" value={examStart} onChange={(e) => setExamStart(e.target.value)} />
          </FieldRow>
          <FieldRow label="Exam end">
            <Input type="date" value={examEnd} onChange={(e) => setExamEnd(e.target.value)} />
          </FieldRow>
          <div className="flex items-center justify-between">
            <span className="text-[13px]">Mess enrolled</span>
            <Switch checked={mess} onCheckedChange={setMess} />
          </div>
          <Button id="btn-save-profile" onClick={saveProfile} className="w-full">
            Save Changes
          </Button>
        </section>

        {/* Companion */}
        <section id="section-settings-companion" className="space-y-2">
          <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
            COMPANION DEVICE
          </h3>
          {profile.companion_paired ? (
            <Card className="bg-[color:var(--surface-raised)] p-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[color:var(--pb-green)] pulse-dot" />
                <p className="text-[13px] font-medium">{profile.companion_device_name}</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Last sync:{" "}
                {profile.companion_last_sync ? shortDate(profile.companion_last_sync) : "—"}
              </p>
              <div className="mt-2 flex gap-2">
                <Link to="/companion" className="text-[12px] text-[color:var(--pb-blue)]">
                  Manage Device →
                </Link>
                <Link to="/companion" className="text-[12px] text-[color:var(--pb-blue)]">
                  View Sync Log →
                </Link>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-muted-foreground">No device connected.</p>
              <Link to="/companion">
                <Button
                  variant="outline"
                  className="w-full border-[color:var(--pb-purple)] text-[color:var(--pb-purple)]"
                >
                  Set Up Companion →
                </Button>
              </Link>
            </div>
          )}
        </section>

        {/* Subscriptions */}
        <section id="section-settings-subs" className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
              TRACKED SUBSCRIPTIONS
            </h3>
            <button
              id="btn-add-sub"
              onClick={() => setAddingSub(true)}
              className="text-[12px] text-[color:var(--pb-blue)]"
            >
              + Add
            </button>
          </div>
          <div className="space-y-1.5">
            {(subs ?? []).length === 0 && (
              <p className="text-[12px] text-muted-foreground py-2">No subscriptions tracked.</p>
            )}
            {(subs ?? []).map((s) => (
              <Card key={s.id} className="bg-[color:var(--surface)] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px]">
                      {s.service_name}
                      {s.detected_from === "auto_detected" && (
                        <Badge className="ml-2 bg-[color:var(--pb-purple)]/20 text-[color:var(--pb-purple)] text-[10px]">
                          Auto
                        </Badge>
                      )}
                    </p>
                    <p className="text-[12px] text-muted-foreground tnum">
                      {rupees(s.amount)} • next: {shortDate(new Date(s.next_debit_date))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`switch-sub-${s.id}`}
                      checked={s.is_active}
                      onCheckedChange={(v) => toggleSub(s.id, v, s.service_name)}
                    />
                    <button onClick={() => delSub(s.id)} className="text-muted-foreground">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Data */}
        <section id="section-settings-data" className="space-y-2">
          <h3 className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground">
            DATA & EXPORT
          </h3>
          <Button id="btn-export-csv" variant="outline" className="w-full" onClick={exportCsv}>
            Export Transactions (CSV)
          </Button>
          <Button
            id="btn-export-report"
            variant="outline"
            className="w-full"
            onClick={exportReport}
          >
            Export Spending Report
          </Button>
          <Button
            id="btn-reset-cycle"
            variant="outline"
            className="w-full border-[color:var(--pb-red)] text-[color:var(--pb-red)]"
            onClick={resetCycle}
          >
            Reset Current Cycle
          </Button>
        </section>

        {/* Account */}
        <section id="section-settings-account">
          <Button id="btn-sign-out" variant="destructive" className="w-full" onClick={signOut}>
            Sign Out
          </Button>
        </section>
      </div>

      <Dialog open={addingSub} onOpenChange={setAddingSub}>
        <DialogContent id="dialog-add-sub">
          <AddSubForm
            onClose={() => {
              setAddingSub(false);
              qc.invalidateQueries({ queryKey: ["all-subs"] });
            }}
          />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[12px] text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function AddSubForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState("");
  async function save() {
    if (!name || !amt || !date) {
      toast.error("Fill all fields");
      return;
    }
    try {
      await insertSubscription({
        data: {
          service_name: name,
          amount: Math.round(parseFloat(amt) * 100),
          next_debit_date: date,
          detected_from: "manual",
          is_active: true,
        },
      });
      toast.success("Subscription tracked.");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to add subscription");
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add subscription</DialogTitle>
      </DialogHeader>
      <Input
        placeholder="Service name (Spotify)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        type="number"
        placeholder="Amount ₹"
        value={amt}
        onChange={(e) => setAmt(e.target.value)}
      />
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <DialogFooter>
        <Button onClick={save} className="w-full">
          Add
        </Button>
      </DialogFooter>
    </>
  );
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
