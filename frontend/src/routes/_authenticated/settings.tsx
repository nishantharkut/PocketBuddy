import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trash2,
  User,
  Smartphone,
  CreditCard,
  Database,
  LogOut,
  Plus,
  ChevronRight,
  Wifi,
  WifiOff,
} from "lucide-react";
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

  const [allowance, setAllowance] = useState("");
  const [cycleDay, setCycleDay] = useState("1");
  const [hostel, setHostel] = useState("");
  const [wing, setWing] = useState("");
  const [room, setRoom] = useState("");
  const [examStart, setExamStart] = useState("");
  const [examEnd, setExamEnd] = useState("");
  const [mess, setMess] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setAllowance(String(Math.round(profile.monthly_allowance / 100)));
    setCycleDay(String(profile.cycle_start_day));
    setHostel(profile.hostel_block ?? "");
    setWing(profile.wing_label ?? "");
    setRoom(profile.room_number ?? "");
    setExamStart(profile.exam_start_date ?? "");
    setExamEnd(profile.exam_end_date ?? "");
    setMess(profile.mess_enrolled ?? false);
    setUpiId(profile.upi_id ?? "");
  }, [profile]);

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
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
          upi_id: upiId,
        },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
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
      const cycleTxns = (txns ?? []).filter(
        (t: any) => new Date(t.created_at) >= start
      );
      const total = cycleTxns.reduce((s: any, t: any) => s + t.amount, 0) / 100;
      const byCat: Record<string, number> = {};
      cycleTxns.forEach((t: any) => {
        byCat[t.category ?? "unmapped"] =
          (byCat[t.category ?? "unmapped"] ?? 0) + t.amount / 100;
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
        ...Object.entries(byCat).map(([k, v]) => `  ${k}: ₹${(v as number).toFixed(0)}`),
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
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48 rounded" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      {/* Page Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">
            Settings
          </h1>
        </div>
        <div className="hidden sm:block text-xs text-muted-foreground font-mono">
          {user?.email}
        </div>
      </div>

      <div
        style={{
          maxWidth: "640px",
          margin: "0 auto",
          padding: "32px 0 80px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {/* ── CAMPUS PROFILE ── */}
        <SectionHeader icon={<User size={13} />} label="CAMPUS PROFILE" />
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            overflow: "hidden",
            marginBottom: "24px",
          }}
        >
          {/* Two-column grid for compact fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            <SettingsField label="Monthly Allowance (₹)" noBorderRight>
              <Input
                type="number"
                value={allowance}
                onChange={(e) => setAllowance(e.target.value)}
                style={inputStyle}
                placeholder="5000"
              />
            </SettingsField>
            <SettingsField label="Billing Cycle Day">
              <Select value={cycleDay} onValueChange={setCycleDay}>
                <SelectTrigger style={inputStyle}>
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
            </SettingsField>
          </div>

          <div
            style={{
              height: "1px",
              background: "var(--border)",
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <SettingsField label="Hostel Block" noBorderRight>
              <Input
                value={hostel}
                onChange={(e) => setHostel(e.target.value)}
                style={inputStyle}
                placeholder="A"
              />
            </SettingsField>
            <SettingsField label="Wing" noBorderRight>
              <Input
                value={wing}
                onChange={(e) => setWing(e.target.value)}
                style={inputStyle}
                placeholder="North"
              />
            </SettingsField>
            <SettingsField label="Room Number">
              <Input
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                style={inputStyle}
                placeholder="214"
              />
            </SettingsField>
          </div>

          <div
            style={{
              height: "1px",
              background: "var(--border)",
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            <SettingsField label="Exam Start" noBorderRight>
              <Input
                type="date"
                value={examStart}
                onChange={(e) => setExamStart(e.target.value)}
                style={inputStyle}
              />
            </SettingsField>
            <SettingsField label="Exam End">
              <Input
                type="date"
                value={examEnd}
                onChange={(e) => setExamEnd(e.target.value)}
                style={inputStyle}
              />
            </SettingsField>
          </div>

          <div
            style={{
              height: "1px",
              background: "var(--border)",
            }}
          />

          <SettingsField label="UPI ID for Pools">
            <Input
              id="input-settings-upi"
              placeholder="username@upi"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              style={inputStyle}
            />
          </SettingsField>

          <div
            style={{
              height: "1px",
              background: "var(--border)",
            }}
          />

          {/* Mess toggle row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
            }}
          >
            <div>
              <p style={{ fontSize: "13px", color: "var(--foreground)", fontWeight: 500 }}>
                Mess Enrolled
              </p>
              <p style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "2px" }}>
                Include mess fees in spending calculations
              </p>
            </div>
            <Switch checked={mess} onCheckedChange={setMess} />
          </div>

          <div
            style={{
              height: "1px",
              background: "var(--border)",
            }}
          />

          {/* Save button */}
          <div style={{ padding: "14px 18px" }}>
            <button
              id="btn-save-profile"
              onClick={saveProfile}
              disabled={saving}
              style={{
                width: "100%",
                padding: "11px 20px",
                background: saving
                  ? "rgba(255,107,0,0.3)"
                  : "var(--primary)",
                border: "none",
                borderRadius: "9px",
                color: "var(--primary-foreground)",
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                cursor: saving ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                fontFamily: "var(--font-sans)",
              }}
              onMouseEnter={(e) => {
                if (!saving)
                  (e.target as HTMLButtonElement).style.opacity = "0.85";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.opacity = "1";
              }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* ── COMPANION DEVICE ── */}
        <SectionHeader icon={<Smartphone size={13} />} label="COMPANION DEVICE" />
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            overflow: "hidden",
            marginBottom: "24px",
          }}
        >
          {profile.companion_paired ? (
            <div style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: "#4ade80",
                    boxShadow: "0 0 8px #4ade80",
                    animation: "pulse 2s infinite",
                  }}
                />
                <Wifi size={14} color="var(--muted-foreground)" />
                <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>
                  {profile.companion_device_name}
                </p>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--muted-foreground)",
                  fontFamily: "var(--font-mono)",
                  marginBottom: "14px",
                }}
              >
                Last sync:{" "}
                {profile.companion_last_sync ? shortDate(profile.companion_last_sync) : "—"}
              </p>
              <div style={{ display: "flex", gap: "10px" }}>
                <Link
                  to="/companion"
                  style={{
                    fontSize: "12px",
                    color: "var(--primary)",
                    textDecoration: "none",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  Manage Device <ChevronRight size={12} />
                </Link>
                <span style={{ color: "var(--border)" }}>·</span>
                <Link
                  to="/companion"
                  style={{
                    fontSize: "12px",
                    color: "var(--muted-foreground)",
                    textDecoration: "none",
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  View Sync Log <ChevronRight size={12} />
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <WifiOff size={14} color="var(--muted-foreground)" />
                <p style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>
                  No device connected
                </p>
              </div>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--muted-foreground)",
                  marginBottom: "14px",
                }}
              >
                Pair a companion device to automatically log UPI transactions.
              </p>
              <Link to="/companion">
                <button
                  style={{
                    padding: "9px 16px",
                    background: "transparent",
                    border: "1px solid rgba(255,107,0,0.4)",
                    borderRadius: "8px",
                    color: "var(--primary)",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    letterSpacing: "0.03em",
                    transition: "all 0.2s ease",
                    fontFamily: "var(--font-sans)",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = "var(--primary)";
                    (e.target as HTMLButtonElement).style.background = "rgba(255,107,0,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = "rgba(255,107,0,0.4)";
                    (e.target as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  Set Up Companion →
                </button>
              </Link>
            </div>
          )}
        </div>

        {/* ── TRACKED SUBSCRIPTIONS ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
          }}
        >
          <SectionHeader icon={<CreditCard size={13} />} label="TRACKED SUBSCRIPTIONS" noMargin />
          <button
            id="btn-add-sub"
            onClick={() => setAddingSub(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 12px",
              background: "rgba(255,107,0,0.12)",
              border: "1px solid rgba(255,107,0,0.3)",
              borderRadius: "20px",
              color: "var(--primary)",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.05em",
              cursor: "pointer",
              transition: "all 0.2s ease",
              fontFamily: "var(--font-sans)",
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget;
              btn.style.background = "rgba(255,107,0,0.22)";
              btn.style.borderColor = "rgba(255,107,0,0.6)";
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget;
              btn.style.background = "rgba(255,107,0,0.12)";
              btn.style.borderColor = "rgba(255,107,0,0.3)";
            }}
          >
            <Plus size={11} />
            ADD
          </button>
        </div>
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            overflow: "hidden",
            marginBottom: "24px",
          }}
        >
          {(subs ?? []).length === 0 ? (
            <div
              style={{
                padding: "32px 18px",
                textAlign: "center",
                color: "var(--muted-foreground)",
                fontSize: "13px",
              }}
            >
              No subscriptions tracked yet.
            </div>
          ) : (
            (subs ?? []).map((s: Sub, i: number) => (
              <div key={s.id}>
                {i > 0 && (
                  <div
                    style={{ height: "1px", background: "var(--border)", margin: "0 18px" }}
                  />
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 18px",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      "var(--surface-raised)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <p
                        style={{
                          fontSize: "13px",
                          fontWeight: 500,
                          color: "var(--foreground)",
                        }}
                      >
                        {s.service_name ?? s.name}
                      </p>
                      {s.detected_from === "auto_detected" && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            padding: "2px 6px",
                            background: "rgba(255,107,0,0.15)",
                            border: "1px solid rgba(255,107,0,0.3)",
                            borderRadius: "20px",
                            color: "var(--primary)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          AUTO
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--muted-foreground)",
                        marginTop: "2px",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {rupees(s.amount)} · next {shortDate(new Date(s.next_debit_date))}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <Switch
                      id={`switch-sub-${s.id}`}
                      checked={s.is_active}
                      onCheckedChange={(v) => toggleSub(s.id, v, s.service_name ?? s.name)}
                    />
                    <button
                      onClick={() => delSub(s.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "28px",
                        height: "28px",
                        borderRadius: "6px",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--muted-foreground)",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        const btn = e.currentTarget;
                        btn.style.background = "rgba(239,68,68,0.1)";
                        btn.style.borderColor = "rgba(239,68,68,0.3)";
                        btn.style.color = "#ef4444";
                      }}
                      onMouseLeave={(e) => {
                        const btn = e.currentTarget;
                        btn.style.background = "transparent";
                        btn.style.borderColor = "var(--border)";
                        btn.style.color = "var(--muted-foreground)";
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── DATA & EXPORT ── */}
        <SectionHeader icon={<Database size={13} />} label="DATA & EXPORT" />
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            overflow: "hidden",
            marginBottom: "24px",
          }}
        >
          <DataActionRow
            id="btn-export-csv"
            label="Export Transactions"
            description="Download all transactions as CSV"
            onClick={exportCsv}
          />
          <div style={{ height: "1px", background: "var(--border)", margin: "0 18px" }} />
          <DataActionRow
            id="btn-export-report"
            label="Export Spending Report"
            description="Current cycle summary as text"
            onClick={exportReport}
          />
          <div style={{ height: "1px", background: "var(--border)", margin: "0 18px" }} />
          <DataActionRow
            id="btn-reset-cycle"
            label="Reset Current Cycle"
            description="Permanently delete this cycle's transactions"
            onClick={resetCycle}
            danger
          />
        </div>

        {/* ── ACCOUNT ── */}
        <SectionHeader icon={<LogOut size={13} />} label="ACCOUNT" />
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "16px 18px" }}>
            <div style={{ marginBottom: "12px" }}>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--muted-foreground)",
                  fontFamily: "var(--font-mono)",
                  marginBottom: "2px",
                }}
              >
                SIGNED IN AS
              </p>
              <p style={{ fontSize: "14px", color: "var(--foreground)", fontWeight: 400 }}>
                {user?.email}
              </p>
            </div>
            <button
              id="btn-sign-out"
              onClick={signOut}
              style={{
                width: "100%",
                padding: "11px 20px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "9px",
                color: "#ef4444",
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                cursor: "pointer",
                transition: "all 0.2s ease",
                fontFamily: "var(--font-sans)",
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget;
                btn.style.background = "rgba(239,68,68,0.15)";
                btn.style.borderColor = "rgba(239,68,68,0.5)";
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget;
                btn.style.background = "rgba(239,68,68,0.08)";
                btn.style.borderColor = "rgba(239,68,68,0.25)";
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Add Subscription Dialog */}
      <Dialog open={addingSub} onOpenChange={setAddingSub}>
        <DialogContent
          id="dialog-add-sub"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
          }}
        >
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

