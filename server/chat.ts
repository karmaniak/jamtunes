/**
 * Chat endpoint: natural language -> typed SheetChanges. The model only ever
 * emits sheet-level intent (tempo, style, key/mode, a progression in quick
 * syntax, track toggles). It never produces notes or audio.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { STYLES } from "@core/arrange/styles";
import { MODE_LABELS, MODE_NAMES } from "@core/theory/scales";
import { emptyChanges, SheetChangesSchema, type SheetChanges } from "@core/chat/intent";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  sheetSummary: string;
  history: ChatTurn[];
}

const MODEL = "claude-opus-5-5";

const SYSTEM = `You are the arranger inside JamTunes, a tool that turns a chord sheet into a backing track for an instrumentalist to jam over.
You respond ONLY with structured sheet changes. You never write notes, tabs, melodies or audio. Keep every field null unless the user asked for that change.

Styles available: ${STYLES.map((s) => `${s.id} (${s.description} default ${s.defaultTempo} bpm)`).join("; ")}.
Modes: ${MODE_NAMES.map((m) => `${m} = ${MODE_LABELS[m]}`).join(", ")}.
Changing only the mode of the key keeps the tonic and re-derives each chord's quality from the new mode (plug-and-play modal swap). Changing the tonic transposes.

Progressions use quick syntax, one bar per chord unless bars are written with |:
  Am F C G                  one bar each
  | Am F | C G |            two chords per bar
  Am . . . F . C(2) G(2)    dots = beats, (n) = beats
  [Verse] / [Chorus] x2     section headers, x2 repeats
Write a full progression (all sections) whenever you set it. Prefer real musical choices: for a vibe request with no chords given, pick an idiomatic progression in a fitting key, set style and tempo, and explain briefly in reply.
If the user names a song, do not reproduce copyrighted lyrics; a chord progression and section layout is fine.`;

export async function runChat(req: ChatRequest, apiKey: string | undefined): Promise<{ changes: SheetChanges; source: "claude" | "local"; model?: string }> {
  if (!apiKey) throw new Error("no api key");
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...req.history.slice(-8).map((h) => ({ role: h.role, content: h.content }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: `Current sheet:\n${req.sheetSummary}\n\nRequest: ${req.message}` },
  ];
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { format: zodOutputFormat(SheetChangesSchema), effort: "low" },
  });
  if (response.stop_reason === "refusal") {
    return { changes: emptyChanges("I can't help with that one — try a musical request."), source: "claude", model: response.model };
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    return { changes: emptyChanges("I didn't get a usable answer back. Try rephrasing."), source: "claude", model: response.model };
  }
  return { changes: parsed, source: "claude", model: response.model };
}
