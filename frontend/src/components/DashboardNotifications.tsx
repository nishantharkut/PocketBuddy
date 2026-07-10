import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Bell, BellOff, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DashboardNotificationAction = {
  label: string;
  onClick: () => void | Promise<void>;
  variant?: "primary" | "secondary";
};

export type DashboardNotificationItem = {
  id: string;
  title: string;
  body: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "danger" | "warning" | "neutral";
  meta?: string;
  actions?: DashboardNotificationAction[];
  content?: ReactNode;
};

type DashboardNotificationsProps = {
  items: DashboardNotificationItem[];
  storageKey: string;
};

const toneStyles = {
  danger: "border-destructive/25 bg-destructive/5 text-destructive",
  warning: "border-amber-500/25 bg-amber-500/5 text-amber-600 dark:text-amber-400",
  neutral: "border-border bg-surface-raised text-muted-foreground",
};

function readHiddenNotifications(storageKey: string) {
  try {
    const stored = localStorage.getItem(storageKey);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function DashboardNotifications({ items, storageKey }: DashboardNotificationsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    setDismissed([]);
    setHidden(readHiddenNotifications(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const visibleItems = useMemo(
    () => items.filter((item) => !dismissed.includes(item.id) && !hidden.includes(item.id)),
    [dismissed, hidden, items],
  );

  const hiddenAvailable = hidden.length > 0;

  function dismiss(id: string) {
    setDismissed((current) => (current.includes(id) ? current : [...current, id]));
  }

  function hideForever(id: string) {
    setDismissed((current) => (current.includes(id) ? current : [...current, id]));
    setHidden((current) => {
      const next = current.includes(id) ? current : [...current, id];
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  function resetHidden() {
    localStorage.removeItem(storageKey);
    setHidden([]);
    setDismissed([]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Dashboard notifications"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-raised"
      >
        <Bell className="h-4 w-4" />
        {visibleItems.length > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border border-background bg-destructive px-1 text-[10px] font-bold leading-none text-white">
            {visibleItems.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[calc(100vw-2rem)] max-w-[25rem] rounded-2xl border border-border bg-background shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">
                {visibleItems.length ? `${visibleItems.length} active` : "No active alerts"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {hiddenAvailable && (
                <button
                  type="button"
                  onClick={resetHidden}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2 text-[10px] font-semibold text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                aria-label="Close notifications"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-2">
            {visibleItems.length ? (
              <div className="space-y-2">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const tone = item.tone ?? "neutral";
                  return (
                    <div key={item.id} className="rounded-xl border border-border bg-surface p-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${toneStyles[tone]}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">{item.title}</p>
                              {item.meta && (
                                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{item.meta}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => dismiss(item.id)}
                              className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                            >
                              Hide
                            </button>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>

                          {item.content && <div className="mt-3">{item.content}</div>}

                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {item.actions?.map((action) => (
                              <Button
                                key={action.label}
                                type="button"
                                size="sm"
                                variant={action.variant === "primary" ? "default" : "outline"}
                                className={
                                  action.variant === "primary"
                                    ? "h-8 px-3 text-[11px] font-semibold"
                                    : "h-8 border-border bg-surface-raised px-3 text-[11px] font-semibold text-foreground hover:bg-surface-interactive"
                                }
                                onClick={() => action.onClick()}
                              >
                                {action.label}
                              </Button>
                            ))}
                            <button
                              type="button"
                              onClick={() => hideForever(item.id)}
                              className="ml-auto flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-muted-foreground hover:bg-surface-raised hover:text-foreground"
                            >
                              <BellOff className="h-3.5 w-3.5" />
                              Hide forever
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-border bg-surface p-5 text-center">
                <div>
                  <Bell className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-2 text-sm font-semibold text-foreground">No active notifications</p>
                  <p className="mt-1 text-xs text-muted-foreground">Spend velocity and routine nudges will appear here.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
