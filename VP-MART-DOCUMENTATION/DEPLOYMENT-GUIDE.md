# VP Mart – Production Deployment Guide

This guide details the end-to-end procedure for deploying **VP Mart** into production using **Netlify** (Frontend SPA) and **Render** (Node.js Backend Web Service), backed by **MongoDB Atlas**.

---

## 1. Production Architecture Overview

```mermaid
flowchart TD
    User([End User Browser])
    
    subgraph Netlify["Netlify Edge Network (Frontend)"]
        SPA["React 19 SPA (Vite 8 Build)\nCustom Domain / *.netlify.app"]
        Redirects["_redirects SPA Rewrite Rule\nSecurity Headers"]
    end
    
    subgraph Render["Render Web Service (Backend)"]
        API["Express 5 REST API\nNode.js 22 LTS"]
        Socket["Socket.IO Server"]
        Health["/api/health Check"]
    end
    
    subgraph Database["MongoDB Atlas (Cloud)"]
        Atlas["Atlas Replica Set\nAuto-indexed Collections"]
    end
    
    subgraph ThirdParty["Integrated Cloud Services"]
        Razorpay["Razorpay Gateway\n(Payment & Webhooks)"]
        AWS["AWS S3 (Optional)\nPersistent Uploads"]
        Redis["Redis (Optional)\nDistributed Cache"]
    end
    
    User -->|HTTPS GET Assets| Netlify
    User <-->|HTTPS REST API + Cookie Auth| Render
    User <-->|WSS Real-time Events| Render
    Render -->|Mongoose TLS| Atlas
    Render <-->|API Verification| Razorpay
    Render -.->|Storage Driver| AWS
    Render -.->|Cache Driver| Redis
```

---

## 2. Step 1: MongoDB Atlas Configuration

1. **Create an Atlas Cluster**:
   - Create a free `M0` or dedicated `M10+` cluster on AWS in your target region (e.g., `ap-south-1` Mumbai).
2. **Configure Database User**:
   - Create a database user (e.g., `vpmart_app`) with `readWriteAnyDatabase` privileges.
3. **Network Access (IP Whitelist)**:
   - Navigate to **Security → Network Access**.
   - Add IP address `0.0.0.0/0` (Allow Access from Anywhere) because Render allocates dynamic outgoing IP addresses for web services.
4. **Obtain Connection String**:
   - Connection URI format:
     ```text
     mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/vpmart?retryWrites=true&w=majority
     ```

---

## 3. Step 2: Render Backend Deployment

1. **Create a New Web Service**:
   - Connect your GitHub repository on [dashboard.render.com](https://dashboard.render.com).
   - Select the `backend` subdirectory as the **Root Directory**.
2. **Build & Runtime Configuration**:
   - **Environment**: `Node`
   - **Node Version**: `22.x`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
3. **Configure Environment Variables**:

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `NODE_ENV` | Production environment flag | `production` |
| `PORT` | Web server listening port | `10000` (Render binds automatically) |
| `MONGODB_URI` | Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/vpmart` |
| `JWT_SECRET` | Cryptographic secret for signing tokens | High-entropy 64-character random string |
| `CLIENT_ORIGIN` | Allowed CORS frontend origins | `https://vpmart.netlify.app` |
| `COOKIE_SECURE` | Enforce HTTPS-only cookie transmission | `true` |
| `COOKIE_SAMESITE`| Cross-domain cookie policy | `none` (Required for cross-subdomain auth) |
| `RAZORPAY_KEY_ID`| Razorpay live or test key ID | `rzp_live_...` or `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay secret key | `...` |
| `STORAGE_DRIVER` | File storage provider (`local` or `s3`)| `local` (or `s3`) |
| `REDIS_URL` | Optional Redis instance URL | Leave blank to fallback to memory cache |

---

## 4. Step 3: Netlify Frontend Deployment

1. **Link Repository on Netlify**:
   - In Netlify dashboard, click **Add new site → Import an existing project**.
   - Connect the same GitHub repository.
2. **Build Settings**:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/dist`
3. **Environment Variables**:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://<your-render-app>.onrender.com/api` | Full URL to production API |
| `VITE_SOCKET_URL` | `https://<your-render-app>.onrender.com` | Base origin for Socket.IO |

4. **Verify SPA Routing**:
   - Ensure `frontend/public/_redirects` contains:
     ```text
     /*    /index.html   200
     ```
   - This ensures refreshing deep client routes (`/account`, `/checkout`, `/admin`) does not result in a Netlify 404.

---

## 5. Step 4: Cross-Service Synchronization

Once both services deploy:
1. Copy your final Netlify URL (e.g. `https://vpmart.netlify.app`).
2. Go to your Render Backend Service → **Environment Variables**.
3. Set `CLIENT_ORIGIN` to your Netlify URL (or comma-separated if supporting custom domains):
   ```text
   CLIENT_ORIGIN=https://vpmart.netlify.app,https://www.vpmart.com
   ```
4. Render will automatically redeploy the backend with the new allowed CORS origins.

---

## 6. Step 5: Post-Deployment Admin Seeding

To create the initial Super Administrator account on the live database:
1. Open the **Render Shell** tab on your backend service dashboard.
2. Run the interactive seeder:
   ```bash
   npm run seed:admin
   ```
3. Enter the desired administrator email and secure password when prompted.
4. Log in at `https://vpmart.netlify.app/login` using the newly seeded administrator credentials.

---

## 7. Render Free Tier Cold Start Mitigation

Render's free tier spins down web services after 15 minutes of inactivity. When a customer accesses the website, the initial API call can take 30–50 seconds while the container boots.
- **Mitigation Strategy**: Configure an external ping service (such as [UptimeRobot](https://uptimerobot.com) or [Cron-Job.org](https://cron-job.org)) to ping `https://<your-backend>.onrender.com/api/health` every 10 minutes.
