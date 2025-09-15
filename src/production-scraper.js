const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
require('dotenv').config();

// Production-ready configuration optimized for GCP deployment
const CONFIG = {
    intervalSeconds: 30,       // Run every 30 seconds
    maxEntries: 25,           // Optimize for speed
    outputFile: 'dat_one_loads_production.csv',  // ALWAYS use this file - no new CSV files
    statsFile: 'production_stats.json',
    healthFile: 'health_status.json',
    runImmediately: true,
    enablePagination: false,  // Disabled for speed
    maxRetries: 3,
    retryDelay: 5000,
    timeout: 25000,          // 25s timeout to fit 30s interval
    maxMemoryMB: 512,        // Memory limit for GCP
    maxConcurrentBrowsers: 1,
    browserCleanupInterval: 300, // Clean browser every 5 minutes
    healthCheckPort: process.env.HEALTH_CHECK_PORT || 8080,
    
    // Cloud optimization
    headless: process.env.NODE_ENV === 'production',
    disableImages: true,
    disableCSS: true,
    disableJavaScript: false,
    
    // Monitoring
    enableMetrics: true,
    enableAlerts: true,
    maxConsecutiveFailures: 5,
    
    // Data management
    maxFileSize: 50 * 1024 * 1024, // 50MB max CSV file
    archiveAfterDays: 7,
    cleanupOldFiles: true
};

// Enhanced logging with structured output
class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.enableColors = process.env.NODE_ENV !== 'production';
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            ...meta,
            memory: this.getMemoryUsage(),
            pid: process.pid
        };
        
        if (process.env.NODE_ENV === 'production') {
            // Structured JSON logging for GCP
            return JSON.stringify(logEntry);
        } else {
            // Human-readable for development
            const color = this.getColor(level);
            return `${color}[${timestamp}] ${level.toUpperCase()}: ${message}${this.enableColors ? '\x1b[0m' : ''}`;
        }
    }

    getColor(level) {
        if (!this.enableColors) return '';
        const colors = {
            error: '\x1b[31m',   // Red
            warn: '\x1b[33m',    // Yellow
            info: '\x1b[36m',    // Cyan
            debug: '\x1b[90m'    // Gray
        };
        return colors[level] || '';
    }

    getMemoryUsage() {
        const used = process.memoryUsage();
        return {
            rss: Math.round(used.rss / 1024 / 1024),
            heapTotal: Math.round(used.heapTotal / 1024 / 1024),
            heapUsed: Math.round(used.heapUsed / 1024 / 1024),
            external: Math.round(used.external / 1024 / 1024)
        };
    }

    error(message, meta = {}) {
        console.error(this.formatMessage('error', message, meta));
    }

    warn(message, meta = {}) {
        console.warn(this.formatMessage('warn', message, meta));
    }

    info(message, meta = {}) {
        console.log(this.formatMessage('info', message, meta));
    }

    debug(message, meta = {}) {
        if (this.logLevel === 'debug') {
            console.log(this.formatMessage('debug', message, meta));
        }
    }
}

const logger = new Logger();

// Health monitoring system
class HealthMonitor {
    constructor() {
        this.status = {
            service: 'production-scraper',
            status: 'starting',
            lastRun: null,
            lastSuccess: null,
            consecutiveFailures: 0,
            totalRuns: 0,
            totalSuccesses: 0,
            totalFailures: 0,
            uptimeStart: Date.now(),
            currentRun: null,
            memoryUsage: null,
            errorRate: 0
        };
        this.updateHealthFile();
    }

    updateStatus(updates) {
        Object.assign(this.status, updates);
        this.status.memoryUsage = logger.getMemoryUsage();
        this.status.errorRate = this.status.totalRuns > 0 ? 
            (this.status.totalFailures / this.status.totalRuns) : 0;
        this.updateHealthFile();
    }

    recordSuccess() {
        this.updateStatus({
            status: 'healthy',
            lastSuccess: Date.now(),
            consecutiveFailures: 0,
            totalSuccesses: this.status.totalSuccesses + 1
        });
    }

    recordFailure(error) {
        this.updateStatus({
            status: this.status.consecutiveFailures >= CONFIG.maxConsecutiveFailures ? 'critical' : 'degraded',
            consecutiveFailures: this.status.consecutiveFailures + 1,
            totalFailures: this.status.totalFailures + 1,
            lastError: error.message,
            lastErrorTime: Date.now()
        });
    }

    startRun() {
        this.updateStatus({
            currentRun: Date.now(),
            lastRun: Date.now(),
            totalRuns: this.status.totalRuns + 1
        });
    }

    updateHealthFile() {
        try {
            const outputDir = './output';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const healthPath = path.join(outputDir, CONFIG.healthFile);
            fs.writeFileSync(healthPath, JSON.stringify(this.status, null, 2));
        } catch (error) {
            logger.error('Failed to update health file', { error: error.message });
        }
    }

    getStatus() {
        return { ...this.status };
    }
}

const healthMonitor = new HealthMonitor();

