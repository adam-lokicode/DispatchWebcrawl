# 🌍 Environment Configuration Guide

## 🏠 **LOCALHOST Setup (Manual Login)**

### **Requirements:**

- Chrome browser installed
- Manual login capability
- Visual browser interface

### **Environment Variables:**

```bash
NODE_ENV=development
CHROME_CDP_URL=http://localhost:9222
HEADLESS=false
LOG_LEVEL=debug
```

### **How to Run:**

```bash
# 1. Start Chrome with remote debugging
./scripts/start-chrome-debug.sh

# 2. Manual login in browser window to DAT.com

# 3. Run scraper
node src/production-scraper.js
```

### **What Happens:**

- ✅ Chrome opens visually
- ✅ You log in manually
- ✅ Scraper connects to existing session
- ✅ No credentials needed in code

---

## ☁️ **GCP Setup (Automated Login)**

### **Requirements:**

- DAT.com credentials
- Headless browser capability
- Session persistence

### **Environment Variables:**

```bash
NODE_ENV=production
HEADLESS=true
LOG_LEVEL=info
DAT_ONE_USERNAME=your_username
DAT_ONE_PASSWORD=your_password
```

### **How to Deploy:**

```bash
# 1. Set up credentials
gcloud run deploy dispatch-webcrawl-scraper \
  --set-env-vars="DAT_ONE_USERNAME=your_username,DAT_ONE_PASSWORD=your_password"

# 2. Deploy automatically handles login
```

### **What Happens:**

- 🤖 Headless Chrome launches
- 🔐 Automated login with credentials
- 💾 Session cookies saved/restored
- 🔄 Fully automated operation

---

## 🔧 **Environment Detection Logic**

The scraper automatically detects environment:

```javascript
const isGCP =
  process.env.NODE_ENV === "production" && !process.env.CHROME_CDP_URL;
const isLocalhost =
  process.env.CHROME_CDP_URL === "http://localhost:9222" ||
  process.env.NODE_ENV !== "production";
```

- **🏠 LOCALHOST**: `CHROME_CDP_URL=http://localhost:9222` OR `NODE_ENV!=production`
- **☁️ GCP**: `NODE_ENV=production` AND no `CHROME_CDP_URL`

---

## 🚀 **Quick Commands**

### **Localhost Testing:**

```bash
export CHROME_CDP_URL=http://localhost:9222
export NODE_ENV=development
npm run chrome  # Start Chrome with debugging
npm run production  # Run scraper
```

### **GCP Deployment:**

```bash
export NODE_ENV=production
export DAT_ONE_USERNAME=your_username
export DAT_ONE_PASSWORD=your_password
./scripts/deploy-gcp.sh
```
