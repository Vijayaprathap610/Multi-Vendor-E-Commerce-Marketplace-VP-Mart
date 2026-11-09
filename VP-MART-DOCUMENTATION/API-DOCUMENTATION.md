# VP Mart – REST API Documentation

This document provides a comprehensive reference for the RESTful APIs exposed by the **VP Mart** backend service (`Express 5.3` on Node.js 22 LTS).

---

## 1. Global API Conventions

### Base URL
- **Local Development**: `http://localhost:5000/api`
- **Production (Render)**: `https://<render-service-name>.onrender.com/api`

### Content Types
- Request: `application/json` (or `multipart/form-data` for image file uploads)
- Response: `application/json` (or `application/pdf` for generated invoice downloads)

### Authentication & Session Management
- Authentication relies on **HTTP-only, SameSite Cookies**:
  - `vp_access`: Signed JWT access token (15-minute expiration)
  - `vp_refresh`: Opaque refresh token string stored in database sessions (7-day lifetime)
  - `vp_csrf`: Readable CSRF double-submit token passed in `x-csrf-token` header
- Endpoints requiring authentication return `401 Unauthorized` if session cookies or tokens are missing/expired.
- Endpoints requiring specific roles (`vendor`, `admin`, `delivery_agent`) return `403 Forbidden` if the user's role does not match.

### Standard Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional human-readable notice"
}
```

### Standard Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Description of the failure",
    "details": [
      { "field": "email", "issue": "Invalid email address format" }
    ]
  }
}
```

---

## 2. Authentication & Session Endpoints (`/api/auth`)

| Method | Endpoint | Access | Purpose | Request Body / Params | Key Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/auth/csrf` | Public | Obtains CSRF double-submit token | None | `{ csrfToken: "..." }` + sets `vp_csrf` cookie |
| `POST` | `/auth/register` | Public | Registers a new customer/vendor/agent | `{ name, email, password, role? }` | `{ user: { id, name, email, role } }` + auth cookies |
| `POST` | `/auth/login` | Public | Authenticates credentials & starts session | `{ email, password }` | `{ user: { id, name, email, role } }` + auth cookies |
| `POST` | `/auth/refresh` | Public (Cookie) | Rotates refresh token & issues new access token | None (uses `vp_refresh` cookie) | `{ user: { id, name, email, role } }` |
| `POST` | `/auth/logout` | Authenticated | Terminates active session and clears cookies | None | `{ success: true, message: "Logged out" }` |
| `GET` | `/auth/me` | Authenticated | Fetches current user profile and session data | None | `{ user: { id, name, email, role, avatar } }` |
| `POST` | `/auth/forgot-password` | Public | Dispatches password reset link email | `{ email }` | `{ message: "Reset email dispatched" }` |
| `POST` | `/auth/reset-password` | Public | Consumes password reset token to set new pass | `{ token, newPassword }` | `{ success: true, message: "Password updated" }` |
| `POST` | `/auth/change-password` | Authenticated | Updates password while authenticated | `{ currentPassword, newPassword }` | `{ success: true }` |

---

## 3. User Self-Management (`/api/users`)

| Method | Endpoint | Access | Purpose | Request Body / Params |
| :--- | :--- | :--- | :--- | :--- |
| `PATCH` | `/users/me` | Authenticated | Update user name, phone, preferences | `{ name?, phone?, preferences? }` |
| `POST` | `/users/me/deactivate` | Authenticated | Temporarily pause account | `{ reason? }` |
| `DELETE` | `/users/me` | Authenticated | Permanently delete customer account & data | `{ passwordConfirm }` |

---

## 4. Public Marketplace & Catalog (`/api/catalog`)

| Method | Endpoint | Access | Description | Query / Body Params |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/catalog/config` | Public | Global storefront configurations, currency, policies | None |
| `GET` | `/catalog/home` | Public | Homepage layout bundles (featured, ribbons, carousels) | None |
| `GET` | `/catalog/banners` | Public | Active homepage promotional banners | `?position=hero` |
| `GET` | `/catalog/categories` | Public | Category taxonomy hierarchy tree | None |
| `GET` | `/catalog/search` | Public | Full-text product search with filters and sorting | `?q=query&category=id&minPrice=100&sort=newest` |
| `GET` | `/catalog/suggest` | Public | Instant auto-complete search suggestions | `?q=pho` |
| `GET` | `/catalog/listings/:slug` | Public | Full listing detail with vendor info, specs, variants | `slug` (in path) |
| `GET` | `/catalog/listings/:id/reviews`| Public | Paginated user reviews and ratings | `?page=1&limit=10` |
| `GET` | `/catalog/listings/:id/related`| Public | Recommended alternative and related listings | None |
| `GET` | `/catalog/vendors/:slug` | Public | Public vendor storefront, rating, and items | `slug` (in path) |
| `GET` | `/catalog/coupons` | Public | Active public discount codes & campaign coupons | None |

