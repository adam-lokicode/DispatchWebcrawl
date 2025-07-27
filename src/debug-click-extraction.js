const { chromium } = require('playwright');

async function debugClickExtraction() {
    console.log('🔗 Connecting to existing Chrome browser for debugging...');
    
    try {
        // Connect to existing browser
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        
        if (contexts.length === 0) {
            throw new Error('No browser contexts found');
        }
        
        const context = contexts[0];
        const pages = context.pages();
        
        if (pages.length === 0) {
            throw new Error('No pages found');
        }
        
        // Use the first page or find the DAT One page
        let page = pages[0];
        for (const p of pages) {
            const url = p.url();
            if (url.includes('dat.com') || url.includes('one.dat.com')) {
                page = p;
                break;
            }
        }
        
        console.log(`📄 Using page: ${page.url()}`);
        
        // Navigate to the search loads page if not already there
        if (!page.url().includes('search-loads')) {
            console.log('🔍 Navigating to search loads page...');
            await page.goto('https://one.dat.com/search-loads-ow', { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
        }
        
        // Wait for load results to appear
        console.log('⏳ Waiting for load results...');
        await page.waitForSelector('.row-container', { timeout: 30000 });
        
        // Get all load rows
        const loadRows = await page.$$('.row-container');
        console.log(`📋 Found ${loadRows.length} load rows`);
        
        // Debug first few rows only
        const maxRows = Math.min(3, loadRows.length);
        
        for (let i = 0; i < maxRows; i++) {
            try {
                console.log(`\n🔍 DEBUG: Processing load ${i + 1}/${maxRows}...`);
                
                // Get fresh reference to the row
                const currentRows = await page.$$('.row-container');
                if (i >= currentRows.length) {
                    console.log('⚠️ Row no longer exists, skipping...');
                    continue;
                }
                
                const row = currentRows[i];
                
                // First, check what phone numbers exist BEFORE clicking
                console.log('\n📱 BEFORE CLICKING:');
                const phonesBefore = await page.evaluate(() => {
                    const telLinks = document.querySelectorAll('a[href^="tel:"]');
                    const phones = [];
                    telLinks.forEach(link => {
                        phones.push({
                            href: link.getAttribute('href'),
                            text: link.textContent.trim(),
                            className: link.className,
                            parentElement: link.parentElement.tagName
                        });
                    });
                    return phones;
                });
                
                console.log(`Found ${phonesBefore.length} phone links before clicking:`);
                phonesBefore.forEach((phone, idx) => {
                    console.log(`  ${idx + 1}. ${phone.text} (${phone.href}) - Class: ${phone.className} - Parent: ${phone.parentElement}`);
                });
                
                // Click on the row to open details
                console.log('\n🖱️ CLICKING ON ROW...');
                await row.click();
                
                // Wait for details to load
                await page.waitForTimeout(3000);
                
                // Check what phone numbers exist AFTER clicking
                console.log('\n📱 AFTER CLICKING:');
                const phonesAfter = await page.evaluate(() => {
                    const telLinks = document.querySelectorAll('a[href^="tel:"]');
                    const phones = [];
                    telLinks.forEach(link => {
                        phones.push({
                            href: link.getAttribute('href'),
                            text: link.textContent.trim(),
                            className: link.className,
                            parentElement: link.parentElement.tagName,
                            isVisible: link.offsetParent !== null
                        });
                    });
                    return phones;
                });
                
                console.log(`Found ${phonesAfter.length} phone links after clicking:`);
                phonesAfter.forEach((phone, idx) => {
                    console.log(`  ${idx + 1}. ${phone.text} (${phone.href}) - Class: ${phone.className} - Parent: ${phone.parentElement} - Visible: ${phone.isVisible}`);
                });
                
                // Look for phone patterns in text
                console.log('\n📱 PHONE PATTERNS IN TEXT:');
                const phonePatterns = await page.evaluate(() => {
                    const phoneRegex = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
                    const allText = document.body.textContent;
                    const matches = allText.match(phoneRegex);
                    return matches ? [...new Set(matches)] : [];
                });
                
                console.log(`Found ${phonePatterns.length} phone patterns:`);
                phonePatterns.forEach((pattern, idx) => {
                    console.log(`  ${idx + 1}. ${pattern}`);
                });
                
                // Look for modal or expanded content
                console.log('\n📱 MODAL/EXPANDED CONTENT:');
                const modalInfo = await page.evaluate(() => {
                    const modalSelectors = [
                        '.modal', '.popup', '.expanded', '.details', 
                        '[class*="modal"]', '[class*="popup"]', '[class*="detail"]',
                        '[class*="overlay"]', '[class*="dialog"]'
                    ];
                    
                    const modals = [];
                    modalSelectors.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            if (el.offsetParent !== null) { // Only visible elements
                                modals.push({
                                    selector: selector,
                                    className: el.className,
                                    text: el.textContent.slice(0, 200) + '...'
                                });
                            }
                        });
                    });
                    return modals;
                });
                
                console.log(`Found ${modalInfo.length} modal/expanded elements:`);
                modalInfo.forEach((modal, idx) => {
                    console.log(`  ${idx + 1}. ${modal.selector} - Class: ${modal.className}`);
                    console.log(`     Text: ${modal.text}`);
                });
                
                // Extract basic load info
                const loadInfo = await page.evaluate(() => {
                    const originElement = document.querySelector('[data-test="load-origin-cell"]');
                    const destinationElement = document.querySelector('[data-test="load-destination-cell"]');
                    const companyElement = document.querySelector('.company.truncate');
                    
                    return {
                        origin: originElement ? originElement.textContent.trim() : 'N/A',
                        destination: destinationElement ? destinationElement.textContent.trim() : 'N/A',
                        company: companyElement ? companyElement.textContent.trim() : 'N/A'
                    };
                });
                
                console.log(`\n📦 LOAD INFO: ${loadInfo.origin} → ${loadInfo.destination} (${loadInfo.company})`);
                
                // Close the modal
                console.log('\n🚪 CLOSING MODAL...');
                await page.keyboard.press('Escape');
                await page.waitForTimeout(2000);
                
                console.log('\n' + '='.repeat(80));
                
            } catch (error) {
                console.error(`❌ Error debugging load ${i + 1}:`, error.message);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(2000);
            }
        }
        
        console.log('\n✅ Debug extraction completed!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the debug extraction
debugClickExtraction(); 