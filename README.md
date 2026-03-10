# aspirant-client

Vue.js 3 frontend for the Aspirant Online platform. A single-page application featuring games, quizzes, productivity tools, and role-based admin functionality.

## Quick Start

```bash
# Install dependencies
npm ci

# Start dev server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Docker
docker build -t aspirant-client .
docker run -p 80:80 aspirant-client
```

## Features

### Applications
- **Games** -- Word Weaver, Flappy Duo
- **Quizzes** -- RGB color guesser, SQL personality quiz, timeline challenges (tech, people, conflicts)
- **Tools** -- QR code generator, PDF generator for reMarkable tablets, image transparency mapper, file manager

### Trusted Section (authenticated)
- Analytics dashboard
- Message board
- Language translator
- File manager
- Birthday puzzle gift

### Admin Section
- System health monitoring with API status cards
- User management (CRUD)
- S3 asset management
- Voice commander (transcription + command parsing)

## Tech Stack

| Component     | Technology       |
|---------------|-----------------|
| Framework     | Vue 3 + Vuetify |
| Router        | Vue Router 4    |
| HTTP          | Axios           |
| Charts        | Chart.js        |
| Build         | Vite            |
| Production    | Nginx (Alpine)  |

## Architecture

The client communicates with a Go backend via `/api/` routes. In development, Vite proxies these to `localhost:8081`. In production, Nginx proxies to the `server` Docker service on port 8080.

Four access roles control feature visibility: Guest, User, Trusted, and Admin. Routes are guarded client-side via `meta.roles` in the router configuration.

See `docs/` for detailed specifications, architecture, and operational documentation.

## Project Structure

```
src/
  main.js                   -- Entry point, Vuetify + Axios setup
  App.vue                   -- Root layout with sidebar
  router/router.js          -- Routes and role guards
  global_state_manager.js   -- Sidebar, mobile, debug state
  asset_manager.js          -- S3 asset caching
  components/               -- Reusable components
  views/                    -- Page views organized by section
  resources/games/          -- Game data and quiz content
```

## Documentation

- [Client Specification](docs/SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Operations](docs/OPERATIONS.md)
- [Changelog](docs/CHANGELOG.md)
- [Decisions](docs/DECISIONS.md)
