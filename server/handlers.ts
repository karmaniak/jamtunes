/**
 * Framework-agnostic request handlers shared by the Express dev server and
 * the Vercel functions. Returns {status, body}; the adapters do the I/O.
 */
import { resolveConfig, runChat, type ChatRequest } from "./ai";
import { deviceKey, GLOBAL_KEY, limitsFromEnv, RateLimiter } from "./ratelimit";

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

const limiter = new RateLimiter(limitsFromEnv());

export function health(): HandlerResult {
  const cfg = resolveConfig();
  return { status: 200, body: { ok: true, chat: cfg.provider === "none" ? "local" : "ai", provider: cfg.provider === "none" ? undefined : cfg.provider } };
}

export async function chat(rawBody: unknown, headers: Record<string, string | string[] | undefined>, ip: string | undefined): Promise<HandlerResult> {
  const body = (rawBody ?? {}) as Partial<ChatRequest>;
  if (typeof body.message !== "string" || !body.message.trim()) return { status: 400, body: { error: "message required" } };
  const limits = limitsFromEnv();
  if (body.message.length > limits.maxMessageChars) return { status: 413, body: { error: `Keep requests under ${limits.maxMessageChars} characters.`, source: "local" } };
  const cfg = resolveConfig();
  if (cfg.provider === "none") return { status: 200, body: { source: "local", reason: "no-provider" } };

  if (limiter.check(GLOBAL_KEY)) {
    return { status: 429, body: { error: "The band's AI is fully booked today; tempo, style, key and chord requests still work.", source: "local", reason: "rate-global" } };
  }
  const limited = limiter.check(deviceKey(headers, ip));
  if (limited) {
    return {
      status: 429,
      body: { error: limited === "minute" ? "The band needs a breather — try again in a minute." : "That's today's AI allowance; tempo, style, key and chord requests still work.", source: "local", reason: `rate-${limited}` },
    };
  }

  const request: ChatRequest = { message: body.message, sheetSummary: typeof body.sheetSummary === "string" ? body.sheetSummary.slice(0, 6000) : "", history: Array.isArray(body.history) ? body.history.slice(-8) : [] };
  try {
    const result = await runChat(request, cfg);
    return { status: 200, body: { ...result } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("chat failed:", message);
    return { status: 502, body: { error: "The band's AI didn't answer; applied what I could locally.", source: "local", detail: message.slice(0, 300) } };
  }
}
