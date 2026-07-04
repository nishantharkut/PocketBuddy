import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { getRunwayForecast, getRunwayIntel } from "@/lib/api/db.functions";
import { rupees } from "@/lib/format";
import { 
  TrendingUp, TrendingDown, AlertTriangle, AlertCircle, CheckCircle2,
  Calendar, CreditCard, PieChart, Info, HelpCircle, ChevronRight,
  ShieldCheck, ArrowRight, Activity, Wallet,
  Clock, Zap, Compass, RefreshCw, Layers, TrendingUp as TrendUpIcon, ArrowUpRight
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ComposedChart, Line
} from "recharts";

export const Route = createFileRoute("/_authenticated/runway")({
  ssr: false,
  component: RunwayPage,
});

function RunwayPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "commitments" | "horizons">("overview");
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Fetch forecast data
  const { data: forecast, isLoading: forecastLoading, isError: forecastError, refetch: refetchForecast } = useQuery({
    queryKey: ["runway-forecast", user?.id],
    enabled: !!user,
    queryFn: () => getRunwayForecast(),
    staleTime: 30_000,
  });

  // Fetch AI narration
  const { data: intel, isLoading: intelLoading, isError: intelError, refetch: refetchIntel } = useQuery({
    queryKey: ["runway-intel", user?.id],
    enabled: !!user,
    queryFn: () => getRunwayIntel(),
    staleTime: 60_000,
  });

  const handleRefresh = async () => {
    await Promise.all([refetchForecast(), refetchIntel()]);
  };

  const [scenarioWeekendSkip, setScenarioWeekendSkip] = useState(false);
  const [scenarioNetflixCancel, setScenarioNetflixCancel] = useState(false);
  const [scenarioCartPool, setScenarioCartPool] = useState(false);
  const [scenarioWeekendTrip, setScenarioWeekendTrip] = useState(false);
  const [flightProtocol, setFlightProtocol] = useState<"normal" | "glide" | "turbulence">("normal");

  const defaultPace = useMemo(() => {
    return Math.round((forecast?.projection?.projected_daily_spend || 20000) / 100);
  }, [forecast]);

  const [simulatedDailySpend, setSimulatedDailySpend] = useState<number | null>(() => {
    const saved = localStorage.getItem("pb_sandbox_simulated_daily_spend");
    if (saved) {
      localStorage.removeItem("pb_sandbox_simulated_daily_spend");
      return parseInt(saved, 10);
    }
    return null;
  });
  const activeSimulatedSpend = simulatedDailySpend ?? defaultPace;

  const adjustedCommitmentsTotal = useMemo(() => {
    if (!forecast) return 0;
    let total = forecast.commitments.total;
    if (scenarioNetflixCancel || flightProtocol === "glide" || flightProtocol === "turbulence") {
      const subsAmount = forecast.commitments.items
        .filter((i: any) => i.kind === "subscription")
        .reduce((sum: number, i: any) => sum + i.amount, 0);
      
      if (flightProtocol === "glide" || flightProtocol === "turbulence") {
        total = Math.max(0, total - subsAmount);
      } else if (scenarioNetflixCancel) {
        total = Math.max(0, total - 19900);
      }
    }
    if (flightProtocol === "turbulence") {
      const examAmount = forecast.commitments.items
        .filter((i: any) => i.kind === "exam_buffer")
        .reduce((sum: number, i: any) => sum + i.amount, 0);
      total = Math.max(0, total - examAmount);
    }
    return total;
  }, [forecast, scenarioNetflixCancel, flightProtocol]);

  const adjustedSpent = useMemo(() => {
    if (!forecast) return 0;
    let spent = forecast.current_cycle.spent;
    if (scenarioWeekendTrip) {
      spent += 120000; // add ₹1,200 trip spend
    }
    return spent;
  }, [forecast, scenarioWeekendTrip]);

  const remainingDiscretionary = useMemo(() => {
    if (!forecast) return 0;
    let totalFunding = forecast.current_cycle.available_funding;
    let spent = adjustedSpent;
    let commitments = adjustedCommitmentsTotal;
    
    let baseDiscretionary = totalFunding - spent - commitments;
    if (scenarioWeekendSkip) {
      baseDiscretionary += 50000; // save ₹500 by skipping eating out
    }
    if (scenarioCartPool) {
      baseDiscretionary += 20000; // save ₹200 by joining cart pools
    }
    return Math.max(0, baseDiscretionary);
  }, [forecast, adjustedSpent, adjustedCommitmentsTotal, scenarioWeekendSkip, scenarioCartPool]);

  const simulatedDays = useMemo(() => {
    if (activeSimulatedSpend <= 0) return 999;
    return Math.floor(remainingDiscretionary / (activeSimulatedSpend * 100));
  }, [remainingDiscretionary, activeSimulatedSpend]);

  const simulatedBrokeDate = useMemo(() => {
    if (!forecast) return "";
    const brokeDate = new Date(Date.now() + simulatedDays * 24 * 60 * 60 * 1000);
    return brokeDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }, [forecast, simulatedDays]);

  const daysLeftInCycle = forecast?.current_cycle?.days_left ?? 30;
  const isSimulatedSafe = simulatedDays >= daysLeftInCycle;

  const copyFlightBrief = () => {
    if (!forecast) return;
    const brief = `PocketBuddy Financial Flight Plan Brief:
* Current Status: ${isSimulatedSafe ? "Safe Flight Plan" : "Shortfall Warning"}
* Remaining Flexible Pool: ₹${(remainingDiscretionary / 100).toFixed(0)}
* Simulated Daily Pace: ₹${activeSimulatedSpend}/day
* Estimated Runway: ${simulatedDays} days (survival until ${simulatedBrokeDate})
* Cycle Remaining: ${daysLeftInCycle} days
${isSimulatedSafe 
  ? "* Plan: Staying under budget. On track to complete the allowance cycle safely." 
  : `* Shortfall: Will run out of funds ${daysLeftInCycle - simulatedDays} days early. Need allowance adjustment of ₹${((daysLeftInCycle - simulatedDays) * activeSimulatedSpend).toLocaleString("en-IN")} or to slow down spending.`}
* Committed Reserve (subscriptions + mess fees + buffers): ₹${(adjustedCommitmentsTotal / 100).toFixed(0)}

Generated via PocketBuddy Runway Flight deck.`;

    navigator.clipboard.writeText(brief);
    toast.success("Flight Plan Brief copied to clipboard!");
  };

  // Format currency helpers for display (converting paise to Rs)
  const formatRs = (paise: number) => rupees(paise);

  // Compute status details
  const statusDetails = useMemo(() => {
    if (!forecast) return { color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20", icon: HelpCircle, text: "Unknown" };
    const status = forecast.status;
    if (status === "shortfall") {
      return {
        color: "text-pb-red",
        bg: "bg-pb-red/10",
        border: "border-pb-red/20",
        icon: AlertCircle,
        text: "Shortfall Warning"
      };
    }
    if (status === "watch") {
      return {
        color: "text-pb-amber",
        bg: "bg-pb-amber/10",
        border: "border-pb-amber/20",
        icon: AlertTriangle,
        text: "Under Watch"
      };
    }
    return {
      color: "text-pb-green",
      bg: "bg-pb-green/10",
      border: "border-pb-green/20",
      icon: CheckCircle2,
      text: "Healthy runway"
    };
  }, [forecast]);

  const safetyGrade = useMemo(() => {
    if (!forecast) return { grade: "N/A", text: "Analyzing Flight Path", color: "text-zinc-500", bg: "bg-zinc-500/10", border: "border-zinc-500/20", description: "Calculating runway projections..." };
    const prob = forecast.projection.shortfall_probability;
    if (prob <= 0) {
      return {
        grade: "A",
        text: "Smooth Flying",
        color: "text-pb-green",
        bg: "bg-pb-green/10",
        border: "border-pb-green/20",
        description: "Your daily pace fits safely within your remaining discretionary pool. No shortfalls projected."
      };
    }
    if (prob < 0.15) {
      return {
        grade: "B",
        text: "Stable Cruise",
        color: "text-pb-green",
        bg: "bg-pb-green/10",
        border: "border-pb-green/20",
        description: "You are mostly on track. Maintain standard discipline and monitor daily dinner plans."
      };
    }
    if (prob < 0.35) {
      return {
        grade: "C",
        text: "Fuel Warning",
        color: "text-pb-amber",
        bg: "bg-pb-amber/10",
        border: "border-pb-amber/20",
        description: "Your spending pace is slightly high. Consider dialing back dining delivery to avoid a late-cycle deficit."
      };
    }
    if (prob < 0.60) {
      return {
        grade: "D",
        text: "Turbulence Warning",
        color: "text-pb-red",
        bg: "bg-pb-red/10",
        border: "border-pb-red/20",
        description: "Significant shortfall risk ahead. Consider engaging Glide Protocol to extend your allowance longevity."
      };
    }
    return {
      grade: "F",
      text: "Grounded Deficit",
      color: "text-pb-red",
      bg: "bg-pb-red/10",
      border: "border-pb-red/20",
      description: "Allowance depletion imminent. Request an emergency home booster or engage Turbulence Mode immediately."
    };
  }, [forecast]);

  // Chart data for Recharts
  const chartData = useMemo(() => {
    if (!forecast?.horizons) return [];
    return forecast.horizons.map((h: any) => ({
      name: h.label,
      "Expected Spend": Math.round((h.projected_spend || 0) / 100),
      "Allowance / Funding": Math.round((h.projected_funding || 0) / 100),
      "Ending Balance": Math.round((h.projected_balance || 0) / 100),
    }));
  }, [forecast]);

  if (forecastLoading) {
    return (
      <AppShell>
        <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
          <div className="flex items-center gap-3">
            <MobileMenuButton />
            <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase">
              Runway & Forecasts
            </h1>
          </div>
        </div>
        <div className="py-4 space-y-6">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (forecastError || !forecast) {
    return (
      <AppShell>
        <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
          <div className="flex items-center gap-3">
            <MobileMenuButton />
            <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase">
              Runway & Forecasts
            </h1>
          </div>
        </div>
        <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-bold">Failed to load runway forecast</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Please make sure you have configured your profile allowance and logged some transactions to generate forecasts.
          </p>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-bold uppercase tracking-wider"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </AppShell>
    );
  }

  // Spend breakdown percentage
  const totalSpendSplit = forecast.spend_split.committed + forecast.spend_split.flexible;
  const committedPct = totalSpendSplit > 0 ? Math.round((forecast.spend_split.committed / totalSpendSplit) * 100) : 0;
  const flexiblePct = 100 - committedPct;

  return (
    <AppShell>
      {/* Page Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">
            Runway & Forecasts
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGuideModal(true)}
            className="inline-flex h-9 w-9 sm:w-auto sm:px-3 items-center justify-center gap-1.5 rounded-full border border-border bg-surface text-foreground transition-all hover:bg-surface-raised cursor-pointer text-xs font-bold uppercase tracking-wider"
            title="Runway Guide"
          >
            <HelpCircle className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Flight Manual</span>
          </button>
          <button
            onClick={handleRefresh}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground transition-all hover:bg-surface-raised cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="py-4 pb-32 space-y-6 animate-[fadeIn_0.3s_ease-out]">
        {/* ── AI Runway Advisor Narration ── */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/50 to-card p-5 shadow-lg">
          <div className="absolute top-0 right-0 p-3 flex gap-2">
            <span className="flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4.5 w-4.5 text-primary animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary">AI Runway Advisor</h2>
            <Badge variant="outline" className="text-[9px] uppercase border-primary/20 text-primary px-1.5 py-0">Amazon Bedrock Nova</Badge>
          </div>
          {intelLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full bg-white/5 animate-pulse" />
              <Skeleton className="h-4 w-5/6 bg-white/5 animate-pulse" />
            </div>
          ) : (
            <p className="text-[13px] sm:text-[14px] text-foreground font-semibold leading-relaxed">
              {intel?.summary || "Calculating AI insights..."}
            </p>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-border overflow-x-auto no-scrollbar whitespace-nowrap scroll-smooth">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 px-4 transition-all cursor-pointer shrink-0 ${
              activeTab === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("commitments")}
            className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 px-4 transition-all cursor-pointer shrink-0 ${
              activeTab === "commitments" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Fixed Commitments ({forecast.commitments?.items?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("horizons")}
            className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 px-4 transition-all cursor-pointer shrink-0 ${
              activeTab === "horizons" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Projections
          </button>
        </div>

        {/* ── Tab: Overview ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Runway Safety Grade & Fuel Gauge Card */}
            <Card className={`p-6 border ${safetyGrade.border} bg-gradient-to-br from-card/30 to-card/15 shadow-md flex flex-col sm:flex-row items-center gap-6`}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center shrink-0 border-4 ${safetyGrade.border} ${safetyGrade.bg}`}>
                <span className={`text-3xl font-black tracking-tight ${safetyGrade.color}`}>{safetyGrade.grade}</span>
              </div>
              <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-foreground">Runway Safety Grade</h3>
                  <Badge variant="outline" className={`w-fit mx-auto sm:mx-0 text-[9px] uppercase font-bold py-0.5 ${safetyGrade.color} ${safetyGrade.bg} ${safetyGrade.border}`}>
                    {safetyGrade.text}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {safetyGrade.description}
                </p>
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
                    <span>Discretionary Fuel Gauge</span>
                    <span>{Math.max(0, Math.round((remainingDiscretionary / forecast.current_cycle.available_funding) * 100))}% remaining</span>
                  </div>
                  <Progress value={Math.max(0, Math.round((remainingDiscretionary / forecast.current_cycle.available_funding) * 100))} className="h-1.5" />
                </div>
              </div>
            </Card>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Runway Days */}
              <Card className="p-5 flex flex-col justify-between border border-border relative overflow-hidden bg-card/40">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold tracking-[0.15em] text-zinc-500 uppercase">Runway Days</p>
                    <div className={`p-1.5 rounded-lg ${statusDetails.bg} ${statusDetails.color}`}>
                      <statusDetails.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-black tracking-tight tnum flex items-baseline gap-1.5">
                    {forecast.projection.days_until_broke}
                    <span className="text-xs font-semibold text-zinc-500">days left</span>
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-500 mt-3 leading-snug border-t border-border/50 pt-2.5">
                  {forecast.status === "shortfall" 
                    ? `Broke before reset! Shortfall of ${formatRs(forecast.projection.ask_home_amount)}`
                    : "Safe until next cycle allowance reset date."}
                </p>
              </Card>

              {/* Card 2: Safe Daily Spend */}
              <Card className="p-5 flex flex-col justify-between border border-border relative overflow-hidden bg-card/40">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold tracking-[0.15em] text-zinc-500 uppercase">Safe Daily Spend</p>
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <Wallet className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-black tracking-tight tnum text-primary">
                    {formatRs(forecast.projection.safe_daily_spend)}
                    <span className="text-xs font-semibold text-zinc-500">/day</span>
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-500 mt-3 leading-snug border-t border-border/50 pt-2.5">
                  Spend limit to reach allowance cycle end with exactly ₹0 balance.
                </p>
              </Card>

              {/* Card 3: Spend Velocity (EWMA) */}
              <Card className="p-5 flex flex-col justify-between border border-border relative overflow-hidden bg-card/40">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold tracking-[0.15em] text-zinc-500 uppercase">Current Pace</p>
                    <div className="p-1.5 rounded-lg bg-pb-amber/10 text-pb-amber">
                      <Activity className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-black tracking-tight tnum text-pb-amber">
                    {formatRs(forecast.projection.projected_daily_spend)}
                    <span className="text-xs font-semibold text-zinc-500">/day</span>
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-500 mt-3 leading-snug border-t border-border/50 pt-2.5">
                  Calculated using exponential weighted average of discretionary spend.
                </p>
              </Card>

              {/* Card 4: Shortfall Probability */}
              <Card className="p-5 flex flex-col justify-between border border-border relative overflow-hidden bg-card/40">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold tracking-[0.15em] text-zinc-500 uppercase">Shortfall Risk</p>
                    <div className={`p-1.5 rounded-lg ${forecast.projection.shortfall_probability >= 0.35 ? "bg-pb-red/10 text-pb-red" : "bg-pb-green/10 text-pb-green"}`}>
                      <TrendingDown className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-black tracking-tight tnum">
                    {Math.round(forecast.projection.shortfall_probability * 100)}%
                  </h3>
                </div>
                <p className="text-[11px] text-zinc-500 mt-3 leading-snug border-t border-border/50 pt-2.5">
                  Likelihood of running out of money before your allowance cycle resets.
                </p>
              </Card>
            </div>

            {/* 🛫 INTERACTIVE RUNWAY SANDBOX & SIMULATOR */}
            <Card className="p-6 border border-primary/20 bg-gradient-to-br from-card to-card/50 shadow-md">
              <div className="flex flex-col lg:flex-row gap-6 items-stretch justify-between">
                
                {/* Left side: Interactive Sandbox Controls */}
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Compass className="h-4.5 w-4.5 text-primary" />
                      <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Runway Flight Sandbox</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Slide to adjust your daily discretionary spending target. See how your runway days and broke date change in real-time.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-bold text-muted-foreground">Simulated Daily Budget</span>
                      <span className="text-lg font-black text-primary font-mono">₹{activeSimulatedSpend} <span className="text-xs text-muted-foreground font-semibold">/day</span></span>
                    </div>
                    <input 
                      type="range" 
                      min="20" 
                      max="1500" 
                      step="10"
                      value={activeSimulatedSpend} 
                      onChange={(e) => setSimulatedDailySpend(parseInt(e.target.value, 10))}
                      onMouseUp={() => {
                        toast.info(`Daily budget simulated at ₹${activeSimulatedSpend}/day. Runway: ${simulatedDays} days.`);
                      }}
                      onTouchEnd={() => {
                        toast.info(`Daily budget simulated at ₹${activeSimulatedSpend}/day. Runway: ${simulatedDays} days.`);
                      }}
                      className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                      <span>₹20/day</span>
                      <span>₹500/day</span>
                      <span>₹1000/day</span>
                      <span>₹1500/day</span>
                    </div>
                  </div>

                  {/* Presets */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Quick Presets</span>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => setSimulatedDailySpend(80)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${activeSimulatedSpend === 80 ? "bg-primary/10 border-primary text-primary" : "bg-surface border-border hover:bg-surface-raised"}`}
                      >
                        Mess Diet (₹80)
                      </button>
                      <button 
                        onClick={() => setSimulatedDailySpend(200)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${activeSimulatedSpend === 200 ? "bg-primary/10 border-primary text-primary" : "bg-surface border-border hover:bg-surface-raised"}`}
                      >
                        Campus Diner (₹200)
                      </button>
                      <button 
                        onClick={() => setSimulatedDailySpend(500)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${activeSimulatedSpend === 500 ? "bg-primary/10 border-primary text-primary" : "bg-surface border-border hover:bg-surface-raised"}`}
                      >
                        Weekend Splurge (₹500)
                      </button>
                      {simulatedDailySpend !== null && (
                        <button 
                          onClick={() => setSimulatedDailySpend(null)}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-dashed border-zinc-500 hover:border-zinc-300 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                        >
                          Reset to Actual ({defaultPace})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Flight Protocols */}
                  <div className="border-t border-border/40 pt-4 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Flight Protocols</span>
                      <TooltipProvider>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <button className="text-zinc-500 hover:text-foreground cursor-pointer focus:outline-none transition-colors">
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 p-3 space-y-2 text-[11px] leading-relaxed shadow-xl">
                            <div>
                              <p className="font-bold text-zinc-900 dark:text-zinc-50">Glide Protocol</p>
                              <p className="text-zinc-600 dark:text-zinc-400">Cuts active subscriptions and sets daily budget to a strict ₹100/day limit to stretch remaining funds until reset.</p>
                            </div>
                            <div>
                              <p className="font-bold text-zinc-900 dark:text-zinc-50">Turbulence Mode</p>
                              <p className="text-zinc-600 dark:text-zinc-400">Emergency state: Unlocks your Exam Safety Buffer cash and enforces a ₹60/day maximum spend to survive.</p>
                            </div>
                          </TooltipContent>
                        </UITooltip>
                      </TooltipProvider>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => {
                          setFlightProtocol("normal");
                          setSimulatedDailySpend(null);
                          toast.info("Normal Flight engaged: Standard student pacing active.");
                        }}
                        className={`py-2 text-[10px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                          flightProtocol === "normal"
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-surface border-border hover:bg-surface-raised text-muted-foreground"
                        }`}
                      >
                        Normal Flight
                      </button>
                      <button
                        onClick={() => {
                          setFlightProtocol("glide");
                          setSimulatedDailySpend(100);
                          toast.success("Glide Protocol engaged: Paused subscriptions, restricted budget to ₹100/day.");
                        }}
                        className={`py-2 text-[10px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                          flightProtocol === "glide"
                            ? "bg-pb-amber/15 border-pb-amber text-pb-amber"
                            : "bg-surface border-border hover:bg-surface-raised text-muted-foreground"
                        }`}
                      >
                        Glide Protocol
                      </button>
                      <button
                        onClick={() => {
                          setFlightProtocol("turbulence");
                          setSimulatedDailySpend(60);
                          toast.warning("Turbulence Protocol engaged: Unlocked Exam buffer, restricted budget to ₹60/day.");
                        }}
                        className={`py-2 text-[10px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                          flightProtocol === "turbulence"
                            ? "bg-pb-red/15 border-pb-red text-pb-red"
                            : "bg-surface border-border hover:bg-surface-raised text-muted-foreground"
                        }`}
                      >
                        Turbulence Mode
                      </button>
                    </div>
                  </div>

                  {/* What-If Spending Scenarios Checkbox List */}
                  <div className="border-t border-border/40 pt-4 space-y-3">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">What-If Spending Scenarios</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={scenarioWeekendSkip} 
                          onChange={(e) => {
                            const val = e.target.checked;
                            setScenarioWeekendSkip(val);
                            if (val) {
                              toast.success("Skipped dining out saves ₹500: Discretionary pool increased.");
                            } else {
                              toast.info("Removed dining savings: Discretionary pool reduced.");
                            }
                          }}
                          className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 accent-primary"
                        />
                        <span>Skip eating out this weekend (+₹500)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={scenarioNetflixCancel} 
                          onChange={(e) => {
                            const val = e.target.checked;
                            setScenarioNetflixCancel(val);
                            if (val) {
                              toast.success("Cancelled Netflix saves ₹199: Fixed commitments reduced.");
                            } else {
                              toast.info("Restored Netflix subscription: Fixed commitments increased.");
                            }
                          }}
                          className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 accent-primary"
                        />
                        <span>Cancel Netflix Subscription (+₹199)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={scenarioCartPool} 
                          onChange={(e) => {
                            const val = e.target.checked;
                            setScenarioCartPool(val);
                            if (val) {
                              toast.success("Joined Swiggy Pool saves ₹200: Discretionary pool increased.");
                            } else {
                              toast.info("Left Swiggy Pool: Discretionary pool reduced.");
                            }
                          }}
                          className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 accent-primary"
                        />
                        <span>Join delivery cart pool (+₹200)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={scenarioWeekendTrip} 
                          onChange={(e) => {
                            const val = e.target.checked;
                            setScenarioWeekendTrip(val);
                            if (val) {
                              toast.warning("Weekend road trip costs ₹1,200: Discretionary pool reduced.");
                            } else {
                              toast.info("Cancelled road trip: Discretionary pool restored.");
                            }
                          }}
                          className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 accent-primary"
                        />
                        <span>Plan weekend road trip (-₹1,200)</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Right side: Real-time Flight Diagnostics (Results) */}
                <div className="w-full lg:w-80 rounded-xl bg-surface-raised p-4 flex flex-col justify-between gap-4 border border-border/50">
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Sandbox Diagnostics</span>
                    
                    <div>
                      <span className="text-[11px] text-muted-foreground block">Remaining Discretionary Pool:</span>
                      <span className="text-sm font-bold text-foreground font-mono">{formatRs(remainingDiscretionary)}</span>
                    </div>

                    <div>
                      <span className="text-[11px] text-muted-foreground block">Simulated Runway Length:</span>
                      <span className="text-xl font-black text-foreground font-mono">
                        {simulatedDays} <span className="text-xs text-muted-foreground font-semibold">days</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] text-muted-foreground block">Simulated Broke Date:</span>
                      <span className={`text-xs font-bold font-mono ${isSimulatedSafe ? "text-pb-green" : "text-pb-red"}`}>
                        {simulatedBrokeDate}
                      </span>
                    </div>
                  </div>

                  <div className={`rounded-lg p-3 text-xs leading-relaxed font-semibold flex items-start gap-2 ${
                    isSimulatedSafe 
                      ? "bg-pb-green/10 text-pb-green border border-pb-green/20" 
                      : "bg-pb-red/10 text-pb-red border border-pb-red/20"
                  }`}>
                    {isSimulatedSafe ? (
                      <>
                        <CheckCircle2 className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Safe speed! (Surplus)</p>
                          <p className="text-[10px] opacity-80 mt-0.5">You will comfortably survive until the allowance resets in {daysLeftInCycle} days.</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Shortfall ahead!</p>
                          <p className="text-[10px] opacity-80 mt-0.5">You will run out of flexible funds {daysLeftInCycle - simulatedDays} days early. Request ₹{((daysLeftInCycle - simulatedDays) * activeSimulatedSpend).toLocaleString("en-IN")} home or slow down.</p>
                        </div>
                      </>
                    )}
                  </div>

                  {!isSimulatedSafe && (
                    <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-1.5 animate-[fadeIn_0.2s_ease-out]">
                      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-primary">
                        <Zap className="h-3 w-3 animate-pulse" />
                        <span>Recommended Solution</span>
                      </div>
                      <p className="text-xs font-bold text-foreground leading-snug">
                        Ask home for <span className="text-primary underline font-mono text-sm">₹{((daysLeftInCycle - simulatedDays) * activeSimulatedSpend).toLocaleString("en-IN")}</span> to cover the cycle deficit, or engage Glide Protocol to reduce daily speed.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={copyFlightBrief}
                    className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg border border-border bg-surface hover:bg-surface-raised text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <ArrowUpRight className="h-4 w-4 text-primary" />
                    <span>Share Flight Brief</span>
                  </button>
                </div>

              </div>
            </Card>

            {/* 💡 RUNWAY SURVIVAL NUDGES */}
            <Card className="p-6 border border-border bg-card/20 space-y-4">
              <div className="flex items-center gap-1.5 border-b border-border/40 pb-3">
                <Zap className="h-4.5 w-4.5 text-pb-amber animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-wider text-foreground">Runway Survival Actions</h3>
              </div>

              <div className="space-y-3">
                {forecast.status === "shortfall" ? (
                  <>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-pb-red/5 border border-pb-red/10 text-xs">
                      <span className="w-5 h-5 rounded-full bg-pb-red/10 text-pb-red flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                      <div className="space-y-1">
                        <p className="font-bold text-foreground">Shield Your Exam Safety Buffer</p>
                        <p className="text-[11px] text-zinc-500">Your profile buffer of {formatRs(forecast.commitments.items.find((i: any) => i.kind === "exam_buffer")?.amount || 150000)} is locked. Avoid dipping into it for regular food spending.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg bg-pb-amber/5 border border-pb-amber/10 text-xs">
                      <span className="w-5 h-5 rounded-full bg-pb-amber/10 text-pb-amber flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                      <div className="space-y-1">
                        <p className="font-bold text-foreground">Auto-Debit Subscription Alert</p>
                        <p className="text-[11px] text-zinc-500">You have {forecast.commitments.items.filter((i: any) => i.kind === "subscription").length} recurring subscriptions active. Temporarily pause one to reclaim breathing room.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                      <div className="space-y-1">
                        <p className="font-bold text-foreground">Launch Shared Cart Pool</p>
                        <p className="text-[11px] text-zinc-500">Coordinating grocery/dining orders with wingmates in cart pools will reduce your daily pace below your safe target limit.</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-pb-green/5 border border-pb-green/10 text-xs">
                      <span className="w-5 h-5 rounded-full bg-pb-green/10 text-pb-green flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                      <div className="space-y-1">
                        <p className="font-bold text-foreground">Lock in an Emergency Reserve</p>
                        <p className="text-[11px] text-zinc-500">Since you're on track, consider allocating a ₹1,000 buffer in settings to automatically protect it from future sprees.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg bg-pb-amber/5 border border-pb-amber/10 text-xs">
                      <span className="w-5 h-5 rounded-full bg-pb-amber/10 text-pb-amber flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                      <div className="space-y-1">
                        <p className="font-bold text-foreground">Weekend Splurge Guardrails</p>
                        <p className="text-[11px] text-zinc-500">Weekend spends average 1.3x higher. Try to stay within {formatRs(forecast.projection.safe_daily_spend)} to keep your runway healthy.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                      <div className="space-y-1">
                        <p className="font-bold text-foreground">Campus Mess Utilization</p>
                        <p className="text-[11px] text-zinc-500">Utilizing your pre-paid hostel dining hall at least 5 days a week saves ₹1,250 monthly on external delivery apps.</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>


            {/* Runway Progress Card */}
            <Card className="p-6 border border-border bg-card/25">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4">Allowance Cycle Progress</h3>
              <div className="space-y-4">
                <div className="flex justify-between text-xs font-black">
                  <span>Spent: {formatRs(forecast.current_cycle.spent)}</span>
                  <span>Allowance: {formatRs(forecast.current_cycle.available_funding)}</span>
                </div>
                <Progress 
                  value={Math.min(100, Math.round((forecast.current_cycle.spent / forecast.current_cycle.available_funding) * 100))} 
                  className="h-3"
                />
                <div className="flex justify-between text-[11px] text-zinc-500">
                  <span>Cycle start: {new Date(forecast.current_cycle.start).toLocaleDateString("en-IN")}</span>
                  <span>{forecast.current_cycle.days_left} days remaining until reset</span>
                  <span>Cycle end: {new Date(forecast.current_cycle.end).toLocaleDateString("en-IN")}</span>
                </div>
              </div>
            </Card>

            {/* Committed vs Flexible Spend visualizer */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Visual Split */}
              <Card className="p-6 border border-border md:col-span-7 bg-card/25">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Budget Split Analysis</h3>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold border-border bg-surface-raised px-2 py-0.5">
                    Committed vs Flexible
                  </Badge>
                </div>
                <div className="space-y-6">
                  {/* Progress Split Meter */}
                  <div>
                    <div className="flex h-4 rounded-full overflow-hidden mb-2">
                      <div className="bg-primary/80 transition-all" style={{ width: `${committedPct}%` }} title={`Committed: ${committedPct}%`} />
                      <div className="bg-pb-amber/70 transition-all" style={{ width: `${flexiblePct}%` }} title={`Flexible: ${flexiblePct}%`} />
                    </div>
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-primary flex items-center gap-1">
                        <span className="w-2.5 h-2.5 bg-primary/80 rounded-sm" />
                        Committed Spend: {committedPct}%
                      </span>
                      <span className="text-pb-amber flex items-center gap-1">
                        <span className="w-2.5 h-2.5 bg-pb-amber/70 rounded-sm" />
                        Flexible Spend Forecast: {flexiblePct}%
                      </span>
                    </div>
                  </div>

                  {/* Descriptions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/50 pt-4">
                    <div>
                      <h4 className="text-[12px] font-black text-primary uppercase tracking-wider mb-1.5">Committed Spend</h4>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Fixed obligations you must pay: subscriptions, monthly mess bills, exam buffers, and pending cart pool settlements. 
                        <strong> Total: {formatRs(forecast.commitments.total)}</strong>
                      </p>
                    </div>
                    <div>
                      <h4 className="text-[12px] font-black text-pb-amber uppercase tracking-wider mb-1.5">Flexible/Discretionary Spend</h4>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Variables expenses (canteen snacks, travel, shopping). Under current pace, you are projected to spend 
                        <strong> {formatRs(forecast.projection.projected_discretionary)}</strong> for the rest of the cycle.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Action Banner */}
              <Card className="p-6 border border-border md:col-span-5 bg-card/25 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Affordability Engine Action</h3>
                  <div className="space-y-3">
                    <Badge className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      forecast.action.type === "ask_home" ? "bg-pb-red/20 text-pb-red border border-pb-red/30" : 
                      forecast.action.type === "slow_down" ? "bg-pb-amber/20 text-pb-amber border border-pb-amber/30" :
                      forecast.action.type === "review_commitments" ? "bg-primary/20 text-primary border border-primary/30" :
                      "bg-pb-green/20 text-pb-green border border-pb-green/30"
                    }`}>
                      {forecast.action.type.replace("_", " ")}
                    </Badge>
                    <h4 className="text-sm font-black text-foreground">{forecast.action.title}</h4>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      {forecast.action.detail}
                    </p>
                  </div>
                </div>

                {forecast.action.type === "ask_home" && (
                  <div className="mt-4 p-3 rounded-lg bg-pb-red/5 border border-pb-red/10 text-xs text-pb-red font-semibold">
                    Shortfall detected. Consider sending a request home for ₹{(forecast.projection.ask_home_amount / 100).toLocaleString("en-IN")} soon.
                  </div>
                )}
                {forecast.action.type === "slow_down" && (
                  <Link to="/pool" className="mt-4 inline-flex items-center justify-center gap-1.5 w-full h-9 rounded-lg bg-surface border border-border hover:bg-surface-raised text-xs font-bold uppercase tracking-wider transition-all">
                    <span>Coordinate shared cart pools</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </Card>
            </div>

            {/* 📖 EDUCATIONAL GUIDE: HOW THE RUNWAY MATH WORKS */}
            <Card className="p-6 border border-border bg-card/15">
              <div className="flex items-center gap-1.5 mb-4 border-b border-border/40 pb-3">
                <HelpCircle className="h-4.5 w-4.5 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-wider text-foreground font-display">How the Runway Engine Works</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Step 1 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">1</span>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Calculate Flexible Cash</h4>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    We start with your total cycle allowance (e.g. ₹{Math.round(forecast.current_cycle.available_funding / 100).toLocaleString("en-IN")}) and subtract what you've already spent, plus any <strong>Fixed Commitments</strong> (Netflix, Mess bills, cart pools, exam reserve buffers). What is left is your <strong>Flexible Discretionary Pool</strong> (currently <strong>₹{Math.round(remainingDiscretionary / 100).toLocaleString("en-IN")}</strong>).
                  </p>
                </div>

                {/* Step 2 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-pb-amber/10 text-pb-amber flex items-center justify-center text-[11px] font-bold">2</span>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Estimate Spend Speed (Pace)</h4>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Instead of a simple average, we use <strong>EWMA (Exponentially Weighted Moving Average)</strong>. This means recent days count much more than older days. We also apply <strong>weekend weights</strong> (typically 1.3x multiplier) because students tend to order more food and travel on weekends.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-pb-green/10 text-pb-green flex items-center justify-center text-[11px] font-bold">3</span>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Project the Countdown</h4>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    We divide your <strong>Flexible Pool</strong> by your <strong>Spend Speed</strong> to calculate exactly how many days you survive before going broke (<strong>{forecast.projection.days_until_broke} days</strong>). If this countdown is shorter than the days remaining in your cycle ({daysLeftInCycle} days), the engine flags a shortfall and tells you exactly what to request home.
                  </p>
                </div>
              </div>
            </Card>

          </div>
        )}

        {/* ── Tab: Commitments ── */}
        {activeTab === "commitments" && (
          <div className="space-y-6">
            <Card className="p-6 border border-border bg-card/25">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-base font-black text-foreground uppercase tracking-wider">Fixed Obligations List</h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    Scheduled expenditures that bypass standard daily discretionary pacing.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Total Obligations</span>
                  <span className="text-lg font-black text-primary">{formatRs(forecast.commitments.total)}</span>
                </div>
              </div>

              {forecast.commitments.items?.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  No fixed commitments or reserves found for this allowance cycle.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {forecast.commitments.items.map((item: any, i: number) => {
                    const due = new Date(item.due_at);
                    return (
                      <div key={i} className="py-3.5 flex justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-white/5 border border-border/40 text-zinc-400">
                            {item.kind === "subscription" ? <CreditCard className="h-4.5 w-4.5 text-primary/80" /> :
                             item.kind === "mess" ? <Layers className="h-4.5 w-4.5 text-pb-amber/80" /> :
                             item.kind === "exam_buffer" ? <ShieldCheck className="h-4.5 w-4.5 text-pb-green/80" /> :
                             <Layers className="h-4.5 w-4.5 text-pb-blue/80" />}
                          </div>
                          <div>
                            <p className="text-xs font-black text-foreground">{item.label}</p>
                            <p className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                              <Calendar className="h-3 w-3" />
                              <span>Due: {due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={`text-[9px] uppercase font-black tracking-wider ${
                            item.status === "scheduled" ? "border-pb-green/30 text-pb-green" :
                            item.status === "reserved" ? "border-pb-purple/30 text-pb-purple" :
                            "border-zinc-500/30 text-zinc-500"
                          }`}>
                            {item.status}
                          </Badge>
                          <span className="text-xs font-black text-foreground tnum">{formatRs(item.amount)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Profile setup reminder for Mess and Exams */}
            <Card className="p-5 border border-border/50 bg-surface flex flex-col sm:flex-row items-center gap-4 justify-between">
              <div className="flex gap-3">
                <div className="p-2.5 rounded-full bg-primary/10 text-primary self-start sm:self-center">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-foreground uppercase tracking-wider">Configure your profile contexts</h4>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                    Update your campus settings, mess billing model (per meal or monthly cost), and exam schedules in the settings panel to enhance forecast calculation accuracy.
                  </p>
                </div>
              </div>
              <Link to="/settings" className="shrink-0 h-9 rounded-lg border border-border px-4 flex items-center text-xs font-bold uppercase tracking-wider hover:bg-surface-raised transition-all">
                Update Settings
              </Link>
            </Card>
          </div>
        )}

        {/* ── Tab: Horizons ── */}
        {activeTab === "horizons" && (
          <div className="space-y-6">
            {/* Charts Container */}
            <Card className="p-6 border border-border bg-card/25">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-6">Multi-Horizon Projections Outlook</h3>
              
              <div className="h-64 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} fontWeight={700} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={10} fontWeight={700} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
                      labelStyle={{ fontWeight: "bold", color: "var(--foreground)" }}
                    />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "10px", fontWeight: "bold" }} />
                    <Bar dataKey="Allowance / Funding" fill="rgba(34, 197, 94, 0.45)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expected Spend" fill="rgba(239, 68, 68, 0.45)" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="Ending Balance" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Predictions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {forecast.horizons.map((h: any) => {
                const isNegative = h.projected_balance < 0;
                return (
                  <Card key={h.key} className="p-5 border border-border bg-card/30 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-black uppercase tracking-wider text-foreground">{h.label}</h4>
                        <Badge variant="outline" className={`text-[9px] uppercase font-black ${
                          isNegative ? "border-pb-red/30 text-pb-red bg-pb-red/5" : "border-pb-green/30 text-pb-green bg-pb-green/5"
                        }`}>
                          {isNegative ? "Deficit" : "Surplus"}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-3 mb-3 text-center">
                        <div>
                          <span className="text-[9px] text-zinc-500 uppercase tracking-wider block">Income</span>
                          <span className="text-xs font-bold text-zinc-300">{formatRs(h.projected_funding)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-zinc-500 uppercase tracking-wider block">Projected Spend</span>
                          <span className="text-xs font-bold text-zinc-300">{formatRs(h.projected_spend)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-zinc-500 uppercase tracking-wider block">End Balance</span>
                          <span className={`text-xs font-bold ${isNegative ? "text-pb-red" : "text-pb-green"}`}>
                            {formatRs(h.projected_balance)}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-zinc-500 leading-relaxed">
                        <span className="font-semibold block text-zinc-400">Plausible variance range ({forecast.confidence.score}% engine confidence):</span>
                        {formatRs(h.balance_low)} to {formatRs(h.balance_high)}
                      </div>
                    </div>

                    {isNegative && (
                      <div className="mt-4 p-2.5 rounded-lg bg-pb-red/5 border border-pb-red/10 text-[10px] text-pb-red flex items-center justify-between font-semibold">
                        <span>Expected monthly gap:</span>
                        <span>{formatRs(h.monthly_shortfall)} / month</span>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Engine Methodology & Confidence ── */}
        <Card className="p-6 border border-border bg-card/15">
          <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center mb-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <ShieldCheck className="h-4.5 w-4.5 text-pb-green" />
              <span>Forecast Engine V2 Audit</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-500 uppercase">Engine Confidence:</span>
              <Badge className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                forecast.confidence.level === "high" ? "bg-pb-green/10 text-pb-green border border-pb-green/30" :
                forecast.confidence.level === "medium" ? "bg-pb-amber/10 text-pb-amber border border-pb-amber/30" :
                "bg-zinc-500/10 text-zinc-500 border border-zinc-500/30"
              }`}>
                {forecast.confidence.level} ({forecast.confidence.score}%)
              </Badge>
            </div>
          </div>

          <div className="space-y-4 text-xs text-zinc-500 leading-relaxed">
            <p className="font-semibold text-zinc-400">
              Confidence Rationale: {forecast.confidence.reason}
            </p>
            <div className="border-t border-border/50 pt-3">
              <p className="font-bold text-[10px] uppercase tracking-wider text-zinc-400 mb-2">Model Parameters & Ground Rules:</p>
              <ul className="list-disc pl-4 space-y-1.5">
                {forecast.methodology.notes.map((note: string, idx: number) => (
                  <li key={idx}>{note}</li>
                ))}
                <li>
                  Using <strong>{forecast.methodology.lookback_days}-day historical lookback</strong> with a 
                  <strong> decay factor (alpha) of {forecast.methodology.ewma_alpha}</strong> to give higher weight to recent daily spending patterns.
                </li>
                <li>
                  Adjusted for <strong>day-of-week spending variances</strong> (weighting weekend tendencies vs weekday routines).
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
      {/* 📖 RUNWAY FLIGHT MANUAL GUIDE MODAL */}
      <Dialog open={showGuideModal} onOpenChange={setShowGuideModal}>
        <DialogContent className="max-w-lg bg-background border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Compass className="h-4.5 w-4.5 text-primary" />
              <span>PocketBuddy Runway Flight Manual</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-xs leading-relaxed text-zinc-300 font-medium py-2">
            <div>
              <h4 className="font-bold text-foreground uppercase tracking-wider mb-1">The Core Runway Formula</h4>
              <p>
                Your Runway is calculated by dividing your remaining flexible balance by your daily pace:
              </p>
              <div className="mt-1.5 p-2 rounded-lg bg-surface-raised border border-border text-center font-mono text-foreground font-bold">
                Runway (Days) = Flexible Pool / Daily Pace
              </div>
            </div>

            <div>
              <h4 className="font-bold text-foreground uppercase tracking-wider mb-1">Committed vs Flexible Funds</h4>
              <p>
                Unlike basic trackers, PocketBuddy reserves money for your hostel mess bills, active roommate pools, Netflix subscriptions, and a custom exam safety buffer. This keeps your essential obligations protected from daily spending sprees.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-foreground uppercase tracking-wider mb-1">Exponential Weighted Pace (EWMA)</h4>
              <p>
                Our engine uses a decay factor (alpha) so recent transactions influence your pace more heavily. Splurging yesterday will adjust your warning dials immediately, preventing end-of-month allowance shocks.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-foreground uppercase tracking-wider mb-1">Deficit Prevention ("Ask Home")</h4>
              <p>
                If the forecast detects a deficit before your allowance resets, the system recommends a rounded-up "Ask Home" amount. Requesting this exact buffer helps cover obligations without over-requesting from parents.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
