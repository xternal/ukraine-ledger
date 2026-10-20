/**
 * The two pictures on the home page (docs/DESIGN_BRIEF.md): rings like DaisyDisk's, with a list beside them, and a
 * timeline. Both are static SVG drawn here at build time from the cards, with a table of the same rows under them, so
 * they read without JavaScript. charts.js only adds zoom, hover and tooltips. Colours are the engine's status tokens
 * (`--op-*`), set in site.css, so light and dark follow the engine.
 */
import { categoryOf, climb, missedDeadline, statusLabel, type Actor, type Config } from "@openpromises/core";
import { longDate, money, type CardView, type Words } from "@openpromises/publish";
import { createElement as h, Fragment, type ReactNode } from "react";

/** The fixed order of the groups, never by size or status (design brief §1). */
export const GROUPS = ["eu", "europe", "us", "other"] as const;
export type Group = (typeof GROUPS)[number];
export const GROUP_NAMES: Record<Group, string> = { eu: "European Union", europe: "European countries", us: "United States", other: "Other countries" };
const GROUP_SHORT: Record<Group, string> = { eu: "EU", europe: "Europe", us: "US", other: "Other" };

/** The engine's four categories, with "finished" split into the ladder's top step and the rest. */
export type Bucket = "delivered" | "progress" | "open" | "not_met" | "off_ladder";
export const BUCKETS: readonly Bucket[] = ["delivered", "progress", "open", "not_met", "off_ladder"];

export function bucketOf(config: Config, status: string): Bucket {
  if (status === climb(config).at(-1)) return "delivered";
  const c = categoryOf(config, status) ?? "off_ladder";
  return c === "finished" ? "not_met" : c;
}

/** The statuses in a bucket, in ladder order, for the legend. */
export function bucketStatuses(config: Config, bucket: Bucket): string[] {
  return config.ladder.statuses.map((s) => s.id).filter((id) => bucketOf(config, id) === bucket);
}

/** One commitment as the charts see it: its card and the government that must deliver it. */
export interface Row {
  view: CardView;
  group: Group;
  donor: string;
  donorName: string;
  government: Actor;
  bucket: Bucket;
  /** Low, central and high, in EUR bn; null when the card states no amount. */
  amount: readonly [number, number, number] | null;
}

type DonorX = { donor?: string; donor_name?: string; group?: string };
const donorOf = (a: Actor | null | undefined): DonorX => ((a as { x?: DonorX } | null | undefined)?.x ?? {}) as DonorX;

/** Every card whose `responsible` actor says which donor and group it is (`x` in openpromises.config.ts). */
export function chartRows(views: readonly CardView[], config: Config): { rows: Row[]; unattributed: CardView[] } {
  const rows: Row[] = [];
  const unattributed: CardView[] = [];
  for (const view of views) {
    const government = view.responsible;
    const d = donorOf(government);
    if (!government || !d.donor || !(GROUPS as readonly string[]).includes(d.group ?? "")) {
      unattributed.push(view);
      continue;
    }
    const cost = view.current.parameters?.cost;
    const range = cost && "range" in cost && cost.range ? cost.range : null;
    rows.push({ view, group: d.group as Group, donor: d.donor, donorName: d.donor_name ?? d.donor, government, bucket: bucketOf(config, view.card.status), amount: range ? [range[0], range[1], range[2]] : null });
  }
  return { rows, unattributed };
}

// ---------------------------------------------------------------------------------------------------------- rings

export type Kind = "all" | "group" | "donor" | "government" | "card";

/** A segment: the centre, a group, a donor, a government or one commitment. `r0`–`r1` are the rings it covers. */
export interface Node {
  id: string;
  kind: Kind;
  /** The name on the ring and in the list. */
  label: string;
  /** The name in full, for tooltips. */
  name: string;
  /** A shorter name, for the ring when the label does not fit, and for the centre. */
  short: string;
  r0: number;
  r1: number;
  rows: Row[];
  children: Node[];
  /** The ids of every segment it sits inside, the centre first. */
  path: string[];
  row?: Row;
}

const byMade = (a: Row, b: Row) => a.view.card.made_on.localeCompare(b.view.card.made_on) || a.view.id.localeCompare(b.view.id);
/** Within one donor or government: delivered first, as the legend reads, then by date. The same order for everyone. */
const byBucket = (a: Row, b: Row) => BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket) || byMade(a, b);
const shortName = (a: Actor, L: string) => (a.short_name?.[L] ?? a.name[L] ?? a.id) as string;
const fullName = (a: Actor, L: string) => (a.name[L] ?? a.id) as string;
const headline = (v: CardView, L: string) => v.card.headline?.[L] ?? v.id;

/**
 * Centre, groups (fixed order), donors (by number of commitments, then name), governments (only for a donor with
 * more than one, oldest first), commitments. A group with one donor is that donor (the EU, the United States), so
 * no name is drawn twice; a segment covers the rings below it that it skips, so every commitment is on the outer ring.
 * The same order in both sizing modes.
 */
