import { Zap, ShoppingBag, ShoppingBasket, ShoppingCart, Store } from "lucide-react";

export function PlatformIcon({ platform, name, className = "h-5 w-5" }: { platform: string; name?: string; className?: string }) {
  const normalized = platform.toLowerCase();
  
  if (normalized === "zepto") {
    return (
      <div className={`flex items-center justify-center rounded-full bg-[#5E17EB] text-white shrink-0 shadow-[0_2px_8px_rgba(94,23,235,0.45)] ${className}`}>
        <Zap className="h-3 w-3 fill-current stroke-[2.5]" />
      </div>
    );
  }
  
  if (normalized === "blinkit") {
    return (
      <div className={`flex items-center justify-center rounded-full bg-[#F7EC13] text-black shrink-0 shadow-[0_2px_8px_rgba(247,236,19,0.35)] ${className}`}>
        <ShoppingBag className="h-3 w-3 stroke-[2.5]" />
      </div>
    );
  }
  
  if (normalized === "swiggy_instamart" || normalized === "swiggy instamart" || normalized.includes("instamart")) {
    return (
      <div className={`flex items-center justify-center rounded-full bg-[#FC8019] text-white shrink-0 shadow-[0_2px_8px_rgba(252,128,25,0.45)] ${className}`}>
        <ShoppingCart className="h-3 w-3 stroke-[2.5]" />
      </div>
    );
  }
  
  if (normalized === "bigbasket" || normalized.includes("basket")) {
    return (
      <div className={`flex items-center justify-center rounded-full bg-[#84C225] text-white shrink-0 shadow-[0_2px_8px_rgba(132,194,37,0.45)] ${className}`}>
        <ShoppingBasket className="h-3 w-3 stroke-[2.5]" />
      </div>
    );
  }
  
  if (normalized === "jiomart" || normalized.includes("jiomart")) {
    return (
      <div className={`flex items-center justify-center rounded-full bg-[#0078AD] text-white shrink-0 shadow-[0_2px_8px_rgba(0,120,173,0.45)] ${className}`}>
        <Store className="h-3 w-3 stroke-[2.5]" />
      </div>
    );
  }

  if (normalized === "amazon_now" || normalized === "amazon now" || normalized.includes("amazon")) {
    return (
      <div className={`flex items-center justify-center rounded-full bg-[#FF9900] text-black shrink-0 shadow-[0_2px_8px_rgba(255,153,0,0.45)] ${className}`}>
        <ShoppingBag className="h-3 w-3 stroke-[2.5]" />
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
    <div className={`flex items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-white font-extrabold text-[10px] tracking-wider shrink-0 shadow-md ${className}`}>
      {initial}
    </div>
  );
}
