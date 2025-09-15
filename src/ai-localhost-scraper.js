const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const GmailAPI = require('./gmail-api');
const AIScreenshotAnalyzer = require('./ai-screenshot-analyzer');
require('dotenv').config();

// Configuration
const CONFIG = {
    intervalSeconds: 30,
    maxEntries: 25,
    outputFile: 'ai_dat_one_loads_localhost.csv',
    headless: true, // Run headless
    timeout: 5000, // Shorter timeout
    maxRetries: 3,
    healthCheckPort: 8080,
    
    // Email verification settings
    emailCheckInterval: 2000,
    emailMaxWait: 60000, // Shorter email wait
    
    // AI settings
    maxLoadsToProcess: 5, // Process fewer loads for testing
    clickDelay: 1000 // Shorter click delay
};

class AILocalhostScraper {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.isLoggedIn = false;
        this.aiAnalyzer = new AIScreenshotAnalyzer({
            openaiApiKey: process.env.OPENAI_API_KEY
        });
    }

    log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data);
    }

    async initialize() {
        try {
            this.log('info', '🏠 AI LOCALHOST: Starting browser for automated login with AI analysis');
            
            // Initialize AI analyzer
            await this.aiAnalyzer.initializeDatabase();
            
            this.browser = await chromium.launch({
                headless: CONFIG.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            });

            this.context = await this.browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            this.page = await this.context.newPage();
            this.log('info', '✅ Browser and AI analyzer initialized successfully');
            return true;

        } catch (error) {
            this.log('error', 'Initialization failed', { error: error.message });
            throw error;
        }
    }

    async loginToDAT() {
        try {
            this.log('info', '🔐 Starting automated DAT.com login process');

            const username = process.env.DAT_ONE_USERNAME;
            const password = process.env.DAT_ONE_PASSWORD;

            if (!username || !password) {
                throw new Error('Missing DAT credentials. Set DAT_ONE_USERNAME and DAT_ONE_PASSWORD in .env');
            }

            // Navigate to DAT One login
            this.log('info', '🌐 Navigating to DAT One login page');
            await this.page.goto('https://one.dat.com/login', { 
                waitUntil: 'load', 
                timeout: 30000 
            });
            
            await this.page.waitForTimeout(3000);
            
            // Take screenshot of login page
            await this.page.screenshot({ path: './output/ai-login-page.png', fullPage: true });
            this.log('info', '📸 Login page screenshot saved');

            // Fill in credentials
            this.log('info', '📝 Filling in login credentials');
            
            // Find and fill username
            const usernameSelectors = [
                'input[name="username"]',
                'input[type="email"]',
                'input[placeholder*="email" i]',
                'input[placeholder*="username" i]',
                '#username',
                '#email'
            ];

            let usernameField = null;
            for (const selector of usernameSelectors) {
                try {
                    usernameField = await this.page.$(selector);
                    if (usernameField) {
                        this.log('info', `Found username field with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (usernameField) {
                await usernameField.fill(username);
                this.log('info', '✅ Username filled');
            } else {
                throw new Error('Could not find username field');
            }

            // Find and fill password
            const passwordSelectors = [
                'input[name="password"]',
                'input[type="password"]',
                '#password'
            ];

            let passwordField = null;
            for (const selector of passwordSelectors) {
                try {
                    passwordField = await this.page.$(selector);
                    if (passwordField) {
                        this.log('info', `Found password field with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (passwordField) {
                await passwordField.fill(password);
                this.log('info', '✅ Password filled');
            } else {
                throw new Error('Could not find password field');
            }

            // Click login button
            const loginSelectors = [
                'button[type="submit"]',
                'button:has-text("Sign In")',
                'button:has-text("Login")',
                'input[type="submit"]',
                '.login-button',
                '#login-button'
            ];

            let loginButton = null;
            for (const selector of loginSelectors) {
                try {
                    loginButton = await this.page.$(selector);
                    if (loginButton) {
                        this.log('info', `Found login button with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (loginButton) {
                await loginButton.click();
                this.log('info', '✅ Login button clicked');
            } else {
                throw new Error('Could not find login button');
            }

            // Wait for navigation
            await this.page.waitForTimeout(5000);

            // Check if we're logged in by looking for post-login elements
            const loggedInIndicators = [
                'text=Load Board',
                'text=Search Loads',
                '[data-test*="user"]',
                '.user-menu',
                'text=Dashboard'
            ];

            let isLoggedIn = false;
            for (const indicator of loggedInIndicators) {
                try {
                    const element = await this.page.$(indicator);
                    if (element) {
                        this.log('info', `✅ Login confirmed with indicator: ${indicator}`);
                        isLoggedIn = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!isLoggedIn) {
                this.log('warn', '⚠️ Login status unclear, proceeding anyway...');
            }

            this.isLoggedIn = true;
            return true;

        } catch (error) {
            this.log('error', 'Login failed', { error: error.message });
            throw error;
        }
    }

    async navigateToLoadBoard() {
        try {
            this.log('info', '🚛 Navigating to load board');

            // Try different load board URLs
            const loadBoardUrls = [
                'https://one.dat.com/load-board',
                'https://one.dat.com/search/loads',
                'https://www.dat.com/load-board',
                'https://www.dat.com/search/loads'
            ];

            for (const url of loadBoardUrls) {
                try {
                    this.log('info', `Trying URL: ${url}`);
                    await this.page.goto(url, { waitUntil: 'load', timeout: 15000 });
                    await this.page.waitForTimeout(3000);

                    // Check if we have load results
                    const hasLoads = await this.checkForLoads();
                    if (hasLoads) {
                        this.log('info', `✅ Successfully found loads at: ${url}`);
                        return true;
                    }
                } catch (e) {
                    this.log('warn', `Failed to load: ${url}`, { error: e.message });
                    continue;
                }
            }

            // If no loads found, try to perform a search
            this.log('info', '🔍 No loads found, attempting to perform search...');
            await this.performBasicSearch();

            return true;

        } catch (error) {
            this.log('error', 'Navigation to load board failed', { error: error.message });
            throw error;
        }
    }

    async checkForLoads() {
        const loadIndicators = [
            '.row-cells',
            '[class*="row-cells"]',
            '[data-test="load-age-cell"]',
            '[data-test="load-rate-cell"]',
            '.table-cell.cell-age'
        ];

        for (const indicator of loadIndicators) {
            try {
                const elements = await this.page.$$(indicator);
                if (elements.length > 0) {
                    this.log('info', `Found ${elements.length} load elements with selector: ${indicator}`);
                    return true;
                }
            } catch (e) {
                continue;
            }
        }

        return false;
    }

    async performBasicSearch() {
        try {
            // Fill in basic search criteria
            const searchCriteria = {
                origin: 'San Francisco, CA',
                destination: 'Denver, CO'
            };

            // Look for origin field
            const originSelectors = [
                'input[placeholder*="Origin"]',
                'input[data-test*="origin"]',
                'input[name*="origin"]'
            ];

            for (const selector of originSelectors) {
                try {
                    const field = await this.page.$(selector);
                    if (field) {
                        await field.fill(searchCriteria.origin);
                        this.log('info', `Set origin: ${searchCriteria.origin}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Look for destination field
            const destinationSelectors = [
                'input[placeholder*="Destination"]',
                'input[data-test*="destination"]',
                'input[name*="destination"]'
            ];

            for (const selector of destinationSelectors) {
                try {
                    const field = await this.page.$(selector);
                    if (field) {
                        await field.fill(searchCriteria.destination);
                        this.log('info', `Set destination: ${searchCriteria.destination}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Click search button
            const searchSelectors = [
                'button:has-text("SEARCH")',
                'button:has-text("Search")',
                '[data-test*="search"]'
            ];

            for (const selector of searchSelectors) {
                try {
                    const button = await this.page.$(selector);
                    if (button) {
                        await button.click();
                        this.log('info', 'Search button clicked');
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Wait for results
            await this.page.waitForTimeout(5000);

        } catch (error) {
            this.log('warn', 'Basic search failed', { error: error.message });
        }
    }

    async startAIExtraction() {
        try {
            this.log('info', '🤖 Starting AI-powered load extraction with interactive clicking');

            // Find all load rows
            const rowSelectors = [
                '.row-cells',
                '[class*="row-cells"]',
                '.ng-tns-c545-12'
            ];

            let loadRows = [];
            let usedSelector = null;

            for (const selector of rowSelectors) {
                try {
                    const rows = await this.page.$$(selector);
                    if (rows.length > 0) {
                        loadRows = rows;
                        usedSelector = selector;
                        this.log('info', `Found ${rows.length} load rows with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (loadRows.length === 0) {
                this.log('error', 'No load rows found');
                // Take debug screenshot
                await this.page.screenshot({ path: './output/ai-debug-no-rows.png', fullPage: true });
                return { processedLoads: 0, extractedLoads: 0 };
            }

            const loadsToProcess = Math.min(loadRows.length, CONFIG.maxLoadsToProcess);
            let processedLoads = 0;
            let totalExtractedLoads = 0;

            this.log('info', `Processing ${loadsToProcess} loads...`);

            for (let i = 0; i < loadsToProcess; i++) {
                this.log('info', `📋 Processing load ${i + 1}/${loadsToProcess}...`);

                try {
                    // Re-find rows (DOM might have changed)
                    const currentRows = await this.page.$$(usedSelector);
                    if (i >= currentRows.length) {
                        this.log('warn', 'Row no longer exists, skipping...');
                        continue;
                    }

                    const row = currentRows[i];

                    // Scroll into view
                    await row.scrollIntoViewIfNeeded();
                    await this.page.waitForTimeout(1000);

                    // Take screenshot before click
                    this.log('info', '📸 Taking screenshot before click...');
                    const beforeScreenshot = await this.aiAnalyzer.captureAndStoreScreenshot(this.page, {
                        url: this.page.url(),
                        pageType: 'loadboard-collapsed',
                        loadIndex: i,
                        state: 'before-click'
                    });

                    // Click the row to expand
                    this.log('info', '👆 Clicking to expand load details...');
                    await row.click();
                    await this.page.waitForTimeout(CONFIG.clickDelay);

                    // Take screenshot after click
                    this.log('info', '📸 Taking screenshot after click...');
                    const afterScreenshot = await this.aiAnalyzer.captureAndStoreScreenshot(this.page, {
                        url: this.page.url(),
                        pageType: 'loadboard-expanded',
                        loadIndex: i,
                        state: 'after-click'
                    });

                    // Analyze expanded screenshot
                    this.log('info', '🤖 Analyzing expanded screenshot with AI...');
                    const extractedLoads = await this.aiAnalyzer.analyzeScreenshot(afterScreenshot.id);

                    if (extractedLoads.length > 0) {
                        totalExtractedLoads += extractedLoads.length;
                        this.log('info', `✅ Extracted ${extractedLoads.length} loads (confidence: ${extractedLoads[0].confidence_score})`);
                    } else {
                        this.log('warn', '⚠️ No loads extracted from expanded view');
                    }

                    // Click elsewhere to collapse
                    try {
                        await this.page.click('body');
                        await this.page.waitForTimeout(500);
                    } catch (e) {
                        // Don't worry if this fails
                    }

                    processedLoads++;

                } catch (error) {
                    this.log('error', `Error processing load ${i + 1}`, { error: error.message });
                    continue;
                }
            }

            this.log('info', '🎉 AI extraction completed!');
            this.log('info', `📊 Processed: ${processedLoads} loads`);
            this.log('info', `🚚 Extracted: ${totalExtractedLoads} loads`);

            return { processedLoads, extractedLoads: totalExtractedLoads };

        } catch (error) {
            this.log('error', 'AI extraction failed', { error: error.message });
            throw error;
        }
    }

    async exportData() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputPath = `./output/ai-localhost-loads-${timestamp}.csv`;
            
            await this.aiAnalyzer.exportToCSV(outputPath);
            this.log('info', `📊 Data exported to ${outputPath}`);
            
            return outputPath;
        } catch (error) {
            this.log('error', 'Export failed', { error: error.message });
            throw error;
        }
    }

    async getStats() {
        return await this.aiAnalyzer.getStats();
    }

    async close() {
        try {
            if (this.browser) {
                await this.browser.close();
            }
            await this.aiAnalyzer.close();
            this.log('info', '✅ AI Localhost scraper closed');
        } catch (error) {
            this.log('error', 'Error during cleanup', { error: error.message });
        }
    }
}

// Main execution
async function main() {
    const scraper = new AILocalhostScraper();
    
    try {
        await scraper.initialize();
        await scraper.loginToDAT();
        await scraper.navigateToLoadBoard();
        
        const results = await scraper.startAIExtraction();
        
        if (results.extractedLoads > 0) {
            await scraper.exportData();
        }
        
        const stats = await scraper.getStats();
        console.log('\n📈 Final Statistics:', JSON.stringify(stats, null, 2));
        
    } catch (error) {
        console.error('❌ Scraper failed:', error.message);
    } finally {
        await scraper.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = AILocalhostScraper;
