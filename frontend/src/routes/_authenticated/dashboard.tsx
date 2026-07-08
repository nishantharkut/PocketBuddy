import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      log: search.log === "true" || search.log === true || undefined
    };
  },
});
