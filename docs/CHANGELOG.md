# Changelog

## Unreleased

- Trusted tools: fixed low-contrast text on `/trusted/translator` and
  `/trusted/jobs`, the same surface/ink collision #3014 fixed on the
  valuation wizard. Cards painting `--surface-card` inside a view whose
  inherited ink is `--text-on-light` carried no ink of their own, so the
  `From`/`To` labels and `0 / 5000` counter on the translator sat at
  1.00:1 and the `Sources & criteria` toggle and jobs table headers at
  1.99:1 (`--text-muted` derives from `currentColor` since design-system
  #27). Each surface-owning component now pairs its surface with
  `color: var(--text-on-dark)` (`.translate-card`, `.languages-card`,
  `.about-me`, `.sources-panel`, `.jobs-table th`). Contrast regression
  lock in `tests/e2e/trusted-contrast.spec.ts`. Operator-reported
  (system_3 #3027).

- Värdeutlåtande: fixed invisible text on the wizard step cards. The
  `ValuationStep` card paints `--surface-card` (#424242) inside a view
  whose inherited ink is `--text-on-light` (#424242), so inherited card
  text sat at 1.00:1 and everything using `--text-muted` collapsed from
  2.14:1 to 1.00:1 when the design system (#27) derived muted from
  `currentColor`. The card now pairs its surface with its own ink
  (`color: var(--text-on-dark)`); measured contrast after the fix is
  10.05:1 (inherited) and 7.13:1 (muted). Contrast regression lock in
  `tests/e2e/vardeutlatande.spec.ts`. Operator-reported (system_3 #3014).

- Pappas pushups graph: raised the chart roof from 2000 to 3000 and added
  two horizontal reference markings — a violet dashed line at 2000 and a
  red dashed line at the 3000 roof (`Tak (3000)`), mirroring the existing
  `Mål (1000)` target-line pattern. The chart height is unchanged (the
  doubled 560px from #2759); the taller ceiling shows the 2000→3000
  headroom. The crown cadence (one past 1000, one more per 100 from 1500)
  already has no upper cap, so it extends through the new range unchanged
  (2000 → 👑×7, 3000 → 👑×17); e2e covers the 2000–3000 headroom in
  `tests/e2e/pappas-pushups.spec.ts`. Operator request (#2848), follows
  #2759.

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
