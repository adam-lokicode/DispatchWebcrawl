const { chromium } = require('playwright');
const fs = require('fs');
const AIScreenshotAnalyzer = require('./ai-screenshot-analyzer');
require('dotenv').config();

/**
 * Interactive AI-Enhanced DAT Scraper
 * This version clicks on each load row to expand details before taking screenshots
 */
class InteractiveAIScraper {
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
            timeout: parseInt(process.env.TIMEOUT) || 120000,
            sessionFile: 'session.json',
            clickDelay: options.clickDelay || 2000, // Wait between clicks
            maxLoadsToProcess: options.maxLoadsToProcess || 10
        };
    }

    /**
     * Initialize the scraper and AI analyzer
     */
    async initialize() {
        console.log('🚀 Initializing Interactive AI Scraper...');
        
        await this.aiAnalyzer.initializeDatabase();
        
        this.browser = await chromium.launch({
            headless: this.config.headless,
            slowMo: this.config.slowMo,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

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
        await this.page.setViewportSize({ width: 1920, height: 1080 });
        
        console.log('✅ Interactive AI scraper initialized');
    }

    /**
     * Navigate to load search results page
     */
    async navigateToLoadResults() {
        console.log('🔗 Navigating to DAT ONE load search...');
        
        try {
            // Go to load search page
            await this.page.goto('https://www.dat.com/search/loads', {
                waitUntil: 'load',
                timeout: this.config.timeout
            });

            await this.page.waitForTimeout(3000);

            // Check if we need to perform a search or if results are already showing
            const hasResults = await this.checkForLoadResults();
            
            if (!hasResults) {
                console.log('🔍 No results found, performing search...');
                await this.performLoadSearch();
            }

            console.log('✅ Successfully navigated to load results');
            return true;

        } catch (error) {
            console.error('❌ Navigation failed:', error.message);
            throw error;
        }
    }

    /**
     * Check if load results are currently displayed
     */
    async checkForLoadResults() {
        const resultIndicators = [
            '.row-cells', // Load row containers
            '[data-test="load-age-cell"]',
            '[data-test="load-rate-cell"]',
            '.table-cell.cell-age'
        ];

        for (const indicator of resultIndicators) {
            try {
                const elements = await this.page.$$(indicator);
                if (elements.length > 0) {
                    console.log(`✅ Found ${elements.length} load results`);
                    return true;
                }
            } catch (e) {
                // Continue checking
            }
        }

        return false;
    }

    /**
     * Perform a basic load search to get results
     */
    async performLoadSearch() {
        try {
            // Fill in basic search criteria - you can customize these
            const searchCriteria = {
                origin: 'San Francisco, CA',
                destination: 'Denver, CO',
                equipmentType: 'Vans (Standard)'
            };

            // Look for and fill origin field
            const originSelectors = [
                'input[placeholder*="Origin"]',
                'input[data-test*="origin"]',
                'input[name*="origin"]',
                '#origin'
            ];

            for (const selector of originSelectors) {
                try {
                    const field = await this.page.$(selector);
                    if (field) {
                        await field.clear();
                        await field.type(searchCriteria.origin);
                        console.log(`📍 Set origin: ${searchCriteria.origin}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Look for and fill destination field
            const destinationSelectors = [
                'input[placeholder*="Destination"]',
                'input[data-test*="destination"]',
                'input[name*="destination"]',
                '#destination'
            ];

            for (const selector of destinationSelectors) {
                try {
                    const field = await this.page.$(selector);
                    if (field) {
                        await field.clear();
                        await field.type(searchCriteria.destination);
                        console.log(`📍 Set destination: ${searchCriteria.destination}`);
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
                '[data-test*="search"]',
                '.search-button'
            ];

            for (const selector of searchSelectors) {
                try {
                    const button = await this.page.$(selector);
                    if (button) {
                        await button.click();
                        console.log('🔍 Clicked search button');
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Wait for results to load
            await this.page.waitForTimeout(5000);

        } catch (error) {
            console.warn('⚠️ Could not perform search:', error.message);
        }
    }

    /**
     * Start interactive AI scraping with row clicking
     */
    async startInteractiveScraping(options = {}) {
        const { maxLoads = this.config.maxLoadsToProcess } = options;

        console.log('🤖 Starting interactive AI scraping...');
        console.log(`📊 Max loads to process: ${maxLoads}`);

        try {
            // Find all load rows
            const loadRowSelectors = [
                '.row-cells',
                '[class*="row-cells"]',
                '.ng-tns-c545-12'
            ];

            let loadRows = [];
            for (const selector of loadRowSelectors) {
                loadRows = await this.page.$$(selector);
                if (loadRows.length > 0) {
                    console.log(`✅ Found ${loadRows.length} load rows using selector: ${selector}`);
                    break;
                }
            }

            if (loadRows.length === 0) {
                console.log('❌ No load rows found');
                return { processedLoads: 0, totalLoads: 0 };
            }

            const loadsToProcess = Math.min(loadRows.length, maxLoads);
            let processedLoads = 0;
            let totalExtractedLoads = 0;

            for (let i = 0; i < loadsToProcess; i++) {
                console.log(`\n📋 Processing load ${i + 1}/${loadsToProcess}...`);

                try {
                    // Re-find the row (DOM might have changed)
                    const currentRows = await this.page.$$(loadRowSelectors[0]);
                    if (i >= currentRows.length) {
                        console.log('⚠️ Row no longer exists, skipping...');
                        continue;
                    }

                    const row = currentRows[i];

                    // Scroll row into view
                    await row.scrollIntoViewIfNeeded();
                    await this.page.waitForTimeout(1000);

                    // Take screenshot before click (collapsed state)
                    console.log('📸 Taking screenshot of collapsed row...');
                    const beforeScreenshot = await this.aiAnalyzer.captureAndStoreScreenshot(this.page, {
                        url: this.page.url(),
                        pageType: 'loadboard-collapsed',
                        loadIndex: i,
                        state: 'before-click'
                    });

                    // Click on the row to expand details
                    console.log('👆 Clicking to expand load details...');
                    await row.click();
                    await this.page.waitForTimeout(this.config.clickDelay);

                    // Take screenshot after click (expanded state)
                    console.log('📸 Taking screenshot of expanded row...');
                    const afterScreenshot = await this.aiAnalyzer.captureAndStoreScreenshot(this.page, {
                        url: this.page.url(),
                        pageType: 'loadboard-expanded',
                        loadIndex: i,
                        state: 'after-click'
                    });

                    // Analyze both screenshots (expanded one is more important)
                    console.log('🤖 Analyzing expanded screenshot...');
                    const extractedLoads = await this.aiAnalyzer.analyzeScreenshot(afterScreenshot.id);
                    
                    if (extractedLoads.length > 0) {
                        totalExtractedLoads += extractedLoads.length;
                        console.log(`✅ Extracted ${extractedLoads.length} loads from expanded view`);
                    } else {
                        console.log('⚠️ No loads extracted from expanded view');
                    }

                    // Click somewhere else to collapse (optional)
                    try {
                        // Click on an empty area or next row to collapse current one
                        await this.page.click('body');
                        await this.page.waitForTimeout(500);
                    } catch (e) {
                        // Don't worry if this fails
                    }

                    processedLoads++;

                } catch (error) {
                    console.error(`❌ Error processing load ${i + 1}:`, error.message);
                    continue;
                }
            }

            console.log('\n🎉 Interactive scraping completed!');
            console.log(`📊 Processed ${processedLoads} loads`);
            console.log(`🚚 Total extracted loads: ${totalExtractedLoads}`);

            return {
                processedLoads,
                totalLoads: loadRows.length,
                extractedLoads: totalExtractedLoads
            };

        } catch (error) {
            console.error('❌ Interactive scraping failed:', error.message);
            throw error;
        }
    }

    /**
     * Export all extracted data to CSV
     */
    async exportData(filename = null) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = filename || `./output/interactive-ai-loads-${timestamp}.csv`;
        
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
        console.log('✅ Interactive AI scraper closed');
    }
}

// CLI usage
if (require.main === module) {
    (async () => {
        const scraper = new InteractiveAIScraper();
        
        try {
            await scraper.initialize();
            await scraper.navigateToLoadResults();
            
            // Process first 5 loads for testing
            const results = await scraper.startInteractiveScraping({
                maxLoads: 5
            });

            // Export results
            await scraper.exportData();
            
            // Show stats
            const stats = await scraper.getStats();
            console.log('\n📈 Final Statistics:', JSON.stringify(stats, null, 2));

        } catch (error) {
            console.error('❌ Scraper failed:', error.message);
        } finally {
            await scraper.close();
        }
    })();
}

module.exports = InteractiveAIScraper;
