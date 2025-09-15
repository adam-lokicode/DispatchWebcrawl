#!/usr/bin/env node

const { chromium } = require('playwright');

async function navigateToDATOne() {
    console.log('🎯 Navigating to DAT One load search...');
    
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        console.log(`📄 Current page: ${page.url()}`);
        
        // Navigate to the correct DAT One URL
        console.log('🔄 Going to: https://one.dat.com/search-loads-ow');
        await page.goto('https://one.dat.com/search-loads-ow', { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        // Wait for the page to fully load
        await page.waitForTimeout(5000);
        
        console.log(`✅ Now at: ${page.url()}`);
        console.log(`📝 Page title: ${await page.title()}`);
        
        // Check for load elements using various selectors
        console.log('\n🔍 Checking for load data...');
        
        const selectors = [
            '.row-container',
            '[data-test="load-origin-cell"]',
            '[data-test="load-destination-cell"]', 
            '[data-test="load-company-cell"]',
            '.load-row',
            '.freight-row',
            'tbody tr',
            '.grid-row',
            '[class*="load"]',
            '[class*="row"]'
        ];
        
        let foundLoads = false;
        
        for (const selector of selectors) {
            try {
                const elements = await page.$$(selector);
                console.log(`   ${selector}: ${elements.length} elements`);
                
                if (elements.length > 0) {
                    foundLoads = true;
                    
                    // Try to get sample data from first element
                    try {
                        const sampleText = await elements[0].textContent();
                        const trimmed = sampleText.trim();
                        if (trimmed.length > 0 && trimmed.length < 200) {
                            console.log(`     Sample: "${trimmed}"`);
                        }
                    } catch (e) {
                        // Ignore text extraction errors
                    }
                    
                    // If this looks like load data, test extraction
                    if (selector.includes('load') || elements.length > 5) {
                        console.log(`     ✅ This might be load data!`);
                    }
                }
            } catch (e) {
                console.log(`   ${selector}: Error`);
            }
        }
        
        if (foundLoads) {
            console.log('\n🎉 SUCCESS! Found potential load data');
            console.log('✅ Ready to start scraping!');
        } else {
            console.log('\n⚠️  No load elements found yet');
            console.log('📋 Page might still be loading or require interaction');
            
            // Check if there are any buttons or links to click
            const clickableElements = await page.$$('button, a, [role="button"]');
            console.log(`🔘 Found ${clickableElements.length} clickable elements`);
        }
        
        await browser.close();
        
    } catch (error) {
        console.error('❌ Navigation failed:', error.message);
    }
}

navigateToDATOne();