export function tree(rows: readonly Row[], L: string): Node {
  const root: Node = { id: "all", kind: "all", label: "All donors", name: "Everything promised to Ukraine", short: "All donors", r0: 0, r1: 0, rows: [...rows], children: [], path: [] };
  const leaves = (rs: Row[], parent: Node): Node[] =>
    [...rs].sort(byBucket).map((r) => ({ id: `card:${r.view.id}`, kind: "card" as const, label: headline(r.view, L), name: headline(r.view, L), short: "", r0: 4, r1: 4, rows: [r], children: [], path: [...parent.path, parent.id], row: r }));
  /** A donor's (or a single-donor group's) inside: its governments when it has several, else its commitments. */
  const fill = (n: Node, rs: Row[]) => {
    const govs = [...new Set(rs.map((r) => r.government.id))];
    if (govs.length === 1) {
      n.r1 = 3;
      n.children = leaves(rs, n);
      return;
    }
    n.r1 = Math.max(n.r1, 2);
    n.children = govs
      .map((id) => rs.filter((r) => r.government.id === id).sort(byMade))
      .sort((a, b) => byMade(a[0]!, b[0]!))
      .map((gr) => {
        const gov = gr[0]!.government;
        const an: Node = { id: `gov:${gov.id}`, kind: "government", label: shortName(gov, L), name: fullName(gov, L), short: shortName(gov, L), r0: 3, r1: 3, rows: gr, children: [], path: [...n.path, n.id] };
        an.children = leaves(gr, an);
        return an;
      });
  };
  for (const g of GROUPS) {
    const inGroup = rows.filter((r) => r.group === g);
    if (!inGroup.length) continue;
    const gn: Node = { id: `group:${g}`, kind: "group", label: GROUP_NAMES[g], name: GROUP_NAMES[g], short: GROUP_SHORT[g], r0: 1, r1: 1, rows: inGroup, children: [], path: [root.id] };
    root.children.push(gn);
    const donors = [...new Set(inGroup.map((r) => r.donor))]
      .map((d) => inGroup.filter((r) => r.donor === d))
      .sort((a, b) => b.length - a.length || a[0]!.donorName.localeCompare(b[0]!.donorName));
    if (donors.length === 1) {
      fill(gn, inGroup);
      continue;
    }
    for (const dr of donors) {
      const govs = new Set(dr.map((r) => r.government.id));
      const short = govs.size === 1 ? shortName(dr[0]!.government, L) : dr[0]!.donorName;
      const dn: Node = { id: `donor:${dr[0]!.donor}`, kind: "donor", label: dr[0]!.donorName, name: dr[0]!.donorName, short, r0: 2, r1: 2, rows: dr, children: [], path: [...gn.path, gn.id] };
      fill(dn, dr);
      gn.children.push(dn);
    }
  }
  return root;
}

export type Mode = "count" | "amount";
const weight = (r: Row, mode: Mode) => (mode === "count" ? 1 : (r.amount?.[1] ?? 0));
const valueOf = (n: Node, mode: Mode) => n.rows.reduce((s, r) => s + weight(r, mode), 0);

export interface Placed {
  node: Node;
  a0: number;
  a1: number;
}

/** Angles from the top, clockwise, in radians: each segment shares its parent's angle by its value. */
export function layout(root: Node, mode: Mode): Placed[] {
  const out: Placed[] = [];
  const place = (n: Node, a0: number, a1: number) => {
    out.push({ node: n, a0, a1 });
    const v = valueOf(n, mode);
    let a = a0;
    for (const c of n.children) {
      const cv = valueOf(c, mode);
      if (cv <= 0) continue;
      const span = ((a1 - a0) * cv) / v;
      place(c, a, a + span);
      a += span;
    }
  };
  if (valueOf(root, mode) > 0) place(root, 0, 2 * Math.PI);
  return out;
}

/** The geometry, also written on the SVG for charts.js, so the script never repeats a number. */
export const GEOMETRY = { size: 400, centre: 62, outer: 198, band: 5, gap: 2, weights: [1, 1, 0.55, 0.62], font: 12 } as const;
const C = GEOMETRY.size / 2;

/** Inner and outer radius of each ring outside `depth` (0 for the whole picture), sharing the space by weight. */
export function ringBounds(depth: number): (ring: number) => [number, number] {
  const w = GEOMETRY.weights.slice(depth);
  const total = w.reduce((a, b) => a + b, 0);
  const edges = [GEOMETRY.centre as number];
  for (const x of w) edges.push(edges.at(-1)! + ((GEOMETRY.outer - GEOMETRY.centre) * x) / total);
  return (ring) => [edges[ring - depth - 1]!, edges[ring - depth]!];
}

const fx = (n: number) => String(Math.round(n * 100) / 100);
const pt = (r: number, a: number) => `${fx(C + r * Math.sin(a))} ${fx(C - r * Math.cos(a))}`;
const FULL = 2 * Math.PI - 1e-9;

