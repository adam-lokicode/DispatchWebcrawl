#!/usr/bin/env node

const { chromium } = require('playwright');

async function goToLoads() {
    console.log('🔄 Navigating directly to DAT ONE load search...');
    
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        console.log(`📄 Current page: ${page.url()}`);
        
        // Go directly to loads search
        console.log('🎯 Going to DAT ONE load search...');
        await page.goto('https://www.dat.com/search/loads', { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        // Wait a moment for the page to load
        await page.waitForTimeout(3000);
        
        console.log(`✅ Now at: ${page.url()}`);
        console.log(`📝 Page title: ${await page.title()}`);
        
        // Check for load elements
        console.log('🔍 Checking for load data...');
        const loadRows = await page.$$('.row-container');
        console.log(`📦 Found ${loadRows.length} load containers`);
        
        if (loadRows.length > 0) {
            console.log('✅ SUCCESS! Load data is visible');
            
            // Test first load
            const firstLoad = await loadRows[0].evaluate((row) => {
                const originCell = row.querySelector('[data-test="load-origin-cell"]');
                const destCell = row.querySelector('[data-test="load-destination-cell"]');
                const companyCell = row.querySelector('[data-test="load-company-cell"]');
                
                return {
                    hasOrigin: !!originCell,
                    hasDestination: !!destCell,
                    hasCompany: !!companyCell,
                    origin: originCell ? originCell.textContent.trim() : 'N/A',
                    destination: destCell ? destCell.textContent.trim() : 'N/A',
                    company: companyCell ? companyCell.textContent.trim() : 'N/A'
                };
            });
            
            console.log('📋 Sample load data:');
            console.log(`   Origin: ${firstLoad.origin}`);
            console.log(`   Destination: ${firstLoad.destination}`);
            console.log(`   Company: ${firstLoad.company}`);
            console.log('🎉 Ready for scraping!');
        } else {
            console.log('⚠️  No load data visible yet - may need to wait or refresh');
        }
        
        await browser.close();
        
    } catch (error) {
        console.error('❌ Navigation failed:', error.message);
        console.log('🔧 Please manually navigate to https://www.dat.com/search/loads in your browser');
    }
}

goToLoads();
