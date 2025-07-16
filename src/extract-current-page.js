const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class DATOneCurrentPageExtractor {
    constructor() {
        this.browser = null;
        this.page = null;
        this.data = [];
        
        this.config = {
            headless: false,
            slowMo: 1000,
            timeout: 30000,
            outputDir: './output',
            csvFilename: 'dat_one_freight_data.csv',
            sessionFile: 'session.json'
        };
        
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true });
        }
    }

    async initialize() {
        console.log('🚀 Initializing DAT ONE Current Page Extractor...');
        
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
        
        console.log('✅ Browser initialized successfully');
    }

    async extractCurrentPageData() {
        console.log('📊 Extracting freight load data from current page...');
        
        try {
            // Wait for the page to be ready
            await this.page.waitForLoadState('networkidle');
            
            // Wait for load results to appear - looking for table rows with load data
            await this.page.waitForSelector('tr, .load-result, .freight-item, .load-card', {
                timeout: 10000
            });
            
            // Extract data from table rows (DAT One uses a table structure)
            const loadElements = await this.page.$$('tr:has(td), .load-result, .freight-item, .load-card');
            
            console.log(`🔍 Found ${loadElements.length} potential load elements`);
            
            for (let i = 0; i < loadElements.length; i++) {
                const element = loadElements[i];
                try {
                    // Check if this row contains actual load data (has company info)
                    const hasCompanyInfo = await element.evaluate(el => {
                        return el.querySelector('.company.truncate') !== null;
                    });
                    
                    if (hasCompanyInfo) {
                        console.log(`🔍 Processing load element ${i + 1}...`);
                        const loadData = await this.extractLoadFromElement(element);
                        if (loadData && loadData.origin !== 'N/A' && loadData.destination !== 'N/A') {
                            this.data.push(loadData);
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to extract data from load element ${i + 1}:`, error.message);
                }
            }
            
            console.log(`✅ Extracted data for ${this.data.length} loads`);
            
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
                const rateSelectors = [
                    '[data-test="rate"]',
                    '.rate',
                    '.price',
                    '.amount',
                    'td:nth-child(3)',
                    'td:contains("$")'
                ];
                
                for (const selector of rateSelectors) {
                    try {
                        const rateElement = el.querySelector(selector);
                        if (rateElement && rateElement.textContent.includes('$')) {
                            return rateElement.textContent.trim();
                        }
                    } catch (e) {
                        // Continue to next selector
                    }
                }
                
                // Also check all td elements for rate
                const tds = el.querySelectorAll('td');
                for (const td of tds) {
                    if (td.textContent.includes('$')) {
                        return td.textContent.trim();
                    }
                }
                
                return 'N/A';
            });
            
            // Extract age of posting
            loadData.agePosted = await element.evaluate(el => {
                const ageSelectors = [
                    '[data-test="age"]',
                    '.age',
                    'td:first-child'
                ];
                
                for (const selector of ageSelectors) {
                    try {
                        const ageElement = el.querySelector(selector);
                        if (ageElement) {
                            const text = ageElement.textContent.trim();
                            if (text.match(/^\d+[hm]$/)) {
                                return text;
                            }
                        }
                    } catch (e) {
                        // Continue to next selector
                    }
                }
                
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
            
            console.log(`✅ Extracted load: ${loadData.origin} → ${loadData.destination} (${loadData.rate}) - ${loadData.company}`);
            
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
        
        console.log('💾 Saving data to CSV...');
        
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

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser closed');
        }
    }

    async run() {
        try {
            await this.initialize();
            await this.extractCurrentPageData();
            await this.saveToCSV();
            
            console.log('✅ Data extraction completed successfully!');
            console.log(`📊 Total loads extracted: ${this.data.length}`);
            
        } catch (error) {
            console.error('❌ Error during data extraction:', error.message);
            throw error;
        } finally {
            await this.close();
        }
    }
}

// Run the extractor
if (require.main === module) {
    const extractor = new DATOneCurrentPageExtractor();
    extractor.run().catch(console.error);
}

module.exports = DATOneCurrentPageExtractor; 