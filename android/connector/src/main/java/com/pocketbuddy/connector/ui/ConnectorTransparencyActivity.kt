package com.pocketbuddy.connector.ui

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Space
import android.widget.TextView

class ConnectorTransparencyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applySystemBarTheme()
        setContentView(buildContentView())
    }

    private fun buildContentView(): ScrollView {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(28))
            addView(headerRow())
            addView(summaryCard())
            addView(dataRow(android.R.drawable.ic_menu_view, "Reads", "Supported payment and SMS notifications after you allow Notification Access."))
            addView(dataRow(android.R.drawable.ic_menu_manage, "Parses on phone", "Amount, merchant, direction, app, reference, and confidence."))
            addView(dataRow(android.R.drawable.ic_menu_upload, "Sends", "Structured fields and a masked preview to PocketBuddy."))
            addView(dataRow(android.R.drawable.ic_dialog_alert, "Does not send", "No bank login, OTP, MPIN, or raw notification text."))
            addView(dataRow(android.R.drawable.ic_menu_close_clear_cancel, "Your control", "Reset config anytime to stop this phone from sending new events."))
            addView(primaryButton("Back") { finish() })
        }

        return ScrollView(this).apply {
            setBackgroundColor(Color.rgb(248, 248, 249))
            isFillViewport = true
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

    private fun headerRow(): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(12))
            addView(iconBadge(android.R.drawable.ic_dialog_info), LinearLayout.LayoutParams(dp(48), dp(48)))
            addView(Space(this@ConnectorTransparencyActivity), LinearLayout.LayoutParams(dp(12), dp(1)))
            addView(
                LinearLayout(this@ConnectorTransparencyActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(kicker("Connector transparency"))
                    addView(title("How it works"))
                },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
            )
        }

    private fun summaryCard(): LinearLayout =
        card().apply {
            addView(body("PocketBuddy Connector watches for supported payment alerts only after you grant Android Notification Access. It turns those alerts into reviewable transaction facts."))
        }

    private fun dataRow(iconRes: Int, heading: String, detail: String): LinearLayout =
        card().apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(iconBadge(iconRes), LinearLayout.LayoutParams(dp(42), dp(42)))
            addView(Space(this@ConnectorTransparencyActivity), LinearLayout.LayoutParams(dp(12), dp(1)))
            addView(
                LinearLayout(this@ConnectorTransparencyActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(label(heading))
                    addView(body(detail).apply { setPadding(0, dp(2), 0, 0) })
                },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
            )
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
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                setMargins(0, dp(16), 0, 0)
            }
            setOnClickListener { onClick() }
        }

    private fun card(): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            background = rounded(Color.WHITE, dp(14), Color.rgb(228, 228, 231))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply {
                setMargins(0, dp(12), 0, 0)
            }
        }

    private fun iconBadge(iconRes: Int): ImageView =
        ImageView(this).apply {
            setImageResource(iconRes)
            setColorFilter(Color.rgb(255, 107, 0))
            setPadding(dp(10), dp(10), dp(10), dp(10))
            background = rounded(Color.rgb(255, 247, 237), dp(12), Color.rgb(254, 215, 170))
        }

    private fun kicker(text: String): TextView =
        TextView(this).apply {
            this.text = text.uppercase()
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(113, 113, 122))
        }

    private fun title(text: String): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 28f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(9, 9, 11))
        }

    private fun label(text: String): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 16f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(9, 9, 11))
        }

    private fun body(text: String): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 14f
            setTextColor(Color.rgb(113, 113, 122))
            setLineSpacing(dp(3).toFloat(), 1.05f)
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

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun systemBarHeight(resourceName: String): Int {
        val resourceId = resources.getIdentifier(resourceName, "dimen", "android")
        return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 0
    }
}
