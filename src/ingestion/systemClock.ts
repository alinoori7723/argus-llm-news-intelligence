import type { Clock } from '@/domain/ingestion';

export const systemClock: Clock = {
  now: () => new Date(),
};
