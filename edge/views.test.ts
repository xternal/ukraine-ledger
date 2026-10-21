/** What is counted and how the totals are published (edge/views.ts). Run: node --test edge/ (part of pnpm check). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { counts, countedPath, dayKey, isCountedPage, isNotAReader, isNotARead, viewsFile } from "./views.ts";

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

test("counts the site's pages, with or without a trailing slash, and nothing else", () => {
  for (const p of ["/", "/promises", "/promises/", "/promise/uk-era-loan-2024", "/promise/uk-era-loan-2024/story/", "/actor/", "/actor/donald-trump", "/promises/area/", "/promises/area/eu-nato-membership", "/about/"])
    assert.equal(isCountedPage(p), true, p);
  for (const p of ["/views.json", "/og/home.png", "/feeds/all.xml", "/data/promises.json", "/promise", "/promise/x/story/extra", "/wp-admin/", "/promise/../../etc/passwd", "/promise/UK-Era-Loan", `/promise/${"a".repeat(130)}`])
    assert.equal(isCountedPage(p), false, p);
  assert.equal(countedPath("/about/"), "/about");
  assert.equal(countedPath("/"), "/");
});

test("skips crawlers, link previews, AI fetchers, scripts and prefetches", () => {
  assert.equal(isNotAReader(BROWSER), false);
  for (const ua of [null, "", "Googlebot/2.1", "LinkedInBot/1.0", "Mozilla/5.0 (compatible; ClaudeBot/1.0)", "GPTBot/1.1", "curl/8.4.0", "python-httpx/0.27", "site-visits-report/1.0 (+https://ukraineledger.com)"])
    assert.equal(isNotAReader(ua), true, String(ua));
  assert.equal(isNotARead(new Headers({ "sec-purpose": "prefetch;prerender" })), true);
  assert.equal(isNotARead(new Headers({ "sec-fetch-dest": "image" })), true);
  assert.equal(isNotARead(new Headers({ "sec-fetch-dest": "document" })), false);
  assert.equal(counts("GET", "/about/", new Headers({ "user-agent": BROWSER })), true);
  assert.equal(counts("HEAD", "/about/", new Headers({ "user-agent": BROWSER })), false);
});

test("keeps one counter a day, by UTC date, under this site's own prefix", () => {
  assert.equal(dayKey(new Date("2026-10-21T23:59:00Z")), "ukraineledger:views:2026-10-21");
});

test("publishes newest day first, leaving out days with no views", () => {
  const now = Date.parse("2026-10-21T06:00:00Z");
  const file = viewsFile(now, [{ result: ["/", "3", "/promises", "5"] }, { result: [] }, { result: ["/about", "1"] }]);
  assert.deepEqual(file, {
    generated_at: "2026-10-21T06:00:00.000Z",
    days: [
      { date: "2026-10-21", pages: { "/": 3, "/promises": 5 } },
      { date: "2026-10-19", pages: { "/about": 1 } },
    ],
  });
});
