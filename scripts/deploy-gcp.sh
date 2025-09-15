#!/bin/bash

# GCP Deployment Script for Dispatch Webcrawl Scraper
# This script builds and deploys the scraper to Google Cloud Run

set -e

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"your-project-id"}
REGION=${GCP_REGION:-"us-central1"}
SERVICE_NAME="dispatch-webcrawl-scraper"
CHROME_SERVICE_NAME="chrome-service"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
CHROME_IMAGE_NAME="gcr.io/${PROJECT_ID}/chrome-browserless"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    log_info "Dependencies check passed ✓"
}

# Setup GCP project and enable APIs
setup_gcp() {
    log_info "Setting up GCP project..."
    
    # Set the project
    gcloud config set project $PROJECT_ID
    
    # Enable required APIs
    log_info "Enabling required APIs..."
    gcloud services enable cloudbuild.googleapis.com
    gcloud services enable run.googleapis.com
    gcloud services enable containerregistry.googleapis.com
    gcloud services enable iam.googleapis.com
    
    # Configure Docker for GCR
    gcloud auth configure-docker
    
    log_info "GCP setup completed ✓"
}

# Build and push the main scraper image
build_scraper_image() {
    log_info "Building scraper Docker image..."
    
    # Build the image
    docker build -t $IMAGE_NAME --target production .
    
    # Push to Google Container Registry
    log_info "Pushing scraper image to GCR..."
    docker push $IMAGE_NAME
    
    log_info "Scraper image built and pushed ✓"
}

# Build and push Chrome service image
build_chrome_image() {
    log_info "Building Chrome service image..."
    
    # Create a temporary Dockerfile for Chrome service
    cat > Dockerfile.chrome << EOF
FROM browserless/chrome:latest

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \\
    CMD curl -f http://localhost:3000/ || exit 1

# Set production defaults
ENV CONCURRENT=1
ENV MAX_CONCURRENT_SESSIONS=1
ENV KEEP_ALIVE=true
ENV PREBOOT_CHROME=true
ENV ENABLE_DEBUGGER=true

EXPOSE 3000
EOF
    
    # Build and push Chrome image
    docker build -f Dockerfile.chrome -t $CHROME_IMAGE_NAME .
    docker push $CHROME_IMAGE_NAME
    
    # Cleanup
    rm Dockerfile.chrome
    
    log_info "Chrome service image built and pushed ✓"
}

# Create service account and permissions
setup_service_account() {
    log_info "Setting up service account..."
    
    # Create service account
    gcloud iam service-accounts create scraper-gsa \
        --display-name="Dispatch Webcrawl Scraper Service Account" \
        --description="Service account for the web scraper application" \
        || log_warn "Service account may already exist"
    
    # Grant necessary permissions
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:scraper-gsa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/cloudsql.client" \
        || true
    
    log_info "Service account setup completed ✓"
}

# Deploy Chrome service
deploy_chrome_service() {
    log_info "Deploying Chrome service to Cloud Run..."
    
    gcloud run deploy $CHROME_SERVICE_NAME \
        --image=$CHROME_IMAGE_NAME \
        --platform=managed \
        --region=$REGION \
        --allow-unauthenticated \
        --memory=1Gi \
        --cpu=1 \
        --concurrency=1 \
        --min-instances=1 \
        --max-instances=2 \
        --port=3000 \
        --set-env-vars="CONCURRENT=1,MAX_CONCURRENT_SESSIONS=1,KEEP_ALIVE=true,PREBOOT_CHROME=true"
    
    # Get the Chrome service URL
    CHROME_SERVICE_URL=$(gcloud run services describe $CHROME_SERVICE_NAME \
        --platform=managed \
        --region=$REGION \
        --format="value(status.url)")
    
    log_info "Chrome service deployed successfully ✓"
    log_info "Chrome service URL: $CHROME_SERVICE_URL"
}

# Deploy main scraper service
deploy_scraper_service() {
    log_info "Deploying scraper service to Cloud Run..."
    
    # Replace PROJECT_ID in the deployment file
    sed "s/PROJECT_ID/$PROJECT_ID/g" gcp-deployment.yaml > gcp-deployment-temp.yaml
    
    gcloud run deploy $SERVICE_NAME \
        --image=$IMAGE_NAME \
        --platform=managed \
        --region=$REGION \
        --allow-unauthenticated \
        --memory=1Gi \
        --cpu=1 \
        --concurrency=1 \
        --min-instances=1 \
        --max-instances=3 \
        --port=8080 \
        --service-account=scraper-gsa@${PROJECT_ID}.iam.gserviceaccount.com \
        --set-env-vars="NODE_ENV=production,HEADLESS=true,LOG_LEVEL=info,CHROME_CDP_URL=${CHROME_SERVICE_URL}"
    
    # Get the scraper service URL
    SCRAPER_SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
        --platform=managed \
        --region=$REGION \
        --format="value(status.url)")
    
    # Cleanup
    rm -f gcp-deployment-temp.yaml
    
    log_info "Scraper service deployed successfully ✓"
    log_info "Scraper service URL: $SCRAPER_SERVICE_URL"
}

