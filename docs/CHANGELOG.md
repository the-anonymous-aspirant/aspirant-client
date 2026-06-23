# Changelog

## Unreleased

- Värdeutlåtande: added a collapsible 'Om verktyget' (About) section
  above the upload step that renders the commander's classifier
  CATEGORIES + per-parser strategy registry verbatim. Fetched live from
  `GET /api/commander/valuation-statement/about` so it auto-reflects
  parser changes — never hand-maintained markdown. Initial state
  collapsed; opens on click. Operator can see exactly which page-1
  fingerprint regexes identify each known issuer layout and which
  extraction strategies fire (in priority order) for each slot.

## 2026-03-10

- Extracted client from `aspirant-online` monorepo into standalone `aspirant-client` repository
- Added standalone Dockerfile (multi-stage Node 21 build + Nginx)
- Added GitHub Actions CI workflow for Docker image publishing
- Added project documentation (CLAUDE.md, README.md, docs/)
