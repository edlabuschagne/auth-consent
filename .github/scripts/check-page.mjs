import { existsSync, readFileSync } from "node:fs";

// Checks the consent page's own guarantees, on every push:
//  1. every <script> loads from this repo (no other host, nothing inline),
//  2. the Content-Security-Policy allows scripts only from this site,
//  3. the frame check runs before anything that can approve or deny,
//  4. config.js holds only a publishable key: no secret key, no JWT.
const html = readFileSync("index.html", "utf8");
const js = readFileSync("consent.js", "utf8");
const cfg = readFileSync("config.js", "utf8");
const failures = [];
const ok = [];
const check = (cond, what) => (cond ? ok : failures).push(what);

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
check(scripts.length > 0, "the page has scripts");
for (const [, attrs, body] of scripts) {
  const src = /\bsrc="([^"]+)"/.exec(attrs)?.[1];
  check(Boolean(src), `script has a src (no inline script)${src ? `: ${src}` : ""}`);
  if (!src) continue;
  check(!/^[a-z]+:|^\/\//i.test(src), `script ${src} is relative (served from this site)`);
  check(existsSync(src), `script ${src} exists in the repo`);
  check(body.trim() === "", `script ${src} has no inline body`);
}
const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
check(/(^|;)\s*script-src 'self'\s*(;|$)/.test(csp), "CSP: script-src 'self' only");
check(/(^|;)\s*default-src 'none'\s*(;|$)/.test(csp), "CSP: default-src 'none'");

const frameAt = js.indexOf("window.top !== window.self");
const firstAction = Math.min(...["approveAuthorization", "denyAuthorization", "signInWithPassword", "getAuthorizationDetails"].map((s) => js.indexOf(s)).filter((i) => i >= 0));
check(frameAt >= 0 && frameAt < firstAction, "the frame check comes before any sign-in, approve or deny");
check(/window\.top !== window\.self\)\s*\{[\s\S]{0,300}?return;/.test(js), "a framed page returns before rendering anything actionable");
check(/redirect_uri/.test(js) && /client\.name/.test(js), "the page shows the client name and redirect URI");
check(/skipBrowserRedirect: true/.test(js), "approve/deny never navigate on their own");
check(!/window\.location\.assign\(\s*data\.redirect_url\s*\)/.test(js), "an already-approved redirect is never followed without being shown");
check(/"continue"[\s\S]{0,80}onclick: \(\) => window\.location\.assign\(redirectUrl\)/.test(js), "the already-approved path navigates only when Continue is clicked");
check(/You've already approved this app/.test(js) && /id: "redirect-url" \}, redirectUrl/.test(js), "the already-approved screen shows the full return address");
check(/id: "deny"/.test(js) && /id: "approve"/.test(js), "a fresh request offers both Approve and Deny");

check(!new RegExp("sb_" + "secret_").test(cfg), "config.js has no secret key");
check(!new RegExp("eyJhbG" + "ciOi").test(cfg), "config.js has no JWT (legacy anon or service-role key)");

for (const w of ok) console.log(`ok    ${w}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`\nfailures: ${failures.length}\nexit code: ${failures.length ? 1 : 0}`);
process.exitCode = failures.length ? 1 : 0;
