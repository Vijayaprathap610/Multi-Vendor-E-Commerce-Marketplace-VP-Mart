# VP Mart – Security Architecture & Vulnerability Assessment Report

**System**: VP Mart Multi-Vendor E-Commerce Platform  
**Target Environment**: Production (Netlify + Render + MongoDB Atlas)  
**Security Standard**: OWASP Top 10 Compliance Review

---

## 1. Authentication & Session Defense

### HttpOnly Cookie Isolation
- **Mechanism**: Session credentials (`vp_access` JWT and `vp_refresh` token) are issued exclusively with the `HttpOnly` cookie flag.
- **Threat Mitigated**: **Cross-Site Scripting (XSS) Credential Theft**. Even if malicious JavaScript were injected into a third-party dependency, the script cannot read or exfiltrate the user's authentication tokens via `document.cookie`.
- **Cross-Domain Configuration**: In production, cookies are flagged with `SameSite=None` and `Secure=true`, ensuring tokens are transmitted exclusively over encrypted HTTPS connections between Netlify and Render.

### Refresh Token Rotation with Automatic Theft Detection
- **Mechanism**: Every time `/api/auth/refresh` is called, the current refresh token is immediately invalidated in the database and replaced with a newly generated cryptographically random string.
- **Theft Detection**: If an attacker attempts to replay a previously consumed refresh token, the backend detects the anomaly, flags the session family as compromised, and invalidates all active sessions associated with that user account.

### Password Security & Storage
- **Algorithm**: Passwords are hashed using **Bcrypt** with an adaptive work factor of 12 rounds in production (`bcrypt.hash(password, 12)`).
- **Protection**: Mitigates rainbow table attacks and offline dictionary cracking in the event of an unauthorized database dump.

---

## 2. Cross-Site Request Forgery (CSRF) Mitigation

Because cross-domain cookies require `SameSite=None`, ambient cookies alone are vulnerable to CSRF attacks. VP Mart enforces a **Double-Submit Cookie Defense**:
1. Upon initial load or login, the server generates a cryptographically random CSRF token stored in a readable cookie (`vp_csrf`).
2. Frontend Axios interceptors automatically extract this cookie value and append it as an explicit HTTP request header: `x-csrf-token`.
3. The backend middleware (`backend/src/middlewares/csrf.js`) validates that the header matches the secret. Requests lacking a matching header return `403 Forbidden` before executing any state-modifying business logic (`POST`, `PUT`, `DELETE`, `PATCH`).

---

## 3. Data Integrity & Financial Precision

### Integer-Based Paise Currency Model
- **Vulnerability Prevented**: Floating-point precision exploitation (e.g. `0.1 + 0.2 = 0.30000000000000004`).
- **Implementation**: All product prices, cart subtotals, shipping charges, coupon discounts, and Razorpay charges are calculated strictly in integer **paise** (`1 INR = 100 paise`).

### Atomic Inventory Reservation & Concurrency Guards
- Checkouts run inside isolated **MongoDB Transactions** (`session.startTransaction()`).
- Atomic decrement operators (`{ stock: { $gte: quantity } }`) prevent race condition overselling during concurrent checkout attempts.

---

## 4. Input Validation & Injection Prevention

### Strict Zod Schema Validation
Every route payload is validated against compile-time Zod schemas. Any undeclared or malicious fields are stripped automatically:
- Strict string lengths, email regex, integer bounds, and enum restrictions are enforced.
- Payloads failing validation are halted with `422 Unprocessable Entity` before interacting with the database layer.

### NoSQL Injection Defense
Mongoose schemas enforce strict type casting. Raw user input is never concatenated into queries, preventing typical NoSQL injection attacks (e.g. `{ $gt: "" }`).

---

## 5. Network, Headers & Infrastructure Protection

### Helmet Security Headers
The Express application mounts `helmet()` to enforce standard defensive browser headers:
- `Content-Security-Policy`: Restricts unauthorized script injection.
- `X-Frame-Options: DENY`: Prevents clickjacking attacks by forbidding iframe embedding.
- `Strict-Transport-Security`: Enforces HTTPS communication (HSTS).
- `X-Content-Type-Options: nosniff`: Prevents MIME-type confusion attacks.

### Multi-Origin CORS Enforcement
The CORS middleware enforces an explicit origin whitelist configured in `CLIENT_ORIGIN`. Unrecognized domains attempting to make credentialed preflight requests are rejected with a CORS error.

### Rate Limiting & DoS Mitigation
Express rate limiting is applied across three tiers:
1. **Auth Endpoints** (`/api/auth/*`): Strict threshold (10 attempts / 15 minutes) to defeat brute-force credential stuffing.
2. **General API** (`/api/*`): 100 requests / minute per IP address.
3. **Strict Endpoints** (Payment verification, coupon application): 20 requests / minute.

---

## 6. Secure File & Image Upload Handling

The image upload pipeline (`backend/src/services/storage.js`) implements layered sanitization:
1. **MIME Verification**: Only `image/jpeg`, `image/png`, `image/webp`, and `image/avif` are accepted.
2. **Path Traversal Protection**: Filenames are discarded and replaced with UUIDv4 strings to prevent directory traversal exploits (`../../etc/passwd`).
3. **Image Re-Encoding**: All uploads are processed and re-compressed through **Sharp**, stripping hidden EXIF metadata or embedded malicious payloads before saving.

---

## 7. Recommended Security Enhancements for Roadmap

1. **Two-Factor Authentication (2FA / TOTP)**: Introduce authenticator app support (Google Authenticator) for Admin and Vendor accounts.
2. **Automated Account Lockout**: Implement temporary account lockouts after 5 consecutive failed login attempts.
3. **Email Verification**: Enforce email ownership verification before granting vendor catalog publishing permissions.
