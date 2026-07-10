import { createLazyFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { TravelRouteMap } from "@/components/travel/TravelRouteMap";
import {
  Compass,
  AlertOctagon,
  ShieldCheck,
  Copy,
  Check,
  Plus,
  Info,
  TrendingDown,
  Clock,
  Users,
  MapPin,
  Search,
  Zap,
  ThumbsUp,
  ThumbsDown,
  CircleDollarSign,
  TriangleAlert,
  SplitSquareHorizontal,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  getTravelRoutes,
  submitTravelReport,
  getTravelReports,
  getTravelReportCandidates,
  confirmTravelReportCandidate,
  logTravelSavings,
  createTravelRoute,
  getProfile,
  updateProfile,
  getAiTravelCoach,
  getTravelRouteEstimate,
  getTravelPlaceSuggestions,
  voteTravelReport,
} from "@/lib/api/db.functions";

export const Route = createLazyFileRoute("/_authenticated/travel")({
  component: TravelPage,
});

const POPULAR_COLLEGES = [
  "ABV-IIITM Gwalior",
  "IIT Delhi",
  "BITS Pilani",
  "IIT Bombay",
  "IIIT Bangalore",
  "VIT Vellore",
];

const CUSTOM_COLLEGE_OPTION = "__custom_college__";
const FALLBACK_COLLEGE_LABEL = "PocketBuddy Campus";

interface IntermediateStop {
  stopName: string;
  leg1: string;
  leg2: string;
  shared1: number;
  shared2: number;
  direct1: number;
  direct2: number;
  directTotal: number;
  tip: string;
  confidence?: "high" | "medium" | "low";
  avoidWhen?: string[];
  available?: boolean;
}

interface TravelStrategyLeg {
  label: string;
  text: string;
  fare?: number;
}

interface TravelStrategy {
  total_fare: number;
  legs: TravelStrategyLeg[];
}

type TravelIntent = "hurry" | "save" | "safe";
type TravelTimeSelection = "now" | "morning" | "afternoon" | "evening" | "late_night";

interface SplitSuggestion {
  available?: boolean;
  recommended?: boolean;
  title?: string;
  transfer_label?: string;
  confidence?: "high" | "medium" | "low";
  source?: string;
  time_context?: string;
  reason?: string;
  direct_fare?: number;
  split_fare?: number;
  estimated_savings?: number;
  first_leg?: string;
  second_leg?: string;
  avoid_when?: string[];
  direct_strategy?: TravelStrategy;
  split_strategy?: TravelStrategy;
  private_hop_strategy?: TravelStrategy;
}

const TRAVEL_INTENTS: Array<{ id: TravelIntent; label: string }> = [
  { id: "hurry", label: "Hurry" },
  { id: "save", label: "Save" },
  { id: "safe", label: "Safer" },
];

const TRAVEL_TIME_CHOICES: Array<{
  id: Exclude<TravelTimeSelection, "now">;
  label: string;
  window: string;
  factor: number;
  color: string;
  hint: string;
}> = [
  {
    id: "morning",
    label: "Morning Rush",
    window: "08:00 - 11:00",
    factor: 1.2,
    color: "text-amber-600 dark:text-amber-400",
    hint: "Auto prices tend to be 15-25% higher. Compare before accepting a flat quote.",
  },
  {
    id: "afternoon",
    label: "Off-Peak",
    window: "11:00 - 17:00",
    factor: 1.0,
    color: "text-emerald-600 dark:text-emerald-400",
    hint: "Best time to travel. Normal fares apply.",
  },
  {
    id: "evening",
    label: "Evening Rush",
    window: "17:00 - 21:00",
    factor: 1.35,
    color: "text-rose-600 dark:text-red-400",
    hint: "Peak hour. Quotes may be higher. Consider waiting 20 min.",
  },
  {
    id: "late_night",
    label: "Night Hours",
    window: "21:00 - 08:00",
    factor: 1.15,
    color: "text-indigo-600 dark:text-indigo-400",
    hint: "Late night. Use pre-booked rides only. Avoid unknown shared autos.",
  },
];

interface TravelPlaceSuggestion {
  id: string;
  label: string;
  secondary?: string;
  source?: string;
  lat?: number;
  lon?: number;
  place_id?: string;
  confidence?: string;
  match_score?: number;
}

const getIntermediateData = (
  fallbackDirect: number,
  fallbackShared: number,
  splitSuggestion?: SplitSuggestion | null,
): IntermediateStop => {
  const directStrategy = splitSuggestion?.direct_strategy;
  const splitStrategy = splitSuggestion?.split_strategy;
  const privateHopStrategy = splitSuggestion?.private_hop_strategy;
  const publicHopLegs = splitStrategy?.legs || [];
  const privateHopLegs = privateHopStrategy?.legs || [];

  if (splitSuggestion?.available && splitSuggestion.transfer_label && splitStrategy) {
    const splitFare = Math.round(Number(splitStrategy.total_fare || splitSuggestion.split_fare || fallbackShared || 0));
    const privateHopFare = Math.round(Number(privateHopStrategy?.total_fare || splitSuggestion.direct_fare || fallbackDirect || 0));
    const directFare = Math.round(Number(directStrategy?.total_fare || splitSuggestion.direct_fare || fallbackDirect || privateHopFare || splitFare));
    const shared1 = Math.max(0, Math.round(Number(publicHopLegs[0]?.fare || splitFare * 0.48)));
    const shared2 = Math.max(0, Math.round(Number(publicHopLegs[2]?.fare || splitFare - shared1)));
    const direct1 = Math.max(0, Math.round(Number(privateHopLegs[0]?.fare || privateHopFare * 0.48)));
    const direct2 = Math.max(0, Math.round(Number(privateHopLegs[2]?.fare || privateHopFare - direct1)));
    return {
      stopName: splitSuggestion.transfer_label,
      leg1: publicHopLegs[0]?.text || splitSuggestion.first_leg || `Start to ${splitSuggestion.transfer_label}`,
      leg2: publicHopLegs[2]?.text || splitSuggestion.second_leg || `${splitSuggestion.transfer_label} to destination`,
      shared1,
      shared2,
      direct1,
      direct2,
      directTotal: directFare,
      tip: splitSuggestion.reason || `Use the backend-verified transfer point at ${splitSuggestion.transfer_label} only when the area is active.`,
      confidence: splitSuggestion.confidence || "medium",
      avoidWhen: splitSuggestion.avoid_when || ["late night", "heavy luggage", "rain"],
      available: true,
    };
  }

  const direct = fallbackDirect || 150;
  const shared = fallbackShared || 40;

  return {
    stopName: "No verified transfer point",
    leg1: "Start to destination",
    leg2: "No second hop available",
    shared1: Math.round(shared * 0.45),
    shared2: Math.round(shared * 0.45),
    direct1: Math.round(direct * 0.45),
    direct2: Math.round(direct * 0.45),
    directTotal: direct,
    tip: splitSuggestion?.reason || "No backend-verified public transfer point is available for this route yet. Use direct ride unless a local student confirms a safe interchange.",
    confidence: "low",
    avoidWhen: ["late night", "heavy luggage", "rain", "unfamiliar area"],
    available: false,
  };
};

function getTimeOfDaySurge() {
  const h = new Date().getHours();
  if (h >= 7 && h < 10) return { ...TRAVEL_TIME_CHOICES[0], apiValue: "morning" as const, selectorLabel: "Now" };
  if (h >= 17 && h < 21) return { ...TRAVEL_TIME_CHOICES[2], apiValue: "evening" as const, selectorLabel: "Now" };
  if (h >= 21 || h < 6) return { ...TRAVEL_TIME_CHOICES[3], apiValue: "late_night" as const, selectorLabel: "Now" };
  return { ...TRAVEL_TIME_CHOICES[1], apiValue: "afternoon" as const, selectorLabel: "Now" };
}

function getSelectedTimeContext(selection: TravelTimeSelection, currentContext: ReturnType<typeof getTimeOfDaySurge>) {
  if (selection === "now") return currentContext;
  const choice = TRAVEL_TIME_CHOICES.find((item) => item.id === selection) || TRAVEL_TIME_CHOICES[1];
  return { ...choice, apiValue: choice.id, selectorLabel: choice.label };
}

function SourceBadge({ label }: { label?: string }) {
  const l = label?.toLowerCase() || "";
  if (l === "stale")
    return <Badge className="text-[8px] bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 py-0 px-1.5 font-medium shrink-0">Stale fares</Badge>;
  if (l === "community median" || l === "community" || l === "student_reports")
    return <Badge className="text-[8px] bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 py-0 px-1.5 font-medium shrink-0">Student reports</Badge>;
  if (l === "recent student report" || l === "recent report")
    return <Badge className="text-[8px] bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 py-0 px-1.5 font-medium shrink-0">Recent report</Badge>;
  if (l === "official")
    return <Badge className="text-[8px] bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-600 dark:text-green-400 py-0 px-1.5 font-medium shrink-0">Verified</Badge>;
  return <Badge className="text-[8px] bg-zinc-700/10 dark:bg-zinc-700/30 border border-zinc-200 dark:border-zinc-700/50 text-zinc-600 dark:text-zinc-500 py-0 px-1.5 font-medium shrink-0">Model estimate</Badge>;
}

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const c = confidence?.toLowerCase() || "low";
  if (c === "high") {
    return <Badge className="text-[8px] bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 py-0 px-1.5 font-bold uppercase shrink-0">High Trust</Badge>;
  }
  if (c === "medium") {
    return <Badge className="text-[8px] bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 py-0 px-1.5 font-bold uppercase shrink-0">Medium Trust</Badge>;
  }
  return <Badge className="text-[8px] bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 text-amber-600 dark:text-amber-500/80 py-0 px-1.5 font-bold uppercase shrink-0">Low Trust</Badge>;
}

function placeSourceLabel(source?: string) {
  if (source === "photon") return "Map";
  if (source === "nominatim") return "Map";
  if (source === "campus_landmark") return "Campus";
  if (source === "campus") return "Campus";
  if (source === "manual") return "Typed";
  return "Local";
}

function travelModeStyle(mode: string) {
  const label = mode.split(" ")[0] || "Ride";
  const l = mode.toLowerCase();
  if (l.includes("bike")) {
    return {
      label,
      className: "border-sky-500/25 bg-sky-500/10",
      textClassName: "text-sky-600 dark:text-sky-400",
      dotClassName: "bg-sky-500",
      note: "fastest solo",
    };
  }
  if (l.includes("cab")) {
    return {
      label,
      className: "border-indigo-500/25 bg-indigo-500/10",
      textClassName: "text-indigo-600 dark:text-indigo-400",
      dotClassName: "bg-indigo-500",
      note: "best with bags",
    };
  }
  if (l.includes("shared") || l.includes("tempo") || l.includes("bus")) {
    return {
      label,
      className: "border-emerald-500/25 bg-emerald-500/10",
      textClassName: "text-emerald-600 dark:text-emerald-400",
      dotClassName: "bg-emerald-500",
      note: "lowest cost",
    };
  }
  return {
    label,
    className: "border-amber-500/25 bg-amber-500/10",
    textClassName: "text-amber-600 dark:text-amber-400",
    dotClassName: "bg-amber-500",
    note: "easy pickup",
  };
}

function fareSourceLabel(mode: any) {
  const sampleSize = Number(mode?.report_sample_size || 0);
  const threshold = Math.max(5, Number(mode?.report_threshold || 5));
  if (mode?.trust_stage === "student_verified" || mode?.trust_badge === "Student verified") {
    return `Student verified · ${sampleSize} reports`;
  }
  if (mode?.trust_stage === "learning" || mode?.trust_badge === "Learning") {
    return `Learning · ${sampleSize}/${threshold} reports`;
  }
  if (mode?.trust_stage === "model_estimate" || mode?.trust_badge === "Model estimate") {
    return "Model estimate";
  }
  if (mode?.fare_source === "student_reports" && sampleSize >= threshold) {
    return `Student verified · ${sampleSize} reports`;
  }
  if (sampleSize > 0) {
    return `Learning · ${sampleSize}/${threshold} reports`;
  }
  return "Model estimate: distance and campus-local fare model";
}

function fareTypicalLabel(mode: any) {
  const sampleSize = Number(mode?.report_sample_size || 0);
  const threshold = Math.max(5, Number(mode?.report_threshold || 5));
  if (mode?.trust_stage === "student_verified" || (mode?.fare_source === "student_reports" && sampleSize >= threshold)) {
    return "Student verified";
  }
  if (mode?.trust_stage === "learning" || sampleSize > 0) {
    return "Learning estimate";
  }
  return "Model estimate";
}

