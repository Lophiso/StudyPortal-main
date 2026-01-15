export class HostRateLimiter {
  private nextAllowedAt = new Map<string, number>();

  constructor(private readonly minDelayMs: number) {}

  async wait(host: string) {
    const now = Date.now();
    const next = this.nextAllowedAt.get(host) ?? 0;
    const delay = Math.max(0, next - now);
    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    this.nextAllowedAt.set(host, Date.now() + this.minDelayMs);
  }
}

export class HostBackoff {
  private penaltyUntil = new Map<string, number>();

  constructor(private readonly baseMs: number, private readonly maxMs: number) {}

  async wait(host: string) {
    const now = Date.now();
    const until = this.penaltyUntil.get(host) ?? 0;
    const delay = Math.max(0, until - now);
    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  penalize(host: string, factor: number) {
    const now = Date.now();
    const existingUntil = this.penaltyUntil.get(host) ?? 0;
    const existingRemaining = Math.max(0, existingUntil - now);
    const next = Math.min(this.maxMs, Math.max(this.baseMs, Math.floor(existingRemaining * factor + this.baseMs)));
    this.penaltyUntil.set(host, now + next);
  }
}
