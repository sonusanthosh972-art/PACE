package com.paisapulse.smsreader

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Small app-private queue (SharedPreferences) between the native receivers and JavaScript.
 * Items survive the app being closed; JS drains them on the next opportunity (live event,
 * headless task, or app start). Holds bank-sender / payment-app text only, never leaves the device,
 * and is emptied once JS has saved it: JS peeks, stores the parsed transactions, then acknowledges
 * by sequence number, so an item is never lost if the app dies in between.
 */
object PendingStore {
  private const val PREFS = "paisapulse.pending"
  private const val KEY = "items"
  private const val KEY_SEQ = "nextSeq"
  const val SEQ_FIELD = "queueSeq"
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
    val seq = prefs.getLong(KEY_SEQ, 1L)
    items.put(item.put(SEQ_FIELD, seq))
    // Bounded: drop the oldest if JS has not drained for a long time.
    val trimmed = JSONArray()
    val start = maxOf(0, items.length() - MAX_ITEMS)
    for (i in start until items.length()) trimmed.put(items.get(i))
    prefs.edit().putString(KEY, trimmed.toString()).putLong(KEY_SEQ, seq + 1).commit()
  }

  fun size(context: Context): Int = synchronized(lock) {
    JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]")).length()
  }

  /**
   * Returns all queued items as plain maps without removing them. Items queued by an older app
   * version have no sequence number; they get one here so they can be acknowledged.
   */
  fun peek(context: Context): List<Map<String, Any>> = synchronized(lock) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val items = JSONArray(prefs.getString(KEY, "[]"))
    var seq = prefs.getLong(KEY_SEQ, 1L)
    var assigned = false
    for (i in 0 until items.length()) {
      val obj = items.getJSONObject(i)
      if (!obj.has(SEQ_FIELD)) {
        obj.put(SEQ_FIELD, seq++)
        assigned = true
      }
    }
    if (assigned) prefs.edit().putString(KEY, items.toString()).putLong(KEY_SEQ, seq).commit()
    (0 until items.length()).map { i ->
      val obj = items.getJSONObject(i)
      obj.keys().asSequence().associateWith { key -> obj.get(key) }
    }
  }

  /** Removes every item with a sequence number up to and including `upToSeq` (already saved by JS). */
  fun ack(context: Context, upToSeq: Long) = synchronized(lock) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val items = JSONArray(prefs.getString(KEY, "[]"))
    val kept = JSONArray()
    for (i in 0 until items.length()) {
      val obj = items.getJSONObject(i)
      if (obj.optLong(SEQ_FIELD, Long.MAX_VALUE) > upToSeq) kept.put(obj)
    }
    prefs.edit().putString(KEY, kept.toString()).commit()
  }

  fun clear(context: Context) = synchronized(lock) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).commit()
  }
}
