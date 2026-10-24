import type { VercelRequest, VercelResponse } from "@vercel/node";
import { chat } from "../server/handlers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const ip = typeof req.headers["x-real-ip"] === "string" ? req.headers["x-real-ip"] : req.socket?.remoteAddress;
  const r = await chat(req.body, req.headers, ip);
  res.status(r.status).json(r.body);
}
