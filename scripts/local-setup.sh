#!/bin/bash

# Local Development Setup Script
# This script sets up the local environment for development

set -e

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
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_warn "Docker is not installed. Docker is optional for local development."
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    
    log_info "Dependencies check passed ✓"
}

# Install npm dependencies
install_dependencies() {
    log_info "Installing npm dependencies..."
    
    npm install
    
    log_info "Dependencies installed ✓"
}

# Install Playwright browsers
install_browsers() {
    log_info "Installing Playwright browsers..."
    
    npx playwright install chromium --with-deps
    
    log_info "Playwright browsers installed ✓"
}

# Setup environment files
setup_environment() {
    log_info "Setting up environment files..."
    
    # Create .env file if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.example .env
        log_info "Created .env file from .env.example"
        log_warn "Please review and update .env file with your configuration"
    else
        log_info ".env file already exists"
    fi
    
    # Create output directory
    mkdir -p output
    mkdir -p logs
    
    log_info "Environment setup completed ✓"
}

# Setup Chrome for remote debugging (for local development)
setup_chrome_debug() {
    log_info "Setting up Chrome for remote debugging..."
    
    cat > scripts/start-chrome-debug.sh << 'EOF'
#!/bin/bash

# Start Chrome with remote debugging enabled
# This allows Playwright to connect to an existing browser instance

CHROME_PATH=""

# Detect Chrome installation path
if command -v google-chrome &> /dev/null; then
    CHROME_PATH="google-chrome"
elif command -v chromium-browser &> /dev/null; then
    CHROME_PATH="chromium-browser"
elif command -v chromium &> /dev/null; then
    CHROME_PATH="chromium"
elif [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [ -f "/usr/bin/google-chrome-stable" ]; then
    CHROME_PATH="/usr/bin/google-chrome-stable"
else
    echo "Chrome/Chromium not found. Please install Chrome first."
    exit 1
fi

echo "Starting Chrome with remote debugging..."
echo "Chrome will be available at: http://localhost:9222"
echo "To stop Chrome, press Ctrl+C"

"$CHROME_PATH" \
    --remote-debugging-port=9222 \
    --remote-debugging-address=0.0.0.0 \
    --no-first-run \
    --no-default-browser-check \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --disable-features=TranslateUI \
    --disable-dev-shm-usage \
    --no-sandbox \
    --user-data-dir=/tmp/chrome-debug-data
EOF

    chmod +x scripts/start-chrome-debug.sh
    
    log_info "Chrome debug setup completed ✓"
    log_info "Use 'npm run chrome' or './scripts/start-chrome-debug.sh' to start Chrome with remote debugging"
}

# Create package.json scripts
update_package_scripts() {
    log_info "Updating package.json scripts..."
    
    # Add new scripts to package.json
    npm pkg set scripts.production="node src/production-scraper.js"
    npm pkg set scripts.chrome="./scripts/start-chrome-debug.sh"
    npm pkg set scripts.dev="NODE_ENV=development node src/production-scraper.js"
    npm pkg set scripts.docker:build="docker build -t dispatch-webcrawl ."
    npm pkg set scripts.docker:run="docker-compose up -d"
    npm pkg set scripts.docker:stop="docker-compose down"
    npm pkg set scripts.docker:logs="docker-compose logs -f scraper"
    npm pkg set scripts.test:health="curl -f http://localhost:8080/health"
    
    log_info "Package.json scripts updated ✓"
}

# Create development helpers
create_dev_helpers() {
    log_info "Creating development helpers..."
    
    # Create a simple test script
    cat > scripts/test-scraper.js << 'EOF'
#!/usr/bin/env node

// Simple test script to verify scraper functionality
const { runProductionScraping, logger } = require('../src/production-scraper');

async function testScraper() {
    logger.info('Starting scraper test...');
    
    try {
        await runProductionScraping();
        logger.info('Test completed successfully ✓');
    } catch (error) {
        logger.error('Test failed', { error: error.message });
        process.exit(1);
    }
}

if (require.main === module) {
    testScraper();
}
EOF

    chmod +x scripts/test-scraper.js
    
    # Create monitoring script
    cat > scripts/monitor.sh << 'EOF'
#!/bin/bash

# Simple monitoring script for local development

echo "Dispatch Webcrawl Scraper - Local Monitor"
echo "========================================"

while true; do
    clear
    echo "$(date): Checking scraper status..."
    
    # Check if scraper is running
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        echo "✓ Scraper is running and healthy"
        
        # Show health status
        echo ""
        echo "Health Status:"
        curl -s http://localhost:8080/health | jq '.' 2>/dev/null || curl -s http://localhost:8080/health
    else
        echo "✗ Scraper is not responding"
    fi
    
    echo ""
    echo "Press Ctrl+C to stop monitoring"
    sleep 10
done
EOF

    chmod +x scripts/monitor.sh
    
    log_info "Development helpers created ✓"
}

# Print setup information
print_setup_info() {
    log_info "Local setup completed successfully! 🎉"
    echo ""
    echo "📋 Setup Information:"
    echo "===================="
    echo ""
    echo "🚀 Quick Start Commands:"
    echo "npm run chrome        # Start Chrome with remote debugging"
    echo "npm run production    # Start production scraper"
    echo "npm run dev          # Start development scraper"
    echo ""
    echo "🐳 Docker Commands:"
    echo "npm run docker:build # Build Docker image"
    echo "npm run docker:run   # Start with Docker Compose"
    echo "npm run docker:stop  # Stop Docker containers"
    echo ""
    echo "🔧 Development Tools:"
    echo "./scripts/monitor.sh       # Monitor scraper status"
    echo "./scripts/test-scraper.js  # Test scraper functionality"
    echo "npm run test:health        # Check health endpoint"
    echo ""
    echo "📁 Important Files:"
    echo ".env                 # Environment configuration"
    echo "output/             # Scraped data output"
    echo "logs/               # Application logs"
    echo ""
    echo "📚 Next Steps:"
    echo "1. Review and update .env file with your configuration"
    echo "2. Start Chrome: npm run chrome"
    echo "3. In another terminal, start the scraper: npm run production"
    echo "4. Monitor at: http://localhost:8080/health"
}

# Main setup function
main() {
    log_info "Starting local development setup..."
    
    check_dependencies
    install_dependencies
    install_browsers
    setup_environment
    setup_chrome_debug
    update_package_scripts
    create_dev_helpers
    print_setup_info
}

# Handle script arguments
case "${1:-setup}" in
    "setup")
        main
        ;;
    "deps")
        check_dependencies
        install_dependencies
        install_browsers
        ;;
    "env")
        setup_environment
        ;;
    "chrome")
        setup_chrome_debug
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  setup    - Full local setup (default)"
        echo "  deps     - Install dependencies only"
        echo "  env      - Setup environment files only"
        echo "  chrome   - Setup Chrome debugging only"
        echo "  help     - Show this help"
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Use '$0 help' for available commands"
        exit 1
        ;;
esac
