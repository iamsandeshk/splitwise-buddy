# ===========================================================================
# Expense Tracker — ProGuard / R8 Rules
# App ID: com.expensetrack1ux.dev
# ===========================================================================


# ---------------------------------------------------------------------------
# 1. Crash reporting / useful stack traces
# ---------------------------------------------------------------------------

-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod

-renamesourcefileattribute SourceFile


# ---------------------------------------------------------------------------
# 2. Capacitor
# ---------------------------------------------------------------------------

# Keep Capacitor plugin classes discovered through annotations/reflection.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# Capacitor plugin methods called from JavaScript.
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}

# Permission callbacks.
-keepclassmembers class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
}

# Activity callbacks.
-keepclassmembers class * {
    @com.getcapacitor.annotation.ActivityCallback <methods>;
}

# JavaScript interface methods.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}


# ---------------------------------------------------------------------------
# 3. Cordova
# ---------------------------------------------------------------------------

# Cordova framework/plugin classes that are discovered dynamically.
-keep class org.apache.cordova.** { *; }


# ---------------------------------------------------------------------------
# 4. cordova-plugin-purchase
# ---------------------------------------------------------------------------

# Fovea purchase plugin.
-keep class cc.fovea.** { *; }

# Some versions/builds of the plugin use this namespace.
-keep class com.alexdisler.** { *; }


# ---------------------------------------------------------------------------
# 5. Google Play Billing
# ---------------------------------------------------------------------------

# Keep BillingClient API classes used by the purchase plugin.
-keep class com.android.billingclient.api.** { *; }
-dontwarn com.android.billingclient.**
-dontwarn cc.fovea.**
-dontwarn com.alexdisler.**
-dontwarn org.apache.cordova.**
-dontwarn com.getcapacitor.**


# ---------------------------------------------------------------------------
# 6. Firebase
# ---------------------------------------------------------------------------

# IMPORTANT:
# Do NOT keep all Firebase classes.
# Firebase libraries provide their own R8/consumer rules.

# Keep Firebase component annotations/metadata.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations
-keepattributes RuntimeVisibleParameterAnnotations,RuntimeInvisibleParameterAnnotations
-dontwarn com.google.firebase.**

# Suppress missing class warnings for optional authentication providers not included in the project
# (@capacitor-firebase/authentication references Facebook SDK stubs even when Facebook login is not used)
-dontwarn com.facebook.**


# ---------------------------------------------------------------------------
# 7. Google Sign-In / Google Play Services
# ---------------------------------------------------------------------------

# Only keep the authentication/sign-in pieces if they are referenced
# reflectively by the app/plugin.
-keep class com.google.android.gms.auth.api.signin.** { *; }


# ---------------------------------------------------------------------------
# 8. AdMob
# ---------------------------------------------------------------------------

# AdMob classes used by the native ad plugin.
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.ads.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.ads.**


# ---------------------------------------------------------------------------
# 9. Application components
# ---------------------------------------------------------------------------

-keep class com.expensetrack1ux.dev.MainActivity { *; }

-keep class com.expensetrack1ux.dev.TotalBriefWidget { *; }

-keep class com.expensetrack1ux.dev.QuickAddPersonalWidget { *; }

-keep class com.expensetrack1ux.dev.QuickAddSharedWidget { *; }

-keep class com.expensetrack1ux.dev.NativeAdPlugin { *; }

-keep class com.expensetrack1ux.dev.WidgetBridgePlugin { *; }


# ---------------------------------------------------------------------------
# 10. Android components
# ---------------------------------------------------------------------------

# Android discovers these through the manifest/component system.
-keep public class * extends android.app.Activity

-keep public class * extends android.app.Service

-keep public class * extends android.content.BroadcastReceiver

-keep public class * extends android.content.ContentProvider

-keep public class * extends android.appwidget.AppWidgetProvider


# ---------------------------------------------------------------------------
# 11. FileProvider
# ---------------------------------------------------------------------------

-keep class androidx.core.content.FileProvider { *; }


# ---------------------------------------------------------------------------
# 12. Kotlin
# ---------------------------------------------------------------------------

-keep class kotlin.Metadata { *; }

-keepclassmembers class **$WhenMappings {
    <fields>;
}


# ---------------------------------------------------------------------------
# 13. WebView
# ---------------------------------------------------------------------------

-keepclassmembers class * extends android.webkit.WebViewClient {
    public *;
}