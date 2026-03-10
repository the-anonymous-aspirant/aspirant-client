# Client Operations

## Running Locally

### Prerequisites
- Node.js 21+
- npm

### Development Server
```bash
npm ci
npm run dev
```
Opens at `http://localhost:5173`. The Vite dev server proxies `/api/` to `http://localhost:8081` (the Go backend).

### Production Build
```bash
npm run build
npm run preview  # Preview production build locally
```

## Docker

### Build
```bash
docker build -t aspirant-client .
```

### Run Standalone
```bash
docker run -p 80:80 aspirant-client
```

Note: API calls will fail without the backend. In docker-compose, the client connects to the Go server via the `server` service name.

### Docker Compose (with backend)
The client is typically run as part of the full aspirant-online stack:
```yaml
services:
  client:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - server
```

## Nginx Configuration

The `default.conf` controls production routing:
- `listen 80` -- Serves on port 80
- `client_max_body_size 25m` -- Allows large uploads (voice messages, files)
- `/api/` -- Reverse proxy to `http://server:8080/`
- `/` -- Serves SPA with `try_files $uri $uri/ /index.html` fallback

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`):
1. On push to `main`: builds the client and pushes Docker image to GHCR
2. Image tagged as `ghcr.io/the-anonymous-aspirant/aspirant-client:latest`

## Troubleshooting

### API requests return 502
- Ensure the Go backend is running and accessible
- In dev: check that port 8081 is serving
- In Docker: check that the `server` service is healthy

### Assets not loading
- The AssetManager fetches from `/api/fetch-object/:hash`
- Verify the backend can reach S3 and the asset hashes are correct
- Check browser console for CORS or network errors

### Route guard redirecting unexpectedly
- Inspect `localStorage` for `user_token` and `user_role`
- Ensure the login API returns the expected role string
- Check that the route `meta.roles` array includes the user's role

### Mobile layout issues
- The breakpoint is 768px (defined in `global_state_manager.js`)
- Sidebar behavior changes between mobile (hamburger) and desktop (fixed)
- Test with browser devtools responsive mode
