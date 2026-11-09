# VP Mart – Website Workflow Documentation
## End-to-End Operational Workflow Specifications

This document outlines the detailed workflows implemented in the VP Mart marketplace across Customer, Vendor, Admin, Authentication, and Payment domains.

---

## 1. Customer Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer (Buyer)
    participant UI as React Storefront (SPA)
    participant API as Backend REST API
    participant DB as MongoDB Atlas
    participant Socket as Socket.IO Server
    participant Pay as Razorpay / Simulated Gateway

    Note over Customer, UI: Browsing & Selection
    Customer->>UI: Visits Storefront or Searches for Product
    UI->>API: GET /api/catalog/search?q=... or /categories/...
    API->>DB: Query Listings (active & in-stock)
    DB-->>API: Return Results
    API-->>UI: Render Product Cards & Rails
    
    Customer->>UI: Clicks Product to View Detail Page
    UI->>API: GET /api/catalog/listings/:id
    API-->>UI: Return Product, SKU, Stock, Pricing & Reviews
    
    Customer->>UI: Clicks "Add to Cart"
    UI->>API: POST /api/cart/items { listingId, quantity }
    API->>DB: Update or Create Cart Item
    API-->>UI: Return Updated Cart Lines & Total Count
    UI-->>Customer: Visual Feedback (Cart Badge Count Updates)

    Note over Customer, UI: Checkout & Purchase
    Customer->>UI: Navigates to /checkout
    UI->>API: POST /api/checkout/preview { addressId, couponCode }
    API->>DB: Calculate Line Items, Tax, Shipping & Validate Stock
    API-->>UI: Return Order Preview & Payable Amount
    
    Customer->>UI: Selects Payment Method & Clicks "Pay Now"
    UI->>API: POST /api/checkout { addressId, paymentMethod, couponCode }
    API->>DB: Create Order (status: 'pending_payment')
    API->>Pay: Create Payment Order
    Pay-->>API: Return Provider Order Details
    API-->>UI: Launch Razorpay / Simulated Payment Modal

    Customer->>Pay: Authorizes Payment (UPI / Card / NetBanking / COD)
    Pay-->>UI: Return Payment ID & Signature
    UI->>API: POST /api/payments/verify { orderId, paymentId, signature }
    API->>DB: Verify Signature, Mark Order 'confirmed', Deduct Stock
    API->>Socket: Emit 'order:status_changed' to Buyer & Vendor
    API-->>UI: Return Success Confirmation
    UI-->>Customer: Redirect to /orders/:id Confirmation Page
```

---

## 2. Vendor Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Vendor as Independent Vendor
    participant Portal as Vendor Dashboard
    participant API as Backend REST API
    participant DB as MongoDB Atlas
    participant S3 as Storage System
    participant Socket as Socket.IO Server

    Note over Vendor, Portal: Onboarding & Profile
    Vendor->>Portal: Registers with Role 'vendor'
    Vendor->>Portal: Submits Business Details (PAN, GSTIN, Bank Account)
    Portal->>API: PUT /api/vendor/profile
    Portal->>API: POST /api/vendor/profile/submit
    API->>DB: Save Profile (status: 'pending_approval')
    API-->>Portal: Display "Pending Admin Review" Status

    Note over Vendor, Portal: Product Catalog Management
    Vendor->>Portal: Navigates to "Add Product" (/vendor/products/new)
    Vendor->>Portal: Uploads Product Images
    Portal->>API: POST /api/uploads/image (Multipart Form)
    API->>S3: Process with Sharp & Save File
    S3-->>API: Return Image URL
    API-->>Portal: Display Image Preview
    
    Vendor->>Portal: Submits Product Specs, Pricing, MRP, and Stock
    Portal->>API: POST /api/vendor/listings
    API->>DB: Create Product & Listing (status: 'active' or 'pending_approval')
    API-->>Portal: Listing Published Successfully

    Note over Vendor, Portal: Order Fulfillment
    Socket-->>Portal: Receive Real-Time Order Notification ('pickup:requested')
    Vendor->>Portal: Views Incoming Orders (/vendor/orders)
    Vendor->>Portal: Packs Package and Clicks "Request Pickup"
    Portal->>API: POST /api/vendor/shipments/:id/request-pickup
    API->>DB: Update Shipment (status: 'pickup_requested')
    API->>Socket: Broadcast to Delivery Agents
    API-->>Portal: Shipment Status Updated
```

---

## 3. Admin Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Platform Admin
    participant Console as Admin Dashboard (/admin)
    participant API as Backend REST API
    participant DB as MongoDB Atlas

    Admin->>Console: Logs in with Admin Credentials
    Console->>API: GET /api/admin/stats/overview
    API->>DB: Aggregate Sales, Total Users, Active Orders & Revenue
    DB-->>API: Aggregated Metrics
    API-->>Console: Render Analytics Tiles & Revenue Charts

    Note over Admin, Console: Vendor Management & Approval
    Admin->>Console: Navigates to Vendor Management (/admin/vendors)
    Console->>API: GET /api/admin/vendors?status=pending_approval
    API-->>Console: List of Pending Vendors
    Admin->>Console: Reviews Tax & Bank Details, Clicks "Approve"
    Console->>API: PATCH /api/admin/users/:id/status { status: 'active' }
    API->>DB: Activate Vendor Account
    API-->>Console: Vendor Approved

    Note over Admin, Console: Moderation, Categories & Delivery
    Admin->>Console: Creates New Promotional Coupon (/admin/coupons)
    Console->>API: POST /api/admin/coupons { discountType, value, validTo, ... }
    API->>DB: Generate Unique Server Code (e.g. SAVE20A1)
    API-->>Console: Coupon Created & Live
    
    Admin->>Console: Views Logistics & Delivery Network (/admin/delivery-agents)
    Console->>API: GET /api/admin/deliveries
    Admin->>Console: Assigns Delivery Agent to Pending Package
    Console->>API: POST /api/admin/deliveries/:id/assign { agentId }
    API->>DB: Update Shipment Agent & Emit Socket Event
