package com.pocketbuddy.connector.sync

import com.pocketbuddy.connector.model.TransactionDirection
import org.junit.Assert.assertEquals
import org.junit.Test

class SyncStatusFormatterTest {
    @Test
    fun formatsLastDebitSyncWithAmountMerchantAndAge() {
        val nowMillis = 120_000L
        val snapshot = SyncStatusSnapshot(
            lastSuccessAtMillis = 0L,
            lastAmount = 77.0,
            lastMerchant = "OneTapCanteen",
            lastDirection = TransactionDirection.DEBIT,
            lastFailureAtMillis = null,
            lastFailureReason = null,
            queuedRetryCount = 0,
        )

        assertEquals(
            listOf("Last synced 2 min ago: Rs.77 to OneTapCanteen"),
            SyncStatusFormatter.statusLines(snapshot, nowMillis),
        )
    }

    @Test
    fun formatsLastCreditSyncWithoutGuessingDirectionCopy() {
        val nowMillis = 60_000L
        val snapshot = SyncStatusSnapshot(
            lastSuccessAtMillis = 5_000L,
            lastAmount = 132.5,
            lastMerchant = "Rohan",
            lastDirection = TransactionDirection.CREDIT,
            lastFailureAtMillis = null,
            lastFailureReason = null,
            queuedRetryCount = 0,
        )

        assertEquals(
            listOf("Last synced just now: Rs.132.50 from Rohan"),
            SyncStatusFormatter.statusLines(snapshot, nowMillis),
        )
    }

    @Test
    fun showsQueuedRetryStateAndSanitizesFailureReason() {
        val nowMillis = 10_000L
        val snapshot = SyncStatusSnapshot(
            lastSuccessAtMillis = null,
            lastAmount = null,
            lastMerchant = null,
            lastDirection = null,
            lastFailureAtMillis = 5_000L,
            lastFailureReason = "Server error:\ninvalid token with a very long backend response that should not crowd the setup screen",
            queuedRetryCount = 3,
        )

        assertEquals(
            listOf(
                "No payment alert synced yet.",
                "Queued retries: 3 pending. Will retry automatically.",
                "Last issue: Server error: invalid token with a very long backend response that should not crowd the...",
            ),
            SyncStatusFormatter.statusLines(snapshot, nowMillis),
        )
    }
}
