package com.paisapulse.smsreader

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the JS task registered as [TASK_NAME] (see src/services/headless.ts). */
class IngestHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), TIMEOUT_MS, true)

  companion object {
    const val TASK_NAME = "PaisaPulseIngest"
    private const val TIMEOUT_MS = 60_000L
  }
}
