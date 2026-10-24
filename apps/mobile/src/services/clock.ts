import { randomUUID } from 'expo-crypto';

import type { Clock } from '@/data/transactionsRepo';

export const systemClock: Clock = {
  now: () => Date.now(),
  newId: () => randomUUID(),
};
