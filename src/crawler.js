const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
require('dotenv').config();

class DATOneFreightCrawler {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        this.data = [];
        
        // Configuration
        this.config = {
            headless: process.env.HEADLESS === 'true',
            slowMo: parseInt(process.env.SLOW_MO) || 1000,
            timeout: parseInt(process.env.TIMEOUT) || 90000,
            maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
            outputDir: process.env.OUTPUT_DIR || './output',
            csvFilename: process.env.CSV_FILENAME || 'dat_one_freight_data.csv',
            sessionFile: 'session.json'
        };
        
        // Ensure output directory exists
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true });
        }
    }

    async initialize() {
        console.log('🚀 Initializing DAT ONE Freight Crawler...');
        
        this.browser = await chromium.launch({
            headless: this.config.headless,
            slowMo: this.config.slowMo
        });
        
        // Use saved session if available
        let context;
        if (fs.existsSync(this.config.sessionFile)) {
            context = await this.browser.newContext({ storageState: this.config.sessionFile });
            console.log('✅ Loaded session from session.json');
            this.isLoggedIn = true;
        } else {
            context = await this.browser.newContext();
        }
        this.page = await context.newPage();
        
        // Set viewport and user agent
        await this.page.setViewportSize({ width: 1920, height: 1080 });
        await this.page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        console.log('✅ Browser initialized successfully');
    }

    async login() {
        // If using session, skip login
        if (fs.existsSync(this.config.sessionFile)) {
            console.log('✅ Using saved session, skipping login.');
            return;
        }
        
        console.log('🔐 Attempting to login to DAT ONE...');
        
        try {
            // Navigate to DAT ONE login page
            await this.page.goto('https://www.dat.com/login', {
                waitUntil: 'networkidle',
                timeout: 15000
            });
            
            // Wait for login form to appear
            await this.page.waitForSelector('input[type="email"], input[name="email"], input[id="email"]', {
                timeout: 20000
            });
            await this.page.waitForSelector('input[type="password"], input[name="password"], input[id="password"]', {
                timeout: 20000
            });
            
            // Fill in credentials
            const username = process.env.DAT_ONE_USERNAME;
            const password = process.env.DAT_ONE_PASSWORD;
            
            if (!username || !password) {
                throw new Error('Missing credentials. Please set DAT_ONE_USERNAME and DAT_ONE_PASSWORD in your .env file');
            }
            
            // Fill username and password fields slowly to avoid bot detection
            const emailField = await this.page.$('input[type="email"], input[name="email"], input[id="email"]');
            const passwordField = await this.page.$('input[type="password"], input[name="password"], input[id="password"]');
            
            if (emailField && passwordField) {
                await emailField.type(username, { delay: 150 });
                await passwordField.type(password, { delay: 150 });
                
                // Find and click login button
                const loginButton = await this.page.$('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign In")');
                if (loginButton) {
                    await loginButton.click();
                } else {
                    throw new Error('Could not find login button');
                }
                
                // Wait for navigation after login
                await this.page.waitForLoadState('networkidle');
                
                // Check for "already logged in" dialog and handle it
                try {
                    const loginAnywayButton = await this.page.$('button:has-text("LOGIN ANYWAY")');
                    if (loginAnywayButton) {
                        console.log('🔄 Detected "already logged in" dialog, clicking LOGIN ANYWAY...');
                        await loginAnywayButton.click();
                        await this.page.waitForLoadState('networkidle');
                    }
                } catch (error) {
                    // No dialog found, continue normally
                    console.log('📝 No session conflict dialog detected');
                }
                
                // Check if login was successful
                const currentUrl = this.page.url();
                if (currentUrl.includes('login') || currentUrl.includes('signin')) {
                    throw new Error('Login failed: Still on login page');
                }
                
                this.isLoggedIn = true;
                console.log('✅ Successfully logged in to DAT ONE');
            } else {
                throw new Error('Could not find login form fields');
            }
            
        } catch (error) {
            console.error('❌ Login failed:', error.message);
            throw error;
        }
    }

    async searchLoads(searchCriteria = {}) {
        if (!this.isLoggedIn) {
            throw new Error('Must be logged in to search loads');
        }
        
        console.log('🔍 Searching for freight loads...');
        
        try {
            // Navigate to the DAT One dashboard first (where we saw the SEARCH LOADS button)
            await this.page.goto('https://www.dat.com', {
                waitUntil: 'networkidle',
                timeout: this.config.timeout
            });
            
            // Handle any session conflict dialog that might appear
            try {
                const loginAnywayButton = await this.page.$('button:has-text("LOGIN ANYWAY")');
                if (loginAnywayButton) {
                    console.log('🔄 Handling session conflict dialog...');
                    await loginAnywayButton.click();
                    await this.page.waitForLoadState('networkidle');
                }
            } catch (error) {
                // No dialog, continue
            }
            
            // Look for and click the "SEARCH LOADS" button
            const searchLoadsButton = await this.page.$('button:has-text("SEARCH LOADS"), a:has-text("SEARCH LOADS")');
            if (searchLoadsButton) {
                console.log('🎯 Found SEARCH LOADS button, clicking...');
                await searchLoadsButton.click();
                await this.page.waitForLoadState('networkidle');
            }
            
            // Wait for the search form to appear with more flexible selectors
            console.log('⏳ Waiting for search form to load...');
            await this.page.waitForSelector('input, select', { timeout: 30000 });
            
            // Try multiple possible selectors for origin field
            const originSelectors = [
                'input[placeholder*="origin" i]',
                'input[placeholder*="pickup" i]', 
                'input[placeholder*="from" i]',
                'input[name*="origin" i]',
                'input[id*="origin" i]'
            ];
            
            let originField = null;
            for (const selector of originSelectors) {
                try {
                    originField = await this.page.$(selector);
                    if (originField) {
                        console.log(`✅ Found origin field with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Try multiple possible selectors for destination field
            const destinationSelectors = [
                'input[placeholder*="destination" i]',
                'input[placeholder*="delivery" i]', 
                'input[placeholder*="to" i]',
                'input[name*="destination" i]',
                'input[id*="destination" i]'
            ];
            
            let destinationField = null;
            for (const selector of destinationSelectors) {
                try {
                    destinationField = await this.page.$(selector);
                    if (destinationField) {
                        console.log(`✅ Found destination field with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            const {
                origin = 'San Francisco, CA',
                destination = 'Denver, CO',
                equipmentType = 'Vans (Standard)',
                loadType = 'Full & Partial',
                dateRange = '7/8/2025 - 7/8/2025'
            } = searchCriteria;
            
            // Fill origin if found
            if (originField) {
                await originField.clear();
                await originField.type(origin, { delay: 100 });
                console.log(`📍 Set origin: ${origin}`);
            } else {
                console.log('⚠️ Could not find origin field');
            }
            
            // Fill destination if found
            if (destinationField) {
                await destinationField.clear();
                await destinationField.type(destination, { delay: 100 });
                console.log(`📍 Set destination: ${destination}`);
            } else {
                console.log('⚠️ Could not find destination field');
            }
            
            // Try to find equipment type selector
            const equipmentSelectors = [
                'select[name*="equipment" i]',
                'select[id*="equipment" i]',
                'select[class*="equipment" i]'
            ];
            
            for (const selector of equipmentSelectors) {
                try {
                    const equipmentDropdown = await this.page.$(selector);
                    if (equipmentDropdown) {
                        await equipmentDropdown.selectOption({ label: equipmentType });
                        console.log(`🚛 Set equipment type: ${equipmentType}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Look for search/submit button
            const searchButtonSelectors = [
                'button:has-text("Search")',
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("Find Loads")',
                'button:has-text("Apply")'
            ];
            
            for (const selector of searchButtonSelectors) {
                try {
                    const searchButton = await this.page.$(selector);
                    if (searchButton) {
                        console.log(`🔍 Found search button: ${selector}`);
                        await searchButton.click();
                        await this.page.waitForLoadState('networkidle');
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            console.log('✅ Search completed');
            
        } catch (error) {
            console.error('❌ Search failed:', error.message);
            throw error;
        }
    }

    async extractFreightData() {
        console.log('📊 Extracting freight load data...');
        
        try {
            // Wait for load results to appear
            await this.page.waitForSelector('.load-result, .freight-item, .load-card, [data-testid*="load"]', {
                timeout: 30000
            });
            
            // Extract data from load cards
            const loadElements = await this.page.$$('.load-result, .freight-item, .load-card, [data-testid*="load"]');
            
            for (const element of loadElements) {
                try {
                    const loadData = await this.extractLoadFromElement(element);
                    if (loadData) {
                        this.data.push(loadData);
                    }
                } catch (error) {
                    console.warn('⚠️ Failed to extract data from one load element:', error.message);
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
            // Extract load information from the element
            const loadData = {};
            
            // Extract origin and destination
            const routeText = await element.evaluate(el => {
                const routeElement = el.querySelector('.route, .origin-destination, [data-testid*="route"]');
                return routeElement ? routeElement.textContent.trim() : '';
            });
            
            if (routeText.includes(' to ') || routeText.includes(' - ')) {
                const [origin, destination] = routeText.split(/ to | - /);
                loadData.origin = origin?.trim() || 'N/A';
                loadData.destination = destination?.trim() || 'N/A';
            } else {
                loadData.origin = 'N/A';
                loadData.destination = 'N/A';
            }
            
            // Extract equipment type
            loadData.equipmentType = await element.evaluate(el => {
                const equipmentElement = el.querySelector('.equipment, .equipment-type, [data-testid*="equipment"]');
                return equipmentElement ? equipmentElement.textContent.trim() : 'N/A';
            });
            
            // Extract weight
            loadData.weight = await element.evaluate(el => {
                const weightElement = el.querySelector('.weight, .load-weight, [data-testid*="weight"]');
                return weightElement ? weightElement.textContent.trim() : 'N/A';
            });
            
            // Extract rate information
            loadData.rate = await element.evaluate(el => {
                const rateElement = el.querySelector('.rate, .price, .amount, [data-testid*="rate"]');
                return rateElement ? rateElement.textContent.trim() : 'N/A';
            });
            
            // Extract trip distance
            loadData.tripDistance = await element.evaluate(el => {
                const distanceElement = el.querySelector('.distance, .miles, [data-testid*="distance"]');
                return distanceElement ? distanceElement.textContent.trim() : 'N/A';
            });
            
            // Extract company information
            loadData.company = await element.evaluate(el => {
                const companyElement = el.querySelector('.company, .broker, .shipper, [data-testid*="company"]');
                return companyElement ? companyElement.textContent.trim() : 'N/A';
            });
            
            // Extract contact information
            loadData.contactInfo = await element.evaluate(el => {
                const contactElement = el.querySelector('.contact, .phone, .email, [data-testid*="contact"]');
                return contactElement ? contactElement.textContent.trim() : 'N/A';
            });
            
            // Extract load requirements
            loadData.loadRequirements = await element.evaluate(el => {
                const reqElement = el.querySelector('.requirements, .load-requirements, [data-testid*="requirements"]');
                return reqElement ? reqElement.textContent.trim() : 'N/A';
            });
            
            // Extract pickup and delivery dates
            loadData.pickupDate = await element.evaluate(el => {
                const pickupElement = el.querySelector('.pickup-date, .pickup, [data-testid*="pickup"]');
                return pickupElement ? pickupElement.textContent.trim() : 'N/A';
            });
            
            loadData.deliveryDate = await element.evaluate(el => {
                const deliveryElement = el.querySelector('.delivery-date, .delivery, [data-testid*="delivery"]');
                return deliveryElement ? deliveryElement.textContent.trim() : 'N/A';
            });
            
            // Extract load type (Full/Partial)
            loadData.loadType = await element.evaluate(el => {
                const typeElement = el.querySelector('.load-type, .type, [data-testid*="type"]');
                return typeElement ? typeElement.textContent.trim() : 'N/A';
            });
            
            // Extract age of posting
            loadData.agePosted = await element.evaluate(el => {
                const ageElement = el.querySelector('.age, .posted, .time-posted, [data-testid*="age"]');
                return ageElement ? ageElement.textContent.trim() : 'N/A';
            });
            
            // Add extraction timestamp
            loadData.extractedAt = new Date().toISOString();
            
            console.log(`✅ Extracted load: ${loadData.origin} → ${loadData.destination} (${loadData.rate})`);
            
            return loadData;
            
        } catch (error) {
            console.warn('⚠️ Failed to extract load data:', error.message);
            return null;
        }
    }

    async saveToCSV(data = null) {
        const dataToSave = data || this.data;
        
        if (dataToSave.length === 0) {
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
        
        await csvWriter.writeRecords(dataToSave);
        console.log(`✅ Data saved to ${path.join(this.config.outputDir, this.config.csvFilename)}`);
    }

    async saveIncrementalCSV(newRecord) {
        if (!newRecord) {
            console.log('⚠️ No record to save');
            return;
        }
        
        const csvFilePath = path.join(this.config.outputDir, this.config.csvFilename);
        
        // Check if file exists to determine if we need to write headers
        const fileExists = fs.existsSync(csvFilePath);
        
        const csvWriter = createCsvWriter({
            path: csvFilePath,
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
            ],
            append: fileExists
        });
        
        await csvWriter.writeRecords([newRecord]);
        console.log(`💾 Saved to CSV: ${newRecord.origin} → ${newRecord.destination}`);
    }

    async getExistingLoads() {
        const csvFilePath = path.join(this.config.outputDir, this.config.csvFilename);
        
        if (!fs.existsSync(csvFilePath)) {
            return new Set();
        }
        
        try {
            const csvContent = fs.readFileSync(csvFilePath, 'utf8');
            const lines = csvContent.split('\n');
            const existingLoads = new Set();
            
            // Skip header line and process data lines
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    // Create a unique key from origin and destination
                    const columns = line.split(',');
                    if (columns.length >= 2) {
                        const origin = columns[0].replace(/"/g, '');
                        const destination = columns[1].replace(/"/g, '');
                        const key = `${origin}_${destination}`;
                        existingLoads.add(key);
                    }
                }
            }
            
            console.log(`📋 Found ${existingLoads.size} existing loads in CSV`);
            return existingLoads;
        } catch (error) {
            console.warn('⚠️ Error reading existing CSV:', error.message);
            return new Set();
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser closed');
        }
    }

    async crawlFreightLoads(searchCriteria = {}) {
        try {
            // Initialize if not already done
            if (!this.browser) {
                await this.initialize();
            }
            
            // Login if not already logged in
            if (!this.isLoggedIn) {
                await this.login();
            }
            
            // Perform search
            await this.searchLoads(searchCriteria);
            
            // Extract data
            await this.extractFreightData();
            
            // Save to CSV
            await this.saveToCSV();
            
            console.log('✅ Freight load crawling completed successfully!');
            
        } catch (error) {
            console.error('❌ Error during freight crawling:', error.message);
            throw error;
        }
    }
}

module.exports = DATOneFreightCrawler; 