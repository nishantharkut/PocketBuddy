package com.pocketbuddy.connector.network

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object WebhookRequestSigner {
    fun signature(
        token: String,
        timestampMillis: String,
        eventId: String,
        body: ByteArray,
    ): String {
        val mac = Mac.getInstance(HMAC_SHA256)
        mac.init(SecretKeySpec(token.toByteArray(Charsets.UTF_8), HMAC_SHA256))
        val prefix = "$timestampMillis.$eventId.".toByteArray(Charsets.UTF_8)
        mac.update(prefix)
        val digest = mac.doFinal(body)
        return "sha256=${digest.joinToString(separator = "") { "%02x".format(it.toInt() and 0xff) }}"
    }

    private const val HMAC_SHA256 = "HmacSHA256"
}
