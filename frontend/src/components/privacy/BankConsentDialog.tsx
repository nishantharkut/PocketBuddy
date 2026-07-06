import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getAccountAggregatorInstitutions } from "@/lib/api/db.functions";

const RANGE_OPTIONS = [
  { value: 30, label: "30 days", hint: "Recent spending" },
  { value: 90, label: "90 days", hint: "Better patterns" },
  { value: 180, label: "180 days", hint: "Longest view" },
];

export type BankConsentPayload = {
  bankCode: string;
  bankName: string;
  bankShortName?: string;
  requestedRangeDays: number;
  aaHandle?: string;
};

type AAInstitution = {
  id: string;
  name: string;
  short_name?: string;
  type?: string;
  regulator?: string;
  status?: string;
  domain?: string;
  logo_url?: string;
};

type AAInstitutionResponse = {
  source?: string;
  source_url?: string;
  updated_hint?: string;
  total_count?: number;
  institutions?: AAInstitution[];
};

type BankConsentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: BankConsentPayload) => void;
  busy?: boolean;
  existingBankName?: string;
  existingConsentStatus?: string;
};

type ConsentStep = "bank" | "review" | "confirm";

const CONSENT_STEPS: Array<{ key: ConsentStep; label: string }> = [
  { key: "bank", label: "Institution" },
  { key: "review", label: "Consent" },
  { key: "confirm", label: "Confirm" },
];

