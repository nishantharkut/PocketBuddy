import { ShoppingBag, ShoppingBasket, ShoppingCart, Store } from "lucide-react";

export function PlatformIcon({ platform, name, className = "h-5 w-5" }: { platform: string; name?: string; className?: string }) {
  const normalized = platform.toLowerCase();
  
  let logoSrc = "";
  let shadowClass = "";
  
  if (normalized === "zepto" || normalized.includes("zepto")) {
    logoSrc = "/logos/platforms/zepto.svg";
    shadowClass = "shadow-[0_2px_8px_rgba(94,23,235,0.2)]";
  } else if (normalized === "blinkit" || normalized.includes("blinkit")) {
    logoSrc = "/logos/platforms/blinkit.svg";
    shadowClass = "shadow-[0_2px_8px_rgba(247,236,19,0.15)]";
  } else if (normalized === "swiggy_instamart" || normalized === "swiggy instamart" || normalized.includes("instamart") || normalized.includes("swiggy")) {
    logoSrc = "/logos/platforms/swiggy_instamart.png";
    shadowClass = "shadow-[0_2px_8px_rgba(252,128,25,0.2)]";
  } else if (normalized === "amazon_now" || normalized === "amazon now" || normalized.includes("amazon")) {
    logoSrc = "/logos/platforms/amazon_now.svg";
    shadowClass = "shadow-[0_2px_8px_rgba(255,153,0,0.15)]";
  } else if (normalized === "bigbasket" || normalized.includes("basket")) {
    logoSrc = "/logos/platforms/bigbasket.svg";
    shadowClass = "shadow-[0_2px_8px_rgba(132,194,37,0.15)]";
  } else if (normalized === "jiomart" || normalized.includes("jiomart")) {
    logoSrc = "/logos/platforms/jiomart.svg";
    shadowClass = "shadow-[0_2px_8px_rgba(227,5,19,0.15)]";
  }

  if (logoSrc) {
    const isZepto = normalized === "zepto" || normalized.includes("zepto");
    const isJioMart = normalized === "jiomart" || normalized.includes("jiomart");
    const paddingClass = (isZepto || isJioMart) ? "p-0" : "p-0.5";
    return (
      <div className={`flex items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-white shrink-0 ${shadowClass} ${paddingClass} ${className}`}>
        <img
          src={logoSrc}
          alt={name || platform}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  // Fallback for custom platforms - generate a beautiful initials badge with deterministic gradient
  const displayName = name || platform || "Custom";
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  
  let hash = 0;
  for (let i = 0; i < displayName.length; i++) {
    hash = displayName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const gradients = [
    "from-[#EC4899] to-[#F43F5E]", // pink-rose
    "from-[#8B5CF6] to-[#D946EF]", // violet-fuchsia
    "from-[#3B82F6] to-[#06B6D4]", // blue-cyan
    "from-[#10B981] to-[#3B82F6]", // emerald-blue
    "from-[#F59E0B] to-[#EF4444]", // amber-red
    "from-[#6366F1] to-[#8B5CF6]", // indigo-violet
  ];
  
  const gradient = gradients[Math.abs(hash) % gradients.length];
  
  return (
    <div className={`flex items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white font-black text-[9px] tracking-wider shrink-0 shadow-md ${className}`}>
      {initial}
    </div>
  );
}