# Setup monitoring (optional)
setup_monitoring() {
    log_info "Setting up monitoring..."
    
    # Create log-based metrics
    gcloud logging metrics create scraper_errors \
        --description="Count of scraper errors" \
        --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="'$SERVICE_NAME'" AND severity>=ERROR'
    
    # Create alerting policy (requires additional setup)
    log_info "Monitoring setup completed ✓"
    log_warn "Manual setup required for alerting policies in Cloud Monitoring"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check scraper health
    SCRAPER_SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
        --platform=managed \
        --region=$REGION \
        --format="value(status.url)")
    
    if curl -f "$SCRAPER_SERVICE_URL/health" > /dev/null 2>&1; then
        log_info "Scraper service health check passed ✓"
    else
        log_error "Scraper service health check failed ✗"
        return 1
    fi
    
    # Check Chrome service
    CHROME_SERVICE_URL=$(gcloud run services describe $CHROME_SERVICE_NAME \
        --platform=managed \
        --region=$REGION \
        --format="value(status.url)")
    
    if curl -f "$CHROME_SERVICE_URL/" > /dev/null 2>&1; then
        log_info "Chrome service health check passed ✓"
    else
        log_error "Chrome service health check failed ✗"
        return 1
    fi
    
    log_info "All services are running successfully ✓"
}

# Print deployment information
print_deployment_info() {
    log_info "Deployment completed successfully! 🎉"
    echo ""
    echo "📋 Deployment Information:"
    echo "=========================="
    echo "Project ID: $PROJECT_ID"
    echo "Region: $REGION"
    echo ""
    echo "🚀 Service URLs:"
    echo "Scraper Service: $(gcloud run services describe $SERVICE_NAME --platform=managed --region=$REGION --format="value(status.url)")"
    echo "Chrome Service: $(gcloud run services describe $CHROME_SERVICE_NAME --platform=managed --region=$REGION --format="value(status.url)")"
    echo ""
    echo "📊 Health Endpoints:"
    echo "Scraper Health: $(gcloud run services describe $SERVICE_NAME --platform=managed --region=$REGION --format="value(status.url)")/health"
    echo "Chrome Health: $(gcloud run services describe $CHROME_SERVICE_NAME --platform=managed --region=$REGION --format="value(status.url)")/"
    echo ""
    echo "📝 Useful Commands:"
    echo "View logs: gcloud logs tail --project=$PROJECT_ID"
    echo "Update service: gcloud run deploy $SERVICE_NAME --image=$IMAGE_NAME --region=$REGION"
    echo "Scale down: gcloud run services update $SERVICE_NAME --min-instances=0 --region=$REGION"
}

# Main deployment function
main() {
    log_info "Starting deployment of Dispatch Webcrawl Scraper to GCP..."
    
    # Check if PROJECT_ID is set
    if [ "$PROJECT_ID" = "your-project-id" ]; then
        log_error "Please set GCP_PROJECT_ID environment variable or update the PROJECT_ID in this script"
        exit 1
    fi
    
    check_dependencies
    setup_gcp
    setup_service_account
    build_chrome_image
    build_scraper_image
    deploy_chrome_service
    deploy_scraper_service
    setup_monitoring
    verify_deployment
    print_deployment_info
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "build")
        check_dependencies
        build_chrome_image
        build_scraper_image
        ;;
    "chrome")
        check_dependencies
        setup_gcp
        build_chrome_image
        deploy_chrome_service
        ;;
    "scraper")
        check_dependencies
        setup_gcp
        build_scraper_image
        deploy_scraper_service
        ;;
    "verify")
        verify_deployment
        ;;
    "cleanup")
        log_info "Cleaning up GCP resources..."
        gcloud run services delete $SERVICE_NAME --region=$REGION --quiet || true
        gcloud run services delete $CHROME_SERVICE_NAME --region=$REGION --quiet || true
        log_info "Cleanup completed ✓"
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  deploy   - Full deployment (default)"
        echo "  build    - Build and push images only"
        echo "  chrome   - Deploy Chrome service only"
        echo "  scraper  - Deploy scraper service only"
        echo "  verify   - Verify deployment"
        echo "  cleanup  - Delete all services"
        echo "  help     - Show this help"
        echo ""
        echo "Environment Variables:"
        echo "  GCP_PROJECT_ID - Your GCP project ID"
        echo "  GCP_REGION     - GCP region (default: us-central1)"
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for available commands"
        exit 1
        ;;
esac
