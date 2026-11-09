# VP Mart – Future Enhancements & Engineering Roadmap

This document outlines the strategic engineering roadmap and planned architectural enhancements for future iterations of **VP Mart**.

---

## 1. Core Architecture & Scalability

### 1.1 Dedicated Search Engine (Elasticsearch / OpenSearch)
- **Current State**: Catalog search relies on MongoDB text indexes with regex fallback.
- **Future Enhancement**: Integrate a dedicated Elasticsearch or OpenSearch cluster.
- **Benefits**: Typo tolerance (fuzzy matching), faceted search filters, auto-complete suggestions with sub-millisecond response times, and personalized relevance scoring based on user search history.

### 1.2 Redis Cluster & Distributed Session Cache
- **Current State**: Redis is optional; sessions fallback to database lookups if `REDIS_URL` is omitted.
- **Future Enhancement**: Deploy a managed Redis cluster for distributed token blacklisting, cart caching, and Socket.IO multi-server Pub/Sub adapter (`@socket.io/redis-adapter`) to enable horizontal scaling across multiple backend worker nodes.

### 1.3 Native AWS S3 / Cloudflare R2 Persistent Storage
- **Current State**: Defaults to local disk storage (`./uploads`), which is ephemeral on Render free tier containers.
- **Future Enhancement**: Configure production AWS S3 or Cloudflare R2 bucket storage with a Cloudflare CDN distribution layer, delivering optimized WebP/AVIF images globally with low latency.

---

## 2. Advanced Logistics & Hyperlocal Operations

### 2.1 Live Courier GPS Tracking with Mapbox / Leaflet
- **Current State**: Delivery milestones are status-driven (`accepted` → `picked_up` → `delivered`).
- **Future Enhancement**: Integrate real-time courier GPS coordinates broadcast over Socket.IO, displaying a live animated delivery van moving on an interactive map for the customer.

### 2.2 Dynamic Courier Routing & Batching
- Implement Dijkstra-based or Google Directions API route optimization to enable delivery agents to batch multiple nearby pickup orders efficiently on a single dispatch run.

---

## 3. Commercial & Vendor Features

### 3.1 Automated Split Payouts via Razorpay Route
- **Current State**: Settlements are ledgered in MongoDB and paid out via manual administrative ledger transfers.
- **Future Enhancement**: Integrate **Razorpay Route** to automatically deduct platform marketplace commission (e.g. 8%) and disburse the remaining 92% directly to the vendor's linked bank account upon successful order delivery.

### 3.2 Tiered Vendor Subscription Plans
- Allow vendors to subscribe to premium store plans (e.g., Bronze, Silver, Gold) with perks like lower commission rates, priority homepage banner placement, and advanced analytics dashboards.

---

## 4. Mobile Application Clients

### 4.1 React Native Cross-Platform App
- Develop a unified **React Native** application for iOS and Android targeting Customers and Delivery Agents.
- Enable push notifications (via Firebase Cloud Messaging) for instant delivery alerts, OTP verification, and order status updates.

---

## 5. Security & Enterprise Compliance

1. **Two-Factor Authentication (2FA)**: Time-based One-Time Password (TOTP) support via Google Authenticator or Authy for Admin and Vendor portal access.
2. **Automated Account Lockout**: Automatic 30-minute lockout after 5 consecutive failed login attempts.
3. **GST E-Invoicing Compliance**: Direct integration with the Indian GST portal API to generate official IRN (Invoice Reference Numbers) and QR codes on PDF invoices.
