package com.pocketbuddy.connector.sync

import com.pocketbuddy.connector.model.TransactionDirection
import java.util.Locale
import kotlin.math.max

data class SyncStatusSnapshot(
    val lastSuccessAtMillis: Long?,
    val lastAmount: Double?,
    val lastMerchant: String?,
    val lastDirection: TransactionDirection?,
    val lastFailureAtMillis: Long?,
    val lastFailureReason: String?,
    val queuedRetryCount: Int,
)

object SyncStatusFormatter {
    fun statusLines(snapshot: SyncStatusSnapshot, nowMillis: Long = System.currentTimeMillis()): List<String> {
        val lines = mutableListOf(
            formatLastSuccess(snapshot, nowMillis) ?: "No payment alert synced yet.",
        )

        if (snapshot.queuedRetryCount > 0) {
            lines.add(
                "Queued retries: ${snapshot.queuedRetryCount} pending. Will retry automatically.",
            )
            snapshot.lastFailureReason
                ?.let(::sanitizeReason)
                ?.takeIf(String::isNotBlank)
                ?.let { lines.add("Last issue: $it") }
        }

        return lines
    }

    private fun formatLastSuccess(snapshot: SyncStatusSnapshot, nowMillis: Long): String? {
        val lastSuccessAt = snapshot.lastSuccessAtMillis ?: return null
        val amount = snapshot.lastAmount?.let(::formatAmount) ?: "amount unknown"
        val merchant = snapshot.lastMerchant?.takeIf(String::isNotBlank)?.trim() ?: "unknown merchant"
        val direction = when (snapshot.lastDirection) {
            TransactionDirection.DEBIT -> "to"
            TransactionDirection.CREDIT -> "from"
            null -> "with"
        }

        return "Last synced ${relativeTime(lastSuccessAt, nowMillis)}: $amount $direction $merchant"
    }

    private fun formatAmount(amount: Double): String =
        if (amount % 1.0 == 0.0) {
            "Rs.${amount.toLong()}"
        } else {
            "Rs.${String.format(Locale.US, "%.2f", amount)}"
        }

    private fun relativeTime(eventMillis: Long, nowMillis: Long): String {
        val elapsedMillis = max(0L, nowMillis - eventMillis)
        val elapsedMinutes = elapsedMillis / MILLIS_PER_MINUTE
        val elapsedHours = elapsedMillis / MILLIS_PER_HOUR

        return when {
            elapsedMillis < 90_000L -> "just now"
            elapsedMinutes < 60L -> "$elapsedMinutes min ago"
            elapsedHours < 24L -> "$elapsedHours h ago"
            else -> "${elapsedHours / 24L} d ago"
        }
    }

    private fun sanitizeReason(reason: String): String {
        val collapsed = reason
            .replace(Regex("\\s+"), " ")
            .trim()
        return if (collapsed.length <= MAX_REASON_CHARS) {
            collapsed
        } else {
            collapsed.take(MAX_REASON_CHARS).trimEnd() + "..."
        }
    }

    private const val MILLIS_PER_MINUTE = 60_000L
    private const val MILLIS_PER_HOUR = 60L * MILLIS_PER_MINUTE
    private const val MAX_REASON_CHARS = 87
}
