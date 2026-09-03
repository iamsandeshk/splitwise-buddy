package com.expensetrack1ux.dev

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.google.android.gms.ads.MobileAds

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(NativeAdPlugin::class.java)
        registerPlugin(WidgetBridgePlugin::class.java)

        super.onCreate(savedInstanceState)

        // Initialize Google Mobile Ads SDK
        MobileAds.initialize(this) { initStatus ->
            val statusMap = initStatus.adapterStatusMap
            for ((adapter, status) in statusMap) {
                android.util.Log.d("AdMob", "Adapter: $adapter, Status: ${status.initializationState}")
            }
        }
    }
}
