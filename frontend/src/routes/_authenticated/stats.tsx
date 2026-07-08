import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/stats")({
  beforeLoad: () => {
    throw redirect({
      to: "/transactions",
      search: { view: "analytics" },
    });
  },
  ssr: false,
});