export function BankConsentDialog({
  open,
  onOpenChange,
  onConfirm,
  busy = false,
  existingBankName,
  existingConsentStatus,
}: BankConsentDialogProps) {
  const [selectedBankId, setSelectedBankId] = useState("");
  const [requestedRangeDays, setRequestedRangeDays] = useState(30);
  const [aaHandle, setAaHandle] = useState("");
  const [search, setSearch] = useState("");
  const [step, setStep] = useState<ConsentStep>("bank");
  const hasExistingConsent = Boolean(existingBankName && ["active", "pending"].includes(existingConsentStatus || ""));

  const { data: institutionData, isLoading, isError } = useQuery<AAInstitutionResponse>({
    queryKey: ["aa-institutions"],
    enabled: open,
    queryFn: () => getAccountAggregatorInstitutions(),
    staleTime: 10 * 60 * 1000,
  });

  const institutions = institutionData?.institutions ?? [];
  const query = search.trim().toLowerCase();
  const filteredInstitutions = institutions.filter((institution) => {
    if (!query) return true;
    return (
      institution.name.toLowerCase().includes(query) ||
      (institution.short_name || "").toLowerCase().includes(query) ||
      (institution.type || "").toLowerCase().includes(query)
    );
  });
  const visibleInstitutions = filteredInstitutions.slice(0, query ? 36 : 12);
  const selectedBank =
    (selectedBankId ? institutions.find((institution) => institution.id === selectedBankId) : undefined) ??
    filteredInstitutions[0] ??
    institutions[0];

  useEffect(() => {
    if (open) {
      setStep("bank");
      setSearch("");
    }
  }, [open]);

  function submitConsent() {
    if (!selectedBank) return;
    onConfirm({
      bankCode: selectedBank.id,
      bankName: selectedBank.name,
      bankShortName: selectedBank.short_name,
      requestedRangeDays,
      aaHandle: aaHandle.trim() || undefined,
    });
  }

  function goNext() {
    if (step === "bank") {
      if (!selectedBank) return;
      setSelectedBankId(selectedBank.id);
      setStep("review");
      return;
    }
    if (step === "review") {
      setStep("confirm");
      return;
    }
    submitConsent();
  }

  function goBack() {
    if (step === "confirm") setStep("review");
    else if (step === "review") setStep("bank");
  }

  const selectedBankLabel = selectedBank?.name || "Select a bank";
  const registryCount = institutionData?.total_count || institutions.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[720px] flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 shadow-2xl sm:max-h-[88vh]">
        <div className="border-b border-border bg-surface px-4 py-4 sm:px-5">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-start gap-3 pr-8">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-raised">
                <span className="text-[11px] font-black tracking-wide text-foreground">RBI</span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-border bg-background text-[10px] font-semibold text-muted-foreground">
                    Account Aggregator framework
                  </Badge>
                  <Badge variant="outline" className="border-success/30 bg-success/10 text-[10px] font-semibold text-success">
                    Read-only
                  </Badge>
                </div>
                <DialogTitle className="mt-2 text-lg font-semibold leading-tight tracking-tight text-foreground">
                  Connect your bank
                </DialogTitle>
                <DialogDescription className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Approve consent for read-only transaction history. PocketBuddy never asks for bank password, OTP, MPIN, or permission to move money.
                </DialogDescription>
              </div>
            </div>
            {!hasExistingConsent && <StepIndicator step={step} />}
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {hasExistingConsent ? (
            <ExistingConsentState bankName={existingBankName || "Connected bank"} status={existingConsentStatus || "active"} />
          ) : (
            <>
              <ConsentPath selectedBankName={selectedBank?.short_name || selectedBank?.name || "your bank"} />

              {step === "bank" ? (
                <section className="mt-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Choose financial institution</h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Select the bank that holds the account you want PocketBuddy to verify.
                      </p>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {registryCount ? `${registryCount} institutions` : "Registry loading"}
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setSelectedBankId("");
                      }}
                      placeholder="Search bank name, short code, or institution type"
                      className="h-11 rounded-xl border-border bg-surface pl-9 text-sm"
                    />
                  </div>

                  <div className="rounded-xl border border-border bg-surface p-1.5">
                    <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
                      {isLoading ? (
                        <RegistryState icon={<Clock3 className="h-4 w-4" />} title="Loading institutions" body="Fetching the Account Aggregator institution registry." />
                      ) : isError ? (
                        <RegistryState icon={<AlertCircle className="h-4 w-4" />} title="Registry unavailable" body="Could not load the institution list. Please try again." />
                      ) : filteredInstitutions.length === 0 ? (
                        <RegistryState icon={<Search className="h-4 w-4" />} title="No match found" body="Try the bank's full name, short name, or institution type." />
                      ) : (
                        visibleInstitutions.map((institution) => (
                          <InstitutionRow
                            key={institution.id}
                            institution={institution}
                            selected={institution.id === selectedBank?.id}
                            onSelect={() => setSelectedBankId(institution.id)}
                          />
                        ))
                      )}
                    </div>

                    {!isLoading && !isError && filteredInstitutions.length > visibleInstitutions.length ? (
                      <p className="px-3 py-2 text-center text-xs text-muted-foreground">
                        Showing {visibleInstitutions.length} matches. Search to narrow the registry.
                      </p>
                    ) : null}
                  </div>

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Registry: {institutionData?.source || "Account Aggregator institution registry"}.
                  </p>
                </section>
              ) : null}

              {step === "review" ? (
                <section className="mt-4 space-y-4">
                  <SelectedInstitutionCard institution={selectedBank} />

                  <div className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-primary">
                        <Database className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Consent terms</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          These are the fields a user should understand before approving consent.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-background">
                      <ConsentFact label="Requested by" value="PocketBuddy" detail="Used for budgeting, runway and transaction verification." />
                      <ConsentFact label="Data type" value="Deposit account transactions" detail="Read-only financial information; no credentials are collected." />
                      <ConsentFact label="Control" value="Approve, reject or revoke" detail="No bank data is fetched until consent is approved." />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-surface p-4">
                    <h3 className="text-sm font-semibold text-foreground">History range</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Shorter ranges reduce data shared. Longer ranges improve spending pattern accuracy.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {RANGE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setRequestedRangeDays(option.value)}
                          className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                            requestedRangeDays === option.value
                              ? "border-primary/45 bg-primary/10 text-foreground"
                              : "border-border bg-background text-foreground hover:border-primary/25"
                          }`}
                        >
                          <span className="block text-sm font-semibold">{option.label}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {step === "confirm" ? (
                <section className="mt-4 space-y-4">
                  <SelectedInstitutionCard institution={selectedBank} />

                  <div className="rounded-xl border border-border bg-surface p-4">
                    <h3 className="text-sm font-semibold text-foreground">Confirm request</h3>
                    <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-background">
                      <ConsentFact label="Institution" value={selectedBankLabel} detail="The bank selected for this consent request." />
                      <ConsentFact label="Range" value={`${requestedRangeDays} days`} detail="Only this transaction history range is requested." />
                      <ConsentFact label="Access" value="Read-only and revocable" detail="PocketBuddy cannot move money or access credentials." />
                    </div>
                  </div>

                  <details className="rounded-xl border border-border bg-surface p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-foreground">
                      Already use an AA handle?
                    </summary>
                    <div className="mt-3 flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Optional. Add your AA handle or registered mobile only if you already use an Account Aggregator app.
                        </p>
                        <Input
                          value={aaHandle}
                          onChange={(event) => setAaHandle(event.target.value)}
                          placeholder="name@aa or registered mobile"
                          className="mt-3 h-10 rounded-xl text-sm"
                        />
                      </div>
                    </div>
                  </details>

                  <div className="rounded-xl border border-success/25 bg-success/10 p-3">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        After approval, sandbox fetches are stored separately from live transactions and can be revoked from Privacy Center.
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-border bg-surface px-4 py-4 sm:px-5">
          {hasExistingConsent ? (
            <Button className="h-10 text-sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              {step === "bank" ? (
                <Button variant="outline" className="h-10 text-sm" disabled={busy} onClick={() => onOpenChange(false)}>
                  Do this later
                </Button>
              ) : (
                <Button variant="outline" className="h-10 text-sm" disabled={busy} onClick={goBack}>
                  Back
                </Button>
              )}
              <Button className="h-10 text-sm font-semibold" disabled={busy || !selectedBank} onClick={goNext}>
                {busy ? "Starting consent..." : step === "confirm" ? "Continue" : "Next"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExistingConsentState({ bankName, status }: { bankName: string; status: string }) {
  return (
    <div className="rounded-xl border border-success/25 bg-success/10 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {status === "active" ? "Bank already connected" : "Consent is waiting for approval"}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {bankName}. You can review, refresh, or revoke this consent from Privacy Center.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: ConsentStep }) {
  const activeIndex = CONSENT_STEPS.findIndex((item) => item.key === step);

  return (
    <div className="grid grid-cols-3 gap-2">
      {CONSENT_STEPS.map((item, index) => {
        const active = item.key === step;
        const done = index < activeIndex;
        return (
          <div key={item.key} className="min-w-0">
            <div
              className={`h-1.5 rounded-full ${
                active || done ? "bg-primary" : "bg-surface-raised"
              }`}
            />
            <p className={`mt-1 truncate text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {index + 1}. {item.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ConsentPath({ selectedBankName }: { selectedBankName: string }) {
  const items = [
    { title: "Request", body: "PocketBuddy asks for selected fields" },
    { title: "Consent", body: "You approve through AA" },
    { title: "Fetch", body: `${selectedBankName} shares only after approval` },
  ];

  return (
    <div className="grid gap-2 rounded-xl border border-border bg-surface p-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{item.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

function InstitutionRow({
  institution,
  selected,
  onSelect,
}: {
  institution: AAInstitution;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-primary/45 bg-primary/10"
          : "border-transparent bg-transparent hover:border-border hover:bg-surface-raised"
      }`}
    >
      <InstitutionMark institution={institution} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{institution.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{institution.type || "Bank"}</span>
          <span aria-hidden="true">·</span>
          <span>{institution.regulator || "RBI"}</span>
          <span aria-hidden="true">·</span>
          <span>{institution.status || "Available"}</span>
        </span>
      </span>
      {selected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : null}
    </button>
  );
}

function SelectedInstitutionCard({ institution }: { institution?: AAInstitution }) {
  if (!institution) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">No institution selected</p>
        <p className="mt-1 text-xs text-muted-foreground">Go back and choose a bank to continue.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <InstitutionMark institution={institution} size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{institution.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {institution.type || "Bank"} · {institution.regulator || "RBI"} · {institution.status || "Available"}
          </p>
        </div>
      </div>
    </div>
  );
}

function InstitutionMark({ institution, size = "md" }: { institution: AAInstitution; size?: "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-11 w-11 text-lg" : "h-9 w-9 text-base";
  return (
    <span className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-xl border border-border bg-background`}>
      <span aria-hidden="true">{institutionEmoji(institution)}</span>
    </span>
  );
}

function institutionEmoji(institution: AAInstitution) {
  const text = `${institution.name} ${institution.type || ""}`.toLowerCase();
  if (text.includes("post")) return "📮";
  if (text.includes("payments")) return "💳";
  if (text.includes("small finance")) return "🌾";
  if (text.includes("co-operative") || text.includes("cooperative") || text.includes("coop")) return "🤝";
  if (text.includes("foreign") || text.includes("standard chartered") || text.includes("hsbc") || text.includes("dbs") || text.includes("deutsche")) return "🌐";
  if (text.includes("bank")) return "🏦";
  return "🏛️";
}

function RegistryState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-background p-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function ConsentFact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="grid gap-1 p-3 sm:grid-cols-[0.72fr_1.28fr] sm:gap-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div>
        <p className="text-sm font-semibold text-foreground">{value}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
