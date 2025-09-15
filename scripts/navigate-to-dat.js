#!/usr/bin/env node

const { chromium } = require('playwright');

async function navigateToDAT() {
    console.log('🔄 Navigating to DAT ONE...');
    
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        console.log(`📄 Current page: ${page.url()}`);
        
        // Navigate to DAT ONE login page
        console.log('🌐 Going to DAT ONE...');
        await page.goto('https://www.dat.com/login', { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        await page.waitForTimeout(2000);
        
        console.log(`✅ Navigated to: ${page.url()}`);
        console.log('📝 Page title:', await page.title());
        
        // Check if already logged in
        const isLoggedIn = await page.url().includes('dashboard') || 
                          await page.url().includes('loadboard') || 
                          await page.url().includes('search');
        
        if (isLoggedIn) {
            console.log('✅ Already logged in! Navigating to load search...');
            await page.goto('https://www.dat.com/search/loads', { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            console.log(`🔍 Now at: ${page.url()}`);
        } else {
            console.log('🔐 Please log in manually in the browser, then navigate to load search');
            console.log('📍 Target URL: https://www.dat.com/search/loads');
        }
        
        await browser.close();
        
    } catch (error) {
        console.error('❌ Navigation failed:', error.message);
        console.log('🔧 Please manually navigate to https://www.dat.com/search/loads in your browser');
    }
}

navigateToDAT();