// Resource management for browser instances
class BrowserManager {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.lastCleanup = Date.now();
        this.connectionRetries = 0;
        this.maxRetries = CONFIG.maxRetries;
    }

    async initialize() {
        try {
            logger.info('Initializing browser connection...');
            
            // Environment detection
            const isGCP = process.env.NODE_ENV === 'production' && !process.env.CHROME_CDP_URL;
            const isLocalhost = process.env.CHROME_CDP_URL === 'http://localhost:9222' || process.env.NODE_ENV !== 'production';
            
            logger.info('Environment detected', { 
                isGCP, 
                isLocalhost, 
                nodeEnv: process.env.NODE_ENV,
                chromeUrl: process.env.CHROME_CDP_URL 
            });
            
            // Check if external Chrome URL is configured (localhost)
            const chromeUrl = process.env.CHROME_CDP_URL;
            
            if (isLocalhost && chromeUrl === 'http://localhost:9222') {
                // LOCALHOST: Connect to existing Chrome with manual login
                try {
                    logger.info('🏠 LOCALHOST: Connecting to existing Chrome browser for manual login', { url: chromeUrl });
                    this.browser = await chromium.connectOverCDP(chromeUrl);
                    
                    if (this.browser.contexts().length === 0) {
                        throw new Error('No browser contexts found');
                    }

                    this.context = this.browser.contexts()[0];
                    const pages = this.context.pages();

                    if (pages.length === 0) {
                        this.page = await this.context.newPage();
                        await this.configurePage();
                    } else {
                        this.page = pages[0];
                        for (const p of pages) {
                            const url = p.url();
                            if (url.includes('dat.com') || url.includes('one.dat.com')) {
                                this.page = p;
                                break;
                            }
                        }
                        await this.configurePage();
                    }

                    this.connectionRetries = 0;
                    logger.info('🏠 LOCALHOST: Browser connection established - ready for manual login');
                    return true;
                } catch (localhostError) {
                    logger.error('🏠 LOCALHOST: Chrome connection failed - is Chrome running with --remote-debugging-port=9222?', { 
                        error: localhostError.message 
                    });
                    throw new Error('LOCALHOST mode requires Chrome with remote debugging. Run: ./scripts/start-chrome-debug.sh');
                }
            }
            
            // GCP: Launch local browser with automated login
            logger.info('☁️ GCP: Launching headless browser for automated login...');
            
            const browserArgs = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-field-trial-config',
                '--disable-ipc-flooding-protection'
            ];

            // Add headless flag based on environment
            if (CONFIG.headless || process.env.NODE_ENV === 'production') {
                browserArgs.push('--headless=new');
            }

            this.browser = await chromium.launch({
                headless: CONFIG.headless || process.env.NODE_ENV === 'production',
                args: browserArgs
            });

            this.context = await this.browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            this.page = await this.context.newPage();
            await this.configurePage();

            this.connectionRetries = 0;
            logger.info('Local browser launched successfully for Cloud Run');
            return true;

        } catch (error) {
            this.connectionRetries++;
            logger.error('Browser initialization failed', { 
                error: error.message, 
                retries: this.connectionRetries 
            });

            if (this.connectionRetries >= this.maxRetries) {
                throw new Error(`Failed to initialize browser after ${this.maxRetries} attempts`);
            }

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
            return this.initialize();
        }
    }

    async configurePage() {
        if (!this.page) return;

        try {
            // Set optimized viewport for server environment
            await this.page.setViewportSize({ width: 1280, height: 720 });

            // Block resources to improve performance
            if (CONFIG.disableImages || CONFIG.disableCSS) {
                await this.page.route('**/*', (route) => {
                    const resourceType = route.request().resourceType();
                    
                    if (CONFIG.disableImages && ['image', 'media'].includes(resourceType)) {
                        route.abort();
                        return;
                    }
                    
                    if (CONFIG.disableCSS && resourceType === 'stylesheet') {
                        route.abort();
                        return;
                    }
                    
                    route.continue();
                });
            }

            // Set user agent and headers
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache'
            });

            logger.debug('Page configuration completed');

        } catch (error) {
            logger.warn('Page configuration failed', { error: error.message });
        }
    }

    async cleanup() {
        try {
            const shouldCleanup = Date.now() - this.lastCleanup > CONFIG.browserCleanupInterval * 1000;
            
            if (shouldCleanup) {
                logger.info('Performing browser cleanup...');
                
                if (this.page) {
                    // Clear cache and cookies periodically
                    await this.context.clearCookies();
                    await this.context.clearPermissions();
                }
                
                this.lastCleanup = Date.now();
                logger.debug('Browser cleanup completed');
            }
        } catch (error) {
            logger.warn('Browser cleanup failed', { error: error.message });
        }
    }

    async ensureConnection() {
        try {
            if (!this.browser || !this.page) {
                return await this.initialize();
            }

            // Test connection
            await this.page.evaluate(() => document.readyState);
            return true;

        } catch (error) {
            logger.warn('Browser connection lost, reinitializing...', { error: error.message });
            this.browser = null;
            this.context = null;
            this.page = null;
            return await this.initialize();
        }
    }

    getPage() {
        return this.page;
    }

    async close() {
        try {
            if (this.browser) {
                // Close pages and contexts first
                if (this.page) {
                    await this.page.close().catch(() => {});
                    this.page = null;
                }
                
                if (this.context) {
                    await this.context.close().catch(() => {});
                    this.context = null;
                }
                
                // Close the browser (whether local or external)
                await this.browser.close().catch(() => {});
                this.browser = null;
                
                logger.debug('Browser closed successfully');
            }
        } catch (error) {
            logger.warn('Error closing browser connection', { error: error.message });
        }
    }
}

const browserManager = new BrowserManager();

// Enhanced utility functions with error handling
function getRandomDelay(min = 200, max = 800) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function safeWait(page, delay) {
    try {
        await page.waitForTimeout(delay);
    } catch (error) {
        logger.debug('Wait interrupted', { error: error.message });
    }
}

async function humanLikeMouseMove(page) {
    try {
        const viewport = await page.viewportSize();
        if (!viewport) return;
        
        const x = Math.floor(Math.random() * viewport.width * 0.8) + viewport.width * 0.1;
        const y = Math.floor(Math.random() * viewport.height * 0.8) + viewport.height * 0.1;
        
        await page.mouse.move(x, y, { 
            steps: Math.floor(Math.random() * 5) + 3 
        });
    } catch (error) {
        logger.debug('Mouse movement failed', { error: error.message });
    }
}

