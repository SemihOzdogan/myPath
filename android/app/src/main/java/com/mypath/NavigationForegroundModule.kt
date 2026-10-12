package com.mypath

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NavigationForegroundModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "NavigationForegroundModule"

  @ReactMethod
  fun start(coordinates: ReadableArray, instructions: ReadableArray, demo: Boolean, promise: Promise) {
    try {
      val encodedCoordinates = (0 until coordinates.size()).mapNotNull { index ->
        val point = coordinates.getArray(index) ?: return@mapNotNull null
        "${point.getDouble(0)},${point.getDouble(1)}"
      }.joinToString(";")
      val encodedInstructions = (0 until instructions.size()).mapNotNull { index ->
        val item = instructions.getMap(index) ?: return@mapNotNull null
        if (!item.hasKey("routeOffsetInMeters") || !item.hasKey("message")) return@mapNotNull null
        "${item.getDouble("routeOffsetInMeters")}|${item.getString("message")?.replace("|", " ")}" 
      }.joinToString(";")
      val intent = Intent(context, NavigationForegroundService::class.java)
        .putExtra("coordinates", encodedCoordinates)
        .putExtra("instructions", encodedInstructions)
        .putExtra("demo", demo)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("NAVIGATION_SERVICE_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    context.stopService(Intent(context, NavigationForegroundService::class.java))
    promise.resolve(null)
  }
}
