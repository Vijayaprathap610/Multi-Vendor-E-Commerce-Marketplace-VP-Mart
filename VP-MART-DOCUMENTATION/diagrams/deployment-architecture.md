# Production Deployment & Infrastructure Diagram

```mermaid
flowchart TD
    Developer([Software Engineer]) -->|git push origin main| GitHub["GitHub Repository\n(Monorepo Source Control)"]

    GitHub -->|Continuous Deployment Webhook| Netlify
    GitHub -->|Continuous Deployment Webhook| Render

    subgraph Netlify["Netlify Edge Network (Global CDN)"]
        SPA["React 19 SPA Build\n(Vite 8 / 509 Chunks)"]
        RedirectRule["_redirects\n(/* -> /index.html 200)"]
        NetlifyEnv["Environment Variables\nVITE_API_URL\nVITE_SOCKET_URL"]
    end

    subgraph Render["Render Web Service (Cloud Container)"]
        ExpressApp["Node.js 22 LTS / Express 5 API\nPort: 10000"]
        WSServer["Socket.IO Server\nWebSockets & Long Polling"]
        HealthEndpoint["/api/health Health Check"]
        RenderEnv["Environment Variables\nMONGODB_URI\nJWT_SECRET\nCLIENT_ORIGIN\nCOOKIE_SAMESITE=none\nCOOKIE_SECURE=true"]
    end

    subgraph Atlas["MongoDB Atlas Cloud"]
        ReplicaCluster[("Replica Set Cluster (3 Nodes)\n27 Collections & ACID Transactions\nIP Whitelist: 0.0.0.0/0")]
    end

    subgraph External["External Cloud Integrations"]
        RazorpayGateway["Razorpay API & Webhook Service"]
        AWSS3["AWS S3 (Optional Persistent Media)"]
        RedisServer["Redis Cache (Optional Fallback)"]
    end

    Netlify -->|HTTPS Cross-Domain REST Requests\nwithCredentials: true (HttpOnly Cookies)| Render
    Netlify <-->|WSS Real-time Bidirectional Events| Render
    Render -->|TLS Encrypted Mongoose Connection| Atlas
    Render <-->|Order Creation & Signature Verification| RazorpayGateway
    Render -.->|STORAGE_DRIVER=s3| AWSS3
    Render -.->|REDIS_URL| RedisServer
```
