import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pool/$id")({
  ssr: false,
});
