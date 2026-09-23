## Deployment & Security Configuration

### 1. Basic Deployment

First, update the routes in `wrangler.jsonc` to point to your own custom domain/subdomain.

Second, deploy the Worker to Cloudflare:

```bash
npm run deploy

```

Finally, deploy a token secret that will be used to sign tokens with significant complexity (using a password generator with a good length should do).

```
npx wrangler secret put TOKEN_SECRET
```

---

### 2. Configure WAF Rate Limits (Recommended)

The built-in Worker rate limit bindings protect your application out of the box, but blocked requests still execute Worker code first.

To drop bad traffic at the network edge before it hits your Worker or incurs costs, set up WAF Rate Limiting rules in the Cloudflare Dashboard.

#### Setup Instructions:

1. Open the **Cloudflare Dashboard** and select your domain.
2. Go to **Security** $\rightarrow$ **Security rules**.
3. Click **Create rule** $\rightarrow$ **Rate limiting rules**.

---

#### Option A: Free Tier Plan (1 Rule Available)

Since Cloudflare's Free tier limits you to **1 Rate Limiting rule**, focus entirely on protecting expensive mutation paths. Let CDN edge caching handle protecting your `GET` reads.

* **Rule Name:** `Limit Hypergram Writes`
* **Expression:** `http.host eq "yourdomain.com" and http.request.method in {"POST" "PUT" "DELETE"}`
* **Rate:** 2 to 3 requests per 10 seconds
* **Action:** `Block`

---

#### Option B: Pro / Business / Enterprise Tier Plans (Multiple Rules Available)

If you have multiple rules available, create separate rules for write and read paths:

**Rule 1: Write Operations (Strict)**

* **Rule Name:** `Limit Hypergram Writes`
* **Expression:** `http.host eq "yourdomain.com" and http.request.method in {"POST" "PUT" "DELETE"}`
* **Rate:** 2 to 3 requests per 10 seconds
* **Action:** `Block`

**Rule 2: Read Operations (Generous)**

* **Rule Name:** `Limit Hypergram Reads`
* **Expression:** `http.host eq "yourdomain.com" and http.request.method eq "GET"`
* **Rate:** 30 to 50 requests per 10 seconds
* **Action:** `Block` or `Managed Challenge`

---

> **Note:** Replace `"yourdomain.com"` (or target a specific subdomain like `"api.yourdomain.com"`) with your actual domain. WAF rules require a custom domain on your Cloudflare account and do not apply to default `*.workers.dev` subdomains.