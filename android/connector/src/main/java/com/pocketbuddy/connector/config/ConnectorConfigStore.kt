package com.pocketbuddy.connector.config

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.pocketbuddy.connector.BuildConfig
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class ConnectorConfigStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun webhookUrl(): String =
        configValue(KEY_WEBHOOK_URL)
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: BuildConfig.POCKETBUDDY_WEBHOOK_URL.trim()

    fun webhookToken(): String? =
        configValue(KEY_WEBHOOK_TOKEN)
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.takeUnless(::looksLikeUrl)
            ?: BuildConfig.POCKETBUDDY_WEBHOOK_TOKEN.trim().takeIf(String::isNotBlank)
                ?.takeUnless(::looksLikeUrl)

    fun userId(): String? =
        configValue(KEY_USER_ID)
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: BuildConfig.POCKETBUDDY_USER_ID.trim().takeIf(String::isNotBlank)

    fun accountEmail(): String? =
        configValue(KEY_ACCOUNT_EMAIL)
            ?.trim()
            ?.takeIf(String::isNotBlank)

    fun save(webhookUrl: String, userId: String, webhookToken: String, accountEmail: String? = null) {
        preferences.edit()
            .putSecureString(KEY_WEBHOOK_URL, webhookUrl.trim())
            .putSecureString(KEY_USER_ID, userId.trim())
            .putSecureString(KEY_WEBHOOK_TOKEN, webhookToken.trim())
            .putSecureString(KEY_ACCOUNT_EMAIL, accountEmail?.trim())
            .apply()
    }

    fun clearRuntimeConfig() {
        preferences.edit()
            .remove(KEY_WEBHOOK_URL)
            .remove(KEY_USER_ID)
            .remove(KEY_WEBHOOK_TOKEN)
            .remove(KEY_ACCOUNT_EMAIL)
            .remove(secureKey(KEY_WEBHOOK_URL))
            .remove(secureKey(KEY_USER_ID))
            .remove(secureKey(KEY_WEBHOOK_TOKEN))
            .remove(secureKey(KEY_ACCOUNT_EMAIL))
            .apply()
    }

    private fun secureString(key: String): String? =
        preferences.getString(secureKey(key), null)?.let(::decryptOrNull)

    private fun configValue(key: String): String? =
        secureString(key) ?: preferences.getString(key, null)

    private fun SharedPreferences.Editor.putSecureString(key: String, value: String?): SharedPreferences.Editor {
        remove(key)
        if (value.isNullOrBlank()) {
            remove(secureKey(key))
        } else {
            putString(secureKey(key), encrypt(value))
        }
        return this
    }

    private fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val cipherText = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) +
            ":" +
            Base64.encodeToString(cipherText, Base64.NO_WRAP)
    }

    private fun decryptOrNull(value: String): String? {
        return try {
            val parts = value.split(":", limit = 2)
            if (parts.size != 2) {
                null
            } else {
                val cipher = Cipher.getInstance(TRANSFORMATION)
                cipher.init(
                    Cipher.DECRYPT_MODE,
                    getOrCreateSecretKey(),
                    GCMParameterSpec(GCM_TAG_LENGTH_BITS, Base64.decode(parts[0], Base64.NO_WRAP)),
                )
                cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)).toString(Charsets.UTF_8)
            }
        } catch (_: Exception) {
            null
        }
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

    private companion object {
        private const val PREFERENCES_NAME = "pocketbuddy_connector_config"
        private const val KEY_WEBHOOK_URL = "webhook_url"
        private const val KEY_WEBHOOK_TOKEN = "webhook_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_ACCOUNT_EMAIL = "account_email"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "pocketbuddy_connector_config_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128

        private fun looksLikeUrl(value: String): Boolean =
            value.startsWith("http://", ignoreCase = true) || value.startsWith("https://", ignoreCase = true)

        private fun secureKey(key: String): String = "secure_$key"
    }
}
