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
  PhoneCall,
  Map,
  ArrowRight,
  Search,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  CircleDollarSign,
  TriangleAlert,
  SplitSquareHorizontal,
  Share2,
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
  getAiTravelCoach,
  getTravelRouteEstimate,
  voteTravelReport,
  getRidePools,
  createRidePool,
  joinRidePool,
  leaveRidePool,
  completeRidePool,
  settleRidePool,
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

const getIntermediateData = (routeName: string, college: string, fallbackDirect: number, fallbackShared: number): IntermediateStop => {
  const name = routeName.toLowerCase();
  const coll = college.toLowerCase();
  
  if (name.includes("station") && (coll.includes("iiitm") || coll.includes("gwalior"))) {
    return {
      stopName: "Hazira Crossing",
      leg1: "ABV-IIITM Gate 1 ➔ Hazira Crossing",
      leg2: "Hazira Crossing ➔ Gwalior Station",
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
      leg1: "ABV-IIITM Gate 1 ➔ Gola Ka Mandir",
      leg2: "Gola Ka Mandir ➔ Gwalior Airport",
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
    stopName: "Midpoint Chowk",
    leg1: "Campus ➔ Midpoint Chowk",
    leg2: "Midpoint Chowk ➔ Destination",
    shared1: Math.round(shared * 0.45),
    shared2: Math.round(shared * 0.45),
    direct1: Math.round(direct * 0.45),
    direct2: Math.round(direct * 0.45),
    directTotal: direct,
    tip: "Auto drivers charge extra for long direct trips. Breaking it at a major junction is 15-25% cheaper."
  };
};

const formatDateTime = (dtStr: string): string => {
  if (!dtStr) return "";
  try {
    const date = new Date(dtStr);
    if (isNaN(date.getTime())) return dtStr;
    return date.toLocaleString("en-US", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  } catch (e) {
    return dtStr;
  }
};

const getInitialDateTimeLocal = (): string => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
};

function getTimeOfDaySurge() {
  const h = new Date().getHours();
  if (h >= 7 && h < 10) return { label: "Morning Rush", factor: 1.2, color: "text-amber-400", hint: "Auto prices tend to be 15-25% higher. Try booking via app." };
  if (h >= 17 && h < 21) return { label: "Evening Rush", factor: 1.35, color: "text-red-400", hint: "Peak hour. Surge pricing likely on Ola/Uber. Consider waiting 20 min." };
  if (h >= 21 || h < 6) return { label: "Night Hours", factor: 1.15, color: "text-blue-400", hint: "Late night. Use app-booked rides only. Avoid unknown shared autos." };
  return { label: "Off-Peak", factor: 1.0, color: "text-green-400", hint: "Best time to travel. Normal fares apply." };
}

function SourceBadge({ label }: { label?: string }) {
  const l = label?.toLowerCase() || "";
  if (l === "stale")
    return <Badge className="text-[8px] bg-red-500/10 border border-red-500/20 text-red-400 py-0 px-1.5 font-bold uppercase shrink-0">Stale Fares</Badge>;
  if (l === "community median" || l === "community" || l === "user_added")
    return <Badge className="text-[8px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 py-0 px-1.5 font-bold uppercase shrink-0">Community Median</Badge>;
  if (l === "recent student report" || l === "recent report")
    return <Badge className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 py-0 px-1.5 font-bold uppercase shrink-0">Recent Report</Badge>;
  if (l === "official" || l === "seeded")
    return <Badge className="text-[8px] bg-green-500/10 border border-green-500/20 text-green-400 py-0 px-1.5 font-bold uppercase shrink-0">Official</Badge>;
  return <Badge className="text-[8px] bg-zinc-700/30 border border-zinc-700/50 text-zinc-500 py-0 px-1.5 font-bold uppercase shrink-0">Estimated</Badge>;
}

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const c = confidence?.toLowerCase() || "low";
  if (c === "high") {
    return <Badge className="text-[8px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 py-0 px-1.5 font-bold uppercase shrink-0">High Trust</Badge>;
  }
  if (c === "medium") {
    return <Badge className="text-[8px] bg-blue-500/15 border border-blue-500/30 text-blue-400 py-0 px-1.5 font-bold uppercase shrink-0">Medium Trust</Badge>;
  }
  return <Badge className="text-[8px] bg-amber-500/10 border border-amber-500/25 text-amber-500/80 py-0 px-1.5 font-bold uppercase shrink-0">Low Trust</Badge>;
}

function TravelPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selectedCollege, setSelectedCollege] = useState<string>("");
  const [otherCollege, setOtherCollege] = useState<string>("");
  const [debouncedOtherCollege, setDebouncedOtherCollege] = useState<string>("");
  const [isCustomCollegeMode, setIsCustomCollegeMode] = useState<boolean>(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<string>("Auto");
  const [activeDetailTab, setActiveDetailTab] = useState<"check" | "split" | "coach" | "reports">("check");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedOtherCollege(otherCollege);
    }, 600);
    return () => clearTimeout(timer);
  }, [otherCollege]);

  const [driverQuote, setDriverQuote] = useState<string>("");
  const [negotiatedAmount, setNegotiatedAmount] = useState<string>("");
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [activeQrUpiLink, setActiveQrUpiLink] = useState<string | null>(null);

  const [splitPeople, setSplitPeople] = useState<number>(2);
  const [splitMode, setSplitMode] = useState<string>("Auto");

  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [isNewRouteOpen, setIsNewRouteOpen] = useState<boolean>(false);

  const [reportMode, setReportMode] = useState<string>("Auto");
  const [reportPaid, setReportPaid] = useState<string>("");
  const [reportQuote, setReportQuote] = useState<string>("");
  const [reportTime, setReportTime] = useState<string>("Morning");
  const [reportLuggage, setReportLuggage] = useState<boolean>(false);
  const [reportAnonymous, setReportAnonymous] = useState<boolean>(false);

  const [newRouteName, setNewRouteName] = useState<string>("");
  const [newRouteDesc, setNewRouteDesc] = useState<string>("");
  const [newRouteDistance, setNewRouteDistance] = useState<string>("");
  const [newRouteLandmark, setNewRouteLandmark] = useState<string>("Main Gate");

  const [userSituation, setUserSituation] = useState<string>("");
  const [appQuote, setAppQuote] = useState<string>("");
  const [aiCoachResult, setAiCoachResult] = useState<{
    script: string;
    tactics: string[];
    safety: string;
    source: string;
    surge_factor?: number;
    community_median?: number;
    report_count?: number;
  } | null>(null);

  const [dynamicOrigin, setDynamicOrigin] = useState<string>("");
  const [dynamicDestination, setDynamicDestination] = useState<string>("");
  const [isEstimating, setIsEstimating] = useState<boolean>(false);
  const [estimatedResult, setEstimatedResult] = useState<any>(null);
  const [showCalculator, setShowCalculator] = useState<boolean>(false);
  const [showCheckInfo, setShowCheckInfo] = useState<boolean>(false);
  const [showCoachInfo, setShowCoachInfo] = useState<boolean>(false);

  // Negotiation game state
  const [gameStep, setGameStep] = useState<number>(0); // 0: Idle, 1: Active, 2: Done
  const [gameDriverQuote, setGameDriverQuote] = useState<number>(250);
  const [gameDriverMood, setGameDriverMood] = useState<"happy" | "neutral" | "angry">("neutral");
  const [gameDriverResponse, setGameDriverResponse] = useState<string>("");
  const [gameFeedback, setGameFeedback] = useState<string>("");
  const [gameSuccess, setGameSuccess] = useState<boolean>(false);
  const [gameFinalPrice, setGameFinalPrice] = useState<number>(0);
  const [gameDriverPersonality, setGameDriverPersonality] = useState<"stubborn" | "polite" | "direct">("stubborn");
  const [gameDriverName, setGameDriverName] = useState<string>("Grumpy Bhaiya (Auto)");

  // Ride Pooling states
  const [isCreatePoolOpen, setIsCreatePoolOpen] = useState<boolean>(false);
  const [poolTime, setPoolTime] = useState<string>(getInitialDateTimeLocal());
  const [poolMode, setPoolMode] = useState<string>("Auto");
  const [poolMaxPassengers, setPoolMaxPassengers] = useState<number>(3);
  const [poolDescription, setPoolDescription] = useState<string>( "");
  const [isCompletePoolOpen, setIsCompletePoolOpen] = useState<boolean>(false);
  const [completingPoolId, setCompletingPoolId] = useState<string>("");
  const [poolFinalFare, setPoolFinalFare] = useState<string>("");
  const [poolHostUpi, setPoolHostUpi] = useState<string>("");
  const [splitTravelType, setSplitTravelType] = useState<"direct" | "split">("split");
  const [splitHopMode, setSplitHopMode] = useState<"shared" | "direct_auto">("shared");
  const [travelTimingPrompt, setTravelTimingPrompt] = useState<"unanswered" | "early_or_night" | "regular">("unanswered");

  const timeContext = useMemo(() => getTimeOfDaySurge(), []);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => getProfile(),
  });

  useEffect(() => {
    if (profile && profile.college_name && !selectedCollege) {
      if (POPULAR_COLLEGES.includes(profile.college_name)) {
        setSelectedCollege(profile.college_name);
      } else {
        setSelectedCollege("Other");
        setOtherCollege(profile.college_name);
        setIsCustomCollegeMode(true);
      }
    }
  }, [profile, selectedCollege]);

  const activeCollege = useMemo(() => {
    if (selectedCollege === "Other") return debouncedOtherCollege.trim() || "My Campus";
    return selectedCollege || profile?.college_name || "ABV-IIITM Gwalior";
  }, [selectedCollege, debouncedOtherCollege, profile]);

  const { data: routes, isLoading: routesLoading } = useQuery({
    queryKey: ["travel-routes", activeCollege, user?.id],
    enabled: !!user && !!activeCollege,
    queryFn: () => getTravelRoutes(activeCollege),
  });

  const defaultRouteIdSet = useRef(false);
  useEffect(() => {
    if (routes && routes.length > 0) {
      setSelectedRouteId(routes[0].id);
      defaultRouteIdSet.current = true;
    } else {
      setSelectedRouteId("");
    }
  }, [routes]);

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
    onError: () => toast.error("Failed to log savings."),
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
    onError: () => toast.error("Failed to submit report."),
  });

  const createRouteMutation = useMutation({
    mutationFn: createTravelRoute,
    onSuccess: (newRoute) => {
      qc.invalidateQueries({ queryKey: ["travel-routes", activeCollege] });
      toast.success("Route added successfully!");
      setIsNewRouteOpen(false);
      setSelectedRouteId(newRoute.id);
      setNewRouteName("");
      setNewRouteDesc("");
      setNewRouteDistance("");
      setNewRouteLandmark("Main Gate");
    },
    onError: () => toast.error("Failed to add route."),
  });

  const aiCoachMutation = useMutation({
    mutationFn: getAiTravelCoach,
    onSuccess: (data) => {
      setAiCoachResult(data);
      toast.success("AI negotiation script ready!");
    },
    onError: () => toast.error("Failed to get AI coach."),
  });

  const voteReportMutation = useMutation({
    mutationFn: ({ reportId, voteType }: { reportId: string; voteType: "up" | "down" }) =>
      voteTravelReport(reportId, voteType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-reports", selectedRouteId] });
      toast.success("Vote registered!");
    },
    onError: () => toast.error("Failed to register vote."),
  });

  // Ride Pooling Queries & Mutations
  const { data: ridePools, isLoading: poolsLoading } = useQuery({
    queryKey: ["ride-pools", selectedRouteId],
    enabled: !!user && !!selectedRouteId && activeDetailTab === "split",
    queryFn: () => getRidePools(selectedRouteId),
  });

  const createPoolMutation = useMutation({
    mutationFn: createRidePool,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ride-pools", selectedRouteId] });
      setIsCreatePoolOpen(false);
      setPoolDescription("");
      setPoolTime(getInitialDateTimeLocal());
      toast.success("Ride pool group published to your campus hub!");
    },
    onError: () => toast.error("Failed to create pool."),
  });

  const joinPoolMutation = useMutation({
    mutationFn: joinRidePool,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ride-pools", selectedRouteId] });
      toast.success("Successfully joined the ride pool!");
    },
    onError: () => toast.error("Failed to join pool."),
  });

  const leavePoolMutation = useMutation({
    mutationFn: leaveRidePool,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ride-pools", selectedRouteId] });
      toast.success("You left the ride pool.");
    },
    onError: () => toast.error("Failed to leave pool."),
  });

  const completePoolMutation = useMutation({
    mutationFn: completeRidePool,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ride-pools", selectedRouteId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setIsCompletePoolOpen(false);
      setPoolFinalFare("");
      toast.success("Ride pool marked complete! UPI splits are active.");
    },
    onError: () => toast.error("Failed to complete ride pool."),
  });

  const settlePoolMutation = useMutation({
    mutationFn: settleRidePool,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ride-pools", selectedRouteId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Split payment confirmed and settled!");
    },
    onError: () => toast.error("Failed to settle payment."),
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

  const handleCreateRoute = (e) => {
    e.preventDefault();
    const distanceVal = parseFloat(newRouteDistance);
    if (!newRouteName.trim()) { toast.error("Enter a route name."); return; }
    if (isNaN(distanceVal) || distanceVal <= 0) { toast.error("Enter a valid distance."); return; }
    createRouteMutation.mutate({
      data: {
        name: newRouteName.trim(),
        description: newRouteDesc.trim(),
        distance_km: distanceVal,
        campus_landmark: newRouteLandmark.trim(),
        college: activeCollege,
      },
    });
  };

  const handleAiCoachCall = () => {
    if (!selectedRoute) return;
    const parsedQuote = parseFloat(appQuote);
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
    navigator.clipboard.writeText(text);
    setCopiedScript(true);
    toast.success("Script copied! Show this to the driver.");
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleEstimateRoute = async () => {
    if (!dynamicOrigin.trim() || !dynamicDestination.trim()) {
      toast.error("Enter both origin and destination.");
      return;
    }
    setIsEstimating(true);
    setEstimatedResult(null);
    try {
      const result = await getTravelRouteEstimate(dynamicOrigin.trim(), dynamicDestination.trim());
      setEstimatedResult(result);
    } catch {
      toast.error("Failed to estimate route. Try again.");
    } finally {
      setIsEstimating(false);
    }
  };

  // Start Negotiation Game
  const startNegotiationGame = (medianFare: number) => {
    const personalities = [
      { id: "stubborn", name: "Grumpy Bhaiya (Auto)", quoteMult: 1.6, welcome: '"Arey sahib, {price} rupay se ek paisa kam nahi lagega. Sab mehenga ho gaya hai!"' },
      { id: "polite", name: "Taxi Uncle (Cab)", quoteMult: 1.4, welcome: '"Beta, {price} rupay thik toh hai, AC bhi chalega aur direct drop karenge. Sahi rate hai?"' },
      { id: "direct", name: "Direct Driver (App Auto)", quoteMult: 1.25, welcome: '"Bhaiya, high demand hai area me, ₹{price} hi standard chalega. Chalna hai?"' }
    ];
    const chosen = personalities[Math.floor(Math.random() * personalities.length)];
    const startQuote = Math.round(medianFare * chosen.quoteMult);
    
    setGameDriverPersonality(chosen.id as any);
    setGameDriverName(chosen.name);
    setGameDriverQuote(startQuote);
    setGameStep(1);
    setGameDriverMood("neutral");
    setGameDriverResponse(chosen.welcome.replace("{price}", String(startQuote)));
    setGameFeedback("");
  };

  const playNegotiationOption = (choice: string, medianFare: number) => {
    const startQuote = gameDriverQuote;
    const lowPrice = Math.round(medianFare * 0.7);
    
    if (gameDriverPersonality === "stubborn") {
      if (choice === "app") {
        setGameDriverMood("neutral");
        setGameDriverResponse(`"App to bekar hai bhaiya, abhi cancel kar dega ride... Par chalo ₹${medianFare + 20} de dena. Baitho."`);
        setGameFeedback("Anchoring with the app benchmark worked! You bypassed his stubborn quote and negotiated a fair discount.");
        setGameSuccess(true);
        setGameFinalPrice(medianFare + 20);
        setGameStep(2);
      } else if (choice === "firm") {
        setGameDriverMood("angry");
        setGameDriverResponse(`"Nahi beta, regular student honge aap, humara loss ho jayega. ₹${startQuote - 10} dena hai toh bolo."`);
        setGameFeedback("This driver is too stubborn! Appeals to standard student rates didn't shift him much. Try another tactic next time.");
        setGameSuccess(true);
        setGameFinalPrice(startQuote - 10);
        setGameStep(2);
      } else if (choice === "walk") {
        setGameDriverMood("happy");
        setGameDriverResponse(`"Arey ruko ruko bhaiya! Kahan ja rahe ho? Aao baitho, ₹${medianFare + 15} me done karte hain!"`);
        setGameFeedback("Power Move! Walking away works wonders on stubborn local drivers. You got a great fare!");
        setGameSuccess(true);
        setGameFinalPrice(medianFare + 15);
        setGameStep(2);
      } else {
        setGameDriverMood("angry");
        setGameDriverResponse(`"Chalo chalo, aage badho! ₹${lowPrice} me nahi jata koi."`);
        setGameFeedback("Too low! Offering a lowball flat fare made the driver angry and he refused to take you.");
        setGameSuccess(false);
        setGameStep(2);
      }
    } else if (gameDriverPersonality === "polite") {
      if (choice === "app") {
        setGameDriverMood("happy");
        setGameDriverResponse(`"Accha, app par ₹${medianFare} chal raha hai? Chalo aap student ho toh ₹${medianFare + 10} me done karte hain. Baithiye."`);
        setGameFeedback("Nice! The polite cab driver appreciated the app benchmark and agreed to match close to it.");
        setGameSuccess(true);
        setGameFinalPrice(medianFare + 10);
        setGameStep(2);
      } else if (choice === "firm") {
        setGameDriverMood("happy");
        setGameDriverResponse(`"Haan beta, student rate theek hai. ₹${medianFare} me chalte hain, direct campus gate drop."`);
        setGameFeedback("Emotional connection! Appealing to standard student rates worked perfectly on the friendly Taxi Uncle.");
        setGameSuccess(true);
        setGameFinalPrice(medianFare);
        setGameStep(2);
      } else if (choice === "walk") {
        setGameDriverMood("neutral");
        setGameDriverResponse(`"Koi baat nahi beta, aap doosra gaadi dekh lo."`);
        setGameFeedback("Walking away backfired! The cab driver is relaxed and didn't bother calling you back.");
        setGameSuccess(false);
        setGameStep(2);
      } else {
        setGameDriverMood("neutral");
        setGameDriverResponse(`"Nahi beta, utne me toh gas ka cost bhi nahi aayega. ₹${medianFare + 20} de do."`);
        setGameFeedback("Your offer was a bit too low, but since the driver is polite, he gave a reasonable counter-offer instead of walking away.");
        setGameSuccess(true);
        setGameFinalPrice(medianFare + 20);
        setGameStep(2);
      }
    } else { // direct
      if (choice === "app") {
        setGameDriverMood("happy");
        setGameDriverResponse(`"Haan bhaiya, app rate ₹${medianFare} dikhaye toh theek hai. Baitho."`);
        setGameFeedback("Excellent! App drivers rely on dynamic benchmarks. Showing your screen gets instant agreement.");
        setGameSuccess(true);
        setGameFinalPrice(medianFare);
        setGameStep(2);
      } else if (choice === "firm") {
        setGameDriverMood("neutral");
        setGameDriverResponse(`"Bhaiya hum log meter pe chalte hain ya seedha app pricing. Flat ₹${startQuote - 10} chaloge?"`);
        setGameFeedback("Flat student rates don't interest app drivers. A minor discount was negotiated.");
        setGameSuccess(true);
        setGameFinalPrice(startQuote - 10);
        setGameStep(2);
      } else if (choice === "walk") {
        setGameDriverMood("neutral");
        setGameDriverResponse(`"Aap doosra book kar lo bhaiya."`);
        setGameFeedback("Failed. App-cab drivers do not bargain when you walk away.");
        setGameSuccess(false);
        setGameStep(2);
      } else {
        setGameDriverMood("angry");
        setGameDriverResponse(`"Jao bhaiya doosra dekh lo."`);
        setGameFeedback("Lowballing an app-cab driver results in an instant rejection.");
        setGameSuccess(false);
        setGameStep(2);
      }
    }
  };

  return (
    <AppShell>
      {/* Page Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 mb-6 flex min-h-14 flex-col gap-2 border-b border-border bg-background/85 px-6 py-2 backdrop-blur-md md:-mx-10 md:-mt-8 md:h-14 md:flex-row md:items-center md:justify-between md:px-10 md:py-0 lg:-mx-12 lg:-mt-10 lg:px-12">
        <div className="flex w-full min-w-0 items-center gap-3 md:flex-1">
          <MobileMenuButton />
          <h1 className="flex min-w-0 items-center gap-2 text-base font-black uppercase tracking-[0.04em] text-foreground sm:text-lg">
            <Compass className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate sm:whitespace-nowrap">Campus Fare Guard</span>
          </h1>
        </div>
        <div className="flex w-full items-center justify-end gap-2 md:w-auto md:shrink-0">
          <div className={`hidden sm:flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${timeContext.color}`}>
            <Clock className="h-3.5 w-3.5" />
            <span>{timeContext.label}</span>
          </div>
          {savings && savings.total_saved > 0 && (
            <div className="flex flex-col items-end">
              <Badge variant="outline" className="flex items-center gap-1 border-green-500/20 bg-green-500/5 px-2.5 py-1 font-mono text-xs font-bold text-green-400">
                <TrendingDown className="h-3 w-3" />
                <span>Saved ₹{savings.total_saved}</span>
              </Badge>
              <span className="text-[9px] text-green-400/80 font-bold block mt-0.5 tracking-wider uppercase">
                ≈ {Math.max(1, Math.floor(savings.total_saved / 15))} cups of tapri chai! ☕
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="pb-24 max-w-5xl mx-auto space-y-5">

        {/* Time-of-Day Alert */}
        <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${timeContext.factor >= 1.3 ? "bg-red-500/5 border-red-500/20" : timeContext.factor >= 1.1 ? "bg-amber-500/5 border-amber-500/20" : "bg-green-500/5 border-green-500/20"}`}>
          <Clock className={`h-4 w-4 shrink-0 mt-0.5 ${timeContext.color}`} />
          <div className="min-w-0">
            <p className={`text-xs font-black uppercase tracking-wider ${timeContext.color}`}>
              {timeContext.label}{timeContext.factor > 1 ? ` — ~${Math.round((timeContext.factor - 1) * 100)}% price increase expected` : " — Normal fares"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{timeContext.hint}</p>
          </div>
        </div>

        {/* College + Route Selector */}
        <Card className="bg-surface border-border p-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Map className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Your Campus</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <div className="w-full sm:w-56">
                <Select value={selectedCollege} onValueChange={(v) => {
                  setSelectedCollege(v);
                  setIsCustomCollegeMode(v === "Other");
                  setSelectedRouteId("");
                }}>
                  <SelectTrigger id="select-campus-dropdown" className="bg-surface-raised border-border text-xs font-bold text-foreground h-9 w-full">
                    <SelectValue placeholder="Select campus" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border text-foreground">
                    {POPULAR_COLLEGES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs font-medium">{c}</SelectItem>
                    ))}
                    <SelectItem value="Other" className="text-xs font-medium">Other campus...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isCustomCollegeMode && (
                <Input
                  id="input-custom-campus"
                  placeholder="Type your college name..."
                  value={otherCollege}
                  onChange={(e) => setOtherCollege(e.target.value)}
                  className="bg-surface-raised border-border text-xs font-bold h-9 flex-1 animate-[fadeIn_0.2s_ease-out]"
                />
              )}
            </div>
            <Button onClick={() => setIsNewRouteOpen(true)} className="h-9 text-[10px] font-black uppercase tracking-wider bg-primary text-primary-foreground flex items-center gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" />
              Add Route
            </Button>
          </div>

          {routesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : !routes || routes.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Compass className="h-8 w-8 text-muted-foreground mx-auto animate-pulse" />
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">No routes for this campus yet</p>
              <p className="text-[11px] text-muted-foreground/60">Click Add Route to seed estimated fares for {activeCollege}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {routes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedRouteId(r.id); setDriverQuote(""); setNegotiatedAmount(""); setAiCoachResult(null); }}
                  className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${selectedRouteId === r.id ? "bg-surface-raised border-primary" : "bg-surface border-border hover:border-border/70"}`}
                >
                  {selectedRouteId === r.id && <span className="absolute top-0 left-0 w-full h-[2px] bg-primary" />}
                  <div className="flex justify-between items-start gap-1 mb-1.5">
                    <p className="text-[11px] font-black text-foreground uppercase tracking-wider truncate flex-1">{r.name.split("→")[0].trim()}</p>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <SourceBadge label={r.source} />
                      <ConfidenceBadge confidence={r.confidence} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{r.name.split("→")[1]?.trim() || activeCollege}</p>
                  {r.distance_km && (
                    <p className="text-[10px] font-mono text-primary mt-1">{r.distance_km} km away</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Free-form Route Estimator */}
        <Card className="bg-surface border-border overflow-hidden">
          <button
            onClick={() => setShowCalculator(!showCalculator)}
            className="w-full flex items-center justify-between p-3.5 hover:bg-white/5 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Search className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground truncate">Estimate Fare for Any Route</span>
              <Badge className="text-[8px] sm:text-[9px] bg-primary/10 border border-primary/20 text-primary font-bold uppercase py-0 px-1.5 shrink-0">Live</Badge>
            </div>
            <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0 pl-2">{showCalculator ? "Hide" : "Open"}</span>
          </button>

          {showCalculator && (
            <div className="px-4 pb-5 space-y-4 border-t border-border animate-[fadeIn_0.2s_ease-out]">
              <p className="text-[11px] text-muted-foreground pt-3">
                Going somewhere not in the list? Type any place and instantly see expected fares.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">From</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      id="input-dynamic-origin"
                      placeholder="e.g. Gwalior Railway Station"
                      value={dynamicOrigin}
                      onChange={(e) => setDynamicOrigin(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleEstimateRoute()}
                      className="bg-surface-raised border-border text-xs h-10 pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">To</label>
                  <div className="relative">
                    <Compass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      id="input-dynamic-destination"
                      placeholder="e.g. ABV-IIITM Gwalior"
                      value={dynamicDestination}
                      onChange={(e) => setDynamicDestination(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleEstimateRoute()}
                      className="bg-surface-raised border-border text-xs h-10 pl-9"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest self-center">Quick:</span>
                {["Railway Station", "Airport", "Bus Stand", "City Centre"].map((q) => (
                  <button key={q} onClick={() => setDynamicOrigin(q)}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-border bg-surface-raised text-muted-foreground hover:text-primary hover:border-primary/40 transition-all cursor-pointer">
                    {q}
                  </button>
                ))}
              </div>
              <Button id="btn-estimate-route" onClick={handleEstimateRoute} disabled={isEstimating}
                className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider h-10 text-xs flex items-center justify-center gap-2">
                {isEstimating ? (
                  <><span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full inline-block" />Calculating...</>
                ) : (
                  <><Search className="h-4 w-4" />Get Fare Estimate</>
                )}
              </Button>
              {estimatedResult && (
                <div className="space-y-3 animate-[fadeIn_0.25s_ease-out]">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-primary" />
                      <span className="text-xs font-black uppercase tracking-wider text-foreground">
                        {estimatedResult.distance_km} km · ~{estimatedResult.duration_mins} min drive
                      </span>
                    </div>
                    <Badge className={`text-[9px] font-bold uppercase py-0.5 px-2 ${estimatedResult.source === "google_api" ? "bg-green-500/15 border border-green-500/30 text-green-400" : "bg-amber-500/15 border border-amber-500/30 text-amber-400"}`}>
                      {estimatedResult.source === "google_api" ? "Live Google Routes" : "Smart Estimate"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {estimatedResult.modes.map((m) => (
                      <div key={m.mode} className="bg-surface-raised border border-border/60 rounded-xl p-3 space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-foreground">{m.mode.split(" ")[0]}</p>
                        <p className="text-base font-black text-primary font-mono">₹{m.min_fare}–{m.max_fare}</p>
                        <p className="text-[9px] text-muted-foreground">Median ₹{m.median_fare}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => {
                      const cheapest = estimatedResult.modes.reduce((p, c) => c.median_fare < p.median_fare ? c : p);
                      const routeName = `${dynamicOrigin} → ${dynamicDestination}`;
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
                          setAppQuote(String(cheapest.median_fare));
                          setSelectedRouteId(newRoute.id);
                          setActiveDetailTab("coach");
                          setShowCalculator(false);
                          toast.success("Route saved and loaded into AI Coach!");
                        }
                      });
                    }}
                    className="w-full h-9 text-[10px] font-black uppercase tracking-wider border border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all rounded-lg flex items-center justify-center gap-1.5 cursor-pointer">
                    <ArrowRight className="h-3.5 w-3.5" /> Save Route & Open AI Coach
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Route Detail Tabs */}
        {selectedRoute && (
          <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Selected Route</p>
                <h2 className="text-base font-black text-foreground">{selectedRoute.name}</h2>
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
              {selectedRoute.modes.map((m) => (
                <button key={m.mode} onClick={() => setSelectedMode(m.mode)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xl border transition-all cursor-pointer ${selectedMode === m.mode ? "bg-primary/10 border-primary text-primary" : "bg-surface border-border text-muted-foreground hover:text-foreground"}`}>
                  {m.mode.split(" ")[0]} · ₹{m.min_fare}–{m.max_fare}
                </button>
              ))}
            </div>

            {/* Time of Day Surge Predictor Widget */}
            <Card className="bg-surface border border-border p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary animate-pulse" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-foreground">Dynamic Surge Forecasting & Travel Times</h3>
                </div>
                <Badge className="bg-primary/10 border border-primary/20 text-primary font-mono text-[9px] px-2 py-0.5 font-bold uppercase tracking-wider">Surge Projections</Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
                {([
                  { label: "Morning Rush", time: "08:00 - 11:00", factor: 1.20, active: timeContext.label === "Morning Rush", colorClass: "text-amber-400 border-amber-500/20 bg-amber-500/5", badgeLabel: "1.2x Surge" },
                  { label: "Off-Peak", time: "11:00 - 17:00", factor: 1.0, active: timeContext.label === "Off-Peak", colorClass: "text-green-400 border-green-500/20 bg-green-500/5", badgeLabel: "Baseline" },
                  { label: "Evening Rush", time: "17:00 - 21:00", factor: 1.35, active: timeContext.label === "Evening Rush", colorClass: "text-red-400 border-red-500/20 bg-red-500/5", badgeLabel: "1.35x Peak" },
                  { label: "Night Hours", time: "21:00 - 08:00", factor: 1.15, active: timeContext.label === "Night Hours", colorClass: "text-indigo-400 border-indigo-500/20 bg-indigo-500/5", badgeLabel: "1.15x Night" }
                ]).map((h) => {
                  const modeDetails = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                  const currentFare = Math.round(modeDetails.median_fare * h.factor);
                  return (
                    <div
                      key={h.label}
                      className={`p-3 rounded-xl border transition-all flex flex-col justify-between space-y-2 relative overflow-hidden ${
                        h.active
                          ? "bg-primary/5 border-primary shadow-[0_0_15px_rgba(99,102,241,0.15)] animate-[pulse_2s_infinite]"
                          : "bg-surface-raised/40 border-border/60 opacity-85 hover:opacity-100 hover:bg-surface-raised/70"
                      }`}
                    >
                      {h.active && (
                        <div className="absolute top-0 right-0 bg-primary text-primary-foreground font-mono text-[6px] sm:text-[7px] font-black uppercase tracking-widest px-1.5 sm:px-2.5 py-0.5 rounded-bl-lg">
                          Live Now
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] sm:text-[11px] text-muted-foreground font-black uppercase tracking-wider">{h.label}</p>
                        <p className="text-[8px] sm:text-[9px] text-muted-foreground/60">{h.time}</p>
                      </div>

                      <div className="flex justify-between items-end pt-1">
                        <div>
                          <p className="text-base sm:text-xl font-mono font-black text-foreground">₹{currentFare}</p>
                          <p className="text-[7px] sm:text-[8px] text-muted-foreground/80 font-bold uppercase">Est. Fare</p>
                        </div>
                        <Badge variant="outline" className={`text-[7px] sm:text-[8px] font-bold py-0.5 px-1.5 ${h.colorClass} shrink-0`}>
                          {h.badgeLabel.split(" ")[0]}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dynamic Live Travel Nudge Banner */}
              {(() => {
                const modeDetails = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                const surgePrice = Math.round(modeDetails.median_fare * timeContext.factor);
                const isHighSurge = timeContext.factor >= 1.3;
                const isMildSurge = timeContext.factor >= 1.15;
                const bannerColor = isHighSurge
                  ? "bg-red-500/5 border-red-500/15 text-red-400"
                  : isMildSurge
                  ? "bg-amber-500/5 border-amber-500/15 text-amber-400"
                  : "bg-green-500/5 border-green-500/15 text-green-400";
                
                return (
                  <div className={`p-4 border rounded-2xl flex items-start gap-3 ${bannerColor} animate-[fadeIn_0.2s_ease-out]`}>
                    <span className="text-[10px] uppercase font-black tracking-widest shrink-0 mt-0.5 bg-background px-2.5 py-1 rounded-lg border border-current">
                      Nudge
                    </span>
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Current Surge Estimate: ₹{surgePrice} ({selectedMode.split(" ")[0]})
                      </p>
                      <p className="text-[11px] text-muted-foreground/90 leading-relaxed">
                        {isHighSurge
                          ? "Heavy peak surge pricing is active. Direct autos will quote flat rates of ₹" + Math.round(surgePrice * 1.2) + "+. Walk 100m away from the exit or pool a ride to save."
                          : isMildSurge
                          ? "Mild surge active. Auto drivers are slightly stubborn. Reference the booking app screen to anchor your price."
                          : "Favorable baseline fare window. Drivers are easily negotiated down to normal app rates."}
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
                { id: "coach" as const, icon: ShieldCheck, label: "AI Coach" },
                { id: "reports" as const, icon: Users, label: "Reports" },
              ]).map(({ id, icon: Icon, label }, idx) => (
                <button key={id} onClick={() => setActiveDetailTab(id)}
                  className={`flex-1 py-2.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${idx < 3 ? "border-r border-border " : ""}${activeDetailTab === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
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
                      <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Is This Quote Fair?</h3>
                      <button
                        type="button"
                        onClick={() => setShowCheckInfo(!showCheckInfo)}
                        className="text-muted-foreground hover:text-primary transition-all p-0.5"
                        title="How is this calculated?"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Driver quoted you a price? Enter it and we will instantly tell you if you are being overcharged.</p>
                  </div>
                </div>

                {showCheckInfo && (
                  <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-xl space-y-1.5 animate-[fadeIn_0.15s_ease-out] text-[11px] text-muted-foreground">
                    <p className="font-bold text-foreground uppercase tracking-wider text-[10px]">How we calculate the "Fair Zone":</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>We fetch the exact driving distance via the <span className="font-semibold text-primary">Distance API</span>.</li>
                      <li>We apply local transport regulator tariffs (e.g. ₹60 base + ₹9.5/km).</li>
                      <li>We adjust values dynamically using live <span className="font-semibold text-primary">Student Reports</span> from your campus.</li>
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Driver Quote (₹)</label>
                    <Input id="input-driver-quote" type="number" placeholder="e.g. 350" value={driverQuote}
                      onChange={(e) => setDriverQuote(e.target.value)} className="bg-surface-raised border-border text-sm font-bold h-11" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Normal Range for {selectedMode.split(" ")[0]}</label>
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
                        <p className={`text-sm font-black uppercase tracking-wider ${overchargeAnalysis.isOvercharged ? "text-red-400" : overchargeAnalysis.isUndercut ? "text-blue-400" : "text-green-400"}`}>
                          {overchargeAnalysis.isOvercharged
                            ? `Overcharged by ₹${overchargeAnalysis.overchargeAmt} (${overchargeAnalysis.pctAboveMedian}% above normal)`
                            : overchargeAnalysis.isUndercut ? "Surprisingly cheap — double check!"
                            : "Fair Quote — This is a normal price"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {overchargeAnalysis.isOvercharged
                            ? `Normal ${selectedMode.split(" ")[0]} fare: ₹${overchargeAnalysis.normalMin}–₹${overchargeAnalysis.normalMax}. Counter-offer: ₹${overchargeAnalysis.normalMedian}.`
                            : overchargeAnalysis.isUndercut ? `Below minimum ₹${overchargeAnalysis.normalMin}. Confirm the route and mode.`
                            : `₹${overchargeAnalysis.normalMedian} median. You are in the normal range.`}
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
                      <div className="flex justify-between text-[9px] text-muted-foreground font-bold">
                        <span>Fair zone ₹{overchargeAnalysis.normalMin}–₹{overchargeAnalysis.normalMax}</span>
                        <span>Your quote ₹{driverQuote}</span>
                      </div>
                    </div>
                    {overchargeAnalysis.isOvercharged && (
                      <div className="pt-2 border-t border-border/30">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">You negotiated it down?</p>
                        <div className="flex gap-2">
                          <Input id="input-negotiated-amount" type="number" placeholder="Amount you actually paid (₹)"
                            value={negotiatedAmount} onChange={(e) => setNegotiatedAmount(e.target.value)}
                            className="bg-background border-border text-xs h-9 flex-1" />
                          <Button id="btn-log-savings" disabled={!negotiatedAmount || logSavingsMutation.isPending} onClick={handleLogSavings}
                            className="bg-green-600 text-white hover:bg-green-500 text-[10px] font-bold uppercase tracking-wider h-9 shrink-0">
                            Log Savings
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Split-Journey Multi-hop Saver */}
                {(() => {
                  const directAutoFare = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes("auto"))?.median_fare || 150;
                  const sharedAutoFare = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes("shared"))?.median_fare || 40;
                  const splitInfo = getIntermediateData(selectedRoute.name, activeCollege, directAutoFare, sharedAutoFare);
                  const directFare = splitInfo.directTotal;
                  const splitFare = splitHopMode === "shared" 
                    ? (splitInfo.shared1 + splitInfo.shared2) 
                    : (splitInfo.direct1 + splitInfo.direct2);
                  const savings = directFare - splitFare;
                  const chaiSaved = Math.max(0, Math.floor(savings / 15));

                  return (
                    <div className="bg-background/40 border border-border/60 rounded-2xl p-4.5 space-y-4 animate-[fadeIn_0.2s_ease-out]">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <SplitSquareHorizontal className="h-4 w-4 text-primary animate-pulse" />
                          <h3 className="text-xs font-black uppercase tracking-wider text-foreground">Split-Journey (Multi-Hop) Saver</h3>
                        </div>
                        <span className="text-[8px] bg-green-500/10 text-green-400 border border-green-500/20 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Save up to {Math.round((savings / directFare) * 100)}%
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Auto drivers quote high rates for long direct trips to campus. Break your journey into two shorter hops at a major intermediate junction to save money.
                      </p>

                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border/60 pb-3">
                          {/* Split Selection Toggle */}
                          <div className="flex gap-1.5 p-1 bg-surface border border-border/80 rounded-xl w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => setSplitTravelType("direct")}
                              className={`flex-1 sm:flex-none px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${splitTravelType === "direct" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            >
                              Direct (₹{directFare})
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitTravelType("split")}
                              className={`flex-1 sm:flex-none px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${splitTravelType === "split" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            >
                              Split Hop (₹{splitFare})
                            </button>
                          </div>

                          {/* Split Mode Selection */}
                          {splitTravelType === "split" && (
                            <div className="flex gap-1.5 w-full sm:w-auto">
                              <button
                                type="button"
                                onClick={() => setSplitHopMode("shared")}
                                className={`flex-1 sm:flex-none px-2.5 py-1 text-[8px] font-bold uppercase rounded-lg border transition-all cursor-pointer ${splitHopMode === "shared" ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:text-foreground"}`}
                              >
                                Shared Auto
                              </button>
                              <button
                                type="button"
                                onClick={() => setSplitHopMode("direct_auto")}
                                className={`flex-1 sm:flex-none px-2.5 py-1 text-[8px] font-bold uppercase rounded-lg border transition-all cursor-pointer ${splitHopMode === "direct_auto" ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:text-foreground"}`}
                              >
                                Direct Auto
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Interactive Journey Flowchart */}
                        <div className="flex flex-col gap-3 py-1">
                          {splitTravelType === "direct" ? (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-surface-raised/40 p-4 border border-border/40 rounded-xl">
                              <div className="flex items-center gap-2 font-bold text-foreground">
                                <span>Campus / Hub</span>
                                <ArrowRight className="h-3 w-3 text-muted-foreground hidden sm:inline" />
                              </div>
                              <div className="text-center font-bold text-primary font-mono text-sm border-y sm:border-y-0 sm:border-x border-border/80 px-4 py-1 sm:py-0">
                                Direct Auto Trip
                                <span className="block text-[9px] text-muted-foreground">₹{directFare} flat fare</span>
                              </div>
                              <span className="font-bold text-foreground">Destination Terminal</span>
                            </div>
                          ) : (
                            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-[11px]">
                              {/* Leg 1 */}
                              <div className="flex-1 bg-surface-raised border border-border/85 rounded-xl p-3 flex flex-col justify-between space-y-1 relative">
                                <span className="text-[8px] font-black uppercase text-primary tracking-wider">Hop 1</span>
                                <p className="font-bold text-foreground">{splitInfo.leg1.split("➔")[0].trim()}</p>
                                <p className="text-[10px] text-muted-foreground">to {splitInfo.stopName}</p>
                                <p className="font-black text-primary font-mono mt-1 text-xs">₹{splitHopMode === "shared" ? splitInfo.shared1 : splitInfo.direct1}</p>
                              </div>

                              <div className="flex lg:flex-col items-center justify-center text-muted-foreground select-none py-1 lg:py-0">
                                <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-400/5 px-2 py-0.5 border border-amber-500/20 rounded-md">
                                  Change at {splitInfo.stopName}
                                </span>
                                <ArrowRight className="h-4 w-4 rotate-90 lg:rotate-0 text-muted-foreground mt-1 hidden sm:block" />
                              </div>

                              {/* Leg 2 */}
                              <div className="flex-1 bg-surface-raised border border-border/85 rounded-xl p-3 flex flex-col justify-between space-y-1">
                                <span className="text-[8px] font-black uppercase text-primary tracking-wider">Hop 2</span>
                                <p className="font-bold text-foreground">{splitInfo.stopName}</p>
                                <p className="text-[10px] text-muted-foreground">to destination terminal</p>
                                <p className="font-black text-primary font-mono mt-1 text-xs">₹{splitHopMode === "shared" ? splitInfo.shared2 : splitInfo.direct2}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {splitTravelType === "split" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                          <div className="p-3.5 bg-green-500/5 border border-green-500/15 rounded-xl flex items-center justify-between">
                            <div>
                              <p className="text-[9px] font-bold text-green-400 uppercase tracking-widest">Total Split Savings</p>
                              <p className="text-lg font-black text-green-400 font-mono">₹{savings}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Tea Cups Saved</p>
                              <p className="text-xs font-bold text-muted-foreground">
                                {chaiSaved} cups of tea
                              </p>
                            </div>
                          </div>

                          <div className="p-3 bg-surface-raised border border-border rounded-xl text-[10px] text-muted-foreground/85 leading-relaxed">
                            <span className="font-black text-foreground uppercase block text-[8px] tracking-widest mb-0.5 font-bold">Route Insider Tip</span>
                            {splitInfo.tip}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Ride-App Benchmark Side-by-Side Comparison */}
                <div className="space-y-3 pt-3 border-t border-border/60">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-xs font-black uppercase tracking-wider text-foreground">Live Ride-App Benchmarks vs. Offline Quotes</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedRoute.modes.map((m) => {
                      const isTarget = selectedMode.toLowerCase().includes(m.mode.toLowerCase().split(" ")[0]);
                      return (
                        <div key={m.mode} className={`p-3.5 rounded-xl border transition-all ${isTarget ? "bg-primary/5 border-primary/40" : "bg-surface-raised border-border"}`}>
                          <div className="flex justify-between items-start gap-1">
                            <p className="text-[11px] font-bold text-foreground uppercase tracking-wider">{m.mode.split(" ")[0]} Booking</p>
                            {isTarget && <Badge className="text-[8px] bg-primary text-primary-foreground font-bold uppercase py-0 px-1 shrink-0">Active</Badge>}
                          </div>
                          <div className="flex justify-between items-baseline mt-2">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ola/Uber Range</p>
                              <p className="text-base font-black text-foreground font-mono">₹{m.min_fare} - ₹{m.max_fare}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Counter Anchor</p>
                              <p className="text-xs font-mono font-bold text-primary">₹{m.median_fare}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Detailed Fare Distribution Ranges</p>
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
                      <div className="flex justify-between text-[9px] text-muted-foreground font-bold">
                        <span>Min ₹{m.min_fare}</span><span>Median ₹{m.median_fare}</span><span>Max ₹{m.max_fare}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedRoute.scam_warnings && (
                    <div className="p-3.5 bg-red-500/5 border border-red-500/15 rounded-xl space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5"><AlertOctagon className="h-3.5 w-3.5" /> Local Trap Alert</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{selectedRoute.scam_warnings}</p>
                    </div>
                  )}
                  {selectedRoute.cheapest_route_combo && (
                    <div className="p-3.5 bg-green-500/5 border border-green-500/15 rounded-xl space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-green-400 flex items-center gap-1.5"><CircleDollarSign className="h-3.5 w-3.5" /> Cheapest Option</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{selectedRoute.cheapest_route_combo}</p>
                    </div>
                  )}
                </div>
                {selectedRoute.safety_score_night && (
                  <div className="p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl flex gap-2.5 items-start">
                    <Clock className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                    <div><p className="text-[10px] font-black uppercase tracking-wider text-blue-400">Night Safety</p>
                    <p className="text-[11px] text-muted-foreground">{selectedRoute.safety_score_night}</p></div>
                  </div>
                )}
              </Card>
            )}

            {/* Split Fare Tab */}
            {activeDetailTab === "split" && (
              <Card className="bg-surface border-border p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Split Fare Calculator</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Going with roommates? Calculate exactly how much each person pays.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Transport Mode</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedRoute.modes.map((m) => (
                        <button key={m.mode} onClick={() => setSplitMode(m.mode)}
                          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${splitMode === m.mode ? "bg-primary/10 border-primary text-primary" : "bg-surface-raised border-border text-muted-foreground hover:text-foreground"}`}>
                          {m.mode.split(" ")[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Number of People</label>
                    <div className="flex gap-2">
                      {[2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setSplitPeople(n)}
                          className={`flex-1 py-2 font-black text-sm rounded-lg border transition-all cursor-pointer ${splitPeople === n ? "bg-primary/10 border-primary text-primary" : "bg-surface-raised border-border text-muted-foreground hover:text-foreground"}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {splitFareData && (
                  <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 text-center space-y-1">
                    <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">Each person pays</p>
                    <p className="text-4xl font-black text-primary font-mono">₹{splitFareData.perPerson}</p>
                    <p className="text-xs text-muted-foreground">Based on median fare ₹{splitFareData.median} / {splitPeople} people</p>
                    <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                      <Badge className="bg-surface-raised border border-border text-muted-foreground font-mono text-xs">Total ₹{splitFareData.median}</Badge>
                      <Badge className="bg-surface-raised border border-border text-muted-foreground font-mono text-xs">Max total ₹{splitFareData.max}</Badge>
                    </div>
                  </div>
                )}
                <div className="p-3.5 bg-surface-raised border border-border rounded-xl">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Pro Tip</p>
                  <p className="text-xs text-muted-foreground/80 leading-relaxed">Pool a cab with roommates. One person books, others pay via UPI. Saves ₹30–50 each vs separate autos.</p>
                </div>

                {/* Ride Pooling Section */}
                <div className="pt-4 border-t border-border/60 space-y-4">
                  {travelTimingPrompt === "unanswered" ? (
                    <div className="p-5 bg-surface-raised border border-border/85 rounded-2xl space-y-4 animate-[fadeIn_0.2s_ease-out]">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-primary" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Interactive Pooling Nudge</h4>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Are you travelling during early morning (4 AM – 8 AM) or late night (9 PM – 3 AM) hours? Auto prices suffer high night charges and low availability during these durations.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <Button
                          onClick={() => setTravelTimingPrompt("early_or_night")}
                          className="w-full sm:flex-1 bg-primary text-primary-foreground font-black uppercase tracking-wider text-[10px] h-9"
                        >
                          Yes, Peak / Night
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setTravelTimingPrompt("regular")}
                          className="w-full sm:flex-1 border-border text-foreground font-black uppercase tracking-wider text-[10px] h-9"
                        >
                          No, Regular Hours
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
                      {/* Interactive Advice Banner */}
                      <div className="p-4 bg-background/50 border border-border/80 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {travelTimingPrompt === "early_or_night"
                            ? "Auto and Cab prices have night charges active and direct travel is expensive. We highly recommend joining or creating a campus ride pool group below."
                            : "Baseline fare window is active. Direct travel is cheap and easily available. However, if you still want to split costs, active pools are listed below."}
                        </p>
                        <button
                          type="button"
                          onClick={() => setTravelTimingPrompt("unanswered")}
                          className="text-[9px] font-bold text-primary hover:underline uppercase tracking-wider shrink-0 cursor-pointer"
                        >
                          Change timing
                        </button>
                      </div>

                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div className="flex items-center gap-1.5">
                          <Users className="h-4 w-4 text-primary animate-pulse" />
                          <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Live Campus Ride Pools</h4>
                        </div>
                        <Button
                          onClick={() => {
                            setPoolMode(splitMode.split(" ")[0]);
                            setIsCreatePoolOpen(true);
                          }}
                          className="h-8 text-[10px] font-black uppercase tracking-wider bg-primary hover:bg-primary/95 text-primary-foreground flex items-center gap-1 shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" /> Publish Pool
                        </Button>
                      </div>

                      {poolsLoading ? (
                        <Skeleton className="h-16 rounded-xl" />
                      ) : !ridePools || ridePools.length === 0 ? (
                        <div className="p-5 border border-dashed border-border rounded-2xl text-center space-y-1.5 bg-surface-raised/40">
                          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">No active ride pools for this route</p>
                          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">Planning to head out? Create a ride pool so students at {activeCollege} can join and split fares with you!</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                          {ridePools.map((p: any) => {
                            const inPool = p.co_passengers.some((cp: any) => cp.user_id === user?.id);
                            const isHost = p.host_id === user?.id;
                            const isFull = p.co_passengers.length >= p.max_passengers;
                            
                            // Generate whatsapp copy text
                            const waMsg = `Hey! I'm pooling a ${p.mode} from campus to airport/station (${selectedRoute.name}). Departure: ${p.departure_time}. Currently ${p.co_passengers.length}/${p.max_passengers} filled. Expected split cost is around ₹${Math.ceil((splitFareData?.median || 150) / p.max_passengers)} each. Join the group on PocketBuddy!`;
                            
                            return (
                              <div key={p.id} className="p-4 bg-surface-raised border border-border/80 rounded-2xl flex flex-col gap-3 text-xs animate-[fadeIn_0.2s_ease-out]">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                  <div className="space-y-1.5 min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge className="bg-primary/10 border-primary/20 text-primary text-[8px] font-mono py-0 px-1.5 font-bold uppercase">{p.mode}</Badge>
                                      <span className="font-bold text-foreground">{p.departure_time}</span>
                                      <span className="text-[11px] text-muted-foreground font-semibold">({p.co_passengers.length}/{p.max_passengers} joined)</span>
                                    </div>
                                    {p.description && <p className="text-[11px] text-muted-foreground italic">"{p.description}"</p>}
                                    <div className="space-y-1.5 pt-1.5 border-t border-border/30 mt-2">
                                      <p className="text-[9px] text-muted-foreground uppercase font-black tracking-widest">Seat Occupancy Map</p>
                                      <div className="flex gap-2 flex-wrap pt-0.5">
                                        {/* Host Seat */}
                                        <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary rounded-lg py-1 px-2.5 text-[10px] font-bold">
                                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                          <span>{p.host_name.split(" ")[0]} (Host)</span>
                                        </div>
                                        
                                        {/* Co-Passenger Seats */}
                                        {Array.from({ length: p.max_passengers - 1 }).map((_, idx) => {
                                          const passenger = p.co_passengers.filter((cp: any) => cp.user_id !== p.host_id)[idx];
                                          if (passenger) {
                                            return (
                                              <div key={idx} className="flex items-center gap-1.5 bg-zinc-800 border border-border text-foreground rounded-lg py-1 px-2.5 text-[10px] font-bold">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                <span>{passenger.full_name.split(" ")[0]}</span>
                                              </div>
                                            );
                                          } else {
                                            return (
                                              <div key={idx} className="flex items-center gap-1.5 bg-surface/50 border border-dashed border-border/60 text-muted-foreground/60 rounded-lg py-1 px-2.5 text-[10px] font-medium select-none">
                                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                                                <span>Available</span>
                                              </div>
                                            );
                                          }
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="flex gap-2 w-full md:w-auto justify-end items-center shrink-0">
                                    {p.host_phone && !isHost && inPool && (
                                      <a
                                        href={`https://wa.me/91${p.host_phone}?text=${encodeURIComponent(
                                          `Hey ${p.host_name.split(" ")[0]}, I've joined your ride pool group on PocketBuddy for ${selectedRoute.name} departing at ${p.departure_time}. Let's coordinate!`
                                        )}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="h-8 px-2.5 rounded-lg border border-green-600/35 bg-green-500/5 hover:bg-green-500/10 text-green-400 font-bold uppercase tracking-wider text-[10px] flex items-center justify-center gap-1 transition-all cursor-pointer"
                                      >
                                        Coordinate
                                      </a>
                                    )}
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(waMsg);
                                        toast.success("Ride pool invite link copied! Paste to WhatsApp groups.");
                                      }}
                                      className="h-8 w-8 rounded-lg border border-border bg-surface hover:bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all shrink-0 cursor-pointer"
                                      title="Share invitation pitch"
                                    >
                                      <Share2 className="h-3.5 w-3.5" />
                                    </button>
                                    
                                    {p.status === "completed" ? (
                                      <Badge className="bg-green-500/10 text-green-400 border border-green-500/20 font-bold uppercase text-[9px] py-1 px-2 shrink-0">
                                        Ride Finalized
                                      </Badge>
                                    ) : (
                                      <>
                                        {isHost && (
                                          <Button
                                            onClick={() => {
                                              setCompletingPoolId(p.id);
                                              setPoolFinalFare(String(splitFareData?.median || 150));
                                              setIsCompletePoolOpen(true);
                                            }}
                                            className="h-8 text-[10px] font-black uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white shrink-0"
                                          >
                                            Finalize & Split
                                          </Button>
                                        )}
                                        {inPool ? (
                                          <Button
                                            variant="outline"
                                            onClick={() => leavePoolMutation.mutate(p.id)}
                                            disabled={leavePoolMutation.isPending}
                                            className="h-8 text-[10px] font-black uppercase tracking-wider border-red-500/30 text-red-400 bg-red-500/5 hover:bg-red-500/10 shrink-0"
                                          >
                                            {isHost ? "Cancel" : "Leave"}
                                          </Button>
                                        ) : (
                                          <Button
                                            onClick={() => joinPoolMutation.mutate(p.id)}
                                            disabled={isFull || joinPoolMutation.isPending}
                                            className="h-8 text-[10px] font-black uppercase tracking-wider bg-green-600 hover:bg-green-500 text-white shrink-0"
                                          >
                                            {isFull ? "Full" : "Join"}
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
    
                                {p.status === "completed" && p.splits && (
                                  <div className="w-full bg-background/50 border border-border/60 rounded-xl p-3 space-y-2.5">
                                    <div className="flex justify-between items-center text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                                      <span>Split Ledger (₹{p.split_amount} each)</span>
                                      <span className="text-primary font-mono">Total Paid: ₹{p.final_amount}</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {p.splits.map((sp: any) => {
                                        const isSelfPassenger = sp.user_id === user?.id;
                                        const isPending = sp.status === "pending";
                                        return (
                                          <div key={sp.user_id} className="flex justify-between items-center text-xs p-2 bg-surface rounded-lg border border-border/40 gap-2 min-w-0">
                                            <span className="font-semibold text-foreground truncate min-w-0">{sp.full_name}</span>
                                            {isPending ? (
                                              <div className="flex items-center gap-1.5 shrink-0">
                                                {isHost ? (
                                                  <div className="flex items-center gap-1 shrink-0">
                                                    <Button
                                                      onClick={() => settlePoolMutation.mutate({ poolId: p.id, data: { passenger_user_id: sp.user_id } })}
                                                      disabled={settlePoolMutation.isPending}
                                                      className="h-6 text-[8px] font-black uppercase tracking-widest bg-green-600 hover:bg-green-500 text-white py-0.5 px-2 shrink-0"
                                                    >
                                                      Confirm Paid
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      onClick={() => setActiveQrUpiLink(sp.upi_link)}
                                                      className="h-6 w-6 p-0 bg-surface border border-border text-muted-foreground hover:text-foreground text-[8px] font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer shrink-0"
                                                      title="Show QR Code"
                                                    >
                                                      QR
                                                    </Button>
                                                  </div>
                                                ) : isSelfPassenger ? (
                                                  <div className="flex items-center gap-1 shrink-0">
                                                    <a
                                                      href={sp.upi_link}
                                                      className="h-6 text-[8px] font-black uppercase tracking-widest bg-primary hover:bg-primary/90 text-primary-foreground py-1 px-2 rounded-md flex items-center justify-center transition-all shadow-sm shrink-0"
                                                      title="Open GPay / PhonePe / Paytm"
                                                    >
                                                      Pay ₹{sp.amount}
                                                    </a>
                                                    <Button
                                                      type="button"
                                                      onClick={() => setActiveQrUpiLink(sp.upi_link)}
                                                      className="h-6 w-6 p-0 bg-surface border border-border text-muted-foreground hover:text-foreground text-[8px] font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer shrink-0"
                                                      title="Show QR Code"
                                                    >
                                                      QR
                                                    </Button>
                                                  </div>
                                                ) : (
                                                  <div className="flex items-center gap-1 shrink-0">
                                                    <Badge variant="outline" className="text-[8px] font-bold text-amber-400 border-amber-500/30 bg-amber-500/5 py-1 shrink-0">
                                                      Unsettled
                                                    </Badge>
                                                    <Button
                                                      type="button"
                                                      onClick={() => setActiveQrUpiLink(sp.upi_link)}
                                                      className="h-6 w-6 p-0 bg-surface border border-border text-muted-foreground hover:text-foreground text-[8px] font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer shrink-0"
                                                      title="Show QR Code"
                                                    >
                                                      QR
                                                    </Button>
                                                  </div>
                                                )}
                                              </div>
                                            ) : (
                                              <Badge variant="outline" className="text-[8px] font-bold text-green-400 border-green-500/30 bg-green-500/5 shrink-0">
                                                Settled
                                              </Badge>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* AI Coach Tab */}
            {activeDetailTab === "coach" && (
              <Card className="bg-surface border-border p-5 space-y-5 animate-[fadeIn_0.2s_ease-out]">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-black uppercase tracking-wider text-foreground">AI Negotiation Coach</h3>
                      <button
                        type="button"
                        onClick={() => setShowCoachInfo(!showCoachInfo)}
                        className="text-muted-foreground hover:text-primary transition-all p-0.5"
                        title="How this helps"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Get a Hindi script tailored to your exact situation and route.</p>
                  </div>
                  {aiCoachResult && (
                    <Badge className={`text-[9px] font-bold uppercase py-0.5 px-2 ${aiCoachResult.source === "bedrock" ? "bg-primary/20 border border-primary/30 text-primary" : "bg-white/5 border border-border text-muted-foreground"}`}>
                      {aiCoachResult.source === "bedrock" ? "Bedrock AI" : "Local Script"}
                    </Badge>
                  )}
                </div>

                {showCoachInfo && (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-1.5 animate-[fadeIn_0.15s_ease-out] text-[11px] text-muted-foreground">
                    <p className="font-bold text-foreground uppercase tracking-wider text-[10px]">What the Coach does:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Translates target fair prices into street-smart, polite Hindi scripts.</li>
                      <li>Incorporate specific contexts like heavy luggage, pouring rain, or night safety.</li>
                      <li>Detects Ola/Uber surge rates and advises if you should counter-offer or wait.</li>
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ola/Uber App Price (₹)</label>
                    <Input id="input-ai-app-quote" type="number" placeholder="What is the app showing now?"
                      value={appQuote} onChange={(e) => setAppQuote(e.target.value)} className="bg-surface-raised border-border text-xs h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Your Situation (Optional)</label>
                    <Input id="input-ai-situation" placeholder="e.g. Raining, heavy bags, late night..."
                      value={userSituation} onChange={(e) => setUserSituation(e.target.value)} className="bg-surface-raised border-border text-xs h-10" />
                  </div>
                </div>
                {appQuote && selectedRoute && (() => {
                  const md = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                  const surgeFactor = parseFloat(appQuote) / md.median_fare;
                  if (surgeFactor > 1.15) return (
                    <div className={`p-3 rounded-xl border flex items-start gap-2 ${surgeFactor > 1.5 ? "bg-red-500/5 border-red-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
                      <TriangleAlert className={`h-4 w-4 shrink-0 mt-0.5 ${surgeFactor > 1.5 ? "text-red-400" : "text-amber-400"}`} />
                      <div>
                        <p className={`text-xs font-black ${surgeFactor > 1.5 ? "text-red-400" : "text-amber-400"}`}>
                          {surgeFactor > 1.5 ? "High Surge Detected" : "Mild Surge"} — {Math.round(surgeFactor * 100 - 100)}% above community median (₹{md.median_fare})
                        </p>
                        <p className="text-[11px] text-muted-foreground">{surgeFactor > 1.5 ? "Consider waiting 15–20 min or use a shared auto." : `Counter with ₹${md.median_fare} as your anchor.`}</p>
                      </div>
                    </div>
                  );
                  return null;
                })()}
                <Button id="btn-ask-ai-coach" onClick={handleAiCoachCall} disabled={aiCoachMutation.isPending}
                  className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider h-10 text-xs">
                  {aiCoachMutation.isPending ? "Generating script..." : "Get Negotiation Script"}
                </Button>
                {selectedRoute.negotiation_helper && !aiCoachResult && (
                  <div className="bg-surface-raised border border-border/80 rounded-2xl p-4.5 space-y-3 relative overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Suggested Pitch</span>
                      <button onClick={() => copyScriptToClipboard(selectedRoute.negotiation_helper)}
                        className="text-muted-foreground hover:text-foreground p-1.5 bg-surface border border-border rounded-md transition-all cursor-pointer">
                        {copiedScript ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="relative bg-background border border-border/60 rounded-xl rounded-tl-none p-3.5 max-w-[90%]">
                      <p className="text-xs font-bold text-foreground leading-relaxed italic pr-2">&ldquo;{selectedRoute.negotiation_helper}&rdquo;</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Tap the copy icon to copy the local campus counter-offer script.</p>
                  </div>
                )}
                {aiCoachResult && (
                  <div className="space-y-3.5 animate-[fadeIn_0.25s_ease-out]">
                    {aiCoachResult.surge_factor !== undefined && (
                      <div className="flex flex-wrap gap-1.5">
                        <Badge className={`font-mono font-bold text-[9px] py-0.5 px-1.5 border ${aiCoachResult.surge_factor > 1.1 ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-green-500/20 border-green-500/30 text-green-400"}`}>
                          {aiCoachResult.surge_factor > 1.0 ? `${aiCoachResult.surge_factor}x surge` : "No surge"}
                        </Badge>
                        {aiCoachResult.community_median && (
                          <Badge className="bg-white/5 border border-border text-muted-foreground font-mono text-[9px] py-0.5 px-1.5">
                            Community median ₹{aiCoachResult.community_median}
                          </Badge>
                        )}
                        {aiCoachResult.report_count !== undefined && (
                          <Badge className="bg-white/5 border border-border text-muted-foreground text-[9px] py-0.5 px-1.5">
                            {aiCoachResult.report_count} student reports
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="bg-surface-raised border border-border/80 rounded-2xl p-4.5 space-y-3 relative overflow-hidden">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">AI Negotiator Says</span>
                        <button onClick={() => copyScriptToClipboard(aiCoachResult.script)}
                          className="text-muted-foreground hover:text-foreground p-1.5 bg-surface border border-border rounded-md transition-all cursor-pointer">
                          {copiedScript ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <div className="relative bg-background border border-border/60 rounded-xl rounded-tl-none p-3.5 max-w-[90%]">
                        <p className="text-xs font-bold text-foreground leading-relaxed italic pr-2">&ldquo;{aiCoachResult.script}&rdquo;</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Tap the copy icon to copy the generated script to show the driver.</p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Tactical Tips</p>
                      <ul className="space-y-1.5">
                        {aiCoachResult.tactics.map((tip, idx) => (
                          <li key={idx} className="flex gap-2 items-start text-xs text-foreground/80">
                            <span className="text-primary mt-0.5 shrink-0">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {aiCoachResult.safety && (
                      <div className="p-3 bg-red-500/5 border border-red-500/15 rounded-lg text-[11px] text-foreground">
                        <span className="font-bold text-red-400 uppercase tracking-wide mr-1.5">Safety:</span>
                        {aiCoachResult.safety}
                      </div>
                    )}
                  </div>
                )}

                {/* Negotiation Roleplay Simulator Game */}
                <div className="pt-4 border-t border-border/60 space-y-4">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground">Practice Pitch: Counter-Offer Simulator</h4>
                  </div>
                  {gameStep === 0 ? (
                    <div className="p-4 bg-surface-raised border border-border rounded-xl text-center space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Think you can negotiate well? Try this quick chat simulator with a local auto driver to test your counter-offer anchors!
                      </p>
                      <Button
                        onClick={() => {
                          const md = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                          startNegotiationGame(md.median_fare);
                        }}
                        className="bg-primary hover:bg-primary/95 text-[10px] font-black uppercase tracking-wider px-4 py-1.5 h-8 mx-auto"
                      >
                        Start Simulator Game
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-surface-raised border border-border rounded-xl p-4.5 space-y-3 animate-[fadeIn_0.2s_ease-out]">
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-muted-foreground uppercase">Negotiating with:</span>
                          <span className="text-xs font-bold text-foreground">{gameDriverName}</span>
                        </div>
                        <Badge className={`text-[9px] font-bold uppercase ${
                          gameDriverMood === "happy" ? "bg-green-500/10 border-green-500/20 text-green-400" :
                          gameDriverMood === "neutral" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                          "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}>
                          {gameDriverMood === "happy" ? "Agreeable" : gameDriverMood === "neutral" ? "Stubborn" : "Angry"}
                        </Badge>
                      </div>

                      {/* Driver Dialogue */}
                      <div className="bg-background border border-border/60 rounded-xl rounded-tl-none p-3 max-w-[85%] text-xs font-mono text-foreground leading-relaxed">
                        {gameDriverResponse}
                      </div>

                      {/* Student Dialogue Options */}
                      {gameStep === 1 && (
                        <div className="space-y-2 pt-2">
                          <p className="text-[9px] text-muted-foreground uppercase font-bold">Pick your negotiation tactic:</p>
                          <div className="flex flex-col gap-2">
                            {(() => {
                              const md = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) || selectedRoute.modes[0];
                              return (
                                <>
                                  <button
                                    onClick={() => playNegotiationOption("app", md.median_fare)}
                                    className="text-left w-full p-2.5 rounded-lg border border-border bg-surface hover:border-primary transition-all text-xs text-foreground cursor-pointer"
                                  >
                                    <span className="text-indigo-400 font-bold block text-[9px] uppercase tracking-wider mb-0.5">App Benchmark</span>
                                    <span>"Bhaiya, app par ₹{md.median_fare} dikha raha hai, chalo na."</span>
                                  </button>
                                  <button
                                    onClick={() => playNegotiationOption("firm", md.median_fare)}
                                    className="text-left w-full p-2.5 rounded-lg border border-border bg-surface hover:border-primary transition-all text-xs text-foreground cursor-pointer"
                                  >
                                    <span className="text-green-400 font-bold block text-[9px] uppercase tracking-wider mb-0.5">Student rate appeal</span>
                                    <span>"Regular student rate ₹{md.median_fare + 10} chalo, daily ka hai."</span>
                                  </button>
                                  <button
                                    onClick={() => playNegotiationOption("walk", md.median_fare)}
                                    className="text-left w-full p-2.5 rounded-lg border border-border bg-surface hover:border-primary transition-all text-xs text-foreground cursor-pointer"
                                  >
                                    <span className="text-amber-400 font-bold block text-[9px] uppercase tracking-wider mb-0.5">Power Move (Walk Away)</span>
                                    <span>"[Walk Away] Acha theek hai, main koi doosri auto dekh leta hoon."</span>
                                  </button>
                                  <button
                                    onClick={() => playNegotiationOption("low", md.median_fare)}
                                    className="text-left w-full p-2.5 rounded-lg border border-border bg-surface hover:border-primary transition-all text-xs text-foreground cursor-pointer"
                                  >
                                    <span className="text-red-400 font-bold block text-[9px] uppercase tracking-wider mb-0.5">Lowball offer</span>
                                    <span>"₹{Math.round(md.median_fare * 0.7)} chaloge kya?"</span>
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Game Feedback & Finished state */}
                      {gameStep === 2 && (
                        <div className="space-y-3 pt-2 border-t border-border/30 animate-[fadeIn_0.2s_ease-out]">
                          <p className="text-xs text-muted-foreground">{gameFeedback}</p>
                          {gameSuccess && (
                            <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-xl text-center">
                              <p className="text-[10px] font-bold text-green-400 uppercase">You Negotiated Successfully!</p>
                              <p className="text-lg font-black text-foreground font-mono mt-1">₹{gameFinalPrice}</p>
                            </div>
                          )}
                          <Button
                            onClick={() => setGameStep(0)}
                            className="w-full bg-white/5 border border-border text-foreground hover:bg-white/10 text-[10px] font-black uppercase tracking-wider h-8"
                          >
                            Play Again
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Community Reports Tab */}
            {activeDetailTab === "reports" && (
              <Card className="bg-surface border-border p-5 space-y-4 animate-[fadeIn_0.2s_ease-out]">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Community Reports</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{reports ? reports.length + " real fare" + (reports.length !== 1 ? "s" : "") + " reported by students" : "Real fares paid by students"}</p>
                  </div>
                  <Button onClick={() => setIsReportOpen(true)} className="h-8 text-[10px] font-black uppercase tracking-wider bg-white/5 border border-border hover:bg-white/10 text-foreground flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Report Your Fare
                  </Button>
                </div>
                <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl text-[11px] text-muted-foreground">
                  Every fare you report updates the live community median — making this more accurate for every student who comes after you.
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {reportsLoading ? (
                    <Skeleton className="h-16" />
                  ) : !reports || reports.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <Users className="h-8 w-8 text-muted-foreground mx-auto" />
                      <p className="text-xs text-muted-foreground font-bold">No reports yet — be the first!</p>
                      <p className="text-[11px] text-muted-foreground/60">Your report helps the next student avoid getting overcharged.</p>
                    </div>
                  ) : (
                    reports.map((r) => (
                      <div key={r.id} className="p-3 bg-surface-raised rounded-xl border border-border/80 flex justify-between items-start gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-xs font-black text-foreground uppercase tracking-wider">{r.mode.split(" ")[0]}</p>
                          <p className="text-[10px] text-muted-foreground">By {r.user_name} · {r.time_of_day}</p>
                          {r.luggage && <Badge className="text-[8px] bg-primary/10 border-primary/20 text-primary py-0 px-1">With luggage</Badge>}
                          
                          {/* Crowdsourcing Vote Buttons */}
                          <div className="flex items-center gap-2 pt-2">
                            <button
                              disabled={voteReportMutation.isPending}
                              onClick={() => voteReportMutation.mutate({ reportId: r.id, voteType: "up" })}
                              className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                                r.user_vote === "up" 
                                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                                  : "bg-surface border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <ThumbsUp className="h-2.5 w-2.5" />
                              <span>Agree ({r.upvotes_count || 0})</span>
                            </button>
                            <button
                              disabled={voteReportMutation.isPending}
                              onClick={() => voteReportMutation.mutate({ reportId: r.id, voteType: "down" })}
                              className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                                r.user_vote === "down" 
                                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                                  : "bg-surface border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <ThumbsDown className="h-2.5 w-2.5" />
                              <span>Dispute ({r.downvotes_count || 0})</span>
                            </button>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-foreground font-mono">₹{r.amount_paid}</p>
                          {r.driver_quote > r.amount_paid && (
                            <p className="text-[10px] text-green-400 font-bold">Saved ₹{r.driver_quote - r.amount_paid}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )}

            {selectedRoute.campus_landmark && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex gap-2.5 items-center p-3.5 bg-surface border border-border rounded-xl">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Drop Point</p>
                  <p className="text-xs font-bold text-foreground">{selectedRoute.campus_landmark}</p></div>
                </div>
                <div className="flex gap-2.5 items-center p-3.5 bg-surface border border-border rounded-xl">
                  <PhoneCall className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Campus Security</p>
                  <a href="tel:+917512449800" className="text-xs font-bold text-primary hover:underline font-mono">+91 751 244 9800</a></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Finalize/Complete Ride Pool Dialog */}
      <Dialog open={isCompletePoolOpen} onOpenChange={setIsCompletePoolOpen}>
        <DialogContent className="sm:max-w-md bg-background border border-border text-foreground">
          <DialogHeader><DialogTitle className="text-sm font-black uppercase tracking-wider">Finalize Ride & Split Fares</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!completingPoolId) return;
            completePoolMutation.mutate({
              poolId: completingPoolId,
              data: {
                final_amount: parseFloat(poolFinalFare),
                upi_id: poolHostUpi.trim()
              }
            });
          }} className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Final Amount Paid to Driver (₹)</label>
              <Input id="input-pool-final-amount" type="number" placeholder="e.g. 150" value={poolFinalFare} onChange={(e) => setPoolFinalFare(e.target.value)} className="bg-surface border-border" required />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Your UPI ID (to receive splits)</label>
              <Input id="input-pool-host-upi" placeholder="e.g. name@upi or 9876543210@paytm" value={poolHostUpi} onChange={(e) => setPoolHostUpi(e.target.value)} className="bg-surface border-border" required />
            </div>

            <div className="p-3 bg-surface-raised border border-border rounded-xl text-[11px] text-muted-foreground leading-relaxed">
              When finalized, PocketBuddy will automatically split this amount equally among all riders. It will generate direct-pay UPI intent links for them and auto-log this travel expense in your budget ledger.
            </div>

            <DialogFooter>
              <Button id="btn-finalize-pool-submit" type="submit" disabled={completePoolMutation.isPending} className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider h-10">
                {completePoolMutation.isPending ? "Calculating splits..." : "Lock Fare & Split"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Report Dialog */}
      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="sm:max-w-md bg-background border border-border text-foreground">
          <DialogHeader><DialogTitle className="text-sm font-black uppercase tracking-wider">Report Fare You Paid</DialogTitle></DialogHeader>
          <form onSubmit={handlePostReport} className="space-y-4 py-2 text-xs">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Mode</label>
              <div className="flex flex-wrap gap-1.5">
                {(selectedRoute?.modes || []).map((m) => (
                  <button key={m.mode} type="button" onClick={() => setReportMode(m.mode)}
                    className={`flex-1 min-w-[60px] py-2 font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${reportMode === m.mode ? "bg-primary/10 border-primary text-primary" : "bg-surface border-border text-muted-foreground hover:text-foreground"}`}>
                    {m.mode.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Driver Quoted (₹)</label>
                <Input id="input-report-quote" type="number" placeholder="e.g. 300" value={reportQuote} onChange={(e) => setReportQuote(e.target.value)} className="bg-surface border-border" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">You Paid (₹)</label>
                <Input id="input-report-paid" type="number" placeholder="e.g. 160" value={reportPaid} onChange={(e) => setReportPaid(e.target.value)} className="bg-surface border-border" required />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Time of Day</label>
              <div className="flex gap-1">
                {["Morning", "Afternoon", "Evening", "Night"].map((t) => (
                  <button key={t} type="button" onClick={() => setReportTime(t)}
                    className={`flex-1 py-1.5 font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${reportTime === t ? "bg-primary/10 border-primary text-primary" : "bg-surface border-border text-muted-foreground hover:text-foreground"}`}>
                    {t.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-border/30">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input id="checkbox-report-luggage" type="checkbox" checked={reportLuggage} onChange={(e) => setReportLuggage(e.target.checked)} className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                <span className="text-muted-foreground font-bold uppercase tracking-wider">Had luggage</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input id="checkbox-report-anonymous" type="checkbox" checked={reportAnonymous} onChange={(e) => setReportAnonymous(e.target.checked)} className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                <span className="text-muted-foreground font-bold uppercase tracking-wider">Report Anonymously</span>
              </label>
            </div>
            <DialogFooter>
              <Button id="btn-submit-report" type="submit" disabled={submitReportMutation.isPending} className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider h-10">
                {submitReportMutation.isPending ? "Submitting..." : "Submit Report"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Route Dialog */}
      <Dialog open={isNewRouteOpen} onOpenChange={setIsNewRouteOpen}>
        <DialogContent className="sm:max-w-md bg-background border border-border text-foreground">
          <DialogHeader><DialogTitle className="text-sm font-black uppercase tracking-wider">Add Travel Route</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateRoute} className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Route Name</label>
              <Input id="input-route-name" placeholder="e.g. Railway Station to BITS Campus" value={newRouteName} onChange={(e) => setNewRouteName(e.target.value)} className="bg-surface border-border" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Distance (km)</label>
                <Input id="input-route-distance" type="number" step="0.1" placeholder="e.g. 12.5" value={newRouteDistance} onChange={(e) => setNewRouteDistance(e.target.value)} className="bg-surface border-border" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Drop Landmark</label>
                <Input id="input-route-landmark" placeholder="e.g. Main Gate" value={newRouteLandmark} onChange={(e) => setNewRouteLandmark(e.target.value)} className="bg-surface border-border" />
              </div>
            </div>
            <div className="p-3 bg-surface-raised border border-border rounded-xl text-[11px] text-muted-foreground">
              Fares for Auto, Cab, and Bike are auto-estimated from the distance. Community reports will improve accuracy over time.
            </div>
            <DialogFooter>
              <Button id="btn-create-route" type="submit" disabled={createRouteMutation.isPending} className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider h-10">
                {createRouteMutation.isPending ? "Adding..." : "Add Route"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Create Ride Pool Dialog */}
      <Dialog open={isCreatePoolOpen} onOpenChange={setIsCreatePoolOpen}>
        <DialogContent className="sm:max-w-md bg-background border border-border text-foreground">
          <DialogHeader><DialogTitle className="text-sm font-black uppercase tracking-wider">Publish Ride Pool Group</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!selectedRoute) return;
            const formattedTime = formatDateTime(poolTime);
            createPoolMutation.mutate({
              data: {
                route_id: selectedRoute.id,
                departure_time: formattedTime || poolTime,
                mode: poolMode,
                max_passengers: poolMaxPassengers,
                description: poolDescription.trim()
              }
            });
          }} className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Departure Time</label>
                <Input id="input-pool-time" type="datetime-local" value={poolTime} onChange={(e) => setPoolTime(e.target.value)} className="bg-surface border-border cursor-pointer" required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Max Passengers</label>
                <Select value={String(poolMaxPassengers)} onValueChange={(v) => setPoolMaxPassengers(Number(v))}>
                  <SelectTrigger className="bg-surface border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border text-foreground">
                    {[2, 3, 4, 5, 6].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} passengers</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Transport Mode</label>
              <div className="flex gap-2">
                {["Auto", "Cab", "Shared"].map((m) => (
                  <button key={m} type="button" onClick={() => setPoolMode(m)}
                    className={`flex-1 py-2 font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${poolMode === m ? "bg-primary/10 border-primary text-primary" : "bg-surface border-border text-muted-foreground hover:text-foreground"}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Notes / Context (Optional)</label>
              <Input id="input-pool-desc" placeholder="e.g. Have 1 suitcase, direct cab. Let's split!" value={poolDescription} onChange={(e) => setPoolDescription(e.target.value)} className="bg-surface border-border" />
            </div>

            <div className="p-3 bg-surface-raised border border-border rounded-xl text-[11px] text-muted-foreground">
              This pool group will be visible to all students at {activeCollege}. You can copy a shareable invitation pitch for your hostel/mess WhatsApp groups.
            </div>

            <DialogFooter>
              <Button id="btn-publish-pool" type="submit" disabled={createPoolMutation.isPending} className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider h-10">
                {createPoolMutation.isPending ? "Publishing..." : "Publish Pool Group"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* UPI QR Code Scanner Dialog */}
      <Dialog open={!!activeQrUpiLink} onOpenChange={(open) => { if (!open) setActiveQrUpiLink(null); }}>
        <DialogContent className="sm:max-w-xs bg-background border border-border text-foreground flex flex-col items-center p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-xs font-black uppercase tracking-wider text-center">Scan to Pay via UPI</DialogTitle>
          </DialogHeader>
          
          {activeQrUpiLink && (
            <div className="bg-white p-3 rounded-2xl border border-border/80 flex items-center justify-center shadow-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(activeQrUpiLink)}`}
                alt="UPI Payment QR Code"
                className="w-48 h-48 select-none"
              />
            </div>
          )}
          
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed font-medium">
            Scan this QR code with GPay, PhonePe, Paytm, or any BHIM UPI app on your phone to complete your split payment.
          </p>
          
          <Button
            type="button"
            onClick={() => setActiveQrUpiLink(null)}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-black uppercase tracking-wider h-8"
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>

    </AppShell>
  );
}
