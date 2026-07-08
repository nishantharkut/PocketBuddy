import { createLazyFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/_authenticated/stats")({
  component: StatsLazyPage,
});

function StatsLazyPage() {
  return <Navigate to="/transactions" search={{ view: "analytics" }} replace />;
}