/** A ring segment from angle a0 to a1 between radii ri and ro (a whole ring when it goes all the way round). */
export function arc(a0: number, a1: number, ri: number, ro: number): string {
  if (a1 - a0 >= FULL)
    return `M${pt(ro, 0)}A${fx(ro)} ${fx(ro)} 0 1 1 ${pt(ro, Math.PI)}A${fx(ro)} ${fx(ro)} 0 1 1 ${pt(ro, 0)}ZM${pt(ri, 0)}A${fx(ri)} ${fx(ri)} 0 1 0 ${pt(ri, Math.PI)}A${fx(ri)} ${fx(ri)} 0 1 0 ${pt(ri, 0)}Z`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(ro, a0)}A${fx(ro)} ${fx(ro)} 0 ${large} 1 ${pt(ro, a1)}L${pt(ri, a1)}A${fx(ri)} ${fx(ri)} 0 ${large} 0 ${pt(ri, a0)}Z`;
}

/**
 * Where a ring's name goes, the same rule as charts.js: along the curve (left to right in either half, so no label is
 * upside down) when it fits, or its short name; else along the radius when the segment is narrow but deep; else none.
 */
export function labelPlan(a0: number, a1: number, ri: number, ro: number, full: string, short: string): { text: string; d: string } | null {
  const f = GEOMETRY.font;
  const need = (s: string) => s.length * f * 0.6 + 14;
  const along = (a1 - a0) * ((ri + ro) / 2);
  const deep = ro - ri;
  const mid = (a0 + a1) / 2;
  if (deep >= f + 6)
    for (const text of [full, short])
      if (text && along >= need(text)) {
        const r = (ri + ro) / 2;
        const span = Math.min(a1 - a0, 2 * Math.PI - 0.02);
        const s = mid - span / 2;
        const e = mid + span / 2;
        const large = span > Math.PI ? 1 : 0;
        const d = Math.cos(mid) < 0 ? `M${pt(r, e)}A${fx(r)} ${fx(r)} 0 ${large} 0 ${pt(r, s)}` : `M${pt(r, s)}A${fx(r)} ${fx(r)} 0 ${large} 1 ${pt(r, e)}`;
        return { text, d };
      }
  if ((a1 - a0) * ri >= f + 4)
    for (const text of [full, short])
      if (text && deep >= need(text) - 6) return { text, d: Math.sin(mid) >= 0 ? `M${pt(ri, mid)}L${pt(ro, mid)}` : `M${pt(ro, mid)}L${pt(ri, mid)}` };
  return null;
}

export interface ChartContext {
  config: Config;
  w: Words;
  L: string;
  today: string;
  href: (id: string) => string;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const amountOf = (ctx: ChartContext, a: readonly [number, number, number]) => `${money(ctx.w, ctx.config, a[1])} (${money(ctx.w, ctx.config, a[0])} to ${money(ctx.w, ctx.config, a[2])})`;

/** The statuses that occur, in ladder order, with how many: the engine's labels. */
function statusTally(ctx: ChartContext, rows: readonly Row[]): { status: string; bucket: Bucket; n: number }[] {
  return ctx.config.ladder.statuses
    .map((s) => ({ status: s.id, bucket: bucketOf(ctx.config, s.id), n: rows.filter((r) => r.view.card.status === s.id).length }))
    .filter((s) => s.n);
}

/** "3 Delivering, 1 In plan, 2 Promised". */
export function statusCounts(ctx: ChartContext, rows: readonly Row[]): string {
  return statusTally(ctx, rows)
    .map((s) => `${s.n} ${statusLabel(ctx.config, s.status, ctx.L)}`)
    .join(", ");
}

/** The amounts stated, added up by end: the central figures together, and the low and high ends apart. */
export function amountText(ctx: ChartContext, rows: readonly Row[]): string {
  const costed = rows.filter((r) => r.amount);
  if (!costed.length) return "No amount stated";
  const a = [0, 1, 2].map((i) => sum(costed.map((r) => r.amount![i]!))) as [number, number, number];
  return `${amountOf(ctx, a)}${costed.length < rows.length ? `, for the ${costed.length} with an amount` : ""}`;
}

function tipOf(ctx: ChartContext, n: Node): string {
  if (n.row) {
    const r = n.row;
    return `${n.name}. ${fullName(r.government, ctx.L)}. ${statusLabel(ctx.config, r.view.card.status, ctx.L)}. ${r.amount ? amountOf(ctx, r.amount) : "No amount stated"}. Made ${longDate(ctx.w, r.view.card.made_on)}.`;
  }
  return `${n.name}: ${count(n.rows.length, "commitment", "commitments")}. ${statusCounts(ctx, n.rows)}. ${amountText(ctx, n.rows)}.`;
}

/** What the centre says when a segment is zoomed into: a short name, a figure and its unit, on three lines. */
function centre(ctx: ChartContext, n: Node, mode: Mode): Record<string, string> {
  return {
    "data-centre-label": n.short,
    "data-centre-value": mode === "count" ? String(n.rows.length) : money(ctx.w, ctx.config, sum(n.rows.map((r) => r.amount?.[1] ?? 0))),
    "data-centre-unit": mode === "count" ? (n.rows.length === 1 ? "commitment" : "commitments") : "central figures",
  };
}

const num = (n: number) => String(Math.round(n * 1e5) / 1e5);

/** One sizing mode of the rings, as an SVG; `thin` when a segment would be under 6px on a 320px screen. */
export function sunburstSvg(ctx: ChartContext, root: Node, mode: Mode): { svg: ReactNode; thin: boolean } {
  const placed = layout(root, mode);
  const ring = ringBounds(0);
  const phone = (320 - 32) / GEOMETRY.size;
  let thin = false;
  const segs: ReactNode[] = [];
  const bands: ReactNode[] = [];
  const paths: ReactNode[] = [];
  const labels: ReactNode[] = [];
  for (const { node: n, a0, a1 } of placed) {
    if (n === root) continue;
    const [ri] = ring(n.r0);
    const [, ro] = ring(n.r1);
    if ((a1 - a0) * ri * phone < 6) thin = true;
    const at = { "data-node": n.id, "data-path": n.path.join(" "), "data-a0": num(a0), "data-a1": num(a1), "data-r0": n.r0, "data-r1": n.r1 };
    const tip = tipOf(ctx, n);
    if (n.row) {
      segs.push(h("a", { key: n.id, href: ctx.href(n.row.view.id), className: "sb-link" }, h("path", { ...at, className: "sb-seg sb-seg--card", "data-kind": "seg", "data-bucket": n.row.bucket, d: arc(a0, a1, ri, ro) }, h("title", null, tip))));
      continue;
    }
    segs.push(
      h(
        "path",
        { key: n.id, ...at, ...centre(ctx, n, mode), className: `sb-seg sb-seg--inner sb-seg--r${n.r0}`, "data-kind": "seg", tabIndex: 0, role: "button", "aria-label": `Zoom into ${n.name}`, d: arc(a0, a1, ri, ro) },
        h("title", null, tip),
      ),
    );
    // Where its commitments stand, as a band along its outer edge: the same order as the commitments beneath it.
    const total = valueOf(n, mode);
    let a = a0;
    for (const b of BUCKETS) {
      const v = sum(n.rows.filter((r) => r.bucket === b).map((r) => weight(r, mode)));
      if (!v) continue;
      const b1 = a + ((a1 - a0) * v) / total;
      bands.push(h("path", { key: `${n.id}:${b}`, ...at, "data-a0": num(a), "data-a1": num(b1), className: "sb-band", "data-kind": "band", "data-bucket": b, d: arc(a, b1, ro - GEOMETRY.band, ro) }));
      a = b1;
    }
    // Its name, above the band: along the curve, or along the radius when the segment is narrow.
    const pid = `sb-${mode}-${n.id.replace(/[^a-z0-9]+/gi, "-")}`;
    const plan = labelPlan(a0, a1, ri, ro - GEOMETRY.band, n.label, n.short);
    paths.push(h("path", { key: pid, id: pid, ...at, "data-kind": "lpath", d: plan?.d ?? "M0 0" }));
    labels.push(
      h(
        "text",
        { key: `${pid}:t`, ...at, className: `sb-label sb-label--${n.kind}`, "data-kind": "label", "data-full": n.label, "data-short": n.short, "data-for": pid, visibility: plan ? undefined : "hidden", "aria-hidden": "true" },
        h("textPath", { href: `#${pid}`, startOffset: "50%" }, plan?.text ?? n.label),
      ),
    );
  }
  const c = centre(ctx, root, mode);
  const svg = h(
    "svg",
    {
      className: "sb-svg",
      viewBox: `0 0 ${GEOMETRY.size} ${GEOMETRY.size}`,
      "data-mode": mode,
      "data-geometry": JSON.stringify(GEOMETRY),
      role: "group",
      "aria-label": mode === "count" ? "Rings: every commitment the same size" : "Rings: sized by amount, in euros",
    },
    h("defs", null, paths),
    h("g", null, segs),
    h("g", { className: "sb-bands" }, bands),
    h("g", { className: "sb-labels" }, labels),
    h(
      "g",
      { className: "sb-centre", "data-node": root.id, ...c },
      h("circle", { cx: C, cy: C, r: GEOMETRY.centre - 4 }, h("title", null, tipOf(ctx, root))),
      h("text", { className: "sb-centre__label", x: C, y: C - 22 }, c["data-centre-label"]),
      h("text", { className: "sb-centre__value", x: C, y: C + 1 }, c["data-centre-value"]),
      h("text", { className: "sb-centre__unit", x: C, y: C + 23 }, c["data-centre-unit"]),
    ),
  );
  return { svg, thin };
}

