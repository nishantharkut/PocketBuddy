import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { 
  Compass, 
  Bus, 
  Navigation, 
  AlertOctagon, 
  ShieldCheck, 
  HelpCircle, 
  Copy, 
  Check, 
  Plus, 
  Info,
  DollarSign,
  TrendingDown,
  Clock,
  Briefcase,
  Users,
  MapPin,
  PhoneCall,
  Map,
  ArrowRight,
  TrendingUp,
  Search
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { rupees } from "@/lib/format";
import { 
  getTravelRoutes, 
  submitTravelReport, 
  getTravelReports, 
  getTravelSavings, 
  logTravelSavings,
  createTravelRoute,
  getProfile,
  getAiTravelCoach,
  getTravelRouteEstimate
} from "@/lib/api/db.functions";

export const Route = createFileRoute("/_authenticated/travel")({
  ssr: false,
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

function TravelPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  
  const [selectedCollege, setSelectedCollege] = useState<string>("");
  const [otherCollege, setOtherCollege] = useState<string>("");
  const [isCustomCollegeMode, setIsCustomCollegeMode] = useState<boolean>(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<string>("Auto");
  const [driverQuote, setDriverQuote] = useState<string>("");
  const [negotiatedAmount, setNegotiatedAmount] = useState<string>("");
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [isNewRouteOpen, setIsNewRouteOpen] = useState<boolean>(false);
  const [newStudentMode, setNewStudentMode] = useState<boolean>(true);
  const [showCalculator, setShowCalculator] = useState<boolean>(true);
  const [dynamicOrigin, setDynamicOrigin] = useState<string>("");
  const [dynamicDestination, setDynamicDestination] = useState<string>("");
  const [isEstimating, setIsEstimating] = useState<boolean>(false);
  const [estimatedResult, setEstimatedResult] = useState<any>(null);
  const [splitPeople, setSplitPeople] = useState<number>(2);

  // Form State for reporting
  const [reportMode, setReportMode] = useState<string>("Auto");
  const [reportPaid, setReportPaid] = useState<string>("");
  const [reportQuote, setReportQuote] = useState<string>("");
  const [reportTime, setReportTime] = useState<string>("Morning");
  const [reportLuggage, setReportLuggage] = useState<boolean>(false);

  // Form State for new route creation
  const [newRouteName, setNewRouteName] = useState<string>("");
  const [newRouteDesc, setNewRouteDesc] = useState<string>("");
  const [newRouteDistance, setNewRouteDistance] = useState<string>("");
  const [newRouteLandmark, setNewRouteLandmark] = useState<string>("Main Gate");

  // AI Coach state
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

  // Queries
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: () => getProfile(),
  });

  // Set default college from profile
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
    if (selectedCollege === "Other") {
      return otherCollege.trim() || "My Campus";
    }
    return selectedCollege || profile?.college_name || "ABV-IIITM Gwalior";
  }, [selectedCollege, otherCollege, profile]);

  const { data: routes, isLoading: routesLoading } = useQuery({
    queryKey: ["travel-routes", activeCollege, user?.id],
    enabled: !!user && !!activeCollege,
    queryFn: () => getTravelRoutes(activeCollege),
  });

  // Set default route once loaded
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

  const splitFareData = useMemo(() => {
    if (!selectedRoute?.modes?.length) return null;
    const modeDetails = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase()))
      || selectedRoute.modes[0];
    const peopleCount = Math.max(1, splitPeople);
    const perPerson = Math.ceil(modeDetails.median_fare / peopleCount);
    return {
      perPerson,
      median: modeDetails.median_fare,
      max: modeDetails.max_fare,
      peopleCount,
    };
  }, [selectedRoute, selectedMode, splitPeople]);

  // Automatically select an appropriate mode if the selected route changes
  useEffect(() => {
    if (selectedRoute && selectedRoute.modes && selectedRoute.modes.length > 0) {
      const modeNames = selectedRoute.modes.map((m: any) => m.mode);
      if (!modeNames.includes(selectedMode)) {
        setSelectedMode(selectedRoute.modes[0].mode);
      }
    }
  }, [selectedRoute, selectedMode]);

  // Synchronize reportMode with the selected route's first mode when report modal opens
  useEffect(() => {
    if (isReportOpen && selectedRoute && selectedRoute.modes && selectedRoute.modes.length > 0) {
      setReportMode(selectedRoute.modes[0].mode);
    }
  }, [isReportOpen, selectedRoute]);

  // Overcharge calculation
  const overchargeAnalysis = useMemo(() => {
    if (!selectedRoute || !driverQuote) return null;
    const modeDetails = selectedRoute.modes.find((m: any) => m.mode.toLowerCase().includes(selectedMode.toLowerCase())) 
      || selectedRoute.modes[0];
    
    const quote = parseFloat(driverQuote);
    if (isNaN(quote) || quote <= 0) return null;

    const normalMedian = modeDetails.median_fare;
    const normalMax = modeDetails.max_fare;
    const diff = quote - normalMedian;
    const isOvercharged = quote > normalMax;
    const overchargeMin = Math.max(0, quote - normalMax);
    const overchargeMax = Math.max(0, quote - normalMedian);

    return {
      isOvercharged,
      normalMedian,
      normalMax,
      diff,
      overchargeMin,
      overchargeMax,
    };
  }, [selectedRoute, selectedMode, driverQuote]);

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

  // Mutation for logging savings
  const logSavingsMutation = useMutation({
    mutationFn: logTravelSavings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-savings"] });
      qc.invalidateQueries({ queryKey: ["wing-feed"] });
      qc.invalidateQueries({ queryKey: ["wellness-insights"] });
      toast.success("Travel savings successfully logged to your dashboard!");
      setDriverQuote("");
      setNegotiatedAmount("");
    },
    onError: () => {
      toast.error("Failed to log savings. Please try again.");
    }
  });

  // Mutation for submitting reports
  const submitReportMutation = useMutation({
    mutationFn: submitTravelReport,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["travel-reports", selectedRouteId] });
      qc.invalidateQueries({ queryKey: ["travel-routes", activeCollege] }); // refetch ranges
      qc.invalidateQueries({ queryKey: ["wing-feed"] });
      toast.success("Community fare report submitted! Thank you for helping fellow students.");
      setIsReportOpen(false);
      // Reset form
      setReportPaid("");
      setReportQuote("");
      setReportLuggage(false);
    },
    onError: () => {
      toast.error("Failed to submit report.");
    }
  });

  // Mutation for custom route creation
  const createRouteMutation = useMutation({
    mutationFn: createTravelRoute,
    onSuccess: (newRoute) => {
      qc.invalidateQueries({ queryKey: ["travel-routes", activeCollege] });
      toast.success(`Custom route "${newRoute.name}" created! Fares dynamically estimated via Ride App APIs.`);
      setIsNewRouteOpen(false);
      setSelectedRouteId(newRoute.id);
      // Reset form
      setNewRouteName("");
      setNewRouteDesc("");
      setNewRouteDistance("");
      setNewRouteLandmark("Main Gate");
    },
    onError: () => {
      toast.error("Failed to create custom route.");
    }
  });

  const handleLogSavings = () => {
    if (!selectedRoute) return;
    const quoteVal = parseFloat(driverQuote);
    const paidVal = parseFloat(negotiatedAmount);
    if (isNaN(quoteVal) || isNaN(paidVal) || paidVal <= 0 || quoteVal <= paidVal) {
      toast.error("Please enter a valid quoted fare and a lower paid fare.");
      return;
    }
    const saved = quoteVal - paidVal;
    logSavingsMutation.mutate({
      data: {
        amount_saved: saved,
        route_id: selectedRoute.id
      }
    });
  };

  const handlePostReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoute) return;
    const quoteVal = parseFloat(reportQuote);
    const paidVal = parseFloat(reportPaid);
    if (isNaN(quoteVal) || isNaN(paidVal) || paidVal <= 0) {
      toast.error("Please enter valid prices.");
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
        final_amount: paidVal
      }
    });
  };

  const handleCreateRoute = (e: React.FormEvent) => {
    e.preventDefault();
    const distanceVal = parseFloat(newRouteDistance);
    if (!newRouteName.trim()) {
      toast.error("Please enter a route name.");
      return;
    }
    if (isNaN(distanceVal) || distanceVal <= 0) {
      toast.error("Please enter a valid travel distance.");
      return;
    }

    createRouteMutation.mutate({
      data: {
        name: newRouteName.trim(),
        description: newRouteDesc.trim(),
        distance_km: distanceVal,
        campus_landmark: newRouteLandmark.trim(),
        college: activeCollege
      }
    });
  };

  const aiCoachMutation = useMutation({
    mutationFn: getAiTravelCoach,
    onSuccess: (data) => {
      setAiCoachResult(data);
      toast.success("AI negotiation advice loaded!");
    },
    onError: () => {
      toast.error("Failed to get AI negotiation coach details.");
    }
  });

  const handleAiCoachCall = () => {
    if (!selectedRoute) return;
    const parsedQuote = parseFloat(appQuote);
    aiCoachMutation.mutate({
      data: {
        route_id: selectedRoute.id,
        mode: selectedMode,
        user_situation: userSituation.trim(),
        college: activeCollege,
        app_quote: isNaN(parsedQuote) ? undefined : parsedQuote
      }
    });
  };

  const copyScriptToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(true);
    toast.success("Script copied! Use it to negotiate with the driver.");
    setTimeout(() => setCopiedScript(false), 2000);
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
          <button
            onClick={() => setNewStudentMode(!newStudentMode)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] transition-all ${newStudentMode ? "bg-primary/10 border-primary text-primary" : "bg-white/5 border-border text-muted-foreground hover:text-foreground"}`}
          >
            How it works
          </button>
          {savings && (
            <Badge variant="outline" className="flex max-w-[132px] items-center gap-1 border-success/20 bg-success/5 px-2.5 py-1 font-mono text-xs font-bold text-success">
              <TrendingDown className="h-3 w-3" />
              <span className="truncate">Saved ₹{savings.total_saved}</span>
            </Badge>
          )}
        </div>
      </div>

      <div className="pb-24 max-w-6xl mx-auto space-y-6">
        
        {/* Onboarding Guide Card */}
        {newStudentMode && (
          <Card className="bg-surface border-border p-5 relative overflow-hidden animate-[fadeIn_0.25s_ease-out]">
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, rgba(255,107,0,0.04), transparent 60%)" }} />
            <div className="flex justify-between items-start mb-3">
              <h2 className="text-xs font-black uppercase tracking-widest text-primary font-display flex items-center gap-1.5">
                <Info className="h-4 w-4" />
                <span>Product Guide: Dynamic Fare Index</span>
              </h2>
              <button onClick={() => setNewStudentMode(false)} className="text-zinc-600 hover:text-zinc-400 text-xs shrink-0 cursor-pointer">✕</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-400 leading-relaxed font-medium">
              <div className="space-y-1 bg-background/30 border border-border/40 p-3.5 rounded-xl">
                <p className="font-bold text-zinc-300 flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-white/5 border border-border flex items-center justify-center text-[10px] text-primary">1</span>
                  Ride App Baselines
                </p>
                <p className="text-[11px] text-zinc-500">
                  Standard ride booking apps (Uber, Ola, Rapido) initialize the baseline fares based on simulated distance in kilometers.
                </p>
              </div>
              <div className="space-y-1 bg-background/30 border border-border/40 p-3.5 rounded-xl">
                <p className="font-bold text-zinc-300 flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-white/5 border border-border flex items-center justify-center text-[10px] text-primary">2</span>
                  Student Feedback loop
                </p>
                <p className="text-[11px] text-zinc-500">
                  When you take a ride, report the actual fare paid. The system automatically recalculates the boundary range in real time.
                </p>
              </div>
              <div className="space-y-1 bg-background/30 border border-border/40 p-3.5 rounded-xl">
                <p className="font-bold text-zinc-300 flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-white/5 border border-border flex items-center justify-center text-[10px] text-primary">3</span>
                  Negotiation script
                </p>
                <p className="text-[11px] text-zinc-500">
                  Use the Hindi student scripts to easily quote normal rates and avoid getting overcharged at terminal exits.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Dynamic Campus Selector & Control Bar */}
        <div className="bg-surface border border-border p-4 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Map className="h-4.5 w-4.5 text-primary" />
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Campus:</span>
            </div>
            
            <div className="w-full sm:w-60">
              <Select value={selectedCollege} onValueChange={(v) => {
                setSelectedCollege(v);
                if (v !== "Other") {
                  setIsCustomCollegeMode(false);
                } else {
                  setIsCustomCollegeMode(true);
                }
                setSelectedRouteId("");
              }}>
                <SelectTrigger id="select-campus-dropdown" className="bg-surface-raised border-border text-xs font-bold text-foreground h-9 uppercase tracking-wider w-full">
                  <SelectValue placeholder="Select Campus" />
                </SelectTrigger>
                <SelectContent className="bg-background border border-border text-foreground">
                  {POPULAR_COLLEGES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs font-medium">{c}</SelectItem>
                  ))}
                  <SelectItem value="Other" className="text-xs font-medium">Other Campus...</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isCustomCollegeMode && (
              <div className="flex items-center gap-2 w-full sm:w-64 animate-[fadeIn_0.2s_ease-out]">
                <Input
                  id="input-custom-campus"
                  placeholder="Type college campus name..."
                  value={otherCollege}
                  onChange={(e) => setOtherCollege(e.target.value)}
                  className="bg-surface-raised border-border text-xs font-bold h-9 flex-1"
                />
              </div>
            )}
          </div>
          
          <Button
            onClick={() => setIsNewRouteOpen(true)}
            className="h-9 text-[10px] font-black uppercase tracking-wider bg-primary text-primary-foreground flex items-center justify-center gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Route</span>
          </Button>
        </div>

        {/* Route Selector Cards */}
        {routesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-24 bg-white/5" />
            <Skeleton className="h-24 bg-white/5" />
            <Skeleton className="h-24 bg-white/5" />
          </div>
        ) : !routes || routes.length === 0 ? (
          <Card className="bg-surface border-border p-10 text-center space-y-3">
            <Compass className="h-10 w-10 text-zinc-600 mx-auto animate-pulse" />
            <p className="text-xs text-zinc-500 font-bold uppercase tracking-wider">No routes defined for this campus yet.</p>
            <p className="text-xs text-zinc-600">Click the 'Add Route' button above to dynamically estimate and seed travel routes for {activeCollege}!</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {routes.map((r: any) => (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedRouteId(r.id);
                  setDriverQuote("");
                  setNegotiatedAmount("");
                }}
                className={`text-left p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between h-24 ${selectedRouteId === r.id ? "bg-surface-raised border-primary shadow-lg" : "bg-surface border-border hover:border-white/10"}`}
              >
                {selectedRouteId === r.id && (
                  <span className="absolute top-0 left-0 w-full h-[2px] bg-primary" />
                )}
                <div className="min-w-0">
                  <div className="flex justify-between items-start gap-1">
                    <h3 className="text-xs font-black text-foreground truncate uppercase tracking-wider flex-1">{r.name.split("→")[0].trim()}</h3>
                    {r.source === "user_added" ? (
                      <Badge className="text-[8px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 py-0 px-1 font-bold uppercase shrink-0">Custom</Badge>
                    ) : r.source === "app_estimate" ? (
                      <Badge className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 py-0 px-1 font-bold uppercase shrink-0">App Est</Badge>
                    ) : (
                      <Badge className="text-[8px] bg-success/10 border border-success/20 text-success py-0 px-1 font-bold uppercase shrink-0">Verified</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 uppercase font-bold tracking-widest truncate">{r.description}</p>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400 mt-2">
                  <span className="truncate">{r.name.split("→")[1]?.trim() || activeCollege}</span>
                  <Navigation className="h-3.5 w-3.5 text-primary" />
                </div>
              </button>
            ))}
          </div>
        )}

        <Card className="bg-surface border-border overflow-hidden">
          <button
            onClick={() => setShowCalculator(!showCalculator)}
            className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              <span className="text-sm font-black uppercase tracking-wider text-foreground">Estimate Fare for Any Route</span>
              <Badge className="text-[9px] bg-primary/10 border border-primary/20 text-primary font-bold uppercase py-0 px-1.5">Live</Badge>
            </div>
            <span className="text-xs text-zinc-500">{showCalculator ? "Hide" : "Open"}</span>
          </button>

          {showCalculator && (
            <div className="px-4 pb-5 space-y-4 border-t border-border animate-[fadeIn_0.2s_ease-out]">
              <p className="text-[11px] text-zinc-500 pt-3">
                Type any origin and destination to get a live distance and fare snapshot. Google Maps is used when available, otherwise the app falls back to a local estimate.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">From</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
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
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">To</label>
                  <div className="relative">
                    <Compass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
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
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest self-center">Quick:</span>
                {["Railway Station", "Airport", "Bus Stand", "City Centre"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setDynamicOrigin(q)}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-border bg-surface-raised text-zinc-500 hover:text-primary hover:border-primary/40 transition-all cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <Button
                id="btn-estimate-route"
                onClick={handleEstimateRoute}
                disabled={isEstimating}
                className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider h-10 text-xs flex items-center justify-center gap-2"
              >
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
                        {estimatedResult.distance_km} km • ~{estimatedResult.duration_mins} min drive
                      </span>
                    </div>
                    <Badge className={`text-[9px] font-bold uppercase py-0.5 px-2 ${estimatedResult.source === "google_api" ? "bg-green-500/15 border border-green-500/30 text-green-400" : "bg-amber-500/15 border border-amber-500/30 text-amber-400"}`}>
                      {estimatedResult.source === "google_api" ? "Live Google Routes" : "Smart Estimate"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {estimatedResult.modes.map((m: any) => (
                      <div key={m.mode} className="bg-surface-raised border border-border/60 rounded-xl p-3 space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-foreground">{m.mode.split(" ")[0]}</p>
                        <p className="text-base font-black text-primary font-mono">₹{m.min_fare}–₹{m.max_fare}</p>
                        <p className="text-[9px] text-zinc-500">Median ₹{m.median_fare}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card className="bg-surface border-border p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">1. Check Fare</p>
            <p className="text-sm font-bold text-foreground">Compare a driver quote against the live route median.</p>
          </Card>
          <Card className="bg-surface border-border p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">2. Split Fare</p>
            <p className="text-sm font-bold text-foreground">See per-person cost if you’re sharing the ride.</p>
            {splitFareData && <p className="text-xs text-primary font-mono">₹{splitFareData.perPerson} each</p>}
          </Card>
          <Card className="bg-surface border-border p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">3. AI Coach</p>
            <p className="text-sm font-bold text-foreground">Generate a negotiation script from the live fare.</p>
          </Card>
          <Card className="bg-surface border-border p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">4. Reports</p>
            <p className="text-sm font-bold text-foreground">Use student reports to keep the range current.</p>
          </Card>
        </div>

        {selectedRoute && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Fare Range & Detector */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* Fare Range Display */}
              <Card className="bg-surface border-border p-5 md:p-6 space-y-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-sm font-black tracking-widest text-zinc-400 uppercase font-mono">Fair Fare Ranges</h2>
                    <p className="text-xs text-zinc-500 mt-1">Realistic travel rates. Seeded values dynamically updated by community reports.</p>
                  </div>
                  {selectedRoute.distance_km && (
                    <Badge variant="secondary" className="font-bold text-xs bg-white/5 border border-border text-foreground font-mono">
                      Distance: {selectedRoute.distance_km} km
                    </Badge>
                  )}
                </div>

                <div className="space-y-4">
                  {selectedRoute.modes.map((m: any) => (
                    <div key={m.mode} className="space-y-2 border-b border-border/40 pb-4 last:border-0 last:pb-0">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs font-bold text-foreground uppercase">{m.mode}</span>
                        <span className="text-xs font-black text-primary font-mono">₹{m.min_fare} - ₹{m.max_fare}</span>
                      </div>
                      <div className="relative h-2 bg-surface-raised rounded-full overflow-hidden">
                        <div 
                          className="absolute h-full bg-gradient-to-r from-primary to-amber-500 rounded-full"
                          style={{
                            left: `${Math.min(100, (m.min_fare / 800) * 100)}%`,
                            width: `${Math.min(100, ((m.max_fare - m.min_fare) / 800) * 100)}%`
                          }}
                        />
                        <div 
                          className="absolute w-2 h-2 bg-white border border-primary rounded-full top-0 -translate-x-1/2"
                          style={{ left: `${Math.min(100, (m.median_fare / 800) * 100)}%` }}
                          title={`Median: ₹${m.median_fare}`}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-zinc-600 font-bold uppercase tracking-wider">
                        <span>Min: ₹{m.min_fare}</span>
                        <span>Median: ₹{m.median_fare}</span>
                        <span>Max: ₹{m.max_fare}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Overcharge Detector Widget */}
              <Card className="bg-surface border-border p-5 md:p-6 space-y-5">
                <div>
                  <h2 className="text-sm font-black tracking-widest text-zinc-400 uppercase font-mono">Overcharge Detector</h2>
                  <p className="text-xs text-zinc-500 mt-1">Check if the quote you got is fair, and calculate negotiation savings.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Select Mode</label>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedRoute.modes.map((m: any) => (
                        <button
                          key={m.mode}
                          onClick={() => setSelectedMode(m.mode)}
                          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${selectedMode === m.mode ? "bg-primary/10 border-primary text-primary" : "bg-surface-raised border-border text-muted-foreground hover:text-foreground"}`}
                        >
                          {m.mode.split(" ")[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Driver's Quote (₹)</label>
                    <Input
                      id="input-driver-quote"
                      type="number"
                      placeholder="e.g. 350"
                      value={driverQuote}
                      onChange={(e) => setDriverQuote(e.target.value)}
                      className="bg-surface-raised border-border text-xs font-bold text-foreground"
                    />
                  </div>
                </div>

                {overchargeAnalysis && (
                  <div className={`p-4 rounded-xl border animate-[fadeIn_0.25s_ease-out] ${overchargeAnalysis.isOvercharged ? "bg-destructive/5 border-destructive/20 text-destructive" : "bg-success/5 border-success/20 text-success"}`}>
                    <div className="flex gap-2.5 items-start">
                      <AlertOctagon className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-wider">
                          {overchargeAnalysis.isOvercharged 
                            ? `Likely Overcharged by ₹${overchargeAnalysis.overchargeMin} - ₹${overchargeAnalysis.overchargeMax}` 
                            : "Fair Quote Detected"}
                        </p>
                        <p className="text-[11px] text-zinc-400 leading-relaxed font-medium mt-0.5">
                          {overchargeAnalysis.isOvercharged 
                            ? `Normal ${selectedMode} fare for this route is around ₹${overchargeAnalysis.normalMedian}. Avoid paying ₹${driverQuote}.` 
                            : `The fare of ₹${driverQuote} is within the normal boundary (₹${overchargeAnalysis.normalMedian} median).`}
                        </p>
                      </div>
                    </div>

                    {overchargeAnalysis.isOvercharged && (
                      <div className="mt-4 pt-4 border-t border-border/30 space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 pl-0.5">Negotiation logger: Did you bargain?</p>
                        <div className="flex gap-2">
                          <Input
                            id="input-negotiated-amount"
                            type="number"
                            placeholder="Final amount paid (₹)"
                            value={negotiatedAmount}
                            onChange={(e) => setNegotiatedAmount(e.target.value)}
                            className="bg-background border-border text-xs font-bold text-foreground h-9"
                          />
                          <Button 
                            id="btn-log-savings"
                            disabled={!negotiatedAmount || logSavingsMutation.isPending}
                            onClick={handleLogSavings}
                            className="bg-success text-white hover:bg-success/90 text-[10px] font-bold uppercase tracking-wider h-9"
                          >
                            Log Savings
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* cheapest Route Combo */}
              <Card className="bg-surface border-border p-5 md:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-success" />
                  <h2 className="text-sm font-black tracking-widest text-zinc-400 uppercase font-mono">Cheapest Route Combo</h2>
                </div>
                <div className="bg-surface-raised border border-border p-4 rounded-xl">
                  <p className="text-xs text-foreground font-semibold leading-relaxed">
                    {selectedRoute.cheapest_route_combo}
                  </p>
                </div>
              </Card>
            </div>

            {/* Right Column: Negotiation Helper & Community reports */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Negotiation Helper & Scripts */}
              <Card className="bg-surface border-border p-5 md:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <h2 className="text-sm font-black tracking-widest text-zinc-400 uppercase font-mono">Negotiation Helper</h2>
                  </div>
                  {aiCoachResult && (
                    <Badge className={`text-[8px] font-bold uppercase tracking-wider py-0.5 px-2 rounded-full ${aiCoachResult.source === "bedrock" ? "bg-primary/20 border-primary/30 text-primary border" : "bg-white/5 border border-border text-zinc-400"}`}>
                      {aiCoachResult.source === "bedrock" ? "Bedrock AI Active" : "Local Engine"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-zinc-500">Show this student rate script or quote it directly to local drivers.</p>

                <div className="bg-background border border-border rounded-xl p-3.5 relative overflow-hidden group">
                  <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest block mb-2">Seeded Campus Script</span>
                  <p className="text-xs text-zinc-300 font-semibold leading-relaxed pr-8">
                    "{selectedRoute.negotiation_helper}"
                  </p>
                  <button 
                    onClick={() => copyScriptToClipboard(selectedRoute.negotiation_helper)}
                    className="absolute top-3 right-3 text-zinc-500 hover:text-foreground transition-colors p-1.5 bg-surface-raised border border-border rounded-md hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    {copiedScript ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>

                <div className="border-t border-border/50 pt-4 space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-wider text-primary">AI Negotiation Coach</label>
                      <span className="text-[9px] text-zinc-500 font-medium">Adapts script based on situation & surge price</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Ola/Uber Price (₹)</label>
                        <Input
                          id="input-ai-app-quote"
                          type="number"
                          placeholder="What price is your app showing?"
                          value={appQuote}
                          onChange={(e) => setAppQuote(e.target.value)}
                          className="bg-surface-raised border-border text-xs h-9 w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Your Situation (Optional)</label>
                        <Input
                          id="input-ai-situation"
                          placeholder="e.g. Raining, heavy bags, night..."
                          value={userSituation}
                          onChange={(e) => setUserSituation(e.target.value)}
                          className="bg-surface-raised border-border text-xs h-9 w-full"
                        />
                      </div>
                    </div>

                    <Button
                      id="btn-ask-ai-coach"
                      onClick={handleAiCoachCall}
                      disabled={aiCoachMutation.isPending}
                      className="w-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-wider h-9 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {aiCoachMutation.isPending ? "Asking..." : "Ask AI Coach"}
                    </Button>
                  </div>

                  {aiCoachResult && (
                    <div className="space-y-3 p-3.5 bg-card border border-primary/20 rounded-xl animate-[fadeIn_0.25s_ease-out] text-card-foreground">
                      {aiCoachResult.surge_factor !== undefined && (
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {aiCoachResult.surge_factor > 1.0 ? (
                            <Badge className="bg-destructive/20 border-destructive/30 text-destructive border font-mono font-bold text-[9px] py-0.5 px-1.5">
                              Surge: {aiCoachResult.surge_factor}x
                            </Badge>
                          ) : (
                            <Badge className="bg-success/20 border-success/30 text-success border font-mono font-bold text-[9px] py-0.5 px-1.5">
                              Fair Price (No Surge)
                            </Badge>
                          )}
                          {aiCoachResult.community_median && (
                            <Badge className="bg-white/5 border border-border text-foreground font-mono text-[9px] py-0.5 px-1.5">
                              Community Median: ₹{aiCoachResult.community_median}
                            </Badge>
                          )}
                          {aiCoachResult.report_count !== undefined && (
                            <Badge className="bg-white/5 border border-border text-muted-foreground text-[9px] py-0.5 px-1.5">
                              {aiCoachResult.report_count} reports
                            </Badge>
                          )}
                        </div>
                      )}

                      <div className="relative bg-surface-raised p-3 border border-border rounded-lg">
                        <span className="text-[8px] text-primary font-bold uppercase tracking-widest block mb-1.5">AI Dialect-tailored Script</span>
                        <p className="text-xs text-foreground font-bold leading-relaxed pr-8">
                          "{aiCoachResult.script}"
                        </p>
                        <button 
                          onClick={() => copyScriptToClipboard(aiCoachResult.script)}
                          className="absolute top-2.5 right-2.5 text-zinc-500 hover:text-foreground transition-colors p-1 bg-surface-raised border border-border rounded-md hover:scale-105 active:scale-95 cursor-pointer"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest block">AI Tactical Tips</span>
                        <ul className="space-y-1 text-[11px] text-foreground/80 font-medium">
                          {aiCoachResult.tactics.map((tip, idx) => (
                            <li key={idx} className="flex gap-1.5 items-start">
                              <span className="text-primary mt-0.5">•</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {aiCoachResult.safety && (
                        <div className="p-2.5 bg-destructive/5 border border-destructive/15 rounded-lg text-[10px] text-foreground font-medium leading-relaxed">
                          <span className="font-bold text-destructive uppercase tracking-wide mr-1.5">AI Safety Warning:</span>
                          {aiCoachResult.safety}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Safety & Warning Alerts */}
              <Card className="bg-surface border-border p-5 md:p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <AlertOctagon className="h-5 w-5 text-destructive" />
                  <h2 className="text-sm font-black tracking-widest text-zinc-400 uppercase font-mono">Traps & Warnings</h2>
                </div>

                <div className="space-y-3">
                  <div className="flex gap-2.5 items-start p-3 bg-red-950/10 border border-red-950/30 rounded-xl text-red-400">
                    <Info className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider">Local Trap Alert</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed font-medium mt-0.5">{selectedRoute.scam_warnings}</p>
                    </div>
                  </div>

                  <div className="flex gap-2.5 items-start p-3 bg-blue-950/10 border border-blue-950/30 rounded-xl text-blue-400">
                    <Clock className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider">Night Safety Advice</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed font-medium mt-0.5">
                        <span className="font-bold text-blue-300">Day:</span> {selectedRoute.safety_score_day}<br/>
                        <span className="font-bold text-blue-300">Night:</span> {selectedRoute.safety_score_night}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* New Student Mode: Campus details */}
              {newStudentMode && (
                <Card className="bg-surface border-border p-5 md:p-6 space-y-4 relative overflow-hidden">
                  <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(255,107,0,0.04), transparent 60%)" }} />
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <h2 className="text-sm font-black tracking-widest text-zinc-400 uppercase font-mono">First-Year Guide</h2>
                  </div>
                  <p className="text-xs text-zinc-500">Essential contact details and gate points for first-time visitors.</p>

                  <div className="space-y-2 text-xs">
                    <div className="flex gap-2 items-center bg-surface-raised border border-border p-2.5 rounded-lg">
                      <MapPin className="h-4 w-4 text-zinc-500 shrink-0" />
                      <div>
                        <p className="font-bold text-zinc-300">Gate Landmark</p>
                        <p className="text-[11px] text-zinc-500 font-semibold">{selectedRoute.campus_landmark}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 items-center bg-surface-raised border border-border p-2.5 rounded-lg">
                      <PhoneCall className="h-4 w-4 text-zinc-500 shrink-0" />
                      <div>
                        <p className="font-bold text-zinc-300">Main Campus Gate Security</p>
                        <a href="tel:+917512449800" className="text-[11px] text-primary hover:underline font-mono font-bold">+91 751 244 9800</a>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Community Reports List */}
              <Card className="bg-surface border-border p-5 md:p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-sm font-black tracking-widest text-zinc-400 uppercase font-mono">Community Reports</h2>
                    {reports && (
                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Based on {reports.length} student inputs</p>
                    )}
                  </div>
                  <Button
                    onClick={() => setIsReportOpen(true)}
                    className="h-8 text-[10px] font-black uppercase tracking-wider bg-white/5 border border-border hover:bg-white/10 hover:border-white/15 text-foreground flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Report</span>
                  </Button>
                </div>

                <div className="space-y-2.5 max-h-72 overflow-y-auto no-scrollbar">
                  {reportsLoading ? (
                    <Skeleton className="h-20 bg-white/5" />
                  ) : !reports || reports.length === 0 ? (
                    <p className="text-center py-6 text-xs text-zinc-500 font-bold uppercase tracking-wider">No recent reports. Be the first!</p>
                  ) : (
                    reports.map((r: any) => (
                      <div key={r.id} className="p-3 bg-surface-raised rounded-xl border border-border/80 flex justify-between items-start text-xs">
                        <div className="space-y-1 min-w-0">
                          <p className="font-black text-foreground flex items-center gap-1.5">
                            <span className="uppercase">{r.mode}</span>
                            {r.luggage && (
                              <Badge className="text-[8px] bg-primary/10 border-primary/20 text-primary py-0 px-1 hover:bg-primary/10">Luggage</Badge>
                            )}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-semibold truncate capitalize">By {r.user_name}</p>
                          <p className="text-[9px] text-zinc-600 font-bold uppercase flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{r.time_of_day}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-foreground font-mono">₹{r.amount_paid}</p>
                          {r.driver_quote > r.amount_paid && (
                            <p className="text-[9px] text-success font-bold font-mono">Saved ₹{r.driver_quote - r.amount_paid}</p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

            </div>

          </div>
        )}

      </div>

      {/* Report Form Dialog */}
      <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
        <DialogContent className="sm:max-w-md bg-background border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider font-display text-foreground">Submit Community Fare Report</DialogTitle>
          </DialogHeader>

          <form onSubmit={handlePostReport} className="space-y-4 py-2 text-xs">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Mode of Travel</label>
              <div className="flex gap-1.5">
                {selectedRoute?.modes.map((m: any) => (
                  <button
                    key={m.mode}
                    type="button"
                    onClick={() => setReportMode(m.mode)}
                    className={`flex-1 py-2 font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${
                      reportMode === m.mode || 
                      reportMode.toLowerCase().includes(m.mode.toLowerCase().split(" ")[0]) || 
                      m.mode.toLowerCase().includes(reportMode.toLowerCase().split(" ")[0])
                        ? "bg-primary/10 border-primary text-primary" 
                        : "bg-surface border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m.mode.split(" ")[0]}
                  </button>
                )) || ["Auto", "Cab", "Shared Auto"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setReportMode(m)}
                    className={`flex-1 py-2 font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${
                      reportMode === m || 
                      reportMode.toLowerCase().includes(m.toLowerCase()) || 
                      m.toLowerCase().includes(reportMode.toLowerCase())
                        ? "bg-primary/10 border-primary text-primary" 
                        : "bg-surface border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Driver's Quoted Price (₹)</label>
                <Input
                  id="input-report-quote"
                  type="number"
                  placeholder="e.g. 300"
                  value={reportQuote}
                  onChange={(e) => setReportQuote(e.target.value)}
                  className="bg-surface border-border text-xs font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Final Amount Paid (₹)</label>
                <Input
                  id="input-report-paid"
                  type="number"
                  placeholder="e.g. 160"
                  value={reportPaid}
                  onChange={(e) => setReportPaid(e.target.value)}
                  className="bg-surface border-border text-xs font-bold"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Time of Day</label>
              <div className="flex gap-1">
                {["Morning", "Afternoon", "Evening", "Night"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setReportTime(t)}
                    className={`flex-1 py-1.5 font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${reportTime === t ? "bg-primary/10 border-primary text-primary" : "bg-surface border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {t.substring(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 py-1 select-none">
              <input
                id="checkbox-report-luggage"
                type="checkbox"
                checked={reportLuggage}
                onChange={(e) => setReportLuggage(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary bg-surface accent-primary cursor-pointer"
              />
              <label htmlFor="checkbox-report-luggage" className="text-zinc-400 font-bold uppercase tracking-wider cursor-pointer">Luggage was present</label>
            </div>

            <DialogFooter className="pt-2">
              <Button
                id="btn-submit-report"
                type="submit"
                disabled={submitReportMutation.isPending}
                className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider h-10"
              >
                {submitReportMutation.isPending ? "Submitting..." : "Submit Report"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Custom Route Dialog */}
      <Dialog open={isNewRouteOpen} onOpenChange={setIsNewRouteOpen}>
        <DialogContent className="sm:max-w-md bg-background border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-sm font-black uppercase tracking-wider font-display text-foreground">Add Custom Travel Route</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateRoute} className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Route Name</label>
              <Input
                id="input-route-name"
                placeholder="e.g. Railway Station to BITS Campus"
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                className="bg-surface border-border text-xs font-bold"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Description</label>
              <Input
                id="input-route-desc"
                placeholder="e.g. Travel from terminal exits"
                value={newRouteDesc}
                onChange={(e) => setNewRouteDesc(e.target.value)}
                className="bg-surface border-border text-xs font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Est. Distance (km)</label>
                <Input
                  id="input-route-distance"
                  type="number"
                  step="0.1"
                  placeholder="e.g. 12.5"
                  value={newRouteDistance}
                  onChange={(e) => setNewRouteDistance(e.target.value)}
                  className="bg-surface border-border text-xs font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-0.5">Campus Gate Landmark</label>
                <Input
                  id="input-route-landmark"
                  placeholder="e.g. Main Gate"
                  value={newRouteLandmark}
                  onChange={(e) => setNewRouteLandmark(e.target.value)}
                  className="bg-surface border-border text-xs font-bold"
                />
              </div>
            </div>

            <div className="bg-surface-raised border border-border p-3.5 rounded-xl space-y-1 text-zinc-500">
              <p className="font-bold uppercase tracking-wider text-[9px] text-zinc-400">Live Booking App Tariffs (Ola/Uber/Rapido)</p>
              <p className="text-[11px] leading-relaxed">
                The platform will automatically generate mock booking app tariff ranges for Cab, Auto, and Bike modes based on the distance.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                id="btn-create-route"
                type="submit"
                disabled={createRouteMutation.isPending}
                className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider h-10"
              >
                {createRouteMutation.isPending ? "Creating Route..." : "Create Custom Route"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </AppShell>
  );
}
