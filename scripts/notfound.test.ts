/**
 * The "not found" page (scripts/notfound.ts) and how the host serves it. Run: node --test scripts/ (part of pnpm check).
 * The checks on the built 404.html run once public/ exists (after pnpm build); the live status is checked on the preview.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FAMILY, THIS_SITE } from "./family.ts";
import { NOT_FOUND_FILE, notFoundBody } from "./notfound.ts";

const ROOT = join(import.meta.dirname, "..");
const html = renderToStaticMarkup(notFoundBody({ home: "/", main: { href: "/promises/", label: "Promises" } }) as never);
const cards = [...html.matchAll(/<a class="nf-card"[^>]*>.*?<\/a>/g)].map((m) => m[0]);

test("lists every site of the family, in the switcher's order, with its name and its line", () => {
  assert.equal(cards.length, FAMILY.length);
  FAMILY.forEach((s, i) => {
    assert.ok(cards[i]!.includes(`<b>${s.name}</b>`), s.name);
    assert.ok(cards[i]!.includes(s.about.replace(/'/g, "&#x27;")), s.about);
  });
});

test("marks this site, and only this one, as here, linking to its home page", () => {
  const here = cards.filter((c) => c.includes('aria-current="page"'));
  assert.equal(here.length, 1);
  assert.ok(here[0]!.includes(`<b>${THIS_SITE}</b>`) && here[0]!.includes("You are here") && here[0]!.includes('href="/"'));
  for (const s of FAMILY.filter((s) => s.name !== THIS_SITE)) assert.ok(html.includes(`href="${s.href}"`), s.href);
});

test("says the page isn't here and links home and to the main section, with no script", () => {
  assert.ok(html.includes("This page isn&#x27;t here"));
  assert.ok(html.includes('href="/promises/"'));
  assert.ok(!html.includes("<script"));
});

test("the host serves 404.html for any address with no file: nothing rewrites unknown paths to a page", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert.equal(vercel.outputDirectory, "public");
  assert.equal(NOT_FOUND_FILE, "/404.html");
  for (const key of ["rewrites", "routes"]) assert.equal(vercel[key], undefined, `${key} would answer unknown paths with a page`);
  // A proxy (edge/count.ts), where there is one, answers only its own files; every page request ends in next(), on to the files.
  const proxy = join(ROOT, "edge", "count.ts");
  if (existsSync(proxy)) assert.match(readFileSync(proxy, "utf8"), /return next\(\);\s*\}\s*$/);
});

const built = join(ROOT, "public", "404.html");
test("the built 404.html is noindex, titled, in the site's shell, and out of the sitemap", { skip: !existsSync(built) && "no build output (run pnpm build)" }, () => {
  const page = readFileSync(built, "utf8");
  assert.match(page, /<meta name="robots" content="noindex"\/>/);
  assert.match(page, new RegExp(`<title>Page not found · ${THIS_SITE.replace(".", "\\.")}</title>`));
  assert.match(page, /<meta name="description" content="[^"]+"\/>/);
  assert.ok(!page.includes('rel="canonical"'), "no address of its own");
  assert.ok(page.includes('class="site-header"') && page.includes("Made by <a href=\"https://guzh.uk\">Pavel Guzhikov</a>") && page.includes('href="https://ko-fi.com/pavelg">Buy me a matcha</a>'));
  assert.ok(!page.includes('<script src='), "no script of its own");
  for (const s of FAMILY) assert.ok(page.includes(`<b>${s.name}</b>`), s.name);
  const sitemaps = ["sitemap.xml", "sitemap-pages.xml"].map((f) => join(ROOT, "public", f)).filter(existsSync);
  for (const f of sitemaps) assert.ok(!readFileSync(f, "utf8").includes("/404"), f);
});
