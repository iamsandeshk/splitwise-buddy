package com.expensetrack1ux.dev

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import java.text.DecimalFormat

class TotalBriefWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        val prefs = context.getSharedPreferences(
            WidgetBridgePlugin.PREFS_NAME, Context.MODE_PRIVATE
        )

        val spent = prefs.getFloat(WidgetBridgePlugin.KEY_SPENT, 0f)
        val income = prefs.getFloat(WidgetBridgePlugin.KEY_INCOME, 0f)
        val balance = prefs.getFloat(WidgetBridgePlugin.KEY_BALANCE, 0f)
        val currency = prefs.getString(WidgetBridgePlugin.KEY_CURRENCY, "₹") ?: "₹"
        val month = prefs.getString(WidgetBridgePlugin.KEY_MONTH, "This Month") ?: "This Month"

        val views = RemoteViews(context.packageName, R.layout.widget_total_brief)

        views.setTextViewText(R.id.tv_date_label, "NET • ${month.uppercase()}")
        
        // Income and Spent
        views.setTextViewText(R.id.tv_in_amount, formatAmount(currency, income))
        views.setTextViewText(R.id.tv_out_amount, formatAmount(currency, spent))
        
        // Main Balance
        views.setTextViewText(R.id.tv_main_balance, formatAmount(currency, balance, showPlus = true))
        
        // Cycle Text and Colors
        if (balance < 0) {
            views.setTextColor(R.id.tv_main_balance, android.graphics.Color.parseColor("#FF4B4B"))
            views.setImageViewResource(R.id.v_cycle_dot, R.drawable.widget_dot_red)
            views.setTextViewText(R.id.tv_cycle_text, "Net outgoing this cycle")
        } else if (balance > 0) {
            views.setTextColor(R.id.tv_main_balance, android.graphics.Color.parseColor("#34C759"))
            views.setImageViewResource(R.id.v_cycle_dot, R.drawable.widget_dot_green)
            views.setTextViewText(R.id.tv_cycle_text, "In the green")
        } else {
            views.setTextColor(R.id.tv_main_balance, android.graphics.Color.parseColor("#888888"))
            views.setImageViewResource(R.id.v_cycle_dot, R.drawable.widget_dot_green)
            views.setTextViewText(R.id.tv_cycle_text, "Squared up.")
        }

        // On click → open app at home tab
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            data = Uri.parse("splitmate://home?widget_action=view_brief")
        }

        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        views.setOnClickPendingIntent(R.id.widget_total_brief_root, pendingIntent)

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun formatAmount(currency: String, amount: Float, showPlus: Boolean = false): String {
        val absAmount = Math.abs(amount)
        val formatter = DecimalFormat("#,##0")
        val formatted = formatter.format(absAmount.toLong())
        val prefix = if (amount < 0) "-" else if (amount > 0 && showPlus) "+" else ""
        return "$prefix$currency$formatted"
    }
}