/** A thin bar split by where the commitments stand: the panel's and the phone fallback's mark. */
function mixBar(ctx: ChartContext, rows: readonly Row[], mode: Mode, big = false): ReactNode {
  return h(
    "span",
    { className: `mixbar${big ? " mixbar--big" : ""}`, "aria-hidden": "true" },
    BUCKETS.map((b) => {
      const v = sum(rows.filter((r) => r.bucket === b).map((r) => weight(r, mode)));
      return v ? h("span", { key: b, className: "mixbar__part", "data-bucket": b, style: { flexGrow: v } }) : null;
    }),
  );
}

const KIND_WORD: Record<Kind, string> = { all: "Every donor", group: "Group", donor: "Donor", government: "Government", card: "Commitment" };

/**
 * The list beside the rings, as DaisyDisk lists a folder: one section per ring segment, the centre's shown. charts.js
 * shows the section of the segment hovered or zoomed into; with no script the centre's section and the table remain.
 */
function panel(ctx: ChartContext, root: Node, pill: (status: string) => ReactNode): ReactNode {
  const sections: ReactNode[] = [];
  const walk = (n: Node) => {
    if (n.row) return;
    const amount = amountText(ctx, n.rows);
    sections.push(
      h(
        "section",
        { key: n.id, className: "sb-panel__node", "data-panel": n.id, hidden: n !== root, "aria-label": n.name },
        h("p", { className: "sb-panel__kind" }, KIND_WORD[n.kind]),
        h("h3", null, n.name),
        h("p", { className: "sb-panel__sum" }, h("strong", null, count(n.rows.length, "commitment", "commitments")), " · ", amount),
        mixBar(ctx, n.rows, "count", true),
        h(
          "ul",
          { className: "sb-panel__tally" },
          statusTally(ctx, n.rows).map((s) => h("li", { key: s.status }, h("span", { className: "swatch", "data-bucket": s.bucket, "aria-hidden": "true" }), `${statusLabel(ctx.config, s.status, ctx.L)} `, h("strong", null, String(s.n)))),
        ),
        h(
          "ol",
          { className: "sb-panel__rows" },
          n.children.map((c) =>
            c.row
              ? h(
                  "li",
                  { key: c.id, "data-row": c.id },
                  h("a", { href: ctx.href(c.row.view.id), className: "sb-panel__card" }, h("span", { className: "swatch", "data-bucket": c.row.bucket, "aria-hidden": "true" }), h("span", { className: "sb-panel__name" }, c.label)),
                  h("span", { className: "sb-panel__meta" }, pill(c.row.view.card.status), c.row.amount ? ` ${money(ctx.w, ctx.config, c.row.amount[1])}` : ""),
                )
              : h(
                  "li",
                  { key: c.id, "data-row": c.id },
                  h("button", { type: "button", className: "sb-panel__zoom", "data-zoom": c.id }, h("span", { className: "sb-panel__name" }, c.label), h("span", { className: "sb-panel__count" }, String(c.rows.length))),
                  mixBar(ctx, c.rows, "count"),
                ),
          ),
        ),
      ),
    );
    n.children.forEach(walk);
  };
  walk(root);
  return h("aside", { className: "sb-panel", "aria-live": "polite" }, sections);
}

