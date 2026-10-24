package com.paisapulse.smsreader

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BankSendersTest {
  @Test
  fun acceptsBankHeadersWithOperatorPrefix() {
    listOf("VM-HDFCBK", "AD-SBIUPI", "jd-icicib", "VK-YESBNK-S", "BZ-IDFCFB", "AX-AXISBK", "JM-PAYTMB", "VM-KOTAKB")
      .forEach { assertTrue(it, BankSenders.isBankSender(it)) }
  }

  @Test
  fun rejectsPersonalAndLookalikeSenders() {
    listOf("+919876543210", "HDFCBK", "VM-HDFCBK1", "VM-HDFCBKX", "VM-AMAZON", "VMX-HDFCBK", "", null)
      .forEach { assertFalse(it.toString(), BankSenders.isBankSender(it)) }
  }

  @Test
  fun allowListsOnlyPaymentApps() {
    assertTrue(BankSenders.isPaymentApp("com.phonepe.app"))
    assertFalse(BankSenders.isPaymentApp("com.whatsapp"))
    assertFalse(BankSenders.isPaymentApp(null))
  }
}
