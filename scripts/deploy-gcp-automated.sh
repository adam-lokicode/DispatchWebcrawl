#!/bin/bash

echo "☁️ GCP MODE - Automated Login"
echo "============================="
echo ""
echo "This will deploy to GCP with automated login:"
echo "🤖 Headless Chrome (no visual browser)"
echo "🔐 Automated login with stored credentials"
echo "📊 Fully automated data collection"
echo ""

# Check for required credentials
if [ -z "$DAT_ONE_USERNAME" ] || [ -z "$DAT_ONE_PASSWORD" ]; then
    echo "❌ Missing DAT.com credentials!"
    echo ""
    echo "Please set your credentials:"
    echo "  export DAT_ONE_USERNAME=your_username"
    echo "  export DAT_ONE_PASSWORD=your_password"
    echo ""
    echo "Or create a .env file with these values."
    exit 1
fi

echo "✅ Credentials found for user: $DAT_ONE_USERNAME"
echo ""

# Set GCP environment variables
export NODE_ENV=production
export HEADLESS=true
export LOG_LEVEL=info

echo "🚀 Deploying to GCP with automated authentication..."
echo ""

# Deploy with credentials
gcloud run deploy dispatch-webcrawl-scraper \
    --image=gcr.io/crawler-470604/dispatch-webcrawl-scraper \
    --platform=managed \
    --region=us-central1 \
    --memory=2Gi \
    --cpu=2 \
    --concurrency=1 \
    --min-instances=1 \
    --max-instances=3 \
    --port=8080 \
    --service-account=scraper-gsa@crawler-470604.iam.gserviceaccount.com \
    --set-env-vars="NODE_ENV=production,HEADLESS=true,LOG_LEVEL=info,DAT_ONE_USERNAME=$DAT_ONE_USERNAME,DAT_ONE_PASSWORD=$DAT_ONE_PASSWORD" \
    --timeout=900

echo ""
echo "✅ GCP deployment completed!"
echo "📊 Check logs: gcloud run services logs read dispatch-webcrawl-scraper --region=us-central1"
