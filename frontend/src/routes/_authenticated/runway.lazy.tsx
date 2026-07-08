import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { getRunwayForecast, getRunwayIntel } from "@/lib/api/db.functions";
import { rupees } from "@/lib/format";
import { 
  TrendingUp, TrendingDown, AlertTriangle, AlertCircle, CheckCircle2,
  Calendar, CreditCard, PieChart, Info, HelpCircle, ChevronRight,
  ShieldCheck, ArrowRight, Activity, Wallet,
  Clock, Zap, Compass, RefreshCw, Layers, TrendingUp as TrendUpIcon, ArrowUpRight,
  Check, Utensils, Coffee, Car, ShoppingBag, Calculator, Sparkles, Users
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const Route = createLazyFileRoute("/_authenticated/runway")({
  component: RunwayPage,
});

function RunwayPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "commitments" | "horizons">("overview");
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showForecastInputs, setShowForecastInputs] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [affordAmountRs, setAffordAmountRs] = useState("");
  const [affordCategory, setAffordCategory] = useState<"food" | "travel" | "shopping" | "other">("food");

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

  const formatRs = (paise: number) => rupees(paise);

  const [scenarioFoodSwitch, setScenarioFoodSwitch] = useState(false);
  const [scenarioSubscriptionsPaused, setScenarioSubscriptionsPaused] = useState(false);
  const [scenarioPoolSettled, setScenarioPoolSettled] = useState(false);
  const [scenarioHighSpendDay, setScenarioHighSpendDay] = useState(false);
  const [flightProtocol, setFlightProtocol] = useState<"normal" | "glide" | "turbulence">("normal");

  const defaultPace = useMemo(() => {
    return Math.round(Number(forecast?.projection?.projected_daily_spend ?? 0) / 100);
  }, [forecast]);

  const [simulatedDailySpend, setSimulatedDailySpend] = useState<number | null>(null);
  const daysLeftInCycle = forecast?.current_cycle?.days_left ?? 30;
  const projectedDailyPaise = Math.max(0, Number(forecast?.projection?.projected_daily_spend ?? 0));
  const safeDailyPaise = Math.max(0, Number(forecast?.projection?.safe_daily_spend ?? 0));
  const safeDailyRs = Math.max(0, Math.round(safeDailyPaise / 100));
  const simulatorMinSpend = 10;
  const forecastNeedsSetup = forecast?.status === "setup_required" || forecast?.setup_required;
  const noSpendHistory = !forecastNeedsSetup && (forecast?.projection?.pace_source === "no_recent_history" || (forecast?.confidence?.active_days ?? 0) <= 0);
  const safeDailyIsZero = !forecastNeedsSetup && safeDailyPaise <= 0;
  const hasForecastPace = !forecastNeedsSetup && (defaultPace > 0 || safeDailyRs > 0);
  const activeSimulatedSpend = simulatedDailySpend ?? (defaultPace > 0 ? defaultPace : safeDailyRs > 0 ? safeDailyRs : simulatorMinSpend);
  const decisionEngine = forecast?.decision_engine;
  const absorbedFactors = decisionEngine?.absorbed ?? [];
  const foodRoutine = forecast?.food_routine;
  const stressBand = forecast?.projection?.stress_band;
  const expectedRunwayDays = Number(stressBand?.expected?.days_until_broke ?? forecast?.projection?.days_until_broke ?? 0);
  const stressRunwayDays = Number(stressBand?.stress?.days_until_broke ?? forecast?.projection?.days_until_broke ?? 0);
  const calmRunwayDays = Number(stressBand?.calm?.days_until_broke ?? expectedRunwayDays);
  const topDrivers = (decisionEngine?.drivers ?? forecast?.drivers ?? []) as Array<{
    kind: string;
    label: string;
    detail: string;
    impact?: number;
    severity?: string;
  }>;
  const nextBestAction = decisionEngine?.next_best_action ?? forecast?.action;
  const subscriptionCommitmentTotal = useMemo(() => {
    if (!forecast?.commitments?.items) return 0;
    return forecast.commitments.items
      .filter((i: any) => i.kind === "subscription")
      .reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);
  }, [forecast]);
  const examBufferCommitmentTotal = useMemo(() => {
    if (!forecast?.commitments?.items) return 0;
    return forecast.commitments.items
      .filter((i: any) => i.kind === "exam_buffer")
      .reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);
  }, [forecast]);
  const poolCommitmentTotal = useMemo(() => {
    if (!forecast?.commitments?.items) return 0;
    return forecast.commitments.items
      .filter((i: any) => i.kind === "pool")
      .reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);
  }, [forecast]);
  const movableCommitmentTotal = useMemo(() => {
    if (!forecast?.commitments?.items) return 0;
    return forecast.commitments.items
      .filter((i: any) => !["exam_buffer", "pool", "mess"].includes(i.kind))
      .reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);
  }, [forecast]);
  const foodSwitchSaving = Math.max(0, Number(forecast?.food_routine?.savings_if_replace_two_deliveries ?? 0));
  const foodPacePaise = Math.max(0, Number(forecast?.food_routine?.food_daily_pace ?? 0));
  const foodCapPaise = Math.max(0, Number(forecast?.food_routine?.recommended_daily_food_cap ?? 0));
  const mealPlanLeverAmount = Math.max(foodSwitchSaving, foodPacePaise > foodCapPaise ? foodPacePaise - foodCapPaise : 0);
  const canUseMealLever = mealPlanLeverAmount > 0;
  const fixedCostLeverAmount = subscriptionCommitmentTotal || movableCommitmentTotal;
  const canUseFixedCostLever = fixedCostLeverAmount > 0;
  const fixedCostLeverLabel = subscriptionCommitmentTotal
    ? "Pause scheduled subscriptions"
    : movableCommitmentTotal
      ? "Move the next fixed debit"
      : "No fixed debit found";
  const sharedPlanLeverAmount = poolCommitmentTotal;
  const canUseSharedPlanLever = sharedPlanLeverAmount > 0;
  const sharedPlanLeverLabel = poolCommitmentTotal ? "Settle pool dues" : "No pool dues found";
  const highSpendDayAmount = Math.max(projectedDailyPaise, safeDailyPaise, defaultPace * 100);
  const canStressHighSpend = highSpendDayAmount > 0;
  const stretchModeDailyRs = Math.max(
    simulatorMinSpend,
    Math.min(defaultPace, Math.round((safeDailyRs || defaultPace) * 0.8))
  );
  const emergencyModeDailyRs = Math.max(
    simulatorMinSpend,
    Math.min(
      Math.max(simulatorMinSpend, stretchModeDailyRs - 10),
      Math.round((safeDailyRs || defaultPace) * 0.5)
    )
  );
  const sliderMaxSpend = Math.max(500, Math.ceil(Math.max(defaultPace, safeDailyRs, 250) * 2 / 100) * 100);
  const simulatorPresets = useMemo(() => {
    const entries = [
      defaultPace > 0 ? { label: "Actual pace", value: defaultPace } : null,
      safeDailyRs > 0 ? { label: "Safe/day", value: safeDailyRs } : null,
      forecast?.food_routine?.recommended_daily_food_cap
        ? { label: "Food cap", value: Math.max(20, Math.round(forecast.food_routine.recommended_daily_food_cap / 100)) }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: number }>;
    const seen = new Set<number>();
    return entries.filter((entry) => {
      if (!entry.value || seen.has(entry.value)) return false;
      seen.add(entry.value);
      return true;
    });
  }, [defaultPace, safeDailyRs, forecast]);

  const adjustedCommitmentsTotal = useMemo(() => {
    if (!forecast) return 0;
    return forecast.commitments.total;
  }, [forecast]);

  const chaiEquivalent = useMemo(() => {
    const val = Number(affordAmountRs) || 0;
    return Math.max(1, Math.round(val / 15)); // ₹15 per chai
  }, [affordAmountRs]);

  const mealEquivalent = useMemo(() => {
    const val = Number(affordAmountRs) || 0;
    return Math.max(1, Math.round(val / 80)); // ₹80 per meal
  }, [affordAmountRs]);

  const AFFORD_PRESETS = [
    { label: "Chai & Maggi", amount: "35", category: "food" as const, icon: Coffee },
    { label: "Canteen Meal", amount: "80", category: "food" as const, icon: Utensils },
    { label: "Auto Ride", amount: "60", category: "travel" as const, icon: Car },
    { label: "Swiggy Order", amount: "250", category: "food" as const, icon: Utensils },
    { label: "Stationery", amount: "100", category: "other" as const, icon: CreditCard },
    { label: "Movie / Outing", amount: "450", category: "shopping" as const, icon: ShoppingBag },
  ];



  const adjustedSpent = useMemo(() => {
    if (!forecast) return 0;
    return forecast.current_cycle.spent + (scenarioHighSpendDay ? highSpendDayAmount : 0);
  }, [forecast, scenarioHighSpendDay, highSpendDayAmount]);

  const remainingDiscretionary = useMemo(() => {
    if (!forecast) return 0;
    let totalFunding = forecast.current_cycle.available_funding;
    let spent = adjustedSpent;
    let commitments = adjustedCommitmentsTotal;
    
    let baseDiscretionary = totalFunding - spent - commitments;
    if (scenarioFoodSwitch && canUseMealLever) {
      baseDiscretionary += mealPlanLeverAmount;
    }
    if (scenarioSubscriptionsPaused && canUseFixedCostLever) {
      baseDiscretionary += fixedCostLeverAmount;
    }
    if (scenarioPoolSettled && canUseSharedPlanLever) {
      baseDiscretionary += sharedPlanLeverAmount;
    }
    return Math.max(0, baseDiscretionary);
  }, [forecast, adjustedSpent, adjustedCommitmentsTotal, scenarioFoodSwitch, scenarioSubscriptionsPaused, scenarioPoolSettled, canUseMealLever, mealPlanLeverAmount, canUseFixedCostLever, fixedCostLeverAmount, canUseSharedPlanLever, sharedPlanLeverAmount]);

  const simulatedDays = useMemo(() => {
    if (!hasForecastPace || activeSimulatedSpend <= 0) return 0;
    return Math.floor(remainingDiscretionary / (activeSimulatedSpend * 100));
  }, [hasForecastPace, remainingDiscretionary, activeSimulatedSpend]);

  const simulatedBrokeDate = useMemo(() => {
    if (!forecast) return "";
    const brokeDate = new Date(Date.now() + simulatedDays * 24 * 60 * 60 * 1000);
    return brokeDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }, [forecast, simulatedDays]);

  const isSimulatedSafe = simulatedDays >= daysLeftInCycle;
  const actualAskHomeAmount = forecast?.projection?.ask_home_amount ?? 0;
  const simulatedGapPaise = isSimulatedSafe ? 0 : Math.max(0, (daysLeftInCycle - simulatedDays) * activeSimulatedSpend * 100);
  const affordAmountPaise = Math.max(0, Math.round((Number(affordAmountRs) || 0) * 100));
  const affordCheck = useMemo(() => {
    if (!forecast || affordAmountPaise <= 0) {
      return {
        status: "idle",
        title: "Enter an amount",
        detail: "Check one meal, ride, or purchase before paying.",
        tone: "border-border bg-surface/50 text-muted-foreground",
        runwayDaysLost: 0,
      };
    }
    const runwayDaysLost = safeDailyPaise > 0 ? affordAmountPaise / safeDailyPaise : daysLeftInCycle;
    const nextSafeDaily = Math.max(0, Math.floor((remainingDiscretionary - affordAmountPaise) / Math.max(1, daysLeftInCycle)));
    const categoryAdvice = affordCategory === "food"
      ? foodRoutine?.action?.title || "Use the lowest-cost routine meal if possible."
      : affordCategory === "travel"
        ? "Book only if the ride is essential or fits today’s safe limit."
        : affordCategory === "shopping"
          ? "Delay this unless it is required before reset."
          : "Keep it inside today’s safe limit.";
    if (safeDailyIsZero || affordAmountPaise > remainingDiscretionary) {
      return {
        status: "avoid",
        title: "Avoid for now",
        detail: `${formatRs(affordAmountPaise)} does not fit the remaining flexible cash. ${categoryAdvice}`,
        tone: "border-pb-red/20 bg-pb-red/5 text-pb-red",
        runwayDaysLost,
      };
    }
    if (affordAmountPaise <= safeDailyPaise) {
      return {
        status: "safe",
        title: "Safe if this is today’s main flexible spend",
        detail: `${formatRs(affordAmountPaise)} keeps the next safe/day near ${formatRs(nextSafeDaily)}. ${categoryAdvice}`,
        tone: "border-pb-green/20 bg-pb-green/5 text-pb-green",
        runwayDaysLost,
      };
    }
    return {
      status: "tight",
      title: "Tight",
      detail: `${formatRs(affordAmountPaise)} is above today’s safe/day and uses about ${runwayDaysLost.toFixed(1)} runway days. ${categoryAdvice}`,
      tone: "border-pb-amber/20 bg-pb-amber/5 text-pb-amber",
      runwayDaysLost,
    };
  }, [forecast, affordAmountPaise, affordCategory, safeDailyPaise, safeDailyIsZero, remainingDiscretionary, daysLeftInCycle, foodRoutine]);

  const calculatorRunwayPct = useMemo(() => {
    return Math.min(100, (affordCheck.runwayDaysLost / daysLeftInCycle) * 100);
  }, [affordCheck.runwayDaysLost, daysLeftInCycle]);

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const gaugePercentage = Math.min(100, (simulatedDays / Math.max(1, daysLeftInCycle)) * 100);
  const strokeDashoffset = circumference - (gaugePercentage / 100) * circumference;
  const strokeColor = isSimulatedSafe ? "stroke-pb-green" : "stroke-pb-red";
  const gaugeFilter = `drop-shadow(0 0 5px ${isSimulatedSafe ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)"})`;

  const copyFlightBrief = () => {
    if (!forecast) return;
    if (forecastNeedsSetup) {
      toast.error("Add allowance or synced funding before copying a runway brief.");
      return;
    }
    const brief = `PocketBuddy Runway Brief:
* Current Status: ${isSimulatedSafe ? "Safe through reset" : "Shortfall warning"}
* Remaining Flexible Pool: ${formatRs(remainingDiscretionary)}
* Simulated Daily Pace: ${formatRs(activeSimulatedSpend * 100)}/day
* Estimated Runway: ${simulatedDays} days (survival until ${simulatedBrokeDate})
* Cycle Remaining: ${daysLeftInCycle} days
${isSimulatedSafe 
  ? "* Plan: Staying under budget. On track to complete the allowance cycle safely." 
  : `* Simulation gap: This sandbox setting runs out ${daysLeftInCycle - simulatedDays} days early with a gap of ${formatRs(simulatedGapPaise)}. The real ask-home amount is ${actualAskHomeAmount > 0 ? formatRs(actualAskHomeAmount) : "not required in the base forecast"}.`}
* Committed Reserve: ${formatRs(adjustedCommitmentsTotal)}

Generated via PocketBuddy Runway.`;

    navigator.clipboard.writeText(brief);
    toast.success("Runway brief copied to clipboard.");
  };

  // Compute status details
  const statusDetails = useMemo(() => {
    if (!forecast) return { color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20", icon: HelpCircle, text: "Unknown" };
    const status = forecast.status;
    if (status === "setup_required") {
      return {
        color: "text-primary",
        bg: "bg-primary/10",
        border: "border-primary/20",
        icon: Info,
        text: "Setup needed"
      };
    }
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
    if (!forecast) return { grade: "N/A", text: "Calculating", color: "text-zinc-500", bg: "bg-zinc-500/10", border: "border-zinc-500/20", description: "Calculating runway projections..." };
    if (forecast.status === "setup_required") {
      return {
        grade: "—",
        text: "Setup needed",
        color: "text-primary",
        bg: "bg-primary/10",
        border: "border-primary/20",
        description: forecast.setup_reason ?? "Add allowance or synced funding before Runway produces a trusted forecast."
      };
    }
    const prob = forecast.projection.shortfall_probability;
    if (prob <= 0) {
      return {
        grade: "A",
        text: "Healthy",
        color: "text-pb-green",
        bg: "bg-pb-green/10",
        border: "border-pb-green/20",
        description: "Your daily pace fits safely within your remaining discretionary pool. No shortfalls projected."
      };
    }
    if (prob < 0.15) {
      return {
        grade: "B",
        text: "Stable",
        color: "text-pb-green",
        bg: "bg-pb-green/10",
        border: "border-pb-green/20",
        description: "You are mostly on track. Maintain standard discipline and monitor daily dinner plans."
      };
    }
    if (prob < 0.35) {
      return {
        grade: "C",
        text: "Watch",
        color: "text-pb-amber",
        bg: "bg-pb-amber/10",
        border: "border-pb-amber/20",
        description: "Your spending pace is slightly high. Consider dialing back dining delivery to avoid a late-cycle deficit."
      };
    }
    if (prob < 0.60) {
      return {
        grade: "D",
        text: "High Risk",
        color: "text-pb-red",
        bg: "bg-pb-red/10",
        border: "border-pb-red/20",
        description: "Significant shortfall risk ahead. Lower daily spend or settle fixed costs to extend your allowance."
      };
    }
    return {
      grade: "F",
      text: "Deficit",
      color: "text-pb-red",
      bg: "bg-pb-red/10",
      border: "border-pb-red/20",
      description: "Allowance depletion is likely before reset. Request a clear buffer or reduce daily spend immediately."
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

  const activeActionType = nextBestAction?.type || forecast?.action?.type || "on_track";
  const activeActionTitle = activeActionType === "ask_home" && actualAskHomeAmount > 0
    ? `Ask home for ${formatRs(actualAskHomeAmount)}`
    : nextBestAction?.title || forecast?.action?.title || "Runway action";
  const activeActionDetail = activeActionType === "ask_home"
    ? "This is the real forecast shortfall buffer from your allowance, commitments, current pace, and high-spend range."
    : nextBestAction?.detail || forecast?.action?.detail || "Keep daily flexible spending inside the safe limit until the next allowance reset.";
  const commitmentSummary = useMemo(() => {
    if (!forecast?.commitments?.by_kind) return [];
    const byKind = forecast.commitments.by_kind;
    return [
      { key: "subscription", label: "Subscriptions", amount: byKind.subscription || 0 },
      { key: "mess", label: "Meal routine", amount: byKind.mess || 0 },
      { key: "pool", label: "Pool dues", amount: byKind.pool || 0 },
      { key: "exam_buffer", label: "Exam buffer", amount: byKind.exam_buffer || 0 },
    ].filter((item) => item.amount > 0);
  }, [forecast]);
  const projectionSignal = useMemo(() => {
    if (!forecast?.horizons?.length) return null;
    const firstDeficit = forecast.horizons.find((h: any) => h.projected_balance < 0);
    const finalHorizon = forecast.horizons[forecast.horizons.length - 1];
    return {
      label: firstDeficit?.label ?? finalHorizon?.label,
      isDeficit: Boolean(firstDeficit),
      balance: firstDeficit?.projected_balance ?? finalHorizon?.projected_balance ?? 0,
    };
  }, [forecast]);
  const forecastInputCount = absorbedFactors.length || commitmentSummary.length;
  const forecastInputSummary = forecastInputCount > 0
    ? `${forecastInputCount} live input${forecastInputCount === 1 ? "" : "s"} included`
    : "No reserved-cost inputs yet";
  const horizonTakeaway = projectionSignal
    ? projectionSignal.isDeficit
      ? `First projected deficit appears around ${projectionSignal.label}.`
      : `Long-range view stays positive through ${projectionSignal.label}.`
    : "Projection will appear once horizon data is available.";
  const [selectedActionId, setSelectedActionId] = useState("priority");
  const runwayActions = useMemo(() => {
    if (!forecast) return [];
    const actionsList = [
      {
        id: "priority",
        label: `Priority: ${activeActionTitle}`,
        detail: activeActionDetail,
        severity: activeActionType === "ask_home" ? "high" : forecast.status === "watch" ? "medium" : "low"
      }
    ];

    if (forecast.status === "shortfall") {
      actionsList.push({
        id: "action-1",
        label: "1. Shield Your Exam Safety Buffer",
        detail: examBufferCommitmentTotal > 0
          ? `Your configured buffer of ${formatRs(examBufferCommitmentTotal)} is locked. Avoid dipping into it for regular food spending.`
          : "No exam buffer is configured yet. Keep essentials separate before reducing food or travel spend.",
        severity: "high"
      });
      actionsList.push({
        id: "action-2",
        label: "2. Auto-Debit Subscription Alert",
        detail: `You have ${forecast.commitments.items?.filter((i: any) => i.kind === "subscription").length || 0} recurring subscriptions active. Temporarily pause one to reclaim breathing room.`,
        severity: "medium"
      });
      actionsList.push({
        id: "action-3",
        label: `3. ${foodRoutine?.action?.title ?? "Stabilize food pace"}`,
        detail: foodRoutine?.action?.detail ?? "Use routine meals before delivery becomes the default. This keeps daily food spend inside your safe runway limit.",
        severity: "low"
      });
    } else {
      actionsList.push({
        id: "action-1",
        label: "1. Lock in an Emergency Reserve",
        detail: examBufferCommitmentTotal > 0
          ? `Your ${formatRs(examBufferCommitmentTotal)} exam reserve is already protected in the runway calculation.`
          : "Since you're on track, set an emergency reserve in settings so future spending cannot consume essentials.",
        severity: "low"
      });
      actionsList.push({
        id: "action-2",
        label: "2. Spending Pace Guardrails",
        detail: decisionEngine?.summary ?? `Try to stay within ${formatRs(forecast.projection.safe_daily_spend)} per day to keep your runway healthy.`,
        severity: "medium"
      });
      actionsList.push({
        id: "action-3",
        label: `3. ${foodRoutine?.action?.title ?? "Keep meals predictable"}`,
        detail: foodRoutine?.action?.detail ?? "Keep food pace predictable so runway can reserve enough for travel, exams, and shared-pool dues.",
        severity: "low"
      });
    }

    return actionsList;
  }, [forecast, activeActionTitle, activeActionDetail, activeActionType, examBufferCommitmentTotal, foodRoutine, decisionEngine]);



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

  if (forecastNeedsSetup) {
    return (
      <AppShell>
        <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
          <div className="flex items-center gap-3 min-w-0">
            <MobileMenuButton />
            <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">
              Runway & Forecasts
            </h1>
          </div>
          <button
            onClick={handleRefresh}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground transition-all hover:bg-surface-raised cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-auto max-w-3xl py-8 pb-32">
          <Card className="border border-primary/20 bg-card p-5 sm:p-7 shadow-sm">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Info className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Runway setup needed</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Add funding before trusting the forecast</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {forecast.setup_reason ?? "Add your monthly allowance or sync an allowance credit before Runway calculates safe/day, shortfall, and ask-home guidance."}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-surface/60 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Profile</p>
                    <p className="mt-1 text-sm text-foreground">Set monthly allowance and reset day.</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface/60 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Transactions</p>
                    <p className="mt-1 text-sm text-foreground">Sync or add recent payments to build daily pace.</p>
                  </div>
                </div>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                  <Link to="/settings" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-xs font-bold uppercase tracking-wider text-primary-foreground transition hover:bg-primary/90">
                    Open Settings
                  </Link>
                  <Link to="/transactions" className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-xs font-bold uppercase tracking-wider text-foreground transition hover:bg-surface-raised">
                    View Transactions
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Spend breakdown percentage
  const totalSpendSplit = forecast.spend_split.committed + forecast.spend_split.flexible;
  const committedPct = totalSpendSplit > 0 ? Math.round((forecast.spend_split.committed / totalSpendSplit) * 100) : 0;
  const flexiblePct = totalSpendSplit > 0 ? 100 - committedPct : 0;
  const allowanceProgressPct = forecast.current_cycle.available_funding > 0
    ? Math.min(100, Math.max(0, Math.round((forecast.current_cycle.spent / forecast.current_cycle.available_funding) * 100)))
    : 0;
  const discretionaryFuelPct = forecast.current_cycle.available_funding > 0
    ? Math.min(100, Math.max(0, Math.round((remainingDiscretionary / forecast.current_cycle.available_funding) * 100)))
    : 0;
  const dailyGapPaise = projectedDailyPaise - safeDailyPaise;
  const reservedTotal = forecast.commitments.total;
  const remainingBalance = forecast.current_cycle.remaining;
  const coveredDaysLabel = forecast.status === "shortfall"
    ? `${forecast.projection.days_until_broke} days before shortfall`
    : safeDailyIsZero
      ? "No flexible spend left"
    : `${daysLeftInCycle} days covered`;
  const paceMessage = safeDailyIsZero
    ? "No discretionary budget remains after commitments."
    : noSpendHistory
      ? "No spend history yet; use this as a temporary cap."
      : dailyGapPaise > 0
    ? `You are ${formatRs(dailyGapPaise)}/day above the safe pace.`
    : dailyGapPaise < 0
      ? `You are ${formatRs(Math.abs(dailyGapPaise))}/day below the limit.`
      : "Your current pace matches the safe limit.";
  const safeDailyDisplay = safeDailyIsZero ? "Pause" : formatRs(safeDailyPaise);
  const modeCards = [
    {
      key: "normal" as const,
      title: "Current",
      amount: noSpendHistory ? null : defaultPace > 0 ? defaultPace * 100 : projectedDailyPaise,
      text: noSpendHistory ? "Needs recent payments before pace is trusted." : "Shows what happens if nothing changes.",
    },
    {
      key: "glide" as const,
      title: "Stretch",
      amount: safeDailyIsZero ? null : stretchModeDailyRs * 100,
      text: safeDailyIsZero ? "No stretch budget is available." : "A realistic lower daily target for the rest of the cycle.",
    },
    {
      key: "turbulence" as const,
      title: "Emergency",
      amount: safeDailyIsZero ? null : emergencyModeDailyRs * 100,
      text: safeDailyIsZero ? "Pause non-essential spend and add funding." : "Strict plan that protects essentials first.",
    },
  ];
  const availableLeverCount = [
    canUseMealLever,
    canUseFixedCostLever,
    canUseSharedPlanLever,
  ].filter(Boolean).length;
  const selectRunwayMode = (mode: "normal" | "glide" | "turbulence") => {
    setFlightProtocol(mode);
    setScenarioHighSpendDay(false);
    if (mode === "normal") {
      setSimulatedDailySpend(null);
      setScenarioFoodSwitch(false);
      setScenarioSubscriptionsPaused(false);
      setScenarioPoolSettled(false);
      toast.info("Current plan selected.");
      return;
    }
    if (mode === "glide") {
      if (safeDailyIsZero) {
        setSimulatedDailySpend(null);
        setScenarioFoodSwitch(false);
        setScenarioSubscriptionsPaused(false);
        setScenarioPoolSettled(false);
        toast.warning("No discretionary spend is available. Pause non-essential spending or add funding first.");
        return;
      }
      setSimulatedDailySpend(stretchModeDailyRs);
      setScenarioFoodSwitch(false);
      setScenarioSubscriptionsPaused(false);
      setScenarioPoolSettled(false);
      toast.success(`Stretch plan selected at ${formatRs(stretchModeDailyRs * 100)}/day.`);
      return;
    }
    if (safeDailyIsZero) {
      setSimulatedDailySpend(null);
      setScenarioFoodSwitch(false);
      setScenarioSubscriptionsPaused(false);
      setScenarioPoolSettled(false);
      toast.warning("Emergency plan: pause non-essential spending and add funding before spending again.");
      return;
    }
    setSimulatedDailySpend(emergencyModeDailyRs);
    setScenarioFoodSwitch(canUseMealLever);
    setScenarioSubscriptionsPaused(canUseFixedCostLever);
    setScenarioPoolSettled(canUseSharedPlanLever);
    toast.warning(`Emergency plan selected at ${formatRs(emergencyModeDailyRs * 100)}/day.`);
  };

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
            <span className="hidden sm:inline">Runway Guide</span>
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
        {/* ── Runway Advisor Narration (Sleek Notification Bar) ── */}
        <div className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all duration-300 ${
          activeActionType === "ask_home"
            ? "border-pb-red/30 bg-pb-red/5 text-pb-red"
            : forecast.status === "watch"
              ? "border-pb-amber/30 bg-pb-amber/5 text-pb-amber"
              : "border-primary/20 bg-primary/5 text-primary"
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            {activeActionType === "ask_home" ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <Sparkles className="h-4 w-4 shrink-0 text-pb-amber" />
            )}
            <span className="truncate">
              <strong>Advisor:</strong> {activeActionTitle} &mdash; {activeActionDetail}
            </span>
          </div>
          {activeActionType === "ask_home" && actualAskHomeAmount > 0 && (
            <span className="shrink-0 font-mono font-bold text-pb-red bg-pb-red/10 px-2 py-0.5 rounded text-[10px]">
              Need {formatRs(actualAskHomeAmount)}
            </span>
          )}
        </div>

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
            {false && (
              <>
            <Card className="overflow-hidden border border-border bg-surface">
              <div className={`h-1 ${forecast.status === "shortfall" ? "bg-destructive" : forecast.status === "watch" ? "bg-warning" : "bg-success"}`} />
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="p-5 sm:p-7">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`${statusDetails.bg} ${statusDetails.border} ${statusDetails.color} border text-[10px] font-bold uppercase tracking-wider`}>
                      {statusDetails.text}
                    </Badge>
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      Reset in {daysLeftInCycle} days
                    </span>
                  </div>

                  <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Runway</p>
                      <h2 className="mt-2 text-[34px] sm:text-[44px] font-semibold leading-none tracking-tight text-foreground">
                        {coveredDaysLabel}
                      </h2>
                      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                        {forecast.status === "shortfall"
                          ? `At the current pace, you need ${formatRs(actualAskHomeAmount)} to safely reach reset.`
                          : safeDailyIsZero
                            ? "Known spending and commitments have used the flexible budget. Treat this as a pause signal, not a spending allowance."
                          : noSpendHistory
                            ? "Allowance is configured, but Runway still needs recent payments before it can trust the current pace."
                          : "Your current cycle can stay safe if daily flexible spend stays inside the limit shown here."}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-card/60 p-4 sm:min-w-[180px]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Today's limit</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight text-primary tnum">{safeDailyDisplay}</p>
                      <p className={`mt-1 text-[11px] font-medium ${dailyGapPaise > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {paceMessage}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Balance</p>
                      <p className="mt-1 text-sm font-semibold text-foreground tnum">{formatRs(remainingBalance)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Spent</p>
                      <p className="mt-1 text-sm font-semibold text-foreground tnum">{formatRs(forecast.current_cycle.spent)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Reserved</p>
                      <p className="mt-1 text-sm font-semibold text-foreground tnum">{formatRs(reservedTotal)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Risk</p>
                      <p className="mt-1 text-sm font-semibold text-foreground tnum">{Math.round(forecast.projection.shortfall_probability * 100)}%</p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <Progress value={allowanceProgressPct} className="h-1.5 bg-surface-raised" />
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{formatRs(forecast.current_cycle.spent)} spent</span>
                      <span>{allowanceProgressPct}% of funding used</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border bg-card/35 p-5 sm:p-7 lg:border-l lg:border-t-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Do this next</p>
                  <h3 className="mt-2 text-lg font-semibold leading-tight text-foreground">{activeActionTitle}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{activeActionDetail}</p>
                  {activeActionType === "ask_home" && actualAskHomeAmount > 0 && (
                    <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-destructive">Request buffer</p>
                      <p className="mt-1 text-2xl font-semibold text-destructive tnum">{formatRs(actualAskHomeAmount)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">This is from the forecast gap, not a simulator number.</p>
                    </div>
                  )}
                  {intel?.summary && !intelError && (
                    <div className="mt-5 rounded-xl border border-border bg-surface/70 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Advisor note</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{intel.summary}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <Card className="border border-border bg-card/25 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">What changed the runway</p>
                    <h3 className="mt-2 text-base font-semibold text-foreground">Main pressure points</h3>
                  </div>
                  <Badge variant="outline" className="border-border bg-surface text-[10px] font-bold uppercase tracking-wider">
                    {forecast.confidence.level} confidence
                  </Badge>
                </div>

                <div className="mt-5 divide-y divide-border/60">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Food routine</p>
                      <p className="text-xs text-muted-foreground">
                        {(foodRoutine?.cycle_food_count ?? 0) > 0
                          ? `${foodRoutine?.label ?? "Meal pattern"} tracked from current cycle.`
                          : "No food payments this cycle; routine is estimated from profile until transactions sync."}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-foreground tnum">
                      {(foodRoutine?.food_daily_pace ?? 0) > 0 ? `${formatRs(foodRoutine?.food_daily_pace ?? 0)}/day` : "No logs"}
                    </span>
                  </div>
                  {commitmentSummary.length ? commitmentSummary.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.key === "subscription" ? "Scheduled before reset." :
                           item.key === "pool" ? "Shared cart dues included." :
                           item.key === "exam_buffer" ? "Kept aside for exam days." :
                           "Meal cost reserved before flexible spend."}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-foreground tnum">{formatRs(item.amount)}</span>
                    </div>
                  )) : (
                    <div className="py-4 text-sm text-muted-foreground">
                      No fixed commitments found yet. Add subscriptions, mess cost, or pool dues to make this more accurate.
                    </div>
                  )}
                </div>
              </Card>

              <Card className="border border-border bg-card/25 p-5 sm:p-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Try a plan</p>
                  <h3 className="mt-2 text-base font-semibold text-foreground">Choose how strict you want to be</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Modes change the daily target and the realistic actions used in the simulation.
                  </p>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {modeCards.map((mode) => (
                    <button
                      key={mode.key}
                      onClick={() => selectRunwayMode(mode.key)}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        flightProtocol === mode.key
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-surface/60 text-muted-foreground hover:border-primary/40 hover:bg-surface"
                      }`}
                    >
                      <p className="text-xs font-semibold text-foreground">{mode.title}</p>
                      <p className="mt-1 text-lg font-semibold tracking-tight tnum">
                        {mode.amount === null ? (mode.key === "normal" ? "No history" : "Pause") : formatRs(mode.amount)}
                        {mode.amount !== null && <span className="text-[11px] text-muted-foreground">/day</span>}
                      </p>
                      <p className="mt-1 text-[11px] leading-snug">{mode.text}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-xl border border-border bg-surface/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Simulation result</p>
                      <p className="mt-1 text-xl font-semibold text-foreground tnum">{safeDailyIsZero ? "Pause" : `${simulatedDays} days`}</p>
                    </div>
                    <Badge variant="outline" className={`${isSimulatedSafe ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"} text-[10px] font-bold uppercase tracking-wider`}>
                      {isSimulatedSafe ? "Reaches reset" : "Falls short"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {safeDailyIsZero
                      ? "There is no safe discretionary spend left. Add funding, reduce commitments, or wait for reset before non-essential spending."
                      : isSimulatedSafe
                      ? `This plan reaches the reset date with ${formatRs(remainingDiscretionary)} flexible balance before daily spend.`
                      : `This plan runs out ${Math.max(0, daysLeftInCycle - simulatedDays)} days early. Gap: ${formatRs(simulatedGapPaise)}.`}
                  </p>

                  {!safeDailyIsZero && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">{noSpendHistory ? "Temporary daily cap" : "Fine tune daily target"}</span>
                      <span className="font-semibold text-primary tnum">{formatRs(activeSimulatedSpend * 100)}/day</span>
                    </div>
                    <input
                      type="range"
                      min={simulatorMinSpend}
                      max={sliderMaxSpend}
                      step="10"
                      value={activeSimulatedSpend}
                      onChange={(e) => setSimulatedDailySpend(parseInt(e.target.value, 10))}
                      className="w-full h-1.5 cursor-pointer appearance-none rounded-lg bg-border accent-primary focus:outline-none"
                    />
                  </div>
                  )}
                </div>

                {flightProtocol === "normal" && (
                  <div className="mt-4 rounded-xl border border-border bg-surface/50 p-4 text-xs text-muted-foreground">
                    Current mode applies no recovery actions. Use it to understand where your month is headed if nothing changes.
                  </div>
                )}

                {flightProtocol === "glide" && (
                  <div className="mt-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Optional stretch actions</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        { enabled: canUseMealLever, active: scenarioFoodSwitch, set: setScenarioFoodSwitch, label: foodSwitchSaving > 0 ? "Replace delivery twice" : "Tighten food routine", amount: mealPlanLeverAmount },
                        { enabled: canUseFixedCostLever, active: scenarioSubscriptionsPaused, set: setScenarioSubscriptionsPaused, label: fixedCostLeverLabel, amount: fixedCostLeverAmount },
                        { enabled: canUseSharedPlanLever, active: scenarioPoolSettled, set: setScenarioPoolSettled, label: sharedPlanLeverLabel, amount: sharedPlanLeverAmount },
                      ].map((lever) => (
                        <button
                          key={lever.label}
                          disabled={!lever.enabled}
                          onClick={() => lever.set(!lever.active)}
                          className={`rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                            !lever.enabled
                              ? "cursor-not-allowed border-border bg-surface/30 text-muted-foreground opacity-60"
                              : lever.active
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-surface text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          <span className="block font-semibold">{lever.label}</span>
                          <span className="mt-0.5 block text-[11px]">{lever.enabled ? `Adds ${formatRs(lever.amount)}` : "Needs real data first"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {flightProtocol === "turbulence" && (
                  <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-destructive">Emergency rules applied</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Uses the strict daily target and applies {availableLeverCount} available recovery action{availableLeverCount === 1 ? "" : "s"}. Use this only when the base forecast is unsafe.
                    </p>
                    <button
                      disabled={!canStressHighSpend}
                      onClick={() => {
                        if (!canStressHighSpend) return;
                        setScenarioHighSpendDay(!scenarioHighSpendDay);
                      }}
                      className={`mt-3 inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold transition ${
                        !canStressHighSpend
                          ? "cursor-not-allowed border-border bg-surface/30 text-muted-foreground opacity-60"
                          : scenarioHighSpendDay ? "border-destructive bg-destructive/10 text-destructive" : "border-border bg-surface text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {!canStressHighSpend ? "Stress test needs spend history" : scenarioHighSpendDay ? "Remove stress test" : "Stress test one high-spend day"}
                    </button>
                  </div>
                )}

                <button
                  onClick={copyFlightBrief}
                  className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-lg border border-border bg-surface text-xs font-bold uppercase tracking-wider text-foreground transition hover:bg-surface-raised"
                >
                  Copy Runway Brief
                </button>
              </Card>
            </div>

            {foodRoutine?.action && (
              <Card className="border border-border bg-card/20 p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Meal routine</p>
                    <h3 className="mt-1 text-base font-semibold text-foreground">{foodRoutine.action.title}</h3>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{foodRoutine.action.detail}</p>
                  </div>
                  <Badge variant="outline" className="w-fit border-border bg-surface text-[10px] font-bold uppercase tracking-wider">
                    {foodRoutine.label}
                  </Badge>
                </div>
              </Card>
            )}
              </>
            )}

            {/* Runway Safety Grade & Fuel Gauge Card */}
            <Card className="overflow-hidden border border-border bg-surface shadow-sm rounded-2xl">
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 border-4 ${safetyGrade.border} ${safetyGrade.bg}`}>
                      <span className={`text-2xl font-semibold tracking-tight ${safetyGrade.color}`}>{safetyGrade.grade}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-foreground">Runway overview</p>
                        <Badge variant="outline" className={`text-[9px] uppercase font-bold py-0.5 ${safetyGrade.color} ${safetyGrade.bg} ${safetyGrade.border}`}>
                          {safetyGrade.text}
                        </Badge>
                        <Badge variant="outline" className="border-border bg-surface text-[9px] uppercase font-bold py-0.5 text-muted-foreground">
                          {forecast.confidence.level} confidence
                        </Badge>
                      </div>

                      <h2 className="mt-3 text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                        Expected runway: {expectedRunwayDays} days
                      </h2>
                      <p className="mt-2 max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        {safeDailyIsZero
                          ? "Your current balance is tied up by committed costs. Treat this as a pause signal for non-essential spending."
                          : noSpendHistory
                            ? "Allowance is configured, but recent payment history is still thin. Use the safe/day limit as a temporary guardrail."
                            : safetyGrade.description}
                      </p>
                      
                      {/* Calm, Expected, Stress grid - simplified without nested boxes */}
                      <div className="mt-4 grid grid-cols-3 divide-x divide-border/60 border-y border-border/50 py-3">
                        <div className="text-center px-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Calm</p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground tnum">{calmRunwayDays} days</p>
                        </div>
                        <div className="text-center px-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Expected</p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground tnum">{expectedRunwayDays} days</p>
                        </div>
                        <div className="text-center px-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-pb-amber">Stress</p>
                          <p className="mt-0.5 text-sm font-semibold text-foreground tnum">{stressRunwayDays} days</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Spend today, Flexible cash, Reset window grid - simplified without nested cards */}
                  <div className="mt-6 grid grid-cols-3 gap-4 border-b border-border/40 pb-5">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Spend today</p>
                      <p className="text-base font-semibold text-primary tnum">
                        {safeDailyDisplay}
                        {!safeDailyIsZero && <span className="text-[11px] text-zinc-500 font-medium">/day</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">{paceMessage}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Flexible cash</p>
                      <p className="text-base font-semibold text-foreground tnum">{formatRs(remainingDiscretionary)}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">Available flexible pool.</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Reset window</p>
                      <p className="text-base font-semibold text-foreground tnum">{daysLeftInCycle} days</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">Until cycle resets.</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <div className="flex justify-between text-[9px] md:text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      <span>Discretionary fuel</span>
                      <span>{discretionaryFuelPct}% remaining</span>
                    </div>
                    <Progress value={discretionaryFuelPct} className="h-1.5" />
                  </div>
                </div>

                <div className={`border-t border-border p-5 sm:p-6 lg:border-l lg:border-t-0 ${
                  activeActionType === "ask_home" ? "bg-pb-red/5" : "bg-surface/55"
                }`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${
                    activeActionType === "ask_home" ? "text-pb-red" : "text-primary"
                  }`}>
                    What to do now
                  </p>
                  <h3 className="mt-2 text-base font-semibold leading-snug text-foreground">{activeActionTitle}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{activeActionDetail}</p>
                  {activeActionType === "ask_home" && actualAskHomeAmount > 0 && (
                    <div className="mt-4 rounded-xl border border-pb-red/20 bg-background/60 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-pb-red">Buffer needed</p>
                      <p className="mt-1 text-xl font-semibold text-pb-red tnum">{formatRs(actualAskHomeAmount)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Based on the base forecast, not simulator settings.</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {decisionEngine && (
              <Card className="p-5 sm:p-6 border border-primary/20 bg-card/25 shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowForecastInputs((open) => !open)}
                  className="flex w-full items-start justify-between gap-4 text-left"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] md:text-xs font-bold uppercase tracking-[0.22em] text-primary">Included in this forecast</p>
                      <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary text-[9px] uppercase tracking-wider">
                        {forecastInputSummary}
                      </Badge>
                      {foodRoutine && (
                        <Badge variant="outline" className="border-border bg-surface text-[9px] uppercase tracking-wider text-muted-foreground">
                          {foodRoutine.label}
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
                      Runway has absorbed the major student costs
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      {decisionEngine.summary}
                    </p>
                  </div>
                  <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${showForecastInputs ? "rotate-90" : ""}`} />
                </button>

                {showForecastInputs && (
                  <div className="mt-5 divide-y divide-border/60 rounded-xl border border-border/70 bg-surface/55">
                    {absorbedFactors.length ? absorbedFactors.map((factor: any) => (
                      <div key={factor.kind} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">{factor.label}</p>
                          <p className="mt-0.5 text-[11px] md:text-xs text-zinc-500 leading-snug">{factor.detail}</p>
                        </div>
                        <p className="text-sm font-semibold text-foreground tnum sm:text-right">
                          {formatRs(factor.daily_amount ?? factor.amount)}
                          {factor.daily_amount ? <span className="text-[10px] md:text-xs font-bold text-zinc-500">/day</span> : null}
                        </p>
                      </div>
                    )) : commitmentSummary.length ? commitmentSummary.map((item) => (
                      <div key={item.key} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">{item.label}</p>
                          <p className="mt-0.5 text-[11px] md:text-xs text-zinc-500 leading-snug">Reserved before safe/day is calculated.</p>
                        </div>
                        <p className="text-sm font-semibold text-foreground tnum sm:text-right">{formatRs(item.amount)}</p>
                      </div>
                    )) : (
                      <div className="p-4 text-xs text-muted-foreground">
                        No subscriptions, meal bills, pool dues, or exam buffers are reserved yet. Add them in profile or transactions for a stronger forecast.
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            <Card className="p-5 sm:p-6 border border-border bg-card/25">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">What changed?</h3>
                  <p className="mt-1 text-xs text-zinc-500">The top drivers behind today’s runway number.</p>
                </div>
                <Badge variant="outline" className="w-fit border-border bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
                  {topDrivers.length ? `${topDrivers.length} drivers` : "No pressure"}
                </Badge>
              </div>
              {topDrivers.length ? (
                <div className="grid gap-4 md:grid-cols-3 mt-2">
                  {topDrivers.map((driver) => (
                    <div key={driver.kind} className={`pl-3.5 py-1 border-l-2 ${
                      driver.severity === "high"
                        ? "border-pb-red"
                        : driver.severity === "medium"
                          ? "border-pb-amber"
                          : "border-primary"
                    }`}>
                      <p className="text-xs font-semibold text-foreground">{driver.label}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{driver.detail}</p>
                      {Number(driver.impact || 0) > 0 && (
                        <p className="mt-1.5 text-[11px] font-semibold text-foreground tnum">{formatRs(Number(driver.impact))} impact</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic py-1">
                  No major pressure point detected yet. Runway will explain changes once transactions, food pace, pool dues, or recurring costs affect the forecast.
                </div>
              )}
            </Card>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Runway Days */}
              <Card className="p-5 flex flex-col justify-between border border-border relative overflow-hidden bg-card/40">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] md:text-xs font-bold tracking-[0.15em] text-zinc-500 uppercase">Can I last?</p>
                    <div className={`p-1.5 rounded-lg ${statusDetails.bg} ${statusDetails.color}`}>
                      <statusDetails.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-tight tnum flex items-baseline gap-1.5">
                    {expectedRunwayDays}
                    <span className="text-xs font-semibold text-zinc-500">expected days</span>
                  </h3>
                </div>
                <p className="text-[11px] md:text-xs text-zinc-500 mt-3 leading-snug border-t border-border/50 pt-2.5">
                  {forecast.status === "shortfall"
                    ? `Stress case: ${stressRunwayDays} days. Buffer needed: ${formatRs(actualAskHomeAmount)}.`
                    : `Stress case still shows ${stressRunwayDays} days.`}
                </p>
              </Card>

              {/* Card 2: Safe Daily Spend */}
              <Card className="p-5 flex flex-col justify-between border border-border relative overflow-hidden bg-card/40">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] md:text-xs font-bold tracking-[0.15em] text-zinc-500 uppercase">Spend today</p>
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <Wallet className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-tight tnum text-primary">
                    {safeDailyDisplay}
                    {!safeDailyIsZero && <span className="text-xs font-semibold text-zinc-500">/day</span>}
                  </h3>
                </div>
                <p className="text-[11px] md:text-xs text-zinc-500 mt-3 leading-snug border-t border-border/50 pt-2.5">
                  {safeDailyIsZero ? "No discretionary budget remains after commitments." : "Spend limit to reach the allowance reset safely."}
                </p>
              </Card>

              {/* Card 3: Spend Velocity (EWMA) */}
              <Card className="p-5 flex flex-col justify-between border border-border relative overflow-hidden bg-card/40">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] md:text-xs font-bold tracking-[0.15em] text-zinc-500 uppercase">Current pace</p>
                    <div className="p-1.5 rounded-lg bg-pb-amber/10 text-pb-amber">
                      <Activity className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-tight tnum text-pb-amber">
                    {noSpendHistory ? "No history" : formatRs(forecast.projection.projected_daily_spend)}
                    {!noSpendHistory && <span className="text-xs font-semibold text-zinc-500">/day</span>}
                  </h3>
                </div>
                <p className="text-[11px] md:text-xs text-zinc-500 mt-3 leading-snug border-t border-border/50 pt-2.5">
                  {noSpendHistory ? "Sync a few recent payments before pace is treated as trusted." : "Calculated from recent discretionary spending pace."}
                </p>
              </Card>

              {/* Card 4: Shortfall Probability */}
              <Card className="p-5 flex flex-col justify-between border border-border relative overflow-hidden bg-card/40">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] md:text-xs font-bold tracking-[0.15em] text-zinc-500 uppercase">Shortfall risk</p>
                    <div className={`p-1.5 rounded-lg ${forecast.projection.shortfall_probability >= 0.35 ? "bg-pb-red/10 text-pb-red" : "bg-pb-green/10 text-pb-green"}`}>
                      <TrendingDown className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-tight tnum">
                    {Math.round(forecast.projection.shortfall_probability * 100)}%
                  </h3>
                </div>
                <p className="text-[11px] md:text-xs text-zinc-500 mt-3 leading-snug border-t border-border/50 pt-2.5">
                  Chance that the current pace runs out before your allowance resets.
                </p>
              </Card>
            </div>

            <Card className="border border-border bg-surface p-5 sm:p-6 shadow-sm rounded-2xl relative overflow-hidden transition-all duration-300 hover:shadow-md">
              {/* Decorative accent bar */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/30 via-pb-amber/30 to-pb-green/30" />

              <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-foreground">
                    <Calculator className="h-4.5 w-4.5 text-primary" />
                    <span>Can I afford this?</span>
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">Check how a purchase impacts your runway before spending.</p>
                </div>
                <Badge variant="outline" className="w-fit shrink-0 border-border bg-background/50 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Limit: {safeDailyDisplay}/day
                </Badge>
              </div>

              <div className="space-y-4">
                {/* Inputs row */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (₹)</label>
                    <div className="flex h-11 items-center rounded-xl border border-border bg-background px-3 transition focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30">
                      <span className="text-sm font-semibold text-muted-foreground">₹</span>
                      <input
                        value={affordAmountRs}
                        onChange={(event) => setAffordAmountRs(event.target.value.replace(/[^\d.]/g, ""))}
                        inputMode="decimal"
                        placeholder="e.g. 150"
                        className="ml-2 min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category</label>
                    <select
                      value={affordCategory}
                      onChange={(event) => setAffordCategory(event.target.value as typeof affordCategory)}
                      className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition hover:bg-surface focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                    >
                      <option value="food">Food &amp; Drinks</option>
                      <option value="travel">Travel &amp; Auto</option>
                      <option value="shopping">Shopping &amp; Fun</option>
                      <option value="other">Other / Misc</option>
                    </select>
                  </div>
                </div>

                {/* Student Quick Presets */}
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Presets</span>
                  <div className="flex flex-wrap gap-1.5">
                    {AFFORD_PRESETS.map((preset) => {
                      const PresetIcon = preset.icon;
                      const isActive = affordAmountRs === preset.amount && affordCategory === preset.category;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setAffordAmountRs(preset.amount);
                            setAffordCategory(preset.category);
                          }}
                          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                            isActive
                              ? "border-primary bg-primary/10 text-primary font-semibold shadow-sm"
                              : "border-border bg-background text-muted-foreground hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          <PresetIcon className="h-3 w-3" />
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Result panel */}
                <div className={`rounded-xl p-4 transition-all duration-300 border-l-4 ${
                  affordAmountPaise <= 0
                    ? "border-border bg-surface-raised/40"
                    : affordCheck.status === "safe"
                      ? "border-pb-green bg-pb-green/5"
                      : affordCheck.status === "tight"
                        ? "border-pb-amber bg-pb-amber/5"
                        : "border-pb-red bg-pb-red/5"
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      affordAmountPaise <= 0
                        ? "bg-muted text-muted-foreground"
                        : affordCheck.status === "safe"
                          ? "bg-pb-green/15 text-pb-green"
                          : affordCheck.status === "tight"
                            ? "bg-pb-amber/15 text-pb-amber"
                            : "bg-pb-red/15 text-pb-red"
                    }`}>
                      {affordAmountPaise <= 0 ? (
                        <Calculator className="h-4 w-4" />
                      ) : affordCheck.status === "safe" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : affordCheck.status === "tight" ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-bold leading-tight">
                          {affordAmountPaise <= 0
                            ? "Enter an amount to check"
                            : affordCheck.status === "safe"
                              ? "Safe to spend"
                              : affordCheck.status === "tight"
                                ? "Spending is tight"
                                : "Reconsider this"}
                        </h4>
                        {affordAmountPaise > 0 && (
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                            affordCheck.status === "safe" ? "border-pb-green/30 bg-pb-green/10 text-pb-green" :
                            affordCheck.status === "tight" ? "border-pb-amber/30 bg-pb-amber/10 text-pb-amber" :
                            "border-pb-red/30 bg-pb-red/10 text-pb-red"
                          }`}>
                            {affordCheck.status}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{affordCheck.detail}</p>

                      {affordAmountPaise > 0 && (
                        <>
                          {/* Student comparisons */}
                          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/40 pt-3 text-[11px]">
                            <div>
                              <span className="block text-muted-foreground">= Chai equivalent</span>
                              <span className="font-semibold text-foreground">{chaiEquivalent} cups</span>
                            </div>
                            <div>
                              <span className="block text-muted-foreground">= Canteen meals</span>
                              <span className="font-semibold text-foreground">{mealEquivalent} meals</span>
                            </div>
                          </div>

                          {/* Runway impact bar */}
                          <div className="mt-3 space-y-1">
                            <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
                              <span>Runway impact: -{affordCheck.runwayDaysLost.toFixed(1)} days</span>
                              <span>Remaining: {Math.max(0, 100 - calculatorRunwayPct).toFixed(0)}%</span>
                            </div>
                            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                              <div
                                className={`h-full transition-all duration-500 ${
                                  affordCheck.status === "safe" ? "bg-pb-green" :
                                  affordCheck.status === "tight" ? "bg-pb-amber" : "bg-pb-red"
                                }`}
                                style={{ width: `${Math.max(4, 100 - calculatorRunwayPct)}%` }}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>


            {foodRoutine && (
              <Card className="p-5 sm:p-6 border border-border bg-card/25">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="space-y-1.5">
                    <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.22em] text-zinc-500">Meal Routine</p>
                    <h3 className="text-base sm:text-lg font-semibold text-foreground">{foodRoutine.label}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                      Runway separates delivery, campus meals, and groceries so your food budget is based on how you actually eat, not a hostel-only assumption.
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit border-border bg-surface text-[10px] md:text-xs uppercase tracking-wider font-black">
                    {foodRoutine.meal_cost_source?.replace(/_/g, " ") ?? "food history"}
                  </Badge>
                </div>

                <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-border/70 bg-surface/70 p-3">
                    <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-zinc-500">Food pace</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold text-foreground tnum">
                      {(foodRoutine.food_daily_pace ?? 0) > 0 ? <>{formatRs(foodRoutine.food_daily_pace ?? 0)}<span className="text-[10px] md:text-xs text-zinc-500">/day</span></> : "No logs"}
                    </p>
                    <p className="mt-1 text-[10px] md:text-xs text-zinc-500">{foodRoutine.cycle_food_count ?? 0} food logs this cycle</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-surface/70 p-3">
                    <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-zinc-500">Suggested cap</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold text-primary tnum">
                      {(foodRoutine.recommended_daily_food_cap ?? 0) > 0 ? <>{formatRs(foodRoutine.recommended_daily_food_cap ?? 0)}<span className="text-[10px] md:text-xs text-zinc-500">/day</span></> : "No cap"}
                    </p>
                    <p className="mt-1 text-[10px] md:text-xs text-zinc-500">Aligned to safe/day</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-surface/70 p-3">
                    <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-zinc-500">Delivery</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold text-foreground tnum">{foodRoutine.delivery?.count ?? 0}x</p>
                    <p className="mt-1 text-[10px] md:text-xs text-zinc-500">{formatRs(foodRoutine.delivery?.spend ?? 0)} this cycle</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-surface/70 p-3">
                    <p className="text-[10px] md:text-xs font-black uppercase tracking-wider text-zinc-500">Two-order switch</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold text-pb-green tnum">{formatRs(foodRoutine.savings_if_replace_two_deliveries ?? 0)}</p>
                    <p className="mt-1 text-[10px] md:text-xs text-zinc-500">Potential runway recovery</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-3.5">
                  <p className="text-xs font-black text-foreground">{foodRoutine.action?.title ?? "Keep food pace stable"}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{foodRoutine.action?.detail ?? "Use your routine meal option before delivery becomes the default."}</p>
                </div>
              </Card>
            )}

            {/* 🛫 DAILY SPEND CHECK — SURVIVAL COCKPIT */}
            <Card className="border border-border bg-surface p-5 sm:p-6 shadow-sm rounded-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/30 via-pb-amber/30 to-pb-green/30" />

              <div className="flex flex-col lg:flex-row gap-6 items-stretch">

                {/* ── Left: Controls ── */}
                <div className="flex-1 space-y-5">

                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Compass className="h-5 w-5 text-primary" />
                      <h3 className="text-base font-semibold tracking-tight text-foreground">Daily spend check</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Simulate scenarios and see how lifestyle changes extend your runway — without touching real data.
                    </p>
                  </div>

                  {/* Slider */}
                  <div className="p-1 space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-semibold text-muted-foreground">Adjust Daily Spend</span>
                      <span className="text-base font-bold text-primary tnum">
                        {safeDailyIsZero ? "Pause" : formatRs(activeSimulatedSpend * 100)}
                        {!safeDailyIsZero && <span className="text-xs font-medium text-muted-foreground"> /day</span>}
                      </span>
                    </div>
                    {!safeDailyIsZero ? (
                      <>
                        <input
                          type="range"
                          min={simulatorMinSpend}
                          max={sliderMaxSpend}
                          step="10"
                          value={activeSimulatedSpend}
                          onChange={(e) => setSimulatedDailySpend(parseInt(e.target.value, 10))}
                          onMouseUp={() => toast.info(`Simulated at ${formatRs(activeSimulatedSpend * 100)}/day → ${simulatedDays} days runway`)}
                          onTouchEnd={() => toast.info(`Simulated at ${formatRs(activeSimulatedSpend * 100)}/day → ${simulatedDays} days runway`)}
                          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gradient-to-r from-pb-green via-pb-amber to-pb-red accent-primary focus:outline-none"
                        />
                        <div className="flex justify-between font-mono text-[10px] text-muted-foreground font-semibold">
                          <span>{formatRs(simulatorMinSpend * 100)}</span>
                          <span className="text-center">Mid: {formatRs(Math.round(sliderMaxSpend * 50))}</span>
                          <span>{formatRs(sliderMaxSpend * 100)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-xl border border-pb-red/20 bg-pb-red/5 px-3 py-2.5 text-xs font-medium text-pb-red">
                        Discretionary budget exhausted. Pause non-essential spending.
                      </div>
                    )}
                  </div>

                  {/* Quick targets */}
                  <div className="space-y-2">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quick Targets</span>
                    <div className="flex flex-wrap gap-1.5">
                      {simulatorPresets.map((preset) => (
                        <button
                          key={`${preset.label}-${preset.value}`}
                          type="button"
                          onClick={() => {
                            setSimulatedDailySpend(preset.value);
                            toast.info(`Target: ${preset.label} (${formatRs(preset.value * 100)}/day)`);
                          }}
                          className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                            activeSimulatedSpend === preset.value
                              ? "border-primary bg-primary/10 text-primary font-semibold"
                              : "border-border bg-background text-muted-foreground hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          {preset.label} ({formatRs(preset.value * 100)})
                        </button>
                      ))}
                      {simulatedDailySpend !== null && (
                        <button
                          type="button"
                          onClick={() => { setSimulatedDailySpend(null); toast.info("Reset to actual pace."); }}
                          className="rounded-full border border-dashed border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                        >
                          {defaultPace > 0 ? `Reset (${formatRs(defaultPace * 100)}/day)` : "Reset"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mode cards */}
                  <div className="border-t border-border/40 pt-4 space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plan Intensity</span>
                      <TooltipProvider>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs rounded-xl border border-border bg-card p-3 space-y-2 text-xs shadow-xl">
                            <p className="font-bold text-foreground flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-pb-amber" /> Stretch mode
                            </p>
                            <p className="text-muted-foreground">Lower daily target with optional student recovery levers.</p>
                            <p className="font-bold text-foreground flex items-center gap-1 pt-1">
                              <AlertTriangle className="h-3 w-3 text-pb-red" /> Emergency mode
                            </p>
                            <p className="text-muted-foreground">Protects essentials first, auto-applies all levers.</p>
                          </TooltipContent>
                        </UITooltip>
                      </TooltipProvider>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => selectRunwayMode("normal")}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          flightProtocol === "normal"
                            ? "border-primary bg-primary/10 shadow-[0_0_12px_rgba(99,102,241,0.12)]"
                            : "border-border bg-background text-muted-foreground hover:bg-surface"
                        }`}
                      >
                        <span className="block text-xs font-bold text-foreground">Current Pace</span>
                        <span className="mt-1 block text-sm font-bold text-foreground tnum">
                          {noSpendHistory ? "—" : `${formatRs((defaultPace || safeDailyRs) * 100)}`}
                        </span>
                        <span className="mt-1 block text-[10px] text-muted-foreground leading-snug">No changes applied</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => selectRunwayMode("glide")}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          flightProtocol === "glide"
                            ? "border-pb-amber bg-pb-amber/10 shadow-[0_0_12px_rgba(213,155,82,0.12)]"
                            : "border-border bg-background text-muted-foreground hover:bg-surface"
                        }`}
                      >
                        <span className="block text-xs font-bold text-foreground">Stretch</span>
                        <span className="mt-1 block text-sm font-bold text-pb-amber tnum">
                          {safeDailyIsZero ? "Pause" : `${formatRs(stretchModeDailyRs * 100)}`}
                        </span>
                        <span className="mt-1 block text-[10px] text-muted-foreground leading-snug">Lower target + optional levers</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => selectRunwayMode("turbulence")}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          flightProtocol === "turbulence"
                            ? "border-pb-red bg-pb-red/10 shadow-[0_0_12px_rgba(220,38,38,0.12)]"
                            : "border-border bg-background text-muted-foreground hover:bg-surface"
                        }`}
                      >
                        <span className="block text-xs font-bold text-foreground">Emergency</span>
                        <span className="mt-1 block text-sm font-bold text-pb-red tnum">
                          {safeDailyIsZero ? "Pause" : `${formatRs(emergencyModeDailyRs * 100)}`}
                        </span>
                        <span className="mt-1 block text-[10px] text-muted-foreground leading-snug">Essentials first</span>
                      </button>
                    </div>
                  </div>

                  {/* Levers */}
                  <div className="border-t border-border/40 pt-4 space-y-3">
                    {flightProtocol === "normal" && (
                      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                        <Info className="h-4 w-4 shrink-0" />
                        <span>Switch to Stretch or Emergency mode to unlock recovery levers.</span>
                      </div>
                    )}

                    {flightProtocol === "glide" && (
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <span>Optional Stretch Levers</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {[
                            { enabled: canUseMealLever, active: scenarioFoodSwitch, icon: Utensils, label: foodSwitchSaving > 0 ? "Replace deliveries" : "Tighten meal routine", detail: canUseMealLever ? `Adds ${formatRs(mealPlanLeverAmount)}` : "Needs food history", onToggle: () => { const v = !scenarioFoodSwitch; setScenarioFoodSwitch(v); if (v) toast.success(`Meal lever: +${formatRs(mealPlanLeverAmount)}`); else toast.info("Meal lever off."); } },
                            { enabled: canUseFixedCostLever, active: scenarioSubscriptionsPaused, icon: CreditCard, label: "Pause subscriptions", detail: canUseFixedCostLever ? `Frees ${formatRs(fixedCostLeverAmount)}` : "No subs found", onToggle: () => { const v = !scenarioSubscriptionsPaused; setScenarioSubscriptionsPaused(v); if (v) toast.success(`Subs paused: +${formatRs(fixedCostLeverAmount)}`); else toast.info("Subs lever off."); } },
                            { enabled: canUseSharedPlanLever, active: scenarioPoolSettled, icon: Users, label: sharedPlanLeverLabel, detail: canUseSharedPlanLever ? `Adds ${formatRs(sharedPlanLeverAmount)}` : "No pool dues", onToggle: () => { const v = !scenarioPoolSettled; setScenarioPoolSettled(v); if (v) toast.success(`Pool settled: +${formatRs(sharedPlanLeverAmount)}`); else toast.info("Pool lever off."); } },
                            { enabled: canStressHighSpend, active: scenarioHighSpendDay, icon: TrendingDown, label: "Stress: high spend day", detail: canStressHighSpend ? `-${formatRs(highSpendDayAmount)}` : "Needs history", onToggle: () => { const v = !scenarioHighSpendDay; setScenarioHighSpendDay(v); if (v) toast.warning(`Stress test: -${formatRs(highSpendDayAmount)}`); else toast.info("Stress removed."); } },
                          ].map((lever) => {
                            const LeverIcon = lever.icon;
                            return (
                              <button
                                key={lever.label}
                                type="button"
                                disabled={!lever.enabled}
                                onClick={lever.onToggle}
                                className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                                  !lever.enabled
                                    ? "opacity-40 cursor-not-allowed border-border/40 bg-surface-raised/10"
                                    : lever.active
                                      ? "border-pb-green bg-pb-green/10 shadow-[0_0_10px_rgba(22,163,74,0.08)]"
                                      : "border-border bg-background hover:bg-surface hover:border-border-hover"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${lever.active ? "bg-pb-green/20 text-pb-green" : "bg-muted text-muted-foreground"}`}>
                                    <LeverIcon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="block text-xs font-semibold truncate text-foreground">{lever.label}</span>
                                    <span className="block text-[10px] text-muted-foreground">{lever.detail}</span>
                                  </div>
                                </div>
                                {lever.enabled && (
                                  <div className={`h-4 w-4 shrink-0 rounded-full border flex items-center justify-center transition-colors ${lever.active ? "bg-pb-green border-pb-green" : "border-muted-foreground/30"}`}>
                                    {lever.active && <Check className="h-2.5 w-2.5 text-white stroke-[3]" />}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {flightProtocol === "turbulence" && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-pb-red">
                          <AlertCircle className="h-3.5 w-3.5" /><span>Emergency levers (auto-applied)</span>
                        </div>
                        <div className="p-1 space-y-3">
                          <div className="grid grid-cols-3 gap-2 border-b border-border/40 pb-3">
                            {[
                              { label: "Meal", enabled: canUseMealLever, amount: mealPlanLeverAmount },
                              { label: "Fixed cost", enabled: canUseFixedCostLever, amount: fixedCostLeverAmount },
                              { label: "Pool", enabled: canUseSharedPlanLever, amount: sharedPlanLeverAmount },
                            ].map((l) => (
                              <div key={l.label} className="text-center">
                                <p className="text-[10px] font-semibold uppercase text-muted-foreground">{l.label}</p>
                                <p className={`mt-1 text-xs font-bold ${l.enabled ? "text-pb-green" : "text-muted-foreground"}`}>
                                  {l.enabled ? `+${formatRs(l.amount)}` : "Inactive"}
                                </p>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={!canStressHighSpend}
                            onClick={() => { const v = !scenarioHighSpendDay; setScenarioHighSpendDay(v); if (v) toast.warning(`Stress test: -${formatRs(highSpendDayAmount)}`); else toast.info("Stress removed."); }}
                            className={`flex w-full items-center justify-between p-3 rounded-xl border text-left transition-all ${
                              !canStressHighSpend ? "opacity-40 cursor-not-allowed border-border/40 bg-surface-raised/10" :
                              scenarioHighSpendDay ? "border-pb-red bg-pb-red/10" : "border-border bg-background hover:bg-surface"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${scenarioHighSpendDay ? "bg-pb-red/20 text-pb-red" : "bg-muted text-muted-foreground"}`}>
                                <TrendingDown className="h-4 w-4" />
                              </div>
                              <div>
                                <span className="block text-xs font-semibold text-foreground">Include high-spend day</span>
                                <span className="block text-[10px] text-muted-foreground">{canStressHighSpend ? `-${formatRs(highSpendDayAmount)}` : "Needs spend history"}</span>
                              </div>
                            </div>
                            {canStressHighSpend && (
                              <div className={`h-4 w-4 shrink-0 rounded-full border flex items-center justify-center ${scenarioHighSpendDay ? "bg-pb-red border-pb-red" : "border-muted-foreground/30"}`}>
                                {scenarioHighSpendDay && <Check className="h-2.5 w-2.5 text-white stroke-[3]" />}
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Right: Cockpit Gauge ── */}
                <div className="flex w-full flex-col justify-between gap-4 border-t border-border pt-5 lg:w-72 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Survival Cockpit</span>
                      <Badge variant="outline" className={`text-[9px] font-bold uppercase py-0.5 ${
                        flightProtocol === "normal" ? "border-primary/30 bg-primary/10 text-primary" :
                        flightProtocol === "glide" ? "border-pb-amber/30 bg-pb-amber/10 text-pb-amber" :
                        "border-pb-red/30 bg-pb-red/10 text-pb-red animate-pulse"
                      }`}>
                        {flightProtocol === "normal" ? "Normal" : flightProtocol === "glide" ? "Stretch" : "Emergency"}
                      </Badge>
                    </div>

                    {/* SVG Circular Gauge */}
                    <div className="flex justify-center py-2">
                      <div className="relative h-28 w-28">
                        <svg className="h-full w-full -rotate-90">
                          <circle cx="56" cy="56" r={radius} className="fill-none stroke-muted-foreground/10" strokeWidth="6" />
                          <circle
                            cx="56" cy="56" r={radius}
                            className={`${strokeColor} fill-none transition-all duration-700`}
                            strokeWidth="6"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            style={{ filter: gaugeFilter }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-2xl font-black tracking-tight text-foreground tnum">
                            {safeDailyIsZero ? "0" : simulatedDays}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">days left</span>
                        </div>
                      </div>
                    </div>

                    {/* Status banner */}
                    <div className={`rounded-xl p-3 border-l-4 flex items-start gap-2.5 text-xs font-medium transition-all duration-300 ${
                      isSimulatedSafe ? "border-pb-green bg-pb-green/5 text-pb-green" : "border-pb-red bg-pb-red/5 text-pb-red"
                    }`}>
                      {isSimulatedSafe ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold">Reaches reset safely</p>
                            <p className="text-[11px] opacity-80 mt-0.5">Survives the next {daysLeftInCycle} days on this plan.</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold">Deficit detected</p>
                            <p className="text-[11px] opacity-80 mt-0.5">
                              {safeDailyIsZero
                                ? "All discretionary balance consumed."
                                : `Runs out ${Math.max(0, daysLeftInCycle - simulatedDays)} days early. Gap: ${formatRs(simulatedGapPaise)}.`}
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="space-y-2 border-y border-border/40 py-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Flexible cash</span>
                        <span className="font-bold text-foreground tnum">{formatRs(remainingDiscretionary)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Simulated rate</span>
                        <span className="font-bold text-primary tnum">{safeDailyIsZero ? "₹0" : `${formatRs(activeSimulatedSpend * 100)}/day`}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reset in</span>
                        <span className="font-bold text-foreground tnum">{daysLeftInCycle} days</span>
                      </div>
                    </div>

                    {!isSimulatedSafe && actualAskHomeAmount > 0 && (
                      <div className="p-1 space-y-1 text-xs">
                        <p className="text-muted-foreground">
                          Actual ask-home buffer: <span className="text-primary font-bold tnum">{formatRs(actualAskHomeAmount)}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={copyFlightBrief}
                    className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-xs font-bold uppercase tracking-wider text-foreground transition-all hover:bg-surface-raised active:scale-[0.98] shadow-sm"
                  >
                    <ArrowUpRight className="h-4 w-4 text-primary" />
                    <span>Copy Runway Brief</span>
                  </button>
                </div>

              </div>
            </Card>

            {/* 💡 RUNWAY SURVIVAL NUDGES */}
            <Card className="p-5 sm:p-6 border border-border bg-card/20 space-y-4 mt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-4.5 w-4.5 text-pb-amber" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Runway Actions</h3>
                </div>
                
                <Select value={selectedActionId} onValueChange={setSelectedActionId}>
                  <SelectTrigger className="h-9 w-full sm:w-[260px] rounded-lg border-border bg-background text-xs text-left">
                    <SelectValue placeholder="Select action step" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border text-foreground">
                    {runwayActions.map((action) => (
                      <SelectItem key={action.id} value={action.id} className="text-xs font-medium">
                        {action.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selected Action Content */}
              {(() => {
                const selectedAction = runwayActions.find((a) => a.id === selectedActionId) || runwayActions[0];
                if (!selectedAction) return null;
                return (
                  <div className={`flex items-start gap-3 p-4 rounded-xl text-xs border-l-4 transition-all duration-300 ${
                    selectedAction.severity === "high"
                      ? "bg-pb-red/5 border-pb-red text-foreground"
                      : selectedAction.severity === "medium"
                        ? "bg-pb-amber/5 border-pb-amber text-foreground"
                        : "bg-primary/5 border-primary text-foreground"
                  }`}>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <h4 className="font-bold text-sm leading-snug">{selectedAction.label}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{selectedAction.detail}</p>
                      {selectedAction.id === "priority" && activeActionType === "slow_down" && (
                        <Link to="/pool" className="mt-2 inline-flex h-8 items-center rounded-lg border border-border bg-surface px-3 text-[10px] font-bold uppercase tracking-wider text-foreground transition hover:bg-surface-raised">
                          Open pool dues
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })()}
            </Card>


            {/* Runway Progress Card */}
            <Card className="p-5 sm:p-6 border border-border bg-card/25">
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Allowance cycle</h3>
                  <p className="mt-1 text-xs text-zinc-500">Cycle timing and cash position at a glance.</p>
                </div>
                <Badge variant="outline" className="w-fit border-border bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
                  {forecast.current_cycle.days_left} days left
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-surface/50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Started</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {new Date(forecast.current_cycle.start).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Funding: {formatRs(forecast.current_cycle.available_funding)}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-surface/50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Used so far</p>
                  <p className="mt-1 text-sm font-semibold text-foreground tnum">{formatRs(forecast.current_cycle.spent)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{allowanceProgressPct}% of cycle funding spent</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-surface/50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Resets</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {new Date(forecast.current_cycle.end).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Balance: {formatRs(remainingBalance)}</p>
                </div>
              </div>
            </Card>

            {/* Committed vs Flexible Spend visualizer */}
            <Card className="p-5 sm:p-6 border border-border bg-card/25">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Where the runway goes</h3>
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                    This explains the forecast above; it is not a second recommendation.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit text-[10px] md:text-xs uppercase font-bold border-border bg-surface-raised px-2 py-0.5">
                  Reserved vs flexible
                </Badge>
              </div>
              <div className="space-y-5">
                <div className="rounded-xl border border-border/70 bg-surface/50">
                  {[
                    { label: "Cycle funding", value: forecast.current_cycle.available_funding, tone: "text-pb-green" },
                    { label: "Already spent", value: -forecast.current_cycle.spent, tone: "text-muted-foreground" },
                    { label: "Reserved costs", value: -forecast.commitments.total, tone: "text-primary" },
                    { label: "Flexible cash left", value: remainingDiscretionary, tone: "text-foreground" },
                  ].map((row, idx) => (
                    <div key={row.label} className={`flex items-center justify-between gap-4 px-3 py-3 text-xs ${idx > 0 ? "border-t border-border/60" : ""}`}>
                      <span className="font-medium text-muted-foreground">{row.label}</span>
                      <span className={`font-semibold tnum ${row.tone}`}>
                        {row.value < 0 ? `-${formatRs(Math.abs(row.value))}` : formatRs(row.value)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Reserved share</p>
                    <p className="mt-1 text-base font-semibold text-foreground tnum">{committedPct}%</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatRs(forecast.commitments.total)} protected before daily spend.</p>
                  </div>
                  <div className="rounded-xl border border-pb-amber/15 bg-pb-amber/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-pb-amber">Flexible forecast</p>
                    <p className="mt-1 text-base font-semibold text-foreground tnum">{formatRs(forecast.projection.projected_discretionary)}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{flexiblePct}% of the remaining forecasted spend.</p>
                  </div>
                </div>

                <div className="hidden">
                  <div className="flex h-3 rounded-full overflow-hidden mb-2 bg-surface-raised">
                    <div className="bg-primary/80 transition-all" style={{ width: `${committedPct}%` }} title={`Reserved: ${committedPct}%`} />
                    <div className="bg-pb-amber/70 transition-all" style={{ width: `${flexiblePct}%` }} title={`Flexible: ${flexiblePct}%`} />
                  </div>
                  <div className="grid gap-2 text-[11px] md:text-xs font-semibold sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/50 px-3 py-2">
                      <span className="text-primary flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-primary/80 rounded-sm" />
                        Reserved costs
                      </span>
                      <span className="text-foreground tnum">{committedPct}% · {formatRs(forecast.commitments.total)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/50 px-3 py-2">
                      <span className="text-pb-amber flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-pb-amber/70 rounded-sm" />
                        Flexible forecast
                      </span>
                      <span className="text-foreground tnum">{flexiblePct}% · {formatRs(forecast.projection.projected_discretionary)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/50 pt-4">
                  <div>
                    <h4 className="text-[12px] font-bold text-primary uppercase tracking-wider mb-1.5">Reserved costs</h4>
                    <p className="text-[11px] md:text-xs text-zinc-500 leading-relaxed">
                      Subscriptions, meal routine, exam buffer, and pending pool settlements are protected before daily spending is calculated.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-bold text-pb-amber uppercase tracking-wider mb-1.5">Flexible forecast</h4>
                    <p className="text-[11px] md:text-xs text-zinc-500 leading-relaxed">
                      Snacks, travel, shopping, and other variable spends are projected from recent pace for the remaining cycle.
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* 📖 EDUCATIONAL GUIDE: HOW THE RUNWAY MATH WORKS */}
            <Card className="p-6 border border-border bg-card/15">
              <div className="flex items-center gap-1.5 mb-4 border-b border-border/40 pb-3">
                <HelpCircle className="h-4.5 w-4.5 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">How this number is built</h3>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-2xl text-xs text-zinc-500 leading-relaxed">
                  Remaining flexible cash is divided by recent daily pace after reserved costs are protected.
                </p>
                <button
                  onClick={() => setShowGuideModal(true)}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-4 text-xs font-bold uppercase tracking-wider text-foreground transition hover:bg-surface-raised"
                >
                  Open guide
                </button>
              </div>

              {false && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Step 1 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] md:text-xs font-bold">1</span>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Calculate Flexible Cash</h4>
                  </div>
                  <p className="text-[11px] md:text-xs text-zinc-500 leading-relaxed">
                    We start with your total cycle allowance ({formatRs(forecast.current_cycle.available_funding)}) and subtract what you've already spent, plus any <strong>Fixed Commitments</strong> like active subscriptions, meal bills, pool dues, and exam reserve buffers. What is left is your <strong>Flexible Discretionary Pool</strong> (currently <strong>{formatRs(remainingDiscretionary)}</strong>).
                  </p>
                </div>

                {/* Step 2 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-pb-amber/10 text-pb-amber flex items-center justify-center text-[11px] md:text-xs font-bold">2</span>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Estimate Spend Speed (Pace)</h4>
                  </div>
                  <p className="text-[11px] md:text-xs text-zinc-500 leading-relaxed">
                    Instead of a simple average, we use <strong>EWMA (Exponentially Weighted Moving Average)</strong>. This means recent days count much more than older days. We also apply <strong>weekend weights</strong> (typically 1.3x multiplier) because students tend to order more food and travel on weekends.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-pb-green/10 text-pb-green flex items-center justify-center text-[11px] md:text-xs font-bold">3</span>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Project the Countdown</h4>
                  </div>
                  <p className="text-[11px] md:text-xs text-zinc-500 leading-relaxed">
                    We divide your <strong>Flexible Pool</strong> by your <strong>Spend Speed</strong> to estimate runway days, then compare expected and stress cases. If this countdown is shorter than the days remaining in your cycle ({daysLeftInCycle} days), the engine flags the forecast shortfall and shows the buffer needed.
                  </p>
                </div>
              </div>
              )}
            </Card>

          </div>
        )}

        {/* ── Tab: Commitments ── */}
        {activeTab === "commitments" && (
          <div className="space-y-6">
            <Card className="p-5 sm:p-6 border border-border bg-card/25">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Fixed commitments</h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    Reserved before safe/day is calculated, so essentials do not get mixed with flexible spend.
                  </p>
                </div>
                <div className="sm:text-right">
                  <span className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase tracking-wider block">Reserved this cycle</span>
                  <span className="text-xl font-bold text-primary tnum">{formatRs(forecast.commitments.total)}</span>
                </div>
              </div>

              {commitmentSummary.length > 0 && (
                <div className="mb-6 grid gap-4 border-y border-border/40 py-3 grid-cols-2 lg:grid-cols-4">
                  {commitmentSummary.map((item) => (
                    <div key={item.key} className="px-1">
                      <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider font-semibold">{item.label}</p>
                      <p className="text-sm font-semibold text-foreground tnum mt-0.5">{formatRs(item.amount)}</p>
                    </div>
                  ))}
                </div>
              )}

              {forecast.commitments.items?.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-surface/40 py-10 px-4 text-center text-zinc-500 text-xs">
                  No fixed commitments or reserves found for this allowance cycle. Add rent, subscriptions, meal bills, exam reserve, or pool dues to improve runway accuracy.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {forecast.commitments.items.map((item: any, i: number) => {
                    const due = new Date(item.due_at);
                    return (
                      <div key={i} className="py-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="p-2 rounded-lg bg-white/5 border border-border/40 text-zinc-400">
                            {item.kind === "subscription" ? <CreditCard className="h-4.5 w-4.5 text-primary/80" /> :
                             item.kind === "mess" ? <Layers className="h-4.5 w-4.5 text-pb-amber/80" /> :
                             item.kind === "exam_buffer" ? <ShieldCheck className="h-4.5 w-4.5 text-pb-green/80" /> :
                             <Layers className="h-4.5 w-4.5 text-pb-blue/80" />}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-foreground">{item.label}</p>
                            <p className="text-[10px] md:text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5">
                              <Calendar className="h-3 w-3" />
                              <span>Due: {due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <Badge variant="outline" className={`text-[9px] uppercase font-black tracking-wider ${
                            item.status === "scheduled" ? "border-pb-green/30 text-pb-green" :
                            item.status === "reserved" ? "border-pb-purple/30 text-pb-purple" :
                            "border-zinc-500/30 text-zinc-500"
                          }`}>
                            {item.status}
                          </Badge>
                          <span className="text-xs font-semibold text-foreground tnum">{formatRs(item.amount)}</span>
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
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Keep commitments accurate</h4>
                  <p className="text-[11px] md:text-xs text-zinc-500 mt-1 leading-relaxed">
                    Update meal routine, subscriptions, exam reserve, and living setup whenever they change. Runway recalculates safe/day from these reserved costs.
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
            <Card className="p-5 sm:p-6 border border-border bg-card/25">
              <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Projection takeaway</h3>
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                    {horizonTakeaway}
                  </p>
                </div>
                {projectionSignal && (
                  <Badge variant="outline" className={`w-fit text-[10px] uppercase tracking-wider font-semibold ${
                    projectionSignal.isDeficit ? "border-pb-red/30 text-pb-red bg-pb-red/5" : "border-pb-green/30 text-pb-green bg-pb-green/5"
                  }`}>
                    {projectionSignal.isDeficit ? "First deficit" : "Long view"}: {projectionSignal.label}
                  </Badge>
                )}
              </div>
              
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
                        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">{h.label}</h4>
                        <Badge variant="outline" className={`text-[9px] uppercase font-black ${
                          isNegative ? "border-pb-red/30 text-pb-red bg-pb-red/5" : "border-pb-green/30 text-pb-green bg-pb-green/5"
                        }`}>
                          {isNegative ? "Deficit" : "Surplus"}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 border-b border-border/50 pb-3 mb-3 text-center">
                        <div>
                          <span className="text-[9px] md:text-xs text-zinc-500 uppercase tracking-wider block">Income</span>
                          <span className="text-xs font-bold text-zinc-300">{formatRs(h.projected_funding)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] md:text-xs text-zinc-500 uppercase tracking-wider block">Projected Spend</span>
                          <span className="text-xs font-bold text-zinc-300">{formatRs(h.projected_spend)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] md:text-xs text-zinc-500 uppercase tracking-wider block">End Balance</span>
                          <span className={`text-xs font-bold ${isNegative ? "text-pb-red" : "text-pb-green"}`}>
                            {formatRs(h.projected_balance)}
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] md:text-xs text-zinc-500 leading-relaxed">
                        <span className="font-semibold block text-zinc-400">Expected range ({forecast.confidence.score}% confidence):</span>
                        {formatRs(h.balance_low)} to {formatRs(h.balance_high)}
                      </div>
                    </div>

                    {isNegative && (
                      <div className="mt-4 pl-3.5 py-1 border-l-2 border-pb-red text-[11px] md:text-xs text-pb-red flex items-center justify-between font-semibold">
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
        <Card className="p-5 sm:p-6 border border-border bg-card/15">
          <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <ShieldCheck className="h-4.5 w-4.5 text-pb-green" />
              <span>Forecast confidence</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] md:text-xs font-bold text-zinc-500 uppercase">Confidence</span>
              <Badge className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
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
              {forecast.confidence.reason}
            </p>
            <button
              type="button"
              onClick={() => setShowMethodology((open) => !open)}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary transition hover:text-primary/80"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showMethodology ? "rotate-90" : ""}`} />
              {showMethodology ? "Hide calculation details" : "Show calculation details"}
            </button>
            {showMethodology && (
            <div className="border-t border-border/50 pt-3">
              <p className="font-bold text-[10px] md:text-xs uppercase tracking-wider text-zinc-400 mb-2">How this forecast is calculated</p>
              <ul className="list-disc pl-4 space-y-1.5">
                {forecast.methodology.notes.map((note: string, idx: number) => (
                  <li key={idx}>{note}</li>
                ))}
                <li>
                  Uses a <strong>{forecast.methodology.lookback_days}-day lookback</strong> with stronger weight on recent spends.
                </li>
                <li>
                  Adjusts for day-of-week spending patterns so weekend-heavy food or travel habits do not get averaged away.
                </li>
              </ul>
            </div>
            )}
          </div>
        </Card>
      </div>
      {/* 📖 RUNWAY FLIGHT MANUAL GUIDE MODAL */}
      <Dialog open={showGuideModal} onOpenChange={setShowGuideModal}>
        <DialogContent className="max-w-lg bg-background border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Compass className="h-4.5 w-4.5 text-primary" />
              <span>PocketBuddy Runway Guide</span>
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
                Unlike basic trackers, PocketBuddy reserves money for meal bills, active shared-pool dues, scheduled subscriptions, and exam safety buffers. This keeps essential obligations protected from daily spending sprees.
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
                If the forecast detects a deficit before your allowance resets, the system recommends a rounded-up "Ask Home" amount. Use it as a practical buffer, not a guaranteed prediction.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
