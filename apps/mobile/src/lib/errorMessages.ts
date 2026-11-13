export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  DATABASE_ERROR: 'Failed to save data. Please try again.',
  SYNC_ERROR: 'Failed to sync your data. It will retry automatically.',
  AUTH_ERROR: 'You need to sign in again.',
  PERMISSION_ERROR: 'Permission denied. Please check your settings.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
} as const;

export function getErrorMessage(error: unknown): string {
  if (!error) return ERROR_MESSAGES.UNKNOWN_ERROR;

  const errorObj = error as Record<string, unknown>;
  if (errorObj.message) {
    const msg = (errorObj.message as string).toLowerCase();
    if (msg.includes('network') || msg.includes('offline')) return ERROR_MESSAGES.NETWORK_ERROR;
    if (msg.includes('timeout')) return ERROR_MESSAGES.TIMEOUT_ERROR;
    if (msg.includes('validation')) return ERROR_MESSAGES.VALIDATION_ERROR;
    if (msg.includes('auth')) return ERROR_MESSAGES.AUTH_ERROR;
  }

  return (errorObj.message as string) || ERROR_MESSAGES.UNKNOWN_ERROR;
}
