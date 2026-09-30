# auth-consent

A small sign-in and consent page for a Supabase project's OAuth 2.1 server. An app that wants
to act on your behalf sends you here; you sign in, see which app is asking and where it will
send you back, and approve or deny.

- Static files only, served by GitHub Pages. No build step.
- Holds no secrets: `config.js` has the project URL and its *publishable* key, which is public
  by design.
- Every script is in this repo (supabase-js is vendored at a pinned version in `vendor/`); the
  page's Content-Security-Policy allows no other script source.
- It won't show approve or deny inside a frame.
- `.github/workflows/checks.yml` runs a full-history secrets scan and the page checks on every push.
