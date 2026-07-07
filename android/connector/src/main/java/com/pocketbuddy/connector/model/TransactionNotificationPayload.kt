package com.pocketbuddy.connector.model

import org.json.JSONObject
import java.util.UUID

data class TransactionNotificationPayload(
    val packageName: String,
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
    val maskedPreview: String,
    val parserVersion: String = "android-v2",
    val confidence: String = "medium",
    val privacyMode: String = "on_device_only",
    val rawTextSuppressed: Boolean = true,
    val schemaVersion: Int = 2,
    val detectedAtDeviceMillis: Long = System.currentTimeMillis(),
    val clientEventId: String = UUID.randomUUID().toString(),
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("packageName", packageName)
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
        put("maskedPreview", maskedPreview)
        put("parserVersion", parserVersion)
        put("confidence", confidence)
        put("privacyMode", privacyMode)
        put("rawTextSuppressed", rawTextSuppressed)
        put("schemaVersion", schemaVersion)
        put("detectedAtDeviceMillis", detectedAtDeviceMillis)
        put("clientEventId", clientEventId)
    }

    companion object {
        fun fromJson(jsonObject: JSONObject): TransactionNotificationPayload =
            TransactionNotificationPayload(
                packageName = jsonObject.getString("packageName"),
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
                maskedPreview = jsonObject.optString("maskedPreview").takeIf(String::isNotBlank)
                    ?: legacyMask(jsonObject.optString("text")),
                parserVersion = jsonObject.optString("parserVersion", "android-v2"),
                confidence = jsonObject.optString("confidence", "medium"),
                privacyMode = jsonObject.optString("privacyMode", "on_device_only"),
                rawTextSuppressed = jsonObject.optBoolean("rawTextSuppressed", true),
                schemaVersion = jsonObject.optInt("schemaVersion", 2),
                detectedAtDeviceMillis = jsonObject.getLong("detectedAtDeviceMillis"),
                clientEventId = jsonObject.optString("clientEventId").takeIf(String::isNotBlank)
                    ?: UUID.randomUUID().toString(),
            )

        private fun legacyMask(value: String): String =
            value
                .replace(Regex("\\s+"), " ")
                .replace(Regex("https?://\\S+", RegexOption.IGNORE_CASE), "[link]")
                .replace(Regex("\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b", RegexOption.IGNORE_CASE), "[email]")
                .replace(Regex("(?<!\\d)\\d{4,}(?!\\d)"), "[digits]")
                .take(180)
    }
}
