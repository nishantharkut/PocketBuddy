package com.pocketbuddy.connector.config

import android.content.Context
import com.pocketbuddy.connector.BuildConfig

class ConnectorConfigStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun webhookUrl(): String =
        preferences.getString(KEY_WEBHOOK_URL, null)
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: BuildConfig.POCKETBUDDY_WEBHOOK_URL.trim()

    fun webhookToken(): String? =
        preferences.getString(KEY_WEBHOOK_TOKEN, null)
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?.takeUnless(::looksLikeUrl)
            ?: BuildConfig.POCKETBUDDY_WEBHOOK_TOKEN.trim().takeIf(String::isNotBlank)
                ?.takeUnless(::looksLikeUrl)

    fun userId(): String? =
        preferences.getString(KEY_USER_ID, null)
            ?.trim()
            ?.takeIf(String::isNotBlank)
            ?: BuildConfig.POCKETBUDDY_USER_ID.trim().takeIf(String::isNotBlank)

    fun accountEmail(): String? =
        preferences.getString(KEY_ACCOUNT_EMAIL, null)
            ?.trim()
            ?.takeIf(String::isNotBlank)

    fun save(webhookUrl: String, userId: String, webhookToken: String, accountEmail: String? = null) {
        preferences.edit()
            .putString(KEY_WEBHOOK_URL, webhookUrl.trim())
            .putString(KEY_USER_ID, userId.trim())
            .putString(KEY_WEBHOOK_TOKEN, webhookToken.trim())
            .putString(KEY_ACCOUNT_EMAIL, accountEmail?.trim())
            .apply()
    }

    fun clearRuntimeConfig() {
        preferences.edit()
            .remove(KEY_WEBHOOK_URL)
            .remove(KEY_USER_ID)
            .remove(KEY_WEBHOOK_TOKEN)
            .remove(KEY_ACCOUNT_EMAIL)
            .apply()
    }

    private companion object {
        private const val PREFERENCES_NAME = "pocketbuddy_connector_config"
        private const val KEY_WEBHOOK_URL = "webhook_url"
        private const val KEY_WEBHOOK_TOKEN = "webhook_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_ACCOUNT_EMAIL = "account_email"

        private fun looksLikeUrl(value: String): Boolean =
            value.startsWith("http://", ignoreCase = true) || value.startsWith("https://", ignoreCase = true)
    }
}
