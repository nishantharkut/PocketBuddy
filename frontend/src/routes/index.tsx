import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles, User, ShoppingBag, Link as LinkIcon, ChevronRight, Sun, Moon, Menu, X,
  Smartphone, Map, Zap, ShoppingCart, CalendarCheck, Bell,
  Banknote, Utensils, Lock, Brain, Handshake, GraduationCap, WifiOff,
  Globe, Server, Database, HardDrive, Network, Layers, Leaf,
  Check, Star, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  component: LandingPage,
});

// ── Hooks ──────────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return value;
}

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// Helper to watch theme classes on documentElement
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(
    document.documentElement.classList.contains("light") ? "light" : "dark"
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isLight = document.documentElement.classList.contains("light");
      setTheme(isLight ? "light" : "dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

// ── Particle canvas ────────────────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const isLight = theme === "light";
    const particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      r: Math.random() * 1.4 + 0.3,
      alpha: Math.random() * 0.35 + 0.05,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        
        ctx.fillStyle = isLight 
          ? `rgba(255,107,0,${p.alpha * 0.4})`
          : `rgba(194,125,86,${p.alpha})`; 
        ctx.fill();
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = isLight
              ? `rgba(255,107,0,${0.07 * (1 - dist / 120)})`
              : `rgba(140,120,83,${0.12 * (1 - dist / 120)})`; 
            ctx.lineWidth = 0.5; 
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, [theme]);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.65 }} />;
}

// ── Dashboard mockup (phone) ───────────────────────────────────────────────
function DashboardMockup() {
  const { ref, inView } = useInView(0.1);
  return (
    <div ref={ref} className="relative w-full max-w-[360px] mx-auto px-4" style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0) rotateX(0deg)" : "translateY(40px) rotateX(8deg)", transition: "all 1s cubic-bezier(0.16,1,0.3,1)", perspective: "1000px" }}>
      <div className="absolute top-[-60px] left-1/2 -translate-x-1/2 w-[260px] h-[260px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(140,120,83,0.18) 0%, transparent 70%)" }} />
      <div className="rounded-[32px] border border-border p-1 bg-gradient-to-b from-zinc-800 to-zinc-950 shadow-2xl">
        <div className="bg-background rounded-[28px] overflow-hidden p-4 sm:p-5 select-none">
          <div className="flex justify-between mb-4 opacity-35">
            <span className="text-[10px] text-foreground font-mono">9:41</span>
            <span className="text-[10px] text-foreground font-mono">●●●</span>
          </div>
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="text-[8px] tracking-[0.2em] text-muted-foreground font-mono">POCKETBUDDY</div>
              <div className="text-[11px] font-bold text-foreground mt-0.5">Wing 4B · Room 214</div>
            </div>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-pb-amber flex items-center justify-center">
              <span className="color-[#0A0A0A] font-black text-[11px]">P</span>
            </div>
          </div>
          {/* Runway card */}
          <div className="bg-card border border-border border-t-2 border-t-[#8C7853] rounded-xl p-3 mb-2.5">
            <div className="text-[7px] tracking-[0.2em] text-muted-foreground font-mono mb-1.5">RUNWAY STATUS</div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="text-3xl font-black text-pb-green leading-none font-display">16</span>
              <span className="text-[9px] font-bold text-muted-foreground tracking-widest">DAYS</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border">
              <div><div className="text-[7px] text-muted-foreground tracking-wider font-mono">SPENT</div><div className="text-[12px] font-bold text-foreground">₹2,840</div></div>
              <div><div className="text-[7px] text-muted-foreground tracking-wider font-mono">SAFE/DAY</div><div className="text-[12px] font-bold text-[#C27D56]">₹125</div></div>
            </div>
          </div>
          {/* AI Alert */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5 mb-2">
            <div className="flex items-center gap-1 text-[7px] text-[#C27D56] tracking-wider font-mono mb-1"><Zap className="h-2 w-2" /> AI GUARD · BEDROCK</div>
            <div className="text-[9px] text-foreground leading-relaxed">BH-2 Night Canteen: Egg Paratha <span className="text-[#C27D56] font-bold">₹45</span> · Open till 2AM</div>
          </div>
          {/* Pool */}
          <div className="bg-card border border-border border-l-2 border-l-[#F7EC13] rounded-lg p-2.5">
            <div className="flex justify-between">
              <div>
                <div className="flex items-center gap-1 text-[8px] text-pb-amber font-mono tracking-wider"><ShoppingCart className="h-2 w-2" /> BLINKIT POOL</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">₹165/₹199 min · 4 members</div>
              </div>
              <div className="text-[8px] text-muted-foreground font-mono">06:14</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Feature card ───────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, description, accent, delay }: { icon: LucideIcon; title: string; description: string; accent: string; delay: number }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className="relative bg-card border border-border rounded-xl p-5 md:p-6 overflow-hidden transition-all duration-300" style={{ borderTop: `2px solid ${accent}`, opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(28px)", transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms` }}>
      <div className="absolute top-0 left-0 right-0 h-24 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% -20%, ${accent}15, transparent 70%)` }} />
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${accent}1a`, color: accent }}><Icon className="h-5 w-5" /></div>
      <h3 className="text-sm font-bold text-foreground mb-2 tracking-tight">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

// ── Timeline step ──────────────────────────────────────────────────────────
function TimelineStep({ n, title, sub, delay }: { n: string; title: string; sub: string; delay: number }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className="flex gap-4 items-start transition-all duration-700" style={{ opacity: inView ? 1 : 0, transform: inView ? "translateX(0)" : "translateX(-30px)", transitionDelay: `${delay}ms` }}>
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-primary to-pb-amber flex items-center justify-center text-xs font-black text-[#0A0A0A] shadow-md shadow-primary/10 font-mono">{n}</div>
      <div className="pt-1.5">
        <h4 className="text-sm font-bold text-foreground mb-1">{title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">{sub}</p>
      </div>
    </div>
  );
}

// ── Section label ──────────────────────────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  return <div className="text-[10px] tracking-[0.22em] text-[#C27D56] font-mono mb-3 uppercase">{text}</div>;
}

// ── Section heading ────────────────────────────────────────────────────────
function SectionHeading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-2xl sm:text-3xl md:text-4xl font-black leading-tight text-foreground uppercase tracking-tight ${className}`}>{children}</h2>;
}

