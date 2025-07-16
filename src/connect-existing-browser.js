const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const readline = require('readline');

class DATOneExistingBrowserScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.data = [];
        
        this.config = {
            outputDir: './output',
            csvFilename: 'dat_one_freight_data.csv'
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
        console.log('🚀 Connecting to your existing browser...');
        
        try {
            // Try to connect to existing Chrome/Chromium with debugging enabled
            this.browser = await chromium.connectOverCDP('http://localhost:9222');
            console.log('✅ Connected to existing browser');
            
            // Get all contexts and find the DAT One page
            const contexts = this.browser.contexts();
            let datOnePage = null;
            
            for (const context of contexts) {
                const pages = context.pages();
                for (const page of pages) {
                    try {
                        const url = page.url();
                        console.log(`🔍 Found page: ${url}`);
                        
                        // Look for DAT One pages
                        if (url.includes('dat.com') || url.includes('one.dat.com')) {
                            datOnePage = page;
                            console.log(`✅ Found DAT One page: ${url}`);
                            break;
                        }
                    } catch (error) {
                        // Skip pages that can't be accessed
                        continue;
                    }
                }
                if (datOnePage) break;
            }
            
            if (datOnePage) {
                this.page = datOnePage;
                console.log('✅ Connected to DAT One page');
            } else {
                // Fallback to first available page
                if (contexts.length > 0) {
                    const pages = contexts[0].pages();
                    if (pages.length > 0) {
                        this.page = pages[0];
                        console.log('⚠️ Could not find DAT One page, using first available page');
                        console.log('   Please navigate to DAT One in your browser first');
                    } else {
                        throw new Error('No pages found in browser');
                    }
                } else {
                    throw new Error('No contexts found in browser');
                }
            }
            
        } catch (error) {
            console.log('❌ Could not connect to existing browser:', error.message);
            console.log('');
            console.log('To fix this, you need to start your browser with debugging enabled:');
            console.log('');
            console.log('For Chrome/Chromium:');
            console.log('  open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug');
            console.log('');
            console.log('Or use the fallback method below...');
            throw error;
        }
    }

    async waitForUserInput() {
        return new Promise((resolve) => {
            console.log('\n🎯 INSTRUCTIONS:');
            console.log('1. Make sure you\'re on the DAT One search results page in your browser');
            console.log('2. Ensure you can see the load results table');
            console.log('3. Press ENTER in this terminal to scrape the current page');
            console.log('\n⏳ Waiting for your input...');
            
            this.rl.question('Press ENTER when ready to scrape: ', () => {
                resolve();
            });
        });
    }

    async extractCurrentPageData() {
        console.log('\n📊 Starting data extraction from your current page...');
        
        try {
            // Get current URL for reference
            const currentUrl = this.page.url();
            console.log(`🔍 Current page: ${currentUrl}`);
            
            // Wait for DAT One specific load row containers
            console.log('⏳ Looking for DAT One load row containers...');
            await this.page.waitForSelector('.row-container', { timeout: 10000 });
            
            // Extract data from each load row container
            const loadRows = await this.page.$$('.row-container');
            console.log(`🔍 Found ${loadRows.length} load row containers`);
            
            let processedCount = 0;
            
            for (let i = 0; i < loadRows.length; i++) {
                const row = loadRows[i];
                try {
                    processedCount++;
                    console.log(`🔍 Processing load row ${processedCount}...`);
                    
                    const loadData = await this.extractLoadFromRowElement(row);
                    if (loadData) {
                        this.data.push(loadData);
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to extract data from row ${processedCount}:`, error.message);
                }
            }
            
            console.log(`\n✅ Extracted data for ${this.data.length} loads`);
            
        } catch (error) {
            console.error('❌ Data extraction failed:', error.message);
            throw error;
        }
    }

    async extractLoadFromRowElement(rowElement) {
        try {
            const loadData = {};
            
            // Extract age
            const ageText = await rowElement.$eval('[data-test="load-age-cell"]', el => el.textContent.trim()).catch(() => 'N/A');
            loadData.agePosted = ageText;
            
            // Extract rate (might be dash for no rate)
            const rateText = await rowElement.$eval('[data-test="load-rate-cell"]', el => el.textContent.trim()).catch(() => 'N/A');
            loadData.rate = rateText === '–' ? 'N/A' : rateText;
            
            // Extract origin
            const originText = await rowElement.$eval('[data-test="load-origin-cell"]', el => el.textContent.trim()).catch(() => 'N/A');
            loadData.origin = originText;
            
            // Extract destination
            const destinationText = await rowElement.$eval('[data-test="load-destination-cell"]', el => el.textContent.trim()).catch(() => 'N/A');
            loadData.destination = destinationText;
            
            // Extract deadhead origin (DH-O)
            const dhoText = await rowElement.$eval('[data-test="load-dho-cell"]', el => el.textContent.trim()).catch(() => 'N/A');
            
            // Extract deadhead destination (DH-D)
            const dhdText = await rowElement.$eval('[data-test="load-dhd-cell"]', el => el.textContent.trim()).catch(() => 'N/A');
            
            // Extract equipment info from the info-container
            const equipmentInfo = await rowElement.evaluate(el => {
                const infoContainer = el.querySelector('.info-container');
                if (!infoContainer) return {};
                
                const equipmentType = infoContainer.querySelector('.equipment-type')?.textContent?.trim() || 'N/A';
                const spans = infoContainer.querySelectorAll('span');
                
                let weight = 'N/A';
                let length = 'N/A';
                let loadType = 'N/A';
                
                // Parse the pipe-separated values like "V | 44k lbs | 48 ft | Full"
                for (const span of spans) {
                    const text = span.textContent.trim();
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
            
            // Extract company name
            const companyText = await rowElement.$eval('.company', el => el.textContent.trim()).catch(() => 'N/A');
            loadData.company = companyText;
            
            // Extract phone number from tel: links
            const phoneNumber = await rowElement.evaluate(el => {
                const phoneLink = el.querySelector('a[href^="tel:"]');
                return phoneLink ? phoneLink.textContent.trim() : 'N/A';
            });
            loadData.contactInfo = phoneNumber;
            
            // Set default values for fields not available in this view
            loadData.loadRequirements = 'N/A';
            loadData.pickupDate = 'N/A';
            loadData.deliveryDate = 'N/A';
            loadData.extractedAt = new Date().toISOString();
            
            // Only return if we have meaningful data
            if (loadData.origin !== 'N/A' && loadData.destination !== 'N/A') {
                console.log(`  ✅ ${loadData.origin} → ${loadData.destination} | ${loadData.rate} | ${loadData.company} | ${loadData.contactInfo} | ${loadData.equipmentType} ${loadData.weight} ${loadData.loadType}`);
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
        // Don't close the browser since we're connecting to existing one
        console.log('🔒 Disconnected from browser (browser stays open)');
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
            
            // Fallback suggestion
            console.log('\n💡 ALTERNATIVE APPROACH:');
            console.log('If the browser connection failed, try the manual method:');
            console.log('1. Right-click on your DAT One results page');
            console.log('2. Select "View Page Source"');
            console.log('3. Save the source as "page-source.html"');
            console.log('4. Run: npm run page');
            
        } finally {
            await this.close();
        }
    }
}

// Run the scraper
if (require.main === module) {
    const scraper = new DATOneExistingBrowserScraper();
    scraper.run().catch(console.error);
}

module.exports = DATOneExistingBrowserScraper; 