package com.pocketbuddy.connector.parser

import com.pocketbuddy.connector.BuildConfig
import com.pocketbuddy.connector.model.NotificationCaptureSource
import com.pocketbuddy.connector.model.ParsedUpiNotification
import com.pocketbuddy.connector.model.TransactionDirection
import java.util.Locale

class UpiNotificationParser {
    fun parse(packageName: String, rawText: String): ParsedUpiNotification? {
        val normalizedText = normalize(rawText)
        if (normalizedText.isBlank()) return null
        val captureSource = classifyCaptureSource(packageName, normalizedText) ?: return null

        val amount = extractAmount(normalizedText) ?: return null
        val direction = detectDirection(normalizedText) ?: return null

        return ParsedUpiNotification(
            sourceApp = sourceAppName(packageName),
            captureSource = captureSource,
            amount = amount,
            currency = "INR",
            direction = direction,
            merchant = extractMerchant(normalizedText, direction),
            transactionId = extractTransactionId(normalizedText),
        )
    }

    private fun normalize(rawText: String): String =
        rawText
            .replace(Regex("\\s+"), " ")
            .trim()

    private fun classifyCaptureSource(packageName: String, text: String): NotificationCaptureSource? {
        val lowerPackage = packageName.lowercase(Locale.US)
        val lowerText = text.lowercase(Locale.US)
        val isKnownPaymentApp =
            knownPaymentPackages.contains(lowerPackage) ||
                knownPaymentPackageFragments.any(lowerPackage::contains) ||
                isDebugTestNotification(lowerPackage, lowerText)
        val isKnownSmsApp =
            smsNotificationPackages.contains(lowerPackage) ||
                smsNotificationPackageFragments.any(lowerPackage::contains)
        val hasMoneySignal = amountPattern.containsMatchIn(text)
        val hasPaymentSignal = paymentKeywords.any(lowerText::contains)
        val hasDirectionSignal = debitKeywords.any(lowerText::contains) || creditKeywords.any(lowerText::contains)
        val hasStrongUpiSignal = strongUpiKeywords.any(lowerText::contains)
        val hasSmsBankSignal = smsBankKeywords.any(lowerText::contains)
        val isOtpOnly = otpKeywords.any(lowerText::contains) && !hasDirectionSignal

        if (isDebugTestNotification(lowerPackage, lowerText) && hasMoneySignal && hasDirectionSignal) {
            return NotificationCaptureSource.DEBUG
        }

        if (isKnownPaymentApp && hasMoneySignal && hasDirectionSignal && hasPaymentSignal) {
            return NotificationCaptureSource.PAYMENT_APP
        }

        if (
            isKnownSmsApp &&
            hasMoneySignal &&
            hasDirectionSignal &&
            hasSmsBankSignal &&
            hasStrongUpiSignal &&
            !isOtpOnly
        ) {
            return NotificationCaptureSource.SMS_NOTIFICATION
        }

        return null
    }

    private fun isDebugTestNotification(lowerPackageName: String, lowerText: String): Boolean =
        BuildConfig.DEBUG &&
            lowerPackageName in debugNotificationPackages &&
            (lowerText.contains("pocketbuddy test upi") || lowerText.contains("pocketbuddy test sms"))

    private fun extractAmount(text: String): Double? {
        val match = amountPattern.find(text) ?: return null
        return match.groupValues
            .getOrNull(1)
            ?.replace(",", "")
            ?.toDoubleOrNull()
    }

    private fun detectDirection(text: String): TransactionDirection? {
        val lowerText = text.lowercase(Locale.US)
        val debitMatch = debitKeywords.any(lowerText::contains)
        val creditMatch = creditKeywords.any(lowerText::contains)

        return when {
            debitMatch && !creditMatch -> TransactionDirection.DEBIT
            creditMatch && !debitMatch -> TransactionDirection.CREDIT
            debitMatch -> TransactionDirection.DEBIT
            creditMatch -> TransactionDirection.CREDIT
            else -> null
        }
    }

