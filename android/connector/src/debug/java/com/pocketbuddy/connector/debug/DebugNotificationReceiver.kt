package com.pocketbuddy.connector.debug

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.pocketbuddy.connector.identity.DeviceIdentityStore
import com.pocketbuddy.connector.model.TransactionNotificationPayload
import com.pocketbuddy.connector.network.WebhookClient
import com.pocketbuddy.connector.parser.UpiNotificationParser
import com.pocketbuddy.connector.privacy.NotificationTextMasker
import com.pocketbuddy.connector.sync.SyncStatusStore

class DebugNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val mode = intent.getStringExtra(EXTRA_MODE) ?: MODE_UPI
        val amount = intent.getStringExtra(EXTRA_AMOUNT) ?: "50"
        val merchant = intent.getStringExtra(EXTRA_MERCHANT) ?: "Hostel 3 Night Canteen"
        val transactionId = intent.getStringExtra(EXTRA_TRANSACTION_ID) ?: "TEST123"
        val notificationText = when (mode) {
            MODE_SMS -> "PocketBuddy test SMS A/c XX1234 debited by Rs.$amount via UPI to $merchant. UTR $transactionId"
            else -> "PocketBuddy test UPI Paid Rs.$amount to $merchant using UPI txn id $transactionId"
        }
        val timestamp = System.currentTimeMillis()
        val directWebhook = intent.getBooleanExtra(EXTRA_DIRECT_WEBHOOK, false)

        if (!directWebhook) {
            val notificationManager = context.getSystemService(NotificationManager::class.java)
            ensureChannel(notificationManager)

            val notification = Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle("PocketBuddy Test Payment")
                .setContentText(notificationText)
                .setStyle(Notification.BigTextStyle().bigText(notificationText))
                .setAutoCancel(true)
                .build()

            notificationManager.notify(timestamp.hashCode(), notification)
            Log.d(TAG, "Posted debug notification")
        }

        if (directWebhook) {
            val parserPackageName = intent.getStringExtra(EXTRA_PARSER_PACKAGE_NAME)
                ?: when (mode) {
                    MODE_SMS -> "com.google.android.apps.messaging"
                    else -> "com.phonepe.app"
                }
            val parsedNotification = UpiNotificationParser().parse(parserPackageName, notificationText)
            if (parsedNotification == null) {
                Log.w(TAG, "Debug parser rejected notification package=$parserPackageName")
                return
            }

            val appContext = context.applicationContext
            val payload = TransactionNotificationPayload(
                    packageName = parserPackageName,
                    timestamp = timestamp,
                    sourceApp = parsedNotification.sourceApp,
                    captureSource = parsedNotification.captureSource,
                    deviceId = DeviceIdentityStore(appContext).deviceId(),
                    userId = DeviceIdentityStore(appContext).userId(),
                    amount = parsedNotification.amount,
                    currency = parsedNotification.currency,
                    direction = parsedNotification.direction,
                    merchant = parsedNotification.merchant,
                    transactionId = parsedNotification.transactionId,
                    maskedPreview = NotificationTextMasker.mask(notificationText),
                    confidence = parsedNotification.confidence,
                    recurringKeywords = parsedNotification.recurringKeywords,
                )
            val syncStatusStore = SyncStatusStore(appContext)

            WebhookClient(appContext).post(payload) { result ->
                when (result) {
                    WebhookClient.PostResult.Success -> {
                        syncStatusStore.recordSuccess(payload)
                        Log.d(TAG, "Posted debug webhook")
                    }
                    is WebhookClient.PostResult.Failure -> {
                        syncStatusStore.recordQueuedFailure(result.reason)
                        Log.w(TAG, "Debug webhook failed: ${result.reason}")
                    }
                }
            }
        }
    }

    private fun ensureChannel(notificationManager: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            CHANNEL_ID,
            "PocketBuddy Debug",
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        notificationManager.createNotificationChannel(channel)
    }

    private companion object {
        private const val TAG = "PocketBuddyDebug"
        private const val CHANNEL_ID = "pocketbuddy_debug_notifications"
        private const val EXTRA_MODE = "mode"
        private const val EXTRA_AMOUNT = "amount"
        private const val EXTRA_MERCHANT = "merchant"
        private const val EXTRA_TRANSACTION_ID = "transactionId"
        private const val EXTRA_DIRECT_WEBHOOK = "directWebhook"
        private const val EXTRA_PARSER_PACKAGE_NAME = "parserPackageName"
        private const val MODE_UPI = "upi"
        private const val MODE_SMS = "sms"
    }
}
