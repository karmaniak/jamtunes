import type { VercelRequest, VercelResponse } from "@vercel/node";
import { health } from "../server/handlers";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const r = health();
  res.status(r.status).json(r.body);
}
