import { registerHeadlessIngest } from './headless';
import { initNotifications } from './notifications';

// Phase 6: register the live-alert hook so payments detected headlessly still fire notifications.
initNotifications().catch(() => undefined);
registerHeadlessIngest();
