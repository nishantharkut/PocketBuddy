import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { seedDemoData } from "@/lib/seed.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  ssr: false,
  component: Onboarding,
});

const UPI_OPTIONS = ["Google Pay", "PhonePe", "Paytm", "Amazon Pay", "CRED"] as const;
const COLLEGES = ["ABV-IIITM Gwalior", "IIT Delhi", "IIT Bombay", "NIT Trichy", "BITS Pilani", "NIT Warangal", "IIIT Hyderabad", "Other"] as const;
const CYCLE_DAYS = [
  { v: 1, l: "1st of month" }, { v: 5, l: "5th" }, { v: 10, l: "10th" },
  { v: 15, l: "15th" }, { v: 28, l: "Last day" },
];

function randomPairingCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "PB-";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function Onboarding() {
  const { user } = useAuth();
  const nav = useNavigate();
  const seedFn = useServerFn(seedDemoData);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [allowance, setAllowance] = useState("8000");
  const [cycleDay, setCycleDay] = useState("1");
  const [college, setCollege] = useState("ABV-IIITM Gwalior");
  const [hostel, setHostel] = useState("BH-2");
  const [wing, setWing] = useState("Wing 4B");
  const [room, setRoom] = useState("412");

  // Step 2
  const [mess, setMess] = useState(true);
  const [meals, setMeals] = useState<{ breakfast: boolean; lunch: boolean; dinner: boolean }>({
    breakfast: false, lunch: true, dinner: true,
  });
  const [examStart, setExamStart] = useState("");
  const [examEnd, setExamEnd] = useState("");
  const [upiApps, setUpiApps] = useState<string[]>([]);

  // Step 3
  const pairingCode = useMemo(() => randomPairingCode(), []);

  // Pre-fill from existing profile
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      if (data.monthly_allowance) setAllowance(String(Math.round(data.monthly_allowance / 100)));
      if (data.cycle_start_day) setCycleDay(String(data.cycle_start_day));
      if (data.college_name) setCollege(data.college_name);
      if (data.hostel_block) setHostel(data.hostel_block);
      if (data.wing_label) setWing(data.wing_label);
      if (data.room_number) setRoom(data.room_number);
    });
  }, [user]);

  async function saveStep1() {
    if (!user) return;
    if (!allowance || !hostel || !wing || !room) {
      toast.error("Fill all fields"); return;
    }
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      monthly_allowance: Math.round(parseFloat(allowance) * 100),
      cycle_start_day: parseInt(cycleDay, 10),
      college_name: college, hostel_block: hostel, wing_label: wing, room_number: room,
    }).eq("id", user.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setStep(2);
  }

  async function saveStep2() {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      mess_enrolled: mess,
      meal_schedule: meals,
      upi_apps_used: upiApps.map((a) => a.toLowerCase().replace(/\s+/g, "")),
      exam_start_date: examStart || null,
      exam_end_date: examEnd || null,
    }).eq("id", user.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setStep(3);
  }

  async function finish(skipPairing: boolean) {
    if (!user) return;
    setBusy(true);
    await supabase.from("profiles").update({
      onboarding_completed: true,
      pairing_code: pairingCode,
      companion_paired: !skipPairing,
      companion_device_name: skipPairing ? null : "Redmi Note 12",
      companion_last_sync: skipPairing ? null : new Date().toISOString(),
    }).eq("id", user.id);
    // Seed demo data
    try { await seedFn(); } catch (e) { console.warn("seed", e); }
    setBusy(false);
    toast.success(skipPairing ? "Welcome! Add expenses manually." : "Device connected! 🎉");
    nav({ to: "/dashboard", replace: true });
  }

  function downloadApk() {
    toast("APK downloading. Open it from your notifications to install.");
  }

  function toggleUpi(app: string) {
    setUpiApps((prev) => prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app]);
  }

  const Dot = ({ active, done }: { active?: boolean; done?: boolean }) => (
    <span className={`h-2 w-2 rounded-full ${done ? "bg-[color:var(--pb-green)]" : active ? "bg-[color:var(--pb-blue)]" : "border border-border"}`} />
  );

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Dot done={step > 1} active={step === 1} />
          <Dot done={step > 2} active={step === 2} />
          <Dot active={step === 3} />
        </div>

        {step === 1 && (
          <div id="onboarding-step-1" className="space-y-5">
            <div>
              <h2 className="text-[18px] font-semibold">Let's set up your financial guard</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">This takes 60 seconds. No bank access needed.</p>
            </div>
            <Field label="Monthly Allowance" helper="Total amount you receive each month from family">
              <div className="flex items-center rounded-md border border-input bg-[color:var(--surface)]">
                <span className="px-3 text-sm text-muted-foreground">₹</span>
                <input id="input-ob-allowance" type="number" value={allowance} onChange={(e) => setAllowance(e.target.value)}
                  className="flex-1 bg-transparent py-2 pr-3 text-sm outline-none" />
              </div>
            </Field>
            <Field label="Allowance Arrives On" helper="Day your allowance hits your account">
              <Select value={cycleDay} onValueChange={setCycleDay}>
                <SelectTrigger id="select-ob-cycle"><SelectValue /></SelectTrigger>
                <SelectContent>{CYCLE_DAYS.map((d) => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="College">
              <Select value={college} onValueChange={setCollege}>
                <SelectTrigger id="select-ob-college"><SelectValue /></SelectTrigger>
                <SelectContent>{COLLEGES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Hostel Block"><Input id="input-ob-hostel" value={hostel} onChange={(e) => setHostel(e.target.value)} /></Field>
            <Field label="Wing / Floor" helper="Your hostel corridor — for pooling orders with neighbors">
              <Input id="input-ob-wing" value={wing} onChange={(e) => setWing(e.target.value)} />
            </Field>
            <Field label="Room Number"><Input id="input-ob-room" value={room} onChange={(e) => setRoom(e.target.value)} /></Field>
            <Button id="btn-ob-next-1" className="w-full" onClick={saveStep1} disabled={busy}>Next →</Button>
          </div>
        )}

        {step === 2 && (
          <div id="onboarding-step-2" className="space-y-5">
            <div>
              <h2 className="text-[18px] font-semibold">Your daily routine</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Helps us detect meal-skipping patterns.</p>
            </div>
            <Field label="Enrolled in Hostel Mess?">
              <div id="toggle-ob-mess" className="grid grid-cols-2 gap-2">
                <button onClick={() => setMess(true)} className={`rounded-md border bg-[color:var(--surface)] p-3 text-left text-sm ${mess ? "border-l-4 border-l-[color:var(--pb-green)]" : "border-border"}`}>Yes, mess enrolled</button>
                <button onClick={() => setMess(false)} className={`rounded-md border bg-[color:var(--surface)] p-3 text-left text-sm ${!mess ? "border-l-4 border-l-[color:var(--pb-amber)]" : "border-border"}`}>No, self-catering</button>
              </div>
            </Field>
            {mess && (
              <Field label="Meals You Typically Eat">
                <div id="pills-ob-meals" className="flex gap-2">
                  {(["breakfast", "lunch", "dinner"] as const).map((m) => (
                    <button key={m} onClick={() => setMeals({ ...meals, [m]: !meals[m] })}
                      className={`rounded-full px-4 py-1.5 text-sm capitalize transition-colors ${meals[m] ? "bg-[color:var(--pb-blue)] text-white" : "bg-[color:var(--surface)] text-muted-foreground"}`}>
                      {m === "breakfast" ? "🌅" : m === "lunch" ? "☀️" : "🌙"} {m}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <div>
              <p className="text-[12px] text-muted-foreground">Upcoming exams (optional)</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input id="input-ob-exam-start" type="date" value={examStart} onChange={(e) => setExamStart(e.target.value)} />
                <Input id="input-ob-exam-end" type="date" value={examEnd} onChange={(e) => setExamEnd(e.target.value)} />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">We'll watch for meal-skipping during this window</p>
            </div>
            <Field label="UPI Apps You Use">
              <div id="pills-ob-upi" className="flex flex-wrap gap-2">
                {UPI_OPTIONS.map((app) => {
                  const on = upiApps.includes(app);
                  return (
                    <button key={app} onClick={() => toggleUpi(app)}
                      className={`rounded-full px-3 py-1.5 text-xs ${on ? "bg-[color:var(--pb-purple)] text-white" : "bg-[color:var(--surface)] text-muted-foreground"}`}>
                      {app}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="flex items-center justify-between">
              <button onClick={() => setStep(1)} className="text-sm text-muted-foreground">← Back</button>
              <Button id="btn-ob-next-2" onClick={saveStep2} disabled={busy}>Next →</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div id="onboarding-step-3" className="space-y-5">
            <div>
              <h2 className="text-[18px] font-semibold">Last step — auto-track spending</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Install our tiny companion app to capture UPI notifications automatically. No bank access, no passwords.</p>
            </div>
            <div className="flex gap-2">
              {[{ e: "📲", l: "Install APK" }, { e: "🔔", l: "Grant notification access" }, { e: "✨", l: "Auto-syncs expenses" }].map((c) => (
                <div key={c.l} className="flex-1 rounded-lg bg-[color:var(--surface-raised)] p-3 text-center">
                  <div className="text-2xl">{c.e}</div>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-tight">{c.l}</p>
                </div>
              ))}
            </div>
            <button onClick={downloadApk} className="w-full rounded-lg border-2 border-[color:var(--pb-blue)] bg-[color:var(--surface-raised)] p-5 text-center">
              <div className="text-[15px] font-semibold text-[color:var(--pb-blue)]">⬇ Download PocketBuddy Companion</div>
              <p className="mt-1 text-[12px] text-muted-foreground">Android only • 1.2 MB • No sign-in required</p>
            </button>
            <div className="text-center">
              <p className="text-[12px] text-muted-foreground">Your pairing code:</p>
              <div id="text-pairing-code" className="mt-2 inline-block rounded-md bg-[color:var(--surface-raised)] px-5 py-3 text-[24px] font-bold tracking-[4px] text-[color:var(--pb-blue)] font-mono">
                {pairingCode}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Enter this code in the companion app after installing</p>
            </div>
            <div className="space-y-2">
              <Button id="btn-ob-verify" onClick={() => finish(false)} disabled={busy}
                className="w-full bg-[color:var(--pb-green)] text-white hover:bg-[color:var(--pb-green)]/90">
                I've installed it — verify connection
              </Button>
              <button id="link-ob-skip" onClick={() => finish(true)} disabled={busy} className="w-full text-center text-[13px] text-muted-foreground py-2">
                Skip for now — I'll add expenses manually
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[13px] font-medium text-foreground">{label}</label>
      <div className="mt-1.5">{children}</div>
      {helper && <p className="mt-1 text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  );
}
