# S404 — The English League

**Think. Speak. Compete.**  
A classroom competition, live multiplayer quiz arena, and Upper-Intermediate (B2) practice platform for Class **S404**.

---

## 1. Architecture Overview

S404 runs as a single portable **Node.js + Express + PostgreSQL** web application serving a compiled **React + Vite** single-page frontend:

- **Frontend (`src/`)**: React 19, TypeScript, Tailwind CSS v4, offline answer queue, QR join codes, and Service Worker (`public/sw.js`).
- **Backend (`server.ts`, `server/app.ts`, `server/auth.ts`)**: Express HTTP API, static asset hosting (`dist/`), salted `scrypt` password hashing, HMAC-SHA256 `HttpOnly` cookie sessions (`s404_session`), strict origin/CSRF validation, graceful shutdown, and **Server-Sent Events (`/api/stream`)** for real-time classroom synchronization.
- **Database (`src/db/`, `drizzle/`)**: PostgreSQL + Drizzle ORM (`pg`), supporting both standard `DATABASE_URL` connections and legacy `SQL_*` host variables, with non-destructive SQL migrations (`server/migrate.ts`).

### Why GitHub Alone Cannot Run the Full App (and Recommended Hosting)

- **GitHub Pages** serves only static HTML/CSS/JS files; it cannot run Express (`server.ts`), stream `/api/stream` SSE connections, enforce server-side authentication, or host PostgreSQL.
- **US/Western Free-Tier Cloud Hosts (Render, Railway, Fly.io, Koyeb, Neon, Supabase, Vercel, Google Cloud Run)** enforce U.S. OFAC sanctions or payment restrictions against Iranian IP addresses and accounts. Deploying directly there will block students accessing the site from Iran without a VPN.
- **Recommended GitHub-Centered Setup**:
  1. **GitHub** acts as the central repository, CI test runner (`.github/workflows/ci.yml`), Docker image registry (`ghcr.io`), and automated CD trigger (`.github/workflows/deploy.yml`).
  2. **Runtime Host** runs the standard Docker container (`Dockerfile`) + PostgreSQL 16 on an **Iran-accessible provider** (such as **Liara**, **Chabokan**, **Hamravesh**, or a standard **Linux VPS with `docker-compose.yml`**).
  3. **No reverse proxies masking user IPs** are needed when hosted on an Iran-accessible platform with a custom domain.

---

## 2. Repository Structure

```text
├── .github/workflows/
│   ├── ci.yml                  # Lint, Drizzle migrate, unit/HTTP/Postgres tests, Vite build, smoke check
│   └── deploy.yml              # Builds GHCR Docker image & deploys via Liara, SSH Docker, or Webhook
├── drizzle/                    # Checked-in Drizzle SQL migrations & journal
├── public/
│   └── sw.js                   # Offline-resilient static asset Service Worker
├── server/
│   ├── app.ts                  # Express app factory (CORS, CSRF, auth, SSE, health endpoints, routes)
│   ├── auth.ts                 # scrypt hashing, HMAC session tokens, cookie attributes, CSRF guard
│   ├── config.ts               # Server runtime configuration parser
│   ├── db.ts                   # PostgreSQL data layer & non-destructive classroom seeding
│   ├── migrate.ts              # Safe Drizzle migration runner (with baseline support for imported DBs)
│   ├── app.test.ts             # HTTP production tests (health, CORS, CSRF, cookies, auth, SSE)
│   ├── config.test.ts          # Unit tests for DB/server/API configuration
│   └── db.test.ts              # PostgreSQL integration tests
├── src/
│   ├── components/             # AuthPortal, DashboardView, BattleArenaView, LeagueView, PracticeLabView, TeacherConsoleView
│   ├── data/                   # Units 7–9 question bank (408+ questions) and practice exercises
│   ├── db/
│   │   ├── config.ts           # Portable DATABASE_URL & legacy SQL_* resolver + SSL config
│   │   ├── drizzle.config.ts   # Drizzle Kit CLI config
│   │   ├── index.ts            # pg Pool singleton, health check, pool shutdown
│   │   └── schema.ts           # 13 PostgreSQL tables
│   ├── lib/
│   │   ├── leagueApi.ts        # Frontend API client & SSE EventSource wrapper (supports VITE_API_BASE_URL)
│   │   ├── leagueRules.ts      # Pure scoring, ranking, pin, grading, and filtering logic
│   │   └── leagueRules.test.ts # Unit tests for classroom/game rules
│   └── types/                  # Shared TypeScript domain interfaces
├── Dockerfile                  # Production Node 22 Alpine container
├── docker-compose.yml          # Portable App + PostgreSQL 16 stack
├── server.ts                   # Production/dev HTTP server entrypoint with graceful shutdown
├── vite.config.ts              # Vite build config with chunk optimization
└── .env.example                # Documented environment variable template
```

