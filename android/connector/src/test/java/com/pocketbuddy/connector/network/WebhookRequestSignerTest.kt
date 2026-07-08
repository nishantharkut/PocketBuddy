package com.pocketbuddy.connector.network

import org.junit.Assert.assertEquals
import org.junit.Test

class WebhookRequestSignerTest {
    @Test
    fun createsDeterministicSha256SignatureForBackendContract() {
        val signature = WebhookRequestSigner.signature(
            token = "secret",
            timestampMillis = "123",
            eventId = "evt-1",
            body = "{}".toByteArray(Charsets.UTF_8),
        )

        assertEquals(
            "sha256=9d5da139d7a384cee1a6c360a198cb0fb4a3c49fa4957dd0565a6c87a6e4d424",
            signature,
        )
    }
}
