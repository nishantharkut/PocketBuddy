package com.pocketbuddy.connector.model

import org.json.JSONObject

data class TransactionNotificationPayload(
    val packageName: String,
    val text: String,
    val timestamp: Long,
    val sourceApp: String,
    val captureSource: NotificationCaptureSource,
    val deviceId: String,
    val userId: String?,
    val amount: Double,
    val currency: String,
    val direction: TransactionDirection,
    val merchant: String?,
    val transactionId: String?,
    val detectedAtDeviceMillis: Long = System.currentTimeMillis(),
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("packageName", packageName)
        put("text", text)
        put("timestamp", timestamp)
        put("sourceApp", sourceApp)
        put("captureSource", captureSource.apiValue)
        put("deviceId", deviceId)
        put("userId", userId)
        put("amount", amount)
        put("currency", currency)
        put("direction", direction.name.lowercase())
        put("merchant", merchant)
        put("transactionId", transactionId)
        put("detectedAtDeviceMillis", detectedAtDeviceMillis)
    }

    companion object {
        fun fromJson(jsonObject: JSONObject): TransactionNotificationPayload =
            TransactionNotificationPayload(
                packageName = jsonObject.getString("packageName"),
                text = jsonObject.getString("text"),
                timestamp = jsonObject.getLong("timestamp"),
                sourceApp = jsonObject.getString("sourceApp"),
                captureSource = NotificationCaptureSource.fromApiValue(jsonObject.getString("captureSource")),
                deviceId = jsonObject.getString("deviceId"),
                userId = jsonObject.optString("userId").takeIf(String::isNotBlank),
                amount = jsonObject.getDouble("amount"),
                currency = jsonObject.getString("currency"),
                direction = TransactionDirection.valueOf(jsonObject.getString("direction").uppercase()),
                merchant = jsonObject.optString("merchant").takeIf(String::isNotBlank),
                transactionId = jsonObject.optString("transactionId").takeIf(String::isNotBlank),
                detectedAtDeviceMillis = jsonObject.getLong("detectedAtDeviceMillis"),
            )
    }
}
