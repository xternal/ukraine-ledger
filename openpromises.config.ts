import { z } from "zod";
import { defineConfig } from "@openpromises/core";

/**
 * UkraineLedger.com on the OpenPromises engine (github.com/xternal/openpromises), started on 20 October 2026: what
 * is promised to Ukraine by every government and the European Union, since the full-scale invasion of 24 February
 * 2022. Each commitment is a card in the speaker's exact words, with its deadline, its cost and a timeline that
 * moves only on evidence; the home page draws them all as one picture, donor by donor (docs/DESIGN_BRIEF.md).
 *
 * Its sisters are LedgerGov.UK, BoroughBook.UK, RussiaLedger.com and USLedger.org, and the rules are the same.
 * `publish.tag` is fixed on the first deploy and never changes after, or every feed reader sees every entry again.
 */

/** Who a government or union is in the picture: the donor it acts for, and its ring (decision D2 in docs/DECISIONS.md). */
const donor = z.strictObject({
  /** One donor across governments: "united-states" for both the Biden and the Trump administrations. */
  donor: z.string().regex(/^[a-z0-9-]+$/),
  donor_name: z.string().min(1),
  group: z.enum(["eu", "europe", "us", "other"]),
});

export default defineConfig({
  site: {
    name: "UkraineLedger.com",
    url: "https://ukraineledger.com",
    description: {
      en: "What is promised to Ukraine, by every government and the EU: the exact words, the deadline, the cost, and a timeline that moves only on evidence.",
    },
  },
  content: "content",
  timezone: "Europe/Kyiv",
  locales: { default: "en", all: ["en"] },
  // Euros, as the Kiel Institute's Ukraine Support Tracker counts them, so delivered amounts compare like with like.
  // A commitment made in another currency gives its own figure in the note and the rate used.
  money: { currency: "EUR", unit: "bn", period: "total", qualities: ["sourced", "approx", "modelled"], costedBy: "required" },
  actors: {
    kinds: ["person", "party", "government", "union", "legislature"],
    standing: "manual",
    // Who must deliver is a government, the EU or a legislature, never a person or a party (decision 14).
    responsible: ["government", "union", "legislature"],
    responsibleRequired: true,
    ids: { bioguide_id: "https://bioguide.congress.gov/search/bio/{id}" },
  },
  venues: ["agreement", "summit", "platform", "campaign_rally", "debate", "interview", "speech", "press_conference", "social", "executive_order", "statement", "testimony", "parliament"],
  areas: {
    kind: "enum",
    // What a government can do about a war, fixed before the first card so the list is never fitted to the cards.
    values: ["negotiations", "sanctions", "weapons", "money_and_deals", "security_guarantees", "intelligence", "humanitarian", "membership"],
    labels: {
      negotiations: { en: "Talks, ceasefire and peace" },
      sanctions: { en: "Sanctions and tariffs on Russia" },
      weapons: { en: "Weapons and military aid" },
      money_and_deals: { en: "Money, minerals and reconstruction" },
      security_guarantees: { en: "Security guarantees" },
      intelligence: { en: "Intelligence sharing" },
      humanitarian: { en: "Prisoners, children, refugees and civilians" },
      membership: { en: "EU and NATO membership" },
    },
    // Published area URLs: never change a slug.
    slugs: {
      negotiations: "talks-ceasefire-peace",
      sanctions: "sanctions",
      weapons: "weapons",
      money_and_deals: "money-minerals-reconstruction",
      security_guarantees: "security-guarantees",
      intelligence: "intelligence",
      humanitarian: "prisoners-children-refugees-civilians",
      membership: "eu-nato-membership",
    },
  },
  ladder: "national",
  // One editor, who approves every card before it is published (decisions 22 and 27). The editor declares no party.
  editorial: { approvals: 1, publish: "approved", partyConflict: true },
  quotes: {
    archive: "optional",
    require: "editor",
    licences: [
      {
        hosts: ["whitehouse.gov", "state.gov", "defense.gov", "war.gov", "treasury.gov", "usmission.gov", "congress.gov", "govinfo.gov", "federalregister.gov"],
        name: "US government work, public domain (17 U.S.C. § 105)",
      },
      { hosts: ["gov.uk", "parliament.uk"], name: "Open Government Licence v3.0" },
      { hosts: ["europa.eu"], name: "© European Union, reuse authorised (Commission Decision 2011/833/EU)" },
    ],
    otherLicence: "Quoted for reporting; rights stay with the publisher",
  },
  publish: {
    tag: "ukraineledger.com,2026",
    feeds: "atom",
    licence: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  },
  x: { actor: z.strictObject({ ...donor.partial().shape, unverified: z.array(z.string()).optional() }) },
});
