# Requirement traceability checklist

Status values: **Passed** (an automated test or reproducible check ran and passed), **In Progress**, **Pending**, **Failed**, **Blocked** (needs credentials/services unavailable in the build sandbox).

Code existing is never counted as Passed. Last updated at the end of Phase 1.

| ID | Requirement | Phase | Status | Evidence / notes |
|---|---|---|---|---|
| R-DEV-01 | Inspect existing repo before building | 1 | Passed | Sandbox inspected: no repo, no uploads (greenfield) |
| R-DEV-02 | Verify latest stable compatible versions | 1 | Passed | docs/VERSIONS.md; peer conflict found and resolved (ESLint 9 in frontend) |
| R-DEV-03 | JavaScript only, no TypeScript | 1 | Passed | No .ts/.tsx files in repo |
| R-DEV-04 | No fake payments / hardcoded stats / dead links / TODO-hidden features | 1-5 | In Progress | Enforced continuously; Phase 1 UI has no placeholder data |
| R-STK-01 | Frontend: React, Vite, React Bootstrap, Axios, React Icons, React Router, Context API | 1 | In Progress | Installed and building; Socket.IO client arrives Phase 4 |
| R-STK-02 | Backend: Express, Mongoose, REST, bcrypt, Socket.IO server | 1 | In Progress | Express/Mongoose/bcrypt done; Socket.IO Phase 4 |
| R-STK-03 | Elasticsearch search/filter/sort | 2 | Blocked | elastic.co unreachable in build sandbox; will be built against a configurable client and verified only if a cluster is available |
| R-STK-04 | Redis cart/session caching | 2 | Pending | Redis 7.0.15 installed locally |
| R-STK-05 | AWS S3 image storage | 2 | Blocked | Needs your AWS credentials; cannot be verified in sandbox |
| R-STK-06 | Razorpay Test Mode payments | 3 | Blocked | Needs your Razorpay test keys; cannot be verified in sandbox |
| R-STK-07 | PDF invoice generation | 4 | Pending |  |
| R-STK-08 | Notification delivery services | 4 | In Progress | Mailer service done (SMTP or outbox); in-app notifications Phase 4 |
| R-STK-09 | Testing: Vitest, RTL, Playwright, Supertest, ESLint, Prettier, a11y tools, CI | 1-5 | In Progress | Vitest, RTL, Supertest, node:test, ESLint, Prettier running; CI file written but unverified; Playwright and a11y Phase 5 |
| R-BRAND-01 | Original VP Mart logo (red V, blue P, black Mart, bag icon) | 1 | Passed | frontend/src/tests/Logo.test.jsx |
| R-BRAND-02 | Logo shown on register, login, navbar, footer, dashboards | 1-5 | In Progress | Login, register, reset pages and shell header done; footer and dashboards later |
| R-BRAND-03 | Logo click navigates home via React Router without reload | 1 | Passed | Logo.test.jsx navigates client-side |
| R-UI-01 | Polished, consistent, responsive, accessible UI (taste-skill guidance) | 2-5 | In Progress | Auth screens built; storefront design pass is Phase 2 |
| R-UI-02 | Loading, empty, error, disabled states; skeletons | 1-5 | In Progress | Loading/error/disabled covered on auth and account; skeletons with catalog |
| R-UI-03 | Reduced-motion and keyboard focus support | 1 | In Progress | CSS present; axe/Playwright check Phase 5 |
| R-UI-04 | No overflow/overlap at mobile, tablet, laptop, desktop | 5 | Pending | Playwright viewport tests |
| R-NAV-01 | Main navbar (logo, location, search, region, account, returns/orders, cart) | 2 | Pending | Minimal shell header only |
| R-NAV-02 | Secondary navbar with all listed categories and working destinations | 2 | Pending |  |
| R-NAV-03 | Footer with all required sections and valid links | 2 | Pending |  |
| R-NAV-04 | Reusable layouts; simplified checkout layout; dashboard layouts | 2-3 | In Progress | PublicLayout and AuthLayout done |
| R-NAV-05 | Playwright tests for nav, footer, scrolling, overflow | 5 | Pending |  |
| R-HOME-01 | Homepage: banners, brands, trending, best sellers, categories, new arrivals, deals, coupons, recommendations (all from backend) | 2 | Pending |  |
| R-ROLE-01 | Four roles with backend-enforced permissions | 1 | Passed | authorization.test.js (RBAC, 401/403 matrix) |
| R-ROLE-02 | Separate dashboards for Buyer, Vendor, Delivery Agent, Admin | 2-5 | Pending | Only a shared account page exists |
| R-ROLE-03 | No URL/body/storage tampering grants access | 1 | Passed | authorization.test.js: forged JWT, alg none, role from DB, mass-assignment |
| R-ROLE-04 | No public Admin registration | 1 | Passed | auth.test.js: role=admin rejected (422) |
| R-ROLE-05 | Admin created via secure server-side seed | 1 | Passed | seedAdmin.test.js |
| R-ROLE-06 | Vendor onboarding with Admin approval | 2 | In Progress | Approval state machine and admin API tested; onboarding profile Phase 2 |
| R-AUTH-01 | Registration | 1 | Passed | auth.test.js › registration |
| R-AUTH-02 | Login | 1 | Passed | auth.test.js › login |
| R-AUTH-03 | Logout with session revocation | 1 | Passed | Replayed access token rejected after logout |
| R-AUTH-04 | Password hashing (bcrypt) | 1 | Passed | Hash verified in DB, never returned |
| R-AUTH-05 | Server-side input validation | 1 | Passed | zod strict schemas; field-error tests |
| R-AUTH-06 | Password visibility toggle | 1 | Passed | Login.test.jsx |
| R-AUTH-07 | Password reset | 1 | In Progress | API tested (single-use, expiry, session revoke); reset pages lack UI tests; real email needs SMTP |
| R-AUTH-08 | Password change | 1 | In Progress | API tested; UI untested |
| R-AUTH-09 | Profile editing | 1 | In Progress | API tested; UI untested |
| R-AUTH-10 | Account deactivation / deletion workflows | 1 | In Progress | Self-service tested; vendor/agent closure and order-based blockers come with orders (Phase 3/5) |
| R-AUTH-11 | Session/token expiration and refresh | 1 | Passed | Rotation and reuse detection tested; client refresh-retry tested (api.test.js) |
| R-AUTH-12 | Protected routes (frontend) | 1 | Passed | ProtectedRoute.test.jsx |
| R-AUTH-13 | Rate limiting and brute-force protection | 1 | Passed | Per-IP limiter and per-account lockout tests |
| R-AUTH-14 | Secure cookies: HttpOnly, Secure, SameSite, CSRF | 1 | Passed | Cookie flags asserted; CSRF tests; Secure enforced in production config |
| R-AUTH-15 | No secrets in frontend; .env.example; secrets excluded from git | 1 | Passed | .gitignore; placeholders only |
| R-CAT-01 | 18 required categories with subcategories | 2 | Pending |  |
| R-CAT-02 | Admin create/edit/activate/deactivate categories without destroying history | 2 | Pending |  |
| R-CAT-03 | Regulated products (medicines, food) compliance fields | 2 | Pending |  |
| R-PROD-01 | Product fields, variants, attributes by category | 2 | Pending |  |
| R-PROD-02 | Multiple vendor listings per product; unique product vs listing vs stock vs sold | 2 | Pending |  |
| R-PROD-03 | Vendor product CRUD, price/stock, out-of-stock, deactivate, image upload | 2 | Pending |  |
| R-PROD-04 | Deactivation preserves historical records | 2 | Pending |  |
| R-PROD-05 | Elasticsearch synced from MongoDB; Redis invalidation | 2 | Blocked | See STK-03 |
| R-BUY-01 | Public browsing; filters; sorting; product details; reviews; vendor info; delivery estimate | 2 | Pending |  |
| R-BUY-02 | Cart with stock validation and server-side totals | 3 | Pending |  |
| R-BUY-03 | Buy Now | 3 | Pending |  |
| R-BUY-04 | Checkout: addresses, coupons, payment selection, confirmation, tracking, online + COD | 3 | Pending |  |
| R-BUY-05 | Buyer account: addresses, orders, tracking, invoices, cancellation, returns, reviews, notifications | 3-4 | In Progress | Profile and security done |
| R-VEN-01 | Vendor dashboard: onboarding, shop profile, product mgmt, orders, packing, pickup, reports, settlements, reviews | 2-5 | Pending |  |
| R-VEN-02 | Vendor delivery settings used in estimates | 2-3 | Pending |  |
| R-VEN-03 | Vendors only access own records | 2 | Pending |  |
| R-DLV-01 | Delivery agent dashboard and profile | 4 | Pending |  |
| R-DLV-02 | Pickup request, nearby agents, first-accept lock, concurrency-safe | 4 | Pending |  |
| R-DLV-03 | Delivery OTP: unpredictable, expiring, rate-limited, never logged, backend-verified | 4 | Pending |  |
| R-DLV-04 | Customer privacy: address/phone only for assigned delivery, 12-hour window | 4 | Pending |  |
| R-DLV-05 | Failed delivery, reschedule, return-to-vendor, COD collection | 4 | Pending |  |
| R-DLV-06 | Incentives from verified deliveries | 4 | Pending |  |
| R-ADM-01 | Live overview statistics | 2-5 | In Progress | User/role/status counts live and tested; rest follows data |
| R-ADM-02 | Vendor approve/reject/suspend/reinstate | 1 | Passed | authorization.test.js › admin account approval and suspension |
| R-ADM-03 | Vendor warnings, inspect products/orders, compliance, complaints, hide listings | 5 | Pending |  |
| R-ADM-04 | Vendor deletion with safeguards (orders, payments, settlements, refunds, disputes, retention) | 5 | Pending |  |
| R-ADM-05 | Product/category/brand/promotion administration | 2-5 | Pending |  |
| R-ADM-06 | Compliance report/investigate/suspend/hide/remove workflow; audit trail | 5 | In Progress | Audit log model and writes tested |
| R-PAY-01 | Provider payment workflow with server-side verification and webhooks | 3 | Blocked | Needs Razorpay test keys |
| R-PAY-02 | Duplicate payment/webhook idempotency; payment states; COD distinct | 3 | Pending |  |
| R-COM-01 | Configurable commission and ledger; no duplicates or rounding errors | 3 | Pending |  |
| R-COM-02 | Admin revenue, commission, settlement, refund reports from authoritative data | 5 | Pending |  |
| R-CPN-01 | Admin coupon CRUD and targeting | 3 | Pending |  |
| R-CPN-02 | Per-product Create Coupon button and form; backend-generated unique codes | 3 | Pending |  |
| R-CPN-03 | Server-side eligibility; atomic usage limits; claim vs redeem | 3 | Pending |  |
| R-ADV-01 | Banner/ad management, scheduling, only active shown | 2 | Pending |  |
| R-ADV-02 | Real deletion of ads incl. DB record and safe S3 cleanup | 2 | Blocked | S3 part needs AWS credentials; DB deletion verifiable |
| R-EST-01 | Delivery estimation from serviceability, processing time, zones, holidays (not distance alone); per-vendor shipments | 3 | Pending |  |
| R-EST-02 | Order notifications to buyer and admin | 4 | Pending |  |
| R-RT-01 | Socket.IO authorized real-time events with persisted notifications | 4 | Pending |  |
| R-REV-01 | PDF invoices; reviews with eligibility; cancel/return/refund workflows | 4 | Pending |  |
| R-DB-01 | Models: users, sessions, audit (Phase 1); all remaining entities | 1-5 | In Progress | User, Session, AuditLog done with unique/TTL indexes |
| R-DB-02 | Transactions; no overselling; concurrency-safe stock/coupon/pickup/webhooks | 3-4 | Pending | Replica set available |
| R-DB-03 | Retention, deletion and anonymisation rules | 1 | In Progress | Buyer anonymisation tested; extend with orders |
| R-INFRA-01 | Elasticsearch / Redis / S3 integrations | 2 | Blocked | ES and S3 as above; Redis available |
| R-IMP-01 | Optional Fake Store API import script | 2 | Pending |  |
| R-SEC-01 | Server validation, RBAC, ownership checks, rate limits, headers, CORS, safe errors, upload validation | 1-5 | In Progress | Helmet, CORS, limits, body size, error handling tested |
| R-SEC-02 | Admin never sees full card/bank numbers; masked identifiers | 3 | Pending |  |
| R-SEC-03 | Dependency vulnerability checks | 1 | Passed | npm audit: 0 vulnerabilities (backend and frontend, prod deps) |
| R-TEST-01 | Vitest + RTL tests for utilities and components | 1-5 | In Progress | 26 tests passing; coverage grows per phase |
| R-TEST-02 | Playwright E2E (22 listed scenarios) | 5 | Pending |  |
| R-TEST-03 | Supertest backend tests (list in spec) | 1-5 | In Progress | 42 passing: auth, authorization, validation, seed |
| R-TEST-04 | Lint, format, build, a11y, audit gates | 1 | In Progress | ESLint, Prettier, build, audit pass; a11y Phase 5 |
| R-PERF-01 | Pagination, indexes, caching, lazy images, debounce | 2-5 | In Progress | Admin list paginated and indexed |
| R-SEO-01 | Titles, meta, semantic HTML, robots, sitemap, structured data, prerendering | 2 | Pending | Base title/description set |
| R-STRUCT-01 | Modular structure, centralised errors, startup/shutdown | 1 | Passed | Layered backend; boot and graceful shutdown handlers; boot smoke-tested |
| R-DOC-01 | README, architecture, DB/API docs, env reference, setup, deployment, results | 1-5 | In Progress | README, VERSIONS, this checklist; rest per phase |
| R-DOC-02 | CI configuration | 1 | In Progress | .github/workflows/ci.yml written; NOT executed (no GitHub runner here) |
| R-ACC-01 | Final acceptance criteria | 5 | Pending | Evaluated at the end |

## Summary at end of Phase 1

- Blocked: 7
- In Progress: 27
- Passed: 23
- Pending: 49

## Defects found and fixed this phase

| # | Defect | Cause | Fix | Retest |
|---|---|---|---|---|
| 1 | Cookies were `Secure` in development and `COOKIE_SECURE` check was ineffective | zod `.transform().default('false')` produced the truthy string `'false'` | Apply `.default()` before `.transform()` | All 42 backend tests pass; cookie flags asserted |
| 2 | Refresh-cookie lookup in tests returned nothing, so the reuse-detection test was not exercising a real token | Cookie is scoped to `/api/auth`; helper queried `/` | Helper checks both paths and test asserts the token exists | Passed |
| 3 | CSRF token unreadable by SPA on a different domain | Double-submit cookie is not visible cross-origin | API also returns `csrfToken` in JSON bodies; client keeps it in memory | New test + client tests pass |
| 4 | Frontend install failed with ERESOLVE | `eslint-plugin-react` does not support ESLint 10 | Pinned frontend to ESLint 9.39 | Install clean, lint clean |
