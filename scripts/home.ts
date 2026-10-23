/**
 * What the home page's first screen shows besides the figures (Pavel, 23 October 2026, as on LedgerGov.UK,
 * BoroughBook.UK, RussiaLedger.com and USLedger.org): four promises to watch and the logbook of what was added, moved,
 * corrected or checked. Each is picked by a fixed rule from the published cards, never by hand, and the rules read
 * nothing about who made a promise or which government they speak for, so every speaker's cards are picked the same
 * way. The same file as USLedger.org's scripts/home.ts, so the two sites pick alike; pairs (Then again) are USLedger.org's only.
 */
import { categoryOf, climb, type Config } from "@openpromises/core";
import { countedEditor, reviewerName, type CardView } from "@openpromises/publish";

/** Plain order of ISO dates and ids, the same on every machine. */
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface WatchPick {
  view: CardView;
  /** The day it happened, or the deadline for "due next". */
  date: string;
}

export interface WatchTiles {
  /** The card most recently delivered: its latest "delivered" step up to today, on a card still delivered. */
  delivered: WatchPick | null;
  /** The card most recently not met: a "failed" or "deadline missed" step, on a card that ended failed or dropped. */
  notMet: WatchPick | null;
  /** The open card whose own deadline comes soonest, from today on. */
  dueNext: WatchPick | null;
  /** The open card that most recently moved a step up the ladder, short of its top. */
  forward: WatchPick | null;
}

/** The latest step of these kinds up to today, on the cards that pass `ok`; the earlier id on a tie. */
function latestStep(views: readonly CardView[], types: readonly string[], today: string, ok: (v: CardView) => boolean): WatchPick | null {
  const steps = views.filter(ok).flatMap((view) => view.card.events.filter((e) => types.includes(e.type) && e.date <= today).map((e) => ({ view, date: e.date })));
  return steps.sort((a, b) => order(b.date, a.date) || order(a.view.id, b.view.id))[0] ?? null;
}

/** A card's deadline now: its current version's, or none. */
export const deadlineOf = (v: CardView) => (v.current.parameters?.deadline as string | null | undefined) ?? null;

export function watchTiles(config: Config, views: readonly CardView[], today: string): WatchTiles {
  const ladder = climb(config);
  const top = ladder.at(-1)!;
  const open = (v: CardView) => categoryOf(config, v.card.status) === "open" || (ladder.includes(v.card.status) && v.card.status !== top);
  const due = views
    .filter((v) => open(v) && deadlineOf(v) !== null && deadlineOf(v)! >= today)
    .map((view) => ({ view, date: deadlineOf(view)! }))
    .sort((a, b) => order(a.date, b.date) || order(a.view.id, b.view.id));
  return {
    delivered: latestStep(views, [top], today, (v) => v.card.status === top),
    notMet: latestStep(views, ["failed", "deadline_missed"], today, (v) => v.card.status === "failed" || v.card.status === "quietly_dropped"),
    dueNext: due[0] ?? null,
    forward: latestStep(views, ladder.slice(1, -1), today, open),
  };
}

/** The most recently made card whose current version has a target and the forecast at the time (OpenPromises decision 36). */
export function latestForecast(views: readonly CardView[]): CardView | null {
  const withGap = views.filter((v) => {
    const { metric, baseline } = v.current.parameters ?? {};
    return !!metric && !!baseline && metric.unit === baseline.unit;
  });
  return withGap.sort((a, b) => order(b.card.made_on, a.card.made_on) || order(a.id, b.id))[0] ?? null;
}

/** A pair from Then again, as much of it as the logbook reads. */
export interface PairLike {
  id: string;
  actor_id: string;
  subject: string;
  reviews: { by: string; kind: string; on: string; approves: boolean }[];
}

/** Within one day: moves first, then corrections, new cards, new pairs and checks. */
const KIND_ORDER = { moved: 0, corrected: 1, new: 2, pair: 3, checked: 4 } as const;

export interface LogEntry {
  date: string;
  kind: keyof typeof KIND_ORDER;
  /** "Added", "Corrected", "Checked", or the step a card moved to ("Delivering"). */
  label: string;
  tone: "new" | "good" | "bad" | "moved" | "neutral";
  /** What a reader sees: "Seal the border", "Donald Trump: 3 new promises", "Pavel Guzhikov approved 20 cards". */
  text: string;
  href: string;
}

