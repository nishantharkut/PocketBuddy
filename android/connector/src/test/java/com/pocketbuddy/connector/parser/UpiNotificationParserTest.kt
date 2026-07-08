package com.pocketbuddy.connector.parser

import com.pocketbuddy.connector.model.NotificationCaptureSource
import com.pocketbuddy.connector.model.ParserConfidence
import com.pocketbuddy.connector.model.TransactionDirection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class UpiNotificationParserTest {
    private val parser = UpiNotificationParser()

    @Test
    fun parsesPaymentAppDebitNotification() {
        val parsed = parser.parse(
            packageName = "com.phonepe.app",
            rawText = "Paid Rs.50 to Hostel 3 Night Canteen using UPI txn id TXN123",
        )

        assertNotNull(parsed)
        assertEquals(NotificationCaptureSource.PAYMENT_APP, parsed?.captureSource)
        assertEquals(TransactionDirection.DEBIT, parsed?.direction)
        assertEquals(50.0, parsed?.amount ?: -1.0, 0.001)
        assertEquals("Hostel 3 Night Canteen", parsed?.merchant)
        assertEquals("TXN123", parsed?.transactionId)
        assertEquals(ParserConfidence.HIGH, parsed?.confidence)
    }

    @Test
    fun parsesAmazonPayNotification() {
        val parsed = parser.parse(
            packageName = "in.amazon.mShop.android.shopping",
            rawText = "Paid INR 199.00 to Amazon Pay Merchant using UPI txn id AMZ123",
        )

        assertNotNull(parsed)
        assertEquals("Amazon Pay", parsed?.sourceApp)
        assertEquals(NotificationCaptureSource.PAYMENT_APP, parsed?.captureSource)
        assertEquals(199.0, parsed?.amount ?: -1.0, 0.001)
    }

    @Test
    fun parsesGoogleMessagesBankDebitSmsNotification() {
        val parsed = parser.parse(
            packageName = "com.google.android.apps.messaging",
            rawText = "HDFC Bank: A/c XX1234 debited by Rs.125.00 via UPI to CAMPUS CANTEEN. UTR 123456789012",
        )

        assertNotNull(parsed)
        assertEquals("Google Messages", parsed?.sourceApp)
        assertEquals(NotificationCaptureSource.SMS_NOTIFICATION, parsed?.captureSource)
        assertEquals(TransactionDirection.DEBIT, parsed?.direction)
        assertEquals(125.0, parsed?.amount ?: -1.0, 0.001)
        assertEquals("CAMPUS CANTEEN", parsed?.merchant)
        assertEquals("123456789012", parsed?.transactionId)
        assertEquals(ParserConfidence.HIGH, parsed?.confidence)
    }

    @Test
    fun parsesVivoMessagesBankCreditSmsNotification() {
        val parsed = parser.parse(
            packageName = "com.android.mms",
            rawText = "A/c XX1234 credited with INR 500.00 via UPI from Rahul. UTR 998877665544",
        )

        assertNotNull(parsed)
        assertEquals(NotificationCaptureSource.SMS_NOTIFICATION, parsed?.captureSource)
        assertEquals(TransactionDirection.CREDIT, parsed?.direction)
        assertEquals(500.0, parsed?.amount ?: -1.0, 0.001)
        assertEquals("Rahul", parsed?.merchant)
        assertEquals("998877665544", parsed?.transactionId)
    }

    @Test
    fun ignoresOtpSmsWithAmount() {
        val parsed = parser.parse(
            packageName = "com.google.android.apps.messaging",
            rawText = "OTP is 123456 for UPI payment of Rs.500. Do not share it with anyone.",
        )

        assertNull(parsed)
    }

    @Test
    fun ignoresPromotionalSmsWithAmount() {
        val parsed = parser.parse(
            packageName = "com.android.mms",
            rawText = "Get Rs.50 cashback on your next recharge. Limited period offer.",
        )

        assertNull(parsed)
    }

    @Test
    fun ignoresChatNotificationsThatQuotePaymentText() {
        val parsed = parser.parse(
            packageName = "com.whatsapp",
            rawText = "Hackathons and internship: RECENT SYNC ACTIVITY sms_notification Sent Rs.2.00 from XXXXXX1234 to Kanika Singhal on 14/06/2026. UPI ref no. 123456789012.",
        )

        assertNull(parsed)
    }

    @Test
    fun sendsReviewableLowConfidenceEventWhenMerchantIsMissing() {
        val parsed = parser.parse(
            packageName = "com.google.android.apps.messaging",
            rawText = "HDFC Bank: A/c XX1234 debited by Rs.125.00 via UPI. UTR 123456789012",
        )

        assertNotNull(parsed)
        assertEquals(NotificationCaptureSource.SMS_NOTIFICATION, parsed?.captureSource)
        assertEquals(TransactionDirection.DEBIT, parsed?.direction)
        assertEquals(125.0, parsed?.amount ?: -1.0, 0.001)
        assertNull(parsed?.merchant)
        assertEquals(ParserConfidence.LOW, parsed?.confidence)
    }

    @Test
    fun detectsRecurringMandateSignalsWithoutDecidingSubscriptionStatus() {
        val parsed = parser.parse(
            packageName = "com.google.android.apps.messaging",
            rawText = "HDFC Bank: A/c XX1234 debited by Rs.59.00 via UPI to Spotify. AutoPay mandate renewal successful. UTR 123456789012",
        )

        assertNotNull(parsed)
        assertEquals("Spotify", parsed?.merchant)
        assertEquals(ParserConfidence.HIGH, parsed?.confidence)
        assertEquals(listOf("autopay", "mandate", "renewal"), parsed?.recurringKeywords)
    }

    @Test
    fun sendsLowConfidenceReviewEventForPaymentLikeAlertWithoutDirection() {
        val parsed = parser.parse(
            packageName = "com.google.android.apps.messaging",
            rawText = "HDFC Bank: UPI transaction of Rs.125.00 at CAMPUS CANTEEN. UTR 123456789012",
        )

        assertNotNull(parsed)
        assertEquals(NotificationCaptureSource.SMS_NOTIFICATION, parsed?.captureSource)
        assertEquals(125.0, parsed?.amount ?: -1.0, 0.001)
        assertNull(parsed?.direction)
        assertEquals("CAMPUS CANTEEN", parsed?.merchant)
        assertEquals(ParserConfidence.LOW, parsed?.confidence)
    }
}
