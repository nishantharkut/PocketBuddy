package com.pocketbuddy.connector

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.pocketbuddy.connector.identity.DeviceIdentityStore
import com.pocketbuddy.connector.model.TransactionNotificationPayload
import com.pocketbuddy.connector.network.WebhookClient
import com.pocketbuddy.connector.parser.UpiNotificationParser
import com.pocketbuddy.connector.retry.RetryScheduler
import com.pocketbuddy.connector.retry.WebhookRetryQueue

class PocketBuddyNotificationListener : NotificationListenerService() {
    private val parser = UpiNotificationParser()
    private val recentNotificationKeys = LinkedHashSet<String>()
    private val webhookClient by lazy { WebhookClient(applicationContext) }
    private val identityStore by lazy { DeviceIdentityStore(applicationContext) }
    private val retryQueue by lazy { WebhookRetryQueue(applicationContext) }

    override fun onListenerConnected() {
        RetryScheduler.schedule(applicationContext)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val notificationText = extractNotificationText(sbn.notification)
        if (BuildConfig.DEBUG) {
            Log.d(
                TAG,
                "Observed notification package=${sbn.packageName} hasText=${notificationText != null}",
            )
        }
        if (notificationText == null) return

        val dedupeKey = buildDedupeKey(sbn.packageName, sbn.postTime, notificationText)
        if (isDuplicate(dedupeKey)) return

        val parsedNotification = parser.parse(sbn.packageName, notificationText)
        if (parsedNotification == null) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Ignored notification package=${sbn.packageName}")
            }
            return
        }

        val payload = TransactionNotificationPayload(
            packageName = sbn.packageName,
            text = notificationText,
            timestamp = sbn.postTime,
            sourceApp = parsedNotification.sourceApp,
            captureSource = parsedNotification.captureSource,
            deviceId = identityStore.deviceId(),
            userId = identityStore.userId(),
            amount = parsedNotification.amount,
            currency = parsedNotification.currency,
            direction = parsedNotification.direction,
            merchant = parsedNotification.merchant,
            transactionId = parsedNotification.transactionId,
        )

        webhookClient.post(payload) { result ->
            when (result) {
                WebhookClient.PostResult.Success -> Log.d(TAG, "Forwarded UPI notification")
                is WebhookClient.PostResult.Failure -> {
                    Log.w(TAG, "Webhook rejected notification: ${result.reason}")
                    retryQueue.enqueue(payload)
                    RetryScheduler.schedule(applicationContext)
                }
            }
        }
    }

    private fun extractNotificationText(notification: Notification): String? {
        val extras = notification.extras ?: return null
        val parts = mutableListOf<String>()

        fun appendPart(value: CharSequence?) {
            value
                ?.toString()
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?.let(parts::add)
        }

        appendPart(extras.getCharSequence(Notification.EXTRA_TITLE))
        appendPart(extras.getCharSequence(Notification.EXTRA_TEXT))
        appendPart(extras.getCharSequence(Notification.EXTRA_BIG_TEXT))
        appendPart(extras.getCharSequence(Notification.EXTRA_SUB_TEXT))
        appendPart(extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT))
        extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach(::appendPart)

        return parts
            .joinToString(separator = " ")
            .replace(Regex("\\s+"), " ")
            .trim()
            .takeIf(String::isNotBlank)
    }

    private fun buildDedupeKey(packageName: String, postTime: Long, text: String): String =
        "$packageName:$postTime:${text.hashCode()}"

    private fun isDuplicate(key: String): Boolean = synchronized(recentNotificationKeys) {
        if (recentNotificationKeys.contains(key)) {
            true
        } else {
            recentNotificationKeys.add(key)
            trimRecentKeys()
            false
        }
    }

    private fun trimRecentKeys() {
        while (recentNotificationKeys.size > MAX_RECENT_NOTIFICATION_KEYS) {
            val oldest = recentNotificationKeys.first()
            recentNotificationKeys.remove(oldest)
        }
    }

    private companion object {
        private const val TAG = "PocketBuddyListener"
        private const val MAX_RECENT_NOTIFICATION_KEYS = 128
    }
}