// ── Architecture flow path ───────────────────────────────────────────────────
function FlowPath({ label, nodes, accent }: { label: string; nodes: string[]; accent: string }) {
  const { ref, inView } = useInView();
  return (
    <div ref={ref} className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm overflow-hidden transition-all duration-700" style={{ borderTop: `2px solid ${accent}`, opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(18px)" }}>
      <p className="text-[9px] tracking-widest font-mono mb-4 uppercase" style={{ color: accent }}>{label}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {nodes.map((node, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="rounded-md border border-border bg-surface-raised px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-foreground whitespace-nowrap">{node}</span>
            {i < nodes.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main landing page ──────────────────────────────────────────────────────
function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const [heroVisible, setHeroVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const [statsInView, setStatsInView] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("pb_theme") as "light" | "dark" | null;
    const t = savedTheme || "dark";
    setTheme(t);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("pb_theme", next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
  };

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 100);
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStatsInView(true); obs.disconnect(); } }, { threshold: 0.2 });
    if (statsRef.current) obs.observe(statsRef.current);
    return () => { clearTimeout(t); window.removeEventListener("scroll", onScroll); obs.disconnect(); };
  }, []);

  const features = [
    { icon: Smartphone, title: "Headless UPI Ingestion", description: "A background Android connector silently intercepts UPI push notifications from GPay, PhonePe & Paytm ── zero manual entry, ever.", accent: "#8C7853", delay: 0 },
    { icon: Map, title: "Crowdsourced Merchant Mapping", description: "Raw strings like SHREE_BALAJI_ENT resolve into 'Hostel 1 Night Canteen' via 1-tap crowd classification, shared globally across campus.", accent: "#C27D56", delay: 100 },
    { icon: Zap, title: "Geofenced AI Guard", description: "Amazon Bedrock analyzes your runway against a live campus food database to surface hyper-local, cost-effective meal alternatives.", accent: "#D9A05B", delay: 200 },
    { icon: ShoppingCart, title: "Wing Cart Pooler", description: "Open a Blinkit/Zepto pool, share it on WhatsApp, let roommates add items ── delivery fees split automatically. No install needed.", accent: "#F7EC13", delay: 0 },
    { icon: CalendarCheck, title: "Exam-Week Check-In", description: "If no food transaction is detected for 16+ hours during exam week, PocketBuddy pings you and suggests the nearest open campus canteen.", accent: "#5E17EB", delay: 100 },
    { icon: Bell, title: "Subscription Collision Guard", description: "Auto-detects recurring Spotify, YouTube & gaming debits, then flags exact days when they'll slice your food runway to dangerous levels.", accent: "#FC8019", delay: 200 },
  ];

  const faqs = [
    { q: "Does PocketBuddy access my bank account or UPI password?", a: "Absolutely not. PocketBuddy only reads push notification strings from UPI apps ── it never connects to your bank, never stores credentials, and never initiates transactions. Think of it as a smart clipboard that reads your phone's notification panel." },
    { q: "What if I don't have the Android companion app?", a: "You can still use PocketBuddy in full manual mode ── log transactions in one tap, get AI food suggestions, join Wing Cart Pools, and track subscriptions. The companion just makes it passive and offline-syncing." },
    { q: "How does the crowdsourced merchant mapping work?", a: "When a new merchant string appears (e.g. SHREE_BALAJI_ENT), you get a 1-tap prompt to classify it. Once classified, it's immediately resolved for every student on your campus ── your 10 seconds of effort saves hundreds of others the same friction." },
    { q: "Is this only for IIT/NIT students?", a: "No ── PocketBuddy works for any residential campus. The campus food database is seeded per-college and grows via crowdsourcing. Any university can onboard by seeding their initial food menu." },
    { q: "How is the Burnout Risk Score calculated?", a: "It's derived from four real signals: food gap hours (time since last food transaction), exam period overlap, spending velocity spike vs. prior week, and late-night transaction patterns. No subjective surveys ── it's entirely data-driven." },
  ];

  const comparisons = [
    { feature: "Zero manual tracking", us: true, fi: false, mint: false, splitwise: false },
    { feature: "UPI push notification ingestion", us: true, fi: false, mint: false, splitwise: false },
    { feature: "Campus-specific food intelligence", us: true, fi: false, mint: false, splitwise: false },
    { feature: "Crowdsourced merchant mapping", us: true, fi: false, mint: false, splitwise: false },
    { feature: "Burnout risk detection", us: true, fi: false, mint: false, splitwise: false },
    { feature: "Delivery fee split pooling", us: true, fi: false, mint: false, splitwise: true },
    { feature: "Subscription collision alerts", us: true, fi: true, mint: true, splitwise: false },
    { feature: "Exam-period food monitoring", us: true, fi: false, mint: false, splitwise: false },
    { feature: "Works without bank login", us: true, fi: false, mint: false, splitwise: true },
  ];

  const problems = [
    { icon: Banknote, stat: "₹800", sub: "avg wasted monthly on delivery surge fees by hostel students", color: "#FC8019" },
    { icon: Utensils, stat: "3 in 5", sub: "students skip a meal during exam week due to financial anxiety", color: "#ef4444" },
    { icon: Smartphone, stat: "94%", sub: "of students abandon manual finance apps within 2 weeks", color: "#f59e0b" },
    { icon: Moon, stat: "₹450", sub: "spent late-night per month on impulse delivery orders", color: "#5E17EB" },
  ];

  const testimonials = [
    { quote: "This is exactly what I needed in my first year. I had no idea I was spending ₹900/month just on delivery fees until PocketBuddy showed me.", name: "Aryan M.", role: "2nd Year, CSE · IIT Bombay (Beta User)" },
    { quote: "The Wing Pool feature saved us ₹200 in one week. We started a Zepto pool for the whole floor every night. Game changer.", name: "Sneha K.", role: "3rd Year, ECE · BITS Pilani (Beta User)" },
    { quote: "During JEE Advanced prep I was skipping meals without realizing. The burnout detector actually made me eat. Sounds silly but it worked.", name: "Rahul S.", role: "Final Year, Mech · NIT Trichy (Beta User)" },
  ];

  return (
    <div className="bg-background min-h-screen overflow-x-hidden text-foreground font-sans antialiased">
      <ParticleCanvas />

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-24px)] sm:w-[calc(100%-48px)] max-w-[1100px]">
        <nav className="flex items-center justify-between w-full px-3.5 sm:px-6 h-14 backdrop-blur-xl border border-border rounded-full transition-all duration-300 shadow-md" style={{ background: scrollY > 40 ? "color-mix(in srgb, var(--background) 90%, transparent)" : "color-mix(in srgb, var(--background) 40%, transparent)" }}>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <svg viewBox="0 0 100 100" className="h-7 w-7 shrink-0 filter drop-shadow(0px 2px 8px rgba(255,107,0,0.15))" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="pocketTopNav" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FF9F43" />
                  <stop offset="100%" stopColor="#FF6B00" />
                </linearGradient>
                <linearGradient id="pocketSidesNav" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#D97706" />
                  <stop offset="100%" stopColor="#B45309" />
                </linearGradient>
                <linearGradient id="pocketBottomNav" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B00" />
                  <stop offset="100%" stopColor="#D97706" />
                </linearGradient>
                <linearGradient id="coinGradNav" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="100%" stopColor="#E2E8F0" />
                </linearGradient>
                <filter id="coinShadowNav" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
                </filter>
              </defs>
              
              {/* Origami Pocket Base */}
              <path d="M20 38 L50 56 L20 72 Z" fill="url(#pocketSidesNav)" opacity="0.85" />
              <path d="M80 38 L50 56 L80 72 Z" fill="url(#pocketSidesNav)" opacity="0.7" />
              <path d="M50 56 L80 72 L50 85 L20 72 Z" fill="url(#pocketBottomNav)" />
              <path d="M50 20 L80 38 H20 Z" fill="url(#pocketTopNav)" opacity="0.9" />

              {/* Floating coin */}
              <circle cx="50" cy="52" r="14" fill="url(#coinGradNav)" stroke="#FF6B00" strokeWidth="1.5" filter="url(#coinShadowNav)" />
              
              {/* Standard Rupee symbol inside coin */}
              <path d="M44 47H56" stroke="#0F1219" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M44 50H53" stroke="#0F1219" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M49 47V53" stroke="#0F1219" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M49 47A 3 3 0 0 1 49 53" stroke="#0F1219" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M49 53L54 59" stroke="#0F1219" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="font-extrabold text-sm tracking-tight text-foreground hidden min-[400px]:flex items-center gap-0.5">
              PocketBuddy<span className="text-primary font-black">.</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-6">
            <div className="hidden md:flex items-center gap-6">
              <a href="#why-us" className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors text-decoration-none">Why Us</a>
              <a href="#features" className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors text-decoration-none">Features</a>
              <a href="#how-it-works" className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors text-decoration-none">How It Works</a>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-raised/50 transition-colors mr-0.5 cursor-pointer flex items-center justify-center shrink-0 border border-transparent active:scale-95"
                title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4 text-[#ff6b00]" /> : <Moon className="h-4 w-4 text-[#ff6b00]" />}
              </button>
              <Link to="/login" className="hidden sm:inline-block px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs font-bold text-muted-foreground hover:text-foreground transition-colors text-decoration-none whitespace-nowrap">Sign In</Link>
              <Link to="/login" className="px-3 sm:px-4 py-1.5 rounded-full text-xs font-extrabold text-[#0A0A0A] bg-gradient-to-br from-primary to-[#D9A05B] hover:scale-[1.03] active:scale-[0.97] transition-all shadow-md shadow-primary/10 text-decoration-none whitespace-nowrap">Get Started</Link>
              
              {/* Mobile menu toggle */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-raised/50 transition-colors cursor-pointer flex items-center justify-center shrink-0 border border-transparent active:scale-95"
                title="Toggle Menu"
              >
                {menuOpen ? <X className="h-4 w-4 text-[#ff6b00]" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </nav>

        {/* Mobile Dropdown Panel */}
        {menuOpen && (
          <div className="md:hidden mt-2 w-full p-4 bg-background/95 backdrop-blur-xl border border-border rounded-2xl shadow-xl shadow-black/30 flex flex-col gap-3.5 animate-[fadeIn_0.15s_ease-out] z-40">
            <a href="#why-us" onClick={() => setMenuOpen(false)} className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors py-2 px-1 text-decoration-none">Why Us</a>
            <a href="#features" onClick={() => setMenuOpen(false)} className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors py-2 px-1 text-decoration-none">Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors py-2 px-1 text-decoration-none">How It Works</a>
            <div className="border-t border-border pt-3.5 flex items-center justify-between">
              <Link to="/login" onClick={() => setMenuOpen(false)} className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors text-decoration-none">Sign In</Link>
              <Link to="/login" onClick={() => setMenuOpen(false)} className="px-4 py-2 rounded-full text-xs font-extrabold text-[#0A0A0A] bg-gradient-to-br from-primary to-[#D9A05B] shadow-md shadow-primary/10 text-decoration-none">Get Started →</Link>
            </div>
          </div>
        )}
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-28 text-center overflow-hidden">
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-[700px] h-[320px] sm:h-[500px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(140,120,83,0.1) 0%, transparent 70%)" }} />
        <div className="absolute inset-0 pointer-events-none mask-image-radial" style={{ backgroundImage: "linear-gradient(color-mix(in srgb, var(--border) 18%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--border) 18%, transparent) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-[9px] font-bold text-[#C27D56] tracking-[0.16em] mb-8 animate-fade-in font-mono uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-pb-green shadow-[0_0_8px_var(--pb-green)] pulse-dot flex-shrink-0" />
          POWERED BY AMAZON BEDROCK&nbsp;&nbsp;·&nbsp;&nbsp;AWS HACKATHON 2025
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6 max-w-[940px] uppercase text-center" style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0)" : "translateY(30px)", transition: "all 0.9s cubic-bezier(0.16,1,0.3,1) 0.2s" }}>
          <span className="block text-foreground mb-1">YOUR CAMPUS MONEY,</span>
          <span className="block bg-gradient-to-r from-[#8C7853] via-[#D9A05B] to-[#C27D56] bg-clip-text text-transparent">
            FINALLY WATCHING OVER YOU.
          </span>
        </h1>

        {/* Subheading */}
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-[540px] mb-10 font-mono tracking-wide uppercase" style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0)" : "translateY(20px)", transition: "all 0.9s cubic-bezier(0.16,1,0.3,1) 0.35s" }}>
          Passive UPI tracking · AI burnout detection<br />Wing cart pools · Campus meal intelligence
        </p>

        <div className="flex gap-3 flex-wrap justify-center" style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0)" : "translateY(20px)", transition: "all 0.9s cubic-bezier(0.16,1,0.3,1) 0.5s" }}>
          <Link to="/login" className="px-7 py-3.5 rounded-full text-xs font-black text-[#0A0A0A] bg-gradient-to-br from-primary to-pb-amber hover:scale-[1.03] active:scale-[0.97] transition-all shadow-lg shadow-primary/15 text-decoration-none">
            Start Tracking Free →
          </Link>
          <a href="#features" className="px-7 py-3.5 rounded-full text-xs font-bold text-muted-foreground bg-surface-raised hover:bg-surface-interactive border border-border hover:scale-[1.02] active:scale-[0.98] transition-all text-decoration-none">See How It Works</a>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 cursor-pointer opacity-40 hover:opacity-85 transition-opacity" style={{ animation: "bounce 2.2s infinite" }}>
          <div className="text-[9px] tracking-widest text-muted-foreground font-mono">SCROLL</div>
          <div className="w-[1px] h-8 bg-gradient-to-b from-border to-transparent" />
        </div>
      </section>

      {/* ── THE PROBLEM ──────────────────────────────────────────────────── */}
      <section className="relative py-20 px-4 sm:px-6 border-t border-border">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(239,68,68,0.03), transparent 60%)" }} />
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-14">
            <SectionLabel text="The Problem We Solve" />
            <SectionHeading>Indian hostel students are financially<br /><span className="text-muted-foreground/60">flying blind, every single month.</span></SectionHeading>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {problems.map(({ icon: Icon, stat, sub, color }) => {
              const { ref, inView } = useInView();
              return (
                <div key={stat} ref={ref} className="bg-card border border-border rounded-2xl p-6 text-center transition-all duration-700" style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(24px)" }}>
                  <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${color}1a`, color }}><Icon className="h-5 w-5" /></div>
                  <div className="text-3xl font-extrabold tracking-tight mb-2 leading-none" style={{ color }}>{stat}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{sub}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-12 bg-card border border-border border-l-4 border-l-[#C27D56] rounded-2xl p-6 sm:p-8 max-w-[780px] mx-auto shadow-sm">
            <p className="text-sm sm:text-base text-foreground leading-relaxed font-medium italic">
              "Existing apps demand active manual entry or complex bank PDF parsing. Students try them for 3 days and abandon them. Meanwhile, they keep running out of money mid-month ── right when exam pressure peaks ── and respond by skipping meals."
            </p>
            <p className="text-[10px] text-[#C27D56] mt-4 font-black tracking-widest uppercase font-mono">— PocketBuddy Research Report, 2025</p>
          </div>
        </div>
      </section>

      {/* ── DASHBOARD MOCKUP + COPY ───────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
        <div className="space-y-6">
          <SectionLabel text="The Dashboard" />
          <SectionHeading>Your financial runway, live.</SectionHeading>
          <p className="text-sm text-muted-foreground leading-relaxed">One glance tells you everything ── days until broke, safe daily spend limit, AI-suggested campus meals, active Wing pools, and your burnout risk index. All computed passively from your UPI notifications.</p>
          <div className="space-y-3 pt-2">
            {["Live runway countdown with exact HH:MM:SS timer", "AI burnout risk score from 5 real behavioral signals", "Hyper-local Bedrock meal suggestions", "Crowdsourced merchant recognition", "Subscription collision calendar"].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#C27D56] shrink-0" />
                <span className="text-xs sm:text-sm text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="w-full flex justify-center py-4">
          <DashboardMockup />
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <section ref={statsRef} className="py-14 px-4 sm:px-6 bg-gradient-to-b from-transparent to-primary/2 via-transparent border-t border-b border-border">
        <div className="max-w-[960px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10">
          {[
            { value: "₹0", label: "MANUAL ENTRIES NEEDED" },
            { value: "16+h", label: "BURNOUT DETECTION THRESHOLD" },
            { value: "75%", label: "TOKEN COST REDUCTION VIA RAG" },
            { value: "∞", label: "CAMPUS MERCHANTS MAPPABLE" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center transition-all duration-800" style={{ opacity: statsInView ? 1 : 0, transform: statsInView ? "scale(1)" : "scale(0.85)" }}>
              <div className="text-3xl sm:text-4xl md:text-5xl font-black bg-gradient-to-r from-[#8C7853] to-[#D9A05B] bg-clip-text text-transparent leading-none">{value}</div>
              <div className="text-[9px] text-muted-foreground mt-2.5 tracking-wider font-mono uppercase">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── WHY US ───────────────────────────────────────────────────────── */}
      <section id="why-us" className="py-20 px-4 sm:px-6 max-w-[1100px] mx-auto">
        <div className="text-center mb-14">
          <SectionLabel text="Why PocketBuddy Wins" />
          <SectionHeading>We built what the others<br /><span className="text-muted-foreground/60">forgot to build.</span></SectionHeading>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-[500px] mx-auto mt-4 leading-relaxed">Every competitor app requires either your bank credentials, manual input, or ignores the Indian UPI ecosystem entirely. PocketBuddy solves all three.</p>
        </div>
        
        {/* Comparison table wrapper */}
        <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-left text-[11px] sm:text-xs">
            <thead>
              <tr className="border-bottom border-border">
                <th className="p-4 sm:p-5 text-muted-foreground font-bold uppercase tracking-wider bg-card">Feature</th>
                {["PocketBuddy", "Fi Money", "Mint / Walnut", "Splitwise"].map((app, i) => (
                  <th key={app} className="p-4 sm:p-5 text-center font-black border-l border-border bg-card" style={{ color: i === 0 ? "var(--primary)" : "var(--muted-foreground)" }}>
                    {i === 0 && <span className="flex items-center justify-center gap-1 text-[8px] text-pb-green tracking-widest mb-0.5"><Star className="h-2.5 w-2.5 fill-current" /> THIS</span>}
                    {app}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisons.map(({ feature, us, fi, mint, splitwise }, idx) => {
                const vals = [us, fi, mint, splitwise];
                return (
                  <tr key={feature} className="border-b border-border hover:bg-surface-raised/20 transition-colors">
                    <td className="p-4 sm:p-5 font-semibold text-foreground" style={{ background: idx % 2 === 0 ? "var(--background)" : "transparent" }}>{feature}</td>
                    {vals.map((v, ci) => (
                      <td key={ci} className="p-4 sm:p-5 text-center border-l border-border font-bold text-xs" style={{ background: ci === 0 ? (idx % 2 === 0 ? "rgba(255,107,0,0.05)" : "rgba(255,107,0,0.02)") : (idx % 2 === 0 ? "var(--background)" : "transparent") }}>
                        {v ? <Check className="mx-auto h-4 w-4 text-pb-green" /> : <span className="text-border text-xs">—</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 3 differentiators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-12">
          {[
            { icon: Lock, title: "No Bank Access Ever", body: "PocketBuddy never asks for your bank login, MPIN, or OTP. It works entirely from UPI push notification strings ── publicly visible text on your own device.", accent: "#16a34a" },
            { icon: Brain, title: "Campus-Native Intelligence", body: "Unlike generic finance apps, PocketBuddy's AI context is scoped to real campus prices, mess schedules, and hostel geography ── not internet averages.", accent: "#C27D56" },
            { icon: Handshake, title: "Network Effects by Design", body: "Every merchant classification, every pool created, every check-in improves the experience for every other student on campus. It compounds.", accent: "#5E17EB" },
          ].map(({ icon: Icon, title, body, accent }) => {
            const { ref, inView } = useInView();
            return (
              <div key={title} ref={ref} className="relative bg-card border border-border rounded-2xl p-6 overflow-hidden transition-all duration-750" style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(24px)" }}>
                <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none" style={{ background: `radial-gradient(circle at top right, ${accent}15, transparent 70%)` }} />
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${accent}1a`, color: accent }}><Icon className="h-5 w-5" /></div>
                <h4 className="text-sm font-bold text-foreground mb-2">{title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── FEATURES GRID ────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-4 sm:px-6 bg-gradient-to-b from-border/10 to-transparent border-t border-b border-border">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-14">
            <SectionLabel text="Core Feature Set" />
            <SectionHeading>Five loops that protect<br /><span className="text-muted-foreground/60">your campus survival.</span></SectionHeading>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6">
        <div className="max-w-[640px] mx-auto">
          <div className="text-center mb-14">
            <SectionLabel text="Under The Hood" />
            <SectionHeading>How it actually works</SectionHeading>
          </div>
          <div className="relative flex flex-col gap-8">
            <div className="absolute left-[18px] top-6 bottom-6 w-[1px] bg-gradient-to-b from-primary to-transparent" />
            <TimelineStep n="01" title="UPI notification fires" sub="You pay ₹30 at the hostel canteen. Your Android companion app silently intercepts the GPay push string in the background." delay={0} />
            <TimelineStep n="02" title="FastAPI parses the payload" sub="The string hits an async webhook endpoint. Bedrock extracts merchant ID, amount, and timestamp without touching your bank." delay={80} />
            <TimelineStep n="03" title="Merchant gets crowd-classified" sub="If the merchant is new, one 1-tap prompt classifies it globally for your entire campus. Next student gets it automatically." delay={160} />
            <TimelineStep n="04" title="Runway recalculates instantly" sub="Your dashboard updates the days-remaining metric, checks for subscription collisions, and flags burnout risks in real time." delay={240} />
            <TimelineStep n="05" title="AI guard activates if needed" sub="Bedrock cross-references your spending vector against the campus food database and surfaces the cheapest viable meal option near you." delay={320} />
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-b from-border/10 to-transparent border-t border-b border-border">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-14">
            <SectionLabel text="Beta Voices" />
            <SectionHeading>Students who tested it<br /><span className="text-muted-foreground/60">don't want to go back.</span></SectionHeading>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {testimonials.map(({ quote, name, role }, i) => {
              const { ref, inView } = useInView();
              return (
                <div key={name} ref={ref} className="bg-card border border-border rounded-2xl p-6 flex flex-col justify-between transition-all duration-750" style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(24px)", transitionDelay: `${i * 100}ms` }}>
                  <div>
                    <div className="text-2xl text-[#C27D56] font-bold leading-none mb-3">"</div>
                    <p className="text-xs sm:text-sm text-muted-foreground italic leading-relaxed mb-6">{quote}</p>
                  </div>
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-bold text-foreground">{name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono">{role}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── ARCHITECTURE ─────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 max-w-[1100px] mx-auto">
        <div className="text-center mb-14">
          <SectionLabel text="Architecture" />
          <SectionHeading>Built on AWS.<br /><span className="text-muted-foreground/60">Built to scale.</span></SectionHeading>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-[540px] mx-auto mt-4 leading-relaxed">A hybrid cloud stack: CloudFront fronts a static React app on S3, the existing FastAPI backend on EC2, and a burst-safe serverless pipeline for mobile payment ingestion.</p>
        </div>

        {/* Service grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { layer: "CDN + Edge", tech: "CloudFront", icon: Globe, color: "#FF9900" },
            { layer: "Static Frontend", tech: "S3 + React/Vite", icon: HardDrive, color: "#3ECF8E" },
            { layer: "Mobile Ingest API", tech: "API Gateway", icon: Network, color: "#CC2264" },
            { layer: "Serverless Compute", tech: "Lambda (Ingest + Processor)", icon: Zap, color: "#ED7100" },
            { layer: "Event Buffer", tech: "SQS Queue", icon: Layers, color: "#CC2264" },
            { layer: "Ingest Ledger", tech: "DynamoDB", icon: Database, color: "#4053D6" },
            { layer: "App Backend", tech: "EC2 + FastAPI", icon: Server, color: "#FF9900" },
            { layer: "Main Database", tech: "MongoDB Atlas", icon: Leaf, color: "#00ED64" },
          ].map(({ layer, tech, icon: Icon, color }) => {
            const { ref, inView } = useInView();
            return (
              <div key={tech} ref={ref} className="bg-card border border-border rounded-xl p-4 transition-all duration-600" style={{ opacity: inView ? 1 : 0, transform: inView ? "translateY(0)" : "translateY(18px)" }}>
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${color}1a`, color }}><Icon className="h-4 w-4" /></div>
                <div className="text-[9px] text-muted-foreground tracking-wider font-mono uppercase mb-1">{layer}</div>
                <div className="text-xs sm:text-sm font-bold text-foreground">{tech}</div>
              </div>
            );
          })}
        </div>

        {/* Flow paths */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8">
          <FlowPath
            label="Browser App Path"
            accent="#FF9900"
            nodes={["Browser", "CloudFront", "S3 / EC2 FastAPI", "MongoDB Atlas"]}
          />
          <FlowPath
            label="Mobile Ingest Path"
            accent="#00C16A"
            nodes={["Android", "CloudFront", "API Gateway", "Lambda", "SQS", "Lambda", "DynamoDB", "EC2 / Mongo"]}
          />
        </div>

        {/* Region note */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
          <span className="flex items-center gap-1.5"><Globe className="h-3 w-3 text-[#C27D56]" /> Region: ap-south-1 · Mumbai</span>
          <span className="flex items-center gap-1.5"><Lock className="h-3 w-3 text-[#C27D56]" /> Private S3 via CloudFront OAC</span>
          <span className="flex items-center gap-1.5"><Layers className="h-3 w-3 text-[#C27D56]" /> Idempotent SQS dedupe</span>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-b from-border/10 to-transparent border-t border-border">
        <div className="max-w-[720px] mx-auto">
          <div className="text-center mb-14">
            <SectionLabel text="FAQ" />
            <SectionHeading>Questions we get asked<br /><span className="text-muted-foreground/60">every time we demo.</span></SectionHeading>
          </div>
          <div className="space-y-3">
            {faqs.map(({ q, a }, i) => (
              <div key={i} className="bg-card border border-border rounded-xl overflow-hidden transition-all duration-300" style={{ borderColor: openFaq === i ? "var(--primary)" : "var(--border)" }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex justify-between items-center gap-4 p-4 sm:p-5 bg-transparent border-none cursor-pointer outline-none text-left">
                  <span className="text-xs sm:text-sm font-bold text-foreground leading-normal">{q}</span>
                  <span className="text-base text-[#C27D56] font-extrabold flex-shrink-0 transition-transform duration-300" style={{ transform: openFaq === i ? "rotate(45deg)" : "rotate(0deg)" }}>+</span>
                </button>
                {openFaq === i && (
                  <div className="px-4 sm:px-5 pb-5 text-xs text-muted-foreground leading-relaxed animate-fade-in">{a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ───────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-[800px] mx-auto text-center rounded-[28px] border border-primary/20 bg-gradient-to-br from-primary/8 to-primary/3 p-8 sm:p-14 relative overflow-hidden shadow-md">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[240px] sm:w-[400px] h-[200px] pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,107,0,0.18), transparent 70%)" }} />
          <SectionLabel text="Don't Go Broke Before Exams" />
          <SectionHeading className="mb-4">Your financial guard<br />is one tap away.</SectionHeading>
          <p className="text-xs sm:text-sm text-muted-foreground mb-8 max-w-[480px] mx-auto leading-relaxed">Free for all campus students. No credit card. No complex setup.<br />Just install the Android companion and you're live in 60 seconds.</p>
          <Link to="/login" className="inline-block px-8 py-3.5 rounded-full text-xs font-black text-[#0A0A0A] bg-gradient-to-br from-primary to-pb-amber hover:scale-[1.03] active:scale-[0.97] transition-all shadow-lg shadow-primary/20 text-decoration-none">
            Create Free Account →
          </Link>
          {/* Trust badges */}
          <div className="flex justify-center gap-4 sm:gap-6 mt-8 flex-wrap">
            {[
              { icon: Lock, label: "No bank access" },
              { icon: WifiOff, label: "Works offline" },
              { icon: GraduationCap, label: "Built for India" },
              { icon: Zap, label: "Setup in 60s" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground font-semibold font-mono">
                <Icon className="h-3.5 w-3.5 text-[#C27D56]" />{label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 px-4 sm:px-6 max-w-[1100px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-[#D9A05B] flex items-center justify-center">
            <span className="font-black text-[10px] text-[#0A0A0A]">P</span>
          </div>
          <span className="text-xs font-extrabold text-muted-foreground">PocketBuddy</span>
        </div>
        <div className="text-[10px] text-muted-foreground opacity-75 font-mono">CAMPUS FINANCIAL GUARD · AWS HACKATHON 2025 · THEME 4: AI FOR CAMPUS</div>
        <Link to="/login" className="text-xs font-bold text-[#C27D56] hover:text-[#b45309] transition-colors text-decoration-none">Sign In →</Link>
      </footer>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: var(--background); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .mask-image-radial {
          mask-image: radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent);
          -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 50%, black, transparent);
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
