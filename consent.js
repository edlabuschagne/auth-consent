// OAuth consent page for a Supabase project's OAuth 2.1 server.
// Flow: Supabase sends the browser here with ?authorization_id=…; the user signs in with email
// and password; the page shows WHO is asking (client name) and WHERE they'll be sent (redirect
// URI); the user approves or denies. Rules:
//  - Inside a frame, the page shows nothing actionable (clickjacking): GitHub Pages can't send
//    a frame-ancestors header, and the meta form of it is ignored by browsers.
//  - The session is kept in memory only: every Pages site on this account shares one origin,
//    so nothing is left in localStorage for another page to read.
//  - An already-approved request shows where it returns and waits for Continue; it never
//    follows a redirect the user hasn't seen.
//  - After approve/deny, the page only navigates to a URL that starts with the redirect URI it
//    showed the user.
(function () {
  "use strict";
  const app = document.getElementById("app");
  const el = (tag, attrs, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "onclick" || k === "onsubmit") n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const c of children) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  };
  const show = (...nodes) => app.replaceChildren(...nodes);
  const message = (title, text) => show(el("h1", {}, title), el("p", {}, text));

  // 1. Framed? Refuse, and render nothing that can be clicked.
  if (window.top !== window.self) {
    message("This page can't be used inside another page", "Open it directly in your browser's address bar.");
    return;
  }

  const cfg = window.AUTH_CONSENT_CONFIG || {};
  const authorizationId = new URLSearchParams(window.location.search).get("authorization_id");
  if (!authorizationId) {
    message("Nothing to approve", "This page is opened by an app asking for access. There's no request here.");
    return;
  }
  if (!window.supabase || !cfg.supabaseUrl || !/^sb_publishable_/.test(cfg.publishableKey || "")) {
    message("This page isn't set up", "Its project settings are missing.");
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  function signInForm(error) {
    const email = el("input", { type: "email", id: "email", autocomplete: "username", required: "" });
    const password = el("input", { type: "password", id: "password", autocomplete: "current-password", required: "" });
    const form = el("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        show(el("p", {}, "Signing in…"));
        const { error: err } = await client.auth.signInWithPassword({ email: email.value, password: password.value });
        if (err) return signInForm("That email and password didn't work.");
        await consent();
      },
    },
      el("label", { for: "email" }, "Email"), email,
      el("label", { for: "password" }, "Password"), password,
      el("button", { type: "submit" }, "Sign in"),
    );
    show(el("h1", {}, "Sign in to continue"), ...(error ? [el("p", { class: "error" }, error)] : []), form);
  }

  function go(redirectUrl, allowedBase) {
    if (typeof redirectUrl !== "string" || !redirectUrl.startsWith(allowedBase)) {
      message("Stopped", "The app's return address didn't match the one shown. Nothing was sent.");
      return;
    }
    window.location.assign(redirectUrl);
  }

  function alreadyApproved(redirectUrl) {
    let host = "";
    try { host = new URL(redirectUrl).host; } catch { host = ""; }
    show(
      el("h1", {}, "Already approved"),
      el("p", {}, "You've already approved this app. It will return you to the address below."),
      el("dl", {},
        el("dt", {}, "App"), el("dd", { id: "client-name" }, "(Supabase doesn't give the app's name for an app you've already approved)"),
        el("dt", {}, "Returns you to"), el("dd", { id: "redirect-host" }, host || "(unreadable address)"),
        el("dt", {}, "Full address"), el("dd", { id: "redirect-url" }, redirectUrl),
      ),
      el("div", { class: "actions" },
        el("button", { type: "button", id: "continue", onclick: () => window.location.assign(redirectUrl) }, "Continue"),
      ),
    );
  }

  async function consent() {
    const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error || !data) {
      message("This request can't be completed", "It may have expired. Go back to the app and start again.");
      return;
    }
    if (!("authorization_id" in data)) {
      // Already approved before: Supabase returns only the finished redirect (no app name).
      // Show where it goes and wait for the user; never follow a redirect they haven't seen.
      // (Not framed: checked at the top.)
      alreadyApproved(data.redirect_url);
      return;
    }
    const decide = async (approve) => {
      show(el("p", {}, approve ? "Approving…" : "Declining…"));
      const call = approve ? client.auth.oauth.approveAuthorization : client.auth.oauth.denyAuthorization;
      const { data: d, error: err } = await call.call(client.auth.oauth, authorizationId, { skipBrowserRedirect: true });
      if (err || !d) return message("That didn't go through", "Go back to the app and start again.");
      go(d.redirect_url, data.redirect_uri);
    };
    show(
      el("h1", {}, "Approve access?"),
      el("p", {}, "An app is asking to act on your behalf."),
      el("dl", {},
        el("dt", {}, "App"), el("dd", { id: "client-name" }, data.client && data.client.name ? data.client.name : "(no name given)"),
        el("dt", {}, "It will send you back to"), el("dd", { id: "redirect-uri" }, data.redirect_uri),
        el("dt", {}, "Signed in as"), el("dd", {}, data.user && data.user.email ? data.user.email : ""),
      ),
      el("div", { class: "actions" },
        el("button", { type: "button", id: "deny", onclick: () => decide(false) }, "Deny"),
        el("button", { type: "button", id: "approve", onclick: () => decide(true) }, "Approve"),
      ),
    );
  }

  signInForm();
})();
