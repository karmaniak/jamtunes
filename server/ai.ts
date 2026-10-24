/**
 * AI rails. The app operator configures one provider once (env vars); users
 * never configure anything. Every provider is asked for the same typed
 * SheetChanges, every answer is validated against the Zod schema, and
 * anything malformed falls back to the deterministic local interpreter.
 *
 * Providers:
 *  - openai-compatible (default): any /v1/chat/completions endpoint — the
 *    Hugging Face router, vLLM, Ollama, Together, Groq… Model + base URL from env.
 *  - anthropic: Claude via the official SDK with structured outputs.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { STYLES } from "../src/core/arrange/styles";
import { MODE_LABELS, MODE_NAMES } from "../src/core/theory/scales";
import { emptyChanges, SheetChangesSchema, type SheetChanges } from "../src/core/chat/intent";

export type ProviderKind = "openai-compatible" | "anthropic" | "none";

export interface AIConfig {
  provider: ProviderKind;
  model: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

/** Defaults: Hugging Face's OpenAI-compatible router with a solid open instruct model. */
export const DEFAULT_OPENAI_BASE_URL = "https://router.huggingface.co/v1";
export const DEFAULT_OPENAI_MODEL = "Qwen/Qwen2.5-72B-Instruct";
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5";

/**
 * Provider precedence: explicit AI_PROVIDER, else Anthropic when a key is set
 * (Claude Haiku 5.5 is the cheap default), else an OpenAI-compatible endpoint
 * when HF_TOKEN / AI_API_KEY is set, else the local interpreter only.
 */
export function resolveConfig(env: NodeJS.ProcessEnv = process.env): AIConfig {
  const explicit = env.AI_PROVIDER as ProviderKind | undefined;
  const openaiKey = env.AI_API_KEY ?? env.HF_TOKEN ?? "";
  const anthropicKey = !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  const provider: ProviderKind = explicit && explicit !== "none" ? explicit : anthropicKey ? "anthropic" : openaiKey ? "openai-compatible" : "none";
  return {
    provider,
    model: env.AI_MODEL ?? (provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL),
    baseUrl: (env.AI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, ""),
    apiKey: openaiKey,
    timeoutMs: Number(env.AI_TIMEOUT_MS ?? 20000),
  };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  sheetSummary: string;
  history: ChatTurn[];
}

export interface ChatResult {
  changes: SheetChanges;
  source: "ai" | "local";
  model?: string;
}

const SYSTEM = `You are the arranger inside JamTunes, a tool that turns a chord sheet into a backing track for an instrumentalist to jam over.
You respond ONLY with sheet changes as JSON. You never write notes, tabs, melodies or audio. Keep every field null unless the user asked for that change.

Styles available: ${STYLES.map((s) => `${s.id} (${s.description} default ${s.defaultTempo} bpm)`).join("; ")}.
Modes: ${MODE_NAMES.map((m) => `${m} = ${MODE_LABELS[m]}`).join(", ")}.
Changing only the mode of the key keeps the tonic and re-derives each chord's quality from the new mode (plug-and-play modal swap). Changing the tonic transposes.
Tracks: piano, guitar, distGuitar, bass, drums. complexity 0..1 (0 sparse, 0.5 as written, 1 busy).

Progressions use quick syntax, one bar per chord unless bars are written with |:
  Am F C G                  one bar each
  | Am F | C G |            two chords per bar
  Am . . . F . C(2) G(2)    dots = beats, (n) = beats
  [Verse] / [Chorus] x2     section headers, x2 repeats
Write a full progression (all sections) whenever you set it, as plain space-separated chord symbols (Am, F#m7, G/B, Cmaj7#11, N.C.) — never dashes, commas or words between chords. Prefer real musical choices: for a vibe request with no chords given, pick an idiomatic progression in a fitting key (use sevenths, slash chords and borrowed chords where the style calls for it), set style and tempo, give it a short evocative title (2–4 words), and explain the choice in one or two sentences in reply.
Be decisive: when the user asks for a change, make it. Only reply with nothing changed when the request really isn't about the sheet.
If the user names a song, do not reproduce copyrighted lyrics; a chord progression and section layout is fine.

Example request: "something moody and quiet in D dorian, slow"
Example answer: {"reply":"A slow D dorian vamp — the Em7 on the IV keeps the dorian colour, the Cmaj7 adds air before the turnaround.","tempo":72,"style":"ballad","key":{"tonic":"D","mode":"dorian"},"transpose":null,"timeSignature":null,"swing":null,"progression":"[Verse]\\n| Dm7 | Dm7 | Em7 | Dm7 |\\n| Dm7 | Cmaj7 | Em7 Am7 | Dm7 |\\n[Bridge]\\n| Fmaj7 | Gmaj7 | Em7 | Am7 |","title":"Quiet dorian evening","tracks":[{"id":"drums","enabled":null,"volume":null,"voicing":null,"complexity":0.25}]}`;

