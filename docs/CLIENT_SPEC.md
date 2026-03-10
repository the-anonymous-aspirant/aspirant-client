# Client Specification

## Purpose

The aspirant-client is the web frontend for the Aspirant Online platform. It provides a responsive single-page application where users can access games, quizzes, productivity tools, and administrative features based on their assigned role.

## Functional Requirements

### Authentication

- Users log in via the sidebar Login component
- Credentials are sent to `/api/auth/login`
- On success, `user_token`, `user_name`, and `user_role` are stored in `localStorage`
- Axios interceptors automatically attach the Bearer token to all API requests
- A 401 response clears stored credentials and returns the user to a logged-out state

### Role-Based Access

Four roles control feature visibility and route access:

| Role    | Public | Applications | Trusted | Admin |
|---------|--------|--------------|---------|-------|
| Guest   | Yes    | Yes          | No      | No    |
| User    | Yes    | Yes          | No      | No    |
| Trusted | Yes    | Yes          | Yes     | No    |
| Admin   | Yes    | Yes          | Yes     | Yes   |

Route guards in `router.js` enforce access. The sidebar dynamically shows/hides nav links based on the current role.

### Asset Management

Images and media are stored in S3 and fetched on demand through the AssetManager class:
- Assets are requested via `/api/fetch-object/:hash`
- The AssetManager maintains a reference-counted in-memory cache
- Object URLs are created from fetched blobs and revoked on release
- Preloading is supported for critical assets (sidebar icons)

### API Communication

All API calls go through Axios to `/api/` paths:
- In development, Vite proxies `/api/` to `http://localhost:8081`
- In production, Nginx proxies `/api/` to `http://server:8080/`
- The Go backend handles auth, data models, file storage, and service proxying

## Non-Functional Requirements

### Performance
- Vite code-splits node_modules into separate chunks per package
- Assets are lazy-loaded and cached via AssetManager
- PWA manifest enables add-to-home-screen on mobile

### Responsiveness
- All views support mobile (< 768px) and desktop layouts
- The sidebar collapses to icons on narrow viewports
- Mobile gets a hamburger menu with slide-out overlay

### Browser Support
- Modern browsers with ES module support
- PWA features where supported (service worker not yet implemented)
