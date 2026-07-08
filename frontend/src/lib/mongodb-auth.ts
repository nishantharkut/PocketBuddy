import { connectToDatabase } from "./mongodb";

const DEMO_PHONE_AUTH_ENABLED = process.env.DEMO_PHONE_AUTH_ENABLED === "true";

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signUpUser({
  email,
  password,
  fullName,
  phone,
}: {
  email: string;
  password?: string;
  fullName: string;
  phone?: string;
}) {
  const { db } = await connectToDatabase();

  const existing = await db.collection("users").findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new Error("User already exists");
  }
  if (!password) {
    throw new Error("Password is required");
  }

  const userId = globalThis.crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await db.collection("users").insertOne({
    _id: userId as any,
    email: email.toLowerCase(),
    passwordHash,
    fullName,
    phone: phone || null,
    createdAt: new Date(),
  });

  // Initialize empty profile — onboarding will fill in campus-specific data
  await db.collection("profiles").insertOne({
    _id: userId as any,
    full_name: fullName,
    phone_number: phone || null,
    college_name: null,
    hostel_block: null,
    room_number: null,
    wing_label: null,
    monthly_allowance: null,
    cycle_start_day: 1,
    exam_start_date: null,
    exam_end_date: null,
    upi_apps_used: [],
    mess_enrolled: false,
    meal_schedule: null,
    companion_paired: false,
    companion_device_name: null,
    companion_last_sync: null,
    pairing_code: null,
    onboarding_completed: false,
    created_at: new Date(),
  });

  return createSession(userId);
}

export async function signInWithPassword({
  email,
  password,
}: {
  email: string;
  password?: string;
}) {
  const { db } = await connectToDatabase();

  const user = await db.collection("users").findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error("User not found");
  }

  if (!password) {
    throw new Error("Password is required");
  }

  const passwordHash = await hashPassword(password);
  if (user.passwordHash !== passwordHash) {
    throw new Error("Invalid password");
  }

  return createSession(user._id.toString());
}

export async function signInWithPhone({ phone, fullName }: { phone: string; fullName?: string }) {
  if (!DEMO_PHONE_AUTH_ENABLED) {
    throw new Error("Phone demo login is disabled. Use email/password login unless a real OTP provider is configured.");
  }

  const { db } = await connectToDatabase();

  const cleaned = phone.replace(/\D/g, "").slice(-10);
  const demoEmail = `phone${cleaned}@pocketbuddy.local`;

  let user = await db.collection("users").findOne({ email: demoEmail });

  if (!user) {
    // Demo-only auto-signup for phone login.
    const userId = globalThis.crypto.randomUUID();
    await db.collection("users").insertOne({
      _id: userId as any,
      email: demoEmail,
      passwordHash: "",
      fullName: fullName || "Student",
      phone: `+91${cleaned}`,
      createdAt: new Date(),
    });

    // Initialize empty profile — onboarding will fill in campus-specific data
    await db.collection("profiles").insertOne({
      _id: userId as any,
      full_name: fullName || "Student",
      phone_number: `+91${cleaned}`,
      college_name: null,
      hostel_block: null,
      room_number: null,
      wing_label: null,
      monthly_allowance: null,
      cycle_start_day: 1,
      exam_start_date: null,
      exam_end_date: null,
      upi_apps_used: [],
      mess_enrolled: false,
      meal_schedule: null,
      companion_paired: false,
      companion_device_name: null,
      companion_last_sync: null,
      pairing_code: null,
      onboarding_completed: false,
      created_at: new Date(),
    });

    user = { _id: userId } as any;
  }

  return createSession(user!._id.toString());
}

async function createSession(userId: string) {
  const { db } = await connectToDatabase();

  const sessionToken = globalThis.crypto.randomUUID();
  await db.collection("sessions").insertOne({
    token: sessionToken,
    userId: userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });

  const user = await db.collection("users").findOne({ _id: userId as any });

  return {
    sessionToken,
    userId,
    user: user
      ? {
          id: user._id.toString(),
          email: user.email,
          fullName: user.fullName,
          phone: user.phone || null,
        }
      : null,
  };
}

export async function validateSession(sessionToken: string) {
  const { db } = await connectToDatabase();

  const session = await db.collection("sessions").findOne({
    token: sessionToken,
    expiresAt: { $gt: new Date() },
  });

  if (!session) return null;

  const user = await db.collection("users").findOne({ _id: session.userId as any });
  return user;
}

export async function deleteSession(sessionToken: string) {
  const { db } = await connectToDatabase();
  await db.collection("sessions").deleteOne({ token: sessionToken });
}
