package com.pocketbuddy.connector.ui

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.Space
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.pocketbuddy.connector.BuildConfig
import com.pocketbuddy.connector.PocketBuddyNotificationListener
import com.pocketbuddy.connector.R
import com.pocketbuddy.connector.config.ConnectorConfigStore
import com.pocketbuddy.connector.identity.DeviceIdentityStore
import com.pocketbuddy.connector.network.WebhookClient
import com.pocketbuddy.connector.retry.WebhookRetryQueue

class SetupActivity : Activity() {
    private lateinit var statusText: TextView
    private lateinit var statusDetailText: TextView
    private lateinit var diagnosticsText: TextView
    private lateinit var webhookUrlInput: EditText
    private lateinit var userIdInput: EditText
    private lateinit var webhookTokenInput: EditText
    private lateinit var configStore: ConnectorConfigStore
    private lateinit var identityStore: DeviceIdentityStore
    private lateinit var retryQueue: WebhookRetryQueue
    private lateinit var accountEmailText: TextView
    private lateinit var connectionBannerText: TextView
    private lateinit var connectionBannerContainer: LinearLayout
    private var currentAccountEmail: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configStore = ConnectorConfigStore(applicationContext)
        identityStore = DeviceIdentityStore(applicationContext)
        retryQueue = WebhookRetryQueue(applicationContext)
        currentAccountEmail = configStore.accountEmail()
        applySystemBarTheme()
        setContentView(buildContentView())
        handleDeepLinkIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLinkIntent(intent)
    }

    private fun handleDeepLinkIntent(intent: Intent?) {
        val data: Uri = intent?.data ?: return
        if (data.scheme == "pocketbuddy" && data.host == "configure") {
            val webhookUrl = data.getQueryParameter("webhook_url")?.trim()?.removeSuffix("\\")
            val userId = data.getQueryParameter("user_id")?.trim()?.removeSuffix("\\")
            val webhookToken = data.getQueryParameter("webhook_token")?.trim()?.removeSuffix("\\")
            val accountEmail = data.getQueryParameter("account_email")?.trim()?.removeSuffix("\\")

            if (!webhookUrl.isNullOrBlank() && !userId.isNullOrBlank()) {
                currentAccountEmail = accountEmail
                configStore.save(
                    webhookUrl = webhookUrl,
                    userId = userId,
                    webhookToken = webhookToken.orEmpty(),
                    accountEmail = accountEmail
                )
                if (::webhookUrlInput.isInitialized) {
                    webhookUrlInput.setText(webhookUrl)
                }
                if (::userIdInput.isInitialized) {
                    userIdInput.setText(userId)
                }
                if (::webhookTokenInput.isInitialized) {
                    webhookTokenInput.setText(webhookToken.orEmpty())
                }
                showPairingSuccessDialog(accountEmail ?: "PocketBuddy User")
                refreshStatus()
            }
        }
    }

    private fun showPairingSuccessDialog(email: String) {
        runOnUiThread {
            if (!isFinishing && !isDestroyed) {
                try {
                    android.app.AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
                        .setTitle("Pairing Successful! 🎉")
                        .setMessage("PocketBuddy Connector is now successfully linked to your account:\n\n$email\n\nIt will securely sync supported UPI notifications. Please ensure Notification Access is enabled.")
                        .setPositiveButton("Awesome", null)
                        .setCancelable(false)
                        .show()
                } catch (e: Exception) {
                    // Fallback to simpler platform dialog if style resource is missing
                    android.app.AlertDialog.Builder(this)
                        .setTitle("Pairing Successful! 🎉")
                        .setMessage("PocketBuddy Connector is now linked to:\n\n$email")
                        .setPositiveButton("Awesome", null)
                        .show()
                }
            }
        }
    }

    private fun connectionBannerView(): LinearLayout {
        connectionBannerText = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.rgb(21, 128, 61)) // green
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER_VERTICAL
        }

        connectionBannerContainer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
            background = rounded(Color.rgb(240, 253, 244), dp(12), Color.rgb(220, 252, 231))
            val lp = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 0, dp(16))
            }
            layoutParams = lp
            visibility = View.GONE

            val icon = TextView(context).apply {
                text = "✓"
                textSize = 18f
                setTextColor(Color.rgb(21, 128, 61))
                typeface = Typeface.DEFAULT_BOLD
                setPadding(0, 0, dp(10), 0)
            }
            addView(icon)
            addView(connectionBannerText)
        }
        return connectionBannerContainer
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun buildContentView(): ScrollView {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                dp(20),
                dp(24),
                dp(20),
                dp(28),
            )
            addView(headerView())
            addView(bodyText("Securely link this phone to sync UPI payment alerts from SMS and payment apps."))
            addView(connectionBannerView())
            addView(statusCard())
            addView(configCard())
            addView(permissionCard())
            addView(diagnosticsCard())
        }

        return ScrollView(this).apply {
            setBackgroundColor(Color.rgb(248, 248, 249))
            isFillViewport = true
            clipToPadding = true
            setPadding(
                0,
                systemBarHeight("status_bar_height"),
                0,
                systemBarHeight("navigation_bar_height"),
            )
            addView(
                content,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
    }

    @Suppress("DEPRECATION")
    private fun applySystemBarTheme() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.statusBarColor = Color.rgb(248, 248, 249)
            window.navigationBarColor = Color.WHITE
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            var flags = window.decorView.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
            window.decorView.systemUiVisibility = flags
        }
    }

    private fun statusCard(): LinearLayout {
        statusText = TextView(this).apply {
            textSize = 19f
            typeface = Typeface.DEFAULT_BOLD
        }
        statusDetailText = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.rgb(113, 113, 122))
            setPadding(0, dp(6), 0, 0)
        }
        accountEmailText = TextView(this).apply {
            textSize = 14f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(Color.rgb(255, 107, 0)) // brand primary color
            setPadding(0, dp(8), 0, 0)
            visibility = View.GONE
        }

        return sectionCard().apply {
            addView(sectionKicker("Sync status"))
            addView(statusText)
            addView(statusDetailText)
            addView(accountEmailText)
        }
    }

    private fun configCard(): LinearLayout =
        sectionCard().apply {
            addView(stepTitle("1", "Connect this phone"))
            addView(bodyText("Copy the connector config from PocketBuddy web, paste it once, then save."))
            addView(secondaryButton("Paste config from clipboard") {
                pasteConnectorConfig()
            })
            addView(sectionLabel("Backend webhook URL"))
            webhookUrlInput = inputField(
                value = configStore.webhookUrl(),
                hint = "https://your-pocketbuddy-url/api/ingest/notification-v2",
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI,
                minLines = 3,
                maxLines = 4,
            )
            addView(webhookUrlInput)
            addView(sectionLabel("PocketBuddy user ID"))
            userIdInput = inputField(
                value = configStore.userId().orEmpty(),
                hint = "Paste user ID from Companion Device",
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
                minLines = 2,
                maxLines = 3,
            )
            addView(userIdInput)
            addView(sectionLabel("Webhook token, optional"))
            webhookTokenInput = inputField(
                value = configStore.webhookToken().orEmpty(),
                hint = "Leave empty unless backend gives a token",
                inputType = InputType.TYPE_CLASS_TEXT,
                minLines = 1,
                maxLines = 2,
            )
            addView(webhookTokenInput)
            addView(primaryButton("Save connector config") {
                saveConnectorConfig()
            })
            addView(secondaryButton("Reset saved config") {
                resetConnectorConfig()
            })
        }

    private fun permissionCard(): LinearLayout =
        sectionCard().apply {
            addView(stepTitle("2", "Allow notification access"))
            addView(bodyText("Enable PocketBuddy in Android Notification Access for optional Instant UPI Sync. Supported payment alerts are parsed on this phone; raw notification text is not uploaded."))
            addView(primaryButton("Open notification access") {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            })
            addView(secondaryButton("Open app notification settings") {
                openAppNotificationSettings()
            })
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                addView(secondaryButton("Allow test notifications") {
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_POST_NOTIFICATIONS)
                })
            }
        }

    private fun diagnosticsCard(): LinearLayout {
        diagnosticsText = TextView(this).apply {
            textSize = 13f
            setTextColor(Color.rgb(113, 113, 122))
            setPadding(dp(12), dp(12), dp(12), dp(12))
            background = rounded(Color.rgb(244, 244, 245), dp(10), Color.rgb(228, 228, 231))
            setTextIsSelectable(true)
        }
        return sectionCard().apply {
            addView(stepTitle("3", "Verify sync"))
            addView(bodyText("After a test payment, check Recent Sync Activity in the web app."))
            addView(diagnosticsText)
            addView(secondaryButton("Refresh status") {
                refreshStatus()
            })
        }
    }

    private fun primaryButton(label: String, onClick: () -> Unit): Button =
        Button(this).apply {
            text = label
            setAllCaps(false)
            textSize = 15f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            background = rounded(Color.rgb(255, 107, 0), dp(10))
            minHeight = dp(54)
            gravity = Gravity.CENTER
            setPadding(dp(14), dp(10), dp(14), dp(10))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                setMargins(0, dp(14), 0, 0)
            }
            setOnClickListener { onClick() }
        }

    private fun secondaryButton(label: String, onClick: () -> Unit): Button =
        Button(this).apply {
            text = label
            setAllCaps(false)
            textSize = 15f
            setTextColor(Color.rgb(9, 9, 11))
            background = rounded(Color.WHITE, dp(10), Color.rgb(228, 228, 231))
            minHeight = dp(54)
            gravity = Gravity.CENTER
            setPadding(dp(14), dp(10), dp(14), dp(10))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                setMargins(0, dp(10), 0, 0)
            }
            setOnClickListener { onClick() }
        }

    private fun sectionLabel(label: String): TextView =
        TextView(this).apply {
            text = label
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(63, 63, 70))
            setPadding(0, dp(18), 0, dp(6))
        }

    private fun inputField(
        value: String,
        hint: String,
        inputType: Int = InputType.TYPE_CLASS_TEXT,
        minLines: Int = 2,
        maxLines: Int = 4,
    ): EditText =
        EditText(this).apply {
            setText(value)
            this.hint = hint
            this.inputType = inputType or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            setSingleLine(false)
            setHorizontallyScrolling(false)
            this.minLines = minLines
            this.maxLines = maxLines
            minHeight = dp(if (minLines <= 1) 58 else 82)
            gravity = Gravity.TOP or Gravity.START
            textSize = 16f
            setTextColor(Color.rgb(9, 9, 11))
            setHintTextColor(Color.rgb(113, 113, 122))
            setPadding(dp(16), dp(12), dp(16), dp(12))
            background = rounded(Color.WHITE, dp(10), Color.rgb(228, 228, 231))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
        }

    private fun refreshStatus() {
        val notificationAccessEnabled = isNotificationAccessEnabled()
        val appNotificationsEnabled = areAppNotificationsUsable()
        val userId = identityStore.userId()
        val ready = notificationAccessEnabled && !userId.isNullOrBlank()
        val accountEmail = configStore.accountEmail()

        statusText.text = if (ready) "Ready to sync" else "Setup needed"
        statusText.setTextColor(if (ready) Color.rgb(22, 101, 52) else Color.rgb(146, 64, 14))
        statusDetailText.text = when {
            !notificationAccessEnabled -> "Next step: open Notification Access and enable PocketBuddy."
            userId.isNullOrBlank() -> "Next step: paste and save the user ID from PocketBuddy web."
            else -> "This phone can now send locally parsed payment events to PocketBuddy."
        }

        val hasConfig = !userId.isNullOrBlank()
        if (hasConfig && !accountEmail.isNullOrBlank()) {
            accountEmailText.text = "Connected Account: $accountEmail"
            accountEmailText.visibility = View.VISIBLE
            connectionBannerText.text = "Linked to $accountEmail"
            connectionBannerContainer.visibility = View.VISIBLE
        } else {
            accountEmailText.visibility = View.GONE
            connectionBannerContainer.visibility = View.GONE
        }

        diagnosticsText.text = buildString {
            appendLine("Notification access: ${if (notificationAccessEnabled) "enabled" else "disabled"}")
            appendLine("App notifications: ${if (appNotificationsEnabled) "enabled" else "disabled"}")
            appendLine("Queued retries: ${retryQueue.size()}")
            appendLine("User ID: ${userId ?: "not set"}")
            appendLine("Connected Account: ${accountEmail ?: "not set"}")
            appendLine("Device ID: ${identityStore.deviceId()}")
            appendLine("Webhook: ${configStore.webhookUrl()}")
            appendLine("Build default: ${BuildConfig.POCKETBUDDY_WEBHOOK_URL}")
        }
    }

    private fun saveConnectorConfig() {
        val webhookUrl = webhookUrlInput.text.toString().trim().removeSuffix("\\")
        val userId = userIdInput.text.toString().trim().removeSuffix("\\")
        val webhookToken = webhookTokenInput.text.toString().trim().removeSuffix("\\")

        if (!webhookUrl.startsWith("http://") && !webhookUrl.startsWith("https://")) {
            webhookUrlInput.error = "Use a full http:// or https:// URL"
            return
        }

        if (userId.isBlank()) {
            userIdInput.error = "Paste the user ID from PocketBuddy web"
            return
        }

        if (webhookToken.startsWith("http://") || webhookToken.startsWith("https://")) {
            webhookTokenInput.error = "Token should not be a URL. Leave it empty."
            return
        }

        configStore.save(
            webhookUrl = webhookUrl,
            userId = userId,
            webhookToken = webhookToken,
            accountEmail = currentAccountEmail
        )
        showPairingSuccessDialog(currentAccountEmail ?: "PocketBuddy User")
        refreshStatus()
    }

    private fun pasteConnectorConfig() {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val pastedText = clipboard.primaryClip
            ?.takeIf { it.itemCount > 0 }
            ?.getItemAt(0)
            ?.coerceToText(this)
            ?.toString()
            .orEmpty()
            .trim()

        if (pastedText.isBlank()) {
            Toast.makeText(this, "Clipboard is empty", Toast.LENGTH_SHORT).show()
            return
        }

        val values = pastedText
            .lineSequence()
            .mapNotNull { line ->
                val parts = line.split("=", limit = 2)
                if (parts.size == 2) parts[0].trim() to parts[1].trim() else null
            }
            .toMap()

        var filled = false
        values["POCKETBUDDY_WEBHOOK_URL"]?.takeIf { it.isNotBlank() }?.let {
            webhookUrlInput.setText(it)
            filled = true
        }
        values["POCKETBUDDY_USER_ID"]?.takeIf { it.isNotBlank() }?.let {
            userIdInput.setText(it)
            filled = true
        }
        values["POCKETBUDDY_WEBHOOK_TOKEN"]?.let {
            webhookTokenInput.setText(it)
            filled = true
        } ?: run {
            if (filled) webhookTokenInput.setText("")
        }
        values["POCKETBUDDY_ACCOUNT_EMAIL"]?.takeIf { it.isNotBlank() }?.let {
            currentAccountEmail = it
        }

        if (filled) {
            Toast.makeText(this, "Config pasted. Review and tap Save.", Toast.LENGTH_LONG).show()
        } else {
            Toast.makeText(this, "No PocketBuddy config found in clipboard", Toast.LENGTH_LONG).show()
        }
    }

    private fun resetConnectorConfig() {
        val userId = configStore.userId()
        val deviceId = identityStore.deviceId()
        if (!userId.isNullOrBlank()) {
            val client = WebhookClient(applicationContext)
            client.unpair(deviceId, userId)
        }

        configStore.clearRuntimeConfig()
        currentAccountEmail = null
        webhookUrlInput.setText(configStore.webhookUrl())
        userIdInput.setText(configStore.userId().orEmpty())
        webhookTokenInput.setText(configStore.webhookToken().orEmpty())
        Toast.makeText(this, "Connector config reset", Toast.LENGTH_SHORT).show()
        refreshStatus()
    }

    private fun isNotificationAccessEnabled(): Boolean {
        val enabledListeners = Settings.Secure.getString(
            contentResolver,
            "enabled_notification_listeners",
        ).orEmpty()
        val listenerComponent = ComponentName(this, PocketBuddyNotificationListener::class.java)
        return enabledListeners.split(":").any { it.equals(listenerComponent.flattenToString(), ignoreCase = true) }
    }

    private fun areAppNotificationsUsable(): Boolean =
        getSystemService(NotificationManager::class.java).areNotificationsEnabled() &&
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            } else {
                true
            }

    private fun openAppNotificationSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:$packageName"))
        }
        startActivity(intent)
    }

    private fun headerView(): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(8))
            addView(
                ImageView(this@SetupActivity).apply {
                    setImageResource(R.drawable.ic_pocketbuddy_logo)
                    contentDescription = "PocketBuddy logo"
                },
                LinearLayout.LayoutParams(dp(52), dp(52)),
            )
            addView(
                Space(this@SetupActivity),
                LinearLayout.LayoutParams(dp(12), dp(1)),
            )
            addView(
                titleText("PocketBuddy Connector").apply {
                    setPadding(0, 0, 0, 0)
                },
                LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f,
                ),
            )
        }

    private fun titleText(text: String): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 27f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(9, 9, 11))
            setPadding(0, 0, 0, dp(8))
        }

    private fun sectionTitle(text: String): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(9, 9, 11))
            setPadding(0, 0, 0, dp(8))
        }

    private fun sectionKicker(text: String): TextView =
        TextView(this).apply {
            this.text = text.uppercase()
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(113, 113, 122))
            setPadding(0, 0, 0, dp(7))
        }

    private fun stepTitle(step: String, title: String): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(10))
            addView(
                TextView(this@SetupActivity).apply {
                    text = step
                    textSize = 14f
                    typeface = Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    setTextColor(Color.WHITE)
                    background = rounded(Color.rgb(255, 107, 0), dp(16))
                },
                LinearLayout.LayoutParams(dp(32), dp(32)),
            )
            addView(
                Space(this@SetupActivity),
                LinearLayout.LayoutParams(dp(10), dp(1)),
            )
            addView(
                sectionTitle(title).apply {
                    setPadding(0, 0, 0, 0)
                },
                LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f,
                ),
            )
        }

    private fun bodyText(text: String): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 14f
            setTextColor(Color.rgb(113, 113, 122))
            setLineSpacing(dp(3).toFloat(), 1.05f)
            setPadding(0, 0, 0, dp(10))
        }

    private fun sectionCard(): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(18), dp(18), dp(18))
            background = rounded(Color.WHITE, dp(14), Color.rgb(228, 228, 231))
            gravity = Gravity.START
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                setMargins(0, dp(14), 0, 0)
            }
        }

    private fun rounded(
        color: Int,
        radius: Int,
        strokeColor: Int? = null,
    ): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = radius.toFloat()
            strokeColor?.let { setStroke(dp(1), it) }
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun systemBarHeight(resourceName: String): Int {
        val resourceId = resources.getIdentifier(resourceName, "dimen", "android")
        return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 0
    }

    private companion object {
        private const val REQUEST_POST_NOTIFICATIONS = 1001
    }
}
