import assert from "node:assert/strict";
import { test } from "node:test";
import { changedSince, pagesFor, sitemapLocs } from "./indexnow.ts";

const SITE = "https://ukraineledger.com";
const xml = `<?xml version="1.0"?><urlset>
  <url><loc>${SITE}/</loc><lastmod>2026-11-18</lastmod></url>
  <url><loc>${SITE}/promise/a</loc><lastmod>2026-10-01</lastmod></url>
  <url><loc>${SITE}/promise/a/story</loc><lastmod>2026-10-01</lastmod></url>
  <url><loc>${SITE}/about</loc></url>
</urlset>`;

test("reads every loc and its lastmod, from a sitemap or an index", () => {
  assert.deepEqual(sitemapLocs(xml)[1], { loc: `${SITE}/promise/a`, lastmod: "2026-10-01" });
  assert.equal(sitemapLocs(xml)[3].lastmod, undefined);
  assert.deepEqual(sitemapLocs(`<sitemapindex><sitemap><loc>${SITE}/s.xml</loc><lastmod>2026-11-19T10:00:00Z</lastmod></sitemap></sitemapindex>`), [{ loc: `${SITE}/s.xml`, lastmod: "2026-11-19" }]);
});

test("sends what changed since the day given, and nothing older", () => {
  assert.deepEqual(changedSince(sitemapLocs(xml), "2026-11-18"), [`${SITE}/`]);
  assert.deepEqual(changedSince(sitemapLocs(xml), "2026-11-19"), []);
});

test("a changed card file adds its pages even with an older lastmod, but only pages in the sitemap", () => {
  assert.deepEqual(changedSince(sitemapLocs(xml), "2026-11-19", ["content/promises/a.yaml", "content/drafts/b.yaml"]), [`${SITE}/`, `${SITE}/promise/a`, `${SITE}/promise/a/story`]);
  assert.deepEqual(pagesFor("content/drafts/b.yaml"), []);
});

test("--all sends every page", () => {
  assert.equal(changedSince(sitemapLocs(xml), null).length, 4);
});
