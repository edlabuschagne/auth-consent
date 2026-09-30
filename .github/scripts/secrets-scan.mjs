import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Full-history secrets scan with plain git (the same pattern as the main project's
// npm run secrets:scan). Exits 1 on any hit. Tokens are split in two only so this file
// can't match its own pattern.
const PATTERN = new RegExp(
  [
    "postgres(ql)?://[^<:/]+:[^<@]+@", // a connection string with an inline password
    "sb_" + "secret_", // Supabase secret key
    "eyJhbG" + "ciOi", // a JWT (e.g. a legacy service-role or anon key)
    "gh" + "p_", // GitHub personal access token (classic)
    "github_" + "pat_", // GitHub fine-grained token
  ].join("|"),
);

// One exclusion: the vendored supabase-js bundle contains the prefix text itself (it checks
// which kind of key it was given: e.startsWith("sb_" + "secret_")), which is library code, not
// a secret. It is skipped ONLY while it is byte-identical to the pinned upstream bundle; if the
// file changes, the exclusion lapses and it is scanned like everything else.
const VENDORED = { path: "vendor/supabase-js-2.117.2.umd.js", sha256: "59d39487c3589843b410322d8a3d562ce022aba1e5ccb16898ef3fb2a0da2ecd" };
const actual = createHash("sha256").update(readFileSync(VENDORED.path)).digest("hex");
const exclude = actual === VENDORED.sha256;
console.log(exclude
  ? `excluded: ${VENDORED.path} (sha256 matches pinned upstream supabase-js 2.117.2)`
  : `NOT excluded: ${VENDORED.path} changed (sha256 ${actual}); scanning it`);

const args = ["log", "-p", "--all", "--", ".", ...(exclude ? [`:(exclude)${VENDORED.path}`] : [])];
const log = spawnSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
if (log.status !== 0) {
  console.error(`git log failed: ${log.stderr}`);
  process.exit(2);
}
const lines = log.stdout.split("\n");
const hits = lines.flatMap((line, i) => (PATTERN.test(line) ? [`${i + 1}: ${line.slice(0, 200)}`] : []));
const commits = spawnSync("git", ["rev-list", "--all", "--count"], { encoding: "utf8" }).stdout.trim();
console.log(`$ git ${args.join(" ")}`);
console.log(`commits scanned: ${commits} · lines scanned: ${lines.length}`);
console.log(hits.length ? hits.join("\n") : "no hits");
console.log(`hits: ${hits.length}\nexit code: ${hits.length ? 1 : 0}`);
process.exitCode = hits.length ? 1 : 0;