function normalizeValue(value) {
    if (!value || value === '–' || value === '-' || value === '' || value.trim() === '' || value === 'N/A') {
        return null;
    }
    return value.trim();
}

function parseRate(rateText) {
    if (!rateText || rateText === '–' || rateText === '-') {
        return { totalRate: null, ratePerMile: null };
    }
    
    // Enhanced rate parsing with better error handling
    try {
        const combinedRatePattern = /\$?([\d,]+)\$?([\d.]+)\*?\/mi/;
        const combinedMatch = rateText.match(combinedRatePattern);
        
        if (combinedMatch) {
            return {
                totalRate: parseInt(combinedMatch[1].replace(/,/g, '')),
                ratePerMile: parseFloat(combinedMatch[2])
            };
        }
        
        const totalRatePattern = /\$?([\d,]+)$/;
        const totalMatch = rateText.match(totalRatePattern);
        
        if (totalMatch) {
            return {
                totalRate: parseInt(totalMatch[1].replace(/,/g, '')),
                ratePerMile: null
            };
        }
        
        const perMilePattern = /\$?([\d.]+)\*?\/mi/;
        const perMileMatch = rateText.match(perMilePattern);
        
        if (perMileMatch) {
            return {
                totalRate: null,
                ratePerMile: parseFloat(perMileMatch[1])
            };
        }
        
        return { totalRate: null, ratePerMile: null };
    } catch (error) {
        logger.debug('Rate parsing failed', { rateText, error: error.message });
        return { totalRate: null, ratePerMile: null };
    }
}

function parseOriginDestination(combinedText) {
        if (!combinedText) return { origin: '', destination: '' };
        
        // Handle cases like "Manteca, CAAurora, CO" or "Salinas, CADenver, CO"
        const text = combinedText.trim();
        
        // Look for pattern: City, StateCity, State
        const match = text.match(/^(.+?,\s*[A-Z]{2})([A-Z][a-z]+.*?,\s*[A-Z]{2})$/);
        if (match) {
            return {
                origin: match[1].trim(),
                destination: match[2].trim()
            };
        }
        
        // Fallback: try to split on state abbreviation pattern
        const statePattern = /([A-Z]{2})([A-Z][a-z]+)/;
        const stateMatch = text.match(statePattern);
        if (stateMatch) {
            const splitPoint = text.indexOf(stateMatch[0]);
            if (splitPoint > 0) {
                const origin = text.substring(0, splitPoint + 2).trim();
                const destination = text.substring(splitPoint + 2).trim();
                return { origin, destination };
            }
        }
        
        // Final fallback
        return { origin: text, destination: '' };
    };

// Enhanced stats management
class StatsManager {
    constructor() {
        this.statsPath = path.join('./output', CONFIG.statsFile);
        this.initializeStats();
    }

    initializeStats() {
        const defaultStats = {
            service: 'production-scraper',
            totalRuns: 0,
            totalEntriesCrawled: 0,
            totalNewEntriesAdded: 0,
            totalDuplicatesSkipped: 0,
            totalErrors: 0,
            firstRun: null,
            lastRun: null,
            averageEntriesPerRun: 0,
            averageNewEntriesPerRun: 0,
            averageRunDuration: 0,
            successRate: 0,
            runs: [],
            performance: {
                fastestRun: null,
                slowestRun: null,
                averageMemoryUsage: 0
            }
        };

        if (!fs.existsSync('./output')) {
            fs.mkdirSync('./output', { recursive: true });
        }

        if (!fs.existsSync(this.statsPath)) {
            this.saveStats(defaultStats);
        }
    }

    loadStats() {
        try {
            const statsData = fs.readFileSync(this.statsPath, 'utf8');
            return JSON.parse(statsData);
        } catch (error) {
            logger.error('Failed to load stats', { error: error.message });
            return this.getDefaultStats();
        }
    }

    saveStats(stats) {
        try {
            fs.writeFileSync(this.statsPath, JSON.stringify(stats, null, 2));
        } catch (error) {
            logger.error('Failed to save stats', { error: error.message });
        }
    }

    updateStats(runData) {
        const stats = this.loadStats();
        
        // Update cumulative counters
        stats.totalRuns++;
        stats.totalEntriesCrawled += runData.entriesCrawled;
        stats.totalNewEntriesAdded += runData.newEntriesAdded;
        stats.totalDuplicatesSkipped += runData.duplicatesSkipped;
        
        if (runData.error) {
            stats.totalErrors++;
        }
        
        // Update timestamps
        if (!stats.firstRun) {
            stats.firstRun = runData.timestamp;
        }
        stats.lastRun = runData.timestamp;
        
        // Calculate averages
        stats.averageEntriesPerRun = Math.round(stats.totalEntriesCrawled / stats.totalRuns * 100) / 100;
        stats.averageNewEntriesPerRun = Math.round(stats.totalNewEntriesAdded / stats.totalRuns * 100) / 100;
        stats.successRate = Math.round(((stats.totalRuns - stats.totalErrors) / stats.totalRuns) * 100);
        
        // Performance tracking
        if (runData.duration) {
            const totalDuration = stats.runs.reduce((sum, run) => sum + (run.duration || 0), 0) + runData.duration;
            stats.averageRunDuration = Math.round(totalDuration / stats.totalRuns);
            
            if (!stats.performance.fastestRun || runData.duration < stats.performance.fastestRun) {
                stats.performance.fastestRun = runData.duration;
            }
            
            if (!stats.performance.slowestRun || runData.duration > stats.performance.slowestRun) {
                stats.performance.slowestRun = runData.duration;
            }
        }
        
        // Add run to history (keep last 100 runs)
        stats.runs.unshift(runData);
        if (stats.runs.length > 100) {
            stats.runs = stats.runs.slice(0, 100);
        }
        
        this.saveStats(stats);
        return stats;
    }

