import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rupees, relativeTime, absoluteDate, getCycleStart } from "@/lib/format";
import { getProfile, getTransactions } from "@/lib/api/db.functions";

export const Route = createFileRoute("/_authenticated/transactions")({
  ssr: false,
  component: TxnsPage,
});

type Txn = any;
type Cat = "all" | "food" | "stationery" | "travel" | "subscription" | "other" | "unmapped";
type Source = "all" | "companion" | "manual";
type Range = "cycle" | "7" | "30" | "all";

const CAT_FILTERS: { v: Cat; l: string }[] = [
  { v: "all", l: "All" },
  { v: "food", l: "Food" },
  { v: "stationery", l: "Stationery" },
  { v: "travel", l: "Travel" },
  { v: "subscription", l: "Subscription" },
  { v: "other", l: "Other" },
  { v: "unmapped", l: "Unmapped" },
];

function TxnsPage() {
  const { user } = useAuth();
  const [cat, setCat] = useState<Cat>("all");
  const [src, setSrc] = useState<Source>("all");
  const [range, setRange] = useState<Range>("cycle");
  const [limit, setLimit] = useState(20);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: () => getProfile(),
  });

  const { data: txns, isLoading } = useQuery({
    queryKey: ["txns", user?.id],
    enabled: !!user,
    queryFn: () => getTransactions(),
  });

  const filtered = useMemo(() => {
    if (!txns) return [];
    let out = txns;
    // range
    const now = new Date();
    if (range === "cycle" && profile?.cycle_start_day) {
      const start = getCycleStart(profile.cycle_start_day);
      out = out.filter((t) => new Date(t.created_at) >= start);
    } else if (range === "7") {
      const c = new Date(now);
      c.setDate(c.getDate() - 7);
      out = out.filter((t) => new Date(t.created_at) >= c);
    } else if (range === "30") {
      const c = new Date(now);
      c.setDate(c.getDate() - 30);
      out = out.filter((t) => new Date(t.created_at) >= c);
    }
    if (cat === "unmapped") out = out.filter((t) => !t.is_mapped);
    else if (cat !== "all") out = out.filter((t) => t.category === cat);
    if (src === "companion") out = out.filter((t) => t.source.startsWith("companion"));
    else if (src === "manual") out = out.filter((t) => t.source === "manual");
    return out;
  }, [txns, cat, src, range, profile]);

  const visible = filtered.slice(0, limit);
  const total = filtered.reduce((s, t) => s + t.amount, 0);

  return (
    <AppShell>
      <div className="sticky top-0 z-30 border-b border-border bg-[color:var(--surface)]">
        <div className="flex h-14 items-center px-4">
          <h1 className="text-[14px] font-semibold tracking-[0.15em]">TRANSACTION HISTORY</h1>
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
          {CAT_FILTERS.map((c) => (
            <button
              key={c.v}
              id={`filter-txn-${c.v}`}
              onClick={() => setCat(c.v)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-[12px] ${cat === c.v ? "bg-[color:var(--pb-blue)] text-white" : "bg-[color:var(--surface-raised)] border border-border text-muted-foreground"}`}
            >
              {c.l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 pb-2">
          <span className="text-[11px] text-muted-foreground">Source:</span>
          {(["all", "companion", "manual"] as const).map((s) => (
            <button
              key={s}
              id={`filter-source-${s}`}
              onClick={() => setSrc(s)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] capitalize ${src === s ? "bg-[color:var(--pb-purple)] text-white" : "bg-[color:var(--surface-raised)] text-muted-foreground"}`}
            >
              {s === "companion" ? "📲 Companion" : s === "manual" ? "✍️ Manual" : "All"}
            </button>
          ))}
          <div className="ml-auto">
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger id="select-txn-range" className="h-7 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cycle">This Cycle</SelectItem>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 pb-24 space-y-1.5">
        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && visible.length === 0 && (
          <p className="py-10 text-center text-[13px] text-muted-foreground">
            No transactions found.
          </p>
        )}
        {visible.map((t) => {
          const isCompanion = t.source.startsWith("companion");
          return (
            <div key={t.id} className="rounded-xl reactbits-card p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[13px] truncate ${t.is_mapped ? "" : "italic text-[color:var(--pb-amber)]"}`}
                  >
                    <span className="mr-1">{isCompanion ? "📲" : "✍️"}</span>
                    {t.mapped_merchant_name ?? t.raw_merchant_string}
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {t.category && (
                      <Badge
                        variant="outline"
                        className="text-[9px] py-0 px-1.5 text-muted-foreground"
                      >
                        {t.category}
                      </Badge>
                    )}
                    {isCompanion && t.raw_notification_body && (
                      <button
                        onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                        className="text-[10px] text-[color:var(--pb-blue)]"
                      >
                        {expanded === t.id ? "Hide raw" : "Show raw"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold tnum">{rupees(t.amount)}</p>
                  <p className="text-[11px] text-muted-foreground">{relativeTime(t.created_at)}</p>
                  <p className="text-[10px] text-muted-foreground">{absoluteDate(t.created_at)}</p>
                </div>
              </div>
              {expanded === t.id && t.raw_notification_body && (
                <pre className="mt-2 rounded bg-[color:var(--surface-raised)] p-2 text-[11px] font-mono whitespace-pre-wrap">
                  {t.raw_notification_body}
                </pre>
              )}
            </div>
          );
        })}
        {filtered.length > visible.length && (
          <button
            onClick={() => setLimit((l) => l + 20)}
            className="mt-2 w-full rounded-md reactbits-btn py-2 text-[13px]"
          >
            Load more
          </button>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-[color:var(--surface-raised)] px-4 py-3">
        <p className="text-[13px] font-semibold tnum">
          Showing: {visible.length} transactions • Total: {rupees(total)}
        </p>
      </div>
    </AppShell>
  );
}
