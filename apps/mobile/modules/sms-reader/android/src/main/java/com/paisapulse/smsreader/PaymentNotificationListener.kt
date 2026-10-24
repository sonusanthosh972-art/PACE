package com.paisapulse.smsreader

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Backup source: payment-app and bank-app notifications (GPay, PhonePe, Paytm, bank apps).
 * Notifications from any other app are ignored without reading their content.
 */
class PaymentNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (!BankSenders.isPaymentApp(sbn.packageName)) return
    val notification = sbn.notification ?: return
    if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

    val extras = notification.extras ?: return
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
      ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()
    if (title.isBlank() && text.isBlank()) return

    PendingStore.addNotification(this, sbn.packageName, title, text, sbn.postTime)
    IngestDispatcher.dispatch(this)
  }
}
