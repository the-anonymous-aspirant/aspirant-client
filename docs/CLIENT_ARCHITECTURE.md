# Client Architecture

## Technology Stack

| Layer       | Technology           | Version  |
|-------------|---------------------|----------|
| Framework   | Vue.js              | 3.4.x    |
| UI Library  | Vuetify             | 3.5.x    |
| Router      | Vue Router          | 4.3.x    |
| HTTP Client | Axios               | 1.6.x    |
| Charts      | Chart.js            | 4.4.x    |
| Build Tool  | Vite                | 6.2.x    |
| Runtime     | Node 21 (build)     | 21.x     |
| Server      | Nginx (production)  | Alpine   |

## Application Structure

```
                    +-----------+
                    | index.html|
                    +-----+-----+
                          |
                    +-----v-----+
                    |  main.js  |  Axios interceptors, Vuetify setup
                    +-----+-----+
                          |
                    +-----v-----+
                    |  App.vue  |  Root layout, sidebar, mobile menu
                    +-----+-----+
                          |
              +-----------+-----------+
              |                       |
        +-----v-----+          +-----v-----+
        |  Sidebar   |          | router.js |  Route guards
        +-----+-----+          +-----+-----+
              |                       |
        +-----v-----+    +-----------v-----------+
        |   Login    |    |       Views           |
        +------------+    |  Home, Admin, Trusted |
                          |  Applications, Games  |
                          +-----------------------+
```

## State Management

The application uses lightweight reactive state instead of Vuex/Pinia:

### Global State (`global_state_manager.js`)
- `collapsed` -- Sidebar expanded/collapsed toggle
- `debugMode` -- Developer debug overlay
- `sidebarWidth` -- Computed CSS width based on collapsed state
- `isMobile` -- Reactive mobile breakpoint detection (< 768px)
- `sidebarHidden` -- Mobile sidebar visibility

### Local State
- Each view manages its own data via the Options API `data()` function
- API responses are stored in component-local reactive properties

### Authentication State
- Stored in `localStorage`: `user_token`, `user_name`, `user_role`
- Read by router guards and sidebar to control access and display

## Asset Pipeline

```
S3 Bucket --> /api/fetch-object/:hash --> AssetManager --> Component
                                              |
                                        In-memory cache
                                       (ref-counted blobs)
```

The `AssetManager` class:
1. Fetches assets from the backend, which proxies to S3
2. Creates object URLs from response blobs
3. Maintains reference counts for cache management
4. Supports batch preloading for critical assets
5. Revokes object URLs on release to prevent memory leaks

## Build and Deployment

### Development
```
Vite Dev Server (5173) --proxy /api/--> Go Backend (8081)
```

### Production (Docker)
```
Browser --> Nginx (80) --proxy /api/--> Go Backend (server:8080)
                |
          Static SPA files (/usr/share/nginx/html)
```

### Docker Multi-Stage Build
1. **Builder stage** (node:21-alpine): `npm ci` + `npm run build`
2. **Runtime stage** (nginx:alpine): Copy dist + nginx config

## Design System

CSS custom properties in `App.vue` provide a consistent design language:

- **60/30/10 color rule**: Neutral surfaces (60%), brand amber (30%), accent blue (10%)
- **Spacing scale**: 8 levels from `--space-2xs` (4px) to `--space-3xl` (64px)
- **Typography scale**: 8 sizes from `--text-xs` (12px) to `--text-3xl` (40px)
- **Transitions**: 4 speed levels from `--transition-fast` (150ms) to `--transition-layout` (500ms)
- **Shadows**: 3 elevation levels (`sm`, `md`, `lg`)

## Routing Architecture

Routes are defined in a flat array in `router.js`. Role-based guards use `meta.roles`:

```javascript
{ path: '/admin', component: AdminView, meta: { roles: ['Admin'] } }
```

The `beforeEach` guard:
1. Checks if route has `meta.roles`
2. If yes, reads `user_token` and `user_role` from localStorage
3. Redirects to `/` if unauthenticated or role not in allowed list
4. Allows navigation otherwise
