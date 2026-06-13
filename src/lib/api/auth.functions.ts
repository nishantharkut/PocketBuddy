import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { signUpUser, signInWithPassword, signInWithPhone, deleteSession } from "../mongodb-auth";

export const signUpFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().optional(),
      fullName: z.string(),
      phone: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    return await signUpUser(data);
  });

export const signInWithPasswordFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    return await signInWithPassword(data);
  });

export const signInWithPhoneFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      phone: z.string(),
      fullName: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    return await signInWithPhone(data);
  });

export const signOutFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    await deleteSession(data.token);
    return { success: true };
  });
