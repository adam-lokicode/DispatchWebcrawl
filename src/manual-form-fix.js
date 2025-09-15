const { chromium } = require('playwright');
const path = require('path');

async function fixForm() {
    console.log('🔧 Starting manual form fix...');
    
    // Connect to existing browser
    const sessionPath = path.join(__dirname, '..', 'session.json');
    const context = await chromium.launchPersistentContext(sessionPath, {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = context.pages()[0] || await context.newPage();
    
    try {
        // Take initial screenshot
        await page.screenshot({ path: './output/before-manual-fix.png', fullPage: true });
        console.log('📸 Initial screenshot taken');
        
        // Step 1: Click the San Francisco dropdown suggestion
        console.log('🎯 Step 1: Clicking San Francisco suggestion...');
        try {
            // Wait for the dropdown to be visible
            await page.waitForSelector('text="San Francisco, CA"', { timeout: 5000 });
            await page.click('text="San Francisco, CA"');
            console.log('✅ Clicked San Francisco suggestion');
            await page.waitForTimeout(1000);
        } catch (e) {
            console.log('⚠️ San Francisco suggestion not found, trying other methods...');
            // Try pressing Escape then Tab to close dropdown
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        }
        
        // Step 2: Select Equipment Type (Reefer)
        console.log('🚛 Step 2: Selecting Reefer equipment...');
        try {
            // Try clicking the equipment field
            const equipmentField = await page.waitForSelector('input[placeholder*="Equipment"], select[class*="equipment"], .equipment-select', { timeout: 3000 });
            if (equipmentField) {
                await equipmentField.click();
                await page.waitForTimeout(1000);
                
                // Look for Reefer option
                try {
                    await page.waitForSelector('text="Reefer"', { timeout: 3000 });
                    await page.click('text="Reefer"');
                    console.log('✅ Selected Reefer equipment');
                } catch (e) {
                    console.log('⚠️ Reefer option not found in dropdown');
                }
            }
        } catch (e) {
            console.log('⚠️ Equipment field not found');
        }
        
        await page.waitForTimeout(2000);
        
        // Step 3: Look for and click Search button
        console.log('🔍 Step 3: Looking for Search button...');
        const searchSelectors = [
            'button:has-text("SEARCH")',
            'button:has-text("Search")',
            'button[type="submit"]',
            'input[type="submit"]',
            '.search-button',
            'button.btn-primary'
        ];
        
        let searchFound = false;
        for (const selector of searchSelectors) {
            try {
                const button = await page.$(selector);
                if (button) {
                    const isVisible = await button.isVisible();
                    const isEnabled = await button.isEnabled();
                    console.log(`Found button ${selector}: visible=${isVisible}, enabled=${isEnabled}`);
                    
                    if (isVisible && isEnabled) {
                        await button.click();
                        console.log(`✅ Clicked search button: ${selector}`);
                        searchFound = true;
                        break;
                    } else if (isVisible) {
                        console.log(`Button found but disabled: ${selector}`);
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        if (!searchFound) {
            console.log('🔄 No enabled search button found, trying Enter key...');
            await page.keyboard.press('Enter');
            console.log('✅ Pressed Enter key');
        }
        
        // Wait for results
        console.log('⏳ Waiting for search results...');
        await page.waitForTimeout(5000);
        
        // Take final screenshot
        await page.screenshot({ path: './output/after-manual-fix.png', fullPage: true });
        console.log('📸 Final screenshot taken');
        
        // Check if we have results
        const hasResults = await page.$('table, .load-row, .result-row, [data-test*="load"]');
        if (hasResults) {
            console.log('🎉 Search results found!');
        } else {
            console.log('⚠️ No obvious search results detected');
        }
        
    } catch (error) {
        console.error('❌ Error during manual fix:', error);
        await page.screenshot({ path: './output/error-manual-fix.png', fullPage: true });
    }
    
    console.log('✅ Manual form fix completed');
    // Don't close browser - leave it open for inspection
}

fixForm().catch(console.error);
