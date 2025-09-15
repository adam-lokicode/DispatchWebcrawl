#!/usr/bin/env node

const { chromium } = require('playwright');

async function getCurrentPage() {
    console.log('🔍 Getting current page details...');
    
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        const url = page.url();
        const title = await page.title();
        
        console.log(`📄 Current URL: ${url}`);
        console.log(`📝 Page title: "${title}"`);
        
        // Check for various load-related selectors
        console.log('\n🔍 Checking for load elements...');
        
        const selectors = [
            '.row-container',
            '[data-test="load-origin-cell"]',
            '[data-test="load-destination-cell"]',
            '[data-test="load-company-cell"]',
            '.load-row',
            '.freight-row',
            '.search-results',
            'tbody tr',
            '.grid-row',
            '.load-item'
        ];
        
        for (const selector of selectors) {
            try {
                const elements = await page.$$(selector);
                console.log(`   ${selector}: ${elements.length} elements`);
                
                if (elements.length > 0 && elements.length < 10) {
                    // Get sample content for small numbers of elements
                    try {
                        const sampleText = await elements[0].textContent();
                        console.log(`     Sample: "${sampleText.trim().substring(0, 100)}..."`);
                    } catch (e) {
                        // Ignore text extraction errors
                    }
                }
            } catch (e) {
                console.log(`   ${selector}: Error - ${e.message}`);
            }
        }
        
        // Check page content for load-related keywords
        console.log('\n📋 Checking page content...');
        try {
            const bodyText = await page.textContent('body');
            const keywords = ['origin', 'destination', 'company', 'rate', 'freight', 'load', 'truck'];
            
            keywords.forEach(keyword => {
                const count = (bodyText.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
                if (count > 0) {
                    console.log(`   "${keyword}": ${count} occurrences`);
                }
            });
        } catch (e) {
            console.log('   Could not read body text');
        }
        
        // Look for any data tables or grids
        console.log('\n📊 Looking for data structures...');
        const tableElements = await page.$$('table, .table, .grid, .list, [role="grid"], [role="table"]');
        console.log(`   Found ${tableElements.length} table-like elements`);
        
        await browser.close();
        
    } catch (error) {
        console.error('❌ Failed to get page info:', error.message);
    }
}

getCurrentPage();
