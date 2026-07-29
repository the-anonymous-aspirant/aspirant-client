# Changelog

## Unreleased

- system_3 admin app entry (system_3 #2867 / #2865-B, M0 cell migration):
  added a `system_3` tile to the admin applications and an nginx
  `/admin/apps/system_3/` reverse-proxy location that mirrors the existing
  Penpot/Histoire admin-gated pattern (`auth_request /_internal/verify-admin`,
  new-tab launch). The system_3 fleet Vue runs on the cell backend and is
  served here behind the Admin auth gate. **Prepared, inert until cutover:**
  the upstream (`host.docker.internal:8000`) is a lazily-resolved variable so
  nginx starts even when the cell isn't reachable — going live needs (a) the
  aspirant-deploy compose to grant this nginx service host-gateway access
  (`extra_hosts: host.docker.internal:host-gateway`) and (b) the system_3 Vue
  built `--base=/admin/apps/system_3/` with its backend mounting the dist there
  (system_3 #2866), so the base matches the proxy prefix (no path rewrite).

- Robbans Tusen site-wide audio widget: fixed-position play/pause +
  volume slider mounted in `App.vue`, backed by a singleton `Audio`
  object in `src/composables/useRobbansTusen.js`. Asset fetched via
  `AssetManager.getAsset('robbans_tusen')` so the existing
  `/api/fetch-object/<hash>` cache pipeline applies. The play button
  doubles as the browser autoplay-unlock gesture; volume persists in
  `localStorage` under `robbans_tusen_volume`; playback position
  survives route changes because the `Audio` lives in module scope.
  e2e coverage in `tests/e2e/robbans-tusen.spec.ts`.

- Värdeutlåtande About section: regenerated the bundled snapshot at
  `src/resources/valuationAbout.json` against aspirant-commander's
  post-#1113 field-first slot extractor registry, and rewrote the
  disclosure to a two-column slot/strategy-chain table (left = docx
  template slot key, right = priority-ordered strategy chain). Drops
  the per-DocumentType classification cards (CATEGORIES + fingerprint
  regex list) — each strategy now carries its own content-fingerprint
  guard, so the chain is the dispatch. UI and snapshot now match what
  the commander actually runs.
- Värdeutlåtande About section: switched from a runtime
  `GET /api/commander/valuation-statement/about` fetch to a
  build-time bundled snapshot at `src/resources/valuationAbout.json`.
  Regenerated from aspirant-commander's classifier registry by
  `scripts/regen-valuation-about.sh` and committed; the disclosure now
  renders without a network call (Wordweaver pattern). Drops the
  best-effort `try/catch` mount hook and the runtime auth surface on
  the read.
- Värdeutlåtande: added a collapsible 'Om verktyget' (About) section
  above the upload step that renders the commander's classifier
  CATEGORIES + per-parser strategy registry verbatim. Initial state
  collapsed; opens on click. Operator can see exactly which page-1
  fingerprint regexes identify each known issuer layout and which
  extraction strategies fire (in priority order) for each slot.

## 2026-03-10

- Extracted client from `aspirant-online` monorepo into standalone `aspirant-client` repository
- Added standalone Dockerfile (multi-stage Node 21 build + Nginx)
- Added GitHub Actions CI workflow for Docker image publishing
- Added project documentation (CLAUDE.md, README.md, docs/)
