# Design brief: the whole picture of what is promised to Ukraine

Asked for by Pavel Guzhikov on 20 October 2026: "a big timeline or a pie like DaisyDisk with promises and commitments (EU, European countries, US, different administrations, other countries)". Two views of the same cards, both on the home page, both built at build time from published cards only.

## 1. The rings (a sunburst, as DaisyDisk draws a disk)

From the centre out:

| Ring | What a segment is | Comes from |
|---|---|---|
| Centre | Everything promised to Ukraine since 24 February 2022 | all published cards |
| 1 | A group: **EU**, **European countries**, **United States**, **other countries** | `x.group` of the card's `responsible` actor |
| 2 | A donor: the EU, Germany, the UK, Japan… | `x.donor` / `x.donor_name` of that actor |
| 3 | For a donor with more than one government: the government (US: Biden administration, Trump administration); others skip this ring | the `responsible` actor itself |
| 4 | One commitment | the card |

- **Size of a segment.** Two modes, switchable, with the same layout:
  - *By count* (default): every commitment the same size. Always available, never misleading about money.
  - *By amount*: the central figure of the card's cost (`cost.range[1]`, EUR bn). Cards with no cost are left out of this mode and the page says how many. Never sum a range's low and high ends into one figure; the tooltip shows the range.
- **Colour of a segment** = the card's status category, from the engine: open, progress, finished (split into delivered and not met), off ladder. Use the engine's status tokens (`--op-*` in `@openpromises/react/styles.css`); the same colours in light and dark. A donor ring segment is coloured by the mix of its commitments (or neutral grey with a small status bar under the label).
- **Reading it.** Hover or focus a segment: its name, how many commitments, where they stand, the amount range. Click: zoom into that segment (as DaisyDisk does), with a breadcrumb back to the centre. Every commitment segment links to its card.
- **One standard.** The order of groups is fixed (EU, European countries, United States, other countries); donors within a group by size, then name; never ordered by status. No donor is highlighted.

## 2. The timeline

- One horizontal (desktop) or vertical (phone) axis from 24 February 2022 to today, with each commitment at its `made_on` date, one lane per group (EU, European countries, United States, other countries).
- A US lane is split at 20 January 2025 by a labelled line: Biden administration before, Trump administration after.
- Each mark is coloured by status; a commitment with a deadline draws a line from `made_on` to the deadline, solid when delivered, dashed while open, ending in a marker when the deadline passed without delivery (the engine's `deadline_missed`).
- A moved deadline (`reworded` with `deadline_moved`) shows both ends: the old one faint, the new one solid.

## 3. Rules every view keeps

- **Text alternative.** Each chart has a table view (group, donor, government, commitment, status, amount) and works without JavaScript as a static SVG with that table under it; scripts add zoom and tooltips only.
- **Phone first.** Readable at 320px; the sunburst becomes a stacked bar per group if a ring segment would be under 6px.
- **Neutral words.** Labels are the engine's ("Delivered", "Not met"); no adjectives anywhere on the chart.
- **Sources visible.** Under the charts: where the amounts come from (each card's own cost sources) and how delivered amounts compare with the Kiel Institute's Ukraine Support Tracker, linked.
- **Dark mode** by the reader's setting, tokens on `:root`, as the engine's stylesheet does.

## 4. What the data needs

Every government or union actor carries `x: { donor, donor_name, group }` (checked by the schema in `openpromises.config.ts`). A card's `responsible` names the government that must deliver it: for the US, `us-biden-administration` or `us-trump-administration`. That is all the charts read; nothing is entered twice.

## 5. As built (20 October 2026), and where it departs from the brief

Built in `scripts/charts.ts` (static SVG and HTML at build time) and `scripts/charts.js` (zoom, hover and tooltips only). Points marked **choice** are open for Pavel to keep or change.

- **A list beside the rings**, as DaisyDisk lists a folder: the segment pointed at or zoomed into, with how many commitments, the amounts stated, the statuses in the engine's words, and its contents (each commitment linked to its card). Every list is in the HTML, so with no script the centre's list shows.
- **One ring, not two, when a group has one donor** (the EU, the United States): its name is drawn once. **Choice.**
- **Within a donor or government, commitments go delivered first, then under way, promised, not met** (the legend's order), then by date, so each donor's slice reads as one block and the band under its name matches it. Groups and donors are never ordered by status. **Choice.**
- **Names run along the curve**, or along the radius when a slice is narrow, or are left to the list and tooltip when neither fits.
- **Four figures above the charts**: commitments, donors, the amounts stated (central figures added up, for the cards that have one) and how many are delivered. Instruments that feed each other (the €90bn loan pays partly through the Ukraine Facility) can count twice in that sum. **Choice.**
- **The timeline runs past today to the latest deadline**, with a line at today, so future deadlines have room. **Choice** (the brief says "to today").
- **The US lane is shaded from 20 January 2025** rather than cut by a line, with each administration named above it.
