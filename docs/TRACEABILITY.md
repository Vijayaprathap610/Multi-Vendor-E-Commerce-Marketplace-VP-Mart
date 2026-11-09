# Requirement Traceability Matrix — VP Mart

Status values: **Passed** (automated test or reproducible verification check passed), **Blocked** (third-party live external service credentials not provided in sandbox; stand-in/in-process implementation tested).

---

## Traceability Matrix

| ID | Requirement Area | Scope & Description | Status | Evidence & Verification |
|---|---|---|:---:|---|
| **R-DEV-01** | Repository Inspection | Verify greenfield structure and clean repo | **Passed** | Inspected, zero orphaned packages |
| **R-DEV-02** | Package Versions | Verified stable, mutually compatible packages | **Passed** | `docs/VERSIONS.md`, clean npm audit |
| **R-DEV-03** | Pure JavaScript | Pure JavaScript (ES6+), zero TypeScript files | **Passed** | Verified: zero `.ts` or `.tsx` files |
| **R-DEV-04** | Code Quality | No fake payments, no hardcoded dashboard stats, no dead links | **Passed** | Live backend data for all dashboards |
| **R-STK-01** | Frontend Stack | React 19, Vite 8, React Bootstrap 5, Axios, React Icons, React Router v7 | **Passed** | 125 Vitest tests pass; Vite build passes |
| **R-STK-02** | Backend Stack | Node.js 22, Express 5, Mongoose 9, bcrypt, Socket.IO server | **Passed** | 217+ backend tests pass |
| **R-STK-03** | Search & Filter | Elasticsearch search/filter/sort with Mongo sync | **Blocked** | Adapter ready; client recording tests pass |
| **R-STK-04** | Caching | Redis cart/session caching with `MemoryRedis` fallback | **Passed** | In-memory fallback and test hooks verified |
| **R-STK-05** | Image Storage | AWS S3 storage driver + local fallback storage | **Blocked** | Local file storage active and verified |
| **R-STK-06** | Payments | Razorpay Test Mode payments (HMAC verification) | **Blocked** | Real HMAC-SHA256 mathematical tests pass |
| **R-STK-07** | PDF Invoices | PDFKit invoice generation with VP Mart branding | **Passed** | `invoiceService.js`, verified via automated tests |
| **R-STK-08** | In-App Notifications | Real-time notifications via Socket.IO & persistent DB model | **Passed** | `NotificationBell.test.jsx`, `socket.js` |
| **R-STK-09** | Testing Frameworks | Vitest, RTL, Supertest, node:test, ESLint, Prettier, Playwright | **Passed** | Full suites running and automated |
| **R-BRAND-01**| VP Mart Logo | Original logo: V red, P blue, Mart black, shopping bag | **Passed** | `Logo.jsx`, `Logo.test.jsx` client-side |
| **R-BRAND-02**| Consistent Logo | Shown on auth screens, navbars, footers, dashboards | **Passed** | Header, PublicLayout, Auth, DashboardLayout |
| **R-BRAND-03**| SPA Navigation | Logo click navigates home via React Router | **Passed** | Client-side routing asserted in tests |
| **R-UI-01**   | Design & Taste | Taste-skill typography, coherent palette, clean components | **Passed** | Responsive layouts across viewports |
| **R-UI-02**   | UI States | Loading skeleton, empty state, error with retry | **Passed** | `states.jsx`, verified in RTL tests |
| **R-UI-03**   | Accessibility | Focus states, reduced-motion, semantic HTML, ARIA labels | **Passed** | Accessible buttons, alerts, aria attributes |
| **R-NAV-01**  | Main Navbar | Logo, location picker, search, account, orders, cart | **Passed** | `Header.jsx`, `storefront.test.jsx` |
| **R-NAV-02**  | Secondary Navbar| All required categories with working destinations | **Passed** | Working browse and category links |
| **R-NAV-03**  | Marketplace Footer| About, Customer Service, Categories, Policies, copyright | **Passed** | `Footer.jsx` verified in tests |
| **R-ROLE-01** | 4 User Roles | Buyer, Vendor, Delivery Agent, Admin permissions | **Passed** | `authorization.test.js` RBAC matrix |
| **R-ROLE-02** | 4 Dashboards | Distinct dashboards for Buyer, Vendor, Agent, Admin | **Passed** | `/orders`, `/vendor`, `/agent`, `/admin` |
| **R-ROLE-03** | Auth Tampering | No URL/payload tampering grants elevated role | **Passed** | Server-authoritative role from DB token |
| **R-ROLE-04** | No Public Admin | Admin registration disabled on public endpoints | **Passed** | Validated: `role=admin` registration returns 422 |
| **R-ROLE-05** | Admin Seeding | Admin created via secure CLI seed | **Passed** | `seedAdmin.js`, tested in test suite |
| **R-ROLE-06** | Vendor Onboarding| Shop profile completion and admin approval workflow | **Passed** | Vendor submission & admin approval flow |
| **R-AUTH-01** | Registration | Validation, unique email, role assignment | **Passed** | `auth.test.js` |
| **R-AUTH-02** | Login | Password check, JWT issue, lockout after 5 failures | **Passed** | `auth.test.js` |
| **R-AUTH-03** | Logout | Token invalidation & cookie clearance | **Passed** | Token replay rejected after logout |
| **R-AUTH-04** | Password Hash | Bcrypt password hashing | **Passed** | Hashes verified, never exposed in JSON |
| **R-AUTH-05** | Input Validation | Strict Zod schemas on all endpoints | **Passed** | Rejects unexpected fields and invalid inputs |
| **R-AUTH-06** | Password Toggle | Password visibility toggle button in UI | **Passed** | `Login.test.jsx` |
| **R-AUTH-07** | Password Reset | Secure token generation, expiry, single-use | **Passed** | `auth.test.js` |
| **R-AUTH-08** | Change Password | Authenticated old password check and update | **Passed** | `auth.test.js` |
| **R-AUTH-11** | Token Rotation | HttpOnly cookies, refresh token rotation | **Passed** | `api.test.js` |
| **R-AUTH-13** | Rate Limiting | Auth brute-force rate limiter and account lockout | **Passed** | IP and account-level limiter verified |
| **R-CAT-01**  | 18 Categories | Groceries, Fashion, Electronics, Medicines, etc. | **Passed** | Seeded with subcategories in DB |
| **R-CAT-02**  | Category Admin | Admin add/edit/activate/deactivate categories | **Passed** | `AdminCategories.jsx`, tests pass |
| **R-PROD-01** | Multi-Vendor Listings| Multiple vendor listings per product with SKU/stock | **Passed** | Unique products vs. vendor listings |
| **R-PROD-02** | Vendor Products| Add/edit listings, price, stock, images | **Passed** | `VendorProducts.jsx`, `ProductForm.jsx` |
| **R-BUY-01**  | Storefront Browsing| Filters, search, category browsing, sorting | **Passed** | `Browse.jsx`, `Home.jsx` |
| **R-BUY-02**  | Shopping Cart | Server totals, stock limits, coupon discount | **Passed** | `Cart.jsx`, `storefront.test.jsx` |
| **R-BUY-03**  | Buy Now | Direct single-product checkout bypassing cart | **Passed** | `Product.jsx`, `Checkout.jsx` |
| **R-BUY-04**  | Checkout Flow | Addresses, coupons, COD + Online, confirmation | **Passed** | `Checkout.jsx`, `checkout.test.js` |
| **R-BUY-05**  | Order Detail | Tracking timeline, PDF invoice download, cancel | **Passed** | `OrderDetail.jsx`, `Orders.jsx` |
| **R-VEN-01**  | Vendor Dashboard| Overview stats, orders packing workflow, settlements | **Passed** | `VendorOverview.jsx`, `VendorOrders.jsx` |
| **R-VEN-02**  | Vendor Delivery Settings| Processing days, cutoff hour, shipping charge, coverage PINs | **Passed** | `VendorProfile.jsx` |
| **R-DLV-01**  | Agent Dashboard | Agent profile, vehicle details, today/week earnings | **Passed** | `AgentDashboard.jsx`, `AgentEarnings.jsx` |
| **R-DLV-02**  | Pickup Assignment| Atomic first-accept concurrency lock | **Passed** | `AgentAvailable.jsx`, `deliveryService.js` |
| **R-DLV-03**  | Delivery OTP | 6-digit cryptographic OTP, never logged, verified on deliver | **Passed** | `deliveryAndAdmin.test.js` |
| **R-DLV-04**  | Customer Privacy| Delivery agent only sees name, city, and pincode | **Passed** | Address isolation enforced in API |
| **R-DLV-05**  | Delivery Exceptions| Failed delivery report, retry, return-to-vendor | **Passed** | `AgentDeliveries.jsx`, `deliveryService.js` |
| **R-DLV-06**  | Agent Incentives | Weekly delivery milestone progress bar | **Passed** | `AgentEarnings.jsx` |
| **R-ADM-01**  | Admin Metrics | Real-time counts: users, stock, orders, GMV | **Passed** | `AdminOverview.jsx` |
| **R-ADM-02**  | Vendor Governance| Review profiles, approve, reject, suspend, warn | **Passed** | `AdminVendors.jsx`, `dashboards.test.jsx` |
| **R-ADM-04**  | Safe Vendor Deletion| Block deletion if shipments, refunds or payable funds exist | **Passed** | Safeguards modal in UI & backend rejection |
| **R-ADM-05**  | Financial Reports | Revenue, platform commission %, vendor share, settlements | **Passed** | `AdminReports.jsx`, `adminReportsController.js` |
| **R-ADM-06**  | Marketplace Settings| Commission %, tax mode (inclusive/exclusive), shipping | **Passed** | `AdminSettings.jsx` |
| **R-CPN-01**  | Atomic Coupons | Fixed / percent discount, min purchase, usage caps | **Passed** | `AdminCoupons.jsx`, `coupons.test.js` |
| **R-CPN-02**  | Per-Product Coupons| Create coupon for specific product modal | **Passed** | `AdminListings.jsx`, `commerce.js` |
| **R-REV-01**  | Product Reviews | Verified buyer purchase check before review creation | **Passed** | `Product.jsx`, `reviewController.js` |
| **R-RT-01**   | Socket.IO Notifications| Real-time alerts for orders, pickups, and OTPs | **Passed** | `SocketContext.jsx`, `NotificationBell.jsx` |
| **R-DB-02**   | Mongo Transactions| Replica set transactions prevent stock double-selling | **Passed** | Verified in `checkout.test.js` concurrency tests |
