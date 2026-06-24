# Changelog

## Unreleased

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
