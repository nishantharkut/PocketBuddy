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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  const routineMealUnitRs = useMemo(() => {
    const routineMealCost = Math.round(Number(foodRoutine?.routine_meal_cost ?? 0) / 100);
    const foodCap = Math.round(Number(foodRoutine?.recommended_daily_food_cap ?? 0) / 100);
    return Math.max(40, routineMealCost || foodCap || 80);
  }, [foodRoutine]);

  const sharedMealUnitRs = useMemo(() => {
    const sharedMealCost = Math.round(Number(foodRoutine?.shared_meal_cost ?? 0) / 100);
    return Math.max(60, sharedMealCost || Math.round(routineMealUnitRs * 1.5));
  }, [foodRoutine, routineMealUnitRs]);

  const deliveryOrderUnitRs = useMemo(() => {
    const deliveryMealCost = Math.round(Number(foodRoutine?.delivery_meal_cost ?? 0) / 100);
    return Math.max(120, deliveryMealCost || Math.round(routineMealUnitRs * 2.5));
  }, [foodRoutine, routineMealUnitRs]);

  const quickSpendUnitRs = useMemo(() => {
    return Math.max(20, Math.round(routineMealUnitRs * 0.45));
  }, [routineMealUnitRs]);

  const smallSpendEquivalent = useMemo(() => {
    const val = Number(affordAmountRs) || 0;
    return Math.max(1, Math.round(val / quickSpendUnitRs));
  }, [affordAmountRs, quickSpendUnitRs]);

  const routineMealEquivalent = useMemo(() => {
    const val = Number(affordAmountRs) || 0;
    return Math.max(1, Math.round(val / routineMealUnitRs));
  }, [affordAmountRs, routineMealUnitRs]);

  const affordPresets = useMemo(() => [
    { label: "Quick snack", amount: String(quickSpendUnitRs), category: "food" as const, icon: Coffee },
    { label: "Routine meal", amount: String(routineMealUnitRs), category: "food" as const, icon: Utensils },
    { label: "Shared order", amount: String(sharedMealUnitRs), category: "food" as const, icon: Users },
    { label: "Delivery order", amount: String(deliveryOrderUnitRs), category: "food" as const, icon: Utensils },
    { label: "Auto ride", amount: "60", category: "travel" as const, icon: Car },
    { label: "Stationery", amount: "100", category: "other" as const, icon: CreditCard },
    { label: "Outing", amount: "450", category: "shopping" as const, icon: ShoppingBag },
  ], [quickSpendUnitRs, routineMealUnitRs, sharedMealUnitRs, deliveryOrderUnitRs]);



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

