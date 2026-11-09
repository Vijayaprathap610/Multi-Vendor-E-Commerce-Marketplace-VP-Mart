# VP Mart – Project Presentation & Visual Documentation Package

Welcome to the **VP Mart Presentation & Visual Documentation Package**. This directory contains the complete set of high-resolution diagram images, editable Mermaid source models, the 10-minute presentation script, and the corporate 16:9 widescreen PowerPoint presentation for the **VP Mart** full-stack multi-vendor marketplace.

---

## 1. Directory Structure

```text
VP-MART-PRESENTATION/
├── README.md                          <- Package Overview & Index
├── 10-Minute-Presentation-Script.md   <- Timed Speaking Script (~10 Minutes)
├── VP-Mart-Presentation.pptx          <- 13-Slide Professional Corporate Widescreen Presentation
│
├── diagrams/                          <- 10 High-Resolution PNG Images (1600x960, 300 DPI)
│   ├── system-architecture.png
│   ├── customer-workflow.png
│   ├── vendor-workflow.png
│   ├── admin-workflow.png
│   ├── authentication-workflow.png
│   ├── checkout-workflow.png
│   ├── payment-workflow.png
│   ├── database-er-diagram.png
│   ├── api-communication.png
│   └── deployment-architecture.png
│
└── mermaid-source/                    <- Editable Mermaid Specification Files (.mmd)
    ├── system-architecture.mmd
    ├── customer-workflow.mmd
    ├── vendor-workflow.mmd
    ├── admin-workflow.mmd
    ├── authentication-workflow.mmd
    ├── checkout-workflow.mmd
    ├── payment-workflow.mmd
    ├── database-er-diagram.mmd
    ├── api-communication.mmd
    └── deployment-architecture.mmd
```

---

## 2. Diagram Catalog & Description

| No. | Diagram Name | PNG Image File | Mermaid Source | Description |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **System Architecture** | `diagrams/system-architecture.png` | `mermaid-source/system-architecture.mmd` | Three-tier architecture showing React 19 Frontend, Express 5 Gateway, Controllers, MongoDB Atlas, Redis & Razorpay. |
| **2** | **Customer Workflow** | `diagrams/customer-workflow.png` | `mermaid-source/customer-workflow.mmd` | Complete customer journey: Discovery, Cart, Pricing Quote, Razorpay Payment, and 6-Digit OTP Doorstep Handover. |
| **3** | **Vendor Workflow** | `diagrams/vendor-workflow.png` | `mermaid-source/vendor-workflow.mmd` | Merchant lifecycle: Registration, GSTIN KYC Verification, Catalog Creation, Sharp Image Compression & Ledger Settlements. |
| **4** | **Admin Workflow** | `diagrams/admin-workflow.png` | `mermaid-source/admin-workflow.mmd` | Marketplace administration: User role management, Vendor KYC approval, Listing moderation, and Tamper-evident Audit Trail. |
| **5** | **Authentication Workflow**| `diagrams/authentication-workflow.png` | `mermaid-source/authentication-workflow.mmd` | HttpOnly cookie architecture, Double-Submit CSRF, Silent Token Rotation, and Automatic Replay/Theft Detection. |
| **6** | **Checkout Workflow** | `diagrams/checkout-workflow.png` | `mermaid-source/checkout-workflow.mmd` | Address validation, Dynamic pricing quote, Promotional coupon validation, and Atomic MongoDB Inventory Locks. |
| **7** | **Razorpay Payment Workflow**| `diagrams/payment-workflow.png` | `mermaid-source/payment-workflow.mmd` | Gateway order generation, Interactive checkout modal, Server-side HMAC SHA256 signature verification & Webhook recovery. |
| **8** | **Database ER Diagram** | `diagrams/database-er-diagram.png` | `mermaid-source/database-er-diagram.mmd` | Complete entity-relationship model across all 27 Mongoose collections with foreign keys, indexes, and field definitions. |
| **9** | **API Communication** | `diagrams/api-communication.png` | `mermaid-source/api-communication.mmd` | Axios interceptor pipeline, CSRF header injection, Transport protocols (HTTPS + WSS), and Express 5 Route table. |
| **10**| **Deployment Architecture**| `diagrams/deployment-architecture.png` | `mermaid-source/deployment-architecture.mmd` | Distributed cloud deployment: Netlify Edge CDN (Frontend), Render Web Service (Backend), and MongoDB Atlas (Database). |

---

## 3. PowerPoint Presentation (`VP-Mart-Presentation.pptx`)

The PowerPoint presentation is built in a modern **16:9 Widescreen format** using a dark corporate aesthetic matching the VP Mart brand. It contains **13 fully formatted slides**:

1. **Title Slide**: Project title, tagline, technology summary, and presenter credentials.
2. **Problem Statement & Objectives**: Real-world retail commerce challenges vs. VP Mart engineering solutions.
3. **Brand Identity & Core Pillars**: Brand values, multi-tenant user personas, and design principles.
4. **Technology Stack Matrix**: Exhaustive breakdown of Frontend, Backend, Database, Security, and Cloud services.
5. **System Architecture Diagram**: High-resolution embedded diagram with key component callouts.
6. **Customer Journey Workflow**: End-to-end shopping journey with OTP handover callouts.
7. **Vendor Lifecycle Workflow**: Merchant KYC verification, catalog management, and automated ledger settlements.
8. **Admin Governance & Oversight**: Administrative moderation queues, promotional coupons, and audit logs.
9. **Authentication & Defensive Security**: HttpOnly cookies, Double-Submit CSRF, and token rotation.
10. **Shopping Cart, Checkout & Payments**: Atomic stock reservation, Razorpay modal, and PDF tax invoices.
11. **Database Architecture & ER Model**: Mongoose schema relations and integer paise financial design.
12. **Testing Verification & QA Sign-Off**: Verification of **125/125 Vitest tests passing**, sub-second Vite build, and Render/Netlify production configuration.
13. **Key Engineering Challenges & Future Roadmap**: Solved concurrency and security challenges, future roadmap (Elasticsearch, React Native, 2FA), and closing statement.

---

## 4. 10-Minute Presentation Script (`10-Minute-Presentation-Script.md`)

The presentation script is written in natural, professional English and divided into 12 timed segments totaling approximately 10 minutes. Each section includes:
- Target speaking timestamps;
- Reference to the corresponding slide and diagram;
- Word-for-word spoken dialogue ready for presentation delivery.
