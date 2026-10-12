package com.mypath

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.speech.tts.TextToSpeech
import java.util.Locale
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class NavigationForegroundService : Service() {
  private lateinit var locationManager: LocationManager
  private var tts: TextToSpeech? = null
  private var points = emptyList<Pair<Double, Double>>()
  private var instructions = emptyList<Pair<Double, String>>()
  private var spoken = mutableSetOf<Double>()
  private var demoProgress = 0.0
  private val handler = Handler(Looper.getMainLooper())
  private val demoTick = object : Runnable { override fun run() { demoProgress += routeLength() / 80; announceProgress(demoProgress); if (demoProgress < routeLength()) handler.postDelayed(this, 600) } }
  private val listener = LocationListener { location -> announce(location) }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val channelId = "navigation"
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(channelId, "Aktif navigasyon", NotificationManager.IMPORTANCE_LOW),
    )
    val notification = NotificationCompat.Builder(this, channelId)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("MyPath navigasyon açık")
      .setContentText("Sesli yönlendirme ve konum güncelleniyor")
      .setOngoing(true)
      .build()
    ServiceCompat.startForeground(
      this,
      1042,
      notification,
      android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
    )
    points = intent?.getStringExtra("coordinates")?.split(";")?.mapNotNull { raw ->
      raw.split(",").takeIf { it.size == 2 }?.let { it[0].toDoubleOrNull()?.let { lng -> it[1].toDoubleOrNull()?.let { lat -> lng to lat } } }
    } ?: emptyList()
    instructions = intent?.getStringExtra("instructions")?.split(";")?.mapNotNull { raw ->
      raw.split("|", limit = 2).takeIf { it.size == 2 }?.let { it[0].toDoubleOrNull()?.let { offset -> offset to it[1] } }
    } ?: emptyList()
    spoken = mutableSetOf()
    handler.removeCallbacks(demoTick)
    if (intent?.getBooleanExtra("demo", false) == true) { demoProgress = 0.0; handler.post(demoTick) }
    tts = TextToSpeech(this) { if (it == TextToSpeech.SUCCESS) tts?.language = Locale("tr", "TR") }
    try { locationManager = getSystemService(LocationManager::class.java); locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 3f, listener) } catch (_: SecurityException) { }
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    handler.removeCallbacks(demoTick)
    if (::locationManager.isInitialized) locationManager.removeUpdates(listener)
    tts?.shutdown()
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun announce(location: Location) {
    if (points.size < 2) return
    var nearest = 0
    var nearestDistance = Double.MAX_VALUE
    points.forEachIndexed { index, point ->
      val result = FloatArray(1); Location.distanceBetween(location.latitude, location.longitude, point.second, point.first, result)
      if (result[0] < nearestDistance) { nearestDistance = result[0].toDouble(); nearest = index }
    }
    var progress = 0.0
    for (index in 1..nearest) { val result = FloatArray(1); Location.distanceBetween(points[index-1].second, points[index-1].first, points[index].second, points[index].first, result); progress += result[0] }
    announceProgress(progress)
  }

  private fun announceProgress(progress: Double) {
    instructions.firstOrNull { it.first > progress && it.first - progress <= 150 && spoken.add(it.first) }?.let { next ->
      val distance = (next.first - progress).toInt().coerceAtLeast(0)
      tts?.speak("$distance metre sonra, ${next.second}", TextToSpeech.QUEUE_FLUSH, null, "navigation-$distance")
    }
  }

  private fun routeLength(): Double = points.indices.drop(1).sumOf { index ->
    val result = FloatArray(1); Location.distanceBetween(points[index - 1].second, points[index - 1].first, points[index].second, points[index].first, result); result[0].toDouble()
  }
}
