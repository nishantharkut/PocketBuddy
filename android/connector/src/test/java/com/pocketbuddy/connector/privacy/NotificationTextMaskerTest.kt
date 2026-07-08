package com.pocketbuddy.connector.privacy

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationTextMaskerTest {
    @Test
    fun masksSensitiveIdentifiersWithoutRemovingUsefulContext() {
        val masked = NotificationTextMasker.mask(
            "Sent Rs.59.00 from XX1234 to Spotify. UPI ref no. 123456789012. support@example.com https://bank.example/txn",
        )

        assertTrue(masked.contains("Rs.59.00"))
        assertTrue(masked.contains("Spotify"))
        assertTrue(masked.contains("[ref]"))
        assertTrue(masked.contains("[email]"))
        assertTrue(masked.contains("[link]"))
        assertFalse(masked.contains("123456789012"))
        assertFalse(masked.contains("support@example.com"))
    }
}
