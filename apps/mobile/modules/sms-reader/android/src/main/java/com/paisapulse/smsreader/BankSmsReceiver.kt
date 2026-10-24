package com.paisapulse.smsreader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/** Live SMS. Non-bank senders are discarded here, before the body is read. */
class BankSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return

    // A long SMS arrives as several parts; join them per sender.
    val bodies = linkedMapOf<String, StringBuilder>()
    val timestamps = mutableMapOf<String, Long>()
    for (part in parts) {
      val sender = part?.displayOriginatingAddress ?: continue
      if (!BankSenders.isBankSender(sender)) continue
      bodies.getOrPut(sender) { StringBuilder() }.append(part.displayMessageBody ?: "")
      timestamps.putIfAbsent(sender, part.timestampMillis.takeIf { it > 0 } ?: System.currentTimeMillis())
    }
    if (bodies.isEmpty()) return

    for ((sender, body) in bodies) {
      PendingStore.addSms(context, sender, body.toString(), timestamps[sender] ?: System.currentTimeMillis())
    }
    IngestDispatcher.dispatch(context)
  }
}
