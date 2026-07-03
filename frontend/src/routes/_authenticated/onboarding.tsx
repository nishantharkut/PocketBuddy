import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getProfile, updateProfile, getCatalog, addCatalogItem } from "@/lib/api/db.functions.js";
import { Smartphone } from "lucide-react";

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

export const Route = createFileRoute("/_authenticated/onboarding")({
  ssr: false,
  component: Onboarding,
});

// Fallback constants used ONLY when catalog API fails
const FALLBACK_UPI_OPTIONS = ["Google Pay", "PhonePe", "Paytm", "Amazon Pay", "CRED"];
const FALLBACK_COLLEGES = [
  "ABV-IIITM Gwalior",
  "IIT Delhi",
  "IIT Bombay",
  "NIT Trichy",
  "BITS Pilani",
  "NIT Warangal",
  "IIIT Hyderabad",
];

const CYCLE_DAYS = [
  { v: 1, l: "1st of month" },
  { v: 5, l: "5th" },
  { v: 10, l: "10th" },
  { v: 15, l: "15th" },
  { v: 28, l: "Last day" },
];

function Onboarding() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);

  const isAndroid = typeof window !== "undefined" && /android/i.test(window.navigator.userAgent);

  async function launchAutoConfigure() {
    if (!user) return;
    setBusy(true);
    try {
      const code = randomPairingCode();
      await updateProfile({
        data: {
          pairing_code: code,
          onboarding_completed: true,
          setup_completed: true,
          companion_paired: false,
          companion_device_name: null,
          companion_last_sync: null,
        },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      
      const webhookUrl = getCompanionWebhookUrl();
      const deepLinkUrl = `pocketbuddy://configure?webhook_url=${encodeURIComponent(webhookUrl)}&user_id=${encodeURIComponent(user.id)}&webhook_token=${encodeURIComponent(code)}&account_email=${encodeURIComponent(user.email)}`;
      
      toast.success("Redirecting to auto-configure...");
      setTimeout(() => {
        window.location.href = deepLinkUrl;
        nav({ to: "/companion", replace: true });
      }, 800);
    } catch (err: any) {
      toast.error(err.message || "Failed to start auto configure");
    } finally {
      setBusy(false);
    }
  }

  // Step 1 — starts empty (no prefilled demo data)
  const [allowance, setAllowance] = useState("");
  const [cycleDay, setCycleDay] = useState("1");
  const [college, setCollege] = useState("");
  const [hostel, setHostel] = useState("");
  const [wing, setWing] = useState("");
  const [room, setRoom] = useState("");
  const [phone, setPhone] = useState("");

  // College search/add
  const [collegeSearch, setCollegeSearch] = useState("");
  const [collegeDropdownOpen, setCollegeDropdownOpen] = useState(false);
  const [addingCollege, setAddingCollege] = useState(false);

  // Step 2
  const [mess, setMess] = useState(true);
  const [meals, setMeals] = useState<{ breakfast: boolean; lunch: boolean; dinner: boolean }>({
    breakfast: false,
    lunch: true,
    dinner: true,
  });
  const [examStart, setExamStart] = useState("");
  const [examEnd, setExamEnd] = useState("");
  const [upiApps, setUpiApps] = useState<string[]>([]);
  const [customUpiInput, setCustomUpiInput] = useState("");
  const [showCustomUpi, setShowCustomUpi] = useState(false);

  // Catalog queries
  const { data: catalogColleges } = useQuery({
    queryKey: ["catalog", "campuses"],
    enabled: !!user,
    queryFn: () => getCatalog("campuses"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: catalogUpi } = useQuery({
    queryKey: ["catalog", "payment-providers"],
    enabled: !!user,
    queryFn: () => getCatalog("payment-providers"),
    staleTime: 5 * 60 * 1000,
  });

  const collegeOptions = useMemo(() => {
    if (catalogColleges && catalogColleges.length > 0) {
      return catalogColleges.map((c: any) => c.label);
    }
    return FALLBACK_COLLEGES;
  }, [catalogColleges]);

  const upiOptions = useMemo(() => {
    if (catalogUpi && catalogUpi.length > 0) {
      return catalogUpi.map((u: any) => u.label);
    }
    return FALLBACK_UPI_OPTIONS;
  }, [catalogUpi]);

  const filteredColleges = useMemo(() => {
    if (!collegeSearch.trim()) return collegeOptions;
    const q = collegeSearch.toLowerCase();
    return collegeOptions.filter((c: string) => c.toLowerCase().includes(q));
  }, [collegeOptions, collegeSearch]);

  // Pre-fill from existing profile
  useEffect(() => {
    if (!user) return;
    getProfile()
      .then((data) => {
        if (!data) return;
        if (data.monthly_allowance) setAllowance(String(Math.round(data.monthly_allowance / 100)));
        if (data.cycle_start_day) setCycleDay(String(data.cycle_start_day));
        if (data.college_name) {
          setCollege(data.college_name);
          setCollegeSearch(data.college_name);
        }
        if (data.hostel_block) setHostel(data.hostel_block);
        if (data.wing_label) setWing(data.wing_label);
        if (data.room_number) setRoom(data.room_number);
        if (data.phone) setPhone(data.phone);
      })
      .catch((err) => console.error("Onboarding profile load error:", err));
  }, [user]);

  async function handleAddCollege(name: string) {
    if (!name.trim()) return;
    setAddingCollege(true);
    try {
      await addCatalogItem("campuses", { label: name.trim() });
      qc.invalidateQueries({ queryKey: ["catalog", "campuses"] });
      setCollege(name.trim());
      setCollegeSearch(name.trim());
      setCollegeDropdownOpen(false);
      toast.success(`"${name.trim()}" added to colleges`);
    } catch (err: any) {
      toast.error(err.message || "Failed to add college");
    } finally {
      setAddingCollege(false);
    }
  }

  async function handleAddUpi() {
    const name = customUpiInput.trim();
    if (!name) return;
    try {
      await addCatalogItem("payment-providers", { label: name });
      qc.invalidateQueries({ queryKey: ["catalog", "payment-providers"] });
      setUpiApps((prev) => [...prev, name]);
      setCustomUpiInput("");
      setShowCustomUpi(false);
      toast.success(`"${name}" added`);
    } catch (err: any) {
      toast.error(err.message || "Failed to add UPI app");
    }
  }

  async function saveStep1() {
    if (!user) return;
    if (!allowance || !college || !phone) {
      toast.error("Please enter monthly allowance, college, and phone number");
      return;
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }
    setBusy(true);
    try {
      await updateProfile({
        data: {
          monthly_allowance: Math.round(parseFloat(allowance) * 100),
          cycle_start_day: parseInt(cycleDay, 10),
          college_name: college,
          hostel_block: hostel || null,
          wing_label: wing || null,
          room_number: room || null,
          phone: cleanPhone,
        },
      });
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || "Failed to save details");
    } finally {
      setBusy(false);
    }
  }

  async function saveStep2() {
    if (!user) return;
    setBusy(true);
    try {
      await updateProfile({
        data: {
          mess_enrolled: mess,
          meal_schedule: meals,
          upi_apps_used: upiApps.map((a) => a.toLowerCase().replace(/\s+/g, "")),
          exam_start_date: examStart || null,
          exam_end_date: examEnd || null,
        },
      });
      setStep(3);
    } catch (err: any) {
      toast.error(err.message || "Failed to save details");
    } finally {
      setBusy(false);
    }
  }

  async function finish(connectCompanion: boolean) {
    if (!user) return;
    setBusy(true);
    try {
      await updateProfile({
        data: {
          onboarding_completed: true,
          setup_completed: true,
          companion_paired: false,
          companion_device_name: null,
          companion_last_sync: null,
        },
      });
      if (connectCompanion) {
        toast.success("Profile saved. Finish Android setup from the companion page.");
        nav({ to: "/companion", replace: true });
        return;
      }
      toast.success("Welcome. You can add expenses manually.");
      nav({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message || "Failed to complete onboarding");
    } finally {
      setBusy(false);
    }
  }

  function toggleUpi(app: string) {
    setUpiApps((prev) => (prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app]));
  }

  const StepBar = ({ currentStep }: { currentStep: number }) => (
    <div className="flex gap-2 w-full max-w-[280px] mx-auto mb-10">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex-1 h-0.5 bg-border rounded-full overflow-hidden">
          <div
            className={`h-full bg-primary transition-all duration-300 ${
              s <= currentStep ? "w-full" : "w-0"
            }`}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-12 relative overflow-hidden">
      {/* Cinematic light overlay */}
      <div className="absolute top-0 right-0 h-[350px] w-[350px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />
      
      <div className="w-full max-w-[400px] relative z-10">
        <StepBar currentStep={step} />

        {step === 1 && (
          <div id="onboarding-step-1" className="space-y-6">
            <div className="mb-2">
              <h2 className="text-[20px] font-black tracking-tight text-foreground uppercase">Campus Financial Guard</h2>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Set up your profile in 60 seconds. No bank logins needed.
              </p>
            </div>
            
            <Field
              label="Monthly Allowance"
              helper="Total amount you receive each month from family"
            >
              <div className="flex items-center rounded-md border border-border bg-surface-raised/40 hover:border-white/15 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/40 transition-all">
                <span className="px-3 text-xs text-muted-foreground font-bold border-r border-border">₹</span>
                <input
                  id="input-ob-allowance"
                  type="number"
                  value={allowance}
                  onChange={(e) => setAllowance(e.target.value)}
                  placeholder="e.g. 8000"
                  className="flex-1 bg-transparent py-2.5 px-3 text-xs outline-none text-foreground placeholder:text-zinc-600"
                />
              </div>
            </Field>

            <Field label="Allowance Arrives On" helper="Day your allowance hits your account">
              <Select value={cycleDay} onValueChange={setCycleDay}>
                <SelectTrigger id="select-ob-cycle" className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CYCLE_DAYS.map((d) => (
                    <SelectItem key={d.v} value={String(d.v)}>
                      {d.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="College" helper="Search or add your college">
              <div className="relative">
                <input
                  id="input-ob-college-search"
                  type="text"
                  value={collegeSearch}
                  onChange={(e) => {
                    setCollegeSearch(e.target.value);
                    setCollegeDropdownOpen(true);
                    // Clear selection if user is typing something different
                    if (college && e.target.value !== college) {
                      setCollege("");
                    }
                  }}
                  onFocus={() => setCollegeDropdownOpen(true)}
                  onBlur={() => {
                    // Delay close to allow click events on dropdown items
                    setTimeout(() => setCollegeDropdownOpen(false), 200);
                  }}
                  placeholder="Search or add your college..."
                  className="w-full h-10 rounded-md border border-border bg-surface-raised/40 px-3 text-xs outline-none text-foreground placeholder:text-zinc-600 hover:border-white/15 focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
                />
                {college && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-xs">✓</span>
                )}
                {collegeDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full max-h-48 overflow-auto rounded-md border border-border bg-surface shadow-xl shadow-black/40 py-1">
                    {filteredColleges.map((c: string) => (
                      <button
                        key={c}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setCollege(c);
                          setCollegeSearch(c);
                          setCollegeDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-surface-raised transition-colors cursor-pointer ${
                          college === c ? "text-primary font-bold" : "text-foreground"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                    {collegeSearch.trim() && !collegeOptions.some((c: string) => c.toLowerCase() === collegeSearch.trim().toLowerCase()) && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleAddCollege(collegeSearch)}
                        disabled={addingCollege}
                        className="w-full text-left px-3 py-2.5 text-xs text-primary font-bold border-t border-border hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <span className="bg-primary/10 border border-primary/20 rounded-full w-4 h-4 inline-flex items-center justify-center text-[10px] font-black">+</span>
                        Add "{collegeSearch.trim()}"
                      </button>
                    )}
                    {filteredColleges.length === 0 && !collegeSearch.trim() && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No colleges loaded</p>
                    )}
                  </div>
                )}
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Hostel Block">
                <Input
                  id="input-ob-hostel"
                  value={hostel}
                  onChange={(e) => setHostel(e.target.value)}
                  placeholder="e.g. BH-2"
                  className="h-10"
                />
              </Field>
              <Field label="Room Number">
                <Input 
                  id="input-ob-room" 
                  value={room} 
                  onChange={(e) => setRoom(e.target.value)} 
                  placeholder="e.g. 412"
                  className="h-10"
                />
              </Field>
            </div>

            <Field
              label="WhatsApp Phone Number *"
              helper="Used for automated split alerts and pool coordination"
            >
              <Input
                id="input-ob-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="h-10"
              />
            </Field>

            <Field
              label="Wing / Corridor"
              helper="Used to group delivery fee pooling with neighbors"
            >
              <Input 
                id="input-ob-wing" 
                value={wing} 
                onChange={(e) => setWing(e.target.value)} 
                placeholder="e.g. Wing 4B"
                className="h-10"
              />
            </Field>

            <Button id="btn-ob-next-1" className="w-full h-10 bg-foreground text-background font-black uppercase tracking-wider text-xs shadow-md mt-2" onClick={saveStep1} disabled={busy}>
              Next Step →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div id="onboarding-step-2" className="space-y-6">
            <div className="mb-2">
              <h2 className="text-[20px] font-black tracking-tight text-foreground uppercase">Your Daily Routine</h2>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Helps us spot study stress and meal-skipping patterns.
              </p>
            </div>

            <Field label="Enrolled in Hostel Mess?">
              <div id="toggle-ob-mess" className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMess(true)}
                  className={`rounded-md border p-3.5 text-left text-xs transition-all cursor-pointer ${mess ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border bg-surface-raised/40 text-muted-foreground hover:border-white/10"}`}
                >
                  <p className="font-bold">Yes</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Mess enrolled</p>
                </button>
                <button
                  onClick={() => setMess(false)}
                  className={`rounded-md border p-3.5 text-left text-xs transition-all cursor-pointer ${!mess ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border bg-surface-raised/40 text-muted-foreground hover:border-white/10"}`}
                >
                  <p className="font-bold">No</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Self-catering</p>
                </button>
              </div>
            </Field>

            {mess && (
              <Field label="Meals You Typically Eat">
                <div id="pills-ob-meals" className="flex gap-2">
                  {(["breakfast", "lunch", "dinner"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMeals({ ...meals, [m]: !meals[m] })}
                      className={`flex-1 rounded-full py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${meals[m] ? "bg-primary border-primary text-primary-foreground" : "bg-surface-raised border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">Upcoming Exams (Optional)</label>
              <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 pl-1">Start Date</span>
                  <Input
                    id="input-ob-exam-start"
                    type="date"
                    value={examStart}
                    onChange={(e) => setExamStart(e.target.value)}
                    className="h-10 text-sm w-full"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 pl-1">End Date</span>
                  <Input
                    id="input-ob-exam-end"
                    type="date"
                    value={examEnd}
                    onChange={(e) => setExamEnd(e.target.value)}
                    className="h-10 text-sm w-full"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-zinc-500 pl-1 leading-normal">
                We will monitor your schedule during this stressful period.
              </p>
            </div>

            <Field label="UPI Apps You Use">
              <div id="pills-ob-upi" className="flex flex-wrap gap-2">
                {upiOptions.map((app: string) => {
                  const on = upiApps.includes(app);
                  return (
                    <button
                      key={app}
                      onClick={() => toggleUpi(app)}
                      className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border ${on ? "bg-primary border-primary text-primary-foreground" : "bg-surface-raised border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {app}
                    </button>
                  );
                })}
                {!showCustomUpi ? (
                  <button
                    onClick={() => setShowCustomUpi(true)}
                    className="rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border border-dashed border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50"
                  >
                    + Add Another
                  </button>
                ) : (
                  <div className="flex gap-1.5 w-full mt-1">
                    <input
                      type="text"
                      value={customUpiInput}
                      onChange={(e) => setCustomUpiInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddUpi(); }}
                      placeholder="e.g. CRED, Kotak811"
                      autoFocus
                      className="flex-1 rounded-md border border-border bg-surface-raised/40 px-3 py-1.5 text-[10px] outline-none text-foreground placeholder:text-zinc-600 focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all"
                    />
                    <button
                      onClick={handleAddUpi}
                      className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowCustomUpi(false); setCustomUpiInput(""); }}
                      className="rounded-md border border-border px-2 py-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4 items-center pt-2">
              <button
                onClick={() => setStep(1)}
                className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground text-left py-2 transition-colors cursor-pointer"
              >
                ← Back
              </button>
              <Button id="btn-ob-next-2" onClick={saveStep2} disabled={busy} className="h-10 bg-foreground text-background font-black uppercase tracking-wider text-xs shadow-md">
                Next Step →
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div id="onboarding-step-3" className="space-y-6">
            <div className="mb-2">
              <h2 className="text-[20px] font-black tracking-tight text-foreground uppercase">Auto-Track Expense</h2>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Set up the Android connector once. After that, PocketBuddy can sync supported UPI payment alerts automatically.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { e: "01", l: "Install App" },
                { e: "02", l: "Paste Config" },
                { e: "03", l: "Allow Access" },
              ].map((c) => (
                <div
                  key={c.l}
                  className="rounded-lg bg-surface-raised border border-border p-3 text-center"
                >
                  <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary">
                    {c.e}
                  </div>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">{c.l}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-surface-raised/40 p-4 space-y-1">
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">
                What you will do next
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The next page gives you one copy button. Open the Android app, tap paste, save, and allow notification access. You do not need to type any code manually.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-raised p-5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Simple setup steps
              </p>
              <ol className="mt-3 space-y-3 text-[12px] leading-relaxed text-muted-foreground">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                    1
                  </span>
                  <span>Install and open the PocketBuddy Connector app on your Android phone.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                    2
                  </span>
                  <span>On the next web page, tap <b className="text-foreground">Copy Android config</b>.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                    3
                  </span>
                  <span>In the Android app, tap <b className="text-foreground">Paste config</b>, then <b className="text-foreground">Save connector config</b>.</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                    4
                  </span>
                  <span>Tap <b className="text-foreground">Open notification access</b> and allow PocketBuddy Connector.</span>
                </li>
              </ol>
            </div>

            <div className="space-y-3 pt-2">
              {/* One-Tap Auto Configure */}
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-[13px] font-bold text-foreground">One-Tap Auto Configure</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  If you're on Android, tap the button below to instantly launch the connector app and apply all config fields automatically — no copy-paste needed.
                </p>
                {isAndroid ? (
                  <Button
                    onClick={launchAutoConfigure}
                    disabled={busy}
                    className="w-full h-10 bg-primary text-primary-foreground font-black uppercase tracking-wider text-xs"
                  >
                    One-Tap Auto Configure
                  </Button>
                ) : (
                  <div className="rounded-lg bg-card border border-border p-3 text-[11px] text-muted-foreground leading-normal">
                    💡 <b>On Desktop?</b> Log in to PocketBuddy on your Android phone's browser, come back to this step, and tap this button to auto-configure.
                  </div>
                )}
              </div>

              <Button
                id="btn-ob-continue-companion"
                onClick={() => finish(true)}
                disabled={busy}
                className="w-full h-10 bg-foreground text-background font-black uppercase tracking-wider text-xs shadow-md"
              >
                Continue to Sync Setup
              </Button>
              <button
                id="link-ob-skip"
                onClick={() => finish(false)}
                disabled={busy}
                className="w-full text-center text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground py-2 transition-colors cursor-pointer"
              >
                Skip — I will log manually
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest pl-1">{label}</label>
      <div>{children}</div>
      {helper && <p className="text-[10px] text-zinc-500 pl-1 leading-normal">{helper}</p>}
    </div>
  );
}