export interface LogbookInput {
  config: Config;
  views: readonly CardView[];
  pairs?: readonly PairLike[];
  today: string;
  /** A person or party's name, for "Donald Trump: 3 new promises". */
  actorName: (id: string) => string;
  /** A card's short name. */
  headline: (v: CardView) => string;
  label: (status: string) => string;
  cardPath: (id: string) => string;
  actorPath: (id: string) => string;
  pairPath: (id?: string) => string;
  promisesPath: string;
  max?: number;
}

/**
 * The logbook: what was added, moved, corrected or checked, newest first, up to `max` lines (six). A card counts as
 * added on its first review (every card is reviewed when it is added), and one speaker's cards added on one day are one
 * line; so are one speaker's pairs in Then again. Each status step and each correction is a line. One editor's
 * approvals on one day are one line, under their name only when they chose to be named (OpenPromises decision 23),
 * else as "An editor". Nothing after `today`.
 */
export function logbook(x: LogbookInput): LogEntry[] {
  const { config, views, today } = x;
  const ladder = climb(config);
  const top = ladder.at(-1);
  const out: LogEntry[] = [];
  const added = new Map<string, CardView[]>();
  const approved = new Map<string, number>();
  for (const v of views) {
    const reviews = (v.card.reviews ?? []).filter((r) => r.on <= today);
    const first = reviews.map((r) => r.on).sort()[0];
    if (first) added.set(`${first}|${v.actor.id}`, [...(added.get(`${first}|${v.actor.id}`) ?? []), v]);
    for (const r of reviews)
      if (r.kind === "editor" && r.approves) {
        const key = `${r.on}|${countedEditor(v, r.by) ? "" : reviewerName(config, r.by)}`;
        approved.set(key, (approved.get(key) ?? 0) + 1);
      }
    for (const e of v.card.events)
      if (e.date <= today && e.type !== "promised" && (ladder.includes(e.type) || e.type === "failed" || e.type === "deadline_missed" || e.type === "quietly_dropped"))
        out.push({
          date: e.date,
          kind: "moved",
          label: x.label(e.type === "deadline_missed" ? "failed" : e.type),
          tone: e.type === top ? "good" : ladder.includes(e.type) ? "moved" : "bad",
          text: x.headline(v),
          href: x.cardPath(v.id),
        });
    for (const c of v.card.corrections ?? []) if (c.date <= today) out.push({ date: c.date, kind: "corrected", label: "Corrected", tone: "neutral", text: x.headline(v), href: x.cardPath(v.id) });
  }
  for (const [key, list] of added) {
    const date = key.split("|")[0]!;
    const v = list[0]!;
    out.push(
      list.length === 1
        ? { date, kind: "new", label: "Added", tone: "new", text: x.headline(v), href: x.cardPath(v.id) }
        : { date, kind: "new", label: "Added", tone: "new", text: `${x.actorName(v.actor.id)}: ${list.length} new promises`, href: x.actorPath(v.actor.id) },
    );
  }
  const pairsAdded = new Map<string, PairLike[]>();
  for (const p of x.pairs ?? []) {
    const first = p.reviews.filter((r) => r.on <= today && r.kind === "editor" && r.approves).map((r) => r.on).sort()[0];
    if (first) pairsAdded.set(`${first}|${p.actor_id}`, [...(pairsAdded.get(`${first}|${p.actor_id}`) ?? []), p]);
  }
  for (const [key, list] of pairsAdded) {
    const date = key.split("|")[0]!;
    const p = list[0]!;
    out.push(
      list.length === 1
        ? { date, kind: "pair", label: "Then again", tone: "new", text: `${x.actorName(p.actor_id)}: ${p.subject}`, href: x.pairPath(p.id) }
        : { date, kind: "pair", label: "Then again", tone: "new", text: `${x.actorName(p.actor_id)}: ${list.length} new pairs`, href: x.pairPath() },
    );
  }
  for (const [key, n] of approved) {
    const [date, who] = key.split("|") as [string, string];
    out.push({ date, kind: "checked", label: "Checked", tone: "good", text: `${who || "An editor"} approved ${n} ${n === 1 ? "card" : "cards"}`, href: x.promisesPath });
  }
  return out.sort((a, b) => order(b.date, a.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || order(a.text, b.text)).slice(0, x.max ?? 6);
}
