import { apiRequest } from "./request.js";

export async function getProfile() {
  return apiRequest("/api/profile");
}

export async function updateProfile({ data }: { data: any }) {
  return apiRequest("/api/profile", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getTransactions() {
  return apiRequest("/api/transactions");
}

export async function insertTransaction({ data }: { data: any }) {
  return apiRequest("/api/transactions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteRecentTransactions({ data }: { data: { startDate: string } }) {
  return apiRequest("/api/transactions/delete-recent", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getSubscriptions() {
  return apiRequest("/api/subscriptions");
}

export async function insertSubscription({ data }: { data: any }) {
  return apiRequest("/api/subscriptions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateSubscriptionIsActive({ data }: { data: { id: string; is_active: boolean } }) {
  return apiRequest("/api/subscriptions/toggle-active", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteSubscription({ data }: { data: { id: string } }) {
  return apiRequest("/api/subscriptions/delete", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCampusFood() {
  return apiRequest("/api/campus-food");
}



export async function getCartPools() {
  return apiRequest("/api/cart-pools");
}

export async function getCartPool({ data }: { data: { id: string } }) {
  return apiRequest(`/api/cart-pools/${data.id}`);
}

export async function insertCartPool({ data }: { data: any }) {
  return apiRequest("/api/cart-pools", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCartPoolItems({ data }: { data: { pool_id: string } }) {
  return apiRequest(`/api/cart-pools/${data.pool_id}/items`);
}

export async function insertCartPoolItem({ data }: { data: any }) {
  return apiRequest(`/api/cart-pools/${data.pool_id}/items`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function insertCheckinLog({ data }: { data: any }) {
  return apiRequest("/api/checkins", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCurrentUser() {
  const result = await apiRequest("/api/auth/me");
  return result?.user ?? null;
}

export async function identifyMerchant({ data }: { data: any }) {
  return apiRequest(`/api/transactions/${data.txn_id}/identify`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCompanionSyncLogs() {
  return apiRequest("/api/companion/logs");
}
