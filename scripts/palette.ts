/**
 * The colours the build draws with: the mark, the favicon and the share images. The pages themselves take the
 * engine's tokens (`--op-*` in @openpromises/react/styles.css); these match them.
 *
 * Dark is Pavel Guzhikov's dark brown (as on USLedger.org): page #241f1a, text #efe7da at about 13:1, amber accent,
 * blue only where it carries meaning (the top of the ladder). A promise's bar on the climb chart is as tall as the
 * step it has reached, so the height says how far it has gone and the colour only repeats it: `bar` for a step on the
 * way, `good` for the top, `bad` for an ending.
 */

export interface Mode {
  bg: string;
  lineStrong: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  good: string;
  bad: string;
  /** A promise's bar on the climb chart, the filled part of its meter, and the mark's dot. */
  bar: string;
  /** An unreached step on a meter, and the chart's grid. */
  grid: string;
}

export const light: Mode = {
  bg: "#ffffff",
  lineStrong: "#c9bba4",
  ink: "#1f1a14",
  muted: "#5b5245",
  faint: "#665d50",
  accent: "#2a55c9",
  good: "#1a6e3f",
  bad: "#b3261e",
  bar: "#9c6626",
  grid: "#e6dccb",
};

export const dark: Mode = {
  bg: "#241f1a",
  lineStrong: "rgba(239,231,218,.16)",
  ink: "#efe7da",
  muted: "#c0b5a4",
  faint: "#a59a88",
  accent: "#e2b26f",
  good: "#8aa3ec",
  bad: "#ec9286",
  bar: "#e2b26f",
  grid: "#3a3229",
};
