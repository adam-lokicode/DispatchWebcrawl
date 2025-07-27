const { chromium } = require('playwright');
const fs = require('fs');

class DATOnePhoneDebugger {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        console.log('🚀 Connecting to your existing browser for phone debugging...');
        
        try {
            this.browser = await chromium.connectOverCDP('http://localhost:9222');
            console.log('✅ Connected to existing browser');
            
            // Find DAT One page
            const contexts = this.browser.contexts();
            let datOnePage = null;
            
            for (const context of contexts) {
                const pages = context.pages();
                for (const page of pages) {
                    try {
                        const url = page.url();
                        if (url.includes('dat.com') || url.includes('one.dat.com')) {
                            datOnePage = page;
                            console.log(`✅ Found DAT One page: ${url}`);
                            break;
                        }
                    } catch (error) {
                        continue;
                    }
                }
                if (datOnePage) break;
            }
            
            if (datOnePage) {
                this.page = datOnePage;
            } else {
                throw new Error('No DAT One page found');
            }
            
        } catch (error) {
            console.error('❌ Could not connect to browser:', error.message);
            throw error;
        }
    }

    async debugPhoneNumbers() {
        console.log('\n🔍 Debugging phone number extraction...');
        
        try {
            // Wait for load rows
            await this.page.waitForSelector('.row-container', { timeout: 5000 });
            
            // Get first few rows for debugging
            const loadRows = await this.page.$$('.row-container');
            console.log(`Found ${loadRows.length} load rows`);
            
            for (let i = 0; i < Math.min(3, loadRows.length); i++) {
                const row = loadRows[i];
                console.log(`\n--- Debugging Row ${i + 1} ---`);
                
                // Get company name
                const companyName = await row.$eval('.company', el => el.textContent.trim()).catch(() => 'N/A');
                console.log(`Company: ${companyName}`);
                
                // Look for all links in the row
                const links = await row.$$eval('a', elements => 
                    elements.map(el => ({
                        href: el.href,
                        text: el.textContent.trim(),
                        classes: el.className
                    }))
                );
                
                console.log('Links found:', links);
                
                // Look for phone patterns in all text
                const allText = await row.evaluate(el => el.textContent);
                const phoneRegex = /\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g;
                const phoneMatches = [...allText.matchAll(phoneRegex)];
                
                if (phoneMatches.length > 0) {
                    console.log('Phone patterns found:', phoneMatches.map(m => m[0]));
                } else {
                    console.log('No phone patterns found in text');
                }
                
                // Look for elements that might contain phone numbers
                const potentialPhoneElements = await row.$$eval('[class*="phone"], [class*="contact"], [data-test*="phone"], [data-test*="contact"], a[href*="tel"]', elements => 
                    elements.map(el => ({
                        tagName: el.tagName,
                        className: el.className,
                        textContent: el.textContent.trim(),
                        href: el.href || 'N/A',
                        style: el.style.display
                    }))
                ).catch(() => []);
                
                console.log('Potential phone elements:', potentialPhoneElements);
                
                // Try hovering over company name to see if phone appears
                try {
                    const companyElement = await row.$('.company');
                    if (companyElement) {
                        console.log('Hovering over company name...');
                        await companyElement.hover();
                        await this.page.waitForTimeout(1000);
                        
                        // Check for new phone elements after hover
                        const afterHoverLinks = await row.$$eval('a[href*="tel"]', elements => 
                            elements.map(el => ({
                                href: el.href,
                                text: el.textContent.trim(),
                                visible: el.offsetParent !== null
                            }))
                        ).catch(() => []);
                        
                        console.log('Phone links after hover:', afterHoverLinks);
                    }
                } catch (error) {
                    console.log('Hover failed:', error.message);
                }
                
                console.log('---');
            }
            
        } catch (error) {
            console.error('❌ Debug failed:', error.message);
            throw error;
        }
    }

    async close() {
        console.log('🔒 Disconnected from browser (browser stays open)');
    }

    async run() {
        try {
            await this.initialize();
            await this.debugPhoneNumbers();
            console.log('\n✅ Phone debugging completed!');
        } catch (error) {
            console.error('❌ Error during debugging:', error.message);
        } finally {
            await this.close();
        }
    }
}

// Run the debugger
if (require.main === module) {
    const debugger = new DATOnePhoneDebugger();
    debugger.run().catch(console.error);
}

module.exports = DATOnePhoneDebugger; 