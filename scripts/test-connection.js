#!/usr/bin/env node

// Simple test script to verify browser connection and login status
const { chromium } = require('playwright');

async function testConnection() {
    console.log('🧪 Testing browser connection and login status...');
    
    try {
        // Connect to the running Chrome instance
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        
        if (contexts.length === 0) {
            console.log('❌ No browser contexts found');
            return;
        }
        
        const context = contexts[0];
        const pages = context.pages();
        
        if (pages.length === 0) {
            console.log('❌ No pages found');
            return;
        }
        
        const page = pages[0];
        const url = page.url();
        
        console.log(`📄 Current URL: ${url}`);
        
        // Check if we're logged in by looking for common elements
        console.log('🔍 Checking login status...');
        
        try {
            // Look for load results (indicates successful login)
            const loadElements = await page.$$('[data-test="load-origin-cell"]');
            if (loadElements.length > 0) {
                console.log(`✅ SUCCESS! Found ${loadElements.length} load elements`);
                console.log('🎉 You are logged in and ready to scrape!');
                
                // Show a sample of what we can extract
                const sampleLoad = await loadElements[0].evaluate(el => ({
                    origin: el.textContent?.trim() || 'N/A'
                }));
                console.log(`📍 Sample load origin: ${sampleLoad.origin}`);
                
            } else {
                console.log('⚠️  No load elements found. You may need to:');
                console.log('   1. Complete login process');
                console.log('   2. Navigate to search loads page');
                console.log('   3. Make sure loads are visible');
            }
            
        } catch (error) {
            console.log('⚠️  Could not find load elements. Current page may not be the load search page.');
            console.log(`   Error: ${error.message}`);
        }
        
        // Check page title for more context
        const title = await page.title();
        console.log(`📝 Page title: ${title}`);
        
        // Look for other indicators
        const isLoginPage = url.includes('login') || title.toLowerCase().includes('login');
        const isDATPage = url.includes('dat.com') || url.includes('one.dat.com');
        
        if (isLoginPage) {
            console.log('🔐 Still on login page - please complete login first');
        } else if (isDATPage) {
            console.log('✅ On DAT ONE site - login appears successful');
        } else {
            console.log('❓ Unknown page - may need to navigate to DAT ONE');
        }
        
        browser.close();
        
    } catch (error) {
        console.error('❌ Connection test failed:', error.message);
        console.log('\n💡 Make sure Chrome is running with: ./scripts/start-chrome-debug.sh');
    }
}

if (require.main === module) {
    testConnection();
}

module.exports = { testConnection };
