package com.expensetrack1ux.dev

import android.Manifest
import android.content.pm.PackageManager
import android.database.Cursor
import android.provider.Telephony
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.Locale

@CapacitorPlugin(
    name = "SmsTransactions",
    permissions = [
        Permission(strings = [Manifest.permission.READ_SMS], alias = "sms")
    ]
)
class SmsTransactionsPlugin : Plugin() {

    private val PREF_NAME = "splitmate_sms_capture"
    private val KEY_START_AT = "start_at"
    private val KEY_LAST_FETCH_AT = "last_fetch_at"
    private val BACKFILL_WINDOW_MS = 30L * 24L * 60L * 60L * 1000L
    private val financialSenderHints = listOf(
        "BANK", "BNK", "HDFC", "ICICI", "SBI", "KOTAK", "AXIS", "YESBANK", "PNB",
        "IDFC", "CANARA", "BOB", "UNION", "PAYTM", "PHONEPE", "GPAY", "UPI", "CRED"
    )
    private val financialBodyHints = listOf(
        "debited", "credited", "sent", "received", "upi", "imps", "neft", "rtgs",
        "txn", "transaction", "withdrawn", "spent", "paid", "payment", "bank"
    )

    @PluginMethod
    fun requestSmsPermissions(call: PluginCall) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            val result = JSObject()
            result.put("granted", true)
            call.resolve(result)
            return
        }

        requestPermissionForAlias("sms", call, "permissionCallback")
    }

    @PluginMethod
    fun checkSmsPermissions(call: PluginCall) {
        val result = JSObject()
        result.put("granted", getPermissionState("sms") == PermissionState.GRANTED)
        call.resolve(result)
    }

    @Suppress("unused")
    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        val result = JSObject()
        result.put("granted", getPermissionState("sms") == PermissionState.GRANTED)
        call.resolve(result)
    }

    @PluginMethod
    fun initializeCapture(call: PluginCall) {
        val prefs = context.getSharedPreferences(PREF_NAME, 0)
        val now = System.currentTimeMillis()
        val backfillStart = now - BACKFILL_WINDOW_MS

        val storedStartAt = if (prefs.contains(KEY_START_AT)) prefs.getLong(KEY_START_AT, backfillStart) else backfillStart
        val storedLastFetchAt = if (prefs.contains(KEY_LAST_FETCH_AT)) prefs.getLong(KEY_LAST_FETCH_AT, backfillStart) else backfillStart
        val effectiveStartAt = minOf(storedStartAt, backfillStart)
        val effectiveLastFetchAt = minOf(storedLastFetchAt, backfillStart)

        if (!prefs.contains(KEY_START_AT) || !prefs.contains(KEY_LAST_FETCH_AT) || storedStartAt > backfillStart || storedLastFetchAt > backfillStart) {
            prefs.edit()
            .putLong(KEY_START_AT, effectiveStartAt)
            .putLong(KEY_LAST_FETCH_AT, effectiveLastFetchAt)
                .apply()
        }

        val result = JSObject()
        result.put("initialized", true)
        call.resolve(result)
    }

    @PluginMethod
    fun fetchNewTransactions(call: PluginCall) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            call.reject("SMS permission not granted")
            return
        }

        val prefs = context.getSharedPreferences(PREF_NAME, 0)
        val now = System.currentTimeMillis()
        val startAt = prefs.getLong(KEY_START_AT, now - BACKFILL_WINDOW_MS)
        val lastFetchAt = prefs.getLong(KEY_LAST_FETCH_AT, startAt)
        val since = minOf(maxOf(startAt, lastFetchAt), now - BACKFILL_WINDOW_MS)
        val includeHistory = call.getBoolean("includeHistory", false) ?: false
        val limit = call.getInt("limit", if (includeHistory) 10 else 30) ?: if (includeHistory) 10 else 30

        val messages = JSArray()
        val projection = arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE)
        val selection = if (includeHistory) {
            "${Telephony.Sms.TYPE} = 1"
        } else {
            "${Telephony.Sms.DATE} >= ? AND ${Telephony.Sms.TYPE} = 1"
        }
        val selectionArgs = if (includeHistory) null else arrayOf(since.toString())
        val sortOrder = "${Telephony.Sms.DATE} DESC"

        var cursor: Cursor? = null
        try {
            cursor = context.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )

            var count = 0
            if (cursor != null) {
                val idIdx = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
                val addrIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                val bodyIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
                val dateIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)

                while (cursor.moveToNext() && count < limit) {
                    val body = cursor.getString(bodyIdx) ?: ""
                    val address = cursor.getString(addrIdx) ?: ""
                    if (!isFinancialMessage(address, body)) continue

                    val amount = extractAmount(body)
                    if (amount <= 0.0) continue

                    val entry = JSObject()
                    entry.put("id", cursor.getLong(idIdx).toString())
                    entry.put("address", address)
                    entry.put("body", minimizeBody(body))
                    entry.put("amount", amount)
                    entry.put("dateMillis", cursor.getLong(dateIdx))
                    messages.put(entry)
                    count += 1
                }
            }

            if (!includeHistory) {
                prefs.edit().putLong(KEY_LAST_FETCH_AT, System.currentTimeMillis()).apply()
            }
            val result = JSObject()
            result.put("messages", messages)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Failed to fetch SMS transactions: ${e.message}")
        } finally {
            cursor?.close()
        }
    }

    private fun extractAmount(body: String): Double {
        val normalized = body.lowercase(Locale.US)
        val transactionMarkers = listOf(
            "debited",
            "credited",
            "credit",
            "received",
            "spent",
            "purchase",
            "txn",
            "transferred",
            "transfer",
            "paid",
            "payment",
            "withdrawn",
            "withdrawal",
            "charge",
            "charged",
            "dr ",
            " dr",
            "upi",
            "imps",
            "neft",
            "rtgs"
        )

        if (transactionMarkers.none { normalized.contains(it) }) {
            return 0.0
        }

        val regex = Regex("(?:rs\\.?|inr|₹)\\s*([0-9,]+(?:\\.[0-9]{1,2})?)", RegexOption.IGNORE_CASE)
        val match = regex.find(body)
            ?: Regex("([0-9,]+(?:\\.[0-9]{1,2})?)\\s*(?:rs\\.?|inr|₹)", RegexOption.IGNORE_CASE).find(body)
            ?: return 0.0
        val raw = match.groupValues[1].replace(",", "").trim()
        return raw.toDoubleOrNull() ?: 0.0
    }

    private fun isFinancialMessage(address: String, body: String): Boolean {
        val normalizedAddress = address.uppercase(Locale.US).replace(" ", "")
        val normalizedBody = body.lowercase(Locale.US)

        if (normalizedBody.contains("cooling period limit for upi transactions")
            && normalizedBody.contains("via wa")
            && normalizedBody.contains("72 hours after new user registration")) {
            return false
        }

        val senderLooksFinancial = financialSenderHints.any { normalizedAddress.contains(it) }
            || Regex("^[A-Z]{2}-[A-Z0-9]{4,}$").containsMatchIn(normalizedAddress)

        if (!senderLooksFinancial) return false

        val hasFinancialHint = financialBodyHints.any { normalizedBody.contains(it) }
        if (!hasFinancialHint) return false

        if (normalizedBody.contains("otp") && !normalizedBody.contains("debited") && !normalizedBody.contains("credited")) {
            return false
        }

        return true
    }

    private fun minimizeBody(body: String): String {
        val normalized = body
            .replace(Regex("\\s+"), " ")
            .trim()

        return if (normalized.length <= 240) normalized else "${normalized.take(240)}..."
    }
}
