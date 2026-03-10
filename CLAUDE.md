# CLAUDE.md

## Service Overview

**aspirant-client** is the Vue.js 3 frontend for the Aspirant Online platform. It was extracted from the `aspirant-online` monorepo into a standalone repository to enable independent development and deployment.

The client is a single-page application (SPA) built with Vue 3, Vuetify, and Vite. It communicates with a Go backend server through an Nginx reverse proxy and provides role-based access to various features including games, quizzes, tools, admin dashboards, and trusted-user functionality.

## Quick Start

```bash
# Install dependencies
npm ci

# Start dev server (port 5173)
npm run dev

# Production build
npm run build

# Docker build
docker build -t aspirant-client .
docker run -p 80:80 aspirant-client
```

## Port Configuration

| Context         | Port  | Notes                                           |
|-----------------|-------|-------------------------------------------------|
| Vite dev server | 5173  | Proxies `/api/` to `http://localhost:8081`       |
| Nginx (Docker)  | 80    | Proxies `/api/` to `http://server:8080/`         |

## Key Views

### Public (no auth required)
- `/` -- Home
- `/about` -- About
- `/applications` -- Application hub (games, quizzes, tools)
- `/quizzes/*` -- Quiz games (RGB guesser, SQL personality, timelines)
- `/games/*` -- Games (Word Weaver, Flappy Duo)
- `/applications/qr-generator` -- QR code generator
- `/applications/remarkable-pdfs` -- PDF generator for reMarkable tablets
- `/applications/transparencymapper` -- Image transparency tool
- `/support` -- Support page

### Trusted (requires Trusted or Admin role)
- `/trusted` -- Trusted landing
- `/trusted/ludde-analytics` -- Analytics dashboard
- `/trusted/files` -- File manager
- `/trusted/message-board` -- Message board
- `/trusted/30-year-gift` -- Birthday puzzle gift
- `/trusted/translator` -- Language translation

### Admin (requires Admin role)
- `/admin` -- Admin dashboard with system health and API status
- `/admin/users` -- User management
- `/admin/s3_assets` -- S3 asset management
- `/admin/voice-commander` -- Voice command transcription and parsing

## Role-Based Routing

Routes are guarded via `meta.roles` in `src/router/router.js`. The `beforeEach` guard checks `localStorage` for `user_token` and `user_role`. Unauthenticated or unauthorized users are redirected to `/`.

Four access levels exist:
1. **Guest** -- No login required (public routes)
2. **User** -- Logged in, basic access
3. **Trusted** -- Access to trusted section
4. **Admin** -- Full access including admin tools

## Nginx Proxy

In production (Docker), Nginx on port 80:
- Serves the built SPA from `/usr/share/nginx/html`
- Proxies `/api/` requests to the Go backend at `http://server:8080/`
- Falls back to `index.html` for SPA client-side routing (`try_files`)
- Allows request bodies up to 25 MB (`client_max_body_size`)

## Project Structure

```
src/
  main.js                       -- App entry, Vuetify setup, Axios interceptors
  App.vue                       -- Root component, sidebar, mobile hamburger
  router/router.js              -- All routes with role guards
  global_state_manager.js       -- Reactive sidebar/debug/mobile state
  asset_manager.js              -- S3 asset fetching and caching
  style.css                     -- Global utility styles
  components/
    sidebar/Sidebar.vue         -- Navigation sidebar with login
    sidebar/SidebarLink.vue     -- Individual nav link
    sidebar/Login.vue           -- Login/logout form
    ApplicationCard.vue         -- Card for application listings
    BackButton.vue              -- Persistent back navigation
    ApiCard.vue                 -- API status indicator
    UserForm.vue                -- User create/edit form
  views/
    HomeView.vue                -- Landing page
    AboutView.vue               -- About page
    SupportView.vue             -- Support page
    MessageBoardView.vue        -- Message board
    LuddeAnalytics.vue          -- Analytics
    TrustedView.vue             -- Trusted section landing
    admin/                      -- Admin views
    applications/               -- Games, quizzes, tools
    trusted/                    -- Trusted-only views
  resources/games/              -- Game data (quiz questions, timelines)
```

## Design System

CSS custom properties are defined in `App.vue :root`. Key tokens:

- **Brand**: `--brand-primary: #ffb300` (amber), `--brand-accent: #82b1ff` (blue)
- **Surfaces**: `--surface-page: #e4e4e4`, `--surface-card: #424242`
- **Spacing**: `--space-{2xs..3xl}` (0.25rem to 4rem)
- **Typography**: `--text-{xs..3xl}` (0.75rem to 2.5rem)
- **Radius**: `--radius-{sm..full}` (4px to 50%)

## Dependencies

- **Vue 3** -- Reactive UI framework
- **Vuetify 3** -- Material design component library
- **Vue Router 4** -- Client-side routing with history mode
- **Axios** -- HTTP client with auth interceptors
- **Chart.js** -- Radar charts (SQL personality quiz)
- **Vite** -- Build tool and dev server