```

---

## 4. Authentication & Session Workflow

VP Mart implements a secure authentication flow using **HttpOnly Cookies** and **Double-Submit CSRF Protection**:

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Buyer / Vendor / Admin / Agent)
    participant Client as React Client (Axios)
    participant API as Express Auth Endpoint
    participant DB as MongoDB Sessions

    User->>Client: Enters Email & Password
    Client->>API: POST /api/auth/login { email, password }
    API->>DB: Verify Email, Account Status & Compare BCrypt Hash
    DB-->>API: Credentials Valid
    API->>DB: Create Session Record in 'sessions' Collection
    
    Note over API, Client: Cookie Dispatch
    API-->>Client: HTTP 200 Response + Set-Cookie Headers:<br/>1. vp_access (JWT, HttpOnly, SameSite=None, Secure)<br/>2. vp_refresh (Random Token, HttpOnly, Path=/api/auth)<br/>3. vp_csrf (CSRF Token, JavaScript-readable)
    
    Client->>Client: Store CSRF token in memory & update user context
    
    Note over Client, API: Authenticated API Calls
    Client->>API: POST /api/cart/items (Cookie: vp_access, Header: x-csrf-token)
    API->>API: Validate CSRF (header === cookie) & Verify JWT
    API-->>Client: Processed Request

    Note over Client, API: Token Refresh (Auto-Rotation)
    Client->>API: API returns 401 UNAUTHENTICATED (access token expired)
    Client->>API: POST /api/auth/refresh (Cookie: vp_refresh)
    API->>DB: Rotate Refresh Token & Issue New Access Token
    API-->>Client: New vp_access & vp_refresh Cookies
    Client->>API: Retries Failed Request Automatically
```

---

## 5. Checkout & Payment Workflow

```mermaid
flowchart TD
    Start(["User on Cart Page"]) --> Proceed["Clicks 'Proceed to Checkout'"]
    Proceed --> LoadCheckout["Load /checkout Page"]
    
    LoadCheckout --> FetchAddresses["Fetch User Saved Addresses\n(GET /api/addresses)"]
    FetchAddresses --> SelectAddress{"Address Selected\nor New Added?"}
    
    SelectAddress -->|Yes| Quote["Request Price Quote\n(POST /api/checkout/preview)"]
    Quote --> Calculate["Server Calculates:\n- Real-time Product Prices\n- Shipping Charges (PIN distance)\n- GST / Tax Breakdown\n- Coupon Discount (if applied)"]
    
    Calculate --> DisplaySummary["Display Detailed Order Summary\n& Payment Options"]
    DisplaySummary --> SelectPay["User Selects Payment Option:\n- UPI / QR Code\n- Credit / Debit Card\n- Net Banking\n- Wallet\n- Cash on Delivery (COD)"]
    
    SelectPay --> SubmitOrder["User Clicks 'Pay Now'"]
    SubmitOrder --> CreateOrderAPI["Call POST /api/checkout\n{ addressId, paymentMethod, couponCode }"]
    
    CreateOrderAPI --> CheckStock{"Validate Real-time Stock\nAvailability in DB"}
    CheckStock -->|Insufficient| StockError["Display Stock Depleted Error\nReturn to Cart"]
    CheckStock -->|Available| Reserve["Hold Inventory & Create Order Record\n(status: 'pending_payment')"]
    
    Reserve --> IsCOD{"Is Payment Method COD?"}
    IsCOD -->|Yes| MarkConfirmed["Set Order Status = 'confirmed'\nPayment Status = 'pending'"]
    
    IsCOD -->|No (Online)| LaunchPayment{"Check Razorpay Keys"}
    LaunchPayment -->|Configured| RealRazorpay["Launch Official Razorpay Modal\n(checkout.js)"]
    LaunchPayment -->|Not Configured| DummyRazorpay["Launch Simulated Razorpay Modal\n(RazorpayModal.jsx)"]
    
    RealRazorpay --> ProcessPayment["Customer Completes Payment"]
    DummyRazorpay --> ProcessPayment
    
    ProcessPayment --> VerifySig["POST /api/payments/verify\n{ orderId, paymentId, signature }"]
    VerifySig --> ValidSig{"HMAC-SHA256\nSignature Valid?"}
    
    ValidSig -->|No| FailPayment["POST /api/payments/failed\nOrder Status = 'cancelled'\nRelease Reserved Stock"]
    ValidSig -->|Yes| ConfirmOrder["Mark Order = 'confirmed'\nPayment Status = 'paid'\nClear User Cart in DB"]
    
    MarkConfirmed --> Redirect["Redirect to /orders/:id\nConfirmation & Live Tracking"]
    ConfirmOrder --> Redirect
    FailPayment --> RetryPay["Show Error & Offer Retry Payment"]
```
