/**
 * Per-device rate limiting for the AI endpoint. In-memory and best-effort:
 * on serverless hosts each instance keeps its own counters, which is enough
 * to stop a runaway tab or a scripted loop from draining a free AI quota.
 */

export interface RateLimits {
  perMinute: number;
  perDay: number;
  maxMessageChars: number;
  /** Brake on total spend: AI requests per day across everyone (per server instance). */
  globalPerDay: number;
}

export function limitsFromEnv(env: NodeJS.ProcessEnv = process.env): RateLimits {
  return {
    perMinute: Number(env.AI_LIMIT_PER_MINUTE ?? 10),
    perDay: Number(env.AI_LIMIT_PER_DAY ?? 60),
    maxMessageChars: Number(env.AI_MAX_MESSAGE_CHARS ?? 2000),
    globalPerDay: Number(env.AI_GLOBAL_PER_DAY ?? 5000),
  };
}

export const GLOBAL_KEY = "*";

interface Bucket {
  minute: number[];
  day: number[];
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(private limits: RateLimits, private now: () => number = Date.now) {}

  /** Returns null when allowed, otherwise a short reason. Records the hit when allowed. */
  check(key: string): "minute" | "day" | null {
    const t = this.now();
    const b = this.buckets.get(key) ?? { minute: [], day: [] };
    const global = key === GLOBAL_KEY;
    b.minute = b.minute.filter((x) => t - x < 60_000);
    b.day = b.day.filter((x) => t - x < 86_400_000);
    if (!global && b.minute.length >= this.limits.perMinute) return "minute";
    if (b.day.length >= (global ? this.limits.globalPerDay : this.limits.perDay)) return "day";
    b.minute.push(t);
    b.day.push(t);
    this.buckets.set(key, b);
    if (this.buckets.size > 5000) this.sweep(t);
    return null;
  }

  private sweep(t: number) {
    for (const [k, b] of this.buckets) if (b.day.every((x) => t - x >= 86_400_000)) this.buckets.delete(k);
  }
}

/** Client identity without accounts: a device id header the app generates, else the IP. */
export function deviceKey(headers: Record<string, string | string[] | undefined>, ip: string | undefined): string {
  const h = headers["x-jam-device"];
  const device = Array.isArray(h) ? h[0] : h;
  if (device && /^[a-z0-9-]{8,64}$/i.test(device)) return `d:${device}`;
  const fwd = headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return `ip:${first || ip || "unknown"}`;
}