---

## 5. Cart, Pricing & Discounts (`/api/cart` & `/api/coupons`)

| Method | Endpoint | Access | Purpose | Request Payload |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/cart` | Authenticated / Guest | Retrieve items, subtotals, item-level discounts | None |
| `POST` | `/cart/items` | Authenticated / Guest | Add product variant to cart | `{ listingId, quantity: 1 }` |
| `PATCH` | `/cart/items/:id`| Authenticated / Guest | Adjust item quantity | `{ quantity: 3 }` |
| `DELETE` | `/cart/items/:id`| Authenticated / Guest | Remove single item from cart | None |
| `DELETE` | `/cart` | Authenticated / Guest | Empty entire shopping cart | None |
| `POST` | `/cart/quote` | Authenticated | Calculate live delivery fees, taxes, and final total | `{ shippingAddressId }` |
| `POST` | `/coupons/apply` | Authenticated | Validate and attach promo coupon code | `{ code: "FESTIVE10" }` |
| `DELETE` | `/coupons/remove`| Authenticated | Detach coupon from active session cart | None |

---

## 6. Orders, Checkout & Payments (`/api/orders` & `/api/payments`)

| Method | Endpoint | Access | Description | Payload |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/orders/addresses` | Customer | Fetch saved delivery addresses | None |
| `POST` | `/orders/addresses` | Customer | Add new delivery address with PIN code | `{ fullName, street, city, state, pinCode, phone }` |
| `POST` | `/orders/preview` | Customer | Final pre-checkout order validation | `{ addressId, couponCode? }` |
| `POST` | `/orders/checkout` | Customer | Convert cart to placed order, reserves inventory | `{ addressId, paymentMethod: "razorpay"|"cod" }` |
| `GET` | `/orders` | Customer | List paginated customer order history | `?page=1&limit=10` |
| `GET` | `/orders/:id` | Customer | Complete order details, tracking milestones, items | Path `:id` |
| `POST` | `/orders/:id/cancel` | Customer | Request cancellation before dispatch | `{ reason: "Ordered by mistake" }` |
| `POST` | `/payments/verify` | Customer | Verify Razorpay HMAC signature & confirm payment | `{ razorpayOrderId, razorpayPaymentId, razorpaySignature }` |
| `POST` | `/payments/failed` | Customer | Record payment gateway drop-off / failure | `{ orderId, errorDescription }` |
| `POST` | `/payments/razorpay/webhook` | Public (HMAC) | Automated webhook callback from Razorpay API | Gateway payload with `x-razorpay-signature` |
| `GET` | `/orders/:id/invoice`| Customer / Admin | Download generated PDF tax invoice | Path `:id` |

---

## 7. Vendor Management API (`/api/vendor`)

