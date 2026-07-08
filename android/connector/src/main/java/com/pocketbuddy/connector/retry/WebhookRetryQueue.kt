package com.pocketbuddy.connector.retry

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import com.pocketbuddy.connector.model.TransactionNotificationPayload
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

class WebhookRetryQueue(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun enqueue(payload: TransactionNotificationPayload) {
        val entries = readStoredEntries().toMutableList()
        val encryptedPayload = encrypt(payload.toJson().toString())
        entries.add(
            StoredEntry(
                id = UUID.randomUUID().toString(),
                createdAtMillis = System.currentTimeMillis(),
                attempts = 0,
                lastAttemptAtMillis = null,
                iv = encryptedPayload.iv,
                cipherText = encryptedPayload.cipherText,
            ),
        )

        while (entries.size > MAX_QUEUE_SIZE) {
            entries.removeAt(0)
        }

        writeStoredEntries(entries)
        Log.d(TAG, "Queued webhook payload count=${entries.size}")
    }

    fun peek(limit: Int): List<QueuedPayload> =
        readStoredEntries()
            .take(limit)
            .mapNotNull { entry ->
                try {
                    val decryptedJson = decrypt(entry.iv, entry.cipherText)
                    QueuedPayload(
                        id = entry.id,
                        attempts = entry.attempts,
                        payload = TransactionNotificationPayload.fromJson(JSONObject(decryptedJson)),
                    )
                } catch (exception: Exception) {
                    Log.w(TAG, "Dropping unreadable queued payload id=${entry.id}", exception)
                    remove(entry.id)
                    null
                }
            }

    fun markAttempt(id: String) {
        val entries = readStoredEntries().map { entry ->
            if (entry.id == id) {
                entry.copy(
                    attempts = entry.attempts + 1,
                    lastAttemptAtMillis = System.currentTimeMillis(),
                )
            } else {
                entry
            }
        }
        writeStoredEntries(entries)
    }

    fun remove(id: String) {
        writeStoredEntries(readStoredEntries().filterNot { it.id == id })
    }

    fun clear() {
        writeStoredEntries(emptyList())
    }

    fun size(): Int = readStoredEntries().size

    private fun readStoredEntries(): List<StoredEntry> {
        val rawQueue = preferences.getString(KEY_QUEUE, "[]") ?: "[]"
        val queueArray = JSONArray(rawQueue)
        return buildList {
            for (index in 0 until queueArray.length()) {
                val jsonObject = queueArray.optJSONObject(index) ?: continue
                add(
                    StoredEntry(
                        id = jsonObject.getString("id"),
                        createdAtMillis = jsonObject.getLong("createdAtMillis"),
                        attempts = jsonObject.getInt("attempts"),
                        lastAttemptAtMillis = jsonObject.optLong("lastAttemptAtMillis").takeIf { it > 0L },
                        iv = jsonObject.getString("iv"),
                        cipherText = jsonObject.getString("cipherText"),
                    ),
                )
            }
        }
    }

    private fun writeStoredEntries(entries: List<StoredEntry>) {
        val queueArray = JSONArray()
        entries.forEach { entry ->
            queueArray.put(
                JSONObject()
                    .put("id", entry.id)
                    .put("createdAtMillis", entry.createdAtMillis)
                    .put("attempts", entry.attempts)
                    .put("lastAttemptAtMillis", entry.lastAttemptAtMillis)
                    .put("iv", entry.iv)
                    .put("cipherText", entry.cipherText),
            )
        }

        preferences.edit().putString(KEY_QUEUE, queueArray.toString()).apply()
    }

    private fun encrypt(plainText: String): EncryptedPayload {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val cipherText = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        return EncryptedPayload(
            iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
            cipherText = Base64.encodeToString(cipherText, Base64.NO_WRAP),
        )
    }

    private fun decrypt(iv: String, cipherText: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateSecretKey(),
            GCMParameterSpec(GCM_TAG_LENGTH_BITS, Base64.decode(iv, Base64.NO_WRAP)),
        )
        val plainText = cipher.doFinal(Base64.decode(cipherText, Base64.NO_WRAP))
        return plainText.toString(Charsets.UTF_8)
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
            val keySpec = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()

            keyGenerator.init(keySpec)
            keyGenerator.generateKey()
        }

        return (keyStore.getEntry(KEY_ALIAS, null) as KeyStore.SecretKeyEntry).secretKey
    }

    data class QueuedPayload(
        val id: String,
        val attempts: Int,
        val payload: TransactionNotificationPayload,
    )

    private data class StoredEntry(
        val id: String,
        val createdAtMillis: Long,
        val attempts: Int,
        val lastAttemptAtMillis: Long?,
        val iv: String,
        val cipherText: String,
    )

    private data class EncryptedPayload(
        val iv: String,
        val cipherText: String,
    )

    private companion object {
        private const val TAG = "PocketBuddyRetryQueue"
        private const val PREFERENCES_NAME = "pocketbuddy_retry_queue"
        private const val KEY_QUEUE = "queue"
        private const val MAX_QUEUE_SIZE = 100
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "pocketbuddy_webhook_retry_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128
    }
}
