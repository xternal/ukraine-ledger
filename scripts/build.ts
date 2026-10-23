/**
 * Builds the whole site as static files in public/: a page for every published card, its story, every actor and
 * area, the home page, and everything the engine publishes (feeds, Markdown, llms.txt, sitemap, open data).
 * Drafts never appear. Pages are the engine's own components rendered once, so they read without JavaScript.
 *
 * Run: node scripts/build.ts (Node 22.18 or later strips the types).
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { categoryOf, climb, partyOf, statusLabel, todayIn, validateContent, type Actor, type Config } from "@openpromises/core";
import { findConfig, folderSource, loadConfig, readContent } from "@openpromises/files";
import {
  absolute,
  actorJsonLd,
  areaLabel,
  cardDescription,
  cardJsonLd,
  cardTitle,
  cardViews,
  clip,
  collectionJsonLd,
  DESCRIPTION_MAX,
  lastUpdated,
  longDate,
  paths,
  publishFiles,
  relatedCards,
  sitemapXml,
  statusCounts,
  words,
  type CardView,
  type JsonLd as Ld,
  type SitemapEntry,
} from "@openpromises/publish";
import { Breadcrumbs, JsonLd, PromiseCard, PromiseList, PromiseSpotlight, PromiseStory, StatusPill } from "@openpromises/react";
import { createElement as h, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { charts, keyFigures } from "./charts.ts";
import { FAMILY, MAKER, THIS_SITE } from "./family.ts";
import { logbook, watchTiles, type LogEntry, type WatchPick } from "./home.ts";
import { NOT_FOUND_FILE, notFoundBody, notFoundDescription, notFoundTitle } from "./notfound.ts";
import { readFx } from "./fx.ts";
import { faviconSvg, MARK_DOT, MARK_PATH, tileSvg } from "./mark.ts";
import { HEIGHT, shareImage, WIDTH, type Climb, type Share } from "./share-image.ts";

const ROOT = join(import.meta.dirname, "..");
/** `--preview` builds drafts too, into public-preview/, so the editor sees a page before approving it; never deployed. */
const PREVIEW = process.argv.includes("--preview");
const OUT = join(ROOT, PREVIEW ? "public-preview" : "public");

/** Every configured area, in the configured order, with how many published cards it holds: empty ones included. */
export function coverage(config: Config, views: readonly CardView[]): { area: string; count: number }[] {
  const areas = config.areas.kind === "enum" ? config.areas.values : [...new Set(views.map((v) => v.card.area))].sort();
  return areas.map((area) => ({ area, count: views.filter((v) => v.card.area === area).length }));
}

/**
 * The opening of the home page, chosen by rule, never by hand: the war's promises in a party's written platform,
 * oldest first. A platform is the commitment a party asks voters to hold it to, so it comes before what was said
 * since. The same rule applies to every party.
 */
/** Where a promise stands on the ladder, for the share images' climb chart and meters: the same rule for every card. */
export function climbOf(config: Config, v: CardView, n: number): Climb {
  const ladder = climb(config);
  const step = ladder.indexOf(v.card.status);
  const category = categoryOf(config, v.card.status);
  const kind = category === "off_ladder" ? "off" : step < 0 ? "ended" : step === ladder.length - 1 ? "top" : category === "open" ? "open" : "progress";
  return { n, step, kind };
}

export function platformPromises(views: readonly CardView[]): CardView[] {
  return views.filter((v) => v.card.venue === "platform").sort((a, b) => a.card.made_on.localeCompare(b.card.made_on) || a.id.localeCompare(b.id));
}

