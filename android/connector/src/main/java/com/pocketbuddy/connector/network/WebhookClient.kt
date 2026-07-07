package com.pocketbuddy.connector.network

import android.content.Context
import android.util.Log
import com.pocketbuddy.connector.BuildConfig
import com.pocketbuddy.connector.config.ConnectorConfigStore
import com.pocketbuddy.connector.model.TransactionNotificationPayload
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

class WebhookClient(
    context: Context? = null,
    private val endpointUrlOverride: String? = null,
    private val client: OkHttpClient = defaultClient,
) {
    private val configStore = context?.applicationContext?.let(::ConnectorConfigStore)

    fun post(payload: TransactionNotificationPayload, onComplete: ((PostResult) -> Unit)? = null) {
        val endpointUrl = endpointUrlOverride
            ?: configStore?.webhookUrl()
            ?: BuildConfig.POCKETBUDDY_WEBHOOK_URL.trim()
        val webhookToken = configStore?.webhookToken()
            ?: BuildConfig.POCKETBUDDY_WEBHOOK_TOKEN.trim().takeIf(String::isNotBlank)

        if (endpointUrl.isBlank()) {
            onComplete?.invoke(PostResult.Failure("Webhook URL is blank"))
            return
        }

        val bodyJson = payload.toJson().toString()
        val timestamp = System.currentTimeMillis().toString()
        val eventId = payload.clientEventId
        val signature = webhookToken?.let { signPayload(it, timestamp, eventId, bodyJson) }

        val request = Request.Builder()
            .url(endpointUrl)
            .post(bodyJson.toRequestBody(JSON_MEDIA_TYPE))
            .header("X-PocketBuddy-Connector", BuildConfig.APPLICATION_ID)
            .header("X-PocketBuddy-Connector-Version", BuildConfig.VERSION_NAME)
            .header("X-PocketBuddy-Device-Id", payload.deviceId)
            .header("X-PocketBuddy-Timestamp", timestamp)
            .header("X-PocketBuddy-Event-Id", eventId)
            .apply {
                payload.userId?.let { header("X-PocketBuddy-User-Id", it) }
                webhookToken?.let { header("Authorization", "Bearer $it") }
                signature?.let { header("X-PocketBuddy-Signature", "sha256=$it") }
            }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "Webhook POST failed", e)
                onComplete?.invoke(PostResult.Failure(e.message ?: "Network failure"))
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (it.isSuccessful) {
                        onComplete?.invoke(PostResult.Success)
                    } else {
                        val message = "Unexpected webhook response: ${it.code}"
                        Log.w(TAG, message)
                        onComplete?.invoke(PostResult.Failure(message))
                    }
                }
            }
        })
    }

    fun unpair(deviceId: String, userId: String, onComplete: ((PostResult) -> Unit)? = null) {
        val endpointUrl = endpointUrlOverride
            ?: configStore?.webhookUrl()
            ?: BuildConfig.POCKETBUDDY_WEBHOOK_URL.trim()
        val webhookToken = configStore?.webhookToken()
            ?: BuildConfig.POCKETBUDDY_WEBHOOK_TOKEN.trim().takeIf(String::isNotBlank)

        if (endpointUrl.isBlank()) {
            onComplete?.invoke(PostResult.Failure("Webhook URL is blank"))
            return
        }

        val json = org.json.JSONObject().apply {
            put("userId", userId)
            put("deviceId", deviceId)
            put("type", "unpair")
            put("packageName", "com.pocketbuddy.connector")
            put("sourceApp", "PocketBuddy Android Connector")
            put("timestamp", System.currentTimeMillis())
            put("amount", 0.0)
            put("currency", "INR")
            put("direction", "debit")
            put("maskedPreview", "Connector unpair request")
            put("parserVersion", "android-v2")
            put("privacyMode", "on_device_only")
            put("rawTextSuppressed", true)
            put("schemaVersion", 2)
        }
        val bodyJson = json.toString()
        val timestamp = System.currentTimeMillis().toString()
        val eventId = UUID.randomUUID().toString()
        val signature = webhookToken?.let { signPayload(it, timestamp, eventId, bodyJson) }

        val request = Request.Builder()
            .url(endpointUrl)
            .post(bodyJson.toRequestBody(JSON_MEDIA_TYPE))
            .header("X-PocketBuddy-Connector", BuildConfig.APPLICATION_ID)
            .header("X-PocketBuddy-Connector-Version", BuildConfig.VERSION_NAME)
            .header("X-PocketBuddy-Device-Id", deviceId)
            .header("X-PocketBuddy-Timestamp", timestamp)
            .header("X-PocketBuddy-Event-Id", eventId)
            .apply {
                header("X-PocketBuddy-User-Id", userId)
                webhookToken?.let { header("Authorization", "Bearer $it") }
                signature?.let { header("X-PocketBuddy-Signature", "sha256=$it") }
            }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "Unpair POST failed", e)
                onComplete?.invoke(PostResult.Failure(e.message ?: "Network failure"))
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (it.isSuccessful) {
                        onComplete?.invoke(PostResult.Success)
                    } else {
                        onComplete?.invoke(PostResult.Failure("Server error: ${it.code}"))
                    }
                }
            }
        })
    }

    sealed interface PostResult {
        data object Success : PostResult
        data class Failure(val reason: String) : PostResult
    }

    private companion object {
        private const val TAG = "PocketBuddyWebhook"

        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        private val defaultClient = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .writeTimeout(5, TimeUnit.SECONDS)
            .callTimeout(10, TimeUnit.SECONDS)
            .build()

        private fun signPayload(secret: String, timestamp: String, eventId: String, bodyJson: String): String {
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
            val signedPayload = "$timestamp.$eventId.$bodyJson"
            return mac.doFinal(signedPayload.toByteArray(Charsets.UTF_8)).joinToString("") { byte ->
                "%02x".format(byte.toInt() and 0xff)
            }
        }
    }
}
