/**
 * Share images: one 1200x630 PNG for every page, drawn from the page's own content, so a shared promise shows its
 * words and where it stands rather than a logo. Drawn with satori (layout and text to SVG) and resvg (SVG to PNG),
 * in the dark-brown palette, with the site's fonts (Source Serif 4 and Inter, both under the SIL Open Font Licence).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import { createElement as h, type ReactNode } from "react";
import satori from "satori";
import { markOnDark } from "./mark.ts";
import { dark as c } from "./palette.ts";

export const WIDTH = 1200;
export const HEIGHT = 630;

/** One promise's place on the ladder: `step` is its index on the climb (0 = promised), or -1 off the ladder. */
export interface Climb {
  n: number;
  step: number;
  /** "progress" and the rest from the engine's categories, "top" for the ladder's last step, "ended" for an ending. */
  kind: "open" | "progress" | "top" | "ended" | "off";
}

export type Share =
  | { kind: "promise"; kicker: string; headline: string; words: string; steps: string[]; step: number; status: string; note?: string; latest?: string; footer: string }
  | { kind: "chart"; kicker: string; title: string; climb: Climb[]; steps: string[]; tally: string; footer: string }
  | { kind: "page"; kicker: string; title: string; sub: string; footer: string };

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`));
let fonts: Parameters<typeof satori>[1]["fonts"] | undefined;
const loadFonts = () =>
  (fonts ??= [
    { name: "Serif", data: font("@fontsource/source-serif-4", "source-serif-4-latin-600-normal.woff"), weight: 600, style: "normal" },
    { name: "Sans", data: font("@fontsource/inter", "inter-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Sans", data: font("@fontsource/inter", "inter-latin-600-normal.woff"), weight: 600, style: "normal" },
  ]);

/** Cut text to about `max` characters at a word, with an ellipsis, so it fits its lines. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1).replace(/\s+\S*$/, "");
  return `${cut.replace(/[\s,;:.–-]+$/, "")}…`;
}

const MARK = `data:image/svg+xml;base64,${Buffer.from(markOnDark(46)).toString("base64")}`;
const box = (style: Record<string, unknown>, ...children: ReactNode[]) => h("div", { style: { display: "flex", ...style } }, ...children);
const text = (style: Record<string, unknown>, s: string) => h("div", { style: { display: "flex", ...style } }, s);

function frame(kicker: string, footer: string, ...body: ReactNode[]) {
  return box(
    { width: WIDTH, height: HEIGHT, flexDirection: "column", justifyContent: "space-between", padding: "56px 64px", background: c.bg, color: c.ink, fontFamily: "Sans" },
    box(
      { justifyContent: "space-between", alignItems: "center", gap: 24 },
      box(
        { alignItems: "center", gap: 14 },
        h("img", { src: MARK, width: 46, height: 46 }),
        box({ alignItems: "baseline" }, text({ fontFamily: "Serif", fontSize: 34, fontWeight: 600, color: c.ink }, "UkraineLedger"), text({ fontFamily: "Serif", fontSize: 34, fontWeight: 600, color: c.accent }, ".com")),
      ),
      text({ fontSize: 24, color: c.muted, textAlign: "right" }, kicker),
    ),
    box({ flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 22 }, ...body),
    text({ fontSize: 22, color: c.faint }, footer),
  );
}

/** The ladder as six segments with their names under them, filled up to the promise's step. */
function meter(steps: string[], step: number, status: string, note?: string) {
  if (step < 0) {
    return box(
      { flexDirection: "column", gap: 10, padding: "18px 24px", border: `2px dashed ${c.faint}`, borderRadius: 10 },
      text({ fontSize: 30, fontWeight: 600, color: c.ink }, status),
      note ? text({ fontSize: 22, color: c.muted }, note) : null,
    );
  }
  const top = step === steps.length - 1;
  return box(
    { gap: 8 },
    ...steps.map((s, i) =>
      box(
        { flexDirection: "column", gap: 10, flexGrow: 1, flexBasis: 0 },
        box({ height: 18, borderRadius: 4, background: i <= step ? (top ? c.good : c.bar) : c.grid }),
        text({ fontSize: 21, fontWeight: i === step ? 600 : 400, color: i === step ? c.ink : c.faint }, s),
      ),
    ),
  );
}

/** Every commitment as a bar, as tall as the step it has reached. */
function chart(climb: Climb[], steps: string[]) {
  const row = 34;
  return box(
    { gap: 18, alignItems: "flex-end" },
    box(
      { flexDirection: "column-reverse", width: 150 },
      ...steps.map((s) => text({ height: row, alignItems: "center", fontSize: 19, color: c.faint }, s)),
    ),
    box(
      { flexGrow: 1, gap: 8, alignItems: "flex-end", borderBottom: `2px solid ${c.lineStrong}`, height: row * steps.length },
      ...climb.map((b) =>
        box(
          { flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flexGrow: 1, flexBasis: 0, height: row * steps.length },
          b.kind === "off"
            ? box({ width: "100%", height: row - 6, border: `2px dashed ${c.faint}`, borderRadius: 4 })
            : box({ width: "100%", height: row * (b.kind === "ended" ? 1 : b.step + 1) - 6, borderRadius: 4, background: b.kind === "top" ? c.good : b.kind === "ended" ? c.bad : c.bar }),
        ),
      ),
    ),
  );
}

function numbers(climb: Climb[]) {
  return box({ gap: 18 }, box({ width: 150 }), box({ flexGrow: 1, gap: 8 }, ...climb.map((b) => text({ flexGrow: 1, flexBasis: 0, justifyContent: "center", fontSize: 18, color: c.muted }, String(b.n)))));
}

function tree(s: Share) {
  if (s.kind === "promise")
    return frame(
      s.kicker,
      s.footer,
      text({ fontFamily: "Serif", fontSize: 64, fontWeight: 600, lineHeight: 1.05, letterSpacing: -1 }, clip(s.headline, 60)),
      box({ borderLeft: `6px solid ${c.accent}`, paddingLeft: 22 }, text({ fontSize: 28, fontWeight: 600, lineHeight: 1.3, color: c.muted, letterSpacing: 0.5 }, `“${clip(s.words, 150)}”`)),
      box({ height: 8 }),
      meter(s.steps, s.step, s.status, s.note),
      s.latest ? text({ fontSize: 23, lineHeight: 1.35, color: c.muted }, clip(s.latest, 130)) : null,
    );
  if (s.kind === "chart")
    return frame(
      s.kicker,
      s.footer,
      text({ fontFamily: "Serif", fontSize: 50, fontWeight: 600, lineHeight: 1.1, letterSpacing: -0.5 }, clip(s.title, 90)),
      box({ flexDirection: "column", gap: 8 }, chart(s.climb, s.steps), s.climb.some((b) => b.n) ? numbers(s.climb) : null),
      text({ fontSize: 23, color: c.muted }, s.tally),
    );
  return frame(
    s.kicker,
    s.footer,
    text({ fontFamily: "Serif", fontSize: 70, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1 }, clip(s.title, 70)),
    text({ fontSize: 30, lineHeight: 1.35, color: c.muted }, clip(s.sub, 170)),
  );
}

export async function shareImage(s: Share): Promise<Buffer> {
  const svg = await satori(tree(s) as Parameters<typeof satori>[0], { width: WIDTH, height: HEIGHT, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
}
