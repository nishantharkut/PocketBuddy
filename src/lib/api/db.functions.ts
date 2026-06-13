import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { requireMongoAuth } from "@/integrations/mongodb/auth-middleware";

// Helper to map MongoDB _id to string id for frontend compatibility and serialization
function mapDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

function mapDocs(docs: any[]) {
  return docs.map(mapDoc);
}

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireMongoAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const profile = await db.collection("profiles").findOne({ _id: userId as any });
    return mapDoc(profile);
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.record(z.any()))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    await db
      .collection("profiles")
      .updateOne({ _id: userId as any }, { $set: { ...data, updated_at: new Date() } });
    return { success: true };
  });

export const getTransactions = createServerFn({ method: "GET" })
  .middleware([requireMongoAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const txns = await db
      .collection("transactions")
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .toArray();
    return mapDocs(txns);
  });

export const insertTransaction = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.record(z.any()))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const id = globalThis.crypto.randomUUID();
    const newTxn = {
      _id: id as any,
      user_id: userId,
      amount: data.amount,
      raw_merchant_string: data.raw_merchant_string,
      mapped_merchant_name: data.mapped_merchant_name || null,
      category: data.category || null,
      is_mapped: !!data.mapped_merchant_name,
      source: data.source || "manual",
      raw_notification_body: data.raw_notification_body || null,
      created_at: data.created_at ? new Date(data.created_at) : new Date(),
    };
    await db.collection("transactions").insertOne(newTxn);
    return mapDoc(newTxn);
  });

export const deleteRecentTransactions = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.object({ startDate: z.string() }))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    await db.collection("transactions").deleteMany({
      user_id: userId,
      created_at: { $gte: new Date(data.startDate) },
    });
    return { success: true };
  });

export const getSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireMongoAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const subs = await db.collection("subscriptions").find({ user_id: userId }).toArray();
    return mapDocs(subs);
  });

export const insertSubscription = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.record(z.any()))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const id = globalThis.crypto.randomUUID();
    const newSub = {
      _id: id as any,
      user_id: userId,
      service_name: data.service_name,
      amount: data.amount,
      next_debit_date: data.next_debit_date,
      detected_from: data.detected_from || "manual",
      is_active: data.is_active ?? true,
      created_at: new Date(),
    };
    await db.collection("subscriptions").insertOne(newSub);
    return mapDoc(newSub);
  });

export const updateSubscriptionIsActive = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.object({ id: z.string(), is_active: z.boolean() }))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    await db
      .collection("subscriptions")
      .updateOne({ _id: data.id as any, user_id: userId }, { $set: { is_active: data.is_active } });
    return { success: true };
  });

export const deleteSubscription = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    await db.collection("subscriptions").deleteOne({ _id: data.id as any, user_id: userId });
    return { success: true };
  });

export const getCampusFood = createServerFn({ method: "GET" })
  .middleware([requireMongoAuth])
  .handler(async () => {
    const { db } = await connectToDatabase();
    const food = await db.collection("campus_food_options").find({ is_active: true }).toArray();
    return mapDocs(food);
  });

export const getCartPools = createServerFn({ method: "GET" })
  .middleware([requireMongoAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const profile = await db.collection("profiles").findOne({ _id: userId as any });
    if (!profile || !profile.wing_label) return [];

    const pools = await db
      .collection("cart_pools")
      .find({ wing_label: profile.wing_label })
      .sort({ created_at: -1 })
      .toArray();
    return mapDocs(pools);
  });

export const getCartPool = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { db } = await connectToDatabase();
    const pool = await db.collection("cart_pools").findOne({ _id: data.id as any });
    return mapDoc(pool);
  });

export const insertCartPool = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.record(z.any()))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const id = globalThis.crypto.randomUUID();
    const newPool = {
      _id: id as any,
      created_by: userId,
      created_by_name: data.created_by_name || "Unknown",
      wing_label: data.wing_label,
      platform: data.platform,
      status: "open",
      min_cart_value: data.min_cart_value,
      delivery_fee: data.delivery_fee,
      expires_at: new Date(data.expires_at),
      created_at: new Date(),
    };
    await db.collection("cart_pools").insertOne(newPool);
    return mapDoc(newPool);
  });

export const getCartPoolItems = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.object({ pool_id: z.string() }))
  .handler(async ({ data }) => {
    const { db } = await connectToDatabase();
    const items = await db
      .collection("cart_pool_items")
      .find({ pool_id: data.pool_id })
      .sort({ created_at: 1 })
      .toArray();
    return mapDocs(items);
  });

export const insertCartPoolItem = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.record(z.any()))
  .handler(async ({ data }) => {
    const { db } = await connectToDatabase();
    const id = globalThis.crypto.randomUUID();
    const newItem = {
      _id: id as any,
      pool_id: data.pool_id,
      added_by_name: data.added_by_name,
      item_description: data.item_description,
      estimated_price: data.estimated_price,
      created_at: new Date(),
    };
    await db.collection("cart_pool_items").insertOne(newItem);
    return mapDoc(newItem);
  });

export const insertCheckinLog = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(z.record(z.any()))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const id = globalThis.crypto.randomUUID();
    const log = {
      _id: id as any,
      user_id: userId,
      response: data.response,
      stress_note: data.stress_note || null,
      food_gap_hours: data.food_gap_hours,
      suggestion_given: data.suggestion_given || null,
      created_at: new Date(),
    };
    await db.collection("checkin_logs").insertOne(log);
    return mapDoc(log);
  });

export const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([requireMongoAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const user = await db.collection("users").findOne({ _id: userId as any });
    if (!user) return null;
    return {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      phone: user.phone || null,
    };
  });

export const identifyMerchant = createServerFn({ method: "POST" })
  .middleware([requireMongoAuth])
  .inputValidator(
    z.object({
      raw_merchant_string: z.string(),
      display_name: z.string(),
      category: z.string(),
    }),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const existing = await db
      .collection("merchant_directory")
      .findOne({ raw_string: data.raw_merchant_string });
    if (existing) {
      await db
        .collection("merchant_directory")
        .updateOne(
          { _id: existing._id },
          {
            $set: { display_name: data.display_name, category: data.category },
            $inc: { confirmation_count: 1 },
          },
        );
    } else {
      await db.collection("merchant_directory").insertOne({
        _id: globalThis.crypto.randomUUID() as any,
        raw_string: data.raw_merchant_string,
        display_name: data.display_name,
        category: data.category,
        campus: "ABV-IIITM Gwalior",
        mapped_by_user_id: userId,
        confirmation_count: 1,
        created_at: new Date(),
      });
    }
    await db
      .collection("transactions")
      .updateMany(
        { user_id: userId, raw_merchant_string: data.raw_merchant_string },
        {
          $set: {
            mapped_merchant_name: data.display_name,
            category: data.category,
            is_mapped: true,
          },
        },
      );
    return { success: true };
  });

export const getCompanionSyncLogs = createServerFn({ method: "GET" })
  .middleware([requireMongoAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { db } = await connectToDatabase();
    const logs = await db
      .collection("companion_sync_log")
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(20)
      .toArray();
    return mapDocs(logs);
  });
