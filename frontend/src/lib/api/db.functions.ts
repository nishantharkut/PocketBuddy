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

export async function updateCartPool({ id, data }: { id: string; data: any }) {
  return apiRequest(`/api/cart-pools/${id}`, {
    method: "PUT",
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

export async function deleteCartPoolItem({ pool_id, item_id }: { pool_id: string; item_id: string }) {
  return apiRequest(`/api/cart-pools/${pool_id}/items/${item_id}`, {
    method: "DELETE",
  });
}

export async function updateCartPoolItem({ pool_id, item_id, data }: { pool_id: string; item_id: string; data: any }) {
  return apiRequest(`/api/cart-pools/${pool_id}/items/${item_id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function paymentConfirm({ pool_id, data }: { pool_id: string; data: { roommate_name: string; utr: string } }) {
  return apiRequest(`/api/cart-pools/${pool_id}/payment-confirm`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function paymentVerify({ pool_id, data }: { pool_id: string; data: { roommate_name: string; action: "verify" | "reject" } }) {
  return apiRequest(`/api/cart-pools/${pool_id}/payment-verify`, {
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

export async function updateTransaction({ id, data }: { id: string; data: any }) {
  return apiRequest(`/api/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getCompanionSyncLogs() {
  return apiRequest("/api/companion/logs");
}

export async function getDashboardInsights() {
  return apiRequest("/api/insights");
}

export async function getCampusIntel() {
  return apiRequest("/api/rag/campus-intel");
}

export async function getWingFeed() {
  return apiRequest("/api/insights/wing-feed");
}

export async function getWellnessInsights() {
  return apiRequest("/api/insights/wellness");
}

export async function getCatalog(catalogType: string) {
  return apiRequest(`/api/catalog/${catalogType}`);
}

export async function addCatalogItem(catalogType: string, data: { label: string; metadata?: any }) {
  return apiRequest(`/api/catalog/${catalogType}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getTravelRoutes(college?: string) {
  const url = college ? `/api/travel/routes?college=${encodeURIComponent(college)}` : "/api/travel/routes";
  return apiRequest(url);
}


export async function submitTravelReport({ data }: { data: any }) {
  return apiRequest("/api/travel/reports", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getTravelReports(routeId: string) {
  return apiRequest(`/api/travel/reports?route_id=${routeId}`);
}

export async function getTravelSavings() {
  return apiRequest("/api/travel/savings");
}

export async function logTravelSavings({ data }: { data: { amount_saved: number; route_id: string } }) {
  return apiRequest("/api/travel/savings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createTravelRoute({ data }: { data: { name: string; description?: string; distance_km: number; campus_landmark?: string; college?: string } }) {
  return apiRequest("/api/travel/routes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}