---

## 3. Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes (production) | — | Standard PostgreSQL URI (`postgres://user:pass@host:5432/dbname?sslmode=require`) |
| `DATABASE_SSL` | No | Auto | Force `require`, `no-verify`, or `false` |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | No | `true` | Set `false` only if your DB provider uses a self-signed TLS cert without CA |
| `PORT` | No | `3000` | HTTP listen port |
| `NODE_ENV` | Production: `production` | `development` | Serves compiled `dist/` in production; Vite middleware in development |
| `SESSION_SECRET` | Recommended | Auto-persisted in DB | 32+ char secret for HMAC session cookies (if unset, persisted in `app_settings`) |
| `TEACHER_PASSWORD` | No | Existing hash (`smth1384`) | Optional override to set/rotate the `teacher` account password on boot |
| `TRUST_PROXY` | No | `1` | Reverse-proxy hop count (`1` behind PaaS/Nginx/Docker; `false` if direct) |
| `ALLOWED_ORIGINS` | Split-origin only | Empty (same-origin) | Comma-separated origins allowed for CORS/CSRF (never `*`) |
| `COOKIE_SAMESITE` | No | `auto` | Set `lax` for standalone same-origin custom domain over HTTPS |
| `FRAME_ANCESTORS_SELF` | No | `false` | Set `true` in production to add `Content-Security-Policy: frame-ancestors 'self'` |
| `VITE_API_BASE_URL` | Split-origin only | Empty (same-origin) | Build-time API base URL if frontend is hosted separately from Express |

> Legacy `SQL_HOST`, `SQL_PORT`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD` remain supported if `DATABASE_URL` is unset.

---

## 4. GitHub Secrets Configuration

In your GitHub repository go to **Settings → Secrets and variables → Actions → New repository secret**:

### Option A — Deploy to Liara (Iran-Accessible PaaS, Recommended)
- `LIARA_API_TOKEN`: API token from your Liara account (`console.liara.ir`).
- `LIARA_APP_NAME`: Name of the Docker app created in Liara (e.g., `s404-league`).

### Option B — Deploy via SSH to Any VPS (`docker-compose.yml`)
- `SSH_HOST`: Server IP or hostname.
- `SSH_USER`: SSH username (e.g., `deploy`).
- `SSH_PRIVATE_KEY`: Private SSH key authorized on the server.
- `SSH_PORT` (optional): SSH port (default `22`).
- `SSH_APP_DIR` (optional): Directory containing `docker-compose.yml` and `.env` (default `/opt/s404`).

### Option C — Deploy via PaaS Webhook (Coolify, Dokploy, CapRover, etc.)
- `DEPLOY_WEBHOOK_URL`: Secret webhook URL triggered after CI passes and the GHCR image is pushed.

---

## 5. Database Export, Import & Safe Drizzle Migrations

### Exporting Existing Production Data (From Cloud SQL or Current Postgres)
Run a clean, data-preserving dump from your existing PostgreSQL database before switching hosts:

```bash
pg_dump "$OLD_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=s404_backup.dump
```

### Importing Into Your New PostgreSQL Database
> **Warning (Destructive Flags):** Run the `--clean --if-exists` restore command below **only** against a fresh empty target database (or when intentionally wiping and replacing the target database with the backup). `--clean` issues `DROP` statements before restoring. For safety, omit `--clean --if-exists` on an empty database, or back up the target database first.

```bash
pg_restore \
  --dbname="$NEW_DATABASE_URL" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  s404_backup.dump
