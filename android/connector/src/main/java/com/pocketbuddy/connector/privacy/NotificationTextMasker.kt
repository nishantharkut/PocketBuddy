package com.pocketbuddy.connector.privacy

object NotificationTextMasker {
    fun mask(rawText: String): String =
        rawText
            .replace(Regex("\\s+"), " ")
            .trim()
            .replace(Regex("https?://\\S+", RegexOption.IGNORE_CASE), "[link]")
            .replace(
                Regex("\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b", RegexOption.IGNORE_CASE),
                "[email]",
            )
            .replace(
                Regex("((?:upi\\s*ref(?:erence)?\\s*(?:no\\.?|number)?|utr|txn\\s*id|ref\\s*no)\\s*[:.\\-]?\\s*)[A-Z0-9]{4,}", RegexOption.IGNORE_CASE),
                "$1[ref]",
            )
            .replace(Regex("(?<!\\d)\\d{6,}(?!\\d)"), "[digits]")
            .take(MAX_PREVIEW_LENGTH)

    private const val MAX_PREVIEW_LENGTH = 180
}
