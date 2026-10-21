import { next, waitUntil } from "@vercel/functions";
// ".js": Vercel compiles each file to JavaScript and keeps the import as written, as on RussiaLedger.com.
import { counts, countedPath, DAY_MS, dayKey, VIEWS_DAYS, VIEWS_PATH, viewsFile, type ViewsFile } from "./views.js";

/**
 * Routing Middleware (vercel.json, "proxy"), as on RussiaLedger.com and USLedger.org: adds one to today's count for a page a reader
 * opens, after the page is on its way, and serves the totals at /views.json. It reads the request's path, its method,
 * and whether it comes from a crawler or a prefetch; it stores the path and the day, nothing else (edge/views.ts).
 * The counter is Upstash Redis, connected to the project in production; without it nothing is counted, and
 * /views.json lists no days and says why in a header.
 */
const REDIS_URL = process.env.KV_REST_API_URL?.replace(/\/$/, "");
const WRITE_TOKEN = process.env.KV_REST_API_TOKEN;
const READ_TOKEN = process.env.KV_REST_API_READ_ONLY_TOKEN || WRITE_TOKEN;
const CACHE_SECONDS = 600;
const UNAVAILABLE = 503;
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
};

async function pipeline(commands: string[][], token: string, timeoutMs: number): Promise<{ result?: unknown }[]> {
  const r = await fetch(`${REDIS_URL}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(commands), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`counter answered ${r.status}`);
  return (await r.json()) as { result?: unknown }[];
}

/** The last VIEWS_DAYS days' totals, newest first. Public aggregates, cached briefly at the edge. */
async function views(): Promise<Response> {
  const now = Date.now();
  if (!REDIS_URL || !READ_TOKEN) {
    const empty: ViewsFile = { generated_at: new Date(now).toISOString(), days: [] };
    return new Response(JSON.stringify(empty), { headers: { ...HEADERS, "x-views-counter": "not connected here, so nothing is counted" } });
  }
  const dates = Array.from({ length: VIEWS_DAYS }, (_, i) => new Date(now - i * DAY_MS));
  const answers = await pipeline(dates.map((d) => ["HGETALL", dayKey(d)]), READ_TOKEN, 5_000);
  return new Response(JSON.stringify(viewsFile(now, answers)), { headers: HEADERS });
}

export default function proxy(request: Request) {
  const { pathname } = new URL(request.url);
  // A counter that cannot be read answers "unavailable"; it never takes a page down with it.
  if (pathname === VIEWS_PATH) {
    return views().catch(() => new Response(JSON.stringify({ error: "the counter cannot be read now" }), { status: UNAVAILABLE, headers: { ...HEADERS, "cache-control": "no-store" } }));
  }
  if (REDIS_URL && WRITE_TOKEN && counts(request.method, pathname, request.headers)) {
    // After the response: a slow or failing counter never delays or breaks a page.
    waitUntil(pipeline([["HINCRBY", dayKey(new Date()), countedPath(pathname), "1"]], WRITE_TOKEN, 2_000).catch(() => undefined));
  }
  return next();
}
