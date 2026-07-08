package com.pocketbuddy.connector.retry

import android.content.Context
import android.util.Log
import com.pocketbuddy.connector.network.WebhookClient
import com.pocketbuddy.connector.sync.SyncStatusStore

class WebhookRetryDispatcher(context: Context) {
    private val appContext = context.applicationContext
    private val queue = WebhookRetryQueue(appContext)
    private val webhookClient = WebhookClient(appContext)
    private val syncStatusStore = SyncStatusStore(appContext)

    fun flush(onComplete: (shouldReschedule: Boolean) -> Unit) {
        sendNext(onComplete)
    }

    private fun sendNext(onComplete: (shouldReschedule: Boolean) -> Unit) {
        val queuedPayload = queue.peek(limit = 1).firstOrNull()
        if (queuedPayload == null) {
            onComplete(false)
            return
        }

        webhookClient.post(queuedPayload.payload) { result ->
            when (result) {
                WebhookClient.PostResult.Success -> {
                    queue.remove(queuedPayload.id)
                    syncStatusStore.recordSuccess(queuedPayload.payload)
                    Log.d(TAG, "Retried webhook payload id=${queuedPayload.id}")
                    sendNext(onComplete)
                }

                is WebhookClient.PostResult.Failure -> {
                    queue.markAttempt(queuedPayload.id)
                    syncStatusStore.recordQueuedFailure(result.reason)
                    Log.w(TAG, "Retry failed id=${queuedPayload.id}: ${result.reason}")
                    onComplete(true)
                }
            }
        }
    }

    private companion object {
        private const val TAG = "PocketBuddyRetry"
    }
}
