import { spawnSync } from "node:child_process";

// Full-history secrets scan with plain git (the same pattern as the main project's
// npm run secrets:scan). Exits 1 on any hit. Nothing is excluded in this repo.
// Tokens are split in two only so this file can't match its own pattern.
const PATTERN = new RegExp(
  [
    "postgres(ql)?://[^<:/]+:[^<@]+@", // a connection string with an inline password
    "sb_" + "secret_", // Supabase secret key
    "eyJhbG" + "ciOi", // a JWT (e.g. a legacy service-role or anon key)
    "gh" + "p_", // GitHub personal access token (classic)
    "github_" + "pat_", // GitHub fine-grained token
  ].join("|"),
);

const log = spawnSync("git", ["log", "-p", "--all"], { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 });
if (log.status !== 0) {
  console.error(`git log failed: ${log.stderr}`);
  process.exit(2);
}
const lines = log.stdout.split("\n");
const hits = lines.flatMap((line, i) => (PATTERN.test(line) ? [`${i + 1}: ${line}`] : []));
const commits = spawnSync("git", ["rev-list", "--all", "--count"], { encoding: "utf8" }).stdout.trim();
console.log(`commits scanned: ${commits} · lines scanned: ${lines.length}`);
console.log(hits.length ? hits.join("\n") : "no hits");
console.log(`hits: ${hits.length}\nexit code: ${hits.length ? 1 : 0}`);
process.exitCode = hits.length ? 1 : 0;
