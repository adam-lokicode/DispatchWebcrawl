# Multi-stage Dockerfile for production deployment
FROM node:18-bullseye-slim as base

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include devDependencies for Playwright)
RUN npm ci && npm cache clean --force

# Install Playwright browsers for Cloud Run (fallback option)
RUN npx playwright install chromium --with-deps

# Production stage
FROM base as production

# Copy application code
COPY src/ ./src/
COPY env.example .env

# Create output directory
RUN mkdir -p /app/output

# Set environment variables for production
ENV NODE_ENV=production
ENV HEADLESS=true
ENV LOG_LEVEL=info
ENV HEALTH_CHECK_PORT=8080

# Expose health check port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start the production scraper (includes health server)
CMD ["node", "src/production-scraper.js"]

# Development stage
FROM base as development

# Install development dependencies
RUN npm ci && npm cache clean --force

# Copy application code
COPY . .

# Keep root user for development convenience
ENV NODE_ENV=development
ENV HEADLESS=false
ENV LOG_LEVEL=debug

# Expose ports for development
EXPOSE 8080 9222

# Start with development server
CMD ["npm", "run", "dev"]