/* ── Sub-components ── */

function SectionHeader({
  icon,
  label,
  noMargin,
}: {
  icon: React.ReactNode;
  label: string;
  noMargin?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "7px",
        marginBottom: noMargin ? "0" : "10px",
      }}
    >
      <span style={{ color: "var(--muted-foreground)" }}>{icon}</span>
      <span
        style={{
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "var(--muted-foreground)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function SettingsField({
  label,
  children,
  noBorderRight,
}: {
  label: string;
  children: React.ReactNode;
  noBorderRight?: boolean;
}) {
  return (
    <div
      className={`p-[14px] px-[18px] border-b last:border-b-0 md:border-b-0 border-border ${
        noBorderRight ? "md:border-r" : ""
      }`}
    >
      <label
        style={{
          fontSize: "12px",
          fontWeight: 600,
          letterSpacing: "0.1em",
          color: "var(--muted-foreground)",
          fontFamily: "var(--font-mono)",
          display: "block",
          marginBottom: "8px",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function DataActionRow({
  id,
  label,
  description,
  onClick,
  danger,
}: {
  id?: string;
  label: string;
  description: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      id={id}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 18px",
        background: hovered
          ? danger
            ? "rgba(239,68,68,0.05)"
            : "var(--surface-raised)"
          : "transparent",
        border: "none",
        cursor: "pointer",
        transition: "background 0.15s ease",
        textAlign: "left",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: danger ? "#ef4444" : "var(--foreground)",
          }}
        >
          {label}
        </p>
        <p style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "2px" }}>
          {description}
        </p>
      </div>
      <ChevronRight size={14} color={danger ? "#ef4444" : "var(--muted-foreground)"} />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  color: "var(--foreground)",
  fontSize: "13px",
  padding: "8px 12px",
  width: "100%",
  outline: "none",
  fontFamily: "var(--font-mono)",
  transition: "border-color 0.2s ease",
};

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
          billing_cycle: "monthly",
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
        <DialogTitle
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.9)",
            letterSpacing: "0.02em",
          }}
        >
          Track Subscription
        </DialogTitle>
      </DialogHeader>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "4px" }}>
        <div>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.3)",
              fontFamily: "var(--font-mono)",
              display: "block",
              marginBottom: "6px",
            }}
          >
            SERVICE NAME
          </label>
          <Input
            placeholder="Spotify, Netflix…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.3)",
              fontFamily: "var(--font-mono)",
              display: "block",
              marginBottom: "6px",
            }}
          >
            AMOUNT (₹)
          </label>
          <Input
            type="number"
            placeholder="199"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.3)",
              fontFamily: "var(--font-mono)",
              display: "block",
              marginBottom: "6px",
            }}
          >
            NEXT DEBIT DATE
          </label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
      <DialogFooter style={{ marginTop: "8px" }}>
        <button
          onClick={save}
          style={{
            width: "100%",
            padding: "11px 20px",
            background: "var(--primary)",
            border: "none",
            borderRadius: "9px",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            cursor: "pointer",
            transition: "opacity 0.2s ease",
            fontFamily: "var(--font-sans)",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.opacity = "0.85";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.opacity = "1";
          }}
        >
          Track Subscription
        </button>
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
