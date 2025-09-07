# 🏠 Localhost Setup Guide - Automated Login with Email Verification

## 🎯 **What This Does**

- 🔐 **Automatically logs into DAT.com** with your credentials
- 📧 **Handles email verification codes** (automated if Gmail configured)
- 🚛 **Scrapes load data** from the load board
- 💾 **Saves to localhost CSV file** (`dat_one_loads_localhost.csv`)
- 👁️ **Visual browser** so you can monitor progress

## 📋 **Prerequisites**

1. **DAT.com account** with valid credentials
2. **Node.js and npm** installed
3. **Gmail account** (optional, for automated email verification)

## ⚙️ **Setup Steps**

### **1. Set up your credentials**

Create a `.env` file in the project root:

```bash
# Required - DAT.com credentials
DAT_ONE_USERNAME=your_dat_username
DAT_ONE_PASSWORD=your_dat_password

# Optional - Gmail for automated email verification
GMAIL_USERNAME=your_gmail@gmail.com
GMAIL_PASSWORD=your_gmail_app_password
```

### **2. Gmail App Password (Optional but Recommended)**

For automated email verification, you'll need a Gmail App Password:

1. Go to [Google Account settings](https://myaccount.google.com/)
2. Enable **2-Step Verification** if not already enabled
3. Go to **Security** → **App passwords**
4. Generate an app password for "Mail"
5. Use this app password (not your regular Gmail password) in the `.env` file

### **3. Install dependencies**

```bash
npm install
```

## 🚀 **How to Run**

### **Option 1: Full Automated (Recommended)**

```bash
npm run localhost
```

### **Option 2: Direct Script**

```bash
npm run localhost:auto
```

### **Option 3: Manual Override**

```bash
# If you want manual login like before
npm run localhost:manual
```

## 📊 **What Happens**

1. **Browser opens** (visible Chrome window)
2. **Navigates to DAT.com login**
3. **Enters your credentials automatically**
4. **Handles email verification:**
   - If Gmail configured: automatically retrieves code
   - If not: prompts you to enter code manually
5. **Navigates to load board**
6. **Extracts load data**
7. **Saves to CSV file**

## 🔍 **Monitoring Progress**

Watch the terminal for detailed logs:

```
🏠 LOCALHOST: Starting browser for automated login with email verification
🔐 Starting automated DAT.com login process
📧 Email verification required
📬 Checking Gmail for verification code
✅ Found verification code in Gmail
🚛 Navigating to load board
🔍 Starting load extraction
📊 Found 25 loads, processing 25
💾 Saved 25 records to output/dat_one_loads_localhost.csv
🎉 SUCCESS! Scraped 25 loads
```

## 📁 **Output Files**

- **CSV Data**: `output/dat_one_loads_localhost.csv`
- **Logs**: Terminal output with timestamps

## 🛠️ **Troubleshooting**

### **"Missing DAT credentials" Error**

- Make sure `.env` file exists with `DAT_ONE_USERNAME` and `DAT_ONE_PASSWORD`
- Or export them: `export DAT_ONE_USERNAME=your_username`

### **Email Verification Issues**

- **Without Gmail**: You'll see a prompt to manually enter the code in the browser
- **With Gmail**: Make sure you're using an App Password, not your regular password
- **Code not found**: The script will fall back to manual entry

### **Login Failures**

- Check your DAT.com credentials are correct
- Make sure your account isn't locked
- Try logging in manually first to verify credentials

### **No Loads Found**

- The script will show "No load rows found" if the page structure changed
- Check if you're properly logged in and on the load board

## 🔄 **Environment Separation**

This localhost scraper is completely separate from:

- ☁️ **GCP production scraper** (`src/production-scraper.js`)
- 🐳 **Docker deployment**
- 🔧 **Manual Chrome debugging** approach

Each has its own:

- ✅ **Separate scripts**
- ✅ **Separate CSV files**
- ✅ **Separate configurations**
- ✅ **Clear environment detection**

## 📈 **Next Steps**

Once localhost is working perfectly:

1. **Test thoroughly** with your credentials
2. **Verify data quality** in the CSV file
3. **Move to GCP deployment** with same credentials
4. **Set up automated scheduling** in the cloud

## 🎯 **Commands Summary**

```bash
# Full automated localhost scraping
npm run localhost

# Just the scraper (no credential checks)
npm run localhost:auto

# Old manual approach (if needed)
npm run localhost:manual
```