const JSON_INSTRUCTIONS = `Reply with a single JSON object and nothing else — no prose before or after, no markdown fences. It must match this JSON Schema exactly (every key present; use null for "no change"):\n`;

/** JSON Schema for providers without native structured output. */
export function sheetChangesJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(SheetChangesSchema) as Record<string, unknown>;
}

/** Pull the first balanced JSON object out of a model reply (tolerates fences and chatter). */
export function extractJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Validate a candidate; fill missing keys with null so small models' omissions don't fail the whole reply. */
export function coerceChanges(candidate: unknown): SheetChanges | null {
  if (!candidate || typeof candidate !== "object") return null;
  const filled: Record<string, unknown> = { ...emptyChanges(), ...(candidate as Record<string, unknown>) };
  if (Array.isArray(filled.tracks)) {
    filled.tracks = (filled.tracks as Record<string, unknown>[]).map((t) => ({ enabled: null, volume: null, voicing: null, complexity: null, ...t }));
  }
  if (typeof filled.reply !== "string") filled.reply = "Done.";
  const parsed = SheetChangesSchema.safeParse(filled);
  return parsed.success ? parsed.data : null;
}

async function runOpenAICompatible(req: ChatRequest, cfg: AIConfig): Promise<ChatResult> {
  const schema = JSON.stringify(sheetChangesJsonSchema());
  const messages = [
    { role: "system", content: `${SYSTEM}\n\n${JSON_INSTRUCTIONS}${schema}` },
    ...req.history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: `Current sheet:\n${req.sheetSummary}\n\nRequest: ${req.message}` },
  ];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0.4, max_tokens: 1200, response_format: { type: "json_object" } }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI provider responded ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string | { text?: string }[] } }[]; model?: string };
    const raw = data.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p) => p.text ?? "").join("") : "";
    if (process.env.AI_DEBUG) console.log(`[ai] ${cfg.model} replied:\n${text.slice(0, 2000)}`);
    const changes = coerceChanges(extractJsonObject(text));
    if (!changes) throw new Error(`AI reply was not a valid sheet change${process.env.AI_DEBUG ? "" : " (set AI_DEBUG=1 to log replies)"}`);
    return { changes, source: "ai", model: data.model ?? cfg.model };
  } finally {
    clearTimeout(timer);
  }
}

async function runAnthropic(req: ChatRequest, cfg: AIConfig): Promise<ChatResult> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...req.history.slice(-8).map((h) => ({ role: h.role, content: h.content }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: `Current sheet:\n${req.sheetSummary}\n\nRequest: ${req.message}` },
  ];
  // Haiku has no server-side refusal fallback; the Opus/Sonnet tiers do.
  const haiku = /haiku/i.test(cfg.model);
  const response = await client.beta.messages.parse({
    model: cfg.model,
    max_tokens: 2048,
    system: SYSTEM,
    messages,
    ...(haiku ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    output_config: { format: zodOutputFormat(SheetChangesSchema), effort: "low" },
  });
  if (process.env.AI_DEBUG) console.log(`[ai] ${response.model} replied:\n${JSON.stringify(response.parsed_output).slice(0, 2000)}`);
  if (response.stop_reason === "refusal") return { changes: emptyChanges("I can't help with that one — try a musical request."), source: "ai", model: response.model };
  const parsed = response.parsed_output ? coerceChanges(response.parsed_output) : null;
  if (!parsed) throw new Error("AI reply was not a valid sheet change");
  return { changes: parsed, source: "ai", model: response.model };
}

export async function runChat(req: ChatRequest, cfg: AIConfig = resolveConfig()): Promise<ChatResult> {
  switch (cfg.provider) {
    case "openai-compatible":
      return runOpenAICompatible(req, cfg);
    case "anthropic":
      return runAnthropic(req, cfg);
    default:
      throw new Error("no AI provider configured");
  }
}
