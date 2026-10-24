package com.paisapulse.smsreader

import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

/**
 * Tells JavaScript there is something to ingest: a live event if JS is listening, otherwise a
 * headless JS task. If neither is possible (e.g. background-start limits), the items simply stay
 * queued and are drained the next time the app opens — nothing is lost.
 */
object IngestDispatcher {
  @Volatile
  var listener: (() -> Unit)? = null

  fun dispatch(context: Context) {
    val live = listener
    if (live != null) {
      live()
      return
    }
    try {
      val appContext = context.applicationContext
      HeadlessJsTaskService.acquireWakeLockNow(appContext)
      appContext.startService(Intent(appContext, IngestHeadlessService::class.java))
    } catch (e: IllegalStateException) {
      Log.i("PaisaPulse", "Headless ingest deferred until next app start")
    } catch (e: SecurityException) {
      Log.i("PaisaPulse", "Headless ingest not permitted; deferred until next app start")
    }
  }
}