    getDefaultStats() {
        return {
            totalRuns: 0,
            totalEntriesCrawled: 0,
            totalNewEntriesAdded: 0,
            totalDuplicatesSkipped: 0,
            totalErrors: 0,
            firstRun: null,
            lastRun: null,
            averageEntriesPerRun: 0,
            averageNewEntriesPerRun: 0,
            runs: []
        };
    }
}

const statsManager = new StatsManager();

// File management utilities
class FileManager {
    static async checkFileSize(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return stats.size;
        } catch (error) {
            return 0;
        }
    }

    static async archiveFile(filePath) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const archivePath = filePath.replace('.csv', `_archived_${timestamp}.csv`);
            fs.renameSync(filePath, archivePath);
            logger.info('File archived', { originalPath: filePath, archivePath });
            return archivePath;
        } catch (error) {
            logger.error('File archiving failed', { filePath, error: error.message });
            throw error;
        }
    }

    static async cleanupOldFiles() {
        try {
            const outputDir = './output';
            const files = fs.readdirSync(outputDir);
            const cutoffDate = Date.now() - (CONFIG.archiveAfterDays * 24 * 60 * 60 * 1000);
            
            for (const file of files) {
                if (file.includes('_archived_')) {
                    const filePath = path.join(outputDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime.getTime() < cutoffDate) {
                        fs.unlinkSync(filePath);
                        logger.info('Old file deleted', { file });
                    }
                }
            }
        } catch (error) {
            logger.warn('Cleanup failed', { error: error.message });
        }
    }
}

