/**
 * Ultimate Guitar fetcher. UG pages embed their data as HTML-escaped JSON in
 * a `data-content` attribute; we pull the chord text out of it. UG may block
 * automated fetches — copy/paste is the always-works path and the UI says so.
 */

export interface UgResult {
  title?: string;
  artist?: string;
  key?: string;
  capo?: number;
  text: string;
}

const ALLOWED_HOSTS = [/(^|\.)ultimate-guitar\.com$/i];

export function isUgUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return (u.protocol === "https:" || u.protocol === "http:") && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function dig(obj: unknown, path: string[]): unknown {
  let cur = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return cur;
}

export function extractFromHtml(html: string): UgResult | null {
  const m = /data-content="([^"]+)"/.exec(html);
  if (!m) return null;
  let store: unknown;
  try {
    store = JSON.parse(decodeEntities(m[1]));
  } catch {
    return null;
  }
  const data = dig(store, ["store", "page", "data"]);
  const content = dig(data, ["tab_view", "wiki_tab", "content"]);
  if (typeof content !== "string") return null;
  const tab = dig(data, ["tab"]) as Record<string, unknown> | undefined;
  const meta = dig(data, ["tab_view", "meta"]) as Record<string, unknown> | undefined;
  const capoRaw = meta?.capo;
  return {
    title: typeof tab?.song_name === "string" ? tab.song_name : undefined,
    artist: typeof tab?.artist_name === "string" ? tab.artist_name : undefined,
    key: typeof tab?.tonality_name === "string" && tab.tonality_name ? tab.tonality_name : undefined,
    capo: typeof capoRaw === "number" && capoRaw > 0 ? capoRaw : undefined,
    text: content,
  };
}

export async function fetchUg(url: string): Promise<UgResult> {
  if (!isUgUrl(url)) throw new Error("Only ultimate-guitar.com links are supported.");
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Ultimate Guitar responded ${res.status}. Paste the chord sheet instead.`);
  const html = await res.text();
  const result = extractFromHtml(html);
  if (!result) throw new Error("Couldn't find a chord sheet on that page. Paste the chords instead.");
  return result;
}
