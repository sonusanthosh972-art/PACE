import * as Crypto from 'expo-crypto';

import type { Clock } from '@/data/transactionsRepo';

export const systemClock: Clock = {
  now: () => Date.now(),
  newId: () => {
    try {
      if (typeof Crypto.randomUUID === 'function') {
        const id = Crypto.randomUUID();
        if (id) return id;
      }
    } catch {
      // Fall through to fallback
    }
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  },
};
