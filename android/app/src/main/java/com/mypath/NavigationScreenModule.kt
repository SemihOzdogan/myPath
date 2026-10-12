package com.mypath

import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NavigationScreenModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "NavigationScreenModule"

  @ReactMethod
  fun setAwake(enabled: Boolean, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.resolve(null)
      return
    }

    activity.runOnUiThread {
      if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      promise.resolve(null)
    }
  }
}
