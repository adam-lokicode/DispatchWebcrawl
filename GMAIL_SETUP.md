# 📧 Gmail API Setup Guide

This guide will help you set up **official Gmail API access** for automatic verification code retrieval. This is much more reliable than browser automation!

## 🎯 Benefits

✅ **Official Google API** - No security blocks  
✅ **Automatic code extraction** - No manual entry needed  
✅ **Fast and reliable** - Direct API access  
✅ **Secure** - OAuth 2.0 authentication

## 📋 Setup Steps

### 1. **Enable Gmail API**

1. Go to [Google Cloud Console](https://console.developers.google.com/)
2. Create a new project or select existing project
3. Search for "Gmail API" and **Enable** it

### 2. **Create OAuth Credentials**

1. Go to **"Credentials"** in the left sidebar
2. Click **"Create Credentials"** → **"OAuth 2.0 Client IDs"**
3. Choose **"Desktop application"**
4. Name it something like "DAT Scraper Gmail Access"
5. Click **"Create"**

### 3. **Download Credentials**

1. Click the **Download** button (⬇️) for your new credential
2. Save the file as `gmail-credentials.json` in your project root folder
3. Make sure the file is in: `/Users/adamtoth/Documents/GitHub/DispatchWebcrawl/gmail-credentials.json`

### 4. **Initial Setup**

```bash
node src/setup-gmail.js
```

This will show you an authorization URL. Copy and visit it in your browser.

### 5. **Authorize Access**

1. Visit the authorization URL
2. Sign in to your Google account (`adam000034@gmail.com`)
3. Grant permission to read Gmail
4. Copy the authorization code you receive

### 6. **Complete Setup**

```bash
node src/setup-gmail.js YOUR_AUTHORIZATION_CODE_HERE
```

Replace `YOUR_AUTHORIZATION_CODE_HERE` with the code you got from step 5.

## 🚀 **Test It**

Once setup is complete, run your scraper:

```bash
npm run localhost
```

The scraper will now:

1. ✅ Login to DAT automatically
2. ✅ Switch to email verification automatically
3. ✅ **Check Gmail API for verification code automatically**
4. ✅ Enter the code automatically
5. ✅ Continue with scraping

## 🔧 **Troubleshooting**

### "Gmail credentials not found"

- Make sure `gmail-credentials.json` is in the project root
- Check the file is valid JSON

### "Gmail token expired"

- Run `node src/setup-gmail.js` to get a new authorization URL
- Complete the authorization process again

### "Gmail API not enabled"

- Go back to Google Cloud Console
- Make sure Gmail API is enabled for your project

## 🎉 **Success!**

When working, you'll see:

```
✅ Gmail API authenticated, searching for verification code...
✅ Found verification code via Gmail API: 123456
```

**No more manual code entry!** 🚀
