const { chromium } = require('playwright');

async function debugRowClicking() {
    console.log('🔗 Connecting to existing Chrome browser for row clicking debug...');
    
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
        
        // Wait for load results to appear - try DAT One specific selectors
        console.log('⏳ Waiting for load results...');
        const loadSelectors = [
            '[data-test="load-origin-cell"]',
            '.route-dh-container',
            '.orig-dest-container',
            'tr',
            'tbody tr'
        ];
        
        let foundSelector = null;
        for (const selector of loadSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 10000 });
                foundSelector = selector;
                console.log(`✅ Found load results with selector: ${selector}`);
                break;
            } catch (error) {
                console.log(`⚠️ Selector "${selector}" not found, trying next...`);
            }
        }
        
        if (!foundSelector) {
            // Let's see what's actually on the page
            console.log('🔍 No load results found. Let me check what\'s on the page...');
            const pageContent = await page.evaluate(() => {
                const body = document.body;
                const text = body.textContent.substring(0, 500);
                const classes = [...document.querySelectorAll('*')].map(el => el.className).filter(c => c && c.includes('load')).slice(0, 10);
                return { text, classes };
            });
            
            console.log('📄 Page content preview:', pageContent.text);
            console.log('🏷️ Classes containing "load":', pageContent.classes);
            
            throw new Error('Could not find load results on the page');
        }
        
        // Try different selectors to find the actual clickable rows
        const possibleSelectors = [
            'tr',  // Table rows
            'tr:has([data-test="load-origin-cell"])',  // Rows with origin cell
            'tr:has(.route-dh-container)',  // Rows with route container
            'tr:has(.orig-dest-container)',  // Rows with origin/destination
            'tbody tr',  // Table body rows
            'tr.ng-star-inserted',  // Angular generated rows
            'tr[role="row"]'  // Rows with ARIA role
        ];
        
        let loadRows = [];
        let workingSelector = null;
        
        for (const selector of possibleSelectors) {
            try {
                const rows = await page.$$(selector);
                if (rows.length > 0) {
                    console.log(`✅ Found ${rows.length} elements with selector: ${selector}`);
                    
                    // Test if these elements have the load data we expect
                    const hasLoadData = await rows[0].evaluate(el => {
                        const originCell = el.querySelector('[data-test="load-origin-cell"]');
                        const destinationCell = el.querySelector('[data-test="load-destination-cell"]');
                        return originCell && destinationCell;
                    });
                    
                    if (hasLoadData) {
                        loadRows = rows;
                        workingSelector = selector;
                        console.log(`🎯 Selector "${selector}" contains load data - using this one!`);
                        break;
                    } else {
                        console.log(`⚠️ Selector "${selector}" found elements but no load data`);
                    }
                }
            } catch (error) {
                console.log(`❌ Selector "${selector}" failed: ${error.message}`);
            }
        }
        
        if (loadRows.length === 0) {
            console.log('🔍 Let me check all table rows to see what we have...');
            const allRows = await page.$$('tr');
            console.log(`Found ${allRows.length} total table rows`);
            
            for (let i = 0; i < Math.min(3, allRows.length); i++) {
                const rowInfo = await allRows[i].evaluate(el => {
                    return {
                        className: el.className,
                        innerHTML: el.innerHTML.substring(0, 200) + '...',
                        hasOrigin: !!el.querySelector('[data-test="load-origin-cell"]'),
                        hasDestination: !!el.querySelector('[data-test="load-destination-cell"]')
                    };
                });
                console.log(`Row ${i + 1}:`, rowInfo);
            }
            
            throw new Error('Could not find any clickable load rows with the expected structure');
        }
        
        console.log(`\n📋 Found ${loadRows.length} load rows using selector: ${workingSelector}`);
        
        // Debug first 3 rows to see if clicking works properly
        const maxRows = Math.min(3, loadRows.length);
        
        for (let i = 0; i < maxRows; i++) {
            try {
                console.log(`\n🔍 DEBUG: Testing row ${i + 1}/${maxRows}...`);
                
                // Get fresh reference to the row
                const currentRows = await page.$$(workingSelector);
                if (i >= currentRows.length) {
                    console.log('⚠️ Row no longer exists, skipping...');
                    continue;
                }
                
                const row = currentRows[i];
                
                // Extract basic info from the row BEFORE clicking
                const rowInfo = await row.evaluate(el => {
                    const originCell = el.querySelector('[data-test="load-origin-cell"]');
                    const destinationCell = el.querySelector('[data-test="load-destination-cell"]');
                    const ageCell = el.querySelector('[data-test="load-age-cell"]');
                    const rateCell = el.querySelector('[data-test="load-rate-cell"]');
                    const companyCell = el.querySelector('.company, .company.truncate');
                    
                    // Get the full HTML for debugging
                    const html = el.outerHTML.substring(0, 200) + '...';
                    
                    return {
                        origin: originCell ? originCell.textContent.trim() : 'N/A',
                        destination: destinationCell ? destinationCell.textContent.trim() : 'N/A',
                        age: ageCell ? ageCell.textContent.trim() : 'N/A',
                        rate: rateCell ? rateCell.textContent.trim() : 'N/A',
                        company: companyCell ? companyCell.textContent.trim() : 'N/A',
                        html: html
                    };
                });
                
                console.log(`📦 Row ${i + 1} INFO BEFORE CLICKING:`);
                console.log(`   Origin: ${rowInfo.origin}`);
                console.log(`   Destination: ${rowInfo.destination}`);
                console.log(`   Age: ${rowInfo.age}`);
                console.log(`   Rate: ${rowInfo.rate}`);
                console.log(`   Company: ${rowInfo.company}`);
                console.log(`   HTML: ${rowInfo.html}`);
                
                // Highlight the row we're about to click
                await row.evaluate(el => {
                    el.style.backgroundColor = 'yellow';
                    el.style.border = '2px solid red';
                });
                
                console.log(`\n🖱️ CLICKING ON ROW ${i + 1}...`);
                
                // Try clicking on the row
                await row.click();
                
                // Wait for any changes
                await page.waitForTimeout(2000);
                
                // Check if any modal or expanded content appeared
                const modalInfo = await page.evaluate(() => {
                    // Look for expanded details or modals
                    const expandedElements = document.querySelectorAll('.expanded, .details, .modal, [class*="expanded"], [class*="detail"], [class*="modal"]');
                    const visibleElements = [];
                    
                    expandedElements.forEach(el => {
                        if (el.offsetParent !== null) { // Only visible elements
                            visibleElements.push({
                                className: el.className,
                                text: el.textContent.substring(0, 100) + '...'
                            });
                        }
                    });
                    
                    return visibleElements;
                });
                
                console.log(`📱 AFTER CLICKING - Found ${modalInfo.length} expanded/modal elements:`);
                modalInfo.forEach((modal, idx) => {
                    console.log(`   ${idx + 1}. ${modal.className}`);
                    console.log(`      Text: ${modal.text}`);
                });
                
                // Look for phone numbers after clicking
                const phoneInfo = await page.evaluate(() => {
                    const telLinks = document.querySelectorAll('a[href^="tel:"]');
                    const phones = [];
                    telLinks.forEach(link => {
                        phones.push({
                            text: link.textContent.trim(),
                            href: link.getAttribute('href'),
                            visible: link.offsetParent !== null
                        });
                    });
                    return phones;
                });
                
                console.log(`📞 PHONE NUMBERS FOUND: ${phoneInfo.length}`);
                phoneInfo.forEach((phone, idx) => {
                    console.log(`   ${idx + 1}. ${phone.text} (${phone.href}) - Visible: ${phone.visible}`);
                });
                
                // Remove highlighting
                await row.evaluate(el => {
                    el.style.backgroundColor = '';
                    el.style.border = '';
                });
                
                // Close any opened modal
                console.log(`\n🚪 CLOSING MODAL...`);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);
                
                console.log('\n' + '='.repeat(80));
                
            } catch (error) {
                console.error(`❌ Error testing row ${i + 1}:`, error.message);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);
            }
        }
        
        console.log('\n✅ Row clicking debug completed!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the debug
debugRowClicking(); 