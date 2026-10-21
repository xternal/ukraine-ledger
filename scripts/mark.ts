/**
 * The site's mark: a signature on a line, and a dot after it. A commitment is something a government signs up to, in
 * its own hand; the dot is each step since, which is what this site records.
 * Chosen by Pavel Guzhikov on 21 October 2026 from three sketches ("logo C").
 *
 * Drawn on a 32-unit grid. Small sizes (the favicon) use heavier lines so the mark still reads at 16 px.
 */
import { dark, light } from "./palette.ts";

/** The line the signature stands on, and the signature. */
export const MARK_PATH = "M4.5 25.5H21.5M5.5 19.5C7.5 12 11 10 11.5 15.5S13.5 21.5 16 15.5S20.5 10 21.5 17";
/** The dot after the line. */
export const MARK_DOT = { cx: 26.3, cy: 25.5 };

/** The mark's lines and its dot, as SVG elements, in the given colours. */
export function markShapes(ink: string, dot: string, heavy = false): string {
  return `<path d="${MARK_PATH}" fill="none" stroke="${ink}" stroke-width="${heavy ? 3 : 2.6}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="${heavy ? 2.8 : 2.6}" fill="${dot}"/>`;
}

/** A standalone mark, for the share images: cream lines and an amber dot, for a dark background. */
export function markOnDark(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${markShapes(dark.ink, dark.bar)}</svg>`;
}

/** The favicon: heavier lines, ink on light screens and cream in dark mode. */
export function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.i{stroke:${light.ink}}.d{fill:${light.bar}}@media (prefers-color-scheme:dark){.i{stroke:${dark.ink}}.d{fill:${dark.bar}}}</style><path class="i" d="${MARK_PATH}" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle class="d" cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="2.8"/></svg>\n`;
}

/** An icon on a solid square (the home-screen icon and the PNG favicon), with room around the mark. */
export function tileSvg(size: number, heavy: boolean): string {
  const pad = size * 0.16;
  const s = (size - 2 * pad) / 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${light.bg}"/><g transform="translate(${pad} ${pad}) scale(${s})">${markShapes(light.ink, light.bar, heavy)}</g></svg>`;
}
