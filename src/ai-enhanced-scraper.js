const { chromium } = require('playwright');
const fs = require('fs');
const AIScreenshotAnalyzer = require('./ai-screenshot-analyzer');
require('dotenv').config();

/**
 * Enhanced DAT ONE scraper using AI screenshot analysis
 * This replaces fragile CSS selectors with robust AI vision analysis
 */
class AIEnhancedDATScraper {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.context = null;
        this.aiAnalyzer = new AIScreenshotAnalyzer({
            openaiApiKey: options.openaiApiKey || process.env.OPENAI_API_KEY
        });
        
        this.config = {
            headless: process.env.HEADLESS === 'true',
            slowMo: parseInt(process.env.SLOW_MO) || 1000,
            timeout: parseInt(process.env.TIMEOUT) || 120000, // Increased to 2 minutes
            sessionFile: 'session.json',
            screenshotInterval: options.screenshotInterval || 30000, // 30 seconds
            maxScreenshotsPerSession: options.maxScreenshotsPerSession || 50
        };
    }

    /**
     * Initialize the scraper and AI analyzer
     */
    async initialize() {
        console.log('🚀 Initializing AI-Enhanced DAT Scraper...');
        
        // Initialize AI analyzer and database
        await this.aiAnalyzer.initializeDatabase();
        
        // Launch browser
        this.browser = await chromium.launch({
            headless: this.config.headless,
            slowMo: this.config.slowMo,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        // Create context with session if available
        if (fs.existsSync(this.config.sessionFile)) {
            this.context = await this.browser.newContext({ 
                storageState: this.config.sessionFile 
            });
            console.log('✅ Loaded existing session');
        } else {
            this.context = await this.browser.newContext();
            console.log('⚠️ No session found - manual login required');
        }

        this.page = await this.context.newPage();
        
        // Set viewport and user agent
        await this.page.setViewportSize({ width: 1920, height: 1080 });
        await this.page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        console.log('✅ AI-Enhanced scraper initialized');
    }

    /**
     * Navigate to DAT ONE and ensure we're logged in
     */
    async navigateToLoadBoard() {
        console.log('🔗 Navigating to DAT ONE load board...');
        
        try {
            // Try to go directly to load board
            await this.page.goto('https://www.dat.com/load-board', {
                waitUntil: 'load', // Changed from networkidle to load for faster navigation
                timeout: this.config.timeout
            });

            // Wait a moment for page to stabilize
            await this.page.waitForTimeout(3000);

            // Check if we're logged in by looking for load board elements
            const isLoadBoard = await this.isOnLoadBoard();
            
            if (!isLoadBoard) {
                console.log('🔐 Not logged in, redirecting to login page...');
                await this.page.goto('https://www.dat.com/login', {
                    waitUntil: 'networkidle',
                    timeout: this.config.timeout
                });
                
                throw new Error('Manual login required - please run save-session first');
            }

            console.log('✅ Successfully navigated to load board');
            return true;

        } catch (error) {
            console.error('❌ Navigation failed:', error.message);
            throw error;
        }
    }

    /**
     * Check if we're currently on a load board page
     */
    async isOnLoadBoard() {
        // Look for common load board indicators
        const indicators = [
            'text=Search Loads',
            'text=Load Board',
            '[data-testid*="load"]',
            '.load-row',
            '.freight-load',
            'table[role="grid"]',
            'text=Origin',
            'text=Destination',
            'text=Rate'
        ];

        for (const indicator of indicators) {
            try {
                const element = await this.page.$(indicator);
                if (element) {
                    console.log(`✅ Found load board indicator: ${indicator}`);
                    return true;
                }
            } catch (e) {
                // Continue checking
            }
        }

        return false;
    }

    /**
     * Start the AI-powered scraping process
     */
    async startAIScraping(options = {}) {
        const {
            duration = 300000, // 5 minutes default
            screenshotInterval = this.config.screenshotInterval,
            maxScreenshots = this.config.maxScreenshotsPerSession
        } = options;

        console.log('🤖 Starting AI-powered scraping...');
        console.log(`⏱️ Duration: ${duration / 1000} seconds`);
        console.log(`📸 Screenshot interval: ${screenshotInterval / 1000} seconds`);
        console.log(`📊 Max screenshots: ${maxScreenshots}`);

        const startTime = Date.now();
        let screenshotCount = 0;
        let analysisPromises = [];

        try {
            while (Date.now() - startTime < duration && screenshotCount < maxScreenshots) {
                // Ensure we're still on the load board
                const isLoadBoard = await this.isOnLoadBoard();
                if (!isLoadBoard) {
                    console.log('⚠️ Not on load board, attempting to navigate back...');
                    await this.navigateToLoadBoard();
                }

                // Capture screenshot and analyze
                console.log(`📸 Capturing screenshot ${screenshotCount + 1}/${maxScreenshots}...`);
                
                const screenshot = await this.aiAnalyzer.captureAndStoreScreenshot(this.page, {
                    url: this.page.url(),
                    pageType: 'loadboard',
                    sessionId: Date.now(),
                    screenshotNumber: screenshotCount + 1
                });

                // Start AI analysis (async)
                const analysisPromise = this.aiAnalyzer.analyzeScreenshot(screenshot.id)
                    .catch(error => {
                        console.error(`❌ Analysis failed for screenshot ${screenshot.id}:`, error.message);
                        return [];
                    });
                
                analysisPromises.push(analysisPromise);
                screenshotCount++;

                // Optional: Scroll or interact with page to get fresh data
                await this.refreshLoadBoard();

                // Wait for next screenshot
                if (screenshotCount < maxScreenshots && Date.now() - startTime < duration) {
                    console.log(`⏳ Waiting ${screenshotInterval / 1000} seconds for next screenshot...`);
                    await this.page.waitForTimeout(screenshotInterval);
                }
            }

            // Wait for all analyses to complete
            console.log('🔄 Waiting for AI analyses to complete...');
            const allResults = await Promise.all(analysisPromises);
            const totalLoads = allResults.reduce((sum, loads) => sum + loads.length, 0);

            console.log('✅ AI scraping completed!');
            console.log(`📊 Captured ${screenshotCount} screenshots`);
            console.log(`🚚 Extracted ${totalLoads} loads total`);

            return {
                screenshotCount,
                totalLoads,
                results: allResults
            };

        } catch (error) {
            console.error('❌ AI scraping failed:', error.message);
            throw error;
        }
    }

    /**
     * Refresh the load board to get new data
     */
    async refreshLoadBoard() {
        try {
            // Try different refresh strategies
            const refreshStrategies = [
                // Strategy 1: Refresh button
                async () => {
                    const refreshBtn = await this.page.$('button:has-text("Refresh"), button:has-text("Update"), [aria-label*="refresh"]');
                    if (refreshBtn) {
                        await refreshBtn.click();
                        console.log('🔄 Clicked refresh button');
                        return true;
                    }
                    return false;
                },
                
                // Strategy 2: Scroll to trigger lazy loading
                async () => {
                    await this.page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    await this.page.waitForTimeout(1000);
                    await this.page.evaluate(() => {
                        window.scrollTo(0, 0);
                    });
                    console.log('📜 Scrolled page to refresh content');
                    return true;
                },
                
                // Strategy 3: Simple page reload
                async () => {
                    await this.page.reload({ waitUntil: 'networkidle' });
                    console.log('🔄 Reloaded page');
                    return true;
                }
            ];

            // Try strategies in order
            for (const strategy of refreshStrategies) {
                try {
                    const success = await strategy();
                    if (success) {
                        await this.page.waitForTimeout(2000); // Wait for content to load
                        break;
                    }
                } catch (e) {
                    console.log('⚠️ Refresh strategy failed, trying next...');
                }
            }

        } catch (error) {
            console.warn('⚠️ Could not refresh load board:', error.message);
        }
    }

    /**
     * Export all extracted data to CSV
     */
    async exportData(filename = null) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = filename || `./output/ai-extracted-loads-${timestamp}.csv`;
        
        await this.aiAnalyzer.exportToCSV(outputPath);
        console.log(`📊 Data exported to ${outputPath}`);
        return outputPath;
    }

    /**
     * Get scraping statistics
     */
    async getStats() {
        return await this.aiAnalyzer.getStats();
    }

    /**
     * Clean up resources
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
        }
        await this.aiAnalyzer.close();
        console.log('✅ AI-Enhanced scraper closed');
    }
}

// CLI usage
if (require.main === module) {
    (async () => {
        const scraper = new AIEnhancedDATScraper();
        
        try {
            await scraper.initialize();
            await scraper.navigateToLoadBoard();
            
            // Start AI scraping
            const results = await scraper.startAIScraping({
                duration: 600000, // 10 minutes
                screenshotInterval: 30000, // 30 seconds
                maxScreenshots: 20
            });

            // Export results
            await scraper.exportData();
            
            // Show stats
            const stats = await scraper.getStats();
            console.log('📈 Final Statistics:', stats);

        } catch (error) {
            console.error('❌ Scraper failed:', error.message);
        } finally {
            await scraper.close();
        }
    })();
}

module.exports = AIEnhancedDATScraper;
