#!/bin/bash

echo "🏠 LOCALHOST SCRAPER - Automated Login with Email Verification"
echo "============================================================="
echo ""
echo "This will run the scraper in LOCALHOST mode where:"
echo "🔐 Automatically logs into DAT.com with your credentials"
echo "📧 Handles email verification (automated if Gmail configured)"
echo "🚛 Scrapes load data and saves to localhost CSV"
echo "👁️  Chrome opens visually so you can monitor progress"
echo ""

# Check for required credentials
if [ -z "$DAT_ONE_USERNAME" ] || [ -z "$DAT_ONE_PASSWORD" ]; then
    echo "❌ Missing DAT.com credentials!"
    echo ""
    echo "Please set your credentials in .env file or export them:"
    echo "  export DAT_ONE_USERNAME=your_username"
    echo "  export DAT_ONE_PASSWORD=your_password"
    echo ""
    echo "Optional (for automated email verification):"
    echo "  export GMAIL_USERNAME=your_gmail"
    echo "  export GMAIL_PASSWORD=your_gmail_app_password"
    echo ""
    exit 1
fi

echo "✅ DAT credentials found for user: $DAT_ONE_USERNAME"

if [ -n "$GMAIL_USERNAME" ] && [ -n "$GMAIL_PASSWORD" ]; then
    echo "✅ Gmail credentials found - will attempt automated email verification"
else
    echo "⚠️  Gmail credentials not found - you'll need to manually enter verification codes"
fi

echo ""
echo "🚀 Starting localhost scraper with automated login..."
echo "📊 Watch the browser window and terminal for progress"
echo ""

# Run the localhost scraper
node src/localhost-scraper.js