# Changelog

## Unreleased

- Card Editor: the Templates section edits templates with version history
  (system_3 #8634 / #8650). The list shows each template's parent and version;
  the editor shows every element with where each prop comes from, lets an
  inherited value be overridden or an own value reset, picks artwork and fonts
  from the asset store, previews the unsaved draft on the card, saves every
  change as a new version, and restores any earlier version as another.
- Card Editor: the Cards section shows the deck at print scale (system_3 #8634 /
  #8649). Every card is drawn from the server's resolved faces at its real size
  (1 mm = 96/25.4 px at 100 %), front or back, at 100, 50 or 25 %, filtered by type,
  with template fonts and artwork from the asset store; text is rendered as text.
- Card Editor: the Assets section (system_3 #8634 / #8648). Drop or pick files to
  upload them into the server's card asset store one at a time with a progress bar
  (the server sniffs the type and keeps one copy per content); browse them as a grid
  with thumbnails, filter by kind, and open any asset in a viewer: images at fit or
  real size with their pixel size and print size at 300 DPI, SVG as an image, PDF in
  the browser's viewer, fonts as a sample line; the metadata, the templates and cards
  that use the asset, and delete (refused while anything uses it).
- Card Editor (system_3 #8634 / #8645): a new admin-only app at `/admin/cardgen` for
  the Constellations game's templated cards, reached from a "Card Editor" tile on the
  admin page. This change is the shell: four sections (Assets, Templates, Cards,
  Export) as tabs with their own URLs, and the API module `useCardgen.js` for the
  server's `/api/cardgen/*` routes. The sections are filled by the next changes.
  Admin-only by operator decision; the server gates every `/cardgen/*` route.
- **Invoices card owner: `flowah` → `vinoly`** (system_3 #8633). The user's
  existing login is `vinoly`, which also owns Jobs, and the operator confirmed
  it is hers (c53249). The Invoices card in `src/views/member/apps.js` moves to
  `vinoly` with aspirant-server's `invoicesOwnerUsername`, so `vinoly` now sees
  Jobs and Invoices on `/member`. The Jobs card, including its `person` note,
  is unchanged. The invoicing specs now seed `vinoly`, and the entitlement spec
  pins `vinoly`'s two cards.

- **Pappas sit-ups** (system_3 #7992/#7994): robert's second personal app, at
  `/member/personal/pappas-sit-ups` (and `/trusted/pappas-sit-ups`), built on
  Pappas pushups. It runs 57 days, 2026-10-18 to 2026-12-13, against
  aspirant-server's `GET/PATCH /api/situps/entries`, behind the same robert +
  Admin gate. The cumulative graph carries three fixed-total lines at thirds of
  60 a day × 57 days: 1140, 2280 and the 3420 goal. A day's message names the
  highest line its total crossed. Past the goal a day shows 👑, plus one more
  per 300; that is roughly the pushups crown cadence (one per 10% of the goal)
  scaled to 3420. The y-axis uses a suggested rather than a hard maximum, so a
  total past the goal stays on the chart. The pushups music widget stays on
  pushups. Under WebKit the page stops responding after a save, as the
  unchanged pushups page does; that is tracked as system_3 #7996.

  Two layout defects inherited from the pushups template are fixed on the new
  page only. Pushups still has both.
  - The two cards now set their own ink. `--surface-card` is dark in both
    themes, but the cards inherited the page's `--text-on-light`, so in the
    light theme every muted label on them (headers, weekdays, dates, the
    running-total line) rendered dark on dark.
  - At phone width the day table now scrolls inside its week. Before, it ran
    80px past the card and scrolled the whole page sideways at 390px.

- Sign-up: the two links a sign-up email carries now land somewhere. `/verify-email`
  confirms a new address and `/reset-password` sets a new one, both public and both
  reading their single-use token from the query string. They exist as pages rather
  than the mail pointing straight at a GET endpoint on the API because mail scanners
  and link-preview fetchers follow links inside messages — one prefetch would spend
  the token and leave the person holding a link that reports itself invalid, which
  they cannot diagnose and support cannot reproduce. So confirming takes a button
  press rather than firing on load, and the reset page checks the confirmation match
  and both length bounds before it sends anything: a rejected submission would burn
  the link and send someone back to their inbox for another one. Length is counted in
  bytes to match bcrypt's 72-byte limit and the server's own check. Neither page
  renders its token. Until this, a person clicking the link in their inbox reached a
  404 (system_3 #5228, client half of #5119).

- Constellations: a scanned room link now adds you to the game, and says which
  condition blocked it when it cannot. Opening `/member/shared/constellations/
  room/:code` went straight to the state poll, which answers a non-member with
  403 "Only a member of the room may view its state" — so scanning a room's own
  QR code from a second device showed the player a refusal instead of the board.
  The route now joins first (idempotent since aspirant-server #87, so an
  existing member re-opening their own room link keeps their seat and never
  flashes an error), and on refusal renders a purpose-built panel keyed off the
  server's new `reason`: the room is full and how many seats it has, the game
  has ended, no room with that code, or you are already in another game — named
  and linked, reusing the #4798 affordance. Every blocked state offers a way
  back to the lobby, and an unrecognised reason still renders the server's own
  message rather than a blank panel. Operator-reported (system_3 #4806 ask 1,
  client half of #4810).

- Constellations: "Read the rules" now flips the board in place instead of
  opening a new tab. #4772 fixed a dead rulebook link by serving the rulebook as
  a static asset and linking it with `target="_blank"`; the operator wants the
  page to stay put. The board is now a two-sided card: the button flips it,
  the rulebook is embedded scrollable on the back face, and the label swaps to
  "Back to the game". The rulebook keeps exactly one source of truth — it is
  embedded from `/constellations-rulebook.html`, not duplicated — and remains
  reachable at its own URL. The turned-away face is `inert`, so a board button
  behind the rules cannot be tabbed to or clicked, and the flip respects
  `prefers-reduced-motion`. Operator-reported (system_3 #4806 ask 5).

- Constellations: the relationship picker now opens when you click a player,
  instead of standing on the board permanently. It rendered unconditionally with
  every button disabled under a "Select two players" hint nobody had asked for.
  The panel is now split by scope: the pair picker (hint, the six type buttons,
  Clear) appears while a selection is in progress and closes when the pair is
  resolved or dismissed; the undo/redo arrows stay put, because they are
  board-scoped and hiding them with the picker would put undo out of reach
  exactly when it is wanted. The hint tracks the selection ("Select one more
  player" at one, "Set the pair's connection" at two). Operator-reported
  (system_3 #4806 ask 3).

- Constellations: the status line at the bottom of the board is now a transient
  feed, one item at a time. It rendered every current connection concatenated
  into a single paragraph with `·` separators, so a room with several players
  editing piled the whole graph into a wall of standing prose. A connection now
  announces itself once when it is made or re-typed — fade in, dwell, fade out —
  and the line is empty the rest of the time; simultaneous edits queue instead
  of stacking on screen (newest 5 kept). Edges already on the board when the
  room opens are adopted silently, so a player joining mid-game is not replayed
  the whole graph, and the permanent "No connections yet." standing text is
  gone. The graph itself remains the persistent view of who is connected to
  whom. Respects `prefers-reduced-motion` (dwell without the fade).
  Operator-reported (system_3 #4806 ask 6).

- Constellations: the die now rests on a face instead of rendering blank. Before
  the first roll `displayFace` was 0, which had no pip layout, so the icon was
  an empty rounded square. It rests on a single pip drawn in muted slate — a
  placeholder, not a result: the status line still reads "Not rolled yet" and
  the accessible name is still "Roll the die" until a real value lands.
  Operator-reported (system_3 #4806 ask 4).

- Constellations: the "you are already in an active game" refusal now names
  the room and links to it. Create and join rendered `error.message` as a bare
  red line that told the user they held a seat somewhere but not where, so
  they could not go to that room and leave it. aspirant-server now returns
  `active_room_code` on that 409 (companion PR); the lobby renders the code in
  the message and, when the field is present, a `Go to room ABCDE` link to
  `/member/shared/constellations/room/:code`. Regression lock in
  `tests/e2e/constellations-landing.spec.ts` (create and join arms).
  Operator-reported (system_3 #4798).

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
