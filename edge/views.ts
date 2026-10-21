/**
 * Counting page views: one number per page per day, and nothing about the reader. The count is made on the host
 * before the page is served (edge/count.ts), from the request's path alone: it never stores the IP address, country,
 * device, browser, referrer or time of day. Crawlers, link previews, scripts and prefetches are not counted. The
 * totals are public at /views.json, in the same format as RussiaLedger.com's, LedgerGov.UK's, BoroughBook.UK's and USLedger.org's,
 * and Pavel's visits report reads them from there.
 */
export const VIEWS_PATH = "/views.json";
/** How many days /views.json returns. */
export const VIEWS_DAYS = 30;
export const DAY_MS = 86_400_000;

/**
 * A page's address as it is counted: without a trailing slash (the root stays "/"), so /about and /about/ are one page.
 * Pages are served both ways.
 */
export const countedPath = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path);

/**
 * The site's pages (scripts/build.ts writes them): the home page, the promise list, each card and its story, the people,
 * the areas and How it works. Anything else (scanners' guesses, files, share images, feeds, data) is not counted.
 */
const PAGES = /^\/(?:promises|about|actor(?:\/[a-z0-9-]+)?|promises\/area(?:\/[a-z0-9-]+)?|promise\/[a-z0-9-]+(?:\/story)?)?$/;
const LONGEST_PATH = 120;
export const isCountedPage = (path: string) => path.length <= LONGEST_PATH && PAGES.test(countedPath(path));

const NOT_A_READER =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|meta-external|embedly|whatsapp|telegram|skype|discord|slack|curl|wget|python|httpx|go-http|java\/|okhttp|axios|node-fetch|undici|^node|deno|ruby|php|libwww|postman|insomnia|headless|lighthouse|pagespeed|inspectiontool|pingdom|uptime|monitor|feed|rss|scan|archive|chatgpt|claude|perplexity|anthropic|openai|ukraineledger|vercel|https?:\/\//i;
/** A crawler, a link preview, an AI fetcher or a script (browsers never put a web address in their name); no user agent counts as not a reader. */
export const isNotAReader = (userAgent: string | null) => !userAgent || NOT_A_READER.test(userAgent);

/** A browser fetching a page ahead of a click, or a request for part of a page, is not a read. */
export function isNotARead(headers: Headers): boolean {
  if (/prefetch|prerender/i.test(headers.get("sec-purpose") ?? headers.get("purpose") ?? "")) return true;
  const dest = headers.get("sec-fetch-dest");
  return dest !== null && dest !== "document";
}

/** Whether a request adds one to its page's count today. */
export const counts = (method: string, path: string, headers: Headers) => method === "GET" && isCountedPage(path) && !isNotAReader(headers.get("user-agent")) && !isNotARead(headers);

/** The day's counter, by UTC date: one hash per day, a field per page. The prefix keeps it apart in a shared database. */
export const dayKey = (date: Date) => `ukraineledger:views:${date.toISOString().slice(0, 10)}`;

export interface ViewsDay {
  date: string;
  pages: Record<string, number>;
}
export interface ViewsFile {
  generated_at: string;
  days: ViewsDay[];
}

/** The counter's answers to one HGETALL per day, newest first, as the public file; days with no views are left out. */
export function viewsFile(now: number, answers: { result?: unknown }[]): ViewsFile {
  const file: ViewsFile = { generated_at: new Date(now).toISOString(), days: [] };
  answers.forEach((a, i) => {
    const flat = Array.isArray(a.result) ? (a.result as string[]) : [];
    const pages: Record<string, number> = {};
    for (let k = 0; k + 1 < flat.length; k += 2) pages[flat[k]!] = Number(flat[k + 1]);
    if (flat.length) file.days.push({ date: new Date(now - i * DAY_MS).toISOString().slice(0, 10), pages });
  });
  return file;
}
