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

export async function getCampusFood(params?: string | {
  status?: string;
  safeFoodBudgetPaise?: number;
  mealGapHours?: number;
  foodRoutineType?: string;
  messEnrolled?: boolean;
}) {
  const query = new URLSearchParams();
  const options = typeof params === "string" ? { status: params } : params;
  if (options?.status) query.set("status", options.status);
  if (Number.isFinite(options?.safeFoodBudgetPaise)) query.set("safe_food_budget_paise", String(options?.safeFoodBudgetPaise));
  if (Number.isFinite(options?.mealGapHours)) query.set("meal_gap_hours", String(options?.mealGapHours));
  if (options?.foodRoutineType) query.set("food_routine_type", options.foodRoutineType);
  if (typeof options?.messEnrolled === "boolean") query.set("mess_enrolled", String(options.messEnrolled));
  const suffix = query.toString();
  const url = suffix ? `/api/campus-food?${suffix}` : "/api/campus-food";
  return apiRequest(url);
}

export async function scanMenuPhoto({ data }: { data: FormData }) {
  return apiRequest("/api/campus-food/scan", {
    method: "POST",
    body: data,
  });
}

export async function createCampusFoodItem({ data }: { data: { venue_name: string; item_name: string; price: number; campus?: string } }) {
  return apiRequest("/api/campus-food", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function editCampusFoodItem({ id, data }: { id: string; data: { item_name?: string; price?: number } }) {
  return apiRequest(`/api/campus-food/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteCampusFoodItem({ id }: { id: string }) {
  return apiRequest(`/api/campus-food/${id}`, {
    method: "DELETE",
  });
}

export async function verifyCampusFoodItem({ id, vote }: { id: string; vote: "up" | "down" }) {
  return apiRequest(`/api/campus-food/${id}/verify`, {
    method: "POST",
    body: JSON.stringify({ vote }),
  });
}

export async function getFoodSignals() {
  return apiRequest("/api/campus-food/signals");
}

export async function submitFoodSignalResponse({
  data,
}: {
  data: {
    quiz_id: string;
    quiz_type: string;
    response_val: string;
    venue_name?: string;
    price?: number;
    item_name?: string;
    old_price?: number;
    new_price?: number;
    custom_category?: string;
    location?: string;
  };
}) {
  return apiRequest("/api/campus-food/signals/respond", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function submitParserCorrection({ data }: { data: { transaction_id: string; corrected_amount?: number; corrected_merchant?: string; corrected_category?: string; corrected_direction?: "debit" | "credit" } }) {
  return apiRequest("/api/ingest/correction", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getParserStats() {
  return apiRequest("/api/ingest/parser-stats");
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

export async function paymentVerify({
  pool_id,
  data,
}: {
  pool_id: string;
  data: { roommate_name: string; action: "verify" | "reject" | "settle_in_kind" };
}) {
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

export async function getDataConsents() {
  return apiRequest("/api/companion/consents");
}

export async function createCompanionPairingToken() {
  return apiRequest("/api/companion/pairing-token", { method: "POST" });
}

export async function getAccountAggregatorStatus() {
  return apiRequest("/api/account-aggregator/status");
}

export async function getAccountAggregatorInstitutions(q = "") {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return apiRequest(`/api/account-aggregator/institutions${qs}`);
}

export async function discoverAccountAggregatorSandboxAccounts({
  bankCode,
  bankName,
}: {
  bankCode: string;
  bankName?: string;
}) {
  const params = new URLSearchParams({ bank_code: bankCode });
  if (bankName) params.set("bank_name", bankName);
  return apiRequest(`/api/account-aggregator/sandbox/accounts?${params.toString()}`);
}

export async function startAccountAggregatorSandboxConsent({ data }: { data?: any } = {}) {
  return apiRequest("/api/account-aggregator/sandbox/consents", {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
}

export async function simulateAccountAggregatorSandbox({
  consentId,
  data,
}: {
  consentId: string;
  data: { action: "approve" | "reject" | "revoke" | "expire" | "fetch_success" | "fetch_failed"; reason?: string };
}) {
  return apiRequest(`/api/account-aggregator/sandbox/consents/${encodeURIComponent(consentId)}/simulate`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getDashboardInsights() {
  return apiRequest("/api/insights");
}

export async function getCampusIntel() {
  return apiRequest("/api/rag/campus-intel");
}

export async function getRunwayForecast() {
  return apiRequest("/api/insights/forecast");
}

export async function getRunwayIntel() {
  return apiRequest("/api/rag/runway-intel");
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
  return apiRequest(`/api/travel/reports?route_id=${encodeURIComponent(routeId)}`);
}

export async function getTravelReportCandidates(routeId?: string) {
  const params = new URLSearchParams();
  if (routeId) params.set("route_id", routeId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/api/travel/report-candidates${suffix}`);
}

export async function confirmTravelReportCandidate(
  transactionId: string,
  data: { route_id: string; mode: string; driver_quote?: number; anonymous?: boolean },
) {
  return apiRequest(`/api/travel/report-candidates/${encodeURIComponent(transactionId)}/confirm`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function voteTravelReport(reportId: string, voteType: "up" | "down") {
  return apiRequest(`/api/travel/reports/${encodeURIComponent(reportId)}/vote`, {
    method: "POST",
    body: JSON.stringify({ vote_type: voteType }),
  });
}

export async function getTravelSavings() {
  return apiRequest("/api/travel/savings");
}

export async function getTravelPlaceSuggestions(query: string, college?: string) {
  const params = new URLSearchParams({ q: query });
  if (college) params.set("college", college);
  return apiRequest(`/api/travel/place-suggestions?${params.toString()}`);
}

export async function getTravelRouteEstimate(
  origin: string,
  destination: string,
  college?: string,
  options?: {
    origin_lat?: number;
    origin_lon?: number;
    destination_lat?: number;
    destination_lon?: number;
    origin_place_id?: string;
    destination_place_id?: string;
    time_context?: string;
    luggage?: boolean;
  },
) {
  const params = new URLSearchParams({
    origin,
    destination,
  });
  if (college) params.set("college", college);
  Object.entries(options ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const url = `/api/travel/calculate-route?${params.toString()}`;
  return apiRequest(url);
}

export async function logTravelSavings({ data }: { data: { amount_saved: number; route_id: string } }) {
  return apiRequest("/api/travel/savings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createTravelRoute({ data }: { data: { name: string; description?: string; distance_km: number; campus_landmark?: string; college?: string; duration_mins?: number; routing_provider?: string; eta_confidence?: string; split_suggestion?: any } }) {
  return apiRequest("/api/travel/routes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getAiTravelCoach({ data }: { data: { route_id: string; mode: string; user_situation?: string; college?: string; app_quote?: number; travel_time_context?: string } }) {
  return apiRequest("/api/travel/ai-coach", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getStats(month: number, year: number) {
  return apiRequest(`/api/insights/stats?month=${month}&year=${year}`);
}

export async function getWingNettedBalances() {
  return apiRequest("/api/cart-pools/wing/netted-balances");
}

export async function nudgeRoommate({ pool_id, data }: { pool_id: string; data: { roommate_name: string } }) {
  return apiRequest(`/api/cart-pools/${pool_id}/nudge`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createAmazonCheckoutSession({ pool_id, data }: { pool_id: string; data: { final_overhead: number; final_discount: number; checkout_notes: string | null; upi_id: string | null } }) {
  return apiRequest(`/api/cart-pools/${pool_id}/amazon-checkout-session`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function confirmAmazonCheckoutCallback({ pool_id, session_id }: { pool_id: string; session_id: string }) {
  return apiRequest(`/api/cart-pools/${pool_id}/amazon-checkout-session/${session_id}/complete`, {
    method: "POST",
  });
}

export async function processAmazonRoommatePayment({ pool_id, data }: { pool_id: string; data: { roommate_name: string; amount: number } }) {
  return apiRequest(`/api/cart-pools/${pool_id}/amazon-charge-permission/roommate-reimburse`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function clearCompanionLogs() {
  return apiRequest("/api/companion/clear-logs", { method: "POST" });
}

export async function deleteAccountData() {
  return apiRequest("/api/profile/delete-account", { method: "POST" });
}

export async function confirmTransaction({ id }: { id: string }) {
  return apiRequest(`/api/transactions/${id}/confirm`, { method: "POST" });
}