/** On a phone, when a ring segment would be too thin to see: one bar per group, split by where its commitments stand. */
function groupBars(ctx: ChartContext, root: Node, mode: Mode): ReactNode {
  return h(
    "ul",
    { className: "sb-bars" },
    root.children.map((g) => h("li", { key: g.id }, h("span", { className: "sb-bars__name" }, `${g.label}: ${mode === "count" ? count(g.rows.length, "commitment", "commitments") : centre(ctx, g, mode)["data-centre-value"]}`), mixBar(ctx, g.rows, mode, true))),
  );
}

const bucketText = (ctx: ChartContext, b: Bucket) => bucketStatuses(ctx.config, b).map((s) => statusLabel(ctx.config, s, ctx.L)).join(", ");

export function legend(ctx: ChartContext): ReactNode {
  return h(
    "ul",
    { className: "chart-legend", "aria-label": "Colours" },
    BUCKETS.map((b) => h("li", { key: b }, h("span", { className: "swatch", "data-bucket": b, "aria-hidden": "true" }), bucketText(ctx, b))),
  );
}

/** The rings in both sizing modes, and the list beside them. Switching modes is a radio button and CSS, with no script. */
export function sunburst(ctx: ChartContext, rows: readonly Row[], pill: (status: string) => ReactNode): ReactNode {
  const root = tree(rows, ctx.L);
  const byCount = sunburstSvg(ctx, root, "count");
  const byAmount = sunburstSvg(ctx, root, "amount");
  const costed = rows.filter((r) => r.amount).length;
  return h(
    "figure",
    { className: "sb", "aria-labelledby": "sb-caption" },
    h(
      "div",
      { className: "chart-bar" },
      h(
        "fieldset",
        { className: "chart-modes" },
        h("legend", null, "Size by"),
        h("input", { type: "radio", name: "sb-mode", id: "sb-mode-count", value: "count", defaultChecked: true }),
        h("label", { htmlFor: "sb-mode-count" }, "Count"),
        h("input", { type: "radio", name: "sb-mode", id: "sb-mode-amount", value: "amount", disabled: costed === 0 }),
        h("label", { htmlFor: "sb-mode-amount" }, "Amount (€)"),
      ),
      h("nav", { className: "sb-crumbs", "aria-label": "Zoom", hidden: true }),
    ),
    h(
      "div",
      { className: "sb-body" },
      h(
        "div",
        { className: "sb-rings" },
        h("div", { className: `sb-view sb-view--count${byCount.thin ? " sb-view--thin" : ""}` }, byCount.svg, groupBars(ctx, root, "count")),
        h(
          "div",
          { className: `sb-view sb-view--amount${byAmount.thin ? " sb-view--thin" : ""}` },
          byAmount.svg,
          groupBars(ctx, root, "amount"),
          h("p", { className: "chart-note" }, costed < rows.length ? `${count(rows.length - costed, "commitment states", "commitments state")} no amount and ${rows.length - costed === 1 ? "is" : "are"} left out here. ` : "", "Each counts at the central figure of its range."),
        ),
      ),
      panel(ctx, root, pill),
    ),
    legend(ctx),
    h("figcaption", { id: "sb-caption" }, "From the centre out: groups, donors, the US administrations, and each commitment. Point at a ring for its list; click to zoom in, and the centre to zoom out."),
  );
}

// ------------------------------------------------------------------------------------------------------- timeline

