# VP Mart

Multi-vendor marketplace (Buyer, Vendor, Delivery Agent, Admin). JavaScript only: React + Vite + React Bootstrap on the front, Express 5 + MongoDB (Mongoose) on the back.

**Status: Phases 1-2 complete, Phase 3 in progress.** See `docs/STATUS.md` for the current snapshot. See `docs/TRACEABILITY.md` for the live, honest status of every requirement and `docs/VERSIONS.md` for installed versions and decisions.

## Prerequisites
- Node.js >= 22.12
- MongoDB 7 running as a **replica set** (transactions need it). Single-node is fine:
  ```bash
  mongod --replSet rs0 --dbpath ./data
  # one time, in another shell:
  mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'
  ```
- (Later phases) Redis, Elasticsearch, AWS S3 bucket, Razorpay test keys.

## Run locally
```bash
# Backend
cd backend && cp .env.example .env      # then edit secrets
npm install
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='ChooseAStrongOne1' npm run seed:admin
npm run dev                              # http://localhost:5000

# Frontend (separate shell)
cd frontend && npm install
npm run dev                              # http://localhost:5173 (proxies /api to the backend)
```
Generate `JWT_ACCESS_SECRET` with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

Password-reset email: with `MAIL_TRANSPORT=outbox` (default) messages are **not delivered**. Set `MAIL_TRANSPORT=smtp` and `SMTP_*` to send real email.

## Quality commands
| | Backend (`backend/`) | Frontend (`frontend/`) |
|---|---|---|
| Tests | `npm test` (node:test + Supertest, real MongoDB) | `npm test` (Vitest + React Testing Library) |
| Lint | `npm run lint` | `npm run lint` |
| Format | `npm run format:check` | `npm run format:check` |
| Build | n/a | `npm run build` |
| Audit | `npm run audit` | `npm run audit` |

Backend tests create a throw-away database named `vpmart_test_<pid>` and drop it afterwards. They never touch your dev data.

## Architecture (Phase 1)
```
Browser (React SPA)
  |  /api (Vite proxy in dev; VITE_API_URL in prod)
  v
Express 5  -- helmet, CORS (single origin), rate limits, CSRF (double-submit), zod validation
  |-- authenticate: JWT (HttpOnly) + live session check in MongoDB
  |-- authorize(role) -> controllers -> services -> Mongoose models
  v
MongoDB replica set: users, sessions (TTL), audit logs
```
Auth model: 15-minute access JWT and a rotating hashed refresh token, both HttpOnly cookies; revoking a session invalidates its access token immediately; reuse of a rotated refresh token revokes the session. Roles are read from the database on each request, never trusted from the token.

## API (Phase 1)
`GET /api/health` · `GET /api/auth/csrf` · `POST /api/auth/{register,login,refresh,logout,forgot-password,reset-password,change-password}` · `GET /api/auth/me` · `PATCH /api/users/me` · `POST /api/users/me/{deactivate,delete}` · `GET /api/admin/users` · `GET /api/admin/stats/users` · `PATCH /api/admin/users/:id/status`

All state-changing requests need the `x-csrf-token` header (value returned by `/api/auth/csrf`, login, register and refresh).

## Known limitations (honest list)
- Elasticsearch, AWS S3 and Razorpay could not be exercised in the build sandbox (no network access / credentials). They will be implemented against configuration and verified only where a service is available; anything unverified will be labelled as such.
- CI workflow is written but has not been run on a GitHub runner.
- The `taste-skill` UI guidance (`npx skills add Leonxlnx/taste-skill`) uses an interactive installer; its files were fetched and are used as a design reference for the storefront phase.
- Sandbox-only note: the `backend/.env` used for local verification is excluded from git.
