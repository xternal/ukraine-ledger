/**
 * The page a reader sees when a link leads nowhere (Pavel, 23 October 2026, the same on every site of the family): a calm
 * "this page isn't here", this site's home page and its main section, and the family of sites as small cards, from
 * FAMILY in the switcher's order, this site marked "You are here". The build writes it to 404.html in the shell every
 * other page uses; the host serves it with status 404 for any address it has no file for, and it is never indexed.
 * The same file as USLedger.org's scripts/notfound.ts: the site's own name comes from THIS_SITE.
 */
import { createElement as h, Fragment, type ReactNode } from "react";
import { FAMILY, THIS_SITE } from "./family.ts";

/** Where the host looks for its "not found" page: 404.html at the root of the build output. */
export const NOT_FOUND_FILE = "/404.html";
export const NOT_FOUND_TITLE = "Page not found";
export const NOT_FOUND_DESCRIPTION = `This page isn't on ${THIS_SITE}. The link may be old or mistyped; the home page, the promises and the other sites of the family are a click away.`;

export interface NotFoundLinks {
  /** This site's home page. */
  home: string;
  /** Its main reading page: Promises on the ledgers. */
  main: { href: string; label: string };
}

/** The body of the page, inside the site's own <main>. No script: plain links only. */
export function notFoundBody({ home, main }: NotFoundLinks): ReactNode {
  return h(
    Fragment,
    null,
    h("h1", null, "This page isn't here"),
    h("p", { className: "lede" }, "The link may be old or mistyped."),
    h("ul", { className: "nf-links" }, h("li", null, h("a", { href: home }, `${THIS_SITE} home`)), h("li", null, h("a", { href: main.href }, main.label))),
    h(
      "section",
      { className: "nf-family", "aria-labelledby": "nf-family-h" },
      h("h2", { id: "nf-family-h" }, "The family"),
      h("p", null, "Public money and promises, one ledger per country or place, on the same open engine."),
      h(
        "ul",
        { className: "nf-cards" },
        FAMILY.map((s) => {
          const here = s.name === THIS_SITE;
          return h(
            "li",
            { key: s.name },
            h(
              "a",
              { className: "nf-card", href: here ? home : s.href, "aria-current": here ? "page" : undefined },
              h("b", null, s.name),
              h("span", { className: "nf-card__domain" }, here ? "You are here" : s.href.replace(/^https?:\/\//, "")),
              h("span", null, s.about),
            ),
          );
        }),
      ),
    ),
  );
}
