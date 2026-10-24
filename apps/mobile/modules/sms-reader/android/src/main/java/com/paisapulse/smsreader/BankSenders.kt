package com.paisapulse.smsreader

/**
 * Allow-lists for the two data sources. Anything that does not match is dropped immediately:
 * it is never stored, queued or handed to JavaScript.
 *
 * Keep in sync with src/domain/parsing/senders.ts (JS re-checks as defence in depth).
 */
object BankSenders {
  private val HEADERS = listOf(
    "HDFCBK", "ICICIB", "SBIINB", "SBIUPI", "ATMSBI", "CBSSBI", "SBICRD",
    "AXISBK", "KOTAKB", "PAYTMB", "IDFCFB", "YESBNK",
  )

  /** e.g. VM-HDFCBK, AD-SBIUPI, JD-ICICIB-S */
  private val SENDER_PATTERN =
    Regex("^[A-Z]{2}-(${HEADERS.joinToString("|")})(-[A-Z])?$", RegexOption.IGNORE_CASE)

  val PAYMENT_APP_PACKAGES = setOf(
    "com.google.android.apps.nbu.paisa.user", // Google Pay
    "com.phonepe.app",
    "net.one97.paytm",
    "com.snapwork.hdfc",
    "com.csam.icici.bank.imobile",
    "com.sbi.lotusintouch",
    "com.sbi.upi",
    "com.axis.mobile",
    "com.msf.kbank.mobile",
    "com.idfcfirstbank.optimus",
    "com.YesBank",
  )

  fun isBankSender(sender: String?): Boolean =
    sender != null && SENDER_PATTERN.matches(sender.trim())

  fun isPaymentApp(packageName: String?): Boolean =
    packageName != null && packageName in PAYMENT_APP_PACKAGES
}
