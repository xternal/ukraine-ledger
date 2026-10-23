/** The first screen's rules (scripts/home.ts), on the site's own cards. Run: node --test scripts/ (part of pnpm check). */
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { validateContent } from "@openpromises/core";
import { findConfig, folderSource, loadConfig, readContent } from "@openpromises/files";
import { cardViews, type CardView } from "@openpromises/publish";
import { logbook, watchTiles } from "./home.ts";

const { config, contentDir } = await loadConfig(findConfig(join(import.meta.dirname, ".."))!);
const result = validateContent(readContent(folderSource(contentDir), config).input);
const published = (editors = result.editors) => cardViews(result.cards, result.actors, editors).filter((v) => v.where === "promises");
const TODAY = "2026-10-23";
const book = (views: readonly CardView[], today = TODAY) =>
  logbook({
    config,
    views,
    today,
    actorName: (id) => result.actors.get(id)?.name.en ?? id,
    headline: (v) => v.card.headline?.en ?? v.id,
    label: (s) => s,
    cardPath: (id) => `/promise/${id}`,
    actorPath: (id) => `/actor/${id}`,
    pairPath: (id) => (id ? `/then-again/${id}/` : "/then-again/"),
    promisesPath: "/promises",
    max: 1000,
  });

test("the tiles read nothing about who made a promise: swapping every card's speaker picks the same cards", () => {
  const views = published();
  const actors = views.map((v) => v.actor);
  const swapped = views.map((v, i) => ({ ...v, actor: actors[(i + 1) % actors.length]!, party: null }));
  const ids = (t: ReturnType<typeof watchTiles>) => Object.values(t).map((x) => x?.view.id ?? null);
  assert.deepEqual(ids(watchTiles(config, swapped, TODAY)), ids(watchTiles(config, views, TODAY)));
});

test("due next is open and ahead; latest delivered is delivered; nothing comes from after today", () => {
  const t = watchTiles(config, published(), TODAY);
  if (t.dueNext) assert.ok(t.dueNext.date >= TODAY);
  if (t.delivered) assert.equal(t.delivered.view.card.status, "delivered");
  for (const pick of [t.delivered, t.notMet, t.forward]) if (pick) assert.ok(pick.date <= TODAY);
});

test("the logbook: newest first, one line per speaker's additions a day, nothing after today", () => {
  const log = book(published());
  assert.ok(log.length > 0);
  for (let i = 1; i < log.length; i++) assert.ok(log[i - 1]!.date >= log[i]!.date, "newest first");
  for (const l of log) assert.ok(l.date <= TODAY);
  const added = log.filter((l) => l.kind === "new").map((l) => `${l.date}|${l.href}`);
  assert.equal(new Set(added).size, added.length, "no speaker's additions are split over two lines on one day");
  assert.ok(book(published(), "2026-10-20").every((l) => l.date <= "2026-10-20"));
});

test("an editor is named only when they chose to be", () => {
  const named = book(published()).filter((l) => l.kind === "checked");
  assert.ok(named.length && named.every((l) => l.text.startsWith("Pavel Guzhikov approved")));
  const counted = book(published(result.editors.map((e) => ({ ...e, named: false })))).filter((l) => l.kind === "checked");
  assert.ok(counted.length && counted.every((l) => l.text.startsWith("An editor approved")));
});
