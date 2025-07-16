const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const readline = require('readline');

class DATOneInteractiveScraper {
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
        console.log('🚀 Initializing DAT ONE Interactive Scraper...');
        
        this.browser = await chromium.launch({
            headless: this.config.headless,
            slowMo: this.config.slowMo
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
        
        // Navigate to DAT One main page to start
        try {
            console.log('🌐 Navigating to DAT One...');
            await this.page.goto('https://www.dat.com', { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            console.log('✅ Successfully navigated to DAT One');
        } catch (error) {
            console.log('⚠️ Could not navigate to DAT One automatically, but browser is ready');
            console.log('   You can manually navigate to https://www.dat.com');
        }
        
        console.log('✅ Browser initialized successfully');
    }

    async waitForUserInput() {
        return new Promise((resolve) => {
            console.log('\n🎯 INSTRUCTIONS:');
            console.log('1. Navigate to DAT One freight search results in the browser window');
            console.log('2. Make sure you can see the load results table');
            console.log('3. Press ENTER in this terminal to start scraping the current page');
            console.log('\n⏳ Waiting for your input...');
            
            this.rl.question('Press ENTER when ready to scrape: ', () => {
                resolve();
            });
        });
    }

    async extractCurrentPageData() {
        console.log('\n📊 Starting data extraction from current page...');
        
        try {
            // Get current URL for reference
            const currentUrl = this.page.url();
            console.log(`🔍 Current page: ${currentUrl}`);
            
            // Wait for load results to appear
            console.log('⏳ Looking for load results...');
            await this.page.waitForSelector('tr, .load-result, .freight-item, .load-card', {
                timeout: 10000
            });
            
            // Extract data from table rows
            const loadElements = await this.page.$$('tr:has(td)');
            console.log(`🔍 Found ${loadElements.length} potential load elements`);
            
            let processedCount = 0;
            
            for (let i = 0; i < loadElements.length; i++) {
                const element = loadElements[i];
                try {
                    // Check if this row contains actual load data (has company info)
                    const hasCompanyInfo = await element.evaluate(el => {
                        return el.querySelector('.company.truncate') !== null;
                    });
                    
                    if (hasCompanyInfo) {
                        processedCount++;
                        console.log(`🔍 Processing load ${processedCount}...`);
                        const loadData = await this.extractLoadFromElement(element);
                        if (loadData && loadData.origin !== 'N/A' && loadData.destination !== 'N/A') {
                            this.data.push(loadData);
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to extract data from element ${i + 1}:`, error.message);
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
            
            // Extract origin and destination from the route columns
            const originText = await element.evaluate(el => {
                const originElement = el.querySelector('[data-test="origin-city-state"]');
                return originElement ? originElement.textContent.trim() : '';
            });
            
            const destinationText = await element.evaluate(el => {
                const destinationElement = el.querySelector('[data-test="destination-city-state"]');
                return destinationElement ? destinationElement.textContent.trim() : '';
            });
            
            loadData.origin = originText || 'N/A';
            loadData.destination = destinationText || 'N/A';
            
            // Extract equipment type, weight, length, and load type from the info container
            const equipmentInfo = await element.evaluate(el => {
                const infoContainer = el.querySelector('.info-container');
                if (!infoContainer) return {};
                
                const equipmentTypeElement = infoContainer.querySelector('.equipment-type');
                const spans = infoContainer.querySelectorAll('span');
                
                let equipmentType = equipmentTypeElement ? equipmentTypeElement.textContent.trim() : 'N/A';
                let weight = 'N/A';
                let length = 'N/A';
                let loadType = 'N/A';
                
                // Parse the pipe-separated values like "V | 42k lbs | 53 ft | Full"
                for (let i = 0; i < spans.length; i++) {
                    const text = spans[i].textContent.trim();
                    if (text.includes('lbs')) {
                        weight = text;
                    } else if (text.includes('ft')) {
                        length = text;
                    } else if (text === 'Full' || text === 'Partial') {
                        loadType = text;
                    }
                }
                
                return { equipmentType, weight, length, loadType };
            });
            
            loadData.equipmentType = equipmentInfo.equipmentType || 'N/A';
            loadData.weight = equipmentInfo.weight || 'N/A';
            loadData.tripDistance = equipmentInfo.length || 'N/A';
            loadData.loadType = equipmentInfo.loadType || 'N/A';
            
            // Extract company information
            loadData.company = await element.evaluate(el => {
                const companyElement = el.querySelector('.company.truncate');
                return companyElement ? companyElement.textContent.trim() : 'N/A';
            });
            
            // Extract rate information from the rate column
            loadData.rate = await element.evaluate(el => {
                // Check all td elements for rate
                const tds = el.querySelectorAll('td');
                for (const td of tds) {
                    const text = td.textContent.trim();
                    if (text.includes('$') && text.match(/\$\s*\d+/)) {
                        return text;
                    }
                }
                return 'N/A';
            });
            
            // Extract age of posting
            loadData.agePosted = await element.evaluate(el => {
                // Check all td elements for age pattern
                const tds = el.querySelectorAll('td');
                for (const td of tds) {
                    const text = td.textContent.trim();
                    if (text.match(/^\d+[hm]$/)) {
                        return text;
                    }
                }
                return 'N/A';
            });
            
            // Set default values for fields not visible in list view
            loadData.contactInfo = 'N/A';
            loadData.loadRequirements = 'N/A';
            loadData.pickupDate = 'N/A';
            loadData.deliveryDate = 'N/A';
            loadData.extractedAt = new Date().toISOString();
            
            console.log(`  ✅ ${loadData.origin} → ${loadData.destination} | ${loadData.rate} | ${loadData.company}`);
            
            return loadData;
            
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
            console.log('\nSample of extracted data:');
            this.data.slice(0, 3).forEach((load, index) => {
                console.log(`${index + 1}. ${load.origin} → ${load.destination}`);
                console.log(`   Rate: ${load.rate} | Company: ${load.company}`);
                console.log(`   Equipment: ${load.equipmentType} | Weight: ${load.weight} | Type: ${load.loadType}`);
                console.log(`   Age: ${load.agePosted}`);
                console.log('');
            });
        }
        
        console.log('='.repeat(50));
    }

    async askForMore() {
        return new Promise((resolve) => {
            console.log('\n🔄 Would you like to scrape more pages?');
            console.log('1. Navigate to next page of results (or different search)');
            console.log('2. Press ENTER to scrape again, or type "quit" to exit');
            
            this.rl.question('Your choice: ', (answer) => {
                resolve(answer.toLowerCase() !== 'quit');
            });
        });
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
            
            let continueScaping = true;
            
            while (continueScaping) {
                // Reset data for each scraping session
                this.data = [];
                
                // Wait for user to navigate and press Enter
                await this.waitForUserInput();
                
                // Extract data from current page
                await this.extractCurrentPageData();
                
                // Save to CSV
                await this.saveToCSV();
                
                // Show results
                await this.showResults();
                
                // Ask if user wants to scrape more
                continueScaping = await this.askForMore();
            }
            
            console.log('\n✅ Scraping session completed!');
            
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
    const scraper = new DATOneInteractiveScraper();
    scraper.run().catch(console.error);
}

module.exports = DATOneInteractiveScraper; 