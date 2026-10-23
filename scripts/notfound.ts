/**
 * The page for an address that has no page (public/404.html; Vercel serves it with status 404 for any unknown path):
 * a calm "this page isn't here", this site's home and main section, and the family of sites as small cards, so a
 * reader who followed a broken link has somewhere to go (Pavel, 23 October 2026). The family comes from FAMILY in
 * ./family.ts, in the switcher's order and words, and this site's card says "You are here". Plain HTML and a few lines
 * of CSS on the engine's tokens (--op-*), no JavaScript, so the file works unchanged on every ledger that has a
 * family.ts: USLedger.org and UkraineLedger.com share it.
 */
import { createElement as h, type ReactNode } from "react";
import { FAMILY, THIS_SITE } from "./family.ts";

/** The file Vercel serves, with status 404, for an address that has no page. */
export const NOT_FOUND_FILE = "/404.html";

export const notFoundTitle = () => "Page not found";

export const notFoundDescription = () =>
  `There is no page at this address on ${THIS_SITE}. The home page, the main section and the family of sister sites are linked from here.`;

const domain = (href: string) => href.replace(/^https?:\/\//, "").replace(/\/$/, "");

// The cards: a grid on a wide screen, one column on a phone. Only the engine's tokens, so light and dark follow the site.
const CSS = `.notfound{padding:2.5rem 0 3rem}
.notfound h1{margin:0 0 .6rem;font-size:clamp(1.8rem,5vw,2.4rem)}
.notfound__lede{margin:0 0 1rem;color:var(--op-muted)}
.notfound__go{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;margin:0 0 2.5rem;padding:0;list-style:none}
.notfound__go a{font-weight:600}
.notfound h2{margin:0 0 .9rem;font-size:1.35rem}
.notfound__family{display:grid;gap:.75rem;margin:0;padding:0;list-style:none;grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))}
.notfound__family a{display:grid;gap:.2rem;height:100%;box-sizing:border-box;padding:.9rem 1rem;background:var(--op-surface);border:1px solid var(--op-line);border-radius:var(--op-radius,12px);color:var(--op-ink);text-decoration:none;overflow-wrap:anywhere}
.notfound__family a:hover{border-color:var(--op-line-strong)}
.notfound__family a[aria-current="page"]{border-color:var(--op-accent);background:var(--op-sunk)}
.notfound__family b{font-family:var(--serif);font-size:1.05rem}
.notfound__family span{font-size:.85rem;color:var(--op-muted)}
.notfound__family .notfound__domain{color:var(--op-accent)}
.notfound__family .notfound__here{font-weight:600;color:var(--op-ink)}`;

/**
 * The page's body, inside the site's own header and footer. `home` is this site's home page ("/"); `main` is its
 * main section (Promises on the ledgers).
 */
export function notFoundBody({ home = "/", main }: { home?: string; main: { href: string; label: string } }): ReactNode {
  return h(
    "div",
    { className: "notfound" },
    h("style", { dangerouslySetInnerHTML: { __html: CSS } }),
    h("h1", null, "This page isn't here"),
    h("p", { className: "notfound__lede" }, "The link may be old or mistyped."),
    h("ul", { className: "notfound__go" }, h("li", null, h("a", { href: home }, `${THIS_SITE} home page`)), h("li", null, h("a", { href: main.href }, main.label))),
    h(
      "section",
      { "aria-labelledby": "notfound-family" },
      h("h2", { id: "notfound-family" }, "The family"),
      h(
        "ul",
        { className: "notfound__family" },
        FAMILY.map((s) => {
          const here = s.name === THIS_SITE;
          return h(
            "li",
            { key: s.name },
            h(
              "a",
              { href: here ? home : s.href, "aria-current": here ? "page" : undefined },
              h("b", null, s.name),
              h("span", { className: "notfound__domain" }, domain(s.href)),
              h("span", null, s.about),
              here ? h("span", { className: "notfound__here" }, "You are here") : null,
            ),
          );
        }),
      ),
    ),
  );
}
