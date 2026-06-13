import { createMiddleware } from "@tanstack/react-start";

export const attachMongoAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("pb_session_token") : null;
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});
