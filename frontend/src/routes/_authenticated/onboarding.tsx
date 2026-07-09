import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { BankConsentDialog, type BankConsentPayload } from "@/components/privacy/BankConsentDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createCompanionPairingToken, getProfile, updateProfile, getCatalog, addCatalogItem, startAccountAggregatorSandboxConsent } from "@/lib/api/db.functions.js";
import { ShieldCheck, Smartphone } from "lucide-react";

const LOCAL_WEBHOOK_URL = "http://127.0.0.1:8000/api/ingest/notification-v2";

function getCompanionWebhookUrl() {
  const configuredUrl = import.meta.env.VITE_CONNECTOR_WEBHOOK_URL?.trim();
  if (configuredUrl) return configuredUrl;
  if (typeof window === "undefined") return LOCAL_WEBHOOK_URL;
  const { hostname, origin } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  return isLocalhost ? LOCAL_WEBHOOK_URL : `${origin}/api/ingest/notification-v2`;
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
  const [bankConsentDialogOpen, setBankConsentDialogOpen] = useState(false);
  const [connectPath, setConnectPath] = useState<"android" | "sandbox">("android");

  const isAndroid = typeof window !== "undefined" && /android/i.test(window.navigator.userAgent);

  async function launchAutoConfigure() {
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
      const tokenResult = await createCompanionPairingToken();
      const code = tokenResult?.pairing_token;
      if (!code) {
        throw new Error("Could not create connector setup token");
      }
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

  async function connectBankFromOnboarding(payload: BankConsentPayload) {
    if (!user) return;
    setBusy(true);
    try {
      await startAccountAggregatorSandboxConsent({
        data: {
          purpose: "Preview the consent sandbox for PocketBuddy insights",
          requested_range_days: payload.requestedRangeDays,
          fi_types: ["DEPOSIT"],
          aa_handle: payload.aaHandle || null,
          bank_code: payload.bankCode,
          bank_name: payload.bankName,
          bank_short_name: payload.bankShortName,
          selected_accounts: payload.selectedAccounts,
        },
      });
      await updateProfile({
        data: {
          onboarding_completed: true,
          setup_completed: true,
        },
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["aa-status", user.id] });
      setBankConsentDialogOpen(false);
      toast.success("Sandbox consent started. Review it from Privacy Center.");
      nav({ to: "/privacy", replace: true });
    } catch (err: any) {
      toast.error(err.message || "Consent sandbox is unavailable right now. You can continue with phone sync or manual logging.");
    } finally {
      setBusy(false);
    }
  }

  // Step 1 starts empty.
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
  const [residenceType, setResidenceType] = useState("hostel");
  const [mealRoutine, setMealRoutine] = useState("hostel_mess");
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
        if (data.residence_type) setResidenceType(data.residence_type);
        if (data.meal_routine) setMealRoutine(data.meal_routine);
        if (typeof data.mess_enrolled === "boolean") setMess(data.mess_enrolled);
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
          residence_type: residenceType,
          meal_routine: mealRoutine,
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
    <div className="flex gap-2 w-full max-w-[360px] mx-auto mb-6 lg:mb-7">
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
    <div className="flex min-h-dvh items-start justify-center bg-background px-4 py-6 sm:px-6 lg:px-8 lg:py-8 relative overflow-x-hidden">
      {/* Cinematic light overlay */}
      <div className="absolute top-0 right-0 h-[350px] w-[350px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />
      
      <div
        className={`w-full relative z-10 ${
          step === 3 ? "max-w-[1040px]" : "max-w-[760px]"
        }`}
      >
        <StepBar currentStep={step} />

        {step === 1 && (
          <div id="onboarding-step-1" className="space-y-4">
            <div className="mb-2">
              <h2 className="text-[20px] font-black tracking-tight text-foreground uppercase">Campus Financial Guard</h2>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Set up your profile in 60 seconds. No bank logins needed.
              </p>
            </div>
            
            <div className="grid gap-3 sm:grid-cols-2">
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
                  className="min-w-0 flex-1 bg-transparent py-2.5 px-3 text-xs outline-none text-foreground placeholder:text-zinc-600"
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
            </div>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            </div>

            <Button id="btn-ob-next-1" className="w-full h-10 bg-foreground text-background font-black uppercase tracking-wider text-xs shadow-md" onClick={saveStep1} disabled={busy}>
              Next Step →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div id="onboarding-step-2" className="space-y-4">
            <div className="mb-2">
              <h2 className="text-[20px] font-black tracking-tight text-foreground uppercase">Your Daily Routine</h2>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Helps PocketBuddy keep meal and runway nudges practical during busy weeks.
              </p>
            </div>

            <Field label="Enrolled in Hostel Mess?">
              <div id="toggle-ob-mess" className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setMess(true);
                    setResidenceType("hostel");
                    setMealRoutine("hostel_mess");
                  }}
                  className={`rounded-md border p-3.5 text-left text-xs transition-all cursor-pointer ${mess ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border bg-surface-raised/40 text-muted-foreground hover:border-white/10"}`}
                >
                  <p className="font-bold">Yes</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Mess enrolled</p>
                </button>
                <button
                  onClick={() => {
                    setMess(false);
                    if (mealRoutine === "hostel_mess") setMealRoutine("mixed");
                  }}
                  className={`rounded-md border p-3.5 text-left text-xs transition-all cursor-pointer ${!mess ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border bg-surface-raised/40 text-muted-foreground hover:border-white/10"}`}
                >
                  <p className="font-bold">No</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Self-catering</p>
                </button>
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Living Setup">
                <Select
                  value={residenceType}
                  onValueChange={(value) => {
                    setResidenceType(value);
                    if (value === "hostel") {
                      setMess(true);
                      setMealRoutine("hostel_mess");
                    }
                    if (value === "pg") {
                      setMess(false);
                      setMealRoutine("pg_cooking");
                    }
                    if (value === "day_scholar") {
                      setMess(false);
                      setMealRoutine("day_scholar");
                    }
                  }}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Select setup" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hostel">Hostel / dorm</SelectItem>
                    <SelectItem value="pg">PG / rented room</SelectItem>
                    <SelectItem value="day_scholar">Day scholar / commute</SelectItem>
                    <SelectItem value="mixed">Mixed routine</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Meal Routine">
                <Select value={mealRoutine} onValueChange={setMealRoutine}>
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Select routine" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hostel_mess">Hostel mess / campus meals</SelectItem>
                    <SelectItem value="pg_cooking">PG cooking / groceries</SelectItem>
                    <SelectItem value="day_scholar">Day scholar meals</SelectItem>
                    <SelectItem value="mixed">Mixed routine</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

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
                Exam dates only adjust meal check-ins and safe-spend reminders.
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
          <div id="onboarding-step-3" className="space-y-4">
            <div className="mb-2">
              <h2 className="text-[20px] font-black tracking-tight text-foreground uppercase">Connect Safely</h2>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Choose how PocketBuddy should track student spending. Android auto-sync is the working path for instant UPI alerts; the consent sandbox previews how regulated read-only bank access would work.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
              <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-1">
              <button
                type="button"
                onClick={() => setConnectPath("android")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  connectPath === "android"
                    ? "border-primary/45 bg-primary/10 shadow-sm"
                    : "border-border bg-surface-raised/60 hover:border-primary/25 hover:bg-primary/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                    connectPath === "android" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                  }`}>
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-bold text-foreground">Android Auto-Sync</p>
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary-foreground">
                        Recommended
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Best for the live product: supported UPI and SMS alerts are parsed on-device,
                      then sent as structured transaction fields.
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConnectPath("sandbox")}
                className={`rounded-xl border p-4 text-left transition-all ${
                  connectPath === "sandbox"
                    ? "border-primary/45 bg-primary/10 shadow-sm"
                    : "border-border bg-surface-raised/60 hover:border-primary/25 hover:bg-primary/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${
                    connectPath === "sandbox"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground"
                  }`}>
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-bold text-foreground">Consent Sandbox</p>
                      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        Demo
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Shows the AA-style control flow: identifier, institution, masked accounts,
                      consent, fetch, and revoke. Privacy-first and recommended for iOS users.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="rounded-lg border border-border bg-surface-raised/40 p-4 space-y-1">
              <p className="text-xs font-bold text-foreground uppercase tracking-wider">
                What this setup means
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {connectPath === "android"
                  ? "Phone sync parses supported payment alerts on your device, sends only structured transaction fields, and can be paused or removed anytime from Privacy Center."
                  : "The consent sandbox previews a regulated read-only bank data journey with masked accounts. It is privacy-safe for demo, useful for iOS positioning, and never connects to a live bank account."}
              </p>
            </div>
              </div>

              <div className="min-w-0">

            {connectPath === "android" ? (
              <div className="space-y-3 pt-2">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Smartphone className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-foreground">Set up Android auto-sync</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                          Use this path for real passive tracking. You can still skip and log manually.
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() =>
                        document
                          .getElementById("android-sync-setup")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }
                      disabled={busy}
                      className="h-9 w-full shrink-0 bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider sm:w-fit"
                    >
                      View Steps
                    </Button>
                  </div>
                </div>

                <div id="android-sync-setup" className="rounded-xl border border-border bg-surface-raised p-5 scroll-mt-6">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Android auto-sync setup
                  </p>
                  <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    <p className="font-bold text-foreground">What the connector sends</p>
                    <p className="mt-1">
                      PocketBuddy uploads transaction facts only: amount, merchant, direction, source app, reference, confidence, and a masked preview.
                    </p>
                    <p className="mt-1">
                      It never asks for MPIN, OTP, bank login, full SMS inbox access, or permission to initiate payments.
                    </p>
                  </div>
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
                      <span>On the Android phone, tap <b className="text-foreground">One-Tap Auto Configure</b> from PocketBuddy web.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                        3
                      </span>
                      <span>The connector opens with the server, account, and pairing fields filled from this signed-in session.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                        4
                      </span>
                      <span>Tap <b className="text-foreground">Open notification access</b> and allow PocketBuddy Connector.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">
                        5
                      </span>
                      <span>Open <b className="text-foreground">Privacy Center</b> anytime to pause sync, unpair the device, view provenance labels, or review low-confidence entries.</span>
                    </li>
                  </ol>
                </div>

                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-[13px] font-bold text-foreground">One-Tap Auto Configure</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    If you're on Android, tap the button below to launch the connector and link this account without typing any setup values.
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
                      <b>On desktop?</b> Log in to PocketBuddy on your Android phone's browser, come back to this step, and tap this button to auto-configure.
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
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-foreground">Preview consent sandbox</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        This path shows how a privacy-first, AA-style consent journey would work for students who cannot use Android notification access, especially iOS users. It uses a sandbox identifier, masked demo accounts, read-only terms, and revocation controls.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-background p-3">
                      <b className="block text-foreground">1. Identify</b>
                      Enter a sandbox AA identity and choose an institution.
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <b className="block text-foreground">2. Select</b>
                      Review masked sandbox accounts before sharing anything.
                    </div>
                    <div className="rounded-lg border border-border bg-background p-3">
                      <b className="block text-foreground">3. Control</b>
                      Approve, fetch, and revoke from Privacy Center.
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={() => setBankConsentDialogOpen(true)}
                      disabled={busy}
                      className="h-10 w-full bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider sm:w-fit"
                    >
                      Open Consent Sandbox
                    </Button>
                    <Button
                      onClick={() => finish(false)}
                      disabled={busy}
                      variant="outline"
                      className="h-10 w-full text-xs font-black uppercase tracking-wider sm:w-fit"
                    >
                      Continue to Dashboard
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-1">
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
            </div>
          </div>
        )}
      </div>

      <BankConsentDialog
        open={bankConsentDialogOpen}
        onOpenChange={setBankConsentDialogOpen}
        onConfirm={connectBankFromOnboarding}
        busy={busy}
      />
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
