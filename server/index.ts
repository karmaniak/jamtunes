import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runChat, type ChatRequest } from "./chat";
import { fetchUg } from "./ug";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, chat: process.env.ANTHROPIC_API_KEY ? "claude" : "local" });
});

app.post("/api/chat", async (req, res) => {
  const body = req.body as Partial<ChatRequest>;
  if (!body || typeof body.message !== "string") {
    res.status(400).json({ error: "message required" });
    return;
  }
  const request: ChatRequest = { message: body.message, sheetSummary: body.sheetSummary ?? "", history: Array.isArray(body.history) ? body.history : [] };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.json({ source: "local" });
    return;
  }
  try {
    const result = await runChat(request, apiKey);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
  console.log(`jamtunes api on http://localhost:${PORT} (chat: ${process.env.ANTHROPIC_API_KEY ? "claude" : "local fallback"})`);
});