```

### Running Drizzle Migrations Safely
```bash
npm run db:migrate
```
* **Fresh empty database:** Applies `drizzle/0000_*.sql` to create all 13 tables, then seeds initial units, 408+ questions, practice exercises, and the `teacher` account on first boot without duplicating existing rows.
* **Restored database (`pg_restore`):** `server/migrate.ts` automatically detects existing tables (`public.users`) when `drizzle.__drizzle_migrations` does not exist yet, baselines `0000` safely without dropping or recreating any tables, and preserves all student accounts, passwords (`password_hash`), `token_version`, scores, XP, badges, and game history.
* **Adding future schema changes:** Update `src/db/schema.ts`, run `npm run db:generate` locally, review the generated SQL under `drizzle/`, and commit both. Never use destructive `DROP` or `TRUNCATE` migrations, and avoid running `npm run db:push` against live production databases (use `npm run db:migrate` instead).

---

## 6. Deployment & Daily Workflow

### Initial Setup
1. Create a GitHub repository and push this codebase to the `main` branch.
2. Create a PostgreSQL 16 database on your chosen host (e.g., Liara Managed PostgreSQL or `docker-compose.yml` on a VPS).
3. If migrating existing students/scores, restore `s404_backup.dump` into the new database and verify login works.
4. Set production environment variables on your host (`DATABASE_URL`, `NODE_ENV=production`, `SESSION_SECRET`, `COOKIE_SAMESITE=lax`, `FRAME_ANCESTORS_SELF=true`).
5. Add your deployment secret(s) in GitHub Secrets (`LIARA_API_TOKEN` + `LIARA_APP_NAME`, or `SSH_*`, or `DEPLOY_WEBHOOK_URL`).
6. Attach your custom domain (e.g., `s404class.ir` or `s404.yourdomain.com`) with HTTPS enabled on your host.

### Updating the Website
1. Commit and push changes to `main`:
   ```bash
   git add .
   git commit -m "Update classroom content"
   git push origin main
   ```
2. GitHub Actions automatically runs:
   - TypeScript checks (`npm run lint`)
   - Drizzle migrations + PostgreSQL integration tests + HTTP/unit tests (`npm test`)
   - Production Vite build (`npm run build`)
   - Live server smoke check against PostgreSQL (`/api/health/ready`)
   - Docker image push (`ghcr.io/<owner>/<repo>:<sha>`) and deployment to your host.

### Rolling Back a Failed Deployment
- **Failed before deployment:** If tests or builds fail in GitHub Actions, `.github/workflows/deploy.yml` stops before deploying—live users are unaffected.
- **Issue discovered after deployment:**
  1. Revert the commit on GitHub (`git revert HEAD && git push origin main`) to automatically re-deploy the previous version, **OR**
  2. Re-run `.github/workflows/deploy.yml` from the GitHub **Actions → CD** tab using **Run workflow** with the previous commit SHA (`deploy_ref`) / re-deploy the prior release in your host’s dashboard.
  3. Because migrations are additive and non-destructive, rolling back the application container leaves PostgreSQL data intact.

---

## 7. Health Checks & Verification

- `GET /api/health` — Fast process liveness check (`{ "ok": true }`).
- `GET /api/health/ready` — Verifies live PostgreSQL connectivity (`SELECT 1`), returning `200` when connected or `503` if unavailable.

Local verification commands:
```bash
npm install
npm run lint
npm test
npm run build
NODE_ENV=production npm start
```

---

## 8. Remaining External Services Required

- **GitHub** (Source repository, Actions CI/CD, and Container Registry — free for public/standard personal repos, OFAC-licensed for Iran).
- **PostgreSQL 16 + Node.js/Docker Host** (Liara, Chabokan, Hamravesh, or a Linux VPS running `docker-compose.yml`).
- **Custom Domain & DNS** (pointed directly to your chosen host with HTTPS).
