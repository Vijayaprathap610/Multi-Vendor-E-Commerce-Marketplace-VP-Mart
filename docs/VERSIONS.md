# Verified versions and compatibility decisions

Versions below are the ones actually installed and exercised by the test suites on v22.22.2 (checked against the npm registry on 2026-10-24). Not every package in the spec is installed yet: Elasticsearch, Redis client, AWS SDK, Razorpay, Socket.IO, Playwright and PDF tooling arrive with the phase that uses them ("no dependency without a purpose").

## Backend (`backend/`)
| Package | Installed | Type |
|---|---|---|
| `bcrypt` | 6.0.0 | runtime |
| `cookie-parser` | 1.4.7 | runtime |
| `cors` | 2.8.6 | runtime |
| `dotenv` | 18.0.9 | runtime |
| `express` | 5.3.0 | runtime |
| `express-rate-limit` | 8.7.1 | runtime |
| `helmet` | 8.3.0 | runtime |
| `jsonwebtoken` | 9.0.3 | runtime |
| `mongoose` | 9.11.4 | runtime |
| `nodemailer` | 10.2.1 | runtime |
| `pino` | 10.4.0 | runtime |
| `pino-http` | 11.0.0 | runtime |
| `zod` | 4.6.7 | runtime |
| `@eslint/js` | 10.0.1 | dev |
| `eslint` | 10.13.0 | dev |
| `globals` | 17.13.0 | dev |
| `prettier` | 3.9.10 | dev |
| `supertest` | 7.3.1 | dev |

## Frontend (`frontend/`)
| Package | Installed | Type |
|---|---|---|
| `axios` | 1.20.0 | runtime |
| `bootstrap` | 5.3.8 | runtime |
| `react` | 19.3.1 | runtime |
| `react-bootstrap` | 2.10.10 | runtime |
| `react-dom` | 19.3.1 | runtime |
| `react-icons` | 5.7.0 | runtime |
| `react-router-dom` | 7.18.4 | runtime |
| `@eslint/js` | 9.39.5 | dev |
| `@testing-library/jest-dom` | 7.0.1 | dev |
| `@testing-library/react` | 16.3.3 | dev |
| `@testing-library/user-event` | 14.6.8 | dev |
| `@vitejs/plugin-react` | 6.1.2 | dev |
| `eslint` | 9.39.5 | dev |
| `eslint-plugin-react` | 7.37.5 | dev |
| `eslint-plugin-react-hooks` | 7.1.1 | dev |
| `globals` | 17.13.0 | dev |
| `jsdom` | 30.1.3 | dev |
| `prettier` | 3.9.10 | dev |
| `vite` | 8.3.5 | dev |
| `vitest` | 5.0.5 | dev |

## Services used for development and tests
| Service | Version | Notes |
|---|---|---|
| MongoDB | 7.0.34 | Single-node **replica set** (`rs0`) because multi-document transactions need one. |
| Redis | 7.0.15 | Installed; first used in Phase 2 (cart/cache). |
| Elasticsearch | not installed | **Blocked in the build sandbox** (elastic.co is not reachable). See Known limitations. |

## Decisions
1. **ES modules, JavaScript only.** Both packages use `"type": "module"`; no TypeScript.
2. **Express 5** (current major) with native async error propagation. `req.query` is read-only in Express 5, so validated input is exposed as `req.valid` instead of mutating the request.
3. **Backend test runner: Node's built-in `node:test` + Supertest.** It runs ESM natively and has no extra dependency. Tests use a real MongoDB replica set (not `mongodb-memory-server`, whose binary download is blocked here and which would hide transaction behaviour).
4. **ESLint 9.39 in the frontend, ESLint 10 in the backend.** `eslint-plugin-react@7.37.5` only supports ESLint up to 9, so the frontend is pinned to the maintained 9.x line instead of forcing the install with `--force`.
5. **`bcrypt` (native)** for password hashing; prebuilt binary verified working. Cost factor 12 (tests use 4 for speed).
6. **Auth architecture:** 15-minute JWT access token and a rotating, hashed, DB-backed refresh token, both in HttpOnly cookies. The access token is checked against its session on every request, so revocation is immediate. CSRF uses the double-submit pattern; the token is also returned in JSON so a cross-domain SPA can send it.
7. **Vite 8 / Vitest 5 / `@vitejs/plugin-react` 6** were chosen together: Vitest 5 and the React plugin both accept Vite 8, and all require Node >= 22.12.
8. **Bug found and fixed during verification:** zod's `.transform().default('false')` returns the raw string `'false'` (truthy), which made cookies `Secure` in development and would have weakened the production check. Fixed by applying `.default()` before `.transform()`.
