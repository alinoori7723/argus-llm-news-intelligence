import type { Clock } from './types';

export const fixedClock = (instant: string | Date): Clock => {
  const base = instant instanceof Date ? instant : new Date(instant);
  const ms = base.getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`fixedClock requires a valid instant, got: ${String(instant)}`);
  }
  return {
    now: () => new Date(ms),
  };
};
