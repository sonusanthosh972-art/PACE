package com.paisapulse.smsreader

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Small app-private queue (SharedPreferences) between the native receivers and JavaScript.
 * Items survive the app being closed; JS drains them on the next opportunity (live event,
 * headless task, or app start). Holds bank-sender / payment-app text only, never leaves the device,
 * and is emptied as soon as JS has parsed it.
 */
object PendingStore {
  private const val PREFS = "paisapulse.pending"
  private const val KEY = "items"
  private const val MAX_ITEMS = 500
  private val lock = Any()

  fun addSms(context: Context, sender: String, body: String, receivedAt: Long) {
    add(context, JSONObject()
      .put("kind", "sms")
      .put("sender", sender)
      .put("body", body)
      .put("receivedAt", receivedAt))
  }

  fun addNotification(context: Context, packageName: String, title: String, text: String, postedAt: Long) {
    add(context, JSONObject()
      .put("kind", "notification")
      .put("packageName", packageName)
      .put("title", title)
      .put("text", text)
      .put("postedAt", postedAt))
  }

  private fun add(context: Context, item: JSONObject) = synchronized(lock) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val items = JSONArray(prefs.getString(KEY, "[]"))
    items.put(item)
    // Bounded: drop the oldest if JS has not drained for a long time.
    val trimmed = JSONArray()
    val start = maxOf(0, items.length() - MAX_ITEMS)
    for (i in start until items.length()) trimmed.put(items.get(i))
    prefs.edit().putString(KEY, trimmed.toString()).apply()
  }

  fun size(context: Context): Int = synchronized(lock) {
    JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]")).length()
  }

  /** Returns all queued items as plain maps and clears the queue atomically. */
  fun drain(context: Context): List<Map<String, Any>> = synchronized(lock) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val items = JSONArray(prefs.getString(KEY, "[]"))
    prefs.edit().remove(KEY).commit()
    (0 until items.length()).map { i ->
      val obj = items.getJSONObject(i)
      obj.keys().asSequence().associateWith { key -> obj.get(key) }
    }
  }

  fun clear(context: Context) = synchronized(lock) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).commit()
  }
}