async function main() {
  const { config, contentDir } = await loadConfig(findConfig(ROOT)!);
  const result = validateContent(readContent(folderSource(contentDir), config).input);
  const errors = result.issues.filter((i) => i.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(`${e.file}: ${e.message}`);
    throw new Error(`${errors.length} errors: run pnpm validate`);
  }
  const L = config.locales.default;
  const w = words(config, L);
  const today = todayIn(config.timezone);
  const all = cardViews(result.cards, result.actors, result.editors);
  const views = PREVIEW ? all.map((v) => ({ ...v, where: "promises" as const })) : all.filter((v) => v.where === "promises");
  const p = paths(config);
  const name = config.site.name;
  // Dollars for the charts, at the ECB rate on the day each costed card was made (data/fx, filled by `pnpm fx`).
  const fx = readFx();
  const usdPerEur = (day: string) => fx.rates[day]?.usd_per_eur;
  const unrated = views.filter((v) => v.current.parameters?.cost && "range" in v.current.parameters.cost && v.current.parameters.cost.range && !usdPerEur(v.card.made_on)).map((v) => v.id);
  if (unrated.length) {
    const message = `No dollar rate for ${unrated.join(", ")}: run pnpm fx`;
    if (!PREVIEW) throw new Error(message);
    console.warn(message);
  }
  const people = [...result.actors.values()].filter((a) => a.kind === "person").sort((a, b) => a.id.localeCompare(b.id));
  const actorName = (a: Actor) => a.name[L] ?? a.id;
  const headline = (v: CardView) => v.card.headline?.[L] ?? v.id;
  const ladder = climb(config);
  const statusName = (status: string) => statusLabel(config, status, L);
  const ladderLabels = ladder.map(statusName);
  const updated = (vs: readonly CardView[]) => vs.map((v) => lastUpdated(v.card, today)).filter((d): d is string => !!d).sort().at(-1) ?? today;
  const latest = (v: CardView) => [...v.card.events].filter((e) => e.date <= today).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const tally = (vs: readonly CardView[]) => statusCounts(vs, config).map(({ status, count }) => `${count} ${statusName(status).toLowerCase()}`).join(" · ");

  rmSync(OUT, { recursive: true, force: true });
  const write = (path: string, body: string | Buffer) => {
    const file = join(OUT, path.replace(/^\//, ""));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  };
  /**
   * The menu, with the section a page belongs to marked by aria-current: "page" on the section's own page, "true" on
   * the pages under it (a card's page and story, the areas and each area's page are under Promises). Method last,
   * the same word in the same place as on the other sites of the family (Pavel, 23 October 2026); areas left the menu
   * for a row of links on Promises.
   */
  const trim = (x: string) => x.replace(/\/+$/, "") || "/";
  const menu = [
    { href: p.promises(L), label: "Promises", owns: (x: string) => /^\/promises?(\/|$)/.test(x) },
    { href: "/actor/", label: "People", owns: (x: string) => x.startsWith("/actor") },
    { href: "/about/", label: "Method", owns: (x: string) => x.startsWith("/about") },
  ];
  const nav = (path: string) =>
    h(
      "nav",
      { className: "site-nav", "aria-label": "Site" },
      h("ul", null, menu.map((m) => h("li", { key: m.href }, h("a", { href: m.href, "aria-current": trim(path) === trim(m.href) ? "page" : m.owns(trim(path)) ? "true" : undefined }, m.label)))),
    );
  /**
   * The family of sites behind a small button beside the logo (Pavel, 23 October 2026): every ledger on the same
   * open engine, and the maker's site. A <details> element, so it opens without JavaScript. Plain links: nothing counted.
   */
  const familySwitcher = h(
    "details",
    { className: "family" },
    h(
      "summary",
      { "aria-label": "The other sites of the family" },
      h("svg", { "aria-hidden": "true", viewBox: "0 0 14 14", width: 14, height: 14 }, h("path", { d: "M3 5l4 4 4-4", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" })),
    ),
    h(
      "div",
      { className: "family__panel" },
      h("p", null, "Public money and promises, one ledger per country or place, on the same open engine."),
      h(
        "ul",
        null,
        FAMILY.map((s) => {
          const here = s.name === THIS_SITE;
          return h("li", { key: s.name }, h("a", { href: s.href, "aria-current": here ? "page" : undefined }, h("b", null, s.name, here ? h("span", { className: "family__here" }, "you are here") : null), h("span", null, s.about)));
        }),
      ),
      h("a", { className: "family__maker", href: MAKER.href }, `Made by ${MAKER.name} · ${MAKER.short}`),
    ),
  );
  /** Keeps the current item of the menu and of the area row in view on narrow screens, without moving the page. */
  const NAV_SCRIPT = `(()=>{for(const c of document.querySelectorAll('.site-nav [aria-current],.area-filter [aria-current]')){const u=c.closest('ul');if(u.scrollWidth>u.clientWidth)u.scrollLeft=c.offsetLeft-(u.clientWidth-c.offsetWidth)/2}})();`;

  /**
   * Every page's own description, canonical address and share card (Open Graph and Twitter). `title` is the page's
   * name; `fullTitle` and `socialTitle` override what search results and share cards show (a card uses the engine's
   * cardTitle). Every page has its own share image (scripts/share-image.ts), drawn from what the page is about.
   */
  type PageOpts = { wide?: boolean; description?: string; fullTitle?: string; socialTitle?: string; type?: "website" | "article"; share: Share; alt: string };
  /**
   * The "not found" page: written to its own file, never indexed, with no address of its own (no canonical or og:url),
   * sharing the home page's image.
   */
  type MissingOpts = Omit<PageOpts, "share"> & { file: string };
  const images: { path: string; share: Share }[] = [];
  const imageOf = (path: string) => `/og${trim(path) === "/" ? "/home" : trim(path)}.png`;
  const head = (path: string, title: string, opts: PageOpts | MissingOpts) => {
    const missing = "file" in opts;
    const url = absolute(config, trim(path));
    const image = absolute(config, imageOf(missing ? "/" : path));
    const description = clip(opts.description ?? config.site.description[L], DESCRIPTION_MAX);
    const social = opts.socialTitle ?? title;
    return [
      h("title", { key: "t" }, opts.fullTitle ?? (title === name ? name : `${title} · ${name}`)),
      h("meta", { key: "d", name: "description", content: description }),
      missing ? null : h("link", { key: "c", rel: "canonical", href: url }),
      // The preview is never deployed; if it ever is, search engines must not index unapproved drafts.
      PREVIEW || missing ? h("meta", { key: "r", name: "robots", content: "noindex" }) : null,
      h("meta", { key: "tl", name: "theme-color", media: "(prefers-color-scheme: light)", content: "#ffffff" }),
      h("meta", { key: "td", name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#241f1a" }),
      h("meta", { key: "ot", property: "og:type", content: opts.type ?? "website" }),
      h("meta", { key: "os", property: "og:site_name", content: name }),
      h("meta", { key: "oti", property: "og:title", content: social }),
      h("meta", { key: "od", property: "og:description", content: description }),
      missing ? null : h("meta", { key: "ou", property: "og:url", content: url }),
      h("meta", { key: "oi", property: "og:image", content: image }),
      h("meta", { key: "oit", property: "og:image:type", content: "image/png" }),
      h("meta", { key: "oiw", property: "og:image:width", content: String(WIDTH) }),
      h("meta", { key: "oih", property: "og:image:height", content: String(HEIGHT) }),
      h("meta", { key: "oia", property: "og:image:alt", content: opts.alt }),
      h("meta", { key: "tc", name: "twitter:card", content: "summary_large_image" }),
      h("meta", { key: "tt", name: "twitter:title", content: social }),
      h("meta", { key: "tdd", name: "twitter:description", content: description }),
      h("meta", { key: "ti", name: "twitter:image", content: image }),
      h("meta", { key: "tia", name: "twitter:image:alt", content: opts.alt }),
      h("link", { key: "fi", rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }),
      h("link", { key: "fp", rel: "icon", href: "/favicon-32.png", sizes: "32x32", type: "image/png" }),
      h("link", { key: "fa", rel: "apple-touch-icon", href: "/apple-touch-icon.png" }),
    ];
  };

  /** `wide`: the home page, whose charts use the full width while its text keeps the reading measure. */
  const page = (path: string, title: string, body: ReactNode, opts: PageOpts | MissingOpts) => (
    "file" in opts ? null : images.push({ path: imageOf(path), share: opts.share }),
    write(
      "file" in opts ? opts.file : path.endsWith("/") ? `${path}index.html` : `${path}/index.html`,
      "<!doctype html>\n" +
        renderToStaticMarkup(
          h(
            "html",
            { lang: L },
            h(
              "head",
              null,
              h("meta", { charSet: "utf-8" }),
              h("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
              ...head(path, title, opts),
              h("link", { rel: "stylesheet", href: "/styles.css" }),
              h("link", { rel: "stylesheet", href: "/site.css" }),
              h("link", { rel: "alternate", type: "application/atom+xml", title: `${name}: every change`, href: "/feeds/all.xml" }),
            ),
            h(
              "body",
              null,
              h(
                "header",
                { className: "site-header" },
                h(
                  "div",
                  { className: "brand-wrap" },
                  h(
                    "a",
                    { href: "/", className: "site-name", "aria-current": trim(path) === "/" ? "page" : undefined },
                    h(
                      "svg",
                      { className: "site-name__mark", viewBox: "0 0 32 32", width: 24, height: 24, "aria-hidden": "true", focusable: "false" },
                      h("path", { d: MARK_PATH, fill: "none", stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" }),
                      h("circle", { ...MARK_DOT, r: 2.6, style: { fill: "var(--mark-dot)" } }),
                    ),
                    name,
                  ),
                  familySwitcher,
                ),
                nav(path),
              ),
              PREVIEW ? h("p", { className: "preview-banner", role: "note" }, "Preview: drafts included. Nothing on this page is published or approved.") : null,
              h("main", { className: opts.wide ? "main--wide" : undefined }, body),
              h(
                "footer",
                { className: "site-footer" },
                h("p", null, "Our writing is under ", h("a", { href: config.publish.licence!.url }, config.publish.licence!.name), ". Quotes keep their own terms, named beside each source."),
                h("p", null, h("a", { href: "/data/promises.json" }, "Open data (JSON)"), " · ", h("a", { href: "/data/promises.csv" }, "CSV"), " · ", h("a", { href: "/feeds/all.xml" }, "Every change (Atom)"), " · ", h("a", { href: "/llms.txt" }, "llms.txt")),
                h("p", null, "Built on ", h("a", { href: "https://github.com/xternal/openpromises" }, "OpenPromises"), ", like ", h("a", { href: "https://ledgergov.uk" }, "LedgerGov.UK"), " and ", h("a", { href: "https://russialedger.com" }, "RussiaLedger.com"), "."),
                h("p", { className: "site-footer__maker" }, "Made by ", h("a", { href: "https://guzh.uk" }, "Pavel Guzhikov"), " · ", h("a", { href: "https://ko-fi.com/pavelg" }, "Buy me a matcha")),
              ),
              h("script", { dangerouslySetInnerHTML: { __html: NAV_SCRIPT } }),
            ),
          ),
        ),
    )
  );
  const ld: { config: Config; w: typeof w; today: string } = { config, w, today };

  // Share images: a commitment shows its words and where it stands; a list shows every commitment as a bar.
  const footer = (vs: readonly CardView[]) => `Updated ${longDate(w, updated(vs))} · ukraineledger.com`;
  const promiseShare = (v: CardView, kicker?: string): Share => {
    const c = climbOf(config, v, 0);
    const e = latest(v);
    return {
      kind: "promise",
      kicker: kicker ?? `${actorName(v.actor)} · ${longDate(w, v.card.made_on).replace(/ /g, "\u00a0")}`,
      headline: headline(v),
      words: v.current.text,
      steps: ladderLabels,
      step: c.kind === "off" || c.kind === "ended" ? -1 : c.step,
      status: statusName(v.card.status),
      latest: e?.text?.[L] && c.kind !== "off" ? `${longDate(w, e.date)}: ${e.text[L]}` : undefined,
      footer: footer([v]),
    };
  };
  const promiseAlt = (v: CardView) => `${headline(v)}: “${clip(v.current.text, 200)}” Status: ${statusName(v.card.status)}.`;
  /** Bars from the furthest step down, endings last, so the chart reads as one shape; the same order for every page. */
  const climbs = (vs: readonly CardView[]) => vs.map((v) => climbOf(config, v, 0)).sort((a, b) => (a.kind === "ended" ? -1 : a.step) - (b.kind === "ended" ? -1 : b.step)).reverse();
  const chartShare = (kicker: string, title: string, vs: readonly CardView[]): Share => ({ kind: "chart", kicker, title, climb: climbs(vs), steps: ladderLabels, tally: tally(vs), footer: footer(vs) });
  const chartAlt = (vs: readonly CardView[]) => `A bar for each of the ${vs.length} commitments, as tall as the step it has reached: ${tally(vs)}.`;
  const pageShare = (kicker: string, title: string, sub: string, vs: readonly CardView[] = views): Share => ({ kind: "page", kicker, title, sub, footer: footer(vs) });

  const coverageTable =(cards: readonly CardView[], caption: string) =>
    h(
      "table",
      { className: "coverage" },
      h("caption", null, caption),
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Area"), h("th", { scope: "col" }, "Promises"))),
      h(
        "tbody",
        null,
        coverage(config, cards).map(({ area, count }) =>
          h("tr", { key: area, className: count ? undefined : "coverage__none" }, h("th", { scope: "row" }, h("a", { href: p.area(area, L) }, areaLabel(config, area, L))), h("td", null, count ? String(count) : "None recorded")),
        ),
      ),
    );

  // Home: the platform's words first, by rule; then the promises on the first screen, chosen by rule (decision 30).
  const platform = platformPromises(views);
  /** The site and its open data, for search engines and AI search: who makes it, and where the data is. */
  const maker = { "@type": "Person", name: "Pavel Guzhikov", url: "https://guzh.uk" };
  const siteLd: Ld[] = [
    { "@context": "https://schema.org", "@type": "WebSite", name, url: absolute(config, "/"), description: config.site.description[L], inLanguage: L, creator: maker },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Promises to Ukraine",
      description: "Every published commitment to Ukraine on this site: the exact words, who made it and when, the deadline, the cost range with its sources, the status and the evidence for each step.",
      url: absolute(config, "/"),
      license: config.publish.licence!.url,
      creator: maker,
      isAccessibleForFree: true,
      distribution: [
        { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: absolute(config, "/data/promises.json") },
        { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: absolute(config, "/data/promises.csv") },
      ],
    },
  ];
  /**
   * The home page's first screen (Pavel, 23 October 2026, as on LedgerGov.UK and USLedger.org): a one-line headline,
   * the four figures, then cards that each lead on: the promises at a glance, the areas, four promises to watch and the
   * logbook. Every figure is from the published cards, and the tiles and the logbook are picked by fixed rules
   * (scripts/home.ts).
   */
  const chartCtx = { config, w, L, today, usdPerEur, href: (id: string) => p.card(id, L) };
  const firstScreen = () => {
    const figures = keyFigures(chartCtx, views);
    const counts = statusCounts(views, config);
    const kindOf = (status: string) => climbOf(config, { card: { status } } as CardView, 0).kind;
    const tiles = watchTiles(config, views, today);
    const log = logbook({
      config,
      views,
      today,
      actorName: (id) => actorName(result.actors.get(id)!),
      headline,
      label: statusName,
      cardPath: (id) => p.card(id, L),
      actorPath: (id) => p.actor(id, L),
      pairPath: () => p.promises(L),
      promisesPath: p.promises(L),
    });
    const donors = figures.find((f) => f.label === "Donors")!.value;
    const TILES = [
      { key: "delivered", label: "Latest delivered", tone: "good", none: "No commitment has been delivered yet." },
      { key: "notMet", label: "Latest not met", tone: "bad", none: "No commitment has failed yet." },
      { key: "dueNext", label: "Due next", tone: "moved", none: "No open commitment has a date of its own ahead." },
      { key: "forward", label: "Latest step forward", tone: "new", none: "No commitment has moved a step yet." },
    ] as const;
    const tile = (t: (typeof TILES)[number], pick: WatchPick | null) =>
      pick
        ? h(
            "a",
            { key: t.key, className: "fs-card fs-tile", href: p.card(pick.view.id, L) },
            h("span", { className: `fs-tag t-${t.tone}` }, t.label),
            h("span", { className: "fs-tile__q" }, headline(pick.view)),
            h("span", { className: "fs-quiet" }, `${actorName(pick.view.actor)}, ${t.key === "dueNext" ? "due " : ""}${longDate(w, pick.date)}`),
          )
        : h("div", { key: t.key, className: "fs-card fs-tile fs-tile--none" }, h("span", { className: `fs-tag t-${t.tone}` }, t.label), h("span", { className: "fs-quiet" }, t.none));
    const logRow = (l: LogEntry, i: number) =>
      h(
        "li",
        { key: `${l.date}-${i}` },
        h("time", { className: "fs-log__date", dateTime: l.date }, longDate(w, l.date)),
        h("span", { className: `fs-tag t-${l.tone}` }, l.label),
        h("a", { href: l.href }, h("span", { className: "visually-hidden" }, `${l.label}: `), l.text),
      );
    return h(
      "div",
      { className: "fs", id: "first-screen" },
      h(
        "div",
        { className: "fs-title" },
        h("h1", null, `What is promised to Ukraine: ${views.length} commitments from ${donors} donors`),
        h("p", null, "Since 24 February 2022 · in each government's exact words, with the evidence since"),
      ),
      h(
        "section",
        { className: "fs-kpis", "aria-labelledby": "fs-kpis-h" },
        h("h2", { id: "fs-kpis-h", className: "visually-hidden" }, "The commitments in four figures"),
        h("ul", { className: "kpis" }, figures.map((k) => h("li", { key: k.label, className: "kpi" }, h("span", { className: "kpi__l" }, k.label), h("strong", { className: "kpi__v" }, k.value), h("span", { className: "kpi__s" }, k.sub)))),
        h("p", { className: "fs-source" }, "From each card's own sources; dollars at the ECB rate on the day each commitment was made. ", h("a", { href: "#charts" }, "Who has promised what ", h("span", { "aria-hidden": "true" }, "→"))),
      ),
      h(
        "div",
        { className: "fs-row2" },
        h(
          "section",
          { className: "fs-card", "aria-labelledby": "fs-promises-h" },
          h("div", { className: "fs-head" }, h("h2", { id: "fs-promises-h" }, h("a", { href: p.promises(L) }, `${views.length} commitments on record`)), h("span", null, "where each one stands")),
          h("div", { className: "fs-bar", "aria-hidden": "true" }, counts.map((c) => h("span", { key: c.status, "data-kind": kindOf(c.status), "data-status": c.status, style: { flexGrow: c.count } }))),
          h(
            "ul",
            { className: "fs-counts", "aria-label": "Where they stand" },
            counts.map((c) => h("li", { key: c.status }, h("i", { "aria-hidden": "true", "data-kind": kindOf(c.status), "data-status": c.status }), h("b", null, String(c.count)), ` ${statusName(c.status).toLowerCase()}`)),
          ),
          h("a", { className: "fs-more", href: p.promises(L) }, "Every commitment, by person, status or area ", h("span", { "aria-hidden": "true" }, "→")),
        ),
        h(
          "section",
          { className: "fs-card", "aria-labelledby": "fs-areas-h" },
          h("div", { className: "fs-head" }, h("h2", { id: "fs-areas-h" }, h("a", { href: "/promises/area/" }, "By area")), h("span", null, "fixed before the first card, empty ones too")),
          h(
            "ul",
            { className: "fs-areas" },
            coverage(config, views).map((c) => h("li", { key: c.area, className: c.count ? undefined : "fs-areas__none" }, h("a", { href: p.area(c.area, L) }, areaLabel(config, c.area, L)), h("b", null, c.count ? String(c.count) : "None"))),
          ),
        ),
      ),
      views.length ? h("section", { className: "fs-tiles", "aria-label": "Promises to watch" }, TILES.map((t) => tile(t, tiles[t.key]))) : null,
      h(
        "section",
        { className: "fs-card fs-log", "aria-labelledby": "fs-log-h" },
        h("div", { className: "fs-head" }, h("h2", { id: "fs-log-h" }, "Logbook ", h("span", null, "added, moved, corrected or checked, newest first")), h("a", { href: "/feeds/all.xml" }, "Every change (Atom) ", h("span", { "aria-hidden": "true" }, "→"))),
        h("ol", null, log.map(logRow)),
      ),
    );
  };

  page(
    "/",
    name,
    h(
      Fragment,
      null,
      firstScreen(),
      h("h2", { id: "charts", className: "home-h" }, "What is promised to Ukraine"),
      h("p", { className: "lede" }, "What every government and the EU has committed to since 24 February 2022, in their exact words, with the deadline they gave and what has happened since. A status moves only when a document shows it moved."),
      // The whole picture, as rings and a timeline (docs/DESIGN_BRIEF.md); charts.js adds zoom and tooltips only.
      charts(chartCtx, views, (status) => h(StatusPill, { status, config })),
      h("script", { src: "/charts.js", defer: true }),
      platform.length
        ? h(
            "section",
            { className: "platform", "aria-labelledby": "platform-h" },
            h("h2", { id: "platform-h" }, "In the platform"),
            platform.map((v) =>
              h(
                "figure",
                { key: v.id, className: "platform__promise" },
                h("blockquote", null, h("p", null, v.current.text)),
                h("figcaption", null, v.card.venue_label?.[L] ?? actorName(v.actor), ". ", h(StatusPill, { status: v.card.status, config }), " ", h("a", { href: p.card(v.id, L) }, "Where it stands →")),
              ),
            ),
          )
        : null,
      views.length
        ? h(PromiseSpotlight, { views, today, actors: result.actors, config })
        : h("p", null, "No promise is published yet. The first cards are being checked against their sources."),
      h(JsonLd, { data: siteLd }),
    ),
    {
      wide: true,
      share: chartShare("Every government and the EU · since 24 February 2022", "What is promised to Ukraine, and where each commitment stands", views),
      alt: chartAlt(views),
    },
  );

  /**
   * Areas, as a row of links on Promises and on each area's page, the one in view marked: Areas left the menu
   * (Pavel, 23 October 2026). Only areas with a commitment are listed; the areas page lists them all, empty ones too.
   */
  const areaFilter = (current?: string) =>
    h(
      "nav",
      { className: "area-filter", "aria-label": "Promises by area" },
      h(
        "ul",
        null,
        h("li", null, h("a", { href: p.promises(L), "aria-current": current ? undefined : "page" }, "All ", h("span", null, String(views.length)))),
        coverage(config, views)
          .filter((c) => c.count)
          .map((c) => h("li", { key: c.area }, h("a", { href: p.area(c.area, L), "aria-current": current === c.area ? "page" : undefined }, areaLabel(config, c.area, L), " ", h("span", null, String(c.count))))),
        h("li", null, h("a", { href: "/promises/area/", className: "area-filter__all" }, "Every area, empty ones too")),
      ),
    );

  const promisesDescription = "Every commitment to Ukraine on this site, by every government and the EU, with its exact words, its status and the evidence for it.";
  page(
    p.promises(L),
    "Promises",
    h(
      Fragment,
      null,
      h("h1", null, "Every promise"),
      areaFilter(),
      h(PromiseList, { views, today, actors: result.actors, config, empty: "No promise is published yet." }),
      h(JsonLd, { data: collectionJsonLd({ path: p.promises(L), name: "Every promise", description: promisesDescription, views }, ld) }),
    ),
    { description: promisesDescription, share: chartShare("Every promise", `Every commitment on ${name}, and where each one stands`, views), alt: chartAlt(views) },
  );

  for (const v of views) {
    const crumbs = [{ name, href: "/" }, { name: "Promises", href: p.promises(L) }, { name: headline(v), href: p.card(v.id, L) }];
    page(
      p.card(v.id, L),
      headline(v),
      h(
        Fragment,
        null,
        h(Breadcrumbs, { config, items: crumbs }),
        h(PromiseCard, { view: v, config, today, related: relatedCards(v, views), actions: h("a", { href: `${p.card(v.id, L)}/story/` }, "The whole story in one line") }),
        h(JsonLd, { data: cardJsonLd(v, ld) }),
      ),
      { description: cardDescription(v, config, w), fullTitle: cardTitle(v, config, w).title, socialTitle: cardTitle(v, config, w).social, type: "article", share: promiseShare(v), alt: promiseAlt(v) },
    );
    page(
      `${p.card(v.id, L)}/story`,
      `${headline(v)}: the story`,
      h(Fragment, null, h(Breadcrumbs, { config, items: [...crumbs, { name: "Story", href: `${p.card(v.id, L)}/story/` }] }), h(PromiseStory, { view: v, config, today, headingLevel: 2 })),
      { description: `The whole story of “${headline(v)}” in one dated line: every wording, every event and its evidence, and what is still to come.`, type: "article", share: promiseShare(v, "The whole story, step by step"), alt: promiseAlt(v) },
    );
  }

  page(
    "/actor/",
    "People",
    h(
      Fragment,
      null,
      h("h1", null, "People"),
      h(
        "ul",
        null,
        people.map((a) => h("li", { key: a.id }, h("a", { href: p.actor(a.id, L) }, actorName(a)), a.roles?.at(-1) ? `, ${a.roles.at(-1)!.title[L]}` : "", ` (${views.filter((v) => v.actor.id === a.id).length})`)),
      ),
    ),
    {
      description: "The officials whose commitments to Ukraine are recorded here, with their roles and how many commitments each has made.",
      share: pageShare("People", "Who promised what", "The officials whose commitments to Ukraine are recorded here, with their roles and how many commitments each has made."),
      alt: "Who promised what: the officials whose commitments to Ukraine are recorded on UkraineLedger.com.",
    },
  );
  for (const a of result.actors.values()) {
    const own = views.filter((v) => v.actor.id === a.id || v.party?.id === a.id);
    const partyId = partyOf(a.id, result.actors);
    const party = partyId ? (result.actors.get(partyId) ?? null) : null;
    page(
      p.actor(a.id, L),
      actorName(a),
      h(
        Fragment,
        null,
        h(Breadcrumbs, { config, items: [{ name, href: "/" }, { name: "People", href: "/actor/" }, { name: actorName(a), href: p.actor(a.id, L) }] }),
        h("h1", null, actorName(a)),
        a.roles?.length ? h("ul", null, a.roles.map((r, i) => h("li", { key: i }, r.title[L], r.from ? ` from ${r.from}` : "", r.to ? ` to ${r.to}` : ""))) : null,
        coverageTable(own, `${actorName(a)}: promises by area, every area listed`),
        h(PromiseList, { views: own, today, actors: result.actors, config, empty: "No promise is published yet." }),
        h(JsonLd, { data: actorJsonLd(a, party, own, ld) }),
      ),
      {
        description: own.length
          ? `${actorName(a)}: ${own.length} ${own.length === 1 ? "commitment to Ukraine, in its" : "commitments to Ukraine, each in its"} exact words, with its deadline, status and evidence.`
          : `${actorName(a)}: commitments to Ukraine, in their exact words, with deadlines, statuses and evidence. None is published yet.`,
        share:
          own.length === 1
            ? promiseShare(own[0], actorName(a))
            : pageShare(a.roles?.at(-1)?.title[L] ?? "Commitments to Ukraine", actorName(a), own.length ? `${own.length} commitments to Ukraine: ${tally(own)}` : "No commitment to Ukraine is published yet.", own.length ? own : views),
        alt: own.length === 1 ? promiseAlt(own[0]) : `${actorName(a)} on UkraineLedger.com: ${own.length ? `${own.length} commitments to Ukraine, ${tally(own)}` : "no commitment published yet"}.`,
      },
    );
  }

  page(
    "/promises/area/",
    "Areas",
    h(Fragment, null, h(Breadcrumbs, { config, items: [{ name, href: "/" }, { name: "Promises", href: p.promises(L) }, { name: "Areas", href: "/promises/area/" }] }), h("h1", null, "Promises by area"), h("p", null, "The areas are what a government can do about a war. They were fixed before the first card, so the list is never fitted to the cards."), coverageTable(views, "Every area, empty ones included")),
    {
      description: "Commitments to Ukraine by area, from weapons and money to sanctions, talks and membership. Every area is listed, empty ones included, so gaps show.",
      share: pageShare("Areas", "Promises by area", "Eight areas, fixed before the first card: talks, sanctions, weapons, money, security guarantees, intelligence, civilians and membership."),
      alt: "Promises by area on UkraineLedger.com: eight areas, fixed before the first card.",
    },
  );
  const areaDescription = (label: string) => `Commitments to Ukraine under “${label}”: each in its exact words, with its status and the evidence for it.`;
  for (const { area } of coverage(config, views)) {
    const label = areaLabel(config, area, L);
    const inArea = views.filter((v) => v.card.area === area);
    page(
      p.area(area, L),
      label,
      h(
        Fragment,
        null,
        h(Breadcrumbs, { config, items: [{ name, href: "/" }, { name: "Promises", href: p.promises(L) }, { name: "Areas", href: "/promises/area/" }, { name: label, href: p.area(area, L) }] }),
        h("h1", null, label),
        areaFilter(area),
        h(PromiseList, { views: views.filter((v) => v.card.area === area), today, actors: result.actors, config, empty: "No promise is recorded in this area." }),
        h(JsonLd, { data: collectionJsonLd({ path: p.area(area, L), name: label, description: areaDescription(label), views: views.filter((v) => v.card.area === area), breadcrumb: [{ name: "Promises", path: p.promises(L) }, { name: "Areas", path: "/promises/area/" }] }, ld) }),
      ),
      {
        description: areaDescription(label),
        share: inArea.length === 1 ? promiseShare(inArea[0], `Area · ${label}`) : pageShare("Area", label, inArea.length ? `${inArea.length} commitments: ${tally(inArea)}` : "No commitment is recorded in this area yet.", inArea.length ? inArea : views),
        alt: inArea.length === 1 ? promiseAlt(inArea[0]) : `${label} on UkraineLedger.com: ${inArea.length ? `${inArea.length} commitments, ${tally(inArea)}` : "no commitment recorded yet"}.`,
      },
    );
  }

  /** Short answers for readers and for search: what the pages do not already say. */
  const faq: [string, string][] = [
    ["Where do the amounts come from?", "Each amount comes from the card's own sources: the agreement, budget or official statement that states it, with who made the figure. A cost is a low-to-high range, never a single figure. Dollars use the European Central Bank's rate on the day the commitment was made."],
    ["What does “Not met” mean?", "The deadline has passed and a document shows the commitment was not kept as worded. A deadline that passes with no evidence either way is recorded as missed, not as “Not met”."],
    ["Why is a commitment missing?", "A card is published only once its exact words are found at a saved source and an editor has approved it. Every area is listed on every page, empty ones included, so what is missing shows."],
    ["Can I reuse the data?", "Yes. Every published card is open data, in JSON and CSV, under CC BY 4.0, with a feed of every change. Quotes keep their own terms, named beside each source."],
  ];
  page(
    "/about/",
    "Method",
    h(
      Fragment,
      null,
      h("h1", null, "Method"),
      h("p", { className: "lede" }, "How a commitment gets here, and how it moves."),
      h(
        "ul",
        null,
        h("li", null, "A promise is a commitment about the future, in the speaker's exact words, with a link to where they were said. Opinions about the war, its leaders or its causes are not promises."),
        h("li", null, "Its status moves only on evidence: a signed order, a sanctions designation, a delivery, a law, an official statement. Each step links to its document. A deadline that passes with no evidence of delivery is recorded automatically."),
        h("li", null, "Nothing is rewritten. A reworded promise or a moved deadline is a new version beside the old one; our own mistakes are corrections, listed on the card."),
        h("li", null, "A cost is a range with its source and who made it, never a single figure."),
        h("li", null, "The same rules and the same words apply to every person, party and government. Every area is listed on every person's page, so what has not been promised shows too."),
        h("li", null, "Each card is approved by an editor, named on the card, who declares no US party."),
        h("li", null, "Anyone a card is about may reply; the reply is published on the card."),
        h("li", null, "We count page views: one number per page per day, published at ", h("a", { href: "/views.json" }, "/views.json"), ". Nothing about the reader is stored: not the address, country, device, browser or where they came from. Crawlers and link previews are not counted."),
      ),
      h("p", null, "The money already given is counted by the ", h("a", { href: "https://www.kielinstitut.de/topics/war-against-ukraine/ukraine-support-tracker/" }, "Kiel Institute's Ukraine Support Tracker"), "; Donald Trump's 2024 campaign promises on every subject are rated by ", h("a", { href: "https://www.politifact.com/truth-o-meter/promises/maga-meter-tracking-donald-trumps-2024-promises/" }, "PolitiFact's MAGA-Meter"), ". This site keeps what each government said it would do, in its words, with the evidence since."),
      h("section", { className: "faq", "aria-labelledby": "faq-h" }, h("h2", { id: "faq-h" }, "Questions"), faq.map(([q, a]) => h(Fragment, { key: q }, h("h3", null, q), h("p", null, a)))),
      h(JsonLd, { data: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) } }),
    ),
    {
      description: "How UkraineLedger.com records commitments to Ukraine: exact words, evidence for every change of status, nothing rewritten, one set of rules for all.",
      socialTitle: "Method: how UkraineLedger.com works",
      share: pageShare("Method", "Exact words. A status that moves only on evidence.", "Nothing rewritten; costs with who made them; the same rules and words for every government."),
      alt: "How UkraineLedger.com works: exact words, and a status that moves only on evidence.",
    },
  );

  // Any address with no page: the host serves 404.html with status 404 (scripts/notfound.ts). Not in the sitemap.
  page("/404", notFoundTitle(), notFoundBody({ home: "/", main: { href: p.promises(L), label: "Promises" } }), {
    file: NOT_FOUND_FILE,
    description: notFoundDescription(),
    alt: `${name}: what is promised to Ukraine, and where each commitment stands.`,
  });

  // Search engines and AI crawlers are welcome: everything here is public and open data. The preview is never deployed.
  const crawlers = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];
  write(
    "/robots.txt",
    PREVIEW
      ? "User-agent: *\nDisallow: /\n"
      : ["User-agent: *", "Allow: /", "", ...crawlers.flatMap((c) => [`User-agent: ${c}`, "Allow: /", ""]), `Sitemap: ${absolute(config, "/sitemap.xml")}`, ""].join("\n"),
  );
  // The engine's sitemap lists the promise pages (the list, each card, each actor and area with cards); this one adds
  // the pages it does not model (home, the two indexes, about, each card's story), and sitemap.xml points to both.
  if (!PREVIEW) {
    const rest: SitemapEntry[] = ["/", "/actor/", "/promises/area/", "/about/", ...views.map((v) => `${p.card(v.id, L)}/story`)]
      .map((x) => absolute(config, trim(x)))
      .map((loc) => ({ loc, alternates: { [L]: loc } }));
    write("/sitemap-pages.xml", sitemapXml(rest));
    write(
      "/sitemap.xml",
      ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...[p.sitemap(), "/sitemap-pages.xml"].map((x) => `  <sitemap><loc>${absolute(config, x)}</loc></sitemap>`), "</sitemapindex>", ""].join("\n"),
    );
  }

  // The engine's llms.txt knows the promises; the home page's first screen, the areas and Method are added.
  if (!PREVIEW)
    for (const f of publishFiles({ config, views, today, actors: result.actors }))
      write(
        f.path,
        f.path === "/llms.txt"
          ? String(f.body).replace(
              /\n## Promise cards\n/,
              `\n## The site\n\n- [Home](${absolute(config, "/")}): the first screen: four figures (commitments, donors, amounts stated, delivered), the commitments at a glance, the areas, four commitments to watch picked by fixed rules, and a logbook of what was added, moved, corrected or checked; then who has promised what, and when\n- [Promises by area](${absolute(config, "/promises/area/")}): eight areas, fixed before the first card, empty ones too\n- [Method](${absolute(config, "/about/")}): how a commitment is recorded and how its status moves\n\n## Promise cards\n`,
            )
          : f.body,
      );
  const require = createRequire(import.meta.url);
  copyFileSync(require.resolve("@openpromises/react/styles.css"), join(OUT, "styles.css"));
  copyFileSync(join(ROOT, "scripts", "site.css"), join(OUT, "site.css"));
  copyFileSync(join(ROOT, "scripts", "charts.js"), join(OUT, "charts.js"));
  // Share images, a few at a time; then the mark (scripts/mark.ts) as an SVG favicon that follows the reader's light
  // or dark setting, a PNG for browsers that want one, and the home-screen icon.
  for (let i = 0; i < images.length; i += 8) await Promise.all(images.slice(i, i + 8).map(async ({ path, share }) => write(path, await shareImage(share))));
  write("/favicon.svg", faviconSvg());
  write("/favicon-32.png", new Resvg(tileSvg(32, true)).render().asPng());
  write("/apple-touch-icon.png", new Resvg(tileSvg(180, false)).render().asPng());
  console.log(`Built ${views.length} ${PREVIEW ? "cards, drafts included" : "published cards"}, ${result.actors.size} actors, ${coverage(config, views).length} areas into ${PREVIEW ? "public-preview" : "public"}/ (${today}).`);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
