#!/usr/bin/env node

const { chromium } = require('playwright');

async function testDATOneLoads() {
    console.log('🔍 Testing DAT One load data extraction...');
    
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        console.log(`📄 Current URL: ${page.url()}`);
        console.log(`📝 Page title: ${await page.title()}`);
        
        // Test for various load selectors that might work on DAT One
        console.log('\n🔍 Checking for load elements...');
        
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
            '[class*="row"]',
            '.search-result',
            '.result-row',
            'table tr',
            '.list-item'
        ];
        
        let bestSelector = null;
        let maxElements = 0;
        
        for (const selector of selectors) {
            try {
                const elements = await page.$$(selector);
                console.log(`   ${selector}: ${elements.length} elements`);
                
                if (elements.length > maxElements && elements.length > 0) {
                    maxElements = elements.length;
                    bestSelector = selector;
                }
                
                // If we find some elements, test what's inside them
                if (elements.length > 0 && elements.length < 50) {
                    try {
                        const firstElement = elements[0];
                        const text = await firstElement.textContent();
                        const trimmed = text.trim();
                        
                        if (trimmed.length > 10 && trimmed.length < 300) {
                            console.log(`     Sample text: "${trimmed.substring(0, 100)}..."`);
                        }
                        
                        // Check if this element has load-related sub-elements
                        const hasOrigin = await firstElement.$('[class*="origin"], [data-test*="origin"]');
                        const hasDestination = await firstElement.$('[class*="destination"], [data-test*="destination"]');
                        const hasCompany = await firstElement.$('[class*="company"], [data-test*="company"]');
                        
                        if (hasOrigin || hasDestination || hasCompany) {
                            console.log(`     ✅ Contains load data elements!`);
                        }
                        
                    } catch (e) {
                        // Ignore extraction errors
                    }
                }
            } catch (e) {
                console.log(`   ${selector}: Error - ${e.message}`);
            }
        }
        
        if (bestSelector && maxElements > 0) {
            console.log(`\n🎯 Best selector appears to be: ${bestSelector} (${maxElements} elements)`);
            
            // Try to extract actual load data using the best selector
            console.log('\n📋 Testing data extraction...');
            try {
                const elements = await page.$$(bestSelector);
                
                for (let i = 0; i < Math.min(3, elements.length); i++) {
                    console.log(`\nLoad ${i + 1}:`);
                    
                    const loadData = await elements[i].evaluate((element) => {
                        // Try to find origin, destination, company, rate
                        const getText = (selectors) => {
                            for (const sel of selectors) {
                                const el = element.querySelector(sel);
                                if (el && el.textContent.trim()) {
                                    return el.textContent.trim();
                                }
                            }
                            return null;
                        };
                        
                        const originSelectors = [
                            '[data-test*="origin"]', 
                            '[class*="origin"]',
                            '.origin',
                            'td:first-child',
                            '.city:first-of-type'
                        ];
                        
                        const destSelectors = [
                            '[data-test*="destination"]', 
                            '[class*="destination"]',
                            '.destination',
                            'td:nth-child(2)',
                            '.city:last-of-type'
                        ];
                        
                        const companySelectors = [
                            '[data-test*="company"]', 
                            '[class*="company"]',
                            '.company',
                            'td:nth-child(3)'
                        ];
                        
                        const rateSelectors = [
                            '[data-test*="rate"]', 
                            '[class*="rate"]',
                            '.rate',
                            'td:nth-child(4)',
                            '[class*="price"]'
                        ];
                        
                        return {
                            origin: getText(originSelectors),
                            destination: getText(destSelectors),
                            company: getText(companySelectors),
                            rate: getText(rateSelectors),
                            fullText: element.textContent.trim().substring(0, 200)
                        };
                    });
                    
                    console.log(`   Origin: ${loadData.origin || 'Not found'}`);
                    console.log(`   Destination: ${loadData.destination || 'Not found'}`);
                    console.log(`   Company: ${loadData.company || 'Not found'}`);
                    console.log(`   Rate: ${loadData.rate || 'Not found'}`);
                    
                    if (!loadData.origin && !loadData.destination && !loadData.company) {
                        console.log(`   Full text: "${loadData.fullText}"`);
                    }
                }
                
            } catch (e) {
                console.log(`   Extraction failed: ${e.message}`);
            }
        } else {
            console.log('\n❌ No suitable load elements found');
            
            // Check page content for debugging
            console.log('\n🔍 Checking page content...');
            const bodyText = await page.textContent('body');
            const keywords = ['origin', 'destination', 'company', 'rate', 'freight', 'load'];
            
            keywords.forEach(keyword => {
                const count = (bodyText.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
                console.log(`   "${keyword}": ${count} occurrences`);
            });
        }
        
        await browser.close();
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testDATOneLoads();
