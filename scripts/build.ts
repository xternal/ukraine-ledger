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
import { partyOf, todayIn, validateContent, type Actor, type Config } from "@openpromises/core";
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
  paths,
  publishFiles,
  relatedCards,
  sitemapXml,
  words,
  type CardView,
  type JsonLd as Ld,
  type SitemapEntry,
} from "@openpromises/publish";
import { Breadcrumbs, JsonLd, PromiseCard, PromiseList, PromiseSpotlight, PromiseStory, StatusPill } from "@openpromises/react";
import { createElement as h, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { charts } from "./charts.ts";
import { readFx } from "./fx.ts";

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

  rmSync(OUT, { recursive: true, force: true });
  const write = (path: string, body: string) => {
    const file = join(OUT, path.replace(/^\//, ""));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  };
  /**
   * The menu, with the section a page belongs to marked by aria-current: "page" on the section's own page, "true" on
   * the pages under it (a card's page and story are under Promises; an area's page under Areas, not Promises).
   */
  const trim = (x: string) => x.replace(/\/+$/, "") || "/";
  const menu = [
    { href: p.promises(L), label: "Promises", owns: (x: string) => /^\/promises?(\/|$)/.test(x) && !x.startsWith("/promises/area") },
    { href: "/actor/", label: "People", owns: (x: string) => x.startsWith("/actor") },
    { href: "/promises/area/", label: "Areas", owns: (x: string) => x.startsWith("/promises/area") },
    { href: "/about/", label: "How it works", owns: (x: string) => x.startsWith("/about") },
  ];
  const nav = (path: string) =>
    h(
      "nav",
      { "aria-label": "Site" },
      menu.map((m) => h("a", { key: m.href, href: m.href, "aria-current": trim(path) === trim(m.href) ? "page" : m.owns(trim(path)) ? "true" : undefined }, m.label)),
    );

  /**
   * Every page's own description, canonical address and share card (Open Graph and Twitter). `title` is the page's
   * name; `fullTitle` and `socialTitle` override what search results and share cards show (a card uses the engine's
   * cardTitle). The share image waits for the site's mark, so cards are "summary" for now.
   */
  type PageOpts = { wide?: boolean; description?: string; fullTitle?: string; socialTitle?: string; type?: "website" | "article" };
  const head = (path: string, title: string, opts: PageOpts) => {
    const url = absolute(config, trim(path));
    const description = clip(opts.description ?? config.site.description[L], DESCRIPTION_MAX);
    const social = opts.socialTitle ?? title;
    return [
      h("title", { key: "t" }, opts.fullTitle ?? (title === name ? name : `${title} · ${name}`)),
      h("meta", { key: "d", name: "description", content: description }),
      h("link", { key: "c", rel: "canonical", href: url }),
      // The preview is never deployed; if it ever is, search engines must not index unapproved drafts.
      PREVIEW ? h("meta", { key: "r", name: "robots", content: "noindex" }) : null,
      h("meta", { key: "tl", name: "theme-color", media: "(prefers-color-scheme: light)", content: "#ffffff" }),
      h("meta", { key: "td", name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#241f1a" }),
      h("meta", { key: "ot", property: "og:type", content: opts.type ?? "website" }),
      h("meta", { key: "os", property: "og:site_name", content: name }),
      h("meta", { key: "oti", property: "og:title", content: social }),
      h("meta", { key: "od", property: "og:description", content: description }),
      h("meta", { key: "ou", property: "og:url", content: url }),
      h("meta", { key: "tc", name: "twitter:card", content: "summary" }),
      h("meta", { key: "tt", name: "twitter:title", content: social }),
      h("meta", { key: "tdd", name: "twitter:description", content: description }),
    ];
  };

  /** `wide`: the home page, whose charts use the full width while its text keeps the reading measure. */
  const page = (path: string, title: string, body: ReactNode, opts: PageOpts = {}) =>
    write(
      path.endsWith("/") ? `${path}index.html` : `${path}/index.html`,
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
                h("a", { href: "/", className: "site-name" }, name),
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
                h("p", { className: "site-footer__maker" }, "Made by ", h("a", { href: "https://guzh.uk" }, "Pavel Guzhikov"), " · ", h("a", { href: "https://ko-fi.com/pavelg" }, "Buy me a coffee")),
              ),
            ),
          ),
        ),
    );
  const ld: { config: Config; w: typeof w; today: string } = { config, w, today };

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
  page(
    "/",
    name,
    h(
      Fragment,
      null,
      h("h1", null, "What is promised to Ukraine"),
      h("p", { className: "lede" }, "What every government and the EU has committed to since 24 February 2022, in their exact words, with the deadline they gave and what has happened since. A status moves only when a document shows it moved."),
      // The whole picture, as rings and a timeline (docs/DESIGN_BRIEF.md); charts.js adds zoom and tooltips only.
      charts({ config, w, L, today, usdPerEur, href: (id) => p.card(id, L) }, views, (status) => h(StatusPill, { status, config })),
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
    { wide: true },
  );

  const promisesDescription = "Every commitment to Ukraine on this site, by every government and the EU, with its exact words, its status and the evidence for it.";
  page(
    p.promises(L),
    "Promises",
    h(
      Fragment,
      null,
      h("h1", null, "Every promise"),
      h(PromiseList, { views, today, actors: result.actors, config, empty: "No promise is published yet." }),
      h(JsonLd, { data: collectionJsonLd({ path: p.promises(L), name: "Every promise", description: promisesDescription, views }, ld) }),
    ),
    { description: promisesDescription },
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
      { description: cardDescription(v, config, w), fullTitle: cardTitle(v, config, w).title, socialTitle: cardTitle(v, config, w).social, type: "article" },
    );
    page(
      `${p.card(v.id, L)}/story`,
      `${headline(v)}: the story`,
      h(Fragment, null, h(Breadcrumbs, { config, items: [...crumbs, { name: "Story", href: `${p.card(v.id, L)}/story/` }] }), h(PromiseStory, { view: v, config, today, headingLevel: 2 })),
      { description: `The whole story of “${headline(v)}” in one dated line: every wording, every event and its evidence, and what is still to come.`, type: "article" },
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
    { description: "The officials whose commitments to Ukraine are recorded here, with their roles and how many commitments each has made." },
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
      },
    );
  }

  page(
    "/promises/area/",
    "Areas",
    h(Fragment, null, h("h1", null, "Promises by area"), h("p", null, "The areas are what a government can do about a war. They were fixed before the first card, so the list is never fitted to the cards."), coverageTable(views, "Every area, empty ones included")),
    { description: "Commitments to Ukraine by area, from weapons and money to sanctions, talks and membership. Every area is listed, empty ones included, so gaps show." },
  );
  const areaDescription = (label: string) => `Commitments to Ukraine under “${label}”: each in its exact words, with its status and the evidence for it.`;
  for (const { area } of coverage(config, views)) {
    const label = areaLabel(config, area, L);
    page(
      p.area(area, L),
      label,
      h(
        Fragment,
        null,
        h(Breadcrumbs, { config, items: [{ name, href: "/" }, { name: "Areas", href: "/promises/area/" }, { name: label, href: p.area(area, L) }] }),
        h("h1", null, label),
        h(PromiseList, { views: views.filter((v) => v.card.area === area), today, actors: result.actors, config, empty: "No promise is recorded in this area." }),
        h(JsonLd, { data: collectionJsonLd({ path: p.area(area, L), name: label, description: areaDescription(label), views: views.filter((v) => v.card.area === area), breadcrumb: [{ name: "Areas", path: "/promises/area/" }] }, ld) }),
      ),
      { description: areaDescription(label) },
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
    "How it works",
    h(
      Fragment,
      null,
      h("h1", null, "How it works"),
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
      ),
      h("p", null, "The money already given is counted by the ", h("a", { href: "https://www.kielinstitut.de/topics/war-against-ukraine/ukraine-support-tracker/" }, "Kiel Institute's Ukraine Support Tracker"), "; Donald Trump's 2024 campaign promises on every subject are rated by ", h("a", { href: "https://www.politifact.com/truth-o-meter/promises/maga-meter-tracking-donald-trumps-2024-promises/" }, "PolitiFact's MAGA-Meter"), ". This site keeps what each government said it would do, in its words, with the evidence since."),
      h("section", { className: "faq", "aria-labelledby": "faq-h" }, h("h2", { id: "faq-h" }, "Questions"), faq.map(([q, a]) => h(Fragment, { key: q }, h("h3", null, q), h("p", null, a)))),
      h(JsonLd, { data: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) } }),
    ),
    { description: "How UkraineLedger.com records commitments to Ukraine: exact words, evidence for every change of status, nothing rewritten, one set of rules for all." },
  );

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

  if (!PREVIEW) for (const f of publishFiles({ config, views, today, actors: result.actors })) write(f.path, f.body);
  const require = createRequire(import.meta.url);
  copyFileSync(require.resolve("@openpromises/react/styles.css"), join(OUT, "styles.css"));
  copyFileSync(join(ROOT, "scripts", "site.css"), join(OUT, "site.css"));
  copyFileSync(join(ROOT, "scripts", "charts.js"), join(OUT, "charts.js"));
  console.log(`Built ${views.length} ${PREVIEW ? "cards, drafts included" : "published cards"}, ${result.actors.size} actors, ${coverage(config, views).length} areas into ${PREVIEW ? "public-preview" : "public"}/ (${today}).`);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
