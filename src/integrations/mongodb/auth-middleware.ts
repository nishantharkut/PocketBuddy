import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { connectToDatabase } from "@/lib/mongodb";

export const requireMongoAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (!request?.headers) {
    throw new Error("Unauthorized: No request headers available");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: No authorization header provided");
  }

  const sessionToken = authHeader.replace("Bearer ", "");
  if (!sessionToken) {
    throw new Error("Unauthorized: No session token provided");
  }

  const { db } = await connectToDatabase();
  const session = await db.collection("sessions").findOne({
    token: sessionToken,
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    throw new Error("Unauthorized: Invalid or expired session token");
  }

  return next({
    context: {
      userId: session.userId as string,
      sessionToken,
    },
  });
});
