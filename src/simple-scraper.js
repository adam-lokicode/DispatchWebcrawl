const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const readline = require('readline');

class DATOneSimpleScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.data = [];
        
        this.config = {
            headless: false,
            slowMo: 500,
            timeout: 30000,
            outputDir: './output',
            csvFilename: 'dat_one_freight_data.csv',
            sessionFile: 'session.json'
        };
        
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true });
        }
        
        // Setup readline interface
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async initialize() {
        console.log('🚀 Initializing DAT ONE Simple Scraper...');
        
        // Connect to existing browser if possible, otherwise create new one
        try {
            this.browser = await chromium.connectOverCDP('http://localhost:9222');
            console.log('✅ Connected to existing browser');
        } catch (error) {
            // Fallback to creating new browser with session
            this.browser = await chromium.launch({
                headless: this.config.headless,
                slowMo: this.config.slowMo,
                args: ['--remote-debugging-port=9222'] // Enable CDP for future connections
            });
            
            let context;
            if (fs.existsSync(this.config.sessionFile)) {
                context = await this.browser.newContext({ storageState: this.config.sessionFile });
                console.log('✅ Loaded session from session.json');
            } else {
                context = await this.browser.newContext();
            }
            
            this.page = await context.newPage();
            
            await this.page.setViewportSize({ width: 1920, height: 1080 });
            await this.page.setExtraHTTPHeaders({
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            
            // Navigate to DAT One search page
            try {
                console.log('🌐 Navigating to DAT One search...');
                await this.page.goto('https://one.dat.com/search-loads-ow', { 
                    waitUntil: 'networkidle',
                    timeout: 30000 
                });
                console.log('✅ Successfully navigated to DAT One search');
            } catch (error) {
                console.log('⚠️ Could not navigate automatically, please navigate manually');
            }
        }
        
        console.log('✅ Browser initialized successfully');
    }

    async waitForUserInput() {
        return new Promise((resolve) => {
            console.log('\n🎯 INSTRUCTIONS:');
            console.log('1. Make sure you\'re on the DAT One search results page');
            console.log('2. Ensure you can see the load results table');
            console.log('3. Press ENTER in this terminal to start scraping');
            console.log('\n⏳ Waiting for your input...');
            
            this.rl.question('Press ENTER when ready to scrape: ', () => {
                resolve();
            });
        });
    }

    async extractCurrentPageData() {
        console.log('\n📊 Starting data extraction...');
        
        try {
            // If we connected to existing browser, get the active page
            if (!this.page) {
                const contexts = this.browser.contexts();
                if (contexts.length > 0) {
                    const pages = contexts[0].pages();
                    this.page = pages[0]; // Use the first page
                }
            }
            
            // Get current URL for reference
            const currentUrl = this.page.url();
            console.log(`🔍 Current page: ${currentUrl}`);
            
            // Wait for load results to appear
            console.log('⏳ Looking for load results...');
            await this.page.waitForSelector('tr', { timeout: 10000 });
            
            // Extract data from table rows
            const loadElements = await this.page.$$('tr');
            console.log(`🔍 Found ${loadElements.length} table rows`);
            
            let processedCount = 0;
            
            for (let i = 0; i < loadElements.length; i++) {
                const element = loadElements[i];
                try {
                    // Check if this row contains load data by looking for specific patterns
                    const hasLoadData = await element.evaluate(el => {
                        const text = el.textContent || '';
                        // Check for patterns that indicate this is a load row
                        return text.includes('$') && (text.includes('lbs') || text.includes('ft')) && text.includes('Full');
                    });
                    
                    if (hasLoadData) {
                        processedCount++;
                        console.log(`🔍 Processing load ${processedCount}...`);
                        const loadData = await this.extractLoadFromElement(element);
                        if (loadData) {
                            this.data.push(loadData);
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to extract data from row ${i + 1}:`, error.message);
                }
            }
            
            console.log(`\n✅ Extracted data for ${this.data.length} loads`);
            
        } catch (error) {
            console.error('❌ Data extraction failed:', error.message);
            throw error;
        }
    }

    async extractLoadFromElement(element) {
        try {
            const loadData = {};
            
            // Extract all text content from the row
            const rowText = await element.evaluate(el => el.textContent || '');
            
            // Extract origin and destination using patterns from the screenshot
            const originDestMatch = rowText.match(/([A-Za-z\s]+,\s*[A-Z]{2})\s*Denver,CO/);
            if (originDestMatch) {
                loadData.origin = originDestMatch[1].trim();
                loadData.destination = 'Denver,CO';
            } else {
                // Fallback pattern matching
                const cities = rowText.match(/([A-Za-z\s]+,\s*[A-Z]{2})/g);
                if (cities && cities.length >= 2) {
                    loadData.origin = cities[0];
                    loadData.destination = cities[1];
                }
            }
            
            // Extract rate
            const rateMatch = rowText.match(/\$\s*(\d+)/);
            loadData.rate = rateMatch ? `$${rateMatch[1]}` : 'N/A';
            
            // Extract weight
            const weightMatch = rowText.match(/(\d+k?\s*lbs)/);
            loadData.weight = weightMatch ? weightMatch[1] : 'N/A';
            
            // Extract equipment type (V for Van, etc.)
            const equipmentMatch = rowText.match(/\b([VFR])\b/);
            loadData.equipmentType = equipmentMatch ? equipmentMatch[1] : 'N/A';
            
            // Extract length
            const lengthMatch = rowText.match(/(\d+\s*ft)/);
            loadData.tripDistance = lengthMatch ? lengthMatch[1] : 'N/A';
            
            // Extract load type
            const loadTypeMatch = rowText.match(/(Full|Partial)/);
            loadData.loadType = loadTypeMatch ? loadTypeMatch[1] : 'N/A';
            
            // Extract age
            const ageMatch = rowText.match(/(\d+[hm])/);
            loadData.agePosted = ageMatch ? ageMatch[1] : 'N/A';
            
            // Extract company name - look for company patterns
            const companyMatch = rowText.match(/([A-Za-z\s]+LLC|[A-Za-z\s]+Inc|[A-Za-z\s]+Corp)/);
            loadData.company = companyMatch ? companyMatch[1].trim() : 'N/A';
            
            // Set default values
            loadData.contactInfo = 'N/A';
            loadData.loadRequirements = 'N/A';
            loadData.pickupDate = 'N/A';
            loadData.deliveryDate = 'N/A';
            loadData.extractedAt = new Date().toISOString();
            
            // Only return if we have meaningful data
            if (loadData.origin && loadData.destination && loadData.rate !== 'N/A') {
                console.log(`  ✅ ${loadData.origin} → ${loadData.destination} | ${loadData.rate} | ${loadData.company}`);
                return loadData;
            }
            
            return null;
            
        } catch (error) {
            console.warn('⚠️ Failed to extract load data:', error.message);
            return null;
        }
    }

    async saveToCSV() {
        if (this.data.length === 0) {
            console.log('⚠️ No data to save');
            return;
        }
        
        console.log('\n💾 Saving data to CSV...');
        
        const csvWriter = createCsvWriter({
            path: path.join(this.config.outputDir, this.config.csvFilename),
            header: [
                { id: 'origin', title: 'Origin' },
                { id: 'destination', title: 'Destination' },
                { id: 'equipmentType', title: 'Equipment Type' },
                { id: 'weight', title: 'Weight' },
                { id: 'rate', title: 'Rate' },
                { id: 'tripDistance', title: 'Trip Distance' },
                { id: 'company', title: 'Company' },
                { id: 'contactInfo', title: 'Contact Info' },
                { id: 'loadRequirements', title: 'Load Requirements' },
                { id: 'pickupDate', title: 'Pickup Date' },
                { id: 'deliveryDate', title: 'Delivery Date' },
                { id: 'loadType', title: 'Load Type' },
                { id: 'agePosted', title: 'Age Posted' },
                { id: 'extractedAt', title: 'Extracted At' }
            ]
        });
        
        await csvWriter.writeRecords(this.data);
        console.log(`✅ Data saved to ${path.join(this.config.outputDir, this.config.csvFilename)}`);
    }

    async showResults() {
        console.log('\n📊 EXTRACTION SUMMARY:');
        console.log('='.repeat(50));
        console.log(`Total loads extracted: ${this.data.length}`);
        
        if (this.data.length > 0) {
            console.log('\nExtracted loads:');
            this.data.forEach((load, index) => {
                console.log(`${index + 1}. ${load.origin} → ${load.destination}`);
                console.log(`   Rate: ${load.rate} | Company: ${load.company}`);
                console.log(`   Equipment: ${load.equipmentType} | Weight: ${load.weight} | Type: ${load.loadType}`);
                console.log(`   Age: ${load.agePosted}`);
                console.log('');
            });
        }
        
        console.log('='.repeat(50));
    }

    async close() {
        if (this.rl) {
            this.rl.close();
        }
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser closed');
        }
    }

    async run() {
        try {
            await this.initialize();
            await this.waitForUserInput();
            await this.extractCurrentPageData();
            await this.saveToCSV();
            await this.showResults();
            
            console.log('\n✅ Scraping completed!');
            
        } catch (error) {
            console.error('❌ Error during scraping:', error.message);
            throw error;
        } finally {
            await this.close();
        }
    }
}

// Run the scraper
if (require.main === module) {
    const scraper = new DATOneSimpleScraper();
    scraper.run().catch(console.error);
}

module.exports = DATOneSimpleScraper; 