const START = "2022-02-24";
const US_SPLIT = "2025-01-20";
const DAY = 86_400_000;
const days = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

interface Mark {
  row: Row;
  made: number;
  deadline: number | null;
  /** Deadlines of earlier versions that a rewording moved. */
  moved: number[];
  missed: boolean;
  lane: number;
  slot: number;
}

/** Each commitment on its date, with its deadline; packed into slots so no two overlap in a lane. */
export function timelineMarks(ctx: ChartContext, rows: readonly Row[], gapPx: number, lengthPx: number): { marks: Mark[]; slots: number[]; end: number } {
  const marks: Mark[] = [];
  let end = days(ctx.today);
  for (const row of rows) {
    const versions = row.view.card.versions;
    const deadlineIso = row.view.current.parameters?.deadline ?? null;
    const deadline = deadlineIso ? days(deadlineIso) : null;
    const moved = [...new Set(versions.slice(0, -1).map((v) => v.parameters?.deadline).filter((d): d is string => !!d && d !== deadlineIso))].map(days);
    const made = days(row.view.card.made_on);
    end = Math.max(end, made, deadline ?? 0, ...moved);
    marks.push({ row, made, deadline, moved, missed: !!missedDeadline(row.view.card, ctx.config, ctx.today), lane: GROUPS.indexOf(row.group), slot: 0 });
  }
  end += 60;
  const minGap = (gapPx * (end - days(START))) / lengthPx;
  const slots = GROUPS.map(() => 0);
  for (let lane = 0; lane < GROUPS.length; lane++) {
    const ends: number[] = [];
    for (const m of marks.filter((m) => m.lane === lane).sort((a, b) => a.made - b.made || a.row.view.id.localeCompare(b.row.view.id))) {
      const last = Math.max(m.made, m.deadline ?? m.made, ...m.moved);
      let s = ends.findIndex((e) => e + minGap <= m.made);
      if (s < 0) s = ends.push(0) - 1;
      ends[s] = last;
      m.slot = s;
    }
    slots[lane] = ends.length;
  }
  return { marks, slots, end };
}

/**
 * The timeline as an SVG: across on a wide screen, down on a phone. One lane per group, the US lane shaded from
 * 20 January 2025; a deadline is a line from the promise to it, solid once ended, dashed while open, with a cross
 * where it passed with no delivery. A moved deadline shows its old end faintly.
 */
export function timelineSvg(ctx: ChartContext, rows: readonly Row[], across: boolean): ReactNode {
  const LENGTH = across ? 720 : 760;
  const AXIS = across ? 8 : 34;
  const HEAD = across ? 20 : 26;
  const SLOT = across ? 13 : 12;
  const PAD = 10;
  const start = days(START);
  const { marks, slots, end: endDay } = timelineMarks(ctx, rows, 14, LENGTH - AXIS - 16);
  const t = (d: number) => AXIS + ((d - start) / (endDay - start)) * (LENGTH - AXIS - 16);
  const laneSize = (i: number) => HEAD + Math.max(1, slots[i]!) * SLOT + PAD;
  const VLANE = (300 - AXIS) / GROUPS.length;
  const laneAt = GROUPS.map((_, i) => (across ? 18 + sum(GROUPS.slice(0, i).map((__, j) => laneSize(j))) : AXIS + i * VLANE));
  const breadth = across ? laneAt.at(-1)! + laneSize(GROUPS.length - 1) + 22 : 300;
  const TOP = across ? 0 : HEAD + 14;
  const slotAt = (lane: number, slot: number) => (across ? laneAt[lane]! + HEAD + slot * SLOT + SLOT / 2 : laneAt[lane]! + 10 + Math.min(slot, Math.floor((VLANE - 16) / SLOT)) * SLOT);
  // (time, offset across the lanes) → x, y
  const xy = (time: number, off: number) => (across ? { x: t(time), y: off } : { x: off, y: TOP + t(time) });
  const span = (t0: number, t1: number, o0: number, o1: number) => {
    const a = xy(t0, o0);
    const b = xy(t1, o1);
    return { x: fx(Math.min(a.x, b.x)), y: fx(Math.min(a.y, b.y)), width: fx(Math.abs(b.x - a.x)), height: fx(Math.abs(b.y - a.y)) };
  };
  const line = (t0: number, t1: number, off: number) => {
    const a = xy(t0, off);
    const b = xy(t1, off);
    return { x1: fx(a.x), y1: fx(a.y), x2: fx(b.x), y2: fx(b.y) };
  };
  const laneLo = (i: number) => (across ? laneAt[i]! : laneAt[i]!);
  const laneHi = (i: number) => (across ? laneAt[i]! + laneSize(i) - 2 : laneAt[i]! + VLANE);
  const bottom = across ? breadth - 22 : TOP + t(endDay);
  const grid: ReactNode[] = [];
  grid.push(h("text", { key: "start", className: "tl-year", ...(across ? { x: fx(t(start)), y: fx(bottom + 15) } : { x: AXIS - 4, y: fx(TOP + t(start) + 4), textAnchor: "end" }) }, across ? "24 Feb 2022" : "2022"));
  for (let y = 2023; days(`${y}-01-01`) < endDay; y++) {
    const d = days(`${y}-01-01`);
    grid.push(h("line", { key: `g${y}`, className: "tl-grid", ...(across ? { x1: fx(t(d)), x2: fx(t(d)), y1: 18, y2: fx(bottom) } : { x1: AXIS, x2: 300, y1: fx(TOP + t(d)), y2: fx(TOP + t(d)) }) }));
    grid.push(h("text", { key: `y${y}`, className: "tl-year", ...(across ? { x: fx(t(d)), y: fx(bottom + 15), textAnchor: "middle" } : { x: AXIS - 4, y: fx(TOP + t(d) + 4), textAnchor: "end" }) }, String(y)));
  }
  const today = days(ctx.today);
  const us = GROUPS.indexOf("us");
  const split = days(US_SPLIT);
  const lanes = GROUPS.map((g, i) => {
    const n = rows.filter((r) => r.group === g).length;
    return h(
      "g",
      { key: g, className: "tl-lane" },
      i === us ? h("rect", { className: "tl-admin", ...span(split, endDay, laneLo(i) + (across ? HEAD - 4 : 0), laneHi(i)) }) : null,
      h(
        "text",
        { className: "tl-lane__name", ...(across ? { x: fx(t(start)), y: fx(laneAt[i]! + 12) } : { x: fx(laneAt[i]! + VLANE / 2), y: 14, textAnchor: "middle" }) },
        across ? GROUP_NAMES[g] : GROUP_SHORT[g],
        h("tspan", { className: "tl-lane__count" }, n ? ` ${n}` : across ? " none recorded" : " 0"),
      ),
      across ? h("line", { className: "tl-lane__rule", x1: fx(t(start)), x2: fx(t(endDay)), y1: fx(laneHi(i)), y2: fx(laneHi(i)) }) : h("line", { className: "tl-lane__rule", x1: fx(laneHi(i)), x2: fx(laneHi(i)), y1: fx(TOP), y2: fx(bottom) }),
    );
  });
  const usSplit = h(
    "g",
    { className: "tl-split" },
    across
      ? h(Fragment, null, h("text", { x: fx(t(split) - 5), y: fx(laneAt[us]! + 12), textAnchor: "end" }, "Biden administration"), h("text", { x: fx(t(split) + 5), y: fx(laneAt[us]! + 12) }, "Trump administration"))
      : h(Fragment, null, h("text", { x: fx(laneAt[us]! + VLANE / 2), y: fx(TOP + t(split) - 4), textAnchor: "middle" }, "Biden ↑"), h("text", { x: fx(laneAt[us]! + VLANE / 2), y: fx(TOP + t(split) + 12), textAnchor: "middle" }, "Trump ↓")),
  );
  const todayMark = h(
    "g",
    { className: "tl-today" },
    h("line", across ? { x1: fx(t(today)), x2: fx(t(today)), y1: 4, y2: fx(bottom) } : { x1: AXIS, x2: 300, y1: fx(TOP + t(today)), y2: fx(TOP + t(today)) }),
    h("text", across ? { x: fx(t(today) - 4), y: 12, textAnchor: "end" } : { x: AXIS - 4, y: fx(TOP + t(today) + 4), textAnchor: "end" }, "Today"),
  );
  const drawn = marks.map((m) => {
    const off = slotAt(m.lane, m.slot);
    const tip = `${headline(m.row.view, ctx.L)}. ${fullName(m.row.government, ctx.L)}. ${statusLabel(ctx.config, m.row.view.card.status, ctx.L)}. Made ${longDate(ctx.w, m.row.view.card.made_on)}${m.deadline !== null ? `; due ${longDate(ctx.w, m.row.view.current.parameters!.deadline!)}${m.missed ? ", passed with no delivery" : ""}` : "; no deadline"}.`;
    const dot = xy(m.made, off);
    const end = m.deadline !== null ? xy(m.deadline, off) : null;
    return h(
      "a",
      { key: m.row.view.id, href: ctx.href(m.row.view.id), className: "tl-mark", "data-bucket": m.row.bucket },
      h("title", null, tip),
      m.moved.map((d, i) => h("line", { key: i, className: "tl-due tl-due--moved", ...line(m.made, d, off) })),
      end ? h("line", { className: `tl-due${m.row.bucket === "open" || m.row.bucket === "progress" ? " tl-due--open" : ""}`, ...line(m.made, m.deadline!, off) }) : null,
      end && m.missed ? h("path", { className: "tl-missed", d: `M${fx(end.x - 3)} ${fx(end.y - 3)}l6 6m0 -6l-6 6` }) : null,
      h("circle", { className: "tl-hit", cx: fx(dot.x), cy: fx(dot.y), r: 12 }),
      h("circle", { className: "tl-dot", cx: fx(dot.x), cy: fx(dot.y), r: 5 }),
    );
  });
  return h(
    "svg",
    {
      className: `tl-svg tl-svg--${across ? "across" : "down"}`,
      viewBox: across ? `0 0 ${LENGTH} ${fx(breadth)}` : `0 0 300 ${fx(bottom + 12)}`,
      role: "group",
      "aria-label": "Timeline: each commitment on the day it was made, with a line to its deadline",
    },
    h("g", null, grid),
    lanes,
    usSplit,
    todayMark,
    h("g", null, drawn),
  );
}