| Method | Endpoint | Access | Purpose | Payload |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/vendor/profile` | Vendor | Read vendor shop information, KYC status | None |
| `PUT` | `/vendor/profile` | Vendor | Update business name, GSTIN, description, logo | `{ storeName, description, gstin, logoUrl }` |
| `GET` | `/vendor/summary` | Vendor | Metrics (revenue, low-stock alerts, pending orders) | None |
| `GET` | `/vendor/orders` | Vendor | Orders assigned to this vendor's items | `?status=pending&page=1` |
| `PATCH` | `/vendor/orders/:id/status`| Vendor | Progress item status (confirmed, packed, ready) | `{ status: "packed" }` |
| `GET` | `/vendor/listings` | Vendor | All catalog items published by this vendor | `?search=shirt&page=1` |
| `POST` | `/vendor/listings` | Vendor | Create new product listing | `{ title, categoryId, price, stock, sku, images, specs }` |
| `PUT` | `/vendor/listings/:id` | Vendor | Update listing specs, price, inventory | Listing details object |
| `DELETE` | `/vendor/listings/:id` | Vendor | Archive or unpublish a listing | Path `:id` |
| `GET` | `/vendor/settlements` | Vendor | Payout history, commissions, and transfers | `?page=1&limit=15` |

---

## 8. Hyperlocal Delivery Agent API (`/api/delivery-agent`)

| Method | Endpoint | Access | Purpose | Payload |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/delivery-agent/profile` | Delivery Agent | Current agent stats, active status, vehicle type | None |
| `PATCH`| `/delivery-agent/availability` | Delivery Agent | Toggle availability online / offline | `{ isOnline: true }` |
| `GET` | `/delivery-agent/available` | Delivery Agent | List nearby orders ready for pickup | None |
| `POST` | `/delivery-agent/accept/:id` | Delivery Agent | Claim an order for dispatch | Path `:id` |
| `POST` | `/delivery-agent/pickup/:id` | Delivery Agent | Confirm package pickup from vendor | Path `:id` |
| `POST` | `/delivery-agent/verify-otp/:id`| Delivery Agent | Validate 6-digit customer handover OTP & finalize | `{ otp: "849201" }` |
| `POST` | `/delivery-agent/failed/:id` | Delivery Agent | Mark delivery attempt failure | `{ reason: "Customer unreachable" }` |
| `GET` | `/delivery-agent/my-deliveries` | Delivery Agent | Current and completed deliveries log | `?page=1&status=completed` |
| `GET` | `/delivery-agent/earnings` | Delivery Agent | Per-delivery payout tally & tips summary | None |

---

## 9. Admin Control Suite (`/api/admin`)

| Module | Method | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Users** | `GET` | `/admin/users` | Paginated user management table with role filtering |
| | `PATCH` | `/admin/users/:id/role` | Promote/demote user role (`customer`, `vendor`, `admin`, `agent`) |
| | `PATCH` | `/admin/users/:id/status` | Suspend or reactivate user account |
| **Vendors** | `GET` | `/admin/vendors` | Vendor onboarding review queue |
| | `PATCH` | `/admin/vendors/:id/verify` | Approve or reject vendor KYC & catalog privileges |
| | `POST` | `/admin/vendors/:id/warn` | Issue official vendor compliance warning |
| **Catalog** | `POST` | `/admin/categories` | Create new department/category node |
| | `PUT` | `/admin/categories/:id` | Modify category taxonomy, icons, banner images |
| | `DELETE` | `/admin/categories/:id` | Safely remove unpopulated category |
| | `POST` | `/admin/brands` | Register official brand entity |
| | `POST` | `/admin/banners` | Upload & activate homepage promotional banners |
| | `DELETE` | `/admin/banners/:id` | Delete promotional banner and purge image |
| **Moderation**| `GET` | `/admin/listings` | Comprehensive marketplace inventory moderation |
| | `PATCH` | `/admin/listings/:id/hide` | Force hide listing with mandatory policy violation reason |
| **Coupons** | `GET` | `/admin/coupons` | List all promotional coupon campaigns |
| | `POST` | `/admin/coupons` | Create automated or fixed campaign coupons (Zod validated) |
| | `DELETE` | `/admin/coupons/:id` | Deactivate/delete coupon campaign |
| **Logistics** | `GET` | `/admin/delivery-agents` | View all delivery riders, license records, and online status |
| | `PATCH` | `/admin/delivery-agents/:id` | Approve or deactivate agent license |
| | `GET` | `/admin/deliveries/live` | Real-time map & active delivery dispatch tracking |
| **Reports** | `GET` | `/admin/reports/sales` | Platform gross merchandise value (GMV), net margins |
| | `GET` | `/admin/reports/settlements`| Vendor payout audit reports & pending reconciliations |
| **System** | `GET` | `/admin/settings` | Read site maintenance mode, tax rates, delivery fees |
| | `PUT` | `/admin/settings` | Update global marketplace parameters |
| | `GET` | `/admin/audit-logs` | Tamper-evident admin action audit trail |
