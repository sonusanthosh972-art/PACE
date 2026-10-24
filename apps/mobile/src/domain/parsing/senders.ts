/**
 * Bank / UPI sender IDs (DLT headers). Format: two-letter operator/circle prefix, a dash,
 * the six-letter header, and an optional DLT category suffix (-S service, -T transactional…).
 * e.g. "VM-HDFCBK", "AD-SBIUPI", "JD-ICICIB-S".
 *
 * Keep in sync with SENDER_PATTERN in modules/sms-reader/android/.../BankSenders.kt
 * (the native layer filters first; JS re-checks as defence in depth).
 */
export const BANK_SENDER_HEADERS = [
  'HDFCBK',
  'ICICIB',
  'SBIINB',
  'SBIUPI',
  'ATMSBI',
  'CBSSBI',
  'SBICRD',
  'AXISBK',
  'KOTAKB',
  'PAYTMB',
  'IDFCFB',
  'YESBNK',
] as const;

export const BANK_SENDER_PATTERN = `^[A-Z]{2}-(${BANK_SENDER_HEADERS.join('|')})(-[A-Z])?$`;

const BANK_SENDER_RE = new RegExp(BANK_SENDER_PATTERN, 'i');

export function isBankSender(sender: string): boolean {
  return BANK_SENDER_RE.test(sender.trim());
}

/** Android package names whose notifications we read (backup source). */
export const PAYMENT_APP_PACKAGES: Readonly<Record<string, string>> = {
  'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.phonepe.app': 'PhonePe',
  'net.one97.paytm': 'Paytm',
  'com.snapwork.hdfc': 'HDFC Bank',
  'com.csam.icici.bank.imobile': 'ICICI iMobile',
  'com.sbi.lotusintouch': 'SBI YONO',
  'com.sbi.upi': 'BHIM SBI Pay',
  'com.axis.mobile': 'Axis Mobile',
  'com.msf.kbank.mobile': 'Kotak Mobile',
  'com.idfcfirstbank.optimus': 'IDFC FIRST',
  'com.YesBank': 'Yes Bank',
};

export function isPaymentAppPackage(pkg: string): boolean {
  return Object.prototype.hasOwnProperty.call(PAYMENT_APP_PACKAGES, pkg);
}