    private fun extractMerchant(text: String, direction: TransactionDirection): String? {
        val patterns = when (direction) {
            TransactionDirection.DEBIT -> debitMerchantPatterns
            TransactionDirection.CREDIT -> creditMerchantPatterns
        }

        return patterns
            .asSequence()
            .mapNotNull { it.find(text)?.groupValues?.getOrNull(1) }
            .map(::cleanMerchant)
            .firstOrNull { it.isNotBlank() }
    }

    private fun cleanMerchant(candidate: String): String =
        candidate
            .replace(Regex("\\s+"), " ")
            .trim(' ', '.', ',', '-', ':')
            .take(MAX_MERCHANT_LENGTH)

    private fun extractTransactionId(text: String): String? =
        transactionIdPatterns
            .asSequence()
            .mapNotNull { it.find(text)?.groupValues?.getOrNull(1) }
            .map { it.trim(' ', '.', ',', '-', ':') }
            .firstOrNull { it.isNotBlank() }

    private fun sourceAppName(packageName: String): String =
        sourceAppsByExactPackage[packageName.lowercase(Locale.US)]
            ?: sourceAppsByPackageFragment.entries.firstOrNull { (fragment) ->
                packageName.lowercase(Locale.US).contains(fragment)
            }?.value
            ?: packageName

