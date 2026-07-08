package com.pocketbuddy.connector.model

import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID

data class TransactionNotificationPayload(
    val packageName: String,
    val timestamp: Long,
    val sourceApp: String,
    val captureSource: NotificationCaptureSource,
    val deviceId: String,
    val userId: String?,
    val amount: Double?,
    val currency: String,
    val direction: TransactionDirection?,
    val merchant: String?,
    val transactionId: String?,
    val detectedAtDeviceMillis: Long = System.currentTimeMillis(),
    val maskedPreview: String,
    val parserVersion: String = "android-upi-v2",
    val confidence: ParserConfidence,
    val recurringKeywords: List<String> = emptyList(),
    val rawTextSuppressed: Boolean = true,
    val privacyMode: String = "on_device_only",
    val schemaVersion: Int = 2,
    val clientEventId: String = UUID.randomUUID().toString(),
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("packageName", packageName)
        put("timestamp", timestamp)
        put("sourceApp", sourceApp)
        put("captureSource", captureSource.apiValue)
        put("deviceId", deviceId)
        put("userId", userId)
        amount?.let { put("amount", it) }
        put("currency", currency)
        direction?.let { put("direction", it.name.lowercase()) }
        put("merchant", merchant)
        put("transactionId", transactionId)
        put("detectedAtDeviceMillis", detectedAtDeviceMillis)
        put("maskedPreview", maskedPreview)
        put("parserVersion", parserVersion)
        put("confidence", confidence.apiValue)
        put("privacyMode", privacyMode)
        put("rawTextSuppressed", rawTextSuppressed)
        put("schemaVersion", schemaVersion)
        put("clientEventId", clientEventId)
        put("recurringKeywords", JSONArray(recurringKeywords))
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
                amount = if (jsonObject.has("amount") && !jsonObject.isNull("amount")) {
                    jsonObject.getDouble("amount")
                } else {
                    null
                },
                currency = jsonObject.getString("currency"),
                direction = jsonObject.optString("direction")
                    .takeIf(String::isNotBlank)
                    ?.let { TransactionDirection.valueOf(it.uppercase()) },
                merchant = jsonObject.optString("merchant").takeIf(String::isNotBlank),
                transactionId = jsonObject.optString("transactionId").takeIf(String::isNotBlank),
                detectedAtDeviceMillis = jsonObject.getLong("detectedAtDeviceMillis"),
                maskedPreview = jsonObject.optString("maskedPreview").takeIf(String::isNotBlank)
                    ?: "Legacy queued connector event",
                parserVersion = jsonObject.optString("parserVersion").takeIf(String::isNotBlank)
                    ?: "android-upi-v2",
                confidence = ParserConfidence.fromApiValue(jsonObject.optString("confidence")),
                recurringKeywords = jsonObject.optJSONArray("recurringKeywords")?.let { array ->
                    buildList {
                        for (index in 0 until array.length()) {
                            array.optString(index).takeIf(String::isNotBlank)?.let(::add)
                        }
                    }
                }.orEmpty(),
                rawTextSuppressed = jsonObject.optBoolean("rawTextSuppressed", true),
                privacyMode = jsonObject.optString("privacyMode").takeIf(String::isNotBlank)
                    ?: "on_device_only",
                schemaVersion = jsonObject.optInt("schemaVersion", 2),
                clientEventId = jsonObject.optString("clientEventId").takeIf(String::isNotBlank)
                    ?: UUID.randomUUID().toString(),
            )
    }
}
