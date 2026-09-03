package com.expensetrack1ux.dev

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {

    companion object {
        const val PREFS_NAME = "widget_data"
        const val KEY_SPENT = "monthly_spent"
        const val KEY_INCOME = "monthly_income"
        const val KEY_BALANCE = "net_balance"
        const val KEY_CURRENCY = "currency_symbol"
        const val KEY_MONTH = "month_label"
        const val KEY_LAST_UPDATED = "last_updated"
    }

    @PluginMethod
    fun updateWidgetData(call: PluginCall) {
        val context = activity ?: run {
            call.reject("Activity not available")
            return
        }

        val spent = call.getDouble("spent", 0.0) ?: 0.0
        val income = call.getDouble("income", 0.0) ?: 0.0
        val balance = call.getDouble("balance", 0.0) ?: 0.0
        val currency = call.getString("currency", "₹") ?: "₹"
        val month = call.getString("month", "This Month") ?: "This Month"

        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putFloat(KEY_SPENT, spent.toFloat())
            putFloat(KEY_INCOME, income.toFloat())
            putFloat(KEY_BALANCE, balance.toFloat())
            putString(KEY_CURRENCY, currency)
            putString(KEY_MONTH, month)
            putLong(KEY_LAST_UPDATED, System.currentTimeMillis())
            apply()
        }

        // Notify all widget providers to refresh
        val appWidgetManager = AppWidgetManager.getInstance(context)

        val briefWidget = ComponentName(context, TotalBriefWidget::class.java)
        val briefIds = appWidgetManager.getAppWidgetIds(briefWidget)
        if (briefIds.isNotEmpty()) {
            val briefProvider = TotalBriefWidget()
            briefProvider.onUpdate(context, appWidgetManager, briefIds)
        }

        call.resolve()
    }
}
