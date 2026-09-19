import { MINUTE_MS, type WhisperClock } from './types';

export const fixedWhisperClock = (instantMs: number): WhisperClock => ({
  now: () => instantMs,
});

export class FakeWhisperClock implements WhisperClock {
  private currentMs: number;

  constructor(startMs = 0) {
    this.currentMs = startMs;
  }

  now(): number {
    return this.currentMs;
  }

  advanceMs(ms: number): this {
    this.currentMs += ms;
    return this;
  }

  advanceMinutes(minutes: number): this {
    this.currentMs += minutes * MINUTE_MS;
    return this;
  }

  nowIso(): string {
    return new Date(this.currentMs).toISOString();
  }
}

export const isoFromMs = (ms: number): string => new Date(ms).toISOString();
