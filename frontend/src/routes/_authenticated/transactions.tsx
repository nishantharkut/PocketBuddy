import { createFileRoute } from "@tanstack/react-router";

type TxnSearch = {
  view?: "ledger" | "analytics";
  tab?: "daily" | "calendar" | "monthly" | "total";
  import?: boolean;
};

export const Route = createFileRoute("/_authenticated/transactions")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): TxnSearch => {
    return {
      view: (search.view === "ledger" || search.view === "analytics") ? search.view : undefined,
      tab: (search.tab === "daily" || search.tab === "calendar" || search.tab === "monthly" || search.tab === "total") ? search.tab : undefined,
      import: search.import === "true" || search.import === true || undefined,
    };
  },
});
