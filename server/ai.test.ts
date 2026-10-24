import { describe, expect, it } from "vitest";
import { coerceChanges, extractJsonObject, resolveConfig, sheetChangesJsonSchema } from "./ai";
import { deviceKey, GLOBAL_KEY, RateLimiter } from "./ratelimit";

describe("AI config", () => {
  it("defaults to the HF router with an open model when a token is present", () => {
    const cfg = resolveConfig({ HF_TOKEN: "hf_x" } as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe("openai-compatible");
    expect(cfg.baseUrl).toBe("https://router.huggingface.co/v1");
    expect(cfg.model).toBe("Qwen/Qwen2.5-72B-Instruct");
  });
  it("prefers Anthropic (Haiku) when its key is set, else none", () => {
    const a = resolveConfig({ ANTHROPIC_API_KEY: "k" } as NodeJS.ProcessEnv);
    expect(a.provider).toBe("anthropic");
    expect(a.model).toBe("claude-haiku-5-5");
    expect(resolveConfig({ ANTHROPIC_API_KEY: "k", HF_TOKEN: "hf" } as NodeJS.ProcessEnv).provider).toBe("anthropic");
    expect(resolveConfig({ ANTHROPIC_API_KEY: "k", HF_TOKEN: "hf", AI_PROVIDER: "openai-compatible" } as NodeJS.ProcessEnv).provider).toBe("openai-compatible");
    expect(resolveConfig({} as NodeJS.ProcessEnv).provider).toBe("none");
    expect(resolveConfig({ AI_PROVIDER: "openai-compatible", AI_BASE_URL: "http://localhost:11434/v1/", AI_MODEL: "llama" } as NodeJS.ProcessEnv)).toMatchObject({ baseUrl: "http://localhost:11434/v1", model: "llama" });
  });
});

describe("reply parsing", () => {
  it("extracts JSON from chatty replies and fills omitted keys", () => {
    const text = 'Sure! Here you go:\n```json\n{"reply":"Funk it is","style":"funk","tempo":98,"tracks":[{"id":"drums","complexity":0.8}]}\n```\nEnjoy.';
    const changes = coerceChanges(extractJsonObject(text));
    expect(changes).not.toBeNull();
    expect(changes!.style).toBe("funk");
    expect(changes!.key).toBeNull();
    expect(changes!.tracks).toEqual([{ id: "drums", enabled: null, volume: null, voicing: null, complexity: 0.8 }]);
  });
  it("rejects invalid values", () => {
    expect(coerceChanges(extractJsonObject('{"reply":"x","style":"polka"}'))).toBeNull();
    expect(coerceChanges(extractJsonObject("no json here"))).toBeNull();
    expect(extractJsonObject('{"a":"}"}')).toEqual({ a: "}" });
  });
  it("produces a JSON schema for prompt embedding", () => {
    const schema = sheetChangesJsonSchema() as { properties?: Record<string, unknown> };
    expect(Object.keys(schema.properties ?? {})).toContain("progression");
  });
});

describe("rate limiter", () => {
  it("limits per minute and per day", () => {
    let t = 0;
    const rl = new RateLimiter({ perMinute: 2, perDay: 3, maxMessageChars: 100, globalPerDay: 4 }, () => t);
    expect(rl.check("a")).toBeNull();
    expect(rl.check("a")).toBeNull();
    expect(rl.check("a")).toBe("minute");
    t += 61_000;
    expect(rl.check("a")).toBeNull();
    expect(rl.check("a")).toBe("day");
    expect(rl.check("b")).toBeNull();
    // The global brake ignores the per-minute rule and has its own daily cap.
    for (let i = 0; i < 4; i++) expect(rl.check(GLOBAL_KEY)).toBeNull();
    expect(rl.check(GLOBAL_KEY)).toBe("day");
  });
  it("keys by device header, else forwarded ip", () => {
    expect(deviceKey({ "x-jam-device": "abc12345-dev" }, "1.1.1.1")).toBe("d:abc12345-dev");
    expect(deviceKey({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }, "1.1.1.1")).toBe("ip:2.2.2.2");
    expect(deviceKey({}, "1.1.1.1")).toBe("ip:1.1.1.1");
  });
});
