#!/usr/bin/env node

// Debug script specifically for reference number extraction
const { chromium } = require('playwright');

async function debugReferenceExtraction() {
    console.log('🔍 Testing reference number extraction...');
    
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        const context = contexts[0];
        const page = context.pages()[0];
        
        console.log(`📄 Current URL: ${page.url()}`);
        
        // Get the first few load rows
        const loadRows = await page.$$('.row-container');
        console.log(`📋 Found ${loadRows.length} load rows`);
        
        for (let i = 0; i < Math.min(3, loadRows.length); i++) {
            console.log(`\n🎯 Testing load ${i + 1}:`);
            
            const row = loadRows[i];
            
            // Get basic info first
            const basicInfo = await row.evaluate(el => {
                const originElement = el.querySelector('[data-test="load-origin-cell"]');
                const destinationElement = el.querySelector('[data-test="load-destination-cell"]');
                return {
                    origin: originElement?.textContent.trim() || 'N/A',
                    destination: destinationElement?.textContent.trim() || 'N/A'
                };
            });
            
            console.log(`📍 Route: ${basicInfo.origin} → ${basicInfo.destination}`);
            
            // Click the row
            await row.click();
            await page.waitForTimeout(2000);
            
            // Try to find reference number with multiple approaches
            console.log('🔍 Searching for reference number...');
            
            // Approach 1: Search all text
            const allText = await page.textContent('body');
            console.log('📄 Page contains reference patterns:');
            
            const patterns = [
                /Reference\s*ID\s*([0-9]{2}[A-Z][0-9]{4})/gi,
                /Ref\s*ID\s*([0-9]{2}[A-Z][0-9]{4})/gi,
                /ID\s*([0-9]{2}[A-Z][0-9]{4})/gi,
                /([0-9]{2}[A-Z][0-9]{4})/g
            ];
            
            let found = false;
            for (const pattern of patterns) {
                const matches = allText.match(pattern);
                if (matches) {
                    console.log(`   ✅ Pattern ${pattern} found: ${matches.slice(0, 3).join(', ')}`);
                    found = true;
                } else {
                    console.log(`   ❌ Pattern ${pattern} not found`);
                }
            }
            
            if (!found) {
                // Look for any numbers that might be reference IDs
                const numberMatches = allText.match(/\b\d{2,}[A-Z]\d{2,}\b/g);
                if (numberMatches) {
                    console.log(`   🔢 Found number-letter patterns: ${numberMatches.slice(0, 5).join(', ')}`);
                } else {
                    console.log('   ❌ No reference-like patterns found');
                }
                
                // Show a sample of the modal content
                const modalText = allText.substring(0, 500);
                console.log(`   📋 Modal sample: ${modalText.replace(/\s+/g, ' ')}...`);
            }
            
            // Close modal
            await page.keyboard.press('Escape');
            await page.waitForTimeout(1000);
        }
        
        browser.close();
        console.log('\n✅ Reference debugging completed');
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    }
}

if (require.main === module) {
    debugReferenceExtraction();
}

module.exports = { debugReferenceExtraction };
