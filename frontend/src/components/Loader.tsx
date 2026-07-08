import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export function PocketSpinner({ className, size = "md" }: LoaderProps) {
  const sizeClasses = {
    xs: "h-6 w-6",
    sm: "h-10 w-10",
    md: "h-16 w-16",
    lg: "h-24 w-24",
    xl: "h-36 w-36",
  };

  return (
    <div className={cn("relative flex items-center justify-center select-none pointer-events-none", className)}>
      <svg
        viewBox="0 0 100 100"
        className={cn("filter drop-shadow(0px 6px 16px rgba(232,111,81,0.18))", sizeClasses[size])}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="loaderPocketTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF9F43" />
            <stop offset="100%" stopColor="#FF6B00" />
          </linearGradient>
          <linearGradient id="loaderPocketSides" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <linearGradient id="loaderPocketBottom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6B00" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <linearGradient id="loaderCoinGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>
          <filter id="loaderCoinShadow" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="3.5" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.32" />
          </filter>
        </defs>

        {/* Origami Pocket Base */}
        <path d="M20 38 L50 56 L20 72 Z" fill="url(#loaderPocketSides)" opacity="0.85" />
        <path d="M80 38 L50 56 L80 72 Z" fill="url(#loaderPocketSides)" opacity="0.7" />
        <path d="M50 56 L80 72 L50 85 L20 72 Z" fill="url(#loaderPocketBottom)" />
        <path d="M50 20 L80 38 H20 Z" fill="url(#loaderPocketTop)" opacity="0.9" />

        {/* 3D Spinning/Floating Coin inside Pocket */}
        <g className="animate-coin-float-spin" style={{ transformOrigin: "50px 52px" }}>
          <circle
            cx="50"
            cy="52"
            r="14"
            fill="url(#loaderCoinGrad)"
            stroke="#FF6B00"
            strokeWidth="1.6"
            filter="url(#loaderCoinShadow)"
          />
          {/* Official Indian Rupee vector symbol */}
          <path
            d="M4 3.06h2.726c1.22 0 2.12.575 2.325 1.724H4v1.051h5.051C8.855 7.001 8 7.558 6.788 7.558H4v1.317L8.437 14h2.11L6.095 8.884h.855c2.316-.018 3.465-1.476 3.688-3.049H12V4.784h-1.345c-.08-.778-.357-1.335-.793-1.732H12V2H4z"
            transform="translate(40, 42) scale(1.25)"
            fill="#0F1219"
          />
        </g>
      </svg>
    </div>
  );
}

const loadingTexts = [
  "Securing campus pocket...",
  "Syncing digital ledger...",
  "Guarding daily allowances...",
  "Analyzing campus dining...",
  "Calibrating peer pools...",
  "Opening sandbox vaults...",
];

export function FullPageLoader({ message }: { message?: string }) {
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % loadingTexts.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
      <div className="flex flex-col items-center gap-7 text-center max-w-sm px-8">
        <div className="relative">
          {/* Subtle glowing ring behind pocket */}
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse" />
          <PocketSpinner size="xl" />
        </div>
        <div className="space-y-2 relative z-10">
          <h2 className="font-display font-extrabold text-xl text-foreground tracking-tight">
            PocketBuddy<span className="text-primary font-black">.</span>
          </h2>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-[0.15em] h-5 transition-all duration-300">
            {message || loadingTexts[textIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TopProgressBar({ active }: { active: boolean }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }

    setProgress(20);

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        // Slow down as it reaches the end
        const diff = (100 - prev) * 0.12;
        return Math.min(prev + diff, 92);
      });
    }, 300);

    return () => {
      clearInterval(timer);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px] bg-white/5 pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-primary via-pb-amber to-primary shadow-[0_1px_8px_rgba(232,111,81,0.5)] transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
