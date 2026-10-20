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
pnpm build           # the static site in public/, published cards only
pnpm preview         # the same with drafts, in public-preview/, never deployed
```

## Where things stand (20 October 2026)

- 10 draft commitments by the Trump administration (President Trump, Vice President Vance, Secretary Rubio), each quote machine-checked against its source: all 12 exact. `content/quotes.json` holds the checks.
- Actors: the US officials with their roles from official pages, and the two US administrations as separate governments of one donor.
- Next: the EU, European countries and other donors, starting with signed documents (the bilateral security agreements of 2024, the EU's Ukraine Facility, the G7's ERA loans), then the charts in the design brief.

## Open decisions

- **Ukrainian.** English only for now; the engine's built-in words are in English and Russian, so a Ukrainian edition needs every label in Ukrainian.
- **Where to start among donors.** Signed documents first (they hold exact words and dates) or the largest donors by Kiel's amounts.

## Licence

Code: [AGPL-3.0](LICENSE). Our writing (headlines, notes, events): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Quotes keep their own terms, named beside each source.

Made by [Pavel Guzhikov](https://guzh.uk).