    private companion object {
        private const val MAX_MERCHANT_LENGTH = 80

        private val knownPaymentPackages = setOf(
            "com.google.android.apps.nbu.paisa.user",
            "com.phonepe.app",
            "net.one97.paytm",
            "in.org.npci.upiapp",
            "in.amazon.mshop.android.shopping",
        )

        private val knownPaymentPackageFragments = listOf(
            "amazon",
            "kotak",
            "kbank",
            "phonepe",
            "paytm",
            "mobikwik",
            "freecharge",
            "cred",
            "payzapp",
            "yono",
            "axis",
            "icici",
            "hdfc",
            "sbi",
            "canara",
            "unionbank",
            "federal",
            "airtel",
            "jio",
            "upi",
        )

        private val debugNotificationPackages = setOf(
            BuildConfig.APPLICATION_ID,
            "com.android.shell",
        )

        private val smsNotificationPackages = setOf(
            "com.google.android.apps.messaging",
            "com.android.mms",
            "com.android.messaging",
            "com.android.mms.service",
            "com.samsung.android.messaging",
            "com.bbk.messaging",
            "com.vivo.messaging",
        )

        private val smsNotificationPackageFragments = listOf(
            "messaging",
            "mms",
            "sms",
        )

        private val sourceAppsByExactPackage = mapOf(
            "com.google.android.apps.nbu.paisa.user" to "Google Pay",
            "com.phonepe.app" to "PhonePe",
            "net.one97.paytm" to "Paytm",
            "in.org.npci.upiapp" to "BHIM",
            "in.amazon.mshop.android.shopping" to "Amazon Pay",
            "com.google.android.apps.messaging" to "Google Messages",
            "com.android.mms" to "Messages",
            "com.android.messaging" to "Messages",
            "com.android.mms.service" to "Messages",
            "com.samsung.android.messaging" to "Samsung Messages",
            "com.bbk.messaging" to "Vivo Messages",
            "com.vivo.messaging" to "Vivo Messages",
        )

        private val sourceAppsByPackageFragment = linkedMapOf(
            "amazon" to "Amazon Pay",
            "kotak" to "Kotak 811",
            "kbank" to "Kotak 811",
            "mobikwik" to "MobiKwik",
            "freecharge" to "Freecharge",
            "cred" to "CRED",
            "payzapp" to "PayZapp",
            "yono" to "YONO SBI",
            "axis" to "Axis Bank",
            "icici" to "ICICI Bank",
            "hdfc" to "HDFC Bank",
            "sbi" to "SBI",
            "canara" to "Canara Bank",
            "unionbank" to "Union Bank",
            "federal" to "Federal Bank",
            "airtel" to "Airtel Payments Bank",
            "jio" to "Jio Payments Bank",
        )

        private val paymentKeywords = listOf(
            "upi",
            "paid",
            "sent",
            "debited",
            "credited",
            "received",
            "transaction",
            "payment",
        )

        private val strongUpiKeywords = listOf(
            "upi",
            "vpa",
            "utr",
            "rrn",
            "txn id",
            "txn no",
            "transaction id",
            "ref no",
            "reference no",
        )

        private val smsBankKeywords = listOf(
            "a/c",
            "acct",
            "account",
            "bank",
            "card",
            "upi",
            "vpa",
            "utr",
            "rrn",
            "txn",
            "transaction",
            "debited",
            "credited",
        )

        private val otpKeywords = listOf(
            "otp",
            "one time password",
            "verification code",
            "do not share",
        )

        private val debitKeywords = listOf(
            "paid",
            "sent",
            "debited",
            "spent",
            "transferred",
            "payment successful",
            "purchase",
        )

        private val creditKeywords = listOf(
            "received",
            "credited",
            "deposited",
            "refund",
            "cashback",
        )

        private val amountPattern =
            Regex("(?:rs\\.?|inr|\\u20B9)\\s*([0-9,]+(?:\\.[0-9]{1,2})?)", RegexOption.IGNORE_CASE)

        private val debitMerchantPatterns = listOf(
            Regex("(?i)paid\\s+(?:rs\\.?|inr|\\u20B9)?\\s*[0-9,]+(?:\\.[0-9]{1,2})?\\s+to\\s+(.+?)(?:\\s+using|\\s+via|\\s+on\\s|\\s+for\\s|[.]\\s*(?:utr|txn|ref|rrn)\\b|\\s+(?:utr|txn|ref|rrn)\\b|$)"),
            Regex("(?i)sent\\s+(?:rs\\.?|inr|\\u20B9)?\\s*[0-9,]+(?:\\.[0-9]{1,2})?\\s+to\\s+(.+?)(?:\\s+using|\\s+via|\\s+on\\s|\\s+for\\s|[.]\\s*(?:utr|txn|ref|rrn)\\b|\\s+(?:utr|txn|ref|rrn)\\b|$)"),
            Regex("(?i)to\\s+(.+?)(?:\\s+using|\\s+via|\\s+on\\s|\\s+for\\s|[.]\\s*(?:utr|txn|ref|rrn)\\b|\\s+(?:utr|txn|ref|rrn)\\b|$)"),
            Regex("(?i)at\\s+(.+?)(?:\\s+using|\\s+via|\\s+on\\s|\\s+for\\s|[.]\\s*(?:utr|txn|ref|rrn)\\b|\\s+(?:utr|txn|ref|rrn)\\b|$)"),
        )

        private val creditMerchantPatterns = listOf(
            Regex("(?i)received\\s+(?:rs\\.?|inr|\\u20B9)?\\s*[0-9,]+(?:\\.[0-9]{1,2})?\\s+from\\s+(.+?)(?:\\s+using|\\s+via|\\s+on\\s|[.]\\s*(?:utr|txn|ref|rrn)\\b|\\s+(?:utr|txn|ref|rrn)\\b|$)"),
            Regex("(?i)credited.*?from\\s+(.+?)(?:\\s+using|\\s+via|\\s+on\\s|[.]\\s*(?:utr|txn|ref|rrn)\\b|\\s+(?:utr|txn|ref|rrn)\\b|$)"),
            Regex("(?i)from\\s+(.+?)(?:\\s+using|\\s+via|\\s+on\\s|[.]\\s*(?:utr|txn|ref|rrn)\\b|\\s+(?:utr|txn|ref|rrn)\\b|$)"),
        )

        private val transactionIdPatterns = listOf(
            Regex("(?i)(?:upi\\s*(?:ref(?:erence)?\\s*(?:no|number)?|transaction\\s*id)|txn\\s*id|transaction\\s*id|ref\\s*no|utr)[:\\s.-]+([a-z0-9-]+)"),
        )
    }
}