From PocketBuddy Runway.`;

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
      ? `In this scenario, the first deficit appears around ${projectionSignal.label}.`
      : `In this scenario, the long-range balance stays positive through ${projectionSignal.label}.`
    : "Scenario view will appear once horizon data is available.";
  const sectionEyebrowClass = "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500";
  const sectionTitleClass = "text-sm font-semibold tracking-tight text-foreground sm:text-base";
  const sectionBodyClass = "text-xs leading-relaxed text-muted-foreground sm:text-sm";
  const [selectedActionId, setSelectedActionId] = useState("action-1");
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
  const secondaryRunwayActions = runwayActions.filter((action) => action.id !== "priority");
  const selectedRunwayAction = secondaryRunwayActions.find((action) => action.id === selectedActionId)
    ?? secondaryRunwayActions[0]
    ?? runwayActions[0]
    ?? null;
  const simulatorModeLabel = flightProtocol === "normal"
    ? "Current mode"
    : flightProtocol === "glide"
      ? "Stretch mode"
      : "Emergency mode";
  const simulatorModeTone = flightProtocol === "normal"
    ? "border-primary/20 bg-primary/5 text-primary"
    : flightProtocol === "glide"
      ? "border-pb-amber/20 bg-pb-amber/5 text-pb-amber"
      : "border-pb-red/20 bg-pb-red/5 text-pb-red";
  const simulatorRunwayBadge = safeDailyIsZero
    ? "No flexible spend"
    : `${simulatedDays} days runway`;



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

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {modeCards.map((mode) => (
                    <button
                      key={mode.key}
                      onClick={() => selectRunwayMode(mode.key)}
                      className={`rounded-xl border p-2.5 text-left transition-all cursor-pointer flex flex-col justify-between ${
                        flightProtocol === mode.key
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border/60 bg-surface/60 text-muted-foreground hover:border-primary/45 hover:bg-surface"
                      }`}
                    >
                      <div>
                        <span className="block text-[10px] sm:text-xs font-bold text-foreground truncate">{mode.title}</span>
                        <span className="mt-1 block text-xs sm:text-sm font-black text-foreground tnum">
                          {mode.amount === null ? (mode.key === "normal" ? "—" : "Pause") : formatRs(mode.amount)}
                          {mode.amount !== null && <span className="text-[9px] font-normal text-muted-foreground">/day</span>}
                        </span>
                      </div>
                      <span className="mt-1 hidden sm:block text-[10px] text-muted-foreground leading-snug">{mode.text}</span>
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
                  {/* Header row: badge always inline-left of meta labels */}
                  <div className="flex items-start gap-3 mb-4">
                    {/* Grade badge — smaller on mobile, with glow */}
                    <div className="relative shrink-0 mt-0.5">
                      <div className={`absolute inset-0 rounded-full blur-md opacity-30 ${safetyGrade.bg}`} />
                      <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border-2 shadow-md font-black text-xl sm:text-2xl tracking-tight select-none ${safetyGrade.bg} ${safetyGrade.border} ${safetyGrade.color}`}>
                        {safetyGrade.grade}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Runway overview</p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border ${safetyGrade.color} ${safetyGrade.bg} ${safetyGrade.border}`}>
                          {safetyGrade.text}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          {forecast.confidence.level} confidence
                        </span>
                      </div>
                      <h2 className="mt-2 text-lg sm:text-2xl font-black tracking-tight text-foreground leading-snug">
                        Expected runway: <span className="text-primary">{expectedRunwayDays}</span> days
                      </h2>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {safeDailyIsZero
                      ? "Your current balance is tied up by committed costs. Treat this as a pause signal for discretionary spending."
                      : noSpendHistory
                        ? "Allowance is configured, but recent payment history is still thin. Use the safe/day limit as a temporary guardrail."
                        : safetyGrade.description}
                  </p>

                  {/* Metrics — 2-col on mobile, 3-col on sm+ */}
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-4 border-t border-border/40 pt-4">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-muted-foreground">Daily Limit</p>
                      <p className="text-base sm:text-lg font-black text-primary tnum leading-none">
                        {safeDailyDisplay}
                        {!safeDailyIsZero && <span className="text-[10px] font-semibold text-muted-foreground ml-0.5">/day</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{paceMessage}</p>
                    </div>

                    <div className="space-y-1 border-l border-border/30 pl-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-muted-foreground">Flexible Pool</p>
                      <p className="text-base sm:text-lg font-black text-foreground tnum leading-none">
                        {formatRs(remainingDiscretionary)}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">Discretionary pool</p>
                    </div>

                    <div className="space-y-1 col-span-2 sm:col-span-1 sm:border-l sm:border-border/30 sm:pl-3 border-t sm:border-t-0 border-border/30 pt-3 sm:pt-0">
                      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-muted-foreground">Scenario Range</p>
                      <p className="text-base sm:text-lg font-black text-foreground tnum leading-none">
                        {stressRunwayDays} – {calmRunwayDays} days
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">Stress to Calm</p>
                    </div>
                  </div>

                  {/* Color-coded Fuel Gauge */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-[0.12em]">
                      <span>Discretionary Fuel</span>
                      <span className={discretionaryFuelPct <= 20 ? "text-pb-red" : discretionaryFuelPct <= 50 ? "text-pb-amber" : "text-pb-green"}>
                        {discretionaryFuelPct}% &middot; {daysLeftInCycle}d left
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted/40 border border-border/30 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          discretionaryFuelPct <= 20 ? "bg-pb-red" : discretionaryFuelPct <= 50 ? "bg-pb-amber" : "bg-pb-green"
                        }`}
                        style={{ width: `${discretionaryFuelPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className={`border-t border-border p-5 sm:p-6 lg:border-l lg:border-t-0 ${
                  activeActionType === "ask_home" ? "bg-pb-red/[0.02]" : "bg-surface/35"
                }`}>
                  <p className={`text-[9px] font-bold uppercase tracking-wider ${
                    activeActionType === "ask_home" ? "text-pb-red" : "text-primary"
                  }`}>
                    What to do now
                  </p>
                  <h3 className="mt-2 text-base font-bold leading-snug text-foreground">{activeActionTitle}</h3>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed font-medium">{activeActionDetail}</p>
                  {activeActionType === "ask_home" && actualAskHomeAmount > 0 && (
                    <div className="mt-4 rounded-xl border border-pb-red/20 bg-background/50 p-3.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-pb-red">Buffer needed</p>
                      <p className="mt-1 text-xl font-black text-pb-red tnum">{formatRs(actualAskHomeAmount)}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground font-medium">Based on the base forecast, not simulator settings.</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* ── Runway Drivers & Inputs ── */}
            <Card className="p-5 sm:p-6 border border-border bg-card/25">
              <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">What changed?</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Main factors affecting today’s runway estimate.</p>
                </div>

                {/* Included in Forecast Dialog Trigger */}
                <button
                  type="button"
                  onClick={() => setShowForecastInputs(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-surface transition cursor-pointer active:scale-95"
                >
                  <span>Forecast Inputs</span>
                  <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary/10 px-1 text-[9px] font-bold text-primary tnum">
                    {forecastInputCount}
                  </span>
                </button>
              </div>

              {topDrivers.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-2">
                  {topDrivers.map((driver) => (
                    <div key={driver.kind} className={`pl-3.5 py-1 border-l-2 ${
                      driver.severity === "high"
                        ? "border-pb-red"
                        : driver.severity === "medium"
                          ? "border-pb-amber"
                          : "border-primary"
                    }`}>
                      <div className="flex justify-between gap-2 items-center">
                        <p className="text-xs font-semibold text-foreground">{driver.label}</p>
                        {Number(driver.impact || 0) > 0 && (
                          <span className="text-[10px] font-bold text-foreground bg-foreground/5 px-1.5 py-0.5 rounded tnum whitespace-nowrap">
                            &minus;{formatRs(Number(driver.impact))}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{driver.detail}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic py-1 text-center">
                  No major pressure points detected. Runway behaves as expected.
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
                {/* Unified Inset Input Group */}
                <div className="overflow-hidden rounded-xl border border-border bg-background focus-within:ring-1 focus-within:ring-primary/20 focus-within:border-primary/45 grid grid-cols-2 divide-x divide-border/60">
                  <div className="p-3 space-y-1">
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Amount</label>
                    <div className="flex items-center">
                      <span className="text-xs font-bold text-muted-foreground mr-1">₹</span>
                      <input
                        value={affordAmountRs}
                        onChange={(event) => setAffordAmountRs(event.target.value.replace(/[^\d.]/g, ""))}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="w-full bg-transparent text-sm font-black text-foreground outline-none placeholder:text-muted-foreground/35 tnum"
                      />
                    </div>
                  </div>
                  <div className="p-3 space-y-1">
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Category</label>
                    <select
                      value={affordCategory}
                      onChange={(event) => setAffordCategory(event.target.value as typeof affordCategory)}
                      className="w-full bg-transparent text-sm font-bold text-foreground outline-none cursor-pointer"
                    >
                      <option value="food">Food &amp; Drinks</option>
                      <option value="travel">Travel &amp; Auto</option>
                      <option value="shopping">Shopping &amp; Fun</option>
                      <option value="other">Other / Misc</option>
                    </select>
                  </div>
                </div>

                {/* Student Quick Presets */}
                <div className="space-y-2">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Quick Presets</span>
                  <div className="flex flex-wrap gap-1.5">
                    {affordPresets.map((preset) => {
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
                          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all active:scale-95 cursor-pointer ${
                            isActive
                              ? "border-primary bg-primary/10 text-primary shadow-sm"
                              : "border-border/60 bg-background text-muted-foreground hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          <PresetIcon className="h-3.5 w-3.5" />
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Result panel */}
                <div className={`rounded-xl p-4 transition-all duration-300 border-l-4 ${
                  affordAmountPaise <= 0
                    ? "border-border bg-surface-raised/35"
                    : affordCheck.status === "safe"
                      ? "border-pb-green bg-pb-green/5"
                      : affordCheck.status === "tight"
                        ? "border-pb-amber bg-pb-amber/5"
                        : "border-pb-red bg-pb-red/5"
                }`}>
                  {affordAmountPaise <= 0 ? (
                    <div className="text-center py-2 space-y-1">
                      <Calculator className="h-6 w-6 text-muted-foreground/45 mx-auto mb-1.5" />
                      <h4 className="text-xs font-bold text-foreground">Interactive Runway Calculator</h4>
                      <p className="text-[10px] text-muted-foreground leading-relaxed max-w-sm mx-auto">
                        Select a quick preset or type any custom amount above to instantly simulate the impact on your allowance cycle and remaining days.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5 mb-2.5">
                        <div className="flex items-center gap-2">
                          <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                            affordCheck.status === "safe"
                              ? "bg-pb-green/15 text-pb-green"
                              : affordCheck.status === "tight"
                                ? "bg-pb-amber/15 text-pb-amber"
                                : "bg-pb-red/15 text-pb-red"
                          }`}>
                            {affordCheck.status === "safe" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : affordCheck.status === "tight" ? (
                              <AlertTriangle className="h-3.5 w-3.5" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                            {affordCheck.status === "safe"
                              ? "Safe purchase"
                              : affordCheck.status === "tight"
                                ? "Tight spend range"
                                : "Reconsider purchase"}
                          </h4>
                        </div>
                        <Badge variant="outline" className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full ${
                          affordCheck.status === "safe" ? "border-pb-green/30 bg-pb-green/10 text-pb-green" :
                          affordCheck.status === "tight" ? "border-pb-amber/30 bg-pb-amber/10 text-pb-amber" :
                          "border-pb-red/30 bg-pb-red/10 text-pb-red"
                        }`}>
                          {affordCheck.status}
                        </Badge>
                      </div>

                      <p className="text-xs leading-relaxed text-muted-foreground">{affordCheck.detail}</p>

                      {/* Student analogies */}
                      <div className="mt-3.5 grid grid-cols-2 gap-3 border-t border-border/40 pt-3 text-[11px]">
                        <div className="space-y-0.5">
                          <span className="block text-[9px] uppercase font-bold text-muted-foreground tracking-wider font-semibold">Small-spend equivalent</span>
                          <span className="text-xs font-black text-foreground tnum">{smallSpendEquivalent} units</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="block text-[9px] uppercase font-bold text-muted-foreground tracking-wider font-semibold">Routine meals</span>
                          <span className="text-xs font-black text-foreground tnum">{routineMealEquivalent} meals</span>
                        </div>
                      </div>

                      {/* Runway impact progress bar */}
                      <div className="mt-4 space-y-1.5">
                        <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                          <span>Runway impact: &minus;{affordCheck.runwayDaysLost.toFixed(1)} days</span>
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
                    </div>
                  )}
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
            <Card className="border border-border bg-surface p-4 sm:p-5 shadow-sm rounded-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/30 via-pb-amber/30 to-pb-green/30" />

              <div className="flex flex-col lg:flex-row gap-5 items-stretch">

                {/* ── Left: Controls ── */}
                <div className="flex-1 space-y-4">

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className={sectionEyebrowClass}>Daily spend check</p>
                      <div className="flex items-start gap-2">
                        <Compass className="mt-0.5 h-4.5 w-4.5 shrink-0 text-primary" />
                        <h3 className={sectionTitleClass}>Test a daily target before you follow it</h3>
                      </div>
                      <p className={sectionBodyClass}>
                        Adjust the target, compare modes, and see whether the cycle still reaches reset.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-border bg-background/70 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Target: {safeDailyDisplay}/day
                      </Badge>
                      <Badge variant="outline" className="border-border bg-background/70 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {simulatorRunwayBadge}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${simulatorModeTone}`}>
                        {simulatorModeLabel}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Adjust daily spend</span>
                      <span className="text-sm font-semibold text-primary tnum sm:text-base">
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
                        <div className="flex justify-between font-mono text-[10px] font-semibold text-muted-foreground">
                          <span>{formatRs(simulatorMinSpend * 100)}</span>
                          <span className="text-center">Mid: {formatRs(Math.round(sliderMaxSpend * 50))}</span>
                          <span>{formatRs(sliderMaxSpend * 100)}</span>
                        </div>

                        <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-background/50 px-3 py-2 text-xs">
                          <div className={`h-2 w-2 rounded-full mt-1 shrink-0 ${isSimulatedSafe ? "bg-pb-green" : "bg-pb-red"}`} />
                          <p className="text-xs font-medium leading-normal text-muted-foreground">
                            {isSimulatedSafe
                              ? `This target safely reaches your reset date.`
                              : safeDailyIsZero
                                ? "All discretionary balance consumed."
                                : `Runs out ${Math.max(0, daysLeftInCycle - simulatedDays)} days early. Deficit: ${formatRs(simulatedGapPaise)}.`}
                          </p>
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
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Quick targets</span>
                    <div className="flex flex-wrap gap-1.5">
                      {simulatorPresets.map((preset) => (
                        <button
                          key={`${preset.label}-${preset.value}`}
                          type="button"
                          onClick={() => {
                            setSimulatedDailySpend(preset.value);
                            toast.info(`Target: ${preset.label} (${formatRs(preset.value * 100)}/day)`);
                          }}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all active:scale-95 cursor-pointer ${
                            activeSimulatedSpend === preset.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/60 bg-background text-muted-foreground hover:bg-surface hover:text-foreground"
                          }`}
                        >
                          {preset.label} ({formatRs(preset.value * 100)})
                        </button>
                      ))}
                      {simulatedDailySpend !== null && (
                        <button
                          type="button"
                          onClick={() => { setSimulatedDailySpend(null); toast.info("Reset to actual pace."); }}
                          className="rounded-lg border border-dashed border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer"
                        >
                          {defaultPace > 0 ? `Reset (${formatRs(defaultPace * 100)}/day)` : "Reset"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mode cards */}
                  <div className="border-t border-border/40 pt-4 space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Plan intensity</span>
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
                    <div className="bg-muted/35 border border-border/40 p-1 rounded-xl grid grid-cols-3 gap-1">
                      {[
                        { key: "normal" as const, label: "Current Pace", amount: noSpendHistory ? "—" : `${formatRs((defaultPace || safeDailyRs) * 100)}` },
                        { key: "glide" as const, label: "Stretch", amount: safeDailyIsZero ? "Pause" : `${formatRs(stretchModeDailyRs * 100)}` },
                        { key: "turbulence" as const, label: "Emergency", amount: safeDailyIsZero ? "Pause" : `${formatRs(emergencyModeDailyRs * 100)}` }
                      ].map((mode) => (
                        <button
                          key={mode.key}
                          type="button"
                          onClick={() => selectRunwayMode(mode.key)}
                          className={`py-2 px-1 text-center rounded-lg transition-all cursor-pointer ${
                            flightProtocol === mode.key
                              ? "bg-background text-foreground shadow-sm border border-border/80 font-semibold text-xs"
                              : "text-muted-foreground hover:text-foreground text-xs font-medium"
                          }`}
                        >
                          <span className="block truncate text-[10px] sm:text-xs">{mode.label}</span>
                          <span className="block text-[10px] sm:text-xs font-black opacity-80 mt-0.5 tnum">
                            {mode.amount}
                            {mode.key !== "normal" && mode.amount !== "Pause" && <span className="text-[8px] font-normal text-muted-foreground">/day</span>}
                            {mode.key === "normal" && !noSpendHistory && <span className="text-[8px] font-normal text-muted-foreground">/day</span>}
                          </span>
                        </button>
                      ))}
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
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Optional stretch levers</span>
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
                                className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                  !lever.enabled
                                    ? "opacity-35 cursor-not-allowed border-border/30 bg-muted/5"
                                    : lever.active
                                      ? "border-pb-green/45 bg-pb-green/5 text-foreground"
                                      : "border-border/60 bg-background text-muted-foreground hover:bg-surface hover:text-foreground"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${lever.active ? "bg-pb-green/10 text-pb-green" : "bg-muted text-muted-foreground"}`}>
                                    <LeverIcon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="block text-xs font-bold truncate text-foreground">{lever.label}</span>
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
                          <AlertCircle className="h-3.5 w-3.5" /><span>Emergency plan</span>
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
                <div className="hidden lg:flex w-full flex-col justify-between gap-4 rounded-xl border border-border/60 bg-background/55 p-4 lg:w-72">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Runway simulator</span>
                      <Badge variant="outline" className={`text-[9px] font-bold uppercase py-0.5 ${
                        flightProtocol === "normal" ? "border-primary/30 bg-primary/10 text-primary" :
                        flightProtocol === "glide" ? "border-pb-amber/30 bg-pb-amber/10 text-pb-amber" :
                        "border-pb-red/30 bg-pb-red/10 text-pb-red"
                      }`}>
                        {flightProtocol === "normal" ? "Normal" : flightProtocol === "glide" ? "Stretch" : "Emergency"}
                      </Badge>
                    </div>

                    {/* SVG Circular Gauge */}
                    <div className="flex justify-center py-1.5">
                      <div className="relative h-24 w-24">
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
                          <span className="text-2xl font-semibold tracking-tight text-foreground tnum">
                            {safeDailyIsZero ? "0" : simulatedDays}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">days left</span>
                        </div>
                      </div>
                    </div>

                    {/* Status indicator */}
                    <div className="pt-3.5 border-t border-border/40">
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${isSimulatedSafe ? "bg-pb-green" : "bg-pb-red"}`} />
                        <span className="text-xs font-semibold text-foreground">
                          {isSimulatedSafe ? "Reaches reset safely" : "Deficit detected"}
                        </span>
                      </div>
                      <p className="mt-1.5 pl-4.5 text-[11px] leading-relaxed text-muted-foreground">
                        {isSimulatedSafe
                          ? `Survives the next ${daysLeftInCycle} days on this plan.`
                          : safeDailyIsZero
                            ? "All discretionary balance consumed."
                            : `Runs out ${Math.max(0, daysLeftInCycle - simulatedDays)} days early. Cycle gap: ${formatRs(simulatedGapPaise)}.`}
                      </p>
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
            <Card className="p-4 sm:p-5 border border-border bg-card/25 space-y-4 mt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-3">
                <div className="space-y-0.5">
                  <p className={sectionEyebrowClass}>Runway actions</p>
                  <h3 className={sectionTitleClass}>Choose one lever to change the forecast</h3>
                  <p className={sectionBodyClass}>Each option below maps to a real setting or habit, so the next step stays obvious.</p>
                </div>

                <Select value={selectedActionId} onValueChange={setSelectedActionId}>
                  <SelectTrigger className="h-9 w-full sm:w-[260px] rounded-lg border-border/70 bg-background text-xs text-left focus:ring-1 focus:ring-primary/20">
                    <SelectValue placeholder="Select action step" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border text-foreground">
                    {secondaryRunwayActions.map((action) => (
                      <SelectItem key={action.id} value={action.id} className="text-xs font-semibold">
                        {action.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selected Action Content */}
              {(() => {
                if (!selectedRunwayAction) return null;

                const actionPath =
                  selectedRunwayAction.id === "action-2" && forecast.status === "shortfall" ? "/settings" :
                  selectedRunwayAction.id === "action-1" ? "/settings" :
                  selectedRunwayAction.id === "action-3" ? "/settings" :
                  null;

                const actionButtonText =
                  selectedRunwayAction.id === "action-2" && forecast.status === "shortfall" ? "Manage subscriptions" :
                  selectedRunwayAction.id === "action-1" ? "Configure safety buffer" :
                  selectedRunwayAction.id === "action-3" ? "Adjust food cap" :
                  "View settings";

                return (
                  <div className="flex flex-col gap-4 pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={sectionEyebrowClass}>Selected step</span>
                        <Badge variant="outline" className={`text-[9px] uppercase font-semibold px-2 py-0.5 rounded ${
                          selectedRunwayAction.severity === "high" ? "border-pb-red/20 text-pb-red bg-pb-red/5" :
                          selectedRunwayAction.severity === "medium" ? "border-pb-amber/20 text-pb-amber bg-pb-amber/5" :
                          "border-border text-muted-foreground bg-muted/10"
                        }`}>
                          {selectedRunwayAction.severity === "high" ? "Critical priority" : selectedRunwayAction.severity === "medium" ? "Recommended" : "Optional"}
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        <h4 className={sectionTitleClass}>{selectedRunwayAction.label}</h4>
                        <p className={sectionBodyClass}>{selectedRunwayAction.detail}</p>
                      </div>
                    </div>

                    {actionPath && (
                      <div className="shrink-0 sm:self-center">
                        <Link to={actionPath} className="inline-flex h-8 items-center rounded-lg border border-border/80 bg-background px-3.5 text-[10px] font-semibold uppercase tracking-wider text-foreground hover:bg-surface hover:text-primary transition-all duration-200 shadow-sm cursor-pointer">
                          {actionButtonText}
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })()}
            </Card>


            {/* Runway Progress Card */}
            <Card className="p-4 sm:p-5 border border-border bg-card/25">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className={sectionEyebrowClass}>Allowance cycle</p>
                  <h3 className={sectionTitleClass}>Where the cycle stands right now</h3>
                  <p className={sectionBodyClass}>Reset date, spending already used, and the cash still available.</p>
                </div>
                <Badge variant="outline" className="w-fit border-border bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
                  {forecast.current_cycle.days_left} days left
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background/55 p-3">
                  <p className={sectionEyebrowClass}>Started</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {new Date(forecast.current_cycle.start).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Funding: {formatRs(forecast.current_cycle.available_funding)}</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/55 p-3">
                  <p className={sectionEyebrowClass}>Used so far</p>
                  <p className="mt-1 text-sm font-semibold text-foreground tnum">{formatRs(forecast.current_cycle.spent)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{allowanceProgressPct}% of cycle funding spent</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/55 p-3">
                  <p className={sectionEyebrowClass}>Resets</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {new Date(forecast.current_cycle.end).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Balance: {formatRs(remainingBalance)}</p>
                </div>
              </div>
            </Card>

            {/* Committed vs Flexible Spend visualizer */}
            <Card className="p-4 sm:p-5 border border-border bg-card/25">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className={sectionEyebrowClass}>Where the runway goes</p>
                  <h3 className={sectionTitleClass}>Reserved vs flexible spend</h3>
                  <p className={sectionBodyClass}>
                    This view explains the forecast above; it is not a second recommendation.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit text-[10px] md:text-xs uppercase font-semibold border-border bg-surface-raised px-2 py-0.5">
                  Reserved vs flexible
                </Badge>
              </div>
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-border/60 bg-background/55">
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
                    <p className={sectionEyebrowClass}>Reserved share</p>
                    <p className="mt-1 text-sm font-semibold text-foreground tnum">{committedPct}%</p>
                    <p className={sectionBodyClass}>{formatRs(forecast.commitments.total)} protected before daily spend.</p>
                  </div>
                  <div className="rounded-xl border border-pb-amber/15 bg-pb-amber/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-pb-amber">Flexible forecast</p>
                    <p className="mt-1 text-sm font-semibold text-foreground tnum">{formatRs(forecast.projection.projected_discretionary)}</p>
                    <p className={sectionBodyClass}>{flexiblePct}% of the remaining forecasted spend.</p>
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

                <div className="grid grid-cols-1 gap-3 border-t border-border/50 pt-4 sm:grid-cols-2">
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Reserved costs</h4>
                    <p className={sectionBodyClass}>
                      Subscriptions, meal routine, exam buffer, and pending pool settlements are protected before daily spending is calculated.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-pb-amber">Flexible forecast</h4>
                    <p className={sectionBodyClass}>
                      Snacks, travel, shopping, and other variable spends are projected from recent pace for the remaining cycle.
                    </p>
                  </div>
                </div>
              </div>
            </Card>



          </div>
        )}

        {/* ── Tab: Commitments ── */}
        {activeTab === "commitments" && (
          <div className="space-y-6">
            <Card className="p-5 sm:p-6 border border-border bg-card/25">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-border/40 pb-4 mb-6">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Fixed commitments</h2>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-normal">
                    Reserved before safe/day is calculated, so essentials do not get mixed with flexible spend.
                  </p>
                </div>
                <div className="flex flex-row justify-between items-center sm:flex-col sm:items-end sm:text-right gap-2 shrink-0">
                  <div className="text-left sm:text-right">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Reserved this cycle</span>
                    <span className="text-xl font-black text-primary tnum leading-tight">{formatRs(forecast.commitments.total)}</span>
                  </div>
                  <Badge variant="outline" className={`text-[9px] font-black uppercase py-0.5 px-1.5 rounded ${
                    forecast.confidence.level === "high" ? "bg-pb-green/5 border-pb-green/20 text-pb-green" :
                    forecast.confidence.level === "medium" ? "bg-pb-amber/5 border-pb-amber/20 text-pb-amber" :
                    "bg-zinc-500/5 border-zinc-500/20 text-zinc-500"
                  }`}>
                    {forecast.confidence.level} ({forecast.confidence.score}%)
                  </Badge>
                </div>
              </div>

              {commitmentSummary.length > 0 && (
                <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/10 border border-border/40 p-3.5 rounded-xl">
                  {commitmentSummary.map((item) => (
                    <div key={item.key} className="space-y-0.5">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">{item.label}</p>
                      <p className="text-sm font-black text-foreground tnum">{formatRs(item.amount)}</p>
                    </div>
                  ))}
                </div>
              )}

              {forecast.commitments.items?.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-surface/40 py-10 px-4 text-center text-zinc-500 text-xs">
                  No fixed commitments or reserves found for this allowance cycle. Add rent, subscriptions, meal bills, exam reserve, or pool dues to improve runway accuracy.
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {forecast.commitments.items.map((item: any, i: number) => {
                    const due = new Date(item.due_at);
                    return (
                      <div key={i} className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="p-2 rounded-lg bg-muted border border-border/40 text-muted-foreground shrink-0">
                            {item.kind === "subscription" ? <CreditCard className="h-4 w-4" /> :
                             item.kind === "mess" ? <Layers className="h-4 w-4" /> :
                             item.kind === "exam_buffer" ? <ShieldCheck className="h-4 w-4" /> :
                             <Layers className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{item.label}</p>
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Calendar className="h-3 w-3 shrink-0" />
                              <span>Due {due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <Badge variant="outline" className={`text-[8px] font-bold uppercase py-0.5 ${
                            item.status === "scheduled" ? "border-pb-green/30 text-pb-green bg-pb-green/5" :
                            item.status === "reserved" ? "border-pb-purple/30 text-pb-purple bg-pb-purple/5" :
                            "border-border text-muted-foreground bg-muted/5"
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
            <Card className="p-4 border border-border/50 bg-card/10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 hidden sm:block">
                  <Info className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Need updates?</h4>
                  <p className="text-[10px] text-muted-foreground leading-normal mt-0.5 truncate max-w-[200px] sm:max-w-none">
                    Adjust subscriptions, mess bills, or exam buffer in settings.
                  </p>
                </div>
              </div>
              <Link to="/settings" className="shrink-0 h-8 rounded-lg border border-border/80 bg-background px-3 flex items-center text-[10px] font-bold uppercase tracking-wider hover:bg-surface hover:text-primary transition-all duration-200 shadow-sm cursor-pointer">
                Settings
              </Link>
            </Card>
          </div>
        )}

        {/* ── Tab: Horizons ── */}
        {activeTab === "horizons" && (
          <div className="space-y-6">
            {/* Charts Container */}
            <Card className="p-4 sm:p-5 border border-border bg-card/25">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className={sectionEyebrowClass}>Projections</p>
                  <h3 className={sectionTitleClass}>How the runway behaves across longer horizons</h3>
                  <p className={sectionBodyClass}>{horizonTakeaway}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end shrink-0">
                  {projectionSignal && (
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider font-semibold ${
                      projectionSignal.isDeficit ? "border-pb-red/30 text-pb-red bg-pb-red/5" : "border-pb-green/30 text-pb-green bg-pb-green/5"
                    }`}>
                      {projectionSignal.isDeficit ? "First deficit" : "Long view"}: {projectionSignal.label}
                    </Badge>
                  )}
                  <Badge variant="outline" className={`text-[10px] uppercase tracking-wider font-semibold ${
                    forecast.confidence.level === "high" ? "border-pb-green/30 text-pb-green bg-pb-green/5" :
                    forecast.confidence.level === "medium" ? "border-pb-amber/30 text-pb-amber bg-pb-amber/5" :
                    "border-border text-muted-foreground bg-muted/10"
                  }`}>
                    {forecast.confidence.level} confidence ({forecast.confidence.score}%)
                  </Badge>
                </div>
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

            {/* Scenario Grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {forecast.horizons.map((h: any) => {
                const isNegative = h.projected_balance < 0;
                const balanceDelta = Number(h.projected_funding || 0) - Number(h.projected_spend || 0);
                return (
                  <Card key={h.key} className="border border-border bg-card/30 p-4">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={sectionEyebrowClass}>{h.label}</p>
                          <p className={`mt-1 text-xl font-semibold tnum ${isNegative ? "text-pb-red" : "text-pb-green"}`}>
                            {formatRs(h.projected_balance)}
                          </p>
                          <p className={sectionBodyClass}>
                            {isNegative
                              ? "Projected balance falls below zero by the end of this horizon."
                              : "Projected balance stays positive through this horizon."}
                          </p>
                        </div>
                        <Badge variant="outline" className={`text-[9px] uppercase font-semibold ${
                          isNegative ? "border-pb-red/30 text-pb-red bg-pb-red/5" : "border-pb-green/30 text-pb-green bg-pb-green/5"
                        }`}>
                          {isNegative ? "Deficit" : "Surplus"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-3 border-y border-border/50 py-3">
                        <div className="space-y-1">
                          <p className={sectionEyebrowClass}>Funding</p>
                          <p className="text-sm font-semibold text-foreground tnum">{formatRs(h.projected_funding)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className={sectionEyebrowClass}>Expected spend</p>
                          <p className="text-sm font-semibold text-foreground tnum">{formatRs(h.projected_spend)}</p>
                        </div>
                        <div className="space-y-1 text-right">
                          <p className={sectionEyebrowClass}>Net</p>
                          <p className={`text-sm font-semibold tnum ${balanceDelta >= 0 ? "text-pb-green" : "text-pb-red"}`}>
                            {balanceDelta >= 0 ? "+" : ""}{formatRs(balanceDelta)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={sectionEyebrowClass}>Scenario range</p>
                            <p className={sectionBodyClass}>Range at {forecast.confidence.score}% model confidence.</p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-foreground tnum text-right">
                            {formatRs(h.balance_low)} to {formatRs(h.balance_high)}
                          </p>
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className={sectionEyebrowClass}>{isNegative ? "Correction needed" : "End position"}</p>
                            <p className={sectionBodyClass}>
                              {isNegative
                                ? "Add monthly funding or lower flexible spend before this horizon."
                                : "Current pace still leaves a positive balance at the end of this horizon."}
                            </p>
                          </div>
                          <p className={`shrink-0 text-sm font-semibold tnum text-right ${isNegative ? "text-pb-red" : "text-pb-green"}`}>
                            {isNegative ? `${formatRs(h.monthly_shortfall)} / month` : formatRs(h.projected_balance)}
                          </p>
                        </div>
                      </div>

                      {h.basis && (
                        <div className="border-t border-border/40 pt-3">
                          <p className="text-[10px] leading-relaxed text-muted-foreground">
                            Basis: {h.basis}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}


      </div>
      {/* 📋 FORECAST INPUTS MODAL */}
      <Dialog open={showForecastInputs} onOpenChange={setShowForecastInputs}>
        <DialogContent className="max-w-md bg-background border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
              <ShieldCheck className="h-4.5 w-4.5 text-primary" />
              <span>Forecast Inputs</span>
            </DialogTitle>
          </DialogHeader>

          <div className="divide-y divide-border/30 max-h-[60vh] overflow-y-auto pr-1">
            {absorbedFactors.length ? absorbedFactors.map((factor: any) => (
              <div key={factor.kind} className="py-3 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-bold text-foreground truncate">{factor.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-normal">{factor.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-black text-foreground tnum">
                    {formatRs(factor.daily_amount ?? factor.amount)}
                  </span>
                  {factor.daily_amount ? <span className="block text-[10px] text-muted-foreground font-semibold">/day</span> : null}
                </div>
              </div>
            )) : commitmentSummary.length ? commitmentSummary.map((item) => (
              <div key={item.key} className="py-3 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-bold text-foreground truncate">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-normal">Cycle reserve cost</p>
                </div>
                <span className="font-black text-foreground shrink-0 tnum">{formatRs(item.amount)}</span>
              </div>
            )) : (
              <div className="py-6 text-xs text-muted-foreground text-center italic">
                No recurring obligations linked yet.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
