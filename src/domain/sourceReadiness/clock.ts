export interface ReadinessClock {
  now(): number;
}

export const fixedReadinessClock = (instantMs: number): ReadinessClock => ({
  now: () => instantMs,
});

export class FakeReadinessClock implements ReadinessClock {
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
}

export const isoFromMs = (ms: number): string => new Date(ms).toISOString();

export const deterministicHash = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};
