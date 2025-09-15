const { chromium } = require('playwright');

async function debugSingleRun() {
    console.log('🔍 Debugging single scraper run...');
    
    let browser, page;
    try {
        // Connect to the existing browser
        browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        const context = contexts[0];
        const pages = context.pages();
        page = pages[0];

        console.log('✅ Connected to browser');
        console.log('📍 Current URL:', await page.url());

        // Test the parseOriginDestination function directly
        const testOriginDestination = await page.evaluate(() => {
            const parseOriginDestination = (text) => {
                if (!text) return { origin: '', destination: '' };
                
                console.log('Input text:', text);
                
                // Handle cases like "Manteca, CAAurora, CO" or "Salinas, CADenver, CO"
                const cleanText = text.trim();
                
                // Look for pattern: City, StateCity, State
                const match = cleanText.match(/^(.+?,\s*[A-Z]{2})([A-Z][a-z]+.*?,\s*[A-Z]{2})$/);
                if (match) {
                    console.log('Regex match found:', match);
                    return {
                        origin: match[1].trim(),
                        destination: match[2].trim()
                    };
                }
                
                console.log('No regex match, trying fallback...');
                
                // Fallback: try to split on state abbreviation pattern
                const statePattern = /([A-Z]{2})([A-Z][a-z]+)/;
                const stateMatch = cleanText.match(statePattern);
                if (stateMatch) {
                    console.log('State pattern match:', stateMatch);
                    const splitPoint = cleanText.indexOf(stateMatch[0]);
                    if (splitPoint > 0) {
                        const origin = cleanText.substring(0, splitPoint + 2).trim();
                        const destination = cleanText.substring(splitPoint + 2).trim();
                        console.log('Split result:', { origin, destination });
                        return { origin, destination };
                    }
                }
                
                console.log('Using fallback');
                return { origin: cleanText, destination: '' };
            };

            // Test with actual problematic data
            const testCases = [
                "Manteca, CAAurora, CO",
                "Salinas, CADenver, CO", 
                "Bakersfield, CABroomfield, CO",
                "Tulare, CABroomfield, CO"
            ];

            console.log('=== Testing Origin/Destination Parsing ===');
            testCases.forEach(testCase => {
                console.log(`\nTesting: "${testCase}"`);
                const result = parseOriginDestination(testCase);
                console.log(`Result: origin="${result.origin}", destination="${result.destination}"`);
            });

            return 'Test completed';
        });

        console.log('📋 Origin/destination parsing test completed');

        // Test reference ID extraction
        const referenceTest = await page.evaluate(() => {
            console.log('=== Testing Reference ID Extraction ===');
            
            // Look for any existing modals or detailed views
            const modals = document.querySelectorAll('.modal-content, .load-detail-modal, [role="dialog"], .modal-body');
            console.log('Found modals:', modals.length);
            
            // Look for data-label and data-item elements
            const dataLabels = document.querySelectorAll('.data-label');
            const dataItems = document.querySelectorAll('.data-item');
            console.log('Found .data-label elements:', dataLabels.length);
            console.log('Found .data-item elements:', dataItems.length);
            
            // Show what data-labels contain
            dataLabels.forEach((label, i) => {
                console.log(`data-label ${i}:`, label.textContent?.trim());
            });
            
            dataItems.forEach((item, i) => {
                console.log(`data-item ${i}:`, item.textContent?.trim());
            });
            
            return 'Reference test completed';
        });

        console.log('🎯 Reference ID extraction test completed');

        // Test clicking a load to open modal
        console.log('\n🖱️  Testing load click...');
        const clickResult = await page.evaluate(() => {
            const loadRows = document.querySelectorAll('[data-test="load-row"], .row-container');
            console.log('Found load rows:', loadRows.length);
            
            if (loadRows.length > 0) {
                const firstRow = loadRows[0];
                console.log('Clicking first row...');
                firstRow.click();
                return 'Clicked first row';
            }
            return 'No rows to click';
        });

        console.log('Click result:', clickResult);
        
        // Wait for modal to appear
        console.log('⏳ Waiting for modal...');
        await page.waitForTimeout(3000);
        
        const modalResult = await page.evaluate(() => {
            const modal = document.querySelector('.modal-content, .load-detail-modal, [role="dialog"], .modal-body');
            if (modal) {
                console.log('Modal found! Content preview:', modal.textContent?.substring(0, 200));
                
                // Look for reference ID in modal
                const dataLabels = modal.querySelectorAll('.data-label');
                console.log('Modal data-labels:', dataLabels.length);
                
                dataLabels.forEach((label, i) => {
                    console.log(`Modal data-label ${i}:`, label.textContent?.trim());
                    const nextSibling = label.nextElementSibling;
                    const prevSibling = label.previousElementSibling;
                    if (nextSibling) console.log(`  -> Next sibling:`, nextSibling.textContent?.trim());
                    if (prevSibling) console.log(`  -> Prev sibling:`, prevSibling.textContent?.trim());
                });
                
                return 'Modal analyzed';
            } else {
                console.log('No modal found after click');
                return 'No modal';
            }
        });

        console.log('Modal analysis:', modalResult);

    } catch (error) {
        console.error('❌ Debug error:', error);
    } finally {
        if (browser) {
            // Don't close the browser, just disconnect
            await browser.close();
        }
    }
}

debugSingleRun().catch(console.error);
