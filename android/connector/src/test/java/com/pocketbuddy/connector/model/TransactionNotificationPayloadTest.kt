package com.pocketbuddy.connector.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TransactionNotificationPayloadTest {
    @Test
    fun serializesPrivacyPreservingV2PayloadWithoutRawText() {
        val payload = TransactionNotificationPayload(
            packageName = "com.google.android.apps.messaging",
            timestamp = 1781379188000,
            sourceApp = "Google Messages",
            captureSource = NotificationCaptureSource.SMS_NOTIFICATION,
            deviceId = "device-1",
            userId = "user-1",
            amount = 59.0,
            currency = "INR",
            direction = TransactionDirection.DEBIT,
            merchant = "Spotify",
            transactionId = "123456789012",
            detectedAtDeviceMillis = 1781379188000,
            maskedPreview = "A/c XX1234 debited by Rs.59.00 via UPI to Spotify. UTR [ref]",
            confidence = ParserConfidence.HIGH,
            recurringKeywords = listOf("autopay", "renewal"),
            clientEventId = "event-1",
        )

        val json = payload.toJson()

        assertFalse(json.has("text"))
        assertEquals(2, json.getInt("schemaVersion"))
        assertTrue(json.getBoolean("rawTextSuppressed"))
        assertEquals("on_device_only", json.getString("privacyMode"))
        assertEquals("android-upi-v2", json.getString("parserVersion"))
        assertEquals("high", json.getString("confidence"))
        assertEquals("event-1", json.getString("clientEventId"))
        assertEquals("autopay", json.getJSONArray("recurringKeywords").getString(0))
    }

    @Test
    fun serializesReviewableIncompletePayloadWithoutInventingFields() {
        val payload = TransactionNotificationPayload(
            packageName = "com.google.android.apps.messaging",
            timestamp = 1781379188000,
            sourceApp = "Google Messages",
            captureSource = NotificationCaptureSource.SMS_NOTIFICATION,
            deviceId = "device-1",
            userId = "user-1",
            amount = null,
            currency = "INR",
            direction = null,
            merchant = null,
            transactionId = "123456789012",
            detectedAtDeviceMillis = 1781379188000,
            maskedPreview = "UPI transaction at CAMPUS CANTEEN. UTR [ref]",
            confidence = ParserConfidence.LOW,
            clientEventId = "event-2",
        )

        val json = payload.toJson()

        assertFalse(json.has("amount"))
        assertFalse(json.has("direction"))
        assertEquals("low", json.getString("confidence"))
        assertEquals("UPI transaction at CAMPUS CANTEEN. UTR [ref]", json.getString("maskedPreview"))
    }
}
