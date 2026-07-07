import { createLazyFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import {
  Compass,
  Navigation,
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
  getTravelSavings,
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
}

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

const getIntermediateData = (routeName: string, college: string, fallbackDirect: number, fallbackShared: number): IntermediateStop => {
  const name = routeName.toLowerCase();
  const coll = college.toLowerCase();

  if (name.includes("station") && (coll.includes("iiitm") || coll.includes("gwalior"))) {
    return {
      stopName: "Hazira Crossing",
      leg1: "ABV-IIITM Gate 1 to Hazira Crossing",
      leg2: "Hazira Crossing to Gwalior Station",
      shared1: 15,
      shared2: 15,
      direct1: 60,
      direct2: 50,
      directTotal: fallbackDirect || 160,
      tip: "Direct autos charge a heavy premium. Shared autos run along Morena Link road to Hazira every 3 minutes for ₹15."
    };
  }

  if (name.includes("airport") && (coll.includes("iiitm") || coll.includes("gwalior"))) {
    return {
      stopName: "Gola Ka Mandir",
      leg1: "ABV-IIITM Gate 1 to Gola Ka Mandir",
      leg2: "Gola Ka Mandir to Gwalior Airport",
      shared1: 15,
      shared2: 25,
      direct1: 75,
      direct2: 120,
      directTotal: fallbackDirect || 250,
      tip: "Split the journey at Gola Ka Mandir circle to avoid high airport flat rates."
    };
  }

  // Generic fallback split stop
  const direct = fallbackDirect || 150;
  const shared = fallbackShared || 40;

  return {
    stopName: "a known public junction",
    leg1: "Start to a safe public junction",
    leg2: "Public junction to destination",
    shared1: Math.round(shared * 0.45),
    shared2: Math.round(shared * 0.45),
    direct1: Math.round(direct * 0.45),
    direct2: Math.round(direct * 0.45),
    directTotal: direct,
    tip: "Use a two-hop route only when you know the interchange is public, busy, and safe. PocketBuddy will not invent a campus-specific junction without reports."
  };
};

function getTimeOfDaySurge() {
  const h = new Date().getHours();
  if (h >= 7 && h < 10) return { label: "Morning Rush", factor: 1.2, color: "text-amber-600 dark:text-amber-400", hint: "Auto prices tend to be 15-25% higher. Compare before accepting a flat quote." };
  if (h >= 17 && h < 21) return { label: "Evening Rush", factor: 1.35, color: "text-rose-600 dark:text-red-400", hint: "Peak hour. Quotes may be higher. Consider waiting 20 min." };
  if (h >= 21 || h < 6) return { label: "Night Hours", factor: 1.15, color: "text-indigo-600 dark:text-indigo-400", hint: "Late night. Use pre-booked rides only. Avoid unknown shared autos." };
  return { label: "Off-Peak", factor: 1.0, color: "text-emerald-600 dark:text-emerald-400", hint: "Best time to travel. Normal fares apply." };
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

function routeSourceMeta(source?: string, confidence?: string) {
  if (source === "osrm_route") {
    return {
      label: "Road route",
      className: "bg-emerald-500/15 border border-emerald-500/30 text-emerald-500",
    };
  }
  return {
    label: confidence === "low" ? "Estimate" : "Mapped estimate",
    className: "bg-amber-500/15 border border-amber-500/30 text-amber-500",
  };
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
  if (mode?.fare_source === "student_reports" && sampleSize >= 3) {
    return `${sampleSize} student reports`;
  }
  return "Distance model";
}

function fareTypicalLabel(mode: any) {
  const sampleSize = Number(mode?.report_sample_size || 0);
  return mode?.fare_source === "student_reports" && sampleSize >= 3 ? "Student typical" : "Model typical";
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
      <span className="min-w-0 truncate">Use “{typedQuery}” and verify while estimating</span>
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
  const [reportAnonymous, setReportAnonymous] = useState<boolean>(false);

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
  const [showCheckInfo, setShowCheckInfo] = useState<boolean>(false);
  const [showCoachInfo, setShowCoachInfo] = useState<boolean>(false);
  const [savedRoutesOpen, setSavedRoutesOpen] = useState<boolean>(false);

  const [splitTravelType, setSplitTravelType] = useState<"direct" | "split">("split");
  const [splitHopMode, setSplitHopMode] = useState<"shared" | "direct_auto">("shared");

  const timeContext = useMemo(() => getTimeOfDaySurge(), []);

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

  const campusOptions = useMemo(() => {
    const options = [
      activeCollege,
      profile?.college_name?.trim(),
      selectedCollege.trim(),
      ...POPULAR_COLLEGES,
    ].filter((college): college is string => Boolean(college));

    return Array.from(new Set(options));
  }, [activeCollege, profile, selectedCollege]);

  const selectCollege = (college: string) => {
    const nextCollege = college.trim();
    if (!nextCollege) return;

    setSelectedCollege(nextCollege);
    setCampusEditorOpen(false);
    setSelectedRouteId("");
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
    if (!nextCollege) {
      toast.error("Enter your college name first.");
      return;
    }

    setSelectedCollege(nextCollege);
    setSelectedRouteId("");
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
    enabled: !!user && debouncedDynamicOrigin.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: () => getTravelPlaceSuggestions(debouncedDynamicOrigin, activeCollege),
  });

  const { data: destinationSuggestionData, isLoading: destinationSuggestionsLoading } = useQuery({
    queryKey: ["travel-place-suggestions", "destination", debouncedDynamicDestination, activeCollege],
    enabled: !!user && debouncedDynamicDestination.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: () => getTravelPlaceSuggestions(debouncedDynamicDestination, activeCollege),
  });

  const originSuggestions: TravelPlaceSuggestion[] = originSuggestionData?.suggestions ?? [];
  const destinationSuggestions: TravelPlaceSuggestion[] = destinationSuggestionData?.suggestions ?? [];

  useEffect(() => {
    if (routes && routes.length > 0 && (!selectedRouteId || !routes.some((r: any) => r.id === selectedRouteId))) {
      setSelectedRouteId(routes[0].id);
    } else if (routes && routes.length === 0 && selectedRouteId) {
      setSelectedRouteId("");
    }
  }, [routes, selectedRouteId]);

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["travel-reports", selectedRouteId],
    enabled: !!user && !!selectedRouteId,
    queryFn: () => getTravelReports(selectedRouteId),
  });

  const { data: savings } = useQuery({
    queryKey: ["travel-savings", user?.id],
    enabled: !!user,
    queryFn: () => getTravelSavings(),
  });

  const selectedRoute = useMemo(() => {
    if (!routes || !selectedRouteId) return null;
    return routes.find((r: any) => r.id === selectedRouteId) || null;
  }, [routes, selectedRouteId]);

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
    }
  }, [selectedRoute]);

  useEffect(() => {
    if (isReportOpen && selectedRoute?.modes?.length > 0) {
      setReportMode(selectedRoute.modes[0].mode);
    }
  }, [isReportOpen, selectedRoute]);

  const overchargeAnalysis = useMemo(() => {
    if (!selectedRoute || !driverQuote) return null;
    const modeDetails =
      selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) ||
      selectedRoute.modes[0];
    const quote = parseFloat(driverQuote);
    if (isNaN(quote) || quote <= 0) return null;
    const normalMedian = modeDetails.median_fare;
    const normalMax = modeDetails.max_fare;
    const normalMin = modeDetails.min_fare;
    const overchargeAmt = Math.max(0, quote - normalMax);
    const isOvercharged = quote > normalMax;
    const isFair = quote <= normalMax && quote >= normalMin;
    const isUndercut = quote < normalMin;
    const pctAboveMedian = Math.round(((quote - normalMedian) / normalMedian) * 100);
    return { isOvercharged, isFair, isUndercut, normalMedian, normalMax, normalMin, overchargeAmt, pctAboveMedian };
  }, [selectedRoute, selectedMode, driverQuote]);

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
      setReportAnonymous(false);
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

  const handleEstimateRoute = async () => {
    const origin = dynamicOrigin.trim();
    const destination = dynamicDestination.trim();
    if (!origin || !destination) {
      toast.error("Enter both origin and destination.");
      return;
    }
    if (origin.toLowerCase() === destination.toLowerCase()) {
      toast.error("Origin and destination must be different.");
      return;
    }
    setIsEstimating(true);
    setEstimatedResult(null);
    try {
      const result = await getTravelRouteEstimate(origin, destination, activeCollege, {
        origin_lat: selectedOriginPlace?.lat,
        origin_lon: selectedOriginPlace?.lon,
        origin_place_id: selectedOriginPlace?.place_id,
        destination_lat: selectedDestinationPlace?.lat,
        destination_lon: selectedDestinationPlace?.lon,
        destination_place_id: selectedDestinationPlace?.place_id,
      });
      setEstimatedResult(result);
    } catch (error) {
      toast.error(routeEstimateErrorMessage(error));
    } finally {
      setIsEstimating(false);
    }
  };

  const selectedRouteParts = selectedRoute ? splitRouteName(selectedRoute.name) : null;

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
        <div className="flex w-full items-center justify-end gap-3 md:w-auto md:shrink-0">
          <div className={`hidden items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider sm:flex ${timeContext.color}`}>
            <Clock className="h-3.5 w-3.5" />
            <span>{timeContext.label}</span>
          </div>
            {savings && savings.total_saved > 0 && (
              <Badge variant="outline" style={{ fontSize: 0 }} className="flex items-center gap-1 border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono font-bold text-emerald-600 dark:bg-emerald-500/5 dark:text-emerald-400">
                <TrendingDown className="h-3 w-3" />
                <span className="text-xs">Saved ₹{savings.total_saved}</span>
                Saved ₹{savings.total_saved}
              </Badge>
            )}
          </div>
        </div>

      <div className="pb-24 max-w-5xl mx-auto space-y-5">
        <Card className="relative z-10 overflow-visible rounded-xl border-border bg-surface">
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-1">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Plan a campus ride</h2>
                <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
                  Search exact places, then compare fair fares from mapped distance and student reports.
                </p>
              </div>
              <div className="lg:min-w-[286px] lg:self-start">
                <Select value={activeCollege} onValueChange={handleCampusChange}>
                  <SelectTrigger
                    id="select-campus-dropdown"
                    className="h-12 w-full rounded-lg border-border bg-background px-3 py-2 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-surface focus:ring-1 focus:ring-primary/25 lg:w-[286px] [&>span]:line-clamp-none"
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

            <div ref={routeSearchRef} className="relative z-30 overflow-visible rounded-lg border border-border bg-background p-1.5 shadow-sm">
              <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
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
                        setSelectedOriginPlace(null);
                        setManualOriginText("");
                        setOriginSuggestionsOpen(true);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleEstimateRoute()}
                      className="h-8 border-0 bg-transparent px-0 text-sm font-medium shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <PlaceSuggestionsDropdown
                      open={originSuggestionsOpen && debouncedDynamicOrigin.length >= 2}
                      loading={originSuggestionsLoading}
                      suggestions={originSuggestions}
                      query={debouncedDynamicOrigin}
                      onSelect={(suggestion) => {
                        setDynamicOrigin(suggestion.label);
                        setSelectedOriginPlace(suggestion);
                        setManualOriginText("");
                        setOriginSuggestionsOpen(false);
                      }}
                      onUseTypedPlace={() => {
                        setManualOriginText(dynamicOrigin.trim());
                        setSelectedOriginPlace(null);
                        setOriginSuggestionsOpen(false);
                      }}
                    />
                  </div>
                  {selectedOriginPlace ? (
                    <p className="mt-1 truncate text-[10px] font-medium text-primary">{selectedOriginPlace.label}</p>
                  ) : manualOriginText && manualOriginText === dynamicOrigin.trim() ? (
                    <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">Typed place · PocketBuddy will verify it while estimating</p>
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
                        setSelectedDestinationPlace(null);
                        setManualDestinationText("");
                        setDestinationSuggestionsOpen(true);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleEstimateRoute()}
                      className="h-8 border-0 bg-transparent px-0 text-sm font-medium shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <PlaceSuggestionsDropdown
                      open={destinationSuggestionsOpen && debouncedDynamicDestination.length >= 2}
                      loading={destinationSuggestionsLoading}
                      suggestions={destinationSuggestions}
                      query={debouncedDynamicDestination}
                      onSelect={(suggestion) => {
                        setDynamicDestination(suggestion.label);
                        setSelectedDestinationPlace(suggestion);
                        setManualDestinationText("");
                        setDestinationSuggestionsOpen(false);
                      }}
                      onUseTypedPlace={() => {
                        setManualDestinationText(dynamicDestination.trim());
                        setSelectedDestinationPlace(null);
                        setDestinationSuggestionsOpen(false);
                      }}
                    />
                  </div>
                  {selectedDestinationPlace ? (
                    <p className="mt-1 truncate text-[10px] font-medium text-primary">{selectedDestinationPlace.label}</p>
                  ) : manualDestinationText && manualDestinationText === dynamicDestination.trim() ? (
                    <p className="mt-1 truncate text-[10px] font-medium text-muted-foreground">Typed place · PocketBuddy will verify it while estimating</p>
                  ) : null}
                </div>

              </div>

              <div className="mt-1.5 border-t border-border/70 px-1.5 pt-2">
                <Button id="btn-estimate-route" onClick={handleEstimateRoute} disabled={isEstimating}
                  className="h-10 w-full rounded-md bg-primary px-5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-70">
                  <span className="flex items-center justify-center gap-2">
                  {isEstimating ? (
                    <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Mapping route</>
                  ) : (
                    <><Search className="h-4 w-4" />Estimate fare</>
                  )}
                  </span>
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[10px] font-medium text-muted-foreground">Try</span>
                {["Railway Station", "Airport", "Bus Stand", "City Centre"].map((q) => (
                  <button key={q} onClick={() => {
                    setDynamicOrigin(q);
                    setSelectedOriginPlace(null);
                    setOriginSuggestionsOpen(true);
                  }}
                    className="text-[10px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline">
                    {q}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span>Mapped route</span>
                <span>Fare model</span>
                <span>Reports-backed</span>
              </div>
            </div>
          </div>

          {estimatedResult && (
            <div className="border-t border-border px-4 py-4 sm:px-5 lg:px-6 animate-[fadeIn_0.25s_ease-out]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Navigation className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold tracking-tight text-foreground">
                      {estimatedResult.distance_km} km, approx {estimatedResult.duration_mins} min drive
                    </span>
                    {(() => {
                      const meta = routeSourceMeta(estimatedResult.source, estimatedResult.route_confidence);
                      return (
                        <Badge className={`text-[9px] font-medium py-0.5 px-2 ${meta.className}`}>
                          {meta.label}
                        </Badge>
                      );
                    })()}
                  </div>
                  <p className="max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
                    {estimatedResult.price_basis || "Fare range is estimated from campus-local tariff rules and computed road distance."}
                  </p>
                </div>
                <button onClick={() => {
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
                  className="h-9 shrink-0 rounded-lg border border-primary/30 bg-primary/5 px-3 text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-white">
                  Save route and open coach
                </button>
              </div>

              {estimatedResult.resolution_warning ? (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] font-medium leading-relaxed text-amber-700 dark:text-amber-300">
                  {estimatedResult.resolution_warning}
                </div>
              ) : null}

              {(estimatedResult.origin_resolved_label || estimatedResult.destination_resolved_label) ? (
                <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                  {estimatedResult.origin_resolved_label ? (
                    <span className="rounded-full bg-background px-2 py-1">From: {estimatedResult.origin_resolved_label}</span>
                  ) : null}
                  {estimatedResult.destination_resolved_label ? (
                    <span className="rounded-full bg-background px-2 py-1">To: {estimatedResult.destination_resolved_label}</span>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/50">
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
                        <p className="mt-1 text-[10px] text-muted-foreground">{fareSourceLabel(m)} · {modeStyle.note}</p>
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
            </div>
          )}
        </Card>

        {routesLoading ? (
          <section className="border-y border-border bg-surface/60 px-3 py-3 sm:rounded-2xl sm:border sm:px-4">
            <Skeleton className="h-10 rounded-xl" />
          </section>
        ) : routes && routes.length > 0 ? (
          <section className="overflow-hidden border-y border-border bg-surface/60 sm:rounded-2xl sm:border">
            <button
              type="button"
              onClick={() => setSavedRoutesOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left sm:px-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight text-foreground">Saved routes</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {routes.length} route{routes.length === 1 ? "" : "s"} saved for quick checking
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedRoute ? (
                  <Badge variant="outline" className="hidden border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                    Current route loaded
                  </Badge>
                ) : null}
                <span className="text-[11px] font-medium text-muted-foreground">{savedRoutesOpen ? "Hide" : "Show"}</span>
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
                      onClick={() => {
                        setSelectedRouteId(r.id);
                        setDriverQuote("");
                        setNegotiatedAmount("");
                        setAiCoachResult(null);
                      }}
                      className={`grid w-full grid-cols-1 gap-2 px-3 py-3 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4 ${
                        isActiveRoute ? "bg-primary/5" : "hover:bg-surface"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="truncate text-xs font-semibold text-foreground">{parts.from}</p>
                          <SourceBadge label={r.source} />
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
        ) : null}

        {/* Route Detail Tabs */}
        {selectedRoute && (
          <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Selected route</p>
                <h2 className="text-base font-semibold tracking-tight text-foreground">{selectedRouteParts?.from || "Saved route"}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Destination: {selectedRouteParts?.to || "Campus"}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedRoute.distance_km && (
                  <Badge variant="secondary" className="font-bold font-mono text-xs bg-white/5 border border-border text-foreground">{selectedRoute.distance_km} km</Badge>
                )}
                <SourceBadge label={selectedRoute.source} />
                <ConfidenceBadge confidence={selectedRoute.confidence} />
              </div>
            </div>

            {/* Transport Mode Selector */}
            <div className="flex flex-wrap gap-2">
              {selectedRoute.modes.map((m) => {
                const modeStyle = travelModeStyle(m.mode);
                const isActive = selectedMode === m.mode;
                return (
                  <button
                    key={m.mode}
                    onClick={() => setSelectedMode(m.mode)}
                    className={`rounded-xl border px-3 py-2 text-left transition-all cursor-pointer ${
                      isActive
                        ? `${modeStyle.className} ${modeStyle.textClassName} ring-1 ring-primary/20`
                        : "bg-surface border-border text-muted-foreground hover:text-foreground hover:bg-surface-raised"
                    }`}
                  >
                    <span className="block text-[10px] font-semibold">{modeStyle.label}</span>
                    <span className="block text-[10px]">₹{m.min_fare}–{m.max_fare}</span>
                  </button>
                );
              })}
            </div>

            {/* Time of day fare risk widget */}
            <Card className="bg-surface border border-border p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-xs font-semibold tracking-tight text-foreground">Fare timing</h3>
                </div>
                <span className="text-[10px] md:text-xs font-medium text-muted-foreground">Model plus reports when available</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
                {([
                  { label: "Morning Rush", time: "08:00 - 11:00", factor: 1.20, active: timeContext.label === "Morning Rush", badgeLabel: "1.2x Risk" },
                  { label: "Off-Peak", time: "11:00 - 17:00", factor: 1.0, active: timeContext.label === "Off-Peak", badgeLabel: "Baseline" },
                  { label: "Evening Rush", time: "17:00 - 21:00", factor: 1.35, active: timeContext.label === "Evening Rush", badgeLabel: "1.35x Peak" },
                  { label: "Night Hours", time: "21:00 - 08:00", factor: 1.15, active: timeContext.label === "Night Hours", badgeLabel: "1.15x Night" }
                ]).map((h) => {
                  const modeDetails = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                  const currentFare = Math.round(modeDetails.median_fare * h.factor);
                  return (
                    <div
                      key={h.label}
                      className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-2 relative overflow-hidden ${
                        h.active
                          ? "bg-surface-raised border-primary text-foreground ring-1 ring-primary/20 shadow-sm"
                          : "bg-surface border-border/60 opacity-80 hover:opacity-100 hover:bg-surface-raised/40"
                      }`}
                    >
                      {h.active && (
                          <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[8px] font-medium px-2 py-0.5 rounded-bl-lg">
                          Active
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] md:text-xs font-semibold text-foreground/90">{h.label}</p>
                        <p className="text-[9px] text-zinc-500 font-medium">{h.time}</p>
                      </div>

                      <div className="flex justify-between items-end pt-1">
                        <div>
                          <p className="text-base sm:text-xl font-semibold tracking-tight text-foreground">₹{currentFare}</p>
                          <p className="text-[9px] text-muted-foreground font-medium">Est. fare</p>
                        </div>
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border border-border bg-surface-raised text-muted-foreground">
                          {h.badgeLabel.split(" ")[0]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dynamic Live Travel Nudge Banner */}
              {(() => {
                const modeDetails = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                const peakEstimate = Math.round(modeDetails.median_fare * timeContext.factor);
                const isHighPeak = timeContext.factor >= 1.3;
                const isMildPeak = timeContext.factor >= 1.15;

                return (
                  <div className="p-4 border border-border/80 bg-surface-raised/40 rounded-2xl flex items-start gap-3 shadow-sm">
                    <div className="w-1.5 h-3.5 bg-primary rounded-full shrink-0 mt-1" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold tracking-tight text-foreground">
                        Current estimate: ₹{peakEstimate} ({selectedMode.split(" ")[0]})
                      </p>
                      <p className="text-xs text-muted-foreground/90 leading-relaxed">
                        {isHighPeak
                          ? "Peak-hour fare risk is high. Walk 100m away from crowded exits or travel with classmates to avoid inflated flat quotes."
                          : isMildPeak
                          ? "Mild peak-hour risk. Use any app quote only as a comparison point and keep your counter-offer near the fair range."
                          : "Favorable baseline fare window. Keep your counter-offer near the normal fare anchor."}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </Card>



            {/* Tab Bar */}
            <div className="flex gap-0 bg-surface rounded-xl border border-border overflow-hidden">
              {([
                { id: "check" as const, icon: Zap, label: "Quote Check" },
                { id: "split" as const, icon: SplitSquareHorizontal, label: "Split Fare" },
                { id: "coach" as const, icon: ShieldCheck, label: "Coach" },
                { id: "reports" as const, icon: Users, label: "Reports" },
              ]).map(({ id, icon: Icon, label }, idx) => (
                <button key={id} onClick={() => setActiveDetailTab(id)}
                  className={`flex-1 py-2.5 text-[10px] font-medium transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${idx < 3 ? "border-r border-border " : ""}${activeDetailTab === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{label.split(" ")[0]}</span>
                </button>
              ))}
            </div>

            {/* Quote Checker Tab */}
            {activeDetailTab === "check" && (
              <Card className="bg-surface border-border p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="flex items-center gap-1.5">
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
                    <p className="text-xs text-muted-foreground mt-0.5">Enter the price you were quoted and compare it with the current campus fare window.</p>
                  </div>
                </div>

                {showCheckInfo && (
                  <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-xl space-y-1.5 animate-[fadeIn_0.15s_ease-out] text-[11px] md:text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground text-[11px] md:text-xs">How the fair zone is calculated</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>We calculate road distance from mapped routes when available.</li>
                      <li>We apply local transport regulator tariffs (e.g. ₹60 base + ₹9.5/km).</li>
                      <li>We adjust values dynamically using live <span className="font-semibold text-primary">Student Reports</span> from your campus.</li>
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
                    <label className="text-[10px] md:text-xs font-medium text-muted-foreground">Normal range for {selectedMode.split(" ")[0]}</label>
                    <div className="h-11 bg-surface-raised border border-border rounded-lg flex items-center px-3">
                      {(() => {
                        const md = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                        return <span className="text-sm font-black text-primary font-mono">₹{md.min_fare} – ₹{md.max_fare}</span>;
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

                <div className="space-y-3 pt-2">
                  <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Fare range distribution</p>
                  {selectedRoute.modes.map((m) => (
                    <div key={m.mode} className="space-y-1.5 border-b border-border/30 pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-foreground">{m.mode}</span>
                        <span className="text-xs font-black text-primary font-mono">₹{m.min_fare} – ₹{m.max_fare}</span>
                      </div>
                      <div className="relative h-2 bg-surface-raised rounded-full overflow-hidden">
                        <div className="absolute h-full bg-gradient-to-r from-primary/60 to-amber-500/60 rounded-full"
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
                    <p className="mt-0.5 text-xs text-muted-foreground">First split the ride fairly. Then compare whether a direct ride or a two-hop route makes sense.</p>
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
                  const splitInfo = getIntermediateData(selectedRoute.name, activeCollege, directAutoFare, sharedAutoFare);
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
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Choose speed or savings. Two-hop only makes sense when the transfer point is familiar, public, and busy.</p>
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
                            title: "Two-hop saver",
                            price: splitFare,
                            note: savings > 0 ? `Can save ₹${savings}` : "Use only if safer",
                          },
                        ].map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSplitTravelType(option.id)}
                            className={`text-left transition-colors ${
                              splitTravelType === option.id
                                ? "border-l-2 border-primary bg-primary/5 pl-3 pr-2 py-2"
                                : "border-l-2 border-border pl-3 pr-2 py-2 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                            }`}
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
                              ["Ride", `Direct ${selectedMode.split(" ")[0]} · ₹${directFare}`],
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
                              ["Hop 1", `${splitInfo.leg1} · ₹${splitHopMode === "shared" ? splitInfo.shared1 : splitInfo.direct1}`],
                              ["Transfer", `Switch at ${splitInfo.stopName}`],
                              ["Hop 2", `${splitInfo.leg2} · ₹${splitHopMode === "shared" ? splitInfo.shared2 : splitInfo.direct2}`],
                            ].map(([label, value]) => (
                              <div key={label} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 px-3.5 py-3 text-xs">
                                <span className="text-muted-foreground">{label}</span>
                                <span className="font-medium text-foreground">{value}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

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
                  const quoteRatio = appQuote && !isNaN(quoteValue) && activeMode?.median_fare ? quoteValue / activeMode.median_fare : null;
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
                          Anchor ₹{activeMode?.median_fare || "—"} · {fareSourceLabel(activeMode)}
                        </Badge>
                      </div>

                      {showCoachInfo && (
                        <div className="border-l-2 border-primary/50 pl-3 animate-[fadeIn_0.15s_ease-out] text-[11px] md:text-xs text-muted-foreground">
                          <p className="font-semibold text-foreground">What it does</p>
                          <p className="mt-1 leading-relaxed">It compares the app quote you enter with the mapped fare anchor, adds your situation, then prepares a short script plus safety-aware tactics.</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
                        <div className="space-y-1.5">
                          <label className="text-[10px] md:text-xs font-medium text-muted-foreground">App quote, optional</label>
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
                              {quoteRatio ? `${Math.round((quoteRatio - 1) * 100)}% compared with the ₹${activeMode?.median_fare} anchor.` : null}
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
                            <Badge className={`font-medium text-[9px] py-0.5 px-1.5 border ${aiCoachResult.surge_factor && aiCoachResult.surge_factor > 1.1 ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"}`}>
                              {aiCoachResult.surge_factor && aiCoachResult.surge_factor > 1.0 ? `${aiCoachResult.surge_factor}x app quote` : appQuote ? "Quote normal" : "No app quote"}
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
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">By {r.user_name}</p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <button
                                      disabled={voteReportMutation.isPending}
                                      onClick={() => voteReportMutation.mutate({ reportId: r.id, voteType: "up" })}
                                      className={`flex items-center gap-1 text-[9px] font-medium transition-colors cursor-pointer ${
                                        r.user_vote === "up" ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"
                                      }`}
                                    >
                                      <ThumbsUp className="h-2.5 w-2.5" />
                                      <span>{r.upvotes_count || 0} agree</span>
                                    </button>
                                    <button
                                      disabled={voteReportMutation.isPending}
                                      onClick={() => voteReportMutation.mutate({ reportId: r.id, voteType: "down" })}
                                      className={`flex items-center gap-1 text-[9px] font-medium transition-colors cursor-pointer ${
                                        r.user_vote === "down" ? "text-red-400" : "text-muted-foreground hover:text-foreground"
                                      }`}
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
              This helps PocketBuddy use the right campus area for route suggestions, saved routes, and student fare reports.
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
                Report anonymously
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Reports are used only in aggregate. PocketBuddy starts showing report-backed fares after enough students report the same route.
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