function findModeByIntent(modes: any[] = [], intent: TravelIntent, splitSuggestion?: SplitSuggestion | null, preferredMode?: string | null) {
  if (!modes.length) return null;
  const byMedian = [...modes].sort((a, b) => Number(a.median_fare || 0) - Number(b.median_fare || 0));
  const modeBy = (...terms: string[]) => modes.find((m) => terms.some((term) => String(m.mode || "").toLowerCase().includes(term)));
  if (preferredMode) {
    const selected = modes.find((m) => String(m.mode || "").toLowerCase() === preferredMode.toLowerCase());
    if (selected) return selected;
  }

  if (intent === "save") {
    return modeBy("shared", "tempo", "bus") || modeBy("bike") || byMedian[0];
  }
  if (intent === "safe") {
    return modeBy("cab") || modeBy("auto") || modes[0];
  }
  return modeBy("bike") || modeBy("auto") || modeBy("cab") || modes[0];
}

function buildDecision({
  intent,
  modes,
  durationMins,
  timeContext,
  splitSuggestion,
  preferredMode,
}: {
  intent: TravelIntent;
  modes: any[];
  durationMins?: number;
  timeContext: ReturnType<typeof getTimeOfDaySurge>;
  splitSuggestion?: SplitSuggestion | null;
  preferredMode?: string | null;
}) {
  const mode = findModeByIntent(modes, intent, splitSuggestion, preferredMode);
  if (!mode) return null;
  const median = Number(mode.median_fare || 0);
  const max = Number(mode.max_fare || median);
  const acceptUpTo = Math.max(max, Math.round(median * (timeContext.factor >= 1.3 ? 1.18 : 1.1)));
  const eta = durationMins ? `${durationMins} min` : "";

  if (intent === "save") {
    const useSplit = Boolean(splitSuggestion?.available && splitSuggestion?.recommended && Number(splitSuggestion.estimated_savings || 0) >= 30);
    return {
      label: useSplit ? "Take the split route" : `Take ${String(mode.mode || "shared option").split(" ")[0]}`,
      fare: useSplit ? splitSuggestion?.split_fare || median : median,
      mode: mode.mode,
      eta,
      action: useSplit
        ? splitSuggestion?.reason || `Use the transfer via ${splitSuggestion?.transfer_label}; avoid it late or with luggage.`
        : "Use the lowest reliable mode. Avoid empty transfer points.",
      acceptUpTo,
      tone: "emerald",
    };
  }

  if (intent === "safe") {
    return {
      label: `Use ${String(mode.mode || "direct ride").split(" ")[0]} direct`,
      fare: median,
      mode: mode.mode,
      eta,
      action: "Prefer direct pickup and drop, especially after dark or with luggage.",
      acceptUpTo,
      tone: "indigo",
    };
  }

  return {
    label: `Use ${String(mode.mode || "direct ride").split(" ")[0]} now`,
    fare: median,
    mode: mode.mode,
    eta,
    action: "Counter once near this fare. If refused, switch to app or direct ride.",
    acceptUpTo,
    tone: "neutral",
  };
}

function splitRouteName(name?: string) {
  const legacyArrowPattern = new RegExp(`\\u00e2\\u2020\\u2019|\\u00e2\\u017e\\u201d|\\u2192|\\u2794`, "g");
  const normalized = (name || "")
    .replace(legacyArrowPattern, " to ")
    .replace(/-\s*>/g, " to ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = normalized.split(/\s+to\s+/i).filter(Boolean);
  return {
    from: parts[0] || normalized || "Saved route",
    to: parts[1] || "Campus",
  };
}

function routeEstimateErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Could not estimate this route. Choose a place from the suggestions and try again.";
  }
  try {
    const parsed = JSON.parse(error.message);
    if (parsed?.message) return parsed.message;
  } catch (_) {
    // Keep the API message below when it is already human-readable.
  }
  if (error.message.includes("Select a matching place")) {
    return "Select a matching place from the suggestions so the fare is reliable.";
  }
  return error.message || "Could not estimate this route. Choose a place from the suggestions and try again.";
}

function PlaceSuggestionsDropdown({
  open,
  loading,
  suggestions,
  query,
  onSelect,
  onUseTypedPlace,
}: {
  open: boolean;
  loading: boolean;
  suggestions: TravelPlaceSuggestion[];
  query: string;
  onSelect: (suggestion: TravelPlaceSuggestion) => void;
  onUseTypedPlace: () => void;
}) {
  if (!open) return null;
  const typedQuery = query.trim();
  const handleManualSelect = () => {
    if (!typedQuery) return;
    onUseTypedPlace();
  };
  const manualButton = typedQuery ? (
    <button
      type="button"
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={handleManualSelect}
      className="mt-1 flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-border bg-surface/60 px-2.5 py-2 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
    >
      <span className="min-w-0 truncate">Use "{typedQuery}" and verify while estimating</span>
      <Search className="h-3.5 w-3.5 shrink-0" />
    </button>
  ) : null;

  if (loading) {
    return (
      <div className="absolute left-0 right-0 top-full z-[80] mt-1.5 rounded-lg border border-border bg-background p-2 shadow-2xl">
        <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
          Finding nearby places...
        </p>
      </div>
    );
  }
  if (!suggestions.length) {
    return (
      <div className="absolute left-0 right-0 top-full z-[80] mt-1.5 rounded-lg border border-border bg-background p-2 shadow-2xl">
        <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
          No reliable match yet{query.trim() ? ` for "${query.trim()}"` : ""}. Add city or choose a nearby landmark.
        </p>
        {manualButton}
      </div>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-full z-[80] mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-background p-1.5 shadow-2xl">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion)}
          className="flex w-full items-start gap-2 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-surface"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold text-foreground">
              {suggestion.label}
            </span>
            {suggestion.secondary ? (
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {suggestion.secondary}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider text-muted-foreground">
            {placeSourceLabel(suggestion.source)}
          </span>
        </button>
      ))}
      {manualButton}
    </div>
  );
}

function TravelPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const routeSearchRef = useRef<HTMLDivElement | null>(null);
  const hydratedEstimateKeyRef = useRef<string>("");
  const autoEstimateKeyRef = useRef<string>("");

  const [selectedCollege, setSelectedCollege] = useState<string>("");
  const [campusEditorOpen, setCampusEditorOpen] = useState<boolean>(false);
  const [customCollegeDraft, setCustomCollegeDraft] = useState<string>("");
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<string>("Auto");
  const [activeDetailTab, setActiveDetailTab] = useState<"check" | "split" | "coach" | "reports">("check");

  const [driverQuote, setDriverQuote] = useState<string>("");
  const [negotiatedAmount, setNegotiatedAmount] = useState<string>("");
  const [copiedScript, setCopiedScript] = useState<boolean>(false);

  const [splitPeople, setSplitPeople] = useState<number>(2);
  const [splitMode, setSplitMode] = useState<string>("Auto");

  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);

  const [reportMode, setReportMode] = useState<string>("Auto");
  const [reportPaid, setReportPaid] = useState<string>("");
  const [reportQuote, setReportQuote] = useState<string>("");
  const [reportTime, setReportTime] = useState<string>("Morning");
  const [reportLuggage, setReportLuggage] = useState<boolean>(false);
  const [reportAnonymous, setReportAnonymous] = useState<boolean>(true);

  const [userSituation, setUserSituation] = useState<string>("");
  const [appQuote, setAppQuote] = useState<string>("");
  const [aiCoachResult, setAiCoachResult] = useState<{
    script: string;
    tactics: string[];
    safety: string;
    source: string;
    surge_factor?: number;
    community_median?: number;
    fare_anchor?: number;
    fare_anchor_source?: string;
    fare_anchor_label?: string;
    report_count?: number;
  } | null>(null);

  const [dynamicOrigin, setDynamicOrigin] = useState<string>("");
  const [dynamicDestination, setDynamicDestination] = useState<string>("");
  const [debouncedDynamicOrigin, setDebouncedDynamicOrigin] = useState<string>("");
  const [debouncedDynamicDestination, setDebouncedDynamicDestination] = useState<string>("");
  const [selectedOriginPlace, setSelectedOriginPlace] = useState<TravelPlaceSuggestion | null>(null);
  const [selectedDestinationPlace, setSelectedDestinationPlace] = useState<TravelPlaceSuggestion | null>(null);
  const [manualOriginText, setManualOriginText] = useState<string>("");
  const [manualDestinationText, setManualDestinationText] = useState<string>("");
  const [originSuggestionsOpen, setOriginSuggestionsOpen] = useState(false);
  const [destinationSuggestionsOpen, setDestinationSuggestionsOpen] = useState(false);
  const [isEstimating, setIsEstimating] = useState<boolean>(false);
  const [estimatedResult, setEstimatedResult] = useState<any>(null);
  const [estimatedModeOverride, setEstimatedModeOverride] = useState<string | null>(null);
  const [travelMemoryHydrated, setTravelMemoryHydrated] = useState<boolean>(false);
  const [pendingAutoEstimate, setPendingAutoEstimate] = useState<boolean>(false);
  const [showCheckInfo, setShowCheckInfo] = useState<boolean>(false);
  const [showCoachInfo, setShowCoachInfo] = useState<boolean>(false);
  const [savedRoutesOpen, setSavedRoutesOpen] = useState<boolean>(false);
  const [travelIntent, setTravelIntent] = useState<TravelIntent>("hurry");
  const [fareTimeSelection, setFareTimeSelection] = useState<TravelTimeSelection>("now");

  const [splitTravelType, setSplitTravelType] = useState<"direct" | "split">("direct");
  const [splitHopMode, setSplitHopMode] = useState<"shared" | "direct_auto">("shared");

  const currentTimeContext = useMemo(() => getTimeOfDaySurge(), []);
  const timeContext = useMemo(
    () => getSelectedTimeContext(fareTimeSelection, currentTimeContext),
    [fareTimeSelection, currentTimeContext],
  );

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => getProfile(),
  });

  const updateCollegeMutation = useMutation({
    mutationFn: (collegeName: string) => updateProfile({ data: { college_name: collegeName } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success("Campus updated");
    },
    onError: () => toast.error("Could not update campus name. Try again."),
  });

  useEffect(() => {
    const profileCollege = profile?.college_name?.trim();
    if (profileCollege && !selectedCollege) {
      setSelectedCollege(profileCollege);
    }
  }, [profile, selectedCollege]);

  const activeCollege = useMemo(() => {
    return selectedCollege.trim() || profile?.college_name?.trim() || FALLBACK_COLLEGE_LABEL;
  }, [selectedCollege, profile]);

  const isFallbackCampus = activeCollege.toLowerCase().includes("pocketbuddy");
  const selectedRouteStorageKey = useMemo(() => {
    const userKey = user?.id || "guest";
    const campusKey = activeCollege.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "campus";
    return `pocketbuddy.travel.selectedRoute.${userKey}.${campusKey}`;
  }, [activeCollege, user?.id]);
  const lastEstimateStorageKey = useMemo(() => {
    const userKey = user?.id || "guest";
    const campusKey = activeCollege.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "campus";
    return `pocketbuddy.travel.lastEstimate.${userKey}.${campusKey}`;
  }, [activeCollege, user?.id]);
  const lastDraftStorageKey = useMemo(() => {
    const userKey = user?.id || "guest";
    const campusKey = activeCollege.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "campus";
    return `pocketbuddy.travel.lastDraft.${userKey}.${campusKey}`;
  }, [activeCollege, user?.id]);

  const campusOptions = useMemo(() => {
    const options = [
      activeCollege,
      profile?.college_name?.trim(),
      selectedCollege.trim(),
      ...POPULAR_COLLEGES,
    ].filter((college): college is string => Boolean(college));

    return Array.from(new Set(options));
  }, [activeCollege, profile, selectedCollege]);

  const selectCollege = (college: string, options: { persist?: boolean } = {}) => {
    const nextCollege = college.trim();
    if (!nextCollege) return;
    if (nextCollege.toLowerCase().includes("pocketbuddy")) {
      setCustomCollegeDraft("");
      setCampusEditorOpen(true);
      return;
    }

    setSelectedCollege(nextCollege);
    setCampusEditorOpen(false);
    setSelectedRouteId("");
    setEstimatedResult(null);
    setEstimatedModeOverride(null);
    setDynamicOrigin("");
    setDynamicDestination("");
    setSelectedOriginPlace(null);
    setSelectedDestinationPlace(null);
    setManualOriginText("");
    setManualDestinationText("");
    setPendingAutoEstimate(false);
    setTravelMemoryHydrated(false);
    if (options.persist !== false && nextCollege !== profile?.college_name?.trim()) {
      updateCollegeMutation.mutate(nextCollege);
    }
  };

  const handleCampusChange = (value: string) => {
    if (value === CUSTOM_COLLEGE_OPTION) {
      setCustomCollegeDraft(isFallbackCampus ? "" : activeCollege);
      setCampusEditorOpen(true);
      return;
    }

    selectCollege(value);
  };

  const saveCustomCollege = () => {
    const nextCollege = customCollegeDraft.trim();
    if (nextCollege.length < 3) {
      toast.error("Enter a valid college name.");
      return;
    }
    if (nextCollege.toLowerCase().includes("pocketbuddy")) {
      toast.error("Enter your real college name so estimates use the right city.");
      return;
    }

    setSelectedCollege(nextCollege);
    setSelectedRouteId("");
    setEstimatedResult(null);
    setEstimatedModeOverride(null);
    setDynamicOrigin("");
    setDynamicDestination("");
    setSelectedOriginPlace(null);
    setSelectedDestinationPlace(null);
    setManualOriginText("");
    setManualDestinationText("");
    setPendingAutoEstimate(false);
    setTravelMemoryHydrated(false);
    updateCollegeMutation.mutate(nextCollege, {
      onSuccess: () => setCampusEditorOpen(false),
    });
  };

  useEffect(() => {
    const closeSuggestions = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || routeSearchRef.current?.contains(target)) return;
      setOriginSuggestionsOpen(false);
      setDestinationSuggestionsOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOriginSuggestionsOpen(false);
      setDestinationSuggestionsOpen(false);
    };

    document.addEventListener("mousedown", closeSuggestions);
    document.addEventListener("touchstart", closeSuggestions);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeSuggestions);
      document.removeEventListener("touchstart", closeSuggestions);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDynamicOrigin(dynamicOrigin.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [dynamicOrigin]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDynamicDestination(dynamicDestination.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [dynamicDestination]);

  const { data: routes, isLoading: routesLoading } = useQuery({
    queryKey: ["travel-routes", activeCollege, user?.id],
    enabled: !!user && !!activeCollege,
    queryFn: () => getTravelRoutes(activeCollege),
  });

  const { data: originSuggestionData, isLoading: originSuggestionsLoading } = useQuery({
    queryKey: ["travel-place-suggestions", "origin", debouncedDynamicOrigin, activeCollege],
    enabled: !!user && !isFallbackCampus && debouncedDynamicOrigin.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: () => getTravelPlaceSuggestions(debouncedDynamicOrigin, activeCollege),
  });

  const { data: destinationSuggestionData, isLoading: destinationSuggestionsLoading } = useQuery({
    queryKey: ["travel-place-suggestions", "destination", debouncedDynamicDestination, activeCollege],
    enabled: !!user && !isFallbackCampus && debouncedDynamicDestination.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: () => getTravelPlaceSuggestions(debouncedDynamicDestination, activeCollege),
  });

  const originSuggestions: TravelPlaceSuggestion[] = originSuggestionData?.suggestions ?? [];
  const destinationSuggestions: TravelPlaceSuggestion[] = destinationSuggestionData?.suggestions ?? [];

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id || isFallbackCampus) return;
    if (hydratedEstimateKeyRef.current === lastEstimateStorageKey) return;
    hydratedEstimateKeyRef.current = lastEstimateStorageKey;
    setTravelMemoryHydrated(false);
    setPendingAutoEstimate(false);

    const rawEstimate = window.localStorage.getItem(lastEstimateStorageKey);
    if (!rawEstimate) {
      const rawDraft = window.localStorage.getItem(lastDraftStorageKey);
      if (rawDraft) {
        try {
          const draft = JSON.parse(rawDraft);
          const origin = typeof draft?.origin === "string" ? draft.origin.trim() : "";
          const destination = typeof draft?.destination === "string" ? draft.destination.trim() : "";
          if (origin && destination) {
            setDynamicOrigin(origin);
            setDynamicDestination(destination);
            setSelectedOriginPlace(null);
            setSelectedDestinationPlace(null);
            setManualOriginText("");
            setManualDestinationText("");
            setEstimatedResult(null);
            setEstimatedModeOverride(null);

            const allowedTimeSelections = new Set(["now", ...TRAVEL_TIME_CHOICES.map((choice) => choice.id)]);
            if (typeof draft?.fareTimeSelection === "string" && allowedTimeSelections.has(draft.fareTimeSelection)) {
              setFareTimeSelection(draft.fareTimeSelection as TravelTimeSelection);
            }
            setPendingAutoEstimate(true);
            setTravelMemoryHydrated(true);
            return;
          }
        } catch {
          window.localStorage.removeItem(lastDraftStorageKey);
        }
      }

      setEstimatedResult(null);
      setEstimatedModeOverride(null);
      setDynamicOrigin("");
      setDynamicDestination("");
      setSelectedOriginPlace(null);
      setSelectedDestinationPlace(null);
      setManualOriginText("");
      setManualDestinationText("");
      setTravelMemoryHydrated(true);
      return;
    }

    try {
      const saved = JSON.parse(rawEstimate);
      const origin = typeof saved?.origin === "string" ? saved.origin.trim() : "";
      const destination = typeof saved?.destination === "string" ? saved.destination.trim() : "";
      const result = saved?.result && Array.isArray(saved.result?.modes) ? saved.result : null;

      if (!origin || !destination || !result) {
        window.localStorage.removeItem(lastEstimateStorageKey);
        setTravelMemoryHydrated(true);
        return;
      }

      setDynamicOrigin(origin);
      setDynamicDestination(destination);
      setSelectedOriginPlace(null);
      setSelectedDestinationPlace(null);
      setManualOriginText("");
      setManualDestinationText("");
      setEstimatedResult(result);
      setPendingAutoEstimate(false);

      const allowedTimeSelections = new Set(["now", ...TRAVEL_TIME_CHOICES.map((choice) => choice.id)]);
      if (typeof saved?.fareTimeSelection === "string" && allowedTimeSelections.has(saved.fareTimeSelection)) {
        setFareTimeSelection(saved.fareTimeSelection as TravelTimeSelection);
      }
      setTravelMemoryHydrated(true);
    } catch {
      window.localStorage.removeItem(lastEstimateStorageKey);
      setTravelMemoryHydrated(true);
    }
  }, [isFallbackCampus, lastDraftStorageKey, lastEstimateStorageKey, user?.id]);

  useEffect(() => {
    if (!routes) return;

    if (routes.length === 0) {
      if (selectedRouteId) setSelectedRouteId("");
      return;
    }

    if (selectedRouteId && routes.some((r: any) => r.id === selectedRouteId)) return;

    const storedRouteId = typeof window !== "undefined" ? window.localStorage.getItem(selectedRouteStorageKey) : null;
    const storedRoute = storedRouteId ? routes.find((r: any) => r.id === storedRouteId) : null;
    setSelectedRouteId(storedRoute?.id || routes[0].id);
  }, [routes, selectedRouteId, selectedRouteStorageKey]);

  useEffect(() => {
    if (!selectedRouteId || !routes?.some((r: any) => r.id === selectedRouteId) || typeof window === "undefined") return;
    window.localStorage.setItem(selectedRouteStorageKey, selectedRouteId);
  }, [routes, selectedRouteId, selectedRouteStorageKey]);

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["travel-reports", selectedRouteId],
    enabled: !!user && !!selectedRouteId,
    queryFn: () => getTravelReports(selectedRouteId),
  });

  const { data: reportCandidates, isLoading: reportCandidatesLoading } = useQuery({
    queryKey: ["travel-report-candidates", selectedRouteId],
    enabled: !!user && !!selectedRouteId,
    queryFn: () => getTravelReportCandidates(selectedRouteId),
  });

  const selectedRoute = useMemo(() => {
    if (!routes || !selectedRouteId) return null;
    return routes.find((r: any) => r.id === selectedRouteId) || null;
  }, [routes, selectedRouteId]);

  const selectedActiveMode = useMemo(() => {
    if (!selectedRoute?.modes?.length) return null;
    const selectedModeKey = selectedMode.toLowerCase();
    return (
      selectedRoute.modes.find((m: any) => {
        const modeKey = String(m.mode || "").toLowerCase();
        const shortKey = modeKey.split(" ")[0];
        return modeKey === selectedModeKey || modeKey.includes(selectedModeKey) || selectedModeKey.includes(shortKey);
      }) || selectedRoute.modes[0]
    );
  }, [selectedRoute, selectedMode]);

  const selectedTimeFareAnchor = selectedActiveMode?.median_fare
    ? Math.round(Number(selectedActiveMode.median_fare) * timeContext.factor)
    : null;

  const selectedRouteTrustLabel = useMemo(() => {
    const confidence = String(selectedRoute?.confidence || "low").toLowerCase();
    if (confidence === "high") return "High trust";
    if (confidence === "medium") return "Medium trust";
    return "Needs confirmation";
  }, [selectedRoute]);

  useEffect(() => {
    setAiCoachResult(null);
    setAppQuote("");
    setUserSituation("");
  }, [selectedRouteId]);

  useEffect(() => {
    if (selectedRoute?.modes?.length > 0) {
      const modeNames = selectedRoute.modes.map((m: any) => m.mode);
      if (!modeNames.includes(selectedMode)) setSelectedMode(selectedRoute.modes[0].mode);
      setSplitMode(selectedRoute.modes[0].mode);
      setSplitTravelType("direct");
    }
  }, [selectedRoute]);

  useEffect(() => {
    if (isReportOpen && selectedRoute?.modes?.length > 0) {
      setReportMode(selectedRoute.modes[0].mode);
    }
  }, [isReportOpen, selectedRoute]);

  const overchargeAnalysis = useMemo(() => {
    if (!selectedRoute || !selectedActiveMode || !driverQuote) return null;
    const quote = parseFloat(driverQuote);
    if (isNaN(quote) || quote <= 0) return null;
    const normalMedian = Math.round(selectedActiveMode.median_fare * timeContext.factor);
    const normalMax = Math.round(selectedActiveMode.max_fare * timeContext.factor);
    const normalMin = Math.round(selectedActiveMode.min_fare * timeContext.factor);
    const overchargeAmt = Math.max(0, quote - normalMax);
    const isOvercharged = quote > normalMax;
    const isFair = quote <= normalMax && quote >= normalMin;
    const isUndercut = quote < normalMin;
    const pctAboveMedian = Math.round(((quote - normalMedian) / normalMedian) * 100);
    return { isOvercharged, isFair, isUndercut, normalMedian, normalMax, normalMin, overchargeAmt, pctAboveMedian };
  }, [selectedRoute, selectedActiveMode, driverQuote, timeContext.factor]);

  const splitFareData = useMemo(() => {
    if (!selectedRoute) return null;
    const modeDetails =
      selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(splitMode.toLowerCase())) ||
      selectedRoute.modes[0];
    const perPerson = Math.ceil(modeDetails.median_fare / splitPeople);
    return { perPerson, median: modeDetails.median_fare, max: modeDetails.max_fare };
  }, [selectedRoute, splitMode, splitPeople]);

  const logSavingsMutation = useMutation({
    mutationFn: logTravelSavings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-savings"] });
      qc.invalidateQueries({ queryKey: ["wing-feed"] });
      toast.success("Savings logged to your dashboard!");
      setDriverQuote("");
      setNegotiatedAmount("");
    },
    onError: (error) => toast.error(routeEstimateErrorMessage(error)),
  });

  const submitReportMutation = useMutation({
    mutationFn: submitTravelReport,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-reports", selectedRouteId] });
      qc.invalidateQueries({ queryKey: ["travel-routes", activeCollege] });
      toast.success("Report submitted! You're helping fellow students.");
      setIsReportOpen(false);
      setReportPaid("");
      setReportQuote("");
      setReportLuggage(false);
      setReportAnonymous(true);
    },
    onError: (error) => toast.error(routeEstimateErrorMessage(error)),
  });

  const createRouteMutation = useMutation({
    mutationFn: createTravelRoute,
    onSuccess: (newRoute) => {
      qc.invalidateQueries({ queryKey: ["travel-routes", activeCollege] });
      setSelectedRouteId(newRoute.id);
    },
    onError: (error) => toast.error(routeEstimateErrorMessage(error)),
  });

  const aiCoachMutation = useMutation({
    mutationFn: getAiTravelCoach,
    onSuccess: (data) => {
      setAiCoachResult(data);
      toast.success("Negotiation script ready!");
    },
    onError: (error) => toast.error(routeEstimateErrorMessage(error)),
  });

  const voteReportMutation = useMutation({
    mutationFn: ({ reportId, voteType }: { reportId: string; voteType: "up" | "down" }) =>
      voteTravelReport(reportId, voteType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-reports", selectedRouteId] });
      toast.success("Vote registered!");
    },
    onError: (error) => toast.error(routeEstimateErrorMessage(error)),
  });

  const confirmReportCandidateMutation = useMutation({
    mutationFn: ({ transactionId, data }: { transactionId: string; data: { route_id: string; mode: string; driver_quote?: number; anonymous?: boolean } }) =>
      confirmTravelReportCandidate(transactionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-report-candidates", selectedRouteId] });
      qc.invalidateQueries({ queryKey: ["travel-reports", selectedRouteId] });
      qc.invalidateQueries({ queryKey: ["travel-routes", activeCollege] });
      toast.success("Synced payment confirmed as a fare report.");
    },
    onError: (error) => toast.error(routeEstimateErrorMessage(error)),
  });

  const handleLogSavings = () => {
    if (!selectedRoute) return;
    const quoteVal = parseFloat(driverQuote);
    const paidVal = parseFloat(negotiatedAmount);
    if (isNaN(quoteVal) || isNaN(paidVal) || paidVal <= 0 || quoteVal <= paidVal) {
      toast.error("Enter a valid quoted fare and a lower paid fare.");
      return;
    }
    logSavingsMutation.mutate({ data: { amount_saved: quoteVal - paidVal, route_id: selectedRoute.id } });
  };

  const handlePostReport = (e) => {
    e.preventDefault();
    if (!selectedRoute) return;
    const quoteVal = parseFloat(reportQuote);
    const paidVal = parseFloat(reportPaid);
    if (isNaN(quoteVal) || isNaN(paidVal) || paidVal <= 0) {
      toast.error("Enter valid prices.");
      return;
    }
    if (quoteVal <= 0) {
      toast.error("Driver quote must be positive.");
      return;
    }
    if (paidVal > quoteVal) {
      toast.error("Paid amount should not be higher than the driver quote.");
      return;
    }
    submitReportMutation.mutate({
      data: {
        route_id: selectedRoute.id,
        mode: reportMode,
        amount_paid: paidVal,
        time_of_day: reportTime,
        luggage: reportLuggage,
        driver_quote: quoteVal,
        final_amount: paidVal,
        anonymous: reportAnonymous,
      },
    });
  };

  const handleAiCoachCall = () => {
    if (!selectedRoute) return;
    const parsedQuote = parseFloat(appQuote);
    if (appQuote.trim() && (isNaN(parsedQuote) || parsedQuote <= 0)) {
      toast.error("Enter a valid app quote or leave it blank.");
      return;
    }
    aiCoachMutation.mutate({
      data: {
        route_id: selectedRoute.id,
        mode: selectedMode,
        user_situation: userSituation.trim(),
        college: activeCollege,
        app_quote: isNaN(parsedQuote) ? undefined : parsedQuote,
        travel_time_context: timeContext.apiValue,
      },
    });
  };

  const copyScriptToClipboard = (text) => {
    navigator.clipboard?.writeText(text)
      .then(() => {
        setCopiedScript(true);
        toast.success("Script copied.");
        setTimeout(() => setCopiedScript(false), 2000);
      })
      .catch(() => toast.error("Could not copy script. Select and copy it manually."));
  };

  const runRouteEstimate = useCallback(async (
    originInput: string,
    destinationInput: string,
    options: { silent?: boolean; useSelectedPlaces?: boolean } = {},
  ) => {
    const origin = originInput.trim();
    const destination = destinationInput.trim();
    if (!origin || !destination) {
      if (!options.silent) toast.error("Enter both origin and destination.");
      return false;
    }
    if (isFallbackCampus) {
      if (!options.silent) {
        toast.error("Set your college first so fares are estimated near the right campus.");
        setCustomCollegeDraft("");
        setCampusEditorOpen(true);
      }
      return false;
    }
    if (origin.toLowerCase() === destination.toLowerCase()) {
      if (!options.silent) toast.error("Origin and destination must be different.");
      return false;
    }

    setIsEstimating(true);
    setEstimatedResult(null);
    setEstimatedModeOverride(null);
    try {
      const result = await getTravelRouteEstimate(origin, destination, activeCollege, {
        origin_lat: options.useSelectedPlaces ? selectedOriginPlace?.lat : undefined,
        origin_lon: options.useSelectedPlaces ? selectedOriginPlace?.lon : undefined,
        origin_place_id: options.useSelectedPlaces ? selectedOriginPlace?.place_id : undefined,
        destination_lat: options.useSelectedPlaces ? selectedDestinationPlace?.lat : undefined,
        destination_lon: options.useSelectedPlaces ? selectedDestinationPlace?.lon : undefined,
        destination_place_id: options.useSelectedPlaces ? selectedDestinationPlace?.place_id : undefined,
        time_context: timeContext.apiValue,
      });

      setEstimatedResult(result);
      if (typeof window !== "undefined") {
        const payload = {
          version: 1,
          campus: activeCollege,
          origin,
          destination,
          fareTimeSelection,
          savedAt: Date.now(),
        };
        window.localStorage.setItem(lastDraftStorageKey, JSON.stringify(payload));
        window.localStorage.setItem(
          lastEstimateStorageKey,
          JSON.stringify({
            ...payload,
            result,
          }),
        );
      }
      return true;
    } catch (error) {
      if (!options.silent) toast.error(routeEstimateErrorMessage(error));
      return false;
    } finally {
      setIsEstimating(false);
    }
  }, [
    activeCollege,
    fareTimeSelection,
    isFallbackCampus,
    lastDraftStorageKey,
    lastEstimateStorageKey,
    selectedDestinationPlace,
    selectedOriginPlace,
    timeContext.apiValue,
  ]);

  const handleEstimateRoute = async () => {
    await runRouteEstimate(dynamicOrigin, dynamicDestination, { useSelectedPlaces: true });
  };

  const selectedRouteParts = selectedRoute ? splitRouteName(selectedRoute.name) : null;

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id || !travelMemoryHydrated || isFallbackCampus) return;

    const origin = dynamicOrigin.trim();
    const destination = dynamicDestination.trim();
    const timer = window.setTimeout(() => {
      if (!origin && !destination) {
        window.localStorage.removeItem(lastDraftStorageKey);
        return;
      }

      window.localStorage.setItem(
        lastDraftStorageKey,
        JSON.stringify({
          version: 1,
          campus: activeCollege,
          origin,
          destination,
          fareTimeSelection,
          savedAt: Date.now(),
        }),
      );
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    activeCollege,
    dynamicDestination,
    dynamicOrigin,
    fareTimeSelection,
    isFallbackCampus,
    lastDraftStorageKey,
    travelMemoryHydrated,
    user?.id,
  ]);

  useEffect(() => {
    if (!travelMemoryHydrated || estimatedResult || pendingAutoEstimate || dynamicOrigin.trim() || dynamicDestination.trim()) return;
    if (!selectedRouteParts?.from || !selectedRouteParts?.to) return;

    setDynamicOrigin(selectedRouteParts.from);
    setDynamicDestination(selectedRouteParts.to);
    setSelectedOriginPlace(null);
    setSelectedDestinationPlace(null);
    setManualOriginText("");
    setManualDestinationText("");
    setPendingAutoEstimate(true);
  }, [
    dynamicDestination,
    dynamicOrigin,
    estimatedResult,
    pendingAutoEstimate,
    selectedRouteParts,
    travelMemoryHydrated,
  ]);

  useEffect(() => {
    if (!pendingAutoEstimate || !travelMemoryHydrated || estimatedResult || isEstimating) return;

    const origin = dynamicOrigin.trim();
    const destination = dynamicDestination.trim();
    if (!origin || !destination) return;

    const estimateKey = `${lastEstimateStorageKey}:${origin}:${destination}:${fareTimeSelection}`;
    if (autoEstimateKeyRef.current === estimateKey) {
      setPendingAutoEstimate(false);
      return;
    }

    autoEstimateKeyRef.current = estimateKey;
    setPendingAutoEstimate(false);
    void runRouteEstimate(origin, destination, { silent: true, useSelectedPlaces: false });
  }, [
    dynamicDestination,
    dynamicOrigin,
    estimatedResult,
    fareTimeSelection,
    isEstimating,
    lastEstimateStorageKey,
    pendingAutoEstimate,
    runRouteEstimate,
    travelMemoryHydrated,
  ]);

  const estimatedDecision = useMemo(() => {
    if (!estimatedResult?.modes?.length) return null;
    return buildDecision({
      intent: travelIntent,
      modes: estimatedResult.modes,
      durationMins: estimatedResult.duration_mins,
      timeContext,
      splitSuggestion: estimatedResult.split_suggestion,
      preferredMode: estimatedModeOverride,
    });
  }, [estimatedModeOverride, estimatedResult, timeContext, travelIntent]);

  const heroDecision = estimatedDecision;
  const heroRoute = estimatedResult;
  const heroMode = estimatedResult?.modes?.find((mode: any) => mode.mode === heroDecision?.mode) || estimatedResult?.modes?.[0] || null;
  const activeEstimatedMode = estimatedModeOverride || heroDecision?.mode || heroMode?.mode || null;
  const heroFareRange = heroMode
    ? `₹${Math.round(heroMode.min_fare * timeContext.factor)}–₹${Math.round(heroMode.max_fare * timeContext.factor)}`
    : null;
  const heroFareAnchor = heroDecision?.fare
    || (heroMode?.median_fare ? Math.round(heroMode.median_fare * timeContext.factor) : null);
  const heroAcceptLimit = heroDecision?.acceptUpTo ? `₹${heroDecision.acceptUpTo}` : null;
  const selectedOriginCoords = selectedOriginPlace?.lat != null && selectedOriginPlace?.lon != null
    ? [selectedOriginPlace.lat, selectedOriginPlace.lon]
    : null;
  const selectedDestinationCoords = selectedDestinationPlace?.lat != null && selectedDestinationPlace?.lon != null
    ? [selectedDestinationPlace.lat, selectedDestinationPlace.lon]
    : null;
  const mapRoute = estimatedResult;
  const mapOriginCoords = estimatedResult?.origin_coords
    || selectedOriginCoords;
  const mapDestinationCoords = estimatedResult?.dest_coords
    || selectedDestinationCoords;
  const mapOriginLabel = estimatedResult?.origin_resolved_label
    || selectedOriginPlace?.label
    || dynamicOrigin;
  const mapDestinationLabel = estimatedResult?.destination_resolved_label
    || selectedDestinationPlace?.label
    || dynamicDestination;

  return (
    <AppShell>
      {/* Page Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 mb-6 flex min-h-14 flex-col gap-2 border-b border-border bg-background/85 px-6 py-2 backdrop-blur-md md:-mx-10 md:-mt-8 md:h-14 md:flex-row md:items-center md:justify-between md:px-10 md:py-0 lg:-mx-12 lg:-mt-10 lg:px-12">
        <div className="flex w-full min-w-0 items-center gap-3 md:flex-1">
          <MobileMenuButton />
          <h1 className="flex min-w-0 items-center gap-2 text-base font-black uppercase tracking-[0.04em] text-foreground sm:text-lg">
            <Compass className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate sm:whitespace-nowrap">Campus Fare Guard</span>
          </h1>
        </div>
        </div>

      <div className="pb-24 space-y-5">
        <Card className="relative z-10 overflow-visible rounded-2xl border-border bg-surface/95 shadow-sm">
          <div className="space-y-3 p-3 sm:space-y-4 sm:p-5 xl:p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] xl:items-start">
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Travel Guard</p>
                <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-2xl">Plan a campus ride</h2>
                <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
                  Know the normal fare before you bargain. PocketBuddy maps the route, adjusts for timing, and gives a walk-away limit.
                </p>
              </div>
              <div className="xl:self-start">
                <Select value={activeCollege} onValueChange={handleCampusChange}>
                  <SelectTrigger
                    id="select-campus-dropdown"
                    className="h-12 w-full rounded-lg border-border bg-background px-3 py-2 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-surface focus:ring-1 focus:ring-primary/25 [&>span]:line-clamp-none"
                  >
                    <span className="min-w-0 text-left">
                      <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Campus</span>
                      <SelectValue placeholder="Select campus" />
                    </span>
                  </SelectTrigger>
                  <SelectContent align="end" className="max-h-72 rounded-lg border-border bg-background p-1 text-foreground shadow-lg">
                    {campusOptions.map((college) => (
                      <SelectItem
                        key={college}
                        value={college}
                        className="rounded-md py-2 pl-2 pr-8 text-xs font-medium"
                      >
                        {college}
                      </SelectItem>
                    ))}
                    <SelectSeparator className="my-1 bg-border" />
                    <SelectItem
                      value={CUSTOM_COLLEGE_OPTION}
                      className="rounded-md py-2 pl-2 pr-8 text-xs font-semibold text-primary"
                    >
                      Add your college name
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.88fr)_minmax(460px,1.12fr)] lg:items-stretch">
              <div className="space-y-3">
                {isFallbackCampus && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="leading-relaxed">
                        Add your college once so places, campus routes, and fare reports are searched near the right campus.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomCollegeDraft("");
                          setCampusEditorOpen(true);
                        }}
                        className="w-fit rounded-md border border-amber-500/30 bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-surface"
                      >
                        Set campus
                      </button>
                    </div>
                  </div>
                )}

                <div ref={routeSearchRef} className="relative z-30 overflow-visible rounded-lg border border-border bg-background p-1.5 shadow-sm">
                  <div className="grid grid-cols-1 gap-1.5">
                    <div className={`relative rounded-md px-3 py-2 transition-colors hover:bg-surface/60 focus-within:bg-surface focus-within:ring-1 focus-within:ring-primary/20 ${originSuggestionsOpen ? "z-[70]" : "z-10"}`}>
                      <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        Pickup
                      </div>
                      <div className="relative mt-1">
                        <Input
                          id="input-dynamic-origin"
                          placeholder="Station, airport, hostel, landmark"
                          value={dynamicOrigin}
                          onFocus={() => setOriginSuggestionsOpen(true)}
                          onBlur={() => setTimeout(() => setOriginSuggestionsOpen(false), 120)}
                          onChange={(e) => {
                            setDynamicOrigin(e.target.value);
                            setEstimatedResult(null);
                            setEstimatedModeOverride(null);
                            setPendingAutoEstimate(false);
                            setSelectedOriginPlace(null);
                            setManualOriginText("");
                            setOriginSuggestionsOpen(true);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && handleEstimateRoute()}
                          className="h-8 border-0 bg-transparent px-0 text-sm font-medium shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        <PlaceSuggestionsDropdown
                          open={!isFallbackCampus && originSuggestionsOpen && debouncedDynamicOrigin.length >= 2}
                          loading={originSuggestionsLoading}
                          suggestions={originSuggestions}
                          query={debouncedDynamicOrigin}
                          onSelect={(suggestion) => {
                            setDynamicOrigin(suggestion.label);
                            setEstimatedResult(null);
                            setEstimatedModeOverride(null);
                            setPendingAutoEstimate(false);
                            setSelectedOriginPlace(suggestion);
                            setManualOriginText("");
                            setOriginSuggestionsOpen(false);
                          }}
                          onUseTypedPlace={() => {
                            setEstimatedResult(null);
                            setEstimatedModeOverride(null);
                            setPendingAutoEstimate(false);
                            setManualOriginText(dynamicOrigin.trim());
                            setSelectedOriginPlace(null);
                            setOriginSuggestionsOpen(false);
                          }}
                        />
                      </div>
                      {selectedOriginPlace ? (
                        <p className="mt-1 truncate text-[10px] font-medium text-primary">{selectedOriginPlace.label}</p>
                      ) : manualOriginText && manualOriginText === dynamicOrigin.trim() ? (
                        <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">Typed place. PocketBuddy will verify it while estimating.</p>
                      ) : null}
                    </div>

                    <div className={`relative rounded-md px-3 py-2 transition-colors hover:bg-surface/60 focus-within:bg-surface focus-within:ring-1 focus-within:ring-primary/20 ${destinationSuggestionsOpen ? "z-[70]" : "z-10"}`}>
                      <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Destination
                      </div>
                      <div className="relative mt-1">
                        <Input
                          id="input-dynamic-destination"
                          placeholder="Campus, gate, hostel, landmark"
                          value={dynamicDestination}
                          onFocus={() => setDestinationSuggestionsOpen(true)}
                          onBlur={() => setTimeout(() => setDestinationSuggestionsOpen(false), 120)}
                          onChange={(e) => {
                            setDynamicDestination(e.target.value);
                            setEstimatedResult(null);
                            setEstimatedModeOverride(null);
                            setPendingAutoEstimate(false);
                            setSelectedDestinationPlace(null);
                            setManualDestinationText("");
                            setDestinationSuggestionsOpen(true);
                          }}
                          onKeyDown={(e) => e.key === "Enter" && handleEstimateRoute()}
                          className="h-8 border-0 bg-transparent px-0 text-sm font-medium shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        <PlaceSuggestionsDropdown
                          open={!isFallbackCampus && destinationSuggestionsOpen && debouncedDynamicDestination.length >= 2}
                          loading={destinationSuggestionsLoading}
                          suggestions={destinationSuggestions}
                          query={debouncedDynamicDestination}
                          onSelect={(suggestion) => {
                            setDynamicDestination(suggestion.label);
                            setEstimatedResult(null);
                            setEstimatedModeOverride(null);
                            setPendingAutoEstimate(false);
                            setSelectedDestinationPlace(suggestion);
                            setManualDestinationText("");
                            setDestinationSuggestionsOpen(false);
                          }}
                          onUseTypedPlace={() => {
                            setEstimatedResult(null);
                            setEstimatedModeOverride(null);
                            setPendingAutoEstimate(false);
                            setManualDestinationText(dynamicDestination.trim());
                            setSelectedDestinationPlace(null);
                            setDestinationSuggestionsOpen(false);
                          }}
                        />
                      </div>
                      {selectedDestinationPlace ? (
                        <p className="mt-1 truncate text-[10px] font-medium text-primary">{selectedDestinationPlace.label}</p>
                      ) : manualDestinationText && manualDestinationText === dynamicDestination.trim() ? (
                        <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">Typed place. PocketBuddy will verify it while estimating.</p>
                      ) : null}
                    </div>

                  </div>

                  <div className="mt-1.5 grid gap-2 border-t border-border/70 px-1.5 pt-2 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
                    <Select value={fareTimeSelection} onValueChange={(value) => setFareTimeSelection(value as TravelTimeSelection)}>
                      <SelectTrigger className="h-10 rounded-md border-border bg-surface text-xs">
                        <span className="min-w-0 text-left">
                          <span className="block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Travel time</span>
                          <SelectValue />
                        </span>
                      </SelectTrigger>
                      <SelectContent className="bg-background border border-border text-foreground">
                        <SelectItem value="now" className="text-xs">Now ({currentTimeContext.label})</SelectItem>
                        {TRAVEL_TIME_CHOICES.map((choice) => (
                          <SelectItem key={choice.id} value={choice.id} className="text-xs">
                            {choice.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button id="btn-estimate-route" onClick={handleEstimateRoute} disabled={isEstimating || isFallbackCampus}
                      className="h-10 w-full rounded-md bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-70">
                      <span className="flex items-center justify-center gap-2">
                      {isFallbackCampus ? (
                        <>Set campus to estimate</>
                      ) : isEstimating ? (
                        <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Mapping route</>
                      ) : (
                        <><Search className="h-4 w-4" />Estimate fare</>
                      )}
                      </span>
                    </Button>
                  </div>

                </div>

                <div className="rounded-xl border border-border bg-background p-3 shadow-sm">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        Current move
                      </div>
                      <p className="mt-1 truncate text-base font-semibold text-foreground">
                        {heroDecision?.label || (heroRoute ? "Fare range ready" : "Estimate a route")}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                        {heroDecision?.action || "Enter pickup and destination to get a route-specific fare window."}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 sm:min-w-[116px] sm:flex-col sm:items-start sm:gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Anchor fare</span>
                      <span className="text-lg font-semibold tabular-nums text-foreground">{heroFareAnchor ? `₹${heroFareAnchor}` : "--"}</span>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-border/70 bg-surface px-3 py-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Time</p>
                      <p className="mt-1 truncate text-xs font-semibold text-foreground">{timeContext.label}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-surface px-3 py-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Range</p>
                      <p className="mt-1 truncate text-xs font-semibold text-foreground">{heroFareRange || "Pending"}</p>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-surface px-3 py-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Limit</p>
                      <p className="mt-1 truncate text-xs font-semibold text-foreground">{heroAcceptLimit || "After quote"}</p>
                    </div>
                  </div>

                  {estimatedResult?.modes?.length ? (
                    <div className="mt-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Mode</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {estimatedResult.modes.slice(0, 4).map((mode: any) => {
                          const modeStyle = travelModeStyle(mode.mode);
                          const isActive = activeEstimatedMode === mode.mode;
                          return (
                            <button
                              key={mode.mode}
                              type="button"
                              onClick={() => setEstimatedModeOverride(mode.mode)}
                              className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                                isActive
                                  ? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/15"
                                  : "border-border/70 bg-surface text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                              }`}
                            >
                              <span className="block truncate text-[11px] font-semibold">{modeStyle.label}</span>
                              <span className="mt-0.5 block truncate text-[10px] font-medium">₹{mode.min_fare}–₹{mode.max_fare}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                </div>
              </div>

              <TravelRouteMap
                geometry={mapRoute?.geometry}
                originCoords={mapOriginCoords}
                destinationCoords={mapDestinationCoords}
                originLabel={mapOriginLabel}
                destinationLabel={mapDestinationLabel}
                distanceKm={mapRoute?.distance_km}
                durationMins={mapRoute?.duration_mins}
                className="h-[240px] sm:h-[300px] lg:h-full lg:min-h-[410px]"
              />
            </div>
          </div>

          {estimatedResult && (
            <div className="border-t border-border px-4 py-4 sm:px-5 lg:px-6 animate-[fadeIn_0.25s_ease-out]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Travel state</span>
                  <Select value={travelIntent} onValueChange={(value) => setTravelIntent(value as TravelIntent)}>
                    <SelectTrigger className="h-8 w-[112px] rounded-md border-border bg-surface text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background border border-border text-foreground">
                      {TRAVEL_INTENTS.map((intent) => (
                        <SelectItem key={intent.id} value={intent.id} className="text-xs">
                          {intent.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  disabled={estimatedResult.needs_review}
                  onClick={() => {
                    if (estimatedResult.needs_review) {
                      toast.error("Select exact places and recalculate before saving this route.");
                      return;
                    }
                    const routeName = `${dynamicOrigin} to ${dynamicDestination}`;
                    createRouteMutation.mutate({
                      data: {
                        name: routeName,
                        description: `Calculated route from ${dynamicOrigin} to ${dynamicDestination}.`,
                        distance_km: estimatedResult.distance_km,
                        duration_mins: estimatedResult.duration_mins,
                        routing_provider: estimatedResult.routing_provider,
                        eta_confidence: estimatedResult.eta_confidence,
                        split_suggestion: estimatedResult.split_suggestion,
                        source: estimatedResult.source,
                        routing_cache_hit: estimatedResult.routing_cache_hit,
                        origin_coords: estimatedResult.origin_coords,
                        dest_coords: estimatedResult.dest_coords,
                        geometry: estimatedResult.geometry,
                        campus_landmark: dynamicDestination.slice(0, 35),
                        college: activeCollege
                      }
                    }, {
                      onSuccess: (newRoute) => {
                        setAppQuote("");
                        setSelectedRouteId(newRoute.id);
                        setActiveDetailTab("coach");
                        toast.success("Route saved and loaded into Coach.");
                      }
                    });
                  }}
                  className="h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50">
                  {estimatedResult.needs_review ? "Select exact places to save" : "Save this route"}
                </button>
              </div>

              {estimatedResult.resolution_warning ? (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] font-medium leading-relaxed text-amber-700 dark:text-amber-300">
                  {estimatedResult.resolution_warning}
                </div>
              ) : null}

              <details className="group mt-4 overflow-hidden rounded-lg border border-border bg-background/50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-xs font-medium text-foreground marker:hidden">
                  <span>Compare fare options</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border/70">
                  {estimatedResult.modes.map((m, idx) => {
                    const modeStyle = travelModeStyle(m.mode);
                    const cheapestMedian = Math.min(...estimatedResult.modes.map((mode) => mode.median_fare));
                    const isBestValue = m.median_fare === cheapestMedian;
                    return (
                      <div key={m.mode} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_150px_120px] sm:items-center ${idx > 0 ? "border-t border-border/70" : ""}`}>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${modeStyle.dotClassName}`} />
                            <p className="truncate text-xs font-semibold text-foreground">{modeStyle.label}</p>
                            {isBestValue ? (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-medium text-primary">Best value</span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[10px] text-muted-foreground">{fareSourceLabel(m)}. {modeStyle.note}</p>
                        </div>
                        <div className="text-right sm:text-left">
                          <p className={`text-sm font-semibold tracking-tight ${modeStyle.textClassName}`}>₹{m.min_fare} - ₹{m.max_fare}</p>
                          <p className="text-[10px] text-muted-foreground">Expected range</p>
                        </div>
                        <div className="col-span-2 text-left sm:col-span-1 sm:text-right">
                          <p className="text-xs font-medium text-foreground">{fareTypicalLabel(m)} ₹{m.median_fare}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          )}
        </Card>

        {routesLoading ? (
          <section className="border-y border-border bg-surface/60 px-3 py-3 sm:rounded-2xl sm:border sm:px-4">
            <Skeleton className="h-10 rounded-xl" />
          </section>
        ) : routes && routes.length > 0 ? (
          <section className="overflow-hidden border-y border-border bg-surface/80 shadow-sm sm:rounded-2xl sm:border">
            <button
              type="button"
              onClick={() => setSavedRoutesOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-raised/35 sm:px-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold tracking-tight text-foreground">Campus routes</p>
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {routes.length} routes
                  </span>
                </div>
                {selectedRouteParts ? (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    Current: {selectedRouteParts.from} to {selectedRouteParts.to}
                  </p>
                ) : (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">Pick a campus route for quote checks and coaching</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground">
                  {savedRoutesOpen ? "Hide" : "Change"}
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${savedRoutesOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {savedRoutesOpen && (
              <div className="divide-y divide-border/70 border-t border-border bg-background/35 animate-[fadeIn_0.18s_ease-out]">
                {routes.slice(0, 8).map((r: any) => {
                  const parts = splitRouteName(r.name);
                  const primaryMode = r.modes?.[0];
                  const isActiveRoute = selectedRouteId === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-current={isActiveRoute ? "true" : undefined}
                      onClick={() => {
                        setSelectedRouteId(r.id);
                        setEstimatedResult(null);
                        setEstimatedModeOverride(null);
                        setDynamicOrigin("");
                        setDynamicDestination("");
                        setSelectedOriginPlace(null);
                        setSelectedDestinationPlace(null);
                        setManualOriginText("");
                        setManualDestinationText("");
                        setDriverQuote("");
                        setNegotiatedAmount("");
                        setAiCoachResult(null);
                      }}
                      className={`relative grid w-full grid-cols-1 gap-2 px-3 py-3 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4 ${
                        isActiveRoute ? "pl-4" : "hover:bg-surface"
                      }`}
                    >
                      {isActiveRoute ? (
                        <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary" />
                      ) : null}
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className={`truncate text-xs font-semibold ${isActiveRoute ? "text-primary" : "text-foreground"}`}>{parts.from}</p>
                          {isActiveRoute ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                              <Check className="h-3 w-3" />
                              Viewing
                            </span>
                          ) : (
                            <SourceBadge label={r.source} />
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">Destination: {parts.to}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground sm:justify-end">
                        <span>{r.distance_km ? `${r.distance_km} km` : "Distance pending"}</span>
                        {primaryMode ? <span className="font-medium text-foreground">{fareTypicalLabel(primaryMode)} ₹{primaryMode.median_fare}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-surface/80 px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold tracking-tight text-foreground">No campus routes yet</p>
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  This campus has no saved student routes. Estimate a pickup and destination above, then save it to unlock quote check, split fare, coach, and fare reports for this campus.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>{estimatedResult ? "Save this estimate" : "Start with an estimate"}</span>
              </div>
            </div>
          </section>
        )}

        {/* Route Detail Tabs */}
        {selectedRoute && (
          <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
            <Card className="border-border bg-surface/95 p-3 shadow-sm sm:p-4">
              {(() => {
                const modeDetails = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                const peakEstimate = Math.round(modeDetails.median_fare * timeContext.factor);
                const isHighPeak = timeContext.factor >= 1.3;
                const isMildPeak = timeContext.factor >= 1.15;
                const modeLabel = travelModeStyle(modeDetails.mode).label;

                return (
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(290px,0.68fr)_minmax(260px,0.6fr)] xl:items-center">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Selected route</p>
                      <div className="mt-2 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                          <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground sm:text-base">
                            {selectedRouteParts?.from || "Saved route"}
                          </h2>
                        </div>
                        <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">to</span>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-success" />
                          <p className="truncate text-sm font-medium text-foreground">{selectedRouteParts?.to || "Campus"}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                        {selectedRoute.distance_km ? (
                          <span className="rounded-full border border-border bg-background px-2 py-1">{selectedRoute.distance_km} km</span>
                        ) : null}
                        {selectedRoute.duration_mins ? (
                          <span className="rounded-full border border-border bg-background px-2 py-1">{selectedRoute.duration_mins} min</span>
                        ) : null}
                        {selectedActiveMode ? (
                          <span className="rounded-full border border-border bg-background px-2 py-1">
                            {travelModeStyle(selectedActiveMode.mode).label} anchor {selectedTimeFareAnchor ? `₹${selectedTimeFareAnchor}` : ""}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-border bg-background px-2 py-1 text-foreground">{selectedRouteTrustLabel}</span>
                        <SourceBadge label={selectedActiveMode?.fare_source || selectedRoute.source} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {selectedRoute.modes.map((m) => {
                        const isActive = selectedMode === m.mode;
                        return (
                          <button
                            key={m.mode}
                            type="button"
                            onClick={() => setSelectedMode(m.mode)}
                            className={`min-h-[54px] rounded-lg border px-3 py-2 text-left transition-colors ${
                              isActive
                                ? "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/15"
                                : "border-border bg-background text-muted-foreground hover:bg-surface-raised/45 hover:text-foreground"
                            }`}
                          >
                            <span className="block text-[10px] font-semibold">{travelModeStyle(m.mode).label}</span>
                            <span className="block text-[10px]">₹{m.min_fare}–{m.max_fare}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-lg border border-border bg-background/80 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Fare timing
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold tabular-nums text-foreground">₹{peakEstimate}</span>
                            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {modeLabel}
                            </span>
                            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {timeContext.label}
                            </span>
                          </div>
                        </div>
                        <Select value={fareTimeSelection} onValueChange={(value) => setFareTimeSelection(value as TravelTimeSelection)}>
                          <SelectTrigger className="h-8 w-[96px] shrink-0 rounded-md border-border bg-surface px-2 text-[10px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background border border-border text-foreground">
                            <SelectItem value="now" className="text-xs">Now</SelectItem>
                            {TRAVEL_TIME_CHOICES.map((choice) => (
                              <SelectItem key={choice.id} value={choice.id} className="text-xs">
                                {choice.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                        {isHighPeak
                          ? "High fare risk. Prefer a pre-booked ride or travel with classmates."
                          : isMildPeak
                          ? "Mild fare risk. Use the app quote as a comparison point."
                          : "Normal fare window. Keep the counter-offer near the anchor."}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </Card>



            {/* Tab Bar */}
            <div className="flex gap-0 overflow-hidden rounded-xl border border-border bg-surface/80 shadow-sm">
              {([
                { id: "check" as const, icon: Zap, label: "Quote Check" },
                { id: "split" as const, icon: SplitSquareHorizontal, label: "Split Fare" },
                { id: "coach" as const, icon: ShieldCheck, label: "Coach" },
                { id: "reports" as const, icon: Users, label: "Reports" },
              ]).map(({ id, icon: Icon, label }, idx) => (
                <button key={id} onClick={() => setActiveDetailTab(id)}
                  className={`flex-1 py-2.5 text-[10px] font-medium transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${idx < 3 ? "border-r border-border " : ""}${activeDetailTab === id ? "bg-surface-raised text-foreground shadow-[inset_0_2px_0_var(--primary)]" : "text-muted-foreground hover:text-foreground hover:bg-surface/70"}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{label.split(" ")[0]}</span>
                </button>
              ))}
            </div>

            {/* Quote Checker Tab */}
            {activeDetailTab === "check" && (
              <Card className="space-y-5 border-border bg-surface/95 p-4 shadow-sm animate-[fadeIn_0.2s_ease-out] sm:p-5">
                <div className="flex flex-col gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-sm font-semibold tracking-tight text-foreground">Check a driver quote</h3>
                      <button
                        type="button"
                        onClick={() => setShowCheckInfo(!showCheckInfo)}
                        className="text-muted-foreground hover:text-primary transition-all p-0.5"
                        title="How is this calculated?"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                      <span className="max-w-full truncate rounded-full border border-border bg-background px-2 py-1 text-foreground">
                        {selectedRouteParts?.from || "Pickup"} to {selectedRouteParts?.to || "Destination"}
                      </span>
                      <span className="rounded-full border border-border bg-background px-2 py-1">
                        {selectedActiveMode ? travelModeStyle(selectedActiveMode.mode).label : selectedMode.split(" ")[0]}
                      </span>
                      <span className="rounded-full border border-border bg-background px-2 py-1">{timeContext.label}</span>
                      {selectedTimeFareAnchor ? (
                        <span className="rounded-full border border-border bg-background px-2 py-1 text-foreground">Anchor ₹{selectedTimeFareAnchor}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {showCheckInfo && (
                  <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-xl space-y-1.5 animate-[fadeIn_0.15s_ease-out] text-[11px] md:text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground text-[11px] md:text-xs">How the fair zone is calculated</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>We calculate road distance from mapped routes when available.</li>
                      <li>We apply transparent campus-local fare rules based on distance and city context.</li>
                      <li>Student reports improve the fare window only after enough matching reports are trusted.</li>
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] md:text-xs font-medium text-muted-foreground">Driver quote (₹)</label>
                    <Input id="input-driver-quote" type="number" placeholder="e.g. 350" value={driverQuote}
                      onChange={(e) => setDriverQuote(e.target.value)} className="bg-surface-raised border-border text-sm font-bold h-11" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] md:text-xs font-medium text-muted-foreground">{timeContext.label} range for {selectedMode.split(" ")[0]}</label>
                    <div className="h-11 bg-surface-raised border border-border rounded-lg flex items-center px-3">
                      {(() => {
                        const md = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                        return <span className="text-sm font-black text-primary font-mono">₹{Math.round(md.min_fare * timeContext.factor)} – ₹{Math.round(md.max_fare * timeContext.factor)}</span>;
                      })()}
                    </div>
                  </div>
                </div>
                {overchargeAnalysis && (
                  <div className={`rounded-xl border p-4 space-y-3 ${overchargeAnalysis.isOvercharged ? "bg-red-500/5 border-red-500/20" : overchargeAnalysis.isUndercut ? "bg-blue-500/5 border-blue-500/20" : "bg-green-500/5 border-green-500/20"}`}>
                    <div className="flex items-start gap-2.5">
                      {overchargeAnalysis.isOvercharged ? (
                        <TriangleAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                      ) : (
                        <ThumbsUp className={`h-5 w-5 shrink-0 mt-0.5 ${overchargeAnalysis.isUndercut ? "text-blue-400" : "text-green-400"}`} />
                      )}
                      <div>
                    <p className={`text-sm font-semibold tracking-tight ${overchargeAnalysis.isOvercharged ? "text-red-400" : overchargeAnalysis.isUndercut ? "text-blue-400" : "text-green-400"}`}>
                          {overchargeAnalysis.isOvercharged
                            ? `Overcharged by ₹${overchargeAnalysis.overchargeAmt} (${overchargeAnalysis.pctAboveMedian}% above normal)`
                            : overchargeAnalysis.isUndercut ? "Surprisingly cheap — double check!"
                            : "Fair Quote — This is a normal price"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {overchargeAnalysis.isOvercharged
                            ? `Normal ${selectedMode.split(" ")[0]} fare: ₹${overchargeAnalysis.normalMin}–₹${overchargeAnalysis.normalMax}. Counter-offer: ₹${overchargeAnalysis.normalMedian}.`
                            : overchargeAnalysis.isUndercut ? `Below minimum ₹${overchargeAnalysis.normalMin}. Confirm the route and mode.`
                            : `₹${overchargeAnalysis.normalMedian} typical estimate. You are in the normal range.`}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="relative h-3 bg-surface rounded-full overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-green-500/30 rounded-full"
                          style={{ width: `${Math.min(100, (overchargeAnalysis.normalMax / Math.max(parseFloat(driverQuote), overchargeAnalysis.normalMax + 50)) * 90)}%` }} />
                        <div className="absolute top-0.5 bottom-0.5 w-1.5 rounded-full bg-white shadow"
                          style={{ left: `${Math.min(95, (parseFloat(driverQuote) / Math.max(parseFloat(driverQuote), overchargeAnalysis.normalMax + 50)) * 90)}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px] md:text-xs text-muted-foreground font-bold">
                        <span>Fair zone ₹{overchargeAnalysis.normalMin}–₹{overchargeAnalysis.normalMax}</span>
                        <span>Your quote ₹{driverQuote}</span>
                      </div>
                    </div>
                    {overchargeAnalysis.isOvercharged && (
                      <div className="pt-2 border-t border-border/30">
                        <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">You negotiated it down?</p>
                        <div className="flex gap-2">
                          <Input id="input-negotiated-amount" type="number" placeholder="Amount you actually paid (₹)"
                            value={negotiatedAmount} onChange={(e) => setNegotiatedAmount(e.target.value)}
                            className="bg-background border-border text-xs h-9 flex-1" />
                          <Button id="btn-log-savings" disabled={!negotiatedAmount || logSavingsMutation.isPending} onClick={handleLogSavings}
                            className="bg-green-600 text-white hover:bg-green-500 text-[10px] md:text-xs font-bold uppercase tracking-wider h-9 shrink-0">
                            Log Savings
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Fare Window by Mode */}
                <div className="space-y-3 pt-3 border-t border-border/60">
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-xs font-semibold tracking-tight text-foreground">Fare window by mode</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedRoute.modes.map((m) => {
                      const isTarget = selectedMode.toLowerCase().includes(m.mode.toLowerCase().split(" ")[0]);
                      return (
                        <div key={m.mode} className={`p-3.5 rounded-xl border transition-all ${isTarget ? "bg-primary/5 border-primary/40" : "bg-surface-raised border-border"}`}>
                          <div className="flex justify-between items-start gap-1">
                            <p className="text-[11px] md:text-xs font-semibold text-foreground">{m.mode.split(" ")[0]}</p>
                            {isTarget && <Badge className="text-[8px] bg-primary text-primary-foreground font-bold uppercase py-0 px-1 shrink-0">Active</Badge>}
                          </div>
                          <div className="flex justify-between items-baseline mt-2">
                            <div>
                              <p className="text-[10px] md:text-xs text-muted-foreground">Expected range</p>
                              <p className="text-base font-black text-foreground font-mono">₹{m.min_fare} - ₹{m.max_fare}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] md:text-xs text-muted-foreground font-medium">Suggested anchor</p>
                              <p className="text-xs font-mono font-bold text-primary">₹{m.median_fare}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <details className="group rounded-xl border border-border bg-background/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
                    <span className="text-xs font-semibold tracking-tight text-foreground">Fare range distribution</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="space-y-3 border-t border-border px-3 py-3">
                  {selectedRoute.modes.map((m) => (
                    <div key={m.mode} className="space-y-1.5 border-b border-border/30 pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-foreground">{m.mode}</span>
                        <span className="text-xs font-black text-primary font-mono">₹{m.min_fare} – ₹{m.max_fare}</span>
                      </div>
                      <div className="relative h-2 bg-surface-raised rounded-full overflow-hidden">
                        <div className="absolute h-full bg-primary/35 rounded-full"
                          style={{ left: `${(m.min_fare / 800) * 100}%`, width: `${((m.max_fare - m.min_fare) / 800) * 100}%` }} />
                        <div className="absolute w-2 h-2 bg-white border border-primary rounded-full top-0 -translate-x-1/2"
                          style={{ left: `${(m.median_fare / 800) * 100}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px] md:text-xs text-muted-foreground font-bold">
                        <span>Min ₹{m.min_fare}</span><span>Typical ₹{m.median_fare}</span><span>Max ₹{m.max_fare}</span>
                      </div>
                    </div>
                  ))}
                  </div>
                </details>
                <div className="space-y-4 pt-4 border-t border-border/40">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-3.5 bg-primary rounded-full" />
                    <h3 className="text-xs font-semibold tracking-tight text-foreground">Route guidance</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {selectedRoute.scam_warnings && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-zinc-400">
                          <AlertOctagon className="h-4 w-4 text-red-500/70 shrink-0" />
                          <h4 className="text-xs font-semibold text-foreground">Things to watch</h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pl-5.5">{selectedRoute.scam_warnings}</p>
                      </div>
                    )}
                    {selectedRoute.cheapest_route_combo && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-zinc-400">
                          <CircleDollarSign className="h-4 w-4 text-green-500/70 shrink-0" />
                          <h4 className="text-xs font-semibold text-foreground">Cheaper option</h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pl-5.5">{selectedRoute.cheapest_route_combo}</p>
                      </div>
                    )}
                    {selectedRoute.safety_score_night && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-zinc-400">
                          <Clock className="h-4 w-4 text-blue-500/70 shrink-0" />
                          <h4 className="text-xs font-semibold text-foreground">Night safety</h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pl-5.5">{selectedRoute.safety_score_night}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Split Fare Tab */}
            {activeDetailTab === "split" && (
              <Card className="border-border bg-surface p-4 sm:p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">Split fare</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Set the group size, then compare a direct ride with a two-hop route.</p>
                  </div>
                  {splitFareData && (
                    <div className="shrink-0 sm:text-right">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Standard split</p>
                      <p className="text-3xl font-semibold tracking-tight text-primary">₹{splitFareData.perPerson}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 border-y border-border/70 py-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-medium text-muted-foreground">Transport mode</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedRoute.modes.map((m) => (
                        <button key={m.mode} onClick={() => setSplitMode(m.mode)}
                          className={`rounded-full px-3 py-1.5 text-[10px] font-medium transition-colors cursor-pointer ${splitMode === m.mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>
                          {m.mode.split(" ")[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-medium text-muted-foreground">People sharing</label>
                    <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-border bg-background">
                      {[2, 3, 4, 5].map((n, idx) => (
                        <button key={n} onClick={() => setSplitPeople(n)}
                          className={`py-2 text-sm font-semibold transition-colors cursor-pointer ${idx > 0 ? "border-l border-border" : ""} ${splitPeople === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {splitFareData && (
                  <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span>Typical total ₹{splitFareData.median} split across {splitPeople} people</span>
                    <span>Upper estimate ₹{splitFareData.max}</span>
                  </div>
                )}

                {(() => {
                  const directAutoFare = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes("auto"))?.median_fare || 150;
                  const sharedAutoFare = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes("shared"))?.median_fare || 40;
                  const splitInfo = getIntermediateData(directAutoFare, sharedAutoFare, selectedRoute.split_suggestion);
                  const directFare = splitInfo.directTotal;
                  const splitFare = splitHopMode === "shared"
                    ? (splitInfo.shared1 + splitInfo.shared2)
                    : (splitInfo.direct1 + splitInfo.direct2);
                  const savings = Math.max(0, directFare - splitFare);
                  const savingsPct = directFare > 0 ? Math.max(0, Math.round((savings / directFare) * 100)) : 0;
                  const selectedStrategyFare = splitTravelType === "split" ? splitFare : directFare;
                  const selectedStrategyPerPerson = Math.ceil(selectedStrategyFare / splitPeople);
                  const hopStyleLabel = splitHopMode === "shared" ? "Shared fixed-route autos" : "Private autos for each hop";

                  return (
                    <div className="space-y-4 border-t border-border/70 pt-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <SplitSquareHorizontal className="h-4 w-4 text-primary" />
                          <h3 className="text-xs font-semibold tracking-tight text-foreground">Ride strategy</h3>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Direct is simplest. Two-hop is only for familiar, public, busy transfer points.</p>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {[
                          {
                            id: "direct" as const,
                            title: "Direct ride",
                            price: directFare,
                            note: "One vehicle, simpler with luggage",
                          },
                          {
                            id: "split" as const,
                            title: "Two-hop route",
                            price: splitFare,
                            note: splitInfo.available ? (savings > 0 ? `Can save ₹${savings}` : "Use only if safer") : "No verified split point",
                          },
                        ].map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            disabled={option.id === "split" && !splitInfo.available}
                            onClick={() => setSplitTravelType(option.id)}
                            className={`text-left transition-colors ${
                              splitTravelType === option.id
                                ? "border-l-2 border-primary bg-primary/5 pl-3 pr-2 py-2"
                                : "border-l-2 border-border pl-3 pr-2 py-2 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold text-foreground">{option.title}</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">{option.note}</p>
                              </div>
                              <p className="shrink-0 text-sm font-semibold text-primary">₹{option.price}</p>
                            </div>
                          </button>
                        ))}
                      </div>

                      {splitTravelType === "split" && (
                        <div className="rounded-2xl bg-background/45 p-2">
                          <div className="flex flex-col gap-1 px-1 pb-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pick the hop style</p>
                            <p className="text-[10px] text-muted-foreground">This changes route cost, not group size.</p>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {[
                              {
                                value: "shared" as const,
                                title: "Shared fixed-route autos",
                                price: splitInfo.shared1 + splitInfo.shared2,
                                note: "Cheapest. Board public autos on known stretches.",
                              },
                              {
                                value: "direct_auto" as const,
                                title: "Private auto per hop",
                                price: splitInfo.direct1 + splitInfo.direct2,
                                note: "Less waiting. Negotiate two smaller rides.",
                              },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setSplitHopMode(option.value)}
                                className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                                  splitHopMode === option.value
                                    ? "bg-surface text-foreground ring-1 ring-primary/25"
                                    : "text-muted-foreground hover:bg-surface/70 hover:text-foreground"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-semibold">{option.title}</p>
                                    <p className="mt-0.5 text-[10px] leading-relaxed">{option.note}</p>
                                  </div>
                                  <span className="shrink-0 text-xs font-semibold text-primary">₹{option.price}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="overflow-hidden rounded-2xl bg-background/45">
                        {splitTravelType === "direct" ? (
                          <div className="divide-y divide-border/70">
                            {[
                              ["Start", selectedRouteParts?.from || "Pickup point"],
                              ["Ride", `Direct ${selectedMode.split(" ")[0]} for ₹${directFare}`],
                              ["End", selectedRouteParts?.to || "Destination"],
                            ].map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between gap-3 px-3.5 py-3 text-xs">
                                <span className="text-muted-foreground">{label}</span>
                                <span className="text-right font-medium text-foreground">{value}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="relative divide-y divide-border/70">
                            {[
                              ["Hop 1", `${splitInfo.leg1} for ₹${splitHopMode === "shared" ? splitInfo.shared1 : splitInfo.direct1}`],
                              ["Transfer", `Switch at ${splitInfo.stopName}`],
                              ["Hop 2", `${splitInfo.leg2} for ₹${splitHopMode === "shared" ? splitInfo.shared2 : splitInfo.direct2}`],
                            ].map(([label, value]) => (
                              <div key={label} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 px-3.5 py-3 text-xs">
                                <span className="text-muted-foreground">{label}</span>
                                <span className="font-medium text-foreground">{value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {splitTravelType === "split" && splitInfo.available ? (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Transfer point</p>
                              <p className="mt-0.5 text-sm font-semibold text-foreground">{splitInfo.stopName}</p>
                              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{splitInfo.tip}</p>
                            </div>
                            <Badge className="w-fit border border-emerald-500/20 bg-background text-[9px] text-emerald-600 dark:text-emerald-400">
                              {splitInfo.confidence || "medium"} confidence
                            </Badge>
                          </div>
                          {splitInfo.avoidWhen?.length ? (
                            <p className="mt-2 text-[10px] text-muted-foreground">
                              Avoid when: {splitInfo.avoidWhen.join(", ")}.
                            </p>
                          ) : null}
                        </div>
                      ) : !splitInfo.available ? (
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                          {splitInfo.tip}
                        </div>
                      ) : null}

                      <div className="flex flex-col gap-2 rounded-2xl bg-primary/5 px-3.5 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-foreground">
                            {splitTravelType === "split" ? hopStyleLabel : "Direct ride"} total: ₹{selectedStrategyFare}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            If {splitPeople} people share this option, each pays about ₹{selectedStrategyPerPerson}.
                          </p>
                        </div>
                        {splitTravelType === "split" && savings > 0 ? (
                          <Badge className="w-fit border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                            Saves ₹{savings}
                          </Badge>
                        ) : null}
                      </div>

                      {splitTravelType === "split" && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                          <div className="border-l-2 border-emerald-500 pl-3">
                            <p className="text-[10px] font-medium text-muted-foreground">Estimated saving</p>
                            <p className="text-lg font-semibold tracking-tight text-emerald-500">
                              {savings > 0 ? `₹${savings}` : "No saving"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{savingsPct > 0 ? `${savingsPct}% vs direct` : "Choose direct if safer"}</p>
                          </div>
                          <p className="text-[11px] leading-relaxed text-muted-foreground">{splitInfo.tip}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <p className="border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Use this estimate before booking so everyone sees the same fair share. Payment stays outside PocketBuddy.
                </p>
              </Card>
            )}

            {/* Negotiation Coach Tab */}
            {activeDetailTab === "coach" && (
              <Card className="border-border bg-surface p-4 sm:p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                {(() => {
                  const activeMode = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                  const quoteValue = parseFloat(appQuote);
                  const selectedTimeAnchor = activeMode?.median_fare ? Math.round(activeMode.median_fare * timeContext.factor) : null;
                  const quoteRatio = appQuote && !isNaN(quoteValue) && selectedTimeAnchor ? quoteValue / selectedTimeAnchor : null;
                  const quoteState = quoteRatio && quoteRatio > 1.5 ? "high" : quoteRatio && quoteRatio > 1.15 ? "mild" : quoteRatio ? "normal" : "none";

                  return (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-semibold tracking-tight text-foreground">Fare coach</h3>
                            <button
                              type="button"
                              onClick={() => setShowCoachInfo(!showCoachInfo)}
                              className="text-muted-foreground hover:text-primary transition-all p-0.5"
                              title="How this helps"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">Turn the fare anchor into a polite counter-offer you can actually say.</p>
                        </div>
                        <Badge className="w-fit border border-border bg-background text-[10px] font-medium text-muted-foreground">
                          {timeContext.label} anchor ₹{selectedTimeAnchor || "—"} from {fareSourceLabel(activeMode)}
                        </Badge>
                      </div>

                      {showCoachInfo && (
                        <div className="border-l-2 border-primary/50 pl-3 animate-[fadeIn_0.15s_ease-out] text-[11px] md:text-xs text-muted-foreground">
                          <p className="font-semibold text-foreground">What it does</p>
                          <p className="mt-1 leading-relaxed">It compares the ride-app quote you enter with the mapped fare anchor, adds your situation, then prepares a short script plus safety-aware tactics.</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
                        <div className="space-y-1.5">
                          <label className="text-[10px] md:text-xs font-medium text-muted-foreground">Ride-app quote, optional</label>
                          <Input id="input-ai-app-quote" type="number" placeholder="₹ shown in app"
                            value={appQuote} onChange={(e) => setAppQuote(e.target.value)} className="bg-background border-border text-xs h-10" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] md:text-xs font-medium text-muted-foreground">Situation</label>
                          <Input id="input-ai-situation" placeholder="Raining, luggage, late night..."
                            value={userSituation} onChange={(e) => setUserSituation(e.target.value)} className="bg-background border-border text-xs h-10" />
                        </div>
                        <Button id="btn-ask-ai-coach" onClick={handleAiCoachCall} disabled={aiCoachMutation.isPending}
                          className="h-10 bg-primary text-primary-foreground font-semibold text-xs">
                          {aiCoachMutation.isPending ? "Preparing..." : "Prepare script"}
                        </Button>
                      </div>

                      {quoteState !== "none" && (
                        <div className={`flex items-start gap-2 rounded-2xl px-3 py-2.5 ${
                          quoteState === "high"
                            ? "bg-red-500/5 text-red-400"
                            : quoteState === "mild"
                            ? "bg-amber-500/5 text-amber-400"
                            : "bg-emerald-500/5 text-emerald-500"
                        }`}>
                          {quoteState === "normal" ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                          <div>
                            <p className="text-xs font-semibold">
                              {quoteState === "high" ? "High quote" : quoteState === "mild" ? "Slightly high quote" : "Quote looks normal"}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {quoteRatio ? `${Math.round((quoteRatio - 1) * 100)}% compared with the ₹${selectedTimeAnchor} ${timeContext.label.toLowerCase()} anchor.` : null}
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedRoute.negotiation_helper && !aiCoachResult && (
                        <div className="space-y-2 border-t border-border/70 pt-4 animate-[fadeIn_0.2s_ease-out]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Quick pitch</span>
                            <button onClick={() => copyScriptToClipboard(selectedRoute.negotiation_helper)}
                              className="text-muted-foreground hover:text-foreground p-1.5 transition-all cursor-pointer">
                              {copiedScript ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <p className="max-w-2xl rounded-2xl rounded-tl-sm bg-background px-3.5 py-3 text-xs font-semibold leading-relaxed text-foreground">
                            &ldquo;{selectedRoute.negotiation_helper}&rdquo;
                          </p>
                        </div>
                      )}

                      {aiCoachResult && (
                        <div className="space-y-4 border-t border-border/70 pt-4 animate-[fadeIn_0.25s_ease-out]">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge className="bg-background border border-border text-muted-foreground text-[9px] md:text-xs py-0.5 px-1.5">
                              {aiCoachResult.source === "bedrock" ? "Context guide" : "Local fare guide"}
                            </Badge>
                            <Badge className={`font-medium text-[9px] py-0.5 px-1.5 border ${aiCoachResult.surge_factor && aiCoachResult.surge_factor > 1.1 ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"}`}>
                              {aiCoachResult.surge_factor && aiCoachResult.surge_factor > 1.0 ? `${aiCoachResult.surge_factor}x vs anchor` : appQuote ? "Quote normal" : "No app quote"}
                            </Badge>
                            {aiCoachResult.fare_anchor ? (
                              <Badge className="bg-background border border-border text-muted-foreground text-[9px] md:text-xs py-0.5 px-1.5">
                                {aiCoachResult.fare_anchor_label || "Fare anchor"} ₹{aiCoachResult.fare_anchor}
                              </Badge>
                            ) : null}
                            {aiCoachResult.report_count !== undefined && (
                              <Badge className="bg-background border border-border text-muted-foreground text-[9px] md:text-xs py-0.5 px-1.5">
                                {aiCoachResult.report_count} reports
                              </Badge>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Script to say</span>
                              <button onClick={() => copyScriptToClipboard(aiCoachResult.script)}
                                className="text-muted-foreground hover:text-foreground p-1.5 transition-all cursor-pointer">
                                {copiedScript ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                            <p className="max-w-2xl rounded-2xl rounded-tl-sm bg-background px-3.5 py-3 text-xs font-semibold leading-relaxed text-foreground">
                              &ldquo;{aiCoachResult.script}&rdquo;
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {aiCoachResult.tactics.map((tip, idx) => (
                              <div key={idx} className="border-l-2 border-primary/35 pl-3 text-xs text-foreground/85">
                                <p className="mb-1 text-[10px] font-medium text-muted-foreground">Move {idx + 1}</p>
                                <p className="leading-relaxed">{tip}</p>
                              </div>
                            ))}
                          </div>

                          {aiCoachResult.safety && (
                            <div className="rounded-2xl bg-red-500/5 px-3 py-2.5 text-[11px] md:text-xs text-foreground">
                              <span className="font-semibold text-red-400 mr-1.5">Safety:</span>
                              {aiCoachResult.safety}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </Card>
            )}

            {/* Community Reports Tab */}
            {activeDetailTab === "reports" && (
              <Card className="border-border bg-surface p-4 sm:p-5 space-y-4 animate-[fadeIn_0.2s_ease-out]">
                {(() => {
                  const reportList = (reports || []) as any[];
                  const candidateList = (reportCandidates || []) as any[];
                  const averagePaid = reportList.length
                    ? Math.round(reportList.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0) / reportList.length)
                    : null;
                  const savedTotal = reportList.reduce((sum, item) => {
                    const quote = Number(item.driver_quote || 0);
                    const paid = Number(item.amount_paid || 0);
                    return quote > paid ? sum + (quote - paid) : sum;
                  }, 0);

                  return (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold tracking-tight text-foreground">Fare ledger</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Real student-paid fares. Reports influence the model only after enough students confirm the route.
                          </p>
                        </div>
                        <Button onClick={() => setIsReportOpen(true)} className="h-9 w-full bg-primary text-primary-foreground text-xs font-semibold sm:w-auto">
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add fare
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 divide-x divide-border rounded-2xl bg-background/55 text-center">
                        <div className="px-2 py-3">
                          <p className="text-sm font-semibold text-foreground">{reportList.length}</p>
                          <p className="text-[10px] text-muted-foreground">Reports</p>
                        </div>
                        <div className="px-2 py-3">
                          <p className="text-sm font-semibold text-foreground">{averagePaid ? `₹${averagePaid}` : "—"}</p>
                          <p className="text-[10px] text-muted-foreground">Avg paid</p>
                        </div>
                        <div className="px-2 py-3">
                          <p className="text-sm font-semibold text-foreground">{savedTotal ? `₹${savedTotal}` : "—"}</p>
                          <p className="text-[10px] text-muted-foreground">Saved</p>
                        </div>
                      </div>

                      <p className="border-l-2 border-primary/40 pl-3 text-[11px] leading-relaxed text-muted-foreground">
                        One report is treated as signal, not truth. Aggregation protects the fare window from noisy or fake entries.
                      </p>

                      {reportCandidatesLoading ? (
                        <div className="rounded-2xl border border-border bg-background/45 p-3">
                          <Skeleton className="h-16" />
                        </div>
                      ) : candidateList.length ? (
                        <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-3.5">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Synced ride payments</p>
                              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                PocketBuddy found recent travel-like payments from your companion sync. Confirm only the ones that match this route.
                              </p>
                            </div>
                            <Badge className="w-fit border border-primary/20 bg-background text-[9px] text-primary">Auto-suggested</Badge>
                          </div>
                          <div className="space-y-2">
                            {candidateList.map((candidate) => (
                              <div key={candidate.transaction_id} className="flex flex-col gap-3 rounded-xl border border-border bg-background/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-xs font-semibold text-foreground">
                                    ₹{candidate.amount_paid} · {candidate.merchant || candidate.mode || "Travel payment"}
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                                    {candidate.reason || "Amount matches this route's trusted fare band."}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  disabled={confirmReportCandidateMutation.isPending}
                                  onClick={() => confirmReportCandidateMutation.mutate({
                                    transactionId: candidate.transaction_id,
                                    data: {
                                      route_id: candidate.route_id || selectedRoute.id,
                                      mode: candidate.mode || selectedMode,
                                      driver_quote: Number(candidate.driver_quote || candidate.amount_paid || 0),
                                      anonymous: true,
                                    },
                                  })}
                                  className="h-8 shrink-0 bg-primary text-primary-foreground text-[10px] font-semibold"
                                >
                                  Confirm fare
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="max-h-80 overflow-y-auto rounded-2xl bg-background/35">
                        {reportsLoading ? (
                          <div className="p-3">
                            <Skeleton className="h-16" />
                          </div>
                        ) : reportList.length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <Users className="mx-auto h-7 w-7 text-muted-foreground" />
                            <p className="mt-2 text-xs font-semibold text-foreground">No fares reported yet</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">Add the first fare after your ride so the next student has a fair anchor.</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-border/70">
                            {reportList.map((r) => (
                              <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3.5 py-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-xs font-semibold text-foreground">{r.mode.split(" ")[0]}</p>
                                    <span className="text-[10px] text-muted-foreground">{r.time_of_day}</span>
                                    {r.luggage && <Badge className="text-[8px] bg-primary/10 text-primary py-0 px-1">Luggage</Badge>}
                                    {r.counts_in_model ? (
                                      <Badge className="text-[8px] border border-emerald-500/20 bg-emerald-500/10 py-0 px-1 text-emerald-500">Trusted signal</Badge>
                                    ) : (
                                      <Badge className="text-[8px] border border-border bg-surface py-0 px-1 text-muted-foreground">Signal only</Badge>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">By {r.user_name}</p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <button
                                      disabled={voteReportMutation.isPending || r.is_own_report}
                                      onClick={() => voteReportMutation.mutate({ reportId: r.id, voteType: "up" })}
                                      className={`flex items-center gap-1 text-[9px] font-medium transition-colors cursor-pointer ${
                                        r.user_vote === "up" ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"
                                      } disabled:cursor-not-allowed disabled:opacity-50`}
                                      title={r.is_own_report ? "You cannot vote on your own report" : "Agree with this fare"}
                                    >
                                      <ThumbsUp className="h-2.5 w-2.5" />
                                      <span>{r.upvotes_count || 0} agree</span>
                                    </button>
                                    <button
                                      disabled={voteReportMutation.isPending || r.is_own_report}
                                      onClick={() => voteReportMutation.mutate({ reportId: r.id, voteType: "down" })}
                                      className={`flex items-center gap-1 text-[9px] font-medium transition-colors cursor-pointer ${
                                        r.user_vote === "down" ? "text-red-400" : "text-muted-foreground hover:text-foreground"
                                      } disabled:cursor-not-allowed disabled:opacity-50`}
                                      title={r.is_own_report ? "You cannot vote on your own report" : "Dispute this fare"}
                                    >
                                      <ThumbsDown className="h-2.5 w-2.5" />
                                      <span>{r.downvotes_count || 0} dispute</span>
                                    </button>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold tracking-tight text-foreground">₹{r.amount_paid}</p>
                                  {r.driver_quote > r.amount_paid && (
                                    <p className="mt-0.5 text-[10px] font-medium text-emerald-500">Saved ₹{r.driver_quote - r.amount_paid}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </Card>
            )}

            {selectedRoute.campus_landmark && (
              <div className="flex gap-2.5 items-center p-3.5 bg-surface border border-border rounded-xl">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div><p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest">Drop Point</p>
                  <p className="text-xs font-bold text-foreground">{selectedRoute.campus_landmark}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Use your college's official emergency contact for campus security.</p></div>
                </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={campusEditorOpen} onOpenChange={setCampusEditorOpen}>
        <DialogContent className="max-w-md border-border bg-background text-foreground">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold tracking-tight">
              Add your college
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveCustomCollege();
            }}
          >
            <p className="text-xs leading-relaxed text-muted-foreground">
              This helps PocketBuddy use the right campus area for route suggestions, campus routes, and student fare reports.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="input-custom-campus" className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                College name
              </label>
              <Input
                id="input-custom-campus"
                autoFocus
                placeholder="Enter your college name"
                value={customCollegeDraft}
                onChange={(e) => setCustomCollegeDraft(e.target.value)}
                className="h-10 rounded-md border-border bg-surface text-sm font-medium"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCampusEditorOpen(false)}
                className="h-10 rounded-md text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateCollegeMutation.isPending}
                className="h-10 rounded-md text-xs font-semibold"
              >
                {updateCollegeMutation.isPending ? "Saving" : "Save campus"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="bg-background border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold tracking-tight">Report fare paid</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePostReport} className="space-y-4">
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="text-[11px] text-muted-foreground">Route</p>
              <p className="mt-0.5 text-xs font-medium text-foreground">{selectedRouteParts?.from || "Selected route"}</p>
              {selectedRouteParts?.to ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">Destination: {selectedRouteParts.to}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Mode</label>
                <Select value={reportMode} onValueChange={setReportMode}>
                  <SelectTrigger className="bg-surface border-border text-xs h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border text-foreground">
                    {selectedRoute?.modes?.map((m: any) => (
                      <SelectItem key={m.mode} value={m.mode} className="text-xs">{m.mode}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Time</label>
                <Select value={reportTime} onValueChange={setReportTime}>
                  <SelectTrigger className="bg-surface border-border text-xs h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border text-foreground">
                    {["Morning", "Afternoon", "Evening", "Night"].map((time) => (
                      <SelectItem key={time} value={time} className="text-xs">{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Driver quote (₹)</label>
                <Input type="number" min="1" value={reportQuote} onChange={(e) => setReportQuote(e.target.value)} className="bg-surface border-border text-xs h-10" required />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Amount paid (₹)</label>
                <Input type="number" min="1" value={reportPaid} onChange={(e) => setReportPaid(e.target.value)} className="bg-surface border-border text-xs h-10" required />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReportLuggage(!reportLuggage)}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition-all ${reportLuggage ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}
              >
                With luggage
              </button>
              <button
                type="button"
                onClick={() => setReportAnonymous(!reportAnonymous)}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition-all ${reportAnonymous ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}
              >
                {reportAnonymous ? "Anonymous report" : "Campus student report"}
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Anonymous by default. Reports are used only in aggregate, and PocketBuddy shows report-backed fares only after enough trusted students confirm the same route.
            </p>

            <DialogFooter>
              <Button type="submit" disabled={submitReportMutation.isPending} className="w-full bg-primary text-primary-foreground font-semibold h-10 text-xs">
                {submitReportMutation.isPending ? "Submitting..." : "Submit report"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </AppShell>
  );
}