export function timeline(ctx: ChartContext, rows: readonly Row[]): ReactNode {
  const key = (cls: string, d: ReactNode) => h("svg", { viewBox: "0 0 30 10", "aria-hidden": "true" }, d ?? h("line", { className: `tl-key ${cls}`, x1: 1, x2: 29, y1: 5, y2: 5 }));
  return h(
    "figure",
    { className: "tl", "aria-labelledby": "tl-caption" },
    timelineSvg(ctx, rows, true),
    timelineSvg(ctx, rows, false),
    h(
      "ul",
      { className: "chart-legend chart-legend--lines", "aria-label": "Lines" },
      h("li", null, key("", null), "To its deadline, ended"),
      h("li", null, key("tl-due--open", null), "To its deadline, still open"),
      h("li", null, key("tl-due--moved", null), "Deadline before it moved"),
      h("li", null, key("", h("path", { className: "tl-missed", d: "M12 2l6 6m0 -6l-6 6" })), "Passed with no delivery"),
    ),
    h("figcaption", { id: "tl-caption" }, `From 24 February 2022. Each dot is a commitment on the day it was made, coloured as in the rings; the United States lane is shaded from ${longDate(ctx.w, US_SPLIT)}, when the Trump administration took office.`),
  );
}

// ---------------------------------------------------------------------------------------------------------- table

/** The text alternative: every row both charts draw, in the order of the rings. */
export function chartTable(ctx: ChartContext, rows: readonly Row[], pill: (status: string) => ReactNode): ReactNode {
  const ordered: Row[] = [];
  const walk = (n: Node) => (n.row ? ordered.push(n.row) : n.children.forEach(walk));
  walk(tree(rows, ctx.L));
  return h(
    "div",
    { className: "chart-table" },
    h(
      "table",
      null,
      h("caption", null, "Every commitment in the charts"),
      h("thead", null, h("tr", null, ["Group", "Donor", "Government", "Commitment", "Status", "Amount, EUR", "Made", "Due"].map((c) => h("th", { key: c, scope: "col" }, c)))),
      h(
        "tbody",
        null,
        ordered.map((r) =>
          h(
            "tr",
            { key: r.view.id },
            h("td", null, GROUP_NAMES[r.group]),
            h("td", null, r.donorName),
            h("td", null, shortName(r.government, ctx.L)),
            h("th", { scope: "row" }, h("a", { href: ctx.href(r.view.id) }, headline(r.view, ctx.L))),
            h("td", null, pill(r.view.card.status)),
            h("td", { className: "num" }, r.amount ? amountOf(ctx, r.amount) : "Not stated"),
            h("td", { className: "num" }, r.view.card.made_on),
            h("td", { className: "num" }, r.view.current.parameters?.deadline ?? "None"),
          ),
        ),
      ),
    ),
  );
}

/** Four figures over both charts: how many commitments, from how many donors, how much is stated, how many delivered. */
function figures(ctx: ChartContext, rows: readonly Row[]): ReactNode {
  const costed = rows.filter((r) => r.amount);
  const delivered = rows.filter((r) => r.bucket === "delivered").length;
  const progress = rows.filter((r) => r.bucket === "progress").length;
  const tile = (label: string, value: string, sub: string) => h("div", { key: label, className: "figure-tile" }, h("dt", null, label), h("dd", null, h("span", { className: "figure-tile__value" }, value), h("span", { className: "figure-tile__sub" }, sub)));
  return h(
    "dl",
    { className: "figure-tiles" },
    tile("Commitments", String(rows.length), "since 24 February 2022"),
    tile("Donors", String(new Set(rows.map((r) => r.donor)).size), `in ${new Set(rows.map((r) => r.group)).size} groups`),
    tile("Amounts stated", money(ctx.w, ctx.config, sum(costed.map((r) => r.amount![1]))), `central figures of ${costed.length}`),
    tile("Delivered", String(delivered), `${progress} more under way`),
  );
}

/** Both charts, the table and where the figures come from: the home page's opening section. */
export function charts(ctx: ChartContext, views: readonly CardView[], pill: (status: string) => ReactNode): ReactNode {
  const { rows, unattributed } = chartRows(views, ctx.config);
  if (!rows.length) return null;
  return h(
    Fragment,
    null,
    figures(ctx, rows),
    h("section", { className: "chart-section", "aria-labelledby": "sb-h" }, h("h2", { id: "sb-h" }, "Who has promised what"), sunburst(ctx, rows, pill)),
    h("section", { className: "chart-section", "aria-labelledby": "tl-h" }, h("h2", { id: "tl-h" }, "When, and by when"), timeline(ctx, rows)),
    h("details", { className: "chart-details" }, h("summary", null, `Both charts as a table (${count(rows.length, "commitment", "commitments")})`), chartTable(ctx, rows, pill)),
    h(
      "p",
      { className: "chart-note" },
      "Amounts are each card's own figure in euros, with its source and the exchange rate on the card. For what each donor has delivered, compare the ",
      h("a", { href: "https://www.kielinstitut.de/topics/war-against-ukraine/ukraine-support-tracker/" }, "Kiel Institute's Ukraine Support Tracker"),
      ".",
      unattributed.length ? ` ${count(unattributed.length, "commitment names", "commitments name")} no government that must deliver it, so the charts leave ${unattributed.length === 1 ? "it" : "them"} out.` : "",
    ),
  );
}
