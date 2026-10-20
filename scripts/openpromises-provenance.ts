/**
 * Checks where each installed OpenPromises package came from (OpenPromises decision 32; D16 here). Those packages
 * install as soon as they are published, without pnpm's one-day wait, so CI makes sure each one was built by the
 * engine's own Release workflow, from the tag of its own version, in github.com/xternal/openpromises. `npm audit
 * signatures` (run before this in CI) verifies the signatures on the registry's attestations; this reads the signed
 * provenance and checks what it says, and that it covers the very tarball the registry serves.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
export const SOURCE = { repository: "https://github.com/xternal/openpromises", path: ".github/workflows/release.yml" } as const;

interface Statement {
  subject: { name: string; digest: { sha512?: string } }[];
  predicate: { buildDefinition?: { externalParameters?: { workflow?: { repository?: string; path?: string; ref?: string } } } };
}

/** What is wrong with one package's provenance, or nothing. `integrity` is the registry's "sha512-<base64>". */
export function provenanceProblems(name: string, version: string, integrity: string, statements: readonly Statement[]): string[] {
  const slsa = statements.find((s) => s.predicate?.buildDefinition);
  if (!slsa) return [`${name}@${version} has no build provenance`];
  const wf = slsa.predicate.buildDefinition?.externalParameters?.workflow ?? {};
  const out: string[] = [];
  if (wf.repository !== SOURCE.repository) out.push(`${name}@${version} was built from ${wf.repository ?? "an unknown repository"}, not ${SOURCE.repository}`);
  if (wf.path !== SOURCE.path) out.push(`${name}@${version} was built by ${wf.path ?? "an unknown workflow"}, not ${SOURCE.path}`);
  if (wf.ref !== `refs/tags/v${version}`) out.push(`${name}@${version} was built from ${wf.ref ?? "an unknown ref"}, not refs/tags/v${version}`);
  const hex = Buffer.from(integrity.replace(/^sha512-/, ""), "base64").toString("hex");
  if (!slsa.subject.some((s) => s.digest.sha512 === hex)) out.push(`${name}@${version}: the provenance does not cover the tarball the registry serves`);
  return out;
}

async function main() {
  const dir = join(ROOT, "node_modules", "@openpromises");
  const problems: string[] = [];
  const names = readdirSync(dir).sort();
  for (const short of names) {
    const name = `@openpromises/${short}`;
    const { version } = JSON.parse(readFileSync(join(dir, short, "package.json"), "utf8")) as { version: string };
    const meta = (await (await fetch(`https://registry.npmjs.org/${name.split("/").join("%2f")}/${version}`)).json()) as { dist: { integrity: string } };
    const att = (await (await fetch(`https://registry.npmjs.org/-/npm/v1/attestations/${name.split("/").join("%2f")}@${version}`)).json()) as {
      attestations?: { predicateType: string; bundle: { dsseEnvelope: { payload: string } } }[];
    };
    const statements = (att.attestations ?? [])
      .filter((a) => a.predicateType.includes("slsa.dev/provenance"))
      .map((a) => JSON.parse(Buffer.from(a.bundle.dsseEnvelope.payload, "base64").toString("utf8")) as Statement);
    problems.push(...provenanceProblems(name, version, meta.dist.integrity, statements));
  }
  for (const p of problems) console.error(p);
  console.log(`OpenPromises provenance: ${names.length} packages checked, ${problems.length} problems.`);
  if (problems.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
