import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { AppShell, MobileMenuButton } from "@/components/AppShell";
import { Smartphone, Edit3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { rupees, relativeTime, absoluteDate, getCycleStart } from "@/lib/format";
import { getProfile, getTransactions, updateTransaction, getCatalog, addCatalogItem } from "@/lib/api/db.functions";

export const Route = createFileRoute("/_authenticated/transactions")({
  ssr: false,
  component: TxnsPage,
});

type Txn = any;
type Source = "all" | "companion" | "manual";
type Range = "cycle" | "7" | "30" | "all";

// Fallback categories used only if catalog API fails
const FALLBACK_CATEGORIES = [
  { v: "food", l: "Food" },
  { v: "stationery", l: "Stationery" },
  { v: "travel", l: "Travel" },
  { v: "subscription", l: "Subscription" },
  { v: "other", l: "Other" },
];

function TxnsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [cat, setCat] = useState("all");
  const [src, setSrc] = useState<Source>("all");
  const [range, setRange] = useState<Range>("cycle");
  const [limit, setLimit] = useState(20);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingTxn, setEditingTxn] = useState<any | null>(null);

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

  // Catalog-driven categories
  const { data: catalogCategories } = useQuery({
    queryKey: ["catalog", "transaction-categories"],
    enabled: !!user,
    queryFn: () => getCatalog("transaction-categories"),
    staleTime: 5 * 60 * 1000,
  });

  const categories = useMemo(() => {
    if (catalogCategories && catalogCategories.length > 0) {
      return catalogCategories.map((c: any) => ({ v: c.value, l: c.label }));
    }
    return FALLBACK_CATEGORIES;
  }, [catalogCategories]);

  // Build filter list: "All" + catalog categories + "Unmapped"
  const catFilters = useMemo(() => {
    return [
      { v: "all", l: "All" },
      ...categories,
      { v: "unmapped", l: "Unmapped" },
    ];
  }, [categories]);

  const filtered = useMemo(() => {
    if (!txns) return [];
    let out = txns;
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
      {/* Page Header */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 md:-mx-10 md:-mt-8 lg:-mx-12 lg:-mt-10 mb-6 flex h-14 items-center justify-between border-b border-border bg-background/85 backdrop-blur-md px-6 md:px-10 lg:px-12">
        <div className="flex items-center gap-3 min-w-0">
          <MobileMenuButton />
          <h1 className="text-base sm:text-lg font-black tracking-wider text-foreground uppercase truncate">Transaction History</h1>
        </div>
      </div>

      <div className="py-4 pb-32 space-y-6">
        {/* Filter controls */}
        <div className="space-y-3.5 border-b border-border/50 pb-4">
          <div className="flex gap-1.5 overflow-x-auto pb-2 no-scrollbar">
            {catFilters.map((c) => (
              <button
                key={c.v}
                id={`filter-txn-${c.v}`}
                onClick={() => setCat(c.v)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1 text-xs uppercase tracking-wider font-bold transition-all border cursor-pointer ${cat === c.v ? "bg-primary border-primary text-primary-foreground" : "bg-surface-raised border-border text-muted-foreground hover:text-foreground hover:bg-surface-interactive"}`}
              >
                {c.l}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1">Source</span>
              <div className="bg-surface-raised border border-border/80 p-0.5 rounded-full flex items-center shadow-inner">
                {(["all", "companion", "manual"] as const).map((s) => (
                  <button
                    key={s}
                    id={`filter-source-${s}`}
                    onClick={() => setSrc(s)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${src === s ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {s === "companion" ? "Companion" : s === "manual" ? "Manual" : "All"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest pl-1 sm:hidden">Range</span>
              <Select value={range} onValueChange={(v) => setRange(v as Range)}>
                <SelectTrigger id="select-txn-range" className="h-8 flex-1 sm:w-40 text-xs font-bold uppercase tracking-wider bg-surface border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border border-border text-foreground">
                  <SelectItem value="cycle">This Cycle</SelectItem>
                  <SelectItem value="7">Last 7 Days</SelectItem>
                  <SelectItem value="30">Last 30 Days</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
        {isLoading && <Skeleton className="h-40 w-full bg-white/5 border-none" />}
        {!isLoading && visible.length === 0 && (
          <p className="py-12 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">
            No transactions found.
          </p>
        )}

        {!isLoading && visible.length > 0 && (
          <div className="border border-border bg-surface rounded-2xl overflow-hidden divide-y divide-border">
            {visible.map((t) => {
              const isCompanion = t.source.startsWith("companion");
              const notificationPreview = t.notification_preview;
              return (
                <div key={t.id} className="p-4 transition-colors hover:bg-surface-raised/60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-bold truncate ${t.is_mapped ? "text-foreground" : "italic text-warning/90"}`}
                      >
                        <span className="inline-flex items-center mr-2 align-middle text-zinc-500">
                          {isCompanion ? <Smartphone className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                        </span>
                        {t.mapped_merchant_name ?? t.raw_merchant_string}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {t.category && (
                          <Badge
                            variant="outline"
                            className="text-xs font-black tracking-widest text-zinc-500 uppercase py-0 px-2 bg-white/5 border-border"
                          >
                            {t.category}
                          </Badge>
                        )}
                        <button
                          onClick={() => setEditingTxn(t)}
                          className="rounded-full px-4 py-1.5 text-xs font-bold bg-white/5 border border-border hover:bg-white/10 hover:border-white/15 transition-all cursor-pointer uppercase text-foreground"
                        >
                          Edit
                        </button>
                        {isCompanion && notificationPreview && (
                          <button
                            onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                            className="text-xs font-bold text-primary hover:text-primary/85 transition-colors uppercase tracking-wider cursor-pointer"
                          >
                            {expanded === t.id ? "Hide preview" : "Show preview"}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-foreground tnum">{rupees(t.amount)}</p>
                      <p className="text-xs text-zinc-500 font-semibold mt-0.5">{relativeTime(t.created_at)}</p>
                      <p className="text-[11px] text-zinc-600 font-bold uppercase tracking-wide mt-0.5">{absoluteDate(t.created_at)}</p>
                    </div>
                  </div>
                  {expanded === t.id && notificationPreview && (
                    <pre className="mt-3 rounded-lg bg-background border border-border p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap select-all shadow-inner">
                      {notificationPreview}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filtered.length > visible.length && (
          <button
            onClick={() => setLimit((l) => l + 20)}
            className="mt-4 w-full rounded-md py-2.5 text-xs font-bold uppercase tracking-wider bg-surface-raised border border-border text-foreground hover:bg-surface-interactive hover:border-white/15 transition-all cursor-pointer"
          >
            Load more
          </button>
        )}
      </div>
    </div>

      <div className="fixed bottom-20 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-8 left-0 right-0 z-40 flex justify-center pointer-events-none w-full animate-[fadeIn_0.3s_ease-out]">
        <div className="bg-surface/85 backdrop-blur-md px-5 py-2.5 rounded-full border border-border shadow-[0_12px_32px_rgba(0,0,0,0.5)] flex items-center justify-between gap-6 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground w-fit pointer-events-auto">
          <span>Showing: <strong className="text-foreground">{visible.length}</strong> txns</span>
          <span className="w-[1px] h-3 bg-border" />
          <span>Total: <strong className="text-foreground">{rupees(total)}</strong></span>
        </div>
      </div>

      <Dialog open={!!editingTxn} onOpenChange={(o) => { if (!o) setEditingTxn(null); }}>
        <DialogContent className="sm:max-w-md bg-background border border-border text-foreground" id="dialog-edit-transaction">
          {editingTxn && (
            <EditTxnForm
              txn={editingTxn}
              categories={categories}
              onClose={() => {
                setEditingTxn(null);
                qc.invalidateQueries({ queryKey: ["txns"] });
                qc.invalidateQueries({ queryKey: ["insights"] });
                qc.invalidateQueries({ queryKey: ["wellness-insights"] });
                qc.invalidateQueries({ queryKey: ["catalog", "transaction-categories"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function EditTxnForm({ txn, categories, onClose }: { txn: any; categories: { v: string; l: string }[]; onClose: () => void }) {
  const [name, setName] = useState(txn.mapped_merchant_name ?? txn.raw_merchant_string);
  const knownValues = categories.map((c) => c.v);
  const isKnownCat = knownValues.includes(txn.category ?? "");
  const [cat, setCat] = useState<string>(isKnownCat ? (txn.category ?? "food") : "other");
  const [customCat, setCustomCat] = useState(isKnownCat ? "" : (txn.category ?? ""));
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Enter merchant display name");
      return;
    }
    if (cat === "other" && !customCat.trim()) {
      toast.error("Enter custom category");
      return;
    }
    setBusy(true);
    try {
      let finalCategory = cat;
      if (cat === "other" && customCat.trim()) {
        finalCategory = customCat.trim().toLowerCase();
        // Also add to the catalog for reuse
        try {
          await addCatalogItem("transaction-categories", { label: customCat.trim() });
        } catch {
          // Idempotent — ignore if it already exists
        }
      }
      await updateTransaction({
        id: txn.id,
        data: {
          mapped_merchant_name: name.trim(),
          category: finalCategory,
        },
      });
      toast.success("Transaction updated.");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update transaction");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit Transaction</DialogTitle>
      </DialogHeader>
      
      <div className="space-y-4 py-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Original Reference</label>
          <code className="block rounded bg-surface-raised px-3 py-1.5 text-xs select-all border border-border truncate">{txn.raw_merchant_string}</code>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Display Name</label>
          <Input
            id="input-edit-txn-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Canteen, Stationery Shop"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Category</label>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((c) => (
              <button
                key={c.v}
                type="button"
                onClick={() => setCat(c.v)}
                className={`rounded-md border p-3 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  cat === c.v ? "border-primary bg-primary/10 text-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.l}
              </button>
            ))}
          </div>
        </div>

        {cat === "other" && (
          <div className="space-y-1">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Custom Category</label>
            <Input
              id="input-edit-txn-custom-category"
              value={customCat}
              onChange={(e) => setCustomCat(e.target.value)}
              placeholder="e.g., Laundry, Books, Printing"
            />
            <p className="text-[10px] text-zinc-500 pl-1">This category will be saved and available for future transactions.</p>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button id="btn-save-edit-txn" disabled={busy} onClick={save} className="w-full bg-success text-white hover:bg-success/90">
          Save Changes
        </Button>
      </DialogFooter>
    </>
  );
}
