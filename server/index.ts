import express from "express";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { runChat, type ChatRequest } from "./chat";
import { fetchUg } from "./ug";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(express.json({ limit: "1mb" }));

export type CredentialSource = "api-key" | "token" | "profile" | "none";

/** Mirror the SDK's credential resolution so the UI can say how chat is connected. */
export function credentialSource(): CredentialSource {
  if (process.env.ANTHROPIC_API_KEY) return "api-key";
  if (process.env.ANTHROPIC_AUTH_TOKEN) return "token";
  const dir =
    process.env.ANTHROPIC_CONFIG_DIR ??
    (process.platform === "win32" ? path.join(process.env.APPDATA ?? "", "Anthropic") : path.join(os.homedir(), ".config", "anthropic"));
  try {
    const creds = path.join(dir, "credentials");
    if (fs.existsSync(creds) && fs.readdirSync(creds).some((f) => f.endsWith(".json"))) return "profile";
  } catch {
    /* unreadable config dir: treat as none */
  }
  return "none";
}

app.get("/api/health", (_req, res) => {
  const credential = credentialSource();
  res.json({ ok: true, chat: credential === "none" ? "local" : "claude", credential });
});

app.post("/api/chat", async (req, res) => {
  const body = req.body as Partial<ChatRequest>;
  if (!body || typeof body.message !== "string") {
    res.status(400).json({ error: "message required" });
    return;
  }
  const request: ChatRequest = { message: body.message, sheetSummary: body.sheetSummary ?? "", history: Array.isArray(body.history) ? body.history : [] };
  if (credentialSource() === "none") {
    res.json({ source: "local", reason: "no-credentials" });
    return;
  }
  try {
    const result = await runChat(request);
    res.json(result);
  } catch (err) {
    const status = (err as { status?: number }).status;
    let message = err instanceof Error ? err.message : String(err);
    if (status === 401 || status === 403) message = "Claude login is missing or expired — run `ant auth login` (or check ANTHROPIC_API_KEY) and restart the server.";
    console.error("chat failed:", message);
    res.status(502).json({ error: message, source: "local" });
  }
});

app.get("/api/ug", async (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url : "";
  try {
    res.json(await fetchUg(url));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(__dirname, "..", "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
}

app.listen(PORT, () => {
  const credential = credentialSource();
  console.log(`jamtunes api on http://localhost:${PORT} (chat: ${credential === "none" ? "offline interpreter — run `ant auth login` or set ANTHROPIC_API_KEY" : `Claude via ${credential}`})`);
});