// Main production scraping function
async function runProductionScraping() {
    const timestamp = new Date().toISOString();
    const runStartTime = Date.now();
    let runData = {
        timestamp,
        duration: null,
        entriesCrawled: 0,
        newEntriesAdded: 0,
        duplicatesSkipped: 0,
        error: null,
        memoryUsage: logger.getMemoryUsage()
    };

    healthMonitor.startRun();
    logger.info('Starting production scraping run', { 
        timestamp, 
        interval: `${CONFIG.intervalSeconds}s`,
        maxEntries: CONFIG.maxEntries 
    });

    try {
        // Ensure browser connection
        await browserManager.ensureConnection();
        const page = browserManager.getPage();

        // Check if we're on the right page
        const currentUrl = page.url();
        logger.debug('Current page URL', { url: currentUrl });

        // Navigate to load search if needed
        if (!currentUrl.includes('dat.com') || !currentUrl.includes('search-loads')) {
            logger.info('Navigating to search loads page...');
            await page.goto('https://one.dat.com/search-loads-ow', { 
                waitUntil: 'networkidle',
                timeout: CONFIG.timeout 
            });
            await safeWait(page, getRandomDelay(1000, 2000));
        }

        // Wait for load results with timeout
        logger.debug('Waiting for load results...');
        try {
            await page.waitForSelector('[data-test="load-origin-cell"]', { 
                timeout: CONFIG.timeout / 2 
            });
        } catch (error) {
            // Try fallback selector
            await page.waitForSelector('.row-container', { 
                timeout: CONFIG.timeout / 4 
            });
        }

        // Get load rows efficiently - use more flexible selector
        let loadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
        
        // Fallback to broader selector if specific one doesn't work
        if (loadRows.length === 0) {
            loadRows = await page.$$('.row-container');
            // Filter to only get load rows (ones with data-test attributes)
            const validRows = [];
            for (const row of loadRows) {
                const hasLoadData = await row.$('[data-test="load-origin-cell"]');
                if (hasLoadData) {
                    validRows.push(row);
                }
            }
            loadRows = validRows;
        }
        
        const targetRows = loadRows.slice(0, CONFIG.maxEntries);
        
        logger.info('Found loads to process', { 
            totalFound: loadRows.length, 
            processing: targetRows.length 
        });

        if (targetRows.length === 0) {
            throw new Error('No load rows found');
        }

        const extractedData = [];
        const processStartTime = Date.now();

        // Process loads with optimized timing
        for (let idx = 0; idx < targetRows.length; idx++) {
            try {
                const row = targetRows[idx];
                const progress = ((idx + 1) / targetRows.length * 100).toFixed(1);
                
                logger.debug('Processing load', { 
                    index: idx + 1, 
                    total: targetRows.length, 
                    progress: `${progress}%` 
                });

                // Human-like hover (reduced for speed)
                await row.hover();
                await safeWait(page, getRandomDelay(100, 300));

                // Extract basic information efficiently (DAT One specific)
                const basicInfo = await row.evaluate(el => {
                    const normalizeValue = (value) => {
                        if (!value || value === 'N/A' || value === 'undefined' || value === '') return '';
                        return String(value).trim();
                    };

                    // Parse origin/destination from DAT One format
                    const parseOriginDestination = (text) => {
                        if (!text) return { origin: '', destination: '' };
                        
                        // Handle cases like "Manteca, CAAurora, CO" or "Salinas, CADenver, CO"
                        const cleanText = text.trim();
                        
                        // Look for pattern: City, StateCity, State (handles "Manteca, CAAurora, CO")
                        let match = cleanText.match(/^(.+?,\s*[A-Z]{2})([A-Z][a-z]+.*?,\s*[A-Z]{2})$/);
                        if (match) {
                            return {
                                origin: match[1].trim(),
                                destination: match[2].trim()
                            };
                        }
                        
                        // Handle cases without comma spacing: "Manteca, CAAurora, CO"
                        match = cleanText.match(/^(.+?,\s*[A-Z]{2})([A-Z][a-zA-Z\s,]+[A-Z]{2})$/);
                        if (match) {
                            return {
                                origin: match[1].trim(),
                                destination: match[2].trim()
                            };
                        }
                        
                        // Fallback: try to split on state abbreviation pattern
                        const statePattern = /([A-Z]{2})([A-Z][a-z]+)/;
                        const stateMatch = cleanText.match(statePattern);
                        if (stateMatch) {
                            const splitPoint = cleanText.indexOf(stateMatch[0]);
                            if (splitPoint > 0) {
                                const origin = cleanText.substring(0, splitPoint + 2).trim();
                                const destination = cleanText.substring(splitPoint + 2).trim();
                                return { origin, destination };
                            }
                        }
                        
                        // Final fallback
                        return { origin: cleanText, destination: '' };
                    };

                    const ageElement = el.querySelector('[data-test="load-age-cell"]');
                    const rateElement = el.querySelector('[data-test="load-rate-cell"]');
                    const originElement = el.querySelector('[data-test="load-origin-cell"]');
                    const destinationElement = el.querySelector('[data-test="load-destination-cell"]');
                    const companyElement = el.querySelector('[data-test="load-company-cell"]');
                    
                    let origin = '';
                    let destination = '';
                    let companyName = 'N/A';
                    let contactInfo = 'N/A';
                    
                    // Handle origin/destination parsing
                    if (originElement) {
                        const originText = originElement.textContent.trim();
                        if (destinationElement) {
                            // Separate cells available
                            origin = originText;
                            destination = destinationElement.textContent.trim();
                        } else {
                            // Combined in origin cell - need to parse
                            const parsed = parseOriginDestination(originText);
                            origin = parsed.origin;
                            destination = parsed.destination;
                        }
                    }

                    // Extract company name
                    if (companyElement) {
                        companyName = normalizeValue(companyElement.textContent);
                        
                        // Look for contact information in company cell
                        const contactSelectors = [
                            '.contact-state',
                            '.contact-info', 
                            '.phone',
                            '.email',
                            '[class*="contact"]',
                            '[class*="phone"]',
                            '[class*="email"]',
                            '[data-test*="contact"]',
                            '[data-test*="phone"]',
                            '.company-contact',
                            '.load-contact'
                        ];
                        
                        for (const selector of contactSelectors) {
                            const contactEl = companyElement.querySelector(selector);
                            if (contactEl) {
                                const contactText = contactEl.textContent.trim();
                                if (contactText && contactText !== 'N/A' && contactText.length > 0) {
                                    contactInfo = contactText;
                                    break;
                                }
                            }
                        }
                        
                        // If no specific contact element, look for patterns in company text
                        if (contactInfo === 'N/A') {
                            const companyText = companyElement.textContent;
                            
                            // More comprehensive phone number patterns
                            const phonePatterns = [
                                /\(\d{3}\)\s*\d{3}[-\s]?\d{4}/g,  // (123) 123-1234
                                /\d{3}[-\.]\d{3}[-\.]\d{4}/g,       // 123-123-1234 or 123.123.1234
                                /\d{3}\s\d{3}\s\d{4}/g,           // 123 123 1234
                                /\(\d{3}\)\d{3}-\d{4}/g,          // (123)123-1234
                                /\d{10}/g,                           // 1234567890
                                /\+1[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}/g // +1-123-123-1234
                            ];
                            
                            for (const pattern of phonePatterns) {
                                const phoneMatch = companyText.match(pattern);
                                if (phoneMatch) {
                                    contactInfo = phoneMatch[0];
                                    break;
                                }
                            }
                            
                            // If no phone found, look for email with more patterns
                            if (contactInfo === 'N/A') {
                                const emailPatterns = [
                                    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
                                    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\.[a-zA-Z]{2,}/g,
                                    /[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}/g
                                ];
                                
                                for (const pattern of emailPatterns) {
                                    const emailMatch = companyText.match(pattern);
                                    if (emailMatch) {
                                        contactInfo = emailMatch[0];
                                        break;
                                    }
                                }
                            }
                            
                            // Last resort: look in the entire row for contact info
                            if (contactInfo === 'N/A') {
                                const rowText = el.textContent;
                                
                                // Try to find any phone number in the entire row
                                for (const pattern of phonePatterns) {
                                    const phoneMatch = rowText.match(pattern);
                                    if (phoneMatch) {
                                        contactInfo = phoneMatch[0];
                                        break;
                                    }
                                }
                                
                                // Try to find any email in the entire row
                                if (contactInfo === 'N/A') {
                                    for (const pattern of emailPatterns) {
                                        const emailMatch = rowText.match(pattern);
                                        if (emailMatch) {
                                            contactInfo = emailMatch[0];
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Parse rate information
                    let rateText = rateElement?.textContent.trim() || '';
                    const totalMatch = rateText.match(/\$([0-9,]+)/);
                    const perMileMatch = rateText.match(/\$([0-9.]+).*?\/mi/);
                    
                    return {
                        age: ageElement?.textContent.trim() || 'N/A',
                        rate: rateText,
                        totalRate: totalMatch ? totalMatch[1].replace(/,/g, '') : '',
                        ratePerMile: perMileMatch ? perMileMatch[1] : '',
                        origin: normalizeValue(origin),
                        destination: normalizeValue(destination),
                        company: companyName,
                        contactInfo: contactInfo
                    };
                });

                // Click to get details (with timeout)
                await row.click();
                await safeWait(page, getRandomDelay(800, 1500));

                // Extract detailed information from the specific load modal
                const detailedInfo = await Promise.race([
                    page.evaluate(() => {
                        // Wait for modal to appear and extract from the specific modal context
                        const waitForModal = () => {
                            return new Promise((resolve) => {
                                let attempts = 0;
                                const checkModal = () => {
                                    attempts++;
                                    // Look for modal containers
                                    const modalSelectors = [
                                        '.modal-content',
                                        '.popup-content', 
                                        '.load-details',
                                        '.detail-panel',
                                        '[role="dialog"]',
                                        '.overlay-content'
                                    ];
                                    
                                    let modal = null;
                                    for (const selector of modalSelectors) {
                                        modal = document.querySelector(selector);
                                        if (modal && modal.offsetParent !== null) {
                                            break;
                                        }
                                    }
                                    
                                    if (modal || attempts > 10) {
                                        resolve(modal);
                                    } else {
                                        setTimeout(checkModal, 200);
                                    }
                                };
                                checkModal();
                            });
                        };

                        return waitForModal().then((modal) => {
                            const modalContext = modal || document;
                            const modalText = modal ? modal.textContent : document.body.textContent;
                            
                            // Extract reference number using the specific DAT One selectors
                            const findReferenceNumber = () => {
                                // Look for the specific Reference ID structure you provided
                                const referenceLabels = modalContext.querySelectorAll('.data-label');
                                
                                for (const label of referenceLabels) {
                                    if (label.textContent.trim().toLowerCase().includes('reference id')) {
                                        // Find the associated data-item (could be previous or next sibling)
                                        let dataItem = label.previousElementSibling;
                                        if (!dataItem || !dataItem.classList.contains('data-item')) {
                                            dataItem = label.nextElementSibling;
                                        }
                                        
                                        if (dataItem && dataItem.classList.contains('data-item')) {
                                            const refId = dataItem.textContent.trim();
                                            if (refId && refId.length >= 4) {
                                                return refId;
                                            }
                                        }
                                    }
                                }
                                
                                // Enhanced fallback: look for data-item near "Reference ID" text or with reference patterns
                                const allDataItems = modalContext.querySelectorAll('.data-item');
                                for (const item of allDataItems) {
                                    const refId = item.textContent.trim();
                                    const nearbyText = item.parentElement ? item.parentElement.textContent : '';
                                    
                                    // First check if this item is near "Reference ID" text
                                    if (nearbyText.toLowerCase().includes('reference id') && refId && refId.length >= 4) {
                                        return refId;
                                    }
                                }
                                
                                // Second pass: look for reference ID patterns anywhere in modal
                                for (const item of allDataItems) {
                                    const text = item.textContent.trim();
                                    // Look for reference ID patterns:
                                    // - Pure numeric (like 92394820)
                                    // - Alphanumeric (like B211849)
                                    // - At least 6 characters, not containing common words
                                    if (text && (
                                        /^\d{6,}$/.test(text) ||                    // Pure numbers like 92394820
                                        /^[A-Z]\d{6,}$/i.test(text) ||             // Letter + numbers like B211849
                                        /^[A-Z0-9]{6,}$/i.test(text)               // General alphanumeric
                                    ) && !text.toLowerCase().match(/reference|load|freight|transport|logistics|company/)) {
                                        return text;
                                    }
                                }
                                
                                return null;
                            };

                            // Extract contact info from modal context only
                            const findModalContacts = () => {
                                const contacts = [];
                                
                                // Phone patterns
                                const phonePatterns = [
                                    /\(\d{3}\)\s*\d{3}[-\s]?\d{4}/g,
                                    /\d{3}[-\.]\d{3}[-\.]\d{4}/g,
                                    /\d{3}\s\d{3}\s\d{4}/g
                                ];
                                
                                // Email patterns  
                                const emailPatterns = [
                                    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
                                ];
                                
                                // Extract phones from modal only
                                phonePatterns.forEach(pattern => {
                                    const matches = modalText.match(pattern);
                                    if (matches) {
                                        matches.slice(0, 3).forEach(match => { // Limit to first 3 phones
                                            const clean = match.trim();
                                            if (contacts.indexOf(clean) === -1 && clean.length >= 10) {
                                                contacts.push(clean);
                                            }
                                        });
                                    }
                                });
                                
                                // Extract emails from modal only
                                emailPatterns.forEach(pattern => {
                                    const matches = modalText.match(pattern);
                                    if (matches) {
                                        matches.slice(0, 2).forEach(match => { // Limit to first 2 emails
                                            const clean = match.trim().toLowerCase();
                                            if (contacts.indexOf(clean) === -1 && clean.includes('@')) {
                                                contacts.push(clean);
                                            }
                                        });
                                    }
                                });
                                
                                return contacts;
                            };

                            const referenceNumber = findReferenceNumber();
                            const modalContacts = findModalContacts();
                            
                            return {
                                referenceNumber: referenceNumber || 'N/A',
                                contactInfo: modalContacts.length > 0 ? modalContacts.join('; ') : 'N/A',
                                contactCount: modalContacts.length,
                                hasModalData: !!modal,
                                modalFound: !!modal
                            };
                        });
                    }),
                    new Promise(resolve => setTimeout(() => resolve({ 
                        referenceNumber: 'N/A', 
                        contactInfo: 'N/A',
                        contactCount: 0,
                        hasModalData: false,
                        modalFound: false 
                    }), 3000))
                ]);

                // Use enhanced contact information from detailed extraction
                let finalContactInfo = normalizeValue(basicInfo.contactInfo);
                
                // If detailed extraction found better contact info, use that
                if (detailedInfo.contactInfo && detailedInfo.contactInfo !== 'N/A' && detailedInfo.contactCount > 0) {
                    finalContactInfo = detailedInfo.contactInfo;
                }

                // Use real reference number from detailed extraction
                let referenceId = normalizeValue(detailedInfo.referenceNumber);
                if (!referenceId || referenceId === 'N/A') {
                    // Only generate AUTO_ ID if no real reference found
                    const loadDetails = `${basicInfo.origin}-${basicInfo.destination}-${normalizeValue(basicInfo.company)}-${basicInfo.totalRate}`;
                    referenceId = 'AUTO_' + Buffer.from(loadDetails).toString('base64').substring(0, 8).toUpperCase();
                }

                const loadData = {
                    reference_number: referenceId,
                                                origin: basicInfo.origin || '',
                            destination: basicInfo.destination || '',
                    rate_total_usd: basicInfo.totalRate,
                    rate_per_mile: basicInfo.ratePerMile,
                    company: normalizeValue(basicInfo.company),
                    contact: finalContactInfo,
                    age_posted: normalizeValue(basicInfo.age),
                    extracted_at: new Date().toISOString()
                };

                if (loadData.origin && loadData.destination) {
                    extractedData.push(loadData);
                }

                // Close modal efficiently
                await page.keyboard.press('Escape');
                await safeWait(page, getRandomDelay(200, 500));

                // Add minimal human behavior occasionally
                if (Math.random() < 0.1) {
                    await humanLikeMouseMove(page);
                }

            } catch (error) {
                logger.warn('Failed to process load', { 
                    index: idx + 1, 
                    error: error.message 
                });
                
                // Try to recover
                try {
                    await page.keyboard.press('Escape');
                    await safeWait(page, 500);
                } catch (recoveryError) {
                    logger.debug('Recovery failed', { error: recoveryError.message });
                }
            }
        }

        runData.entriesCrawled = extractedData.length;
        logger.info('Extraction completed', { 
            entriesExtracted: extractedData.length,
            duration: `${Date.now() - processStartTime}ms` 
        });

        // Save data efficiently
        if (extractedData.length > 0) {
            const result = await saveExtractedData(extractedData);
            runData.newEntriesAdded = result.newRecords;
            runData.duplicatesSkipped = result.duplicates;
        }

        // Browser cleanup
        await browserManager.cleanup();

        // Record success
        runData.duration = Date.now() - runStartTime;
        statsManager.updateStats(runData);
        healthMonitor.recordSuccess();

        logger.info('Production run completed successfully', {
            duration: runData.duration,
            entriesCrawled: runData.entriesCrawled,
            newEntriesAdded: runData.newEntriesAdded,
            duplicatesSkipped: runData.duplicatesSkipped
        });

    } catch (error) {
        runData.error = error.message;
        runData.duration = Date.now() - runStartTime;
        
        logger.error('Production run failed', {
            error: error.message,
            duration: runData.duration,
            entriesCrawled: runData.entriesCrawled
        });

        statsManager.updateStats(runData);
        healthMonitor.recordFailure(error);

        // If browser is broken, try to reinitialize
        if (error.message.includes('browser') || error.message.includes('connection')) {
            try {
                await browserManager.close();
                await new Promise(resolve => setTimeout(resolve, 2000));
                await browserManager.initialize();
            } catch (reinitError) {
                logger.error('Browser reinitialization failed', { error: reinitError.message });
            }
        }
    }
}

// Optimized data saving function
async function saveExtractedData(extractedData) {
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const csvPath = path.join(outputDir, CONFIG.outputFile);
    
    // Check file size and archive if necessary
    const fileSize = await FileManager.checkFileSize(csvPath);
    if (fileSize > CONFIG.maxFileSize) {
        await FileManager.archiveFile(csvPath);
    }

    // Read existing data efficiently
    let existingData = [];
    if (fs.existsSync(csvPath)) {
        try {
            existingData = await new Promise((resolve, reject) => {
                const results = [];
                const timeout = setTimeout(() => reject(new Error('CSV read timeout')), 5000);
                
                fs.createReadStream(csvPath)
                    .pipe(csv())
                    .on('data', (data) => {
                        results.push({
                            reference_number: data.reference_number || null,
                            origin: data.origin || null,
                            destination: data.destination || null,
                            rate_total_usd: data.rate_total_usd ? parseInt(data.rate_total_usd) : null,
                            rate_per_mile: data.rate_per_mile ? parseFloat(data.rate_per_mile) : null,
                            company: data.company || null,
                            contact: data.contact || null,
                            age_posted: data.age_posted || null,
                            extracted_at: data.extracted_at || null
                        });
                    })
                    .on('end', () => {
                        clearTimeout(timeout);
                        resolve(results);
                    })
                    .on('error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
            });
        } catch (error) {
            logger.warn('Failed to read existing CSV', { error: error.message });
            existingData = [];
        }
    }

    // Efficient duplicate checking
    const newRecords = [];
    let duplicateCount = 0;
    
    const existingSet = new Set();
    existingData.forEach(record => {
        // Use the same key format for existing records (ignore reference numbers for duplicate detection)
        const key = `${record.origin}|${record.destination}|${record.company}|${record.rate_total_usd}|${record.contact}`;
        existingSet.add(key);
    });

                for (const newRecord of extractedData) {
                // Create a more reliable duplicate key that ignores auto-generated reference numbers
                const key = `${newRecord.origin}|${newRecord.destination}|${newRecord.company}|${newRecord.rate_total_usd}|${newRecord.contact}`;
                
                if (!existingSet.has(key)) {
                    newRecords.push(newRecord);
                    existingSet.add(key);
                } else {
                    duplicateCount++;
                }
            }

    // Save new records
    if (newRecords.length > 0) {
        const writeHeader = !fs.existsSync(csvPath);
        
        const csvWriter = createCsvWriter({
            path: csvPath,
            header: [
                { id: 'reference_number', title: 'reference_number' },
                { id: 'origin', title: 'origin' },
                { id: 'destination', title: 'destination' },
                { id: 'rate_total_usd', title: 'rate_total_usd' },
                { id: 'rate_per_mile', title: 'rate_per_mile' },
                { id: 'company', title: 'company' },
                { id: 'contact', title: 'contact' },
                { id: 'age_posted', title: 'age_posted' },
                { id: 'extracted_at', title: 'extracted_at' }
            ],
            append: !writeHeader
        });

        await csvWriter.writeRecords(newRecords);
        
        logger.info('Data saved to CSV', {
            newRecords: newRecords.length,
            duplicates: duplicateCount,
            totalRecords: existingData.length + newRecords.length,
            file: csvPath
        });
    }

    return {
        newRecords: newRecords.length,
        duplicates: duplicateCount,
        totalRecords: existingData.length + newRecords.length
    };
}

// Production scheduler with enhanced error handling
class ProductionScheduler {
    constructor() {
        this.intervalId = null;
        this.isRunning = false;
        this.startTime = Date.now();
    }

    start() {
        logger.info('Starting production scheduler', {
            interval: `${CONFIG.intervalSeconds}s`,
            maxEntries: CONFIG.maxEntries,
            outputFile: CONFIG.outputFile,
            runImmediately: CONFIG.runImmediately
        });

        // Show current stats
        const stats = statsManager.loadStats();
        if (stats.totalRuns > 0) {
            logger.info('Current statistics', {
                totalRuns: stats.totalRuns,
                totalEntries: stats.totalEntriesCrawled,
                successRate: `${stats.successRate}%`,
                averageDuration: `${stats.averageRunDuration}ms`
            });
        }

        // Initialize browser
        browserManager.initialize().catch(error => {
            logger.error('Initial browser setup failed', { error: error.message });
        });

        // Run immediately if configured
        if (CONFIG.runImmediately) {
            logger.info('Running initial scrape...');
            this.runWithErrorHandling();
        }

        // Set up recurring schedule
        const intervalMs = CONFIG.intervalSeconds * 1000;
        this.intervalId = setInterval(() => {
            this.runWithErrorHandling();
        }, intervalMs);

        this.isRunning = true;
        healthMonitor.updateStatus({ status: 'running' });

        logger.info('Production scheduler started', {
            nextRun: `${CONFIG.intervalSeconds}s`,
            pid: process.pid
        });

        // Setup cleanup intervals
        if (CONFIG.cleanupOldFiles) {
            setInterval(() => {
                FileManager.cleanupOldFiles();
            }, 24 * 60 * 60 * 1000); // Daily cleanup
        }
    }

    async runWithErrorHandling() {
        if (this.isRunning) {
            try {
                await runProductionScraping();
            } catch (error) {
                logger.error('Scheduled run failed with unhandled error', { 
                    error: error.message,
                    stack: error.stack 
                });
            }
        }
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.isRunning = false;
        healthMonitor.updateStatus({ status: 'stopped' });
        
        logger.info('Production scheduler stopped', {
            uptime: Date.now() - this.startTime
        });

        // Close browser connection
        browserManager.close().catch(error => {
            logger.warn('Error closing browser', { error: error.message });
        });
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            uptime: Date.now() - this.startTime,
            nextRun: this.intervalId ? CONFIG.intervalSeconds : null,
            health: healthMonitor.getStatus(),
            stats: statsManager.loadStats()
        };
    }
}

// Health check endpoint for GCP
const http = require('http');

function startHealthCheckServer() {
    const server = http.createServer((req, res) => {
        if (req.url === '/health' || req.url === '/') {
            const status = scheduler.getStatus();
            const isHealthy = status.health.status !== 'critical';
            
            res.writeHead(isHealthy ? 200 : 503, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            });
            
            res.end(JSON.stringify({
                status: isHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                ...status
            }, null, 2));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    server.listen(CONFIG.healthCheckPort, () => {
        logger.info('Health check server started', { 
            port: CONFIG.healthCheckPort,
            endpoints: ['/health', '/']
        });
    });

    return server;
}

// Global error handlers
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack
    });
    
    healthMonitor.recordFailure(error);
    
    // Don't exit immediately, try to continue
    setTimeout(() => {
        if (healthMonitor.status.consecutiveFailures >= CONFIG.maxConsecutiveFailures) {
            logger.error('Too many consecutive failures, exiting');
            process.exit(1);
        }
    }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack
    });
    
    healthMonitor.recordFailure(new Error(reason?.message || 'Unhandled rejection'));
});

// Graceful shutdown handlers
const scheduler = new ProductionScheduler();
let healthServer = null;

function gracefulShutdown(signal) {
    logger.info('Received shutdown signal', { signal });
    
    healthMonitor.updateStatus({ status: 'shutting_down' });
    
    scheduler.stop();
    
    if (healthServer) {
        healthServer.close();
    }
    
    setTimeout(() => {
        logger.info('Graceful shutdown completed');
        process.exit(0);
    }, 2000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Memory monitoring
setInterval(() => {
    const usage = process.memoryUsage();
    const usedMB = Math.round(usage.rss / 1024 / 1024);
    
    if (usedMB > CONFIG.maxMemoryMB) {
        logger.warn('High memory usage detected', {
            current: `${usedMB}MB`,
            limit: `${CONFIG.maxMemoryMB}MB`,
            heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`
        });
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
            logger.debug('Forced garbage collection');
        }
    }
}, 30000); // Check every 30 seconds

// Start the production system
if (require.main === module) {
    logger.info('Starting production scraper service', {
        version: '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        environment: process.env.NODE_ENV || 'development',
        config: {
            intervalSeconds: CONFIG.intervalSeconds,
            maxEntries: CONFIG.maxEntries,
            headless: CONFIG.headless,
            maxMemoryMB: CONFIG.maxMemoryMB
        }
    });

    // Start health check server
    healthServer = startHealthCheckServer();
    
    // Start the scheduler
    scheduler.start();
}

module.exports = {
    ProductionScheduler,
    runProductionScraping,
    CONFIG,
    logger,
    healthMonitor,
    statsManager,
    browserManager
};
