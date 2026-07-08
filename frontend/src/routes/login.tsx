import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { signUpFn, signInWithPasswordFn, signInWithPhoneFn } from "@/lib/api/auth.functions";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/login")({
  ssr: false,
  beforeLoad: () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("pb_session_token") : null;
    if (token) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LoginPage,
});

type Mode = "signin" | "signup";
type Tab = "email" | "phone";
const demoPhoneAuthEnabled = import.meta.env.VITE_DEMO_PHONE_AUTH_ENABLED === "true";

function LoginPage() {
  const nav = useNavigate();
  const { session, loading, login } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("email");
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const activeTab: Tab = demoPhoneAuthEnabled ? tab : "email";

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  async function handleEmail() {
    if (!email || !password) {
      toast.error("Enter email and password");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!fullName) {
          toast.error("Enter your full name");
          return;
        }
        const result = await signUpFn({ data: { email, password, fullName } });
        if (result && result.user) {
          login(result.sessionToken, result.user);
          toast.success("Account created!");
          nav({ to: "/onboarding", replace: true });
        } else {
          toast.error("Sign up failed");
        }
      } else {
        const result = await signInWithPasswordFn({ data: { email, password } });
        if (result && result.user) {
          login(result.sessionToken, result.user);
          toast.success("Signed in!");
          nav({ to: "/dashboard", replace: true });
        } else {
          toast.error("Invalid credentials");
        }
      }
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhone() {
    if (!demoPhoneAuthEnabled) {
      toast.error("Phone sign-in is disabled for this build");
      return;
    }
    if (!phone || phone.length < 10) {
      toast.error("Enter a valid phone number");
      return;
    }
    if (!otpSent) {
      setOtpSent(true);
      toast.success("Demo phone sign-in enabled. Enter any 6 digits to continue.");
      return;
    }
    if (otp.length !== 6) {
      toast.error("Invalid OTP");
      return;
    }
    setBusy(true);
    try {
      const result = await signInWithPhoneFn({ data: { phone, fullName: fullName || "Student" } });
      if (result && result.user) {
        login(result.sessionToken, result.user);
        toast.success("Signed in!");
        nav({ to: "/dashboard", replace: true });
      } else {
        toast.error("Could not verify OTP");
      }
    } catch (error: any) {
      toast.error(error.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 relative overflow-hidden">
      {/* Cinematic ambient light overlay */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[450px] w-[450px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      {/* Styled Centered Card Box */}
      <div className="w-full max-w-[390px] relative z-10 bg-surface-raised/40 backdrop-blur-xl border border-border/50 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/30">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <svg viewBox="0 0 100 100" className="h-12 w-12 shrink-0 filter drop-shadow(0_4px_20px_rgba(255,107,0,0.18))" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="pocketTopLogin" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FF9F43" />
                  <stop offset="100%" stopColor="#FF6B00" />
                </linearGradient>
                <linearGradient id="pocketSidesLogin" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#B45309" />
                </linearGradient>
                <linearGradient id="pocketBottomLogin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B00" />
                  <stop offset="100%" stopColor="#D97706" />
                </linearGradient>
                <linearGradient id="coinGradLogin" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="100%" stopColor="#E2E8F0" />
                </linearGradient>
                <filter id="coinShadowLogin" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
                </filter>
              </defs>
              
              {/* Origami Pocket Base */}
              <path d="M20 38 L50 56 L20 72 Z" fill="url(#pocketSidesLogin)" opacity="0.85" />
              <path d="M80 38 L50 56 L80 72 Z" fill="url(#pocketSidesLogin)" opacity="0.7" />
              <path d="M50 56 L80 72 L50 85 L20 72 Z" fill="url(#pocketBottomLogin)" />
              <path d="M50 20 L80 38 H20 Z" fill="url(#pocketTopLogin)" opacity="0.9" />

              {/* Floating coin */}
              <circle cx="50" cy="52" r="14" fill="url(#coinGradLogin)" stroke="#FF6B00" strokeWidth="1.5" filter="url(#coinShadowLogin)" />
              
              {/* Standard Rupee symbol inside coin */}
              <path d="M44 47H56" stroke="#0F1219" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M44 50H53" stroke="#0F1219" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M49 47V53" stroke="#0F1219" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M49 47A 3 3 0 0 1 49 53" stroke="#0F1219" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M49 53L54 59" stroke="#0F1219" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <h1
            id="logo-login"
            className="text-[22px] font-extrabold tracking-tight text-foreground flex items-center justify-center gap-0.5"
          >
            PocketBuddy<span className="text-primary font-black">.</span>
          </h1>
          <p className="mt-1 text-[10px] font-bold tracking-widest text-muted-foreground/85 uppercase">
            Campus Financial Guard
          </p>
        </div>

        <div
          className="mx-auto flex max-w-[200px] rounded-full border border-border bg-surface-raised p-1 text-[10px] font-bold uppercase tracking-wider"
        >
          <button
            id="tab-login-email"
            onClick={() => setTab("email")}
            className={`flex-1 py-1.5 rounded-full transition-all duration-150 cursor-pointer ${activeTab === "email" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Email
          </button>
          {demoPhoneAuthEnabled && (
            <button
              id="tab-login-phone"
              onClick={() => setTab("phone")}
              className={`flex-1 py-1.5 rounded-full transition-all duration-150 cursor-pointer ${activeTab === "phone" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Phone
            </button>
          )}
        </div>

        <div className="mt-8 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Full Name</label>
              <Input
                placeholder="Student Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                id="input-login-name"
                className="h-10"
              />
            </div>
          )}
          {activeTab === "email" ? (
            <>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Email Address</label>
                <Input
                  id="input-login-email"
                  type="email"
                  placeholder="name@institute.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Password</label>
                <div className="relative">
                  <Input
                    id="input-login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-foreground cursor-pointer focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Phone Number</label>
                <div className="flex items-center rounded-md border border-border bg-surface-raised/40 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/40 hover:border-white/15 transition-all">
                  <span className="px-3 text-xs text-muted-foreground font-bold border-r border-border">+91</span>
                  <input
                    id="input-login-phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 bg-transparent py-2.5 px-3 text-xs outline-none placeholder:text-muted-foreground/50 text-foreground"
                  />
                </div>
              </div>
              {otpSent && (
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest pl-1">One-Time Password</label>
                  <Input
                    id="input-login-otp"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="h-10 font-mono tracking-[0.2em] text-center"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-6">
          <Button
            id={mode === "signup" ? "btn-create-account" : "btn-sign-in"}
            onClick={activeTab === "email" ? handleEmail : handlePhone}
            disabled={busy}
            className="w-full h-10 bg-foreground text-background font-black uppercase tracking-wider text-xs shadow-md transition-all duration-150 relative flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-background" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>
                  {activeTab === "phone" && !otpSent
                    ? "Sending..."
                    : mode === "signup"
                      ? "Creating Account..."
                      : "Signing In..."}
                </span>
              </div>
            ) : (
              activeTab === "phone" && !otpSent
                ? "Send OTP"
                : mode === "signup"
                  ? "Create Account"
                  : activeTab === "phone"
                    ? "Verify & Sign In"
                    : "Sign In"
            )}
          </Button>
        </div>

        <div className="mt-4 text-center">
          <button
            id="link-create-account"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="text-[11px] font-bold tracking-wide text-primary hover:text-primary/80 transition-colors uppercase cursor-pointer"
          >
            {mode === "signup" ? "Have an account? Sign in" : "New student? Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}
