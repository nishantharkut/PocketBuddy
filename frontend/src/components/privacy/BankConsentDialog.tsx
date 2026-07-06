import { useState, type ReactNode } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Landmark,
  LockKeyhole,
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

const BANK_OPTIONS = [
  { id: "sbi", name: "State Bank of India", short: "SBI" },
  { id: "hdfc", name: "HDFC Bank", short: "HDFC" },
  { id: "icici", name: "ICICI Bank", short: "ICICI" },
  { id: "axis", name: "Axis Bank", short: "AXIS" },
  { id: "kotak", name: "Kotak Mahindra Bank", short: "KOTAK" },
  { id: "pnb", name: "Punjab National Bank", short: "PNB" },
];

const RANGE_OPTIONS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
];

export type BankConsentPayload = {
  bankCode: string;
  bankName: string;
  requestedRangeDays: number;
  aaHandle?: string;
};

type BankConsentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: BankConsentPayload) => void;
  busy?: boolean;
};

export function BankConsentDialog({
  open,
  onOpenChange,
  onConfirm,
  busy = false,
}: BankConsentDialogProps) {
  const [selectedBankId, setSelectedBankId] = useState(BANK_OPTIONS[0].id);
  const [requestedRangeDays, setRequestedRangeDays] = useState(30);
  const [aaHandle, setAaHandle] = useState("");

  const selectedBank = BANK_OPTIONS.find((bank) => bank.id === selectedBankId) ?? BANK_OPTIONS[0];

  function submitConsent() {
    onConfirm({
      bankCode: selectedBank.id,
      bankName: selectedBank.name,
      requestedRangeDays,
      aaHandle: aaHandle.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-2xl">
        <div className="border-b border-border bg-surface-raised px-5 py-4 sm:px-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Landmark className="h-4 w-4" />
              </span>
              <Badge variant="outline" className="border-primary/30 bg-background/70 text-[10px] text-primary">
                RBI-regulated AA flow
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                Consent only
              </Badge>
            </div>
            <DialogTitle className="text-[18px] font-semibold tracking-tight text-foreground">
              Connect your bank securely
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-relaxed text-muted-foreground">
              PocketBuddy uses the Account Aggregator consent model: you choose the bank, review what data is shared, and can revoke access anytime.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="grid gap-2 sm:grid-cols-3">
            <TrustPill icon={<ShieldCheck className="h-4 w-4" />} title="RBI framework" body="Consent-based financial data sharing" />
            <TrustPill icon={<LockKeyhole className="h-4 w-4" />} title="No credentials" body="No password, OTP, MPIN, or payment access" />
            <TrustPill icon={<BadgeCheck className="h-4 w-4" />} title="User controlled" body="Approve, review, revoke, or retry" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold text-foreground">Choose your bank</p>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Step 1 of 3
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {BANK_OPTIONS.map((bank) => {
                const selected = bank.id === selectedBankId;
                return (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => setSelectedBankId(bank.id)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      selected
                        ? "border-primary/45 bg-primary/10"
                        : "border-border bg-background/70 hover:border-primary/25 hover:bg-surface-raised"
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-raised text-[10px] font-black text-foreground">
                      {bank.short}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold text-foreground">{bank.name}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">Savings / current account</span>
                    </span>
                    {selected ? <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background/70 p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Database className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[12px] font-semibold text-foreground">Consent request</p>
                  <Badge variant="outline" className="w-fit text-[9px] text-muted-foreground">
                    Financial information only
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 text-[11px] text-muted-foreground sm:grid-cols-2">
                  <ConsentFact label="Purpose" value="Verify transactions for budgeting and runway insights" />
                  <ConsentFact label="Data type" value="Deposit account transactions only" />
                  <ConsentFact label="Access" value="Read-only; PocketBuddy cannot move money" />
                  <ConsentFact label="Bank selected" value={selectedBank.name} />
                </div>

                <div className="mt-4 space-y-2">
                  <p className="text-[11px] font-semibold text-foreground">Transaction history range</p>
                  <div className="grid grid-cols-3 gap-2">
                    {RANGE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setRequestedRangeDays(option.value)}
                        className={`rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${
                          requestedRangeDays === option.value
                            ? "border-primary/45 bg-primary/10 text-primary"
                            : "border-border bg-surface text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised/60 p-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-foreground">AA handle or mobile number</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Used by the Account Aggregator to discover linked accounts. You can leave it blank and continue with bank selection.
                </p>
                <Input
                  value={aaHandle}
                  onChange={(event) => setAaHandle(event.target.value)}
                  placeholder="example@aa or registered mobile number"
                  className="mt-3 h-9 text-[12px]"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-success/25 bg-success/10 p-3">
            <div className="flex items-start gap-2">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Nothing is fetched until consent is approved. If you revoke or pause later, new bank-source fetches stop.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border bg-surface-raised px-5 py-4 sm:px-6">
          <Button variant="outline" className="h-9 text-xs" disabled={busy} onClick={() => onOpenChange(false)}>
            Do this later
          </Button>
          <Button className="h-9 text-xs" disabled={busy} onClick={submitConsent}>
            {busy ? "Starting consent..." : "Continue to consent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrustPill({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <p className="text-[11px] font-semibold text-foreground">{title}</p>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function ConsentFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[11px] font-medium leading-snug text-foreground">{value}</p>
    </div>
  );
}
