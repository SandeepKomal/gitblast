// Per-client limit on analyses, so one script can't spend the whole GitHub
// token budget. In-memory per instance; swap for a shared store if you run many.

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 40;
const hits = new Map<string, { count: number; reset: number }>();

export function allow(key: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (hits.size > 50_000) {
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }
  const h = hits.get(key);
  if (!h || h.reset <= now) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  h.count++;
  return { ok: h.count <= LIMIT, retryAfter: Math.ceil((h.reset - now) / 1000) };
}

/**
 * The client's address as our own proxy saw it. The first X-Forwarded-For entry
 * is whatever the client sent, so it can't be trusted for rate limiting; use the
 * proxy-set X-Real-IP, else the last hop, which our proxy appended.
 */
export function clientKey(headers: Headers): string {
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const hops = headers.get("x-forwarded-for")?.split(",") ?? [];
  return hops[hops.length - 1]?.trim() || "local";
}
