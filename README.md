# UkraineLedger.com

**What is promised to Ukraine, by every government and the EU: the exact words, the deadline, the cost, and a timeline that moves only on evidence.**

Since the full-scale invasion of 24 February 2022, governments have committed weapons, money, sanctions, security guarantees and deadlines for peace. This site keeps each commitment as said, with what has happened since, and draws them all as one picture: the EU, European countries, the United States (the Biden and Trump administrations apart) and other countries ([docs/DESIGN_BRIEF.md](docs/DESIGN_BRIEF.md)).

It runs on [OpenPromises](https://github.com/xternal/openpromises) 0.13, the engine behind [LedgerGov.UK](https://ledgergov.uk), [BoroughBook.UK](https://boroughbook.uk) and [RussiaLedger.com](https://russialedger.com), with the same rules:

1. **Exact words.** A commitment is what the speaker or the agreement said, with a link to it. Opinions about the war, its leaders or its causes are not commitments.
2. **Evidence moves status.** Every step after "promised" links to its document: a signed agreement, a delivery, a sanctions designation, a law, an appropriation. A deadline that passes with no evidence of delivery is recorded automatically (`openpromises deadlines`).
3. **Nothing is rewritten.** A moved deadline is a new version beside the old one. Our own mistakes are corrections, listed on the card.
4. **Numbers carry their source.** An amount is a range in euros, with who made it; a commitment in dollars or pounds gives its own figure and the rate in the note.
5. **One standard.** The same rules, words and colours for every donor. `openpromises lint` refuses judgement words in our own text.
6. **Every area, empty ones too.** The eight areas (talks, sanctions, weapons, money and deals, security guarantees, intelligence, humanitarian, membership) were fixed before the first card.

## Why this site

Checked on 20 October 2026: the [Kiel Institute's Ukraine Support Tracker](https://www.kielinstitut.de/topics/war-against-ukraine/ukraine-support-tracker/) counts the aid each donor commits and delivers, and [PolitiFact's MAGA-Meter](https://www.politifact.com/truth-o-meter/promises/maga-meter-tracking-donald-trumps-2024-promises/) rates Donald Trump's campaign promises. None of them keeps what each government said it would do for Ukraine, in its words, with the deadline it gave and the evidence since, as open data with a history that only grows.

## Run it

Node 22.18 or later and pnpm 12.

```bash
pnpm install
pnpm validate        # every card, draft, actor and the editors list against format v1
pnpm lint:words      # judgement words in our own text
pnpm test            # what the page counter counts (edge/)
pnpm build           # the static site in public/, published cards only
pnpm preview         # the same with drafts, in public-preview/, never deployed
```

## Where things stand (21 October 2026)

- Live at [ukraineledger.com](https://ukraineledger.com), deployed by Vercel from `main`.
- 32 published commitments: the EU, ten governments and the two US administrations. They include the 2024 bilateral security agreements, the EU's Ukraine Facility and €90bn loan, the G7's ERA loans and the Trump administration's statements. Each quote is machine-checked against its source (`content/quotes.json`). Each card carries an automated check and Pavel Guzhikov's approval.
- The home page shows the rings, the timeline and a table of every commitment (`docs/DESIGN_BRIEF.md`). Every page has its own share image (`scripts/share-image.ts`) and the mark (`scripts/mark.ts`).
- Page views are counted on the host (`edge/count.ts`, Routing Middleware): one number per page per UTC day in Upstash Redis, nothing about readers, with crawlers and previews skipped. The totals for the last 30 days are public at `/views.json`, in the same format as the sister sites', and Pavel's visits report (the `site-visits` repository) reads them. Without the store connected, nothing is counted and `/views.json` lists no days.

## Open decisions

- **Ukrainian.** English only for now; the engine's built-in words are in English and Russian, so a Ukrainian edition needs every label in Ukrainian.
- **Where to start among donors.** Signed documents first (they hold exact words and dates) or the largest donors by Kiel's amounts.

## Licence

Code: [AGPL-3.0](LICENSE). Our writing (headlines, notes, events): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Quotes keep their own terms, named beside each source.

Made by [Pavel Guzhikov](https://guzh.uk).
