package com.pocketbuddy.connector.sync

import android.content.Context
import com.pocketbuddy.connector.model.TransactionDirection
import com.pocketbuddy.connector.model.TransactionNotificationPayload

class SyncStatusStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun recordSuccess(payload: TransactionNotificationPayload, nowMillis: Long = System.currentTimeMillis()) {
        preferences.edit()
            .putLong(KEY_LAST_SUCCESS_AT, nowMillis)
            .putString(KEY_LAST_AMOUNT, payload.amount?.toString())
            .putString(KEY_LAST_MERCHANT, payload.merchant)
            .putString(KEY_LAST_DIRECTION, payload.direction?.name)
            .remove(KEY_LAST_FAILURE_AT)
            .remove(KEY_LAST_FAILURE_REASON)
            .apply()
    }

    fun recordQueuedFailure(reason: String, nowMillis: Long = System.currentTimeMillis()) {
        preferences.edit()
            .putLong(KEY_LAST_FAILURE_AT, nowMillis)
            .putString(KEY_LAST_FAILURE_REASON, reason)
            .apply()
    }

    fun snapshot(queuedRetryCount: Int): SyncStatusSnapshot =
        SyncStatusSnapshot(
            lastSuccessAtMillis = preferences.getLong(KEY_LAST_SUCCESS_AT, -1L).takeIf { it >= 0L },
            lastAmount = preferences.getString(KEY_LAST_AMOUNT, null)?.toDoubleOrNull(),
            lastMerchant = preferences.getString(KEY_LAST_MERCHANT, null)?.takeIf(String::isNotBlank),
            lastDirection = preferences.getString(KEY_LAST_DIRECTION, null)
                ?.let { runCatching { TransactionDirection.valueOf(it) }.getOrNull() },
            lastFailureAtMillis = preferences.getLong(KEY_LAST_FAILURE_AT, -1L).takeIf { it >= 0L },
            lastFailureReason = preferences.getString(KEY_LAST_FAILURE_REASON, null)?.takeIf(String::isNotBlank),
            queuedRetryCount = queuedRetryCount,
        )

    fun clear() {
        preferences.edit().clear().apply()
    }

    private companion object {
        private const val PREFERENCES_NAME = "pocketbuddy_sync_status"
        private const val KEY_LAST_SUCCESS_AT = "last_success_at"
        private const val KEY_LAST_AMOUNT = "last_amount"
        private const val KEY_LAST_MERCHANT = "last_merchant"
        private const val KEY_LAST_DIRECTION = "last_direction"
        private const val KEY_LAST_FAILURE_AT = "last_failure_at"
        private const val KEY_LAST_FAILURE_REASON = "last_failure_reason"
    }
}
