/** The page for an address with no page (scripts/notfound.ts). Run: node --test scripts/ (part of pnpm check). */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FAMILY, THIS_SITE } from "./family.ts";
import { NOT_FOUND_FILE, notFoundBody } from "./notfound.ts";

const ROOT = join(import.meta.dirname, "..");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
const html = renderToStaticMarkup(notFoundBody({ home: "/", main: { href: "/promises", label: "Promises" } }));

test("lists every site of the family, in the switcher's order, and marks this one as here", () => {
  const at = FAMILY.map((s) => html.indexOf(`<b>${s.name}</b>`));
  for (const [i, s] of FAMILY.entries()) {
    assert.ok(at[i]! >= 0, s.name);
    assert.ok(html.includes(esc(s.about)), s.about);
    if (s.name !== THIS_SITE) assert.ok(html.includes(`href="${s.href}"`), s.href);
  }
  assert.deepEqual([...at].sort((a, b) => a - b), at, "the switcher's order");
  const current = [...html.matchAll(/<a [^>]*aria-current="page"[^>]*>(.*?)<\/a>/g)];
  assert.equal(current.length, 1);
  assert.ok(current[0]![0].includes('href="/"') && current[0]![1]!.includes(`<b>${THIS_SITE}</b>`) && current[0]![1]!.includes("You are here"));
});

test("says the page isn't here and links home and to the main section, with no script", () => {
  assert.ok(html.includes(esc("This page isn't here")));
  assert.ok(html.includes('href="/promises"'));
  assert.ok(!html.includes("<script"));
});

test("nothing turns an unknown address into a page with status 200: no catch-all rewrite, the proxy only passes it on", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert.equal(vercel.outputDirectory, "public", "Vercel serves public/404.html with status 404");
  assert.equal(vercel.rewrites, undefined);
  assert.equal(vercel.routes, undefined);
  const proxy = readFileSync(join(ROOT, "edge", "count.ts"), "utf8");
  assert.ok(!/\brewrite\(/.test(proxy), "the proxy never rewrites a path");
  assert.ok(/return next\(\);\s*}\s*$/.test(proxy), "a page's request goes on to the static files");
});

const built = join(ROOT, "public", NOT_FOUND_FILE.slice(1));
test("the built 404.html: noindex, no canonical, the site's header and footer", { skip: !existsSync(built) && "run pnpm build first" }, () => {
  const page = readFileSync(built, "utf8");
  assert.ok(page.includes('<meta name="robots" content="noindex"/>'));
  assert.ok(!page.includes('rel="canonical"'));
  assert.ok(page.includes(`<title>Page not found · ${THIS_SITE}</title>`));
  assert.ok(page.includes('class="site-header"') && page.includes('class="site-footer"'));
  assert.ok(page.includes('href="https://guzh.uk">Pavel Guzhikov</a>') && page.includes('href="https://ko-fi.com/pavelg">Buy me a matcha</a>'));
  const sitemap = join(ROOT, "public", "sitemap-pages.xml");
  if (existsSync(sitemap)) assert.ok(!readFileSync(sitemap, "utf8").includes("404"));
});
