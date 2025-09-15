#!/usr/bin/env node

// Debug version of the production scraper to see what's happening
const { chromium } = require('playwright');
const fs = require('fs');

async function debugScraping() {
    console.log('🔍 Starting debug scraping session...');
    
    try {
        // Connect to existing browser
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        const context = contexts[0];
        const page = context.pages()[0];
        
        console.log(`📄 Current URL: ${page.url()}`);
        
        // Check current page state
        console.log('🔍 Analyzing page structure...');
        
        // Look for load rows with different selectors
        const selectors = [
            '.row-container.ng-tns-c510-8.ng-star-inserted',
            '.row-container',
            '[data-test="load-origin-cell"]',
            'tr[role="row"]',
            '.load-row',
            '[class*="row"]'
        ];
        
        for (const selector of selectors) {
            const elements = await page.$$(selector);
            console.log(`📊 Found ${elements.length} elements with selector: ${selector}`);
            
            if (elements.length > 0) {
                // Try to extract some sample data
                try {
                    const sampleData = await elements[0].evaluate(el => ({
                        innerHTML: el.innerHTML.substring(0, 200) + '...',
                        textContent: el.textContent?.substring(0, 100) + '...',
                        className: el.className,
                        dataset: Object.keys(el.dataset)
                    }));
                    
                    console.log('📋 Sample element data:');
                    console.log(`   Class: ${sampleData.className}`);
                    console.log(`   Text: ${sampleData.textContent}`);
                    console.log(`   Data attributes: ${sampleData.dataset.join(', ')}`);
                    
                } catch (error) {
                    console.log(`⚠️ Error extracting from ${selector}: ${error.message}`);
                }
                break;
            }
        }
        
        // Check for specific DAT ONE load elements
        console.log('\n🎯 Looking for DAT ONE specific elements...');
        
        const datElements = [
            '[data-test="load-origin-cell"]',
            '[data-test="load-destination-cell"]', 
            '[data-test="load-rate-cell"]',
            '[data-test="load-age-cell"]',
            '.cell-company',
            '.company-prefer-or-blocked',
            '.contact-state'
        ];
        
        for (const selector of datElements) {
            const elements = await page.$$(selector);
            console.log(`🔧 ${selector}: ${elements.length} found`);
        }
        
        // Try to extract one complete load record
        console.log('\n🎯 Attempting to extract first load...');
        
        const loadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
        if (loadRows.length > 0) {
            try {
                const firstRow = loadRows[0];
                
                // Hover and click to see what happens
                console.log('🖱️ Hovering over first load...');
                await firstRow.hover();
                await page.waitForTimeout(1000);
                
                console.log('👆 Clicking first load...');
                await firstRow.click();
                await page.waitForTimeout(2000);
                
                console.log('📄 Page title after click:', await page.title());
                
                // Try to find reference number
                const bodyText = await page.textContent('body');
                const refMatch = bodyText.match(/Reference\s*ID\s*([0-9]{2}[A-Z][0-9]{4})/i);
                console.log('🔢 Reference match:', refMatch ? refMatch[1] : 'Not found');
                
                // Close modal
                await page.keyboard.press('Escape');
                await page.waitForTimeout(1000);
                
            } catch (error) {
                console.log(`❌ Error during load extraction: ${error.message}`);
            }
        }
        
        // Check page performance
        console.log('\n⚡ Performance check...');
        const performanceMetrics = await page.evaluate(() => ({
            loadComplete: document.readyState,
            timing: performance.now()
        }));
        
        console.log(`📊 Page state: ${performanceMetrics.loadComplete}`);
        console.log(`⏱️ Performance: ${performanceMetrics.timing.toFixed(2)}ms`);
        
        browser.close();
        console.log('\n✅ Debug session completed');
        
    } catch (error) {
        console.error('❌ Debug session failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

if (require.main === module) {
    debugScraping();
}

module.exports = { debugScraping };
