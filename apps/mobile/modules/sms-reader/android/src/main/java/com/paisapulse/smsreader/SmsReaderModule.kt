package com.paisapulse.smsreader

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.provider.Telephony
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val EVENT_PENDING = "onPendingItems"

class SmsReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context unavailable", null)

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    Events(EVENT_PENDING)

    OnStartObserving {
      IngestDispatcher.listener = {
        sendEvent(EVENT_PENDING, mapOf("count" to PendingStore.size(context)))
      }
    }

    OnStopObserving {
      IngestDispatcher.listener = null
    }

    AsyncFunction("getSmsPermissionsAsync") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(
        appContext.permissions, promise, Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS,
      )
    }

    AsyncFunction("requestSmsPermissionsAsync") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions, promise, Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS,
      )
    }

    /** Bank-sender SMS from the inbox received at or after [sinceMs]. Other SMS are skipped in the query loop. */
    AsyncFunction("readBankSmsAsync") { sinceMs: Double ->
      val since = sinceMs.toLong()
      val out = mutableListOf<Map<String, Any>>()
      val projection = arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        projection,
        "${Telephony.Sms.DATE} >= ?",
        arrayOf(since.toString()),
        "${Telephony.Sms.DATE} ASC",
      )?.use { cursor ->
        val addressIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (cursor.moveToNext()) {
          val sender = cursor.getString(addressIdx)
          if (!BankSenders.isBankSender(sender)) continue // personal SMS: body never read
          out.add(mapOf(
            "kind" to "sms",
            "sender" to sender,
            "body" to (cursor.getString(bodyIdx) ?: ""),
            "receivedAt" to cursor.getLong(dateIdx).toDouble(),
          ))
        }
      } ?: throw CodedException("ERR_SMS_QUERY", "Could not read the SMS inbox. Is READ_SMS granted?", null)
      out
    }

    /** Queued live SMS / notifications; clears the queue. */
    AsyncFunction("drainPendingAsync") {
      PendingStore.drain(context).map { item ->
        item.mapValues { (_, v) -> if (v is Long) v.toDouble() else v }
      }
    }

    AsyncFunction("clearPendingAsync") {
      PendingStore.clear(context)
    }

    Function("isNotificationAccessGranted") {
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
      val component = ComponentName(context, PaymentNotificationListener::class.java)
      enabled.split(':').any { ComponentName.unflattenFromString(it) == component }
    }

    Function("openNotificationAccessSettings") {
      startSettings(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    Function("openAppSettings") {
      startSettings(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)),
      )
    }
  }

  private fun startSettings(intent: Intent) {
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
