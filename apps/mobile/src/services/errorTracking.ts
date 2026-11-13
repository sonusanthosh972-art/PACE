// Error tracking service - Sentry integration can be added here

interface ErrorContext {
  userId?: string;
  screen?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

class ErrorTracker {
  private enabled = __DEV__ === false; // Only in production

  initialize() {
    if (!this.enabled) {
      console.log('[ErrorTracking] Disabled in development');
      return;
    }
    // In production, initialize Sentry here
    // import * as Sentry from "@sentry/react-native";
    // Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  captureException(error: Error, context?: ErrorContext) {
    if (!this.enabled) {
      console.warn('[ErrorTracking]', error, context);
      return;
    }

    try {
      // Log to Sentry
      // Sentry.captureException(error, { contexts: { app: context } });

      // Also log locally
      console.error('[ErrorTracking]', error, context);
    } catch (e) {
      console.error('Failed to report error:', e);
    }
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
    context?: ErrorContext,
  ) {
    if (!this.enabled) {
      console.log('[ErrorTracking]', message, context);
      return;
    }

    try {
      // Log to Sentry
      // Sentry.captureMessage(message, { level, contexts: { app: context } });

      // Also log locally
      console.log('[ErrorTracking]', message, context);
    } catch (e) {
      console.error('Failed to report message:', e);
    }
  }

  setUser(userId: string, email?: string, name?: string) {
    if (!this.enabled) return;

    try {
      // Sentry.setUser({ id: userId, email, username: name });
    } catch (e) {
      console.error('Failed to set user:', e);
    }
  }

  setContext(key: string, context: Record<string, unknown>) {
    if (!this.enabled) return;

    try {
      // Sentry.setContext(key, context);
    } catch (e) {
      console.error('Failed to set context:', e);
    }
  }

  addBreadcrumb(
    message: string,
    data?: Record<string, unknown>,
    level: 'info' | 'warning' | 'error' = 'info',
  ) {
    if (!this.enabled) return;

    try {
      // Sentry.addBreadcrumb({ message, data, level });
    } catch (e) {
      console.error('Failed to add breadcrumb:', e);
    }
  }
}

export const errorTracker = new ErrorTracker();

// Hook for error tracking in components
export function useErrorTracking(screen: string) {
  const captureError = (error: Error, action?: string) => {
    errorTracker.captureException(error, { screen, action });
  };

  const captureMessage = (
    message: string,
    action?: string,
    level: 'info' | 'warning' | 'error' = 'info',
  ) => {
    errorTracker.captureMessage(message, level, { screen, action });
  };

  const addBreadcrumb = (message: string, data?: Record<string, unknown>) => {
    errorTracker.addBreadcrumb(message, data, 'info');
  };

  return { captureError, captureMessage, addBreadcrumb };
}
