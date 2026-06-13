import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getCurrentUser, getProfile } from "@/lib/api/db.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("pb_session_token") : null;
    if (!token) {
      throw redirect({ to: "/login" });
    }

    try {
      const user = await getCurrentUser();
      if (!user) {
        localStorage.removeItem("pb_session_token");
        throw redirect({ to: "/login" });
      }

      // Check onboarding status (only redirect when NOT already going to onboarding/companion)
      const path = location.pathname;
      if (path !== "/onboarding" && path !== "/companion") {
        const profile = await getProfile();
        if (!profile || !profile.onboarding_completed) {
          throw redirect({ to: "/onboarding" });
        }
      }

      return { user };
    } catch (err) {
      localStorage.removeItem("pb_session_token");
      throw redirect({ to: "/login" });
    }
  },
  component: () => <Outlet />,
});
