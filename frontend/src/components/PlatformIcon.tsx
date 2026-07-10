import { Coffee, Package, ShoppingBag, ShoppingBasket, ShoppingCart, Store } from "lucide-react";

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

  const label = `${name || ""} ${platform || ""}`.toLowerCase();
  const FallbackIcon = label.match(/food|canteen|mess|cafe|coffee|chai|juice|stall|restaurant|snack/)
    ? Coffee
    : label.match(/grocery|grocer|basket|mart|kirana|blinkit|zepto|instamart/)
      ? ShoppingBasket
      : label.match(/cart|checkout|order|pool/)
        ? ShoppingCart
        : label.match(/store|shop|market|merchant/)
          ? Store
          : label.match(/delivery|bag/)
            ? ShoppingBag
            : Package;

  return (
    <div className={`flex items-center justify-center rounded-xl border border-border bg-surface-raised text-muted-foreground shrink-0 ${className}`}>
      <FallbackIcon className="h-[58%] w-[58%]" strokeWidth={2.1} />
    </div>
  );
}

