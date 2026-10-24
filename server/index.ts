/**
 * Local dev / Docker server: serves the API (and the built app in
 * production). On Vercel the same handlers run as functions under /api.
 */
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chat, health } from "./handlers";
import { resolveConfig } from "./ai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  const r = health();
  res.status(r.status).json(r.body);
});

app.post("/api/chat", async (req, res) => {
  const r = await chat(req.body, req.headers, req.ip);
  res.status(r.status).json(r.body);
});

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(__dirname, "..", "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
}

app.listen(PORT, () => {
  const cfg = resolveConfig();
  console.log(`jamtunes api on http://localhost:${PORT} — chat: ${cfg.provider === "none" ? "local interpreter only (set HF_TOKEN or AI_API_KEY to enable AI)" : `${cfg.provider} · ${cfg.model}`}`);
});
