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
import {
  discoverAccountAggregatorSandboxAccounts,
  getAccountAggregatorInstitutions,
} from "@/lib/api/db.functions";

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
  selectedAccounts: BankConsentAccount[];
};

export type BankConsentAccount = {
  account_ref: string;
  masked_account_ref: string;
  account_type: string;
  fi_type: string;
  nickname?: string;
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

type AAAccountDiscoveryResponse = {
  status?: string;
  bank_code?: string;
  bank_name?: string;
  message?: string;
  accounts?: BankConsentAccount[];
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
  { key: "review", label: "Accounts" },
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
  const [selectedAccountRefs, setSelectedAccountRefs] = useState<string[]>([]);
  const hasExistingConsent = Boolean(
    existingBankName && ["active", "pending"].includes(existingConsentStatus || ""),
  );

  const {
    data: institutionData,
    isLoading,
    isError,
  } = useQuery<AAInstitutionResponse>({
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
    (selectedBankId
      ? institutions.find((institution) => institution.id === selectedBankId)
      : undefined) ??
    filteredInstitutions[0] ??
    institutions[0];

  const {
    data: accountData,
    isLoading: accountsLoading,
    isError: accountsError,
  } = useQuery<AAAccountDiscoveryResponse>({
    queryKey: ["aa-sandbox-accounts", selectedBank?.id, selectedBank?.name],
    enabled: open && !hasExistingConsent && Boolean(selectedBank?.id),
    queryFn: () =>
      discoverAccountAggregatorSandboxAccounts({
        bankCode: selectedBank!.id,
        bankName: selectedBank!.name,
      }),
    staleTime: 10 * 60 * 1000,
  });

  const discoveredAccounts = accountData?.accounts ?? [];
  const selectedAccounts = discoveredAccounts.filter((account) =>
    selectedAccountRefs.includes(account.account_ref),
  );

  useEffect(() => {
    if (open) {
      setStep("bank");
      setSearch("");
    }
  }, [open]);

  useEffect(() => {
    setSelectedAccountRefs([]);
  }, [selectedBank?.id]);

  useEffect(() => {
    if (!selectedBank?.id || accountData?.bank_code !== selectedBank.id) {
      return;
    }
    const accounts = accountData?.accounts ?? [];
    if (accounts.length) {
      setSelectedAccountRefs([accounts[0].account_ref]);
    }
  }, [accountData?.bank_code, accountData?.accounts, selectedBank?.id]);

  function submitConsent() {
    if (!selectedBank) return;
    onConfirm({
      bankCode: selectedBank.id,
      bankName: selectedBank.name,
      bankShortName: selectedBank.short_name,
      requestedRangeDays,
      aaHandle: aaHandle.trim() || undefined,
      selectedAccounts,
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
      if (!selectedAccounts.length) return;
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
  const canContinue = Boolean(selectedBank) && (step !== "review" || selectedAccounts.length > 0);

  function toggleAccount(accountRef: string) {
    setSelectedAccountRefs((current) => {
      if (current.includes(accountRef)) {
        return current.filter((ref) => ref !== accountRef);
      }
      return [...current, accountRef];
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86dvh] w-[calc(100vw-1.25rem)] max-w-[660px] flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 shadow-2xl sm:max-h-[88vh]">
        <div className="shrink-0 border-b border-border bg-background px-5 py-5 sm:px-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-start gap-3 pr-7 sm:pr-8">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface">
                <span className="text-[11px] font-black tracking-wide text-foreground">RBI</span>
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold leading-tight tracking-tight text-foreground sm:text-lg">
                  Connect your bank
                </DialogTitle>
                <DialogDescription className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                  Read-only Account Aggregator consent for transaction verification. No bank
                  password, OTP, MPIN, or payment permission is requested.
                </DialogDescription>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="border-success/30 bg-success/10 text-[10px] font-semibold text-success">
                    Read-only
                  </Badge>
                  <Badge variant="outline" className="border-border bg-background text-[10px] font-semibold text-muted-foreground">
                    Revocable
                  </Badge>
                  <Badge variant="outline" className="border-border bg-background text-[10px] font-semibold text-muted-foreground">
                    No credentials
                  </Badge>
                </div>
              </div>
            </div>
            {!hasExistingConsent && <StepIndicator step={step} />}
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {hasExistingConsent ? (
            <ExistingConsentState
              bankName={existingBankName || "Connected bank"}
              status={existingConsentStatus || "active"}
            />
          ) : (
            <>
              {step === "bank" ? (
                <section className="space-y-4">
                  <div className="rounded-2xl border border-border bg-surface p-3.5">
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold leading-snug text-foreground">
                          Choose financial institution
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Select the bank that holds the account you want PocketBuddy to verify.
                        </p>
                      </div>
                      <span className="w-fit shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        {registryCount ? `${registryCount} institutions` : "Loading registry"}
                      </span>
                    </div>

                    <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 transition-colors focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-primary/10">
                      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setSelectedBankId("");
                        }}
                        placeholder="Search bank or institution"
                        className="h-9 border-0 bg-transparent px-0 text-[13px] shadow-none placeholder:text-muted-foreground/65 focus-visible:ring-0"
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface p-2">
                    <div className="max-h-[34dvh] space-y-1 overflow-y-auto pr-1 sm:max-h-[320px]">
                      {isLoading ? (
                        <RegistryState
                          icon={<Clock3 className="h-4 w-4" />}
                          title="Loading institutions"
                          body="Fetching the Account Aggregator institution registry."
                        />
                      ) : isError ? (
                        <RegistryState
                          icon={<AlertCircle className="h-4 w-4" />}
                          title="Registry unavailable"
                          body="Could not load the institution list. Please try again."
                        />
                      ) : filteredInstitutions.length === 0 ? (
                        <RegistryState
                          icon={<Search className="h-4 w-4" />}
                          title="No match found"
                          body="Try the bank's full name, short name, or institution type."
                        />
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

                    {!isLoading &&
                    !isError &&
                    filteredInstitutions.length > visibleInstitutions.length ? (
                      <p className="px-3 py-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                        Showing {visibleInstitutions.length} matches. Search to narrow the registry.
                      </p>
                    ) : null}
                  </div>

                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Registry source: {institutionData?.source || "Account Aggregator institution registry"}.
                  </p>
                </section>
              ) : null}

              {step === "review" ? (
                <section className="space-y-5">
                  <SelectedInstitutionCard institution={selectedBank} />

                  <AccountSelectionCard
                    accounts={discoveredAccounts}
                    selectedAccountRefs={selectedAccountRefs}
                    loading={accountsLoading}
                    error={accountsError}
                    onToggle={toggleAccount}
                  />

                  <div className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">Consent terms</h3>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Review exactly what this consent allows before continuing.
                    </p>

                    <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-background">
                      <ConsentFact
                        label="Requested by"
                        value="PocketBuddy"
                        detail="Used for budgeting, runway and transaction verification."
                      />
                      <ConsentFact
                        label="Data type"
                        value="Deposit account transactions"
                        detail="Read-only financial information; no credentials are collected."
                      />
                      <ConsentFact
                        label="Accounts"
                        value={`${selectedAccounts.length || 0} selected`}
                        detail="Only selected masked accounts are included in this consent."
                      />
                      <ConsentFact
                        label="Control"
                        value="Approve, reject or revoke"
                        detail="No bank data is fetched until consent is approved."
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-surface p-4">
                    <h3 className="text-sm font-semibold text-foreground">History range</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Shorter ranges reduce data shared. Longer ranges improve spending pattern
                      accuracy.
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
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {option.hint}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}

              {step === "confirm" ? (
                <section className="space-y-5">
                  <SelectedInstitutionCard institution={selectedBank} />

                  <div className="rounded-2xl border border-border bg-surface p-4">
                    <h3 className="text-sm font-semibold text-foreground">Confirm request</h3>
                    <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-background">
                      <ConsentFact
                        label="Institution"
                        value={selectedBankLabel}
                        detail="The bank selected for this consent request."
                      />
                      <ConsentFact
                        label="Accounts"
                        value={
                          selectedAccounts
                            .map((account) => account.masked_account_ref)
                            .join(", ") || "No account selected"
                        }
                        detail="If a bank has multiple accounts, PocketBuddy uses only the accounts selected here."
                      />
                      <ConsentFact
                        label="Range"
                        value={`${requestedRangeDays} days`}
                        detail="Only this transaction history range is requested."
                      />
                      <ConsentFact
                        label="Access"
                        value="Read-only and revocable"
                        detail="PocketBuddy cannot move money or access credentials."
                      />
                    </div>
                  </div>

                  <details className="rounded-2xl border border-border bg-surface p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-foreground">
                      Already use an AA handle?
                    </summary>
                    <div className="mt-3 flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Optional. Add your AA handle or registered mobile only if you already use
                          an Account Aggregator app.
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
                        After approval, sandbox fetches are stored separately from live transactions
                        and can be revoked from Privacy Center.
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="!grid shrink-0 grid-cols-2 gap-2 border-t border-border bg-background px-5 py-4 sm:!flex sm:justify-end sm:px-6">
          {hasExistingConsent ? (
            <Button
              className="col-span-2 h-10 text-sm sm:col-span-1"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          ) : (
            <>
              {step === "bank" ? (
                <Button
                  variant="outline"
                  className="h-10 text-sm"
                  disabled={busy}
                  onClick={() => onOpenChange(false)}
                >
                  Do this later
                </Button>
              ) : (
                <Button variant="outline" className="h-10 text-sm" disabled={busy} onClick={goBack}>
                  Back
                </Button>
              )}
              <Button
                className="h-10 text-sm font-semibold"
                disabled={busy || !canContinue}
                onClick={goNext}
              >
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
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1">
      {CONSENT_STEPS.map((item, index) => {
        const active = item.key === step;
        const done = index < activeIndex;
        return (
          <div
            key={item.key}
            className={`min-w-0 rounded-lg px-2 py-2 text-center transition-colors ${
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <p
              className={`truncate text-[11px] font-semibold leading-snug ${
                done ? "text-primary" : ""
              }`}
            >
              {index + 1}. {item.label}
            </p>
          </div>
        );
      })}
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
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-primary/40 bg-primary/10"
          : "border-transparent bg-transparent hover:border-border hover:bg-background"
      }`}
    >
      <InstitutionMark institution={institution} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-snug text-foreground sm:text-sm">
          {institution.name}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">
          <span>{institution.type || "Bank"}</span>
          <span aria-hidden="true">•</span>
          <span>{institution.regulator || "RBI"}</span>
          <span aria-hidden="true">•</span>
          <span>{institution.status || "Available"}</span>
        </span>
      </span>
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
        }`}
      >
        {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      </span>
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
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <InstitutionMark institution={institution} />
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-snug text-foreground">
            {institution.name}
          </p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {institution.type || "Bank"} • {institution.regulator || "RBI"} •{" "}
            {institution.status || "Available"}
          </p>
        </div>
      </div>
    </div>
  );
}

function AccountSelectionCard({
  accounts,
  selectedAccountRefs,
  loading,
  error,
  onToggle,
}: {
  accounts: BankConsentAccount[];
  selectedAccountRefs: string[];
  loading: boolean;
  error: boolean;
  onToggle: (accountRef: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug text-foreground">
            Select account(s)
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            If your bank returns multiple accounts, select only the masked accounts PocketBuddy
            should verify.
          </p>
        </div>
        <Badge
          variant="outline"
          className="w-fit shrink-0 border-border bg-background text-[11px] font-medium text-muted-foreground"
        >
          {selectedAccountRefs.length} selected
        </Badge>
      </div>

      <div className="mt-3 space-y-2">
        {loading ? (
          <RegistryState
            icon={<Clock3 className="h-4 w-4" />}
            title="Discovering accounts"
            body="Fetching masked accounts for the selected institution."
          />
        ) : error ? (
          <RegistryState
            icon={<AlertCircle className="h-4 w-4" />}
            title="Account discovery unavailable"
            body="Try again or choose another institution."
          />
        ) : accounts.length === 0 ? (
          <RegistryState
            icon={<AlertCircle className="h-4 w-4" />}
            title="No accounts discovered"
            body="No consent will be created until at least one account is selected."
          />
        ) : (
          accounts.map((account) => (
            <DiscoveredAccountRow
              key={account.account_ref}
              account={account}
              selected={selectedAccountRefs.includes(account.account_ref)}
              onToggle={() => onToggle(account.account_ref)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DiscoveredAccountRow({
  account,
  selected,
  onToggle,
}: {
  account: BankConsentAccount;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
        selected
          ? "border-primary/40 bg-primary/10"
          : "border-border bg-background hover:border-primary/25"
      }`}
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-surface"
        }`}
      >
        {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-snug text-foreground sm:text-sm">
          {account.nickname || account.account_type || "Deposit account"}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground sm:text-xs">
          <span className="font-medium text-foreground/75">{account.masked_account_ref}</span>
          <span aria-hidden="true">•</span>
          <span>{account.account_type || "Deposit account"}</span>
          <span aria-hidden="true">•</span>
          <span>{account.fi_type || "DEPOSIT"}</span>
        </span>
      </span>
    </button>
  );
}

function InstitutionMark({
  institution,
  size = "md",
}: {
  institution: AAInstitution;
  size?: "md" | "lg";
}) {
  const sizeClass = size === "lg" ? "h-11 w-11 text-lg" : "h-9 w-9 text-base";
  return (
    <span
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-xl border border-border bg-background`}
    >
      <span aria-hidden="true">{institutionEmoji(institution)}</span>
    </span>
  );
}

function institutionEmoji(institution: AAInstitution) {
  const text = `${institution.name} ${institution.type || ""}`.toLowerCase();
  if (text.includes("post")) return "\uD83D\uDCEE";
  if (text.includes("payments")) return "\uD83D\uDCB3";
  if (text.includes("small finance")) return "\uD83C\uDF3E";
  if (text.includes("co-operative") || text.includes("cooperative") || text.includes("coop"))
    return "\uD83E\uDD1D";
  if (
    text.includes("foreign") ||
    text.includes("standard chartered") ||
    text.includes("hsbc") ||
    text.includes("dbs") ||
    text.includes("deutsche")
  )
    return "\uD83C\uDF10";
  if (text.includes("bank")) return "\uD83C\uDFE6";
  return "\uD83C\uDFDB\uFE0F";
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
        <p className="break-words text-sm font-semibold leading-snug text-foreground">{value}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
