import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

type Mode = "signin" | "signup";
type Tab = "email" | "phone";

function LoginPage() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("email");
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) nav({ to: "/dashboard", replace: true });
  }, [loading, session, nav]);

  async function handleEmail() {
    if (!email || !password) {
      toast.error("Enter email and password");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const redirectUrl = `${window.location.origin}/dashboard`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl, data: { full_name: fullName } },
        });
        if (error) {
          if (error.message.toLowerCase().includes("already")) toast.error("Account already exists");
          else toast.error(error.message);
          return;
        }
        toast.success("Account created!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast.error("Invalid credentials");
          return;
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePhone() {
    if (!phone || phone.length < 10) {
      toast.error("Enter a valid phone number");
      return;
    }
    if (!otpSent) {
      setOtpSent(true);
      toast.success("OTP sent (demo: enter any 6 digits)");
      return;
    }
    if (otp.length !== 6) {
      toast.error("Invalid OTP");
      return;
    }
    setBusy(true);
    try {
      // Demo phone OTP — map phone to deterministic email/password
      const cleaned = phone.replace(/\D/g, "").slice(-10);
      const demoEmail = `phone${cleaned}@pocketbuddy.local`;
      const demoPass = `pb_${cleaned}_pwd!`;
      const signIn = await supabase.auth.signInWithPassword({ email: demoEmail, password: demoPass });
      if (signIn.error) {
        const signUp = await supabase.auth.signUp({
          email: demoEmail,
          password: demoPass,
          options: { data: { full_name: fullName || "Student", phone_number: `+91${cleaned}` } },
        });
        if (signUp.error) {
          toast.error("Could not verify OTP");
          return;
        }
        // Try sign-in again
        await supabase.auth.signInWithPassword({ email: demoEmail, password: demoPass });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[380px]">
        <div className="text-center">
          <h1 id="logo-login" className="text-[20px] font-semibold tracking-[0.2em] text-foreground">
            POCKETBUDDY
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Campus Financial Guard</p>
        </div>

        <div className="mt-6 flex justify-center gap-6 text-sm">
          <button
            id="tab-login-email"
            onClick={() => setTab("email")}
            className={`pb-1 transition-colors ${tab === "email" ? "border-b-2 border-[color:var(--pb-blue)] text-foreground" : "text-muted-foreground"}`}
          >
            Email
          </button>
          <button
            id="tab-login-phone"
            onClick={() => setTab("phone")}
            className={`pb-1 transition-colors ${tab === "phone" ? "border-b-2 border-[color:var(--pb-blue)] text-foreground" : "text-muted-foreground"}`}
          >
            Phone
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {mode === "signup" && (
            <Input
              placeholder="full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              id="input-login-name"
            />
          )}
          {tab === "email" ? (
            <>
              <Input
                id="input-login-email"
                type="email"
                placeholder="institute email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <Input
                id="input-login-password"
                type="password"
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </>
          ) : (
            <>
              <div className="flex items-center rounded-md border border-input bg-[color:var(--surface)] focus-within:ring-1 focus-within:ring-ring">
                <span className="px-3 text-sm text-muted-foreground">+91</span>
                <input
                  id="input-login-phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="flex-1 bg-transparent py-2 pr-3 text-sm outline-none"
                />
              </div>
              {otpSent && (
                <Input
                  id="input-login-otp"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                />
              )}
            </>
          )}
        </div>

        <div className="mt-4">
          {busy ? (
            <Skeleton className="h-10 w-full rounded-md" />
          ) : (
            <Button
              id={mode === "signup" ? "btn-create-account" : "btn-sign-in"}
              onClick={tab === "email" ? handleEmail : handlePhone}
              className="w-full"
            >
              {tab === "phone" && !otpSent
                ? "Send OTP"
                : mode === "signup"
                ? "Create Account"
                : tab === "phone"
                ? "Verify & Sign In"
                : "Sign In"}
            </Button>
          )}
        </div>

        <div className="mt-3 text-center">
          <button
            id="link-create-account"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="text-[13px] text-[color:var(--pb-blue)]"
          >
            {mode === "signup" ? "Have an account? Sign in" : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}
