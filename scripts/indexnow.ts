/**
 * Tells search engines which pages changed (IndexNow: Bing, Yandex, Seznam, Naver; Bing also feeds ChatGPT search and
 * Copilot), so they recrawl them without waiting. Run by .github/workflows/indexnow.yml once Vercel reports a finished
 * production deploy of main. It reads the live sitemaps and sends every page whose lastmod is on or after a date: the
 * day of the previous commit on main, so a deploy sends what it changed and nothing else. Files the deploy changed may
 * follow: a card or actor file adds its pages even when its lastmod is older (a card published with an old date).
 *
 *   node scripts/indexnow.ts --since 2026-11-18 [file ...]   pages changed on or after that day
 *   node scripts/indexnow.ts --all                every page in the sitemaps (once, or after a site-wide change)
 *   INDEXNOW_DRY=1 node scripts/indexnow.ts ...   list the pages without sending them
 *
 * The key is public by design: the build serves it at /<key>.txt to show the site is ours.
 */
import { indexNowPayload } from "@openpromises/publish";

export const INDEXNOW_KEY = "bcf75e8a70f30cfcc31b0789e61c4f8f";
const SITE = "https://ukraineledger.com";

/** Every <loc> with its <lastmod> (or none) in a sitemap or sitemap index. */
export function sitemapLocs(xml: string): { loc: string; lastmod?: string }[] {
  return [...xml.matchAll(/<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/g)].map(([, body]) => ({
    loc: body.match(/<loc>([^<]+)<\/loc>/)![1].trim(),
    lastmod: body.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1].trim().slice(0, 10),
  }));
}

/** The site's pages a changed content file feeds: a card's page and story, the list and home; an actor's page. */
export function pagesFor(file: string): string[] {
  let m;
  if ((m = file.match(/^content\/promises\/([a-z0-9-]+)\.yaml$/))) return [`/promise/${m[1]}`, `/promise/${m[1]}/story`, "/promises", "/"];
  if ((m = file.match(/^content\/actors\/([a-z0-9-]+)\.yaml$/))) return [`/actor/${m[1]}`, "/actor"];
  return [];
}

/**
 * The pages to send: changed on or after `since` (YYYY-MM-DD), or all of them when `since` is null, plus the pages
 * the changed files feed. Only pages in the sitemaps are sent, so a draft or a removed card never is.
 */
export function changedSince(pages: { loc: string; lastmod?: string }[], since: string | null, files: string[] = []): string[] {
  const fed = new Set(files.flatMap(pagesFor).map((x) => `${SITE}${x}`));
  return [...new Set(pages.filter((p) => since === null || (p.lastmod ?? "") >= since || fed.has(p.loc)).map((p) => p.loc))];
}

async function text(url: string): Promise<string> {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  return r.text();
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const since = args[args.indexOf("--since") + 1];
  if (!all && !/^\d{4}-\d{2}-\d{2}$/.test(since ?? "")) throw new Error("Give --since YYYY-MM-DD or --all");
  // The live key first: engines refuse a submission whose key they cannot fetch.
  if ((await text(`${SITE}/${INDEXNOW_KEY}.txt`)).trim() !== INDEXNOW_KEY) throw new Error("The live key file does not match");
  const maps = sitemapLocs(await text(`${SITE}/sitemap.xml`)).map((m) => m.loc);
  const pages = (await Promise.all(maps.map(text))).flatMap(sitemapLocs);
  const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--since");
  const urls = changedSince(pages, all ? null : since, files);
  if (!urls.length) {
    console.log(`IndexNow: no page changed since ${since}.`);
    return;
  }
  if (process.env.INDEXNOW_DRY) {
    console.log(urls.join("\n"));
    return;
  }
  const payload = indexNowPayload({ site: { url: SITE } } as Parameters<typeof indexNowPayload>[0], INDEXNOW_KEY, urls);
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  // 200 and 202 both mean received; 422 or 403 mean the key or a URL was refused.
  if (r.status !== 200 && r.status !== 202) throw new Error(`IndexNow answered ${r.status}: ${await r.text()}`);
  console.log(`IndexNow: sent ${payload.urlList.length} pages (${r.status}).`);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
