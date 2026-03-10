# Architectural Decisions

## 001 -- Extract client into standalone repository

**Date:** 2026-03-10
**Status:** Accepted

**Context:** The aspirant-online repository contained both the Vue.js client and Go server in a monorepo. As the client grew in complexity (40+ views, games, admin tools), independent versioning and deployment became desirable.

**Decision:** Extract the `client/` directory into its own repository (`aspirant-client`) with its own Dockerfile, CI pipeline, and documentation.

**Consequences:**
- Client can be built and deployed independently
- Separate CI/CD pipeline for frontend changes
- Requires coordinating API contract changes across repos

## 002 -- Lightweight state management over Vuex/Pinia

**Date:** 2024 (original)
**Status:** Accepted

**Context:** The application's global state is limited to sidebar collapse, debug mode, and mobile detection.

**Decision:** Use Vue 3 `ref()` and `computed()` in a plain JavaScript module (`global_state_manager.js`) instead of a full state management library.

**Consequences:**
- Minimal bundle size overhead
- Simple to understand and maintain
- Would need migration if state complexity grows significantly

## 003 -- S3 asset management via backend proxy

**Date:** 2024 (original)
**Status:** Accepted

**Context:** Images and media needed to be served without exposing S3 credentials or bucket URLs to the browser.

**Decision:** Assets are fetched through `/api/fetch-object/:hash`, with the Go backend proxying to S3. The `AssetManager` class handles client-side caching with reference counting.

**Consequences:**
- S3 credentials stay server-side
- Assets are cached in memory as object URLs
- Backend must be running for any assets to load

## 004 -- Role-based routing via localStorage

**Date:** 2024 (original)
**Status:** Accepted

**Context:** The application needs to restrict routes based on user roles (Guest, User, Trusted, Admin).

**Decision:** Store `user_token` and `user_role` in `localStorage`. Router `beforeEach` guard checks these values against route `meta.roles`.

**Consequences:**
- Simple implementation, no additional dependencies
- Client-side only -- backend must also validate on API endpoints
- Tokens persist across sessions until explicitly cleared
