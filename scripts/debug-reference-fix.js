#!/usr/bin/env node

// Quick debug script to test reference number generation
const { chromium } = require('playwright');

async function debugReferenceExtraction() {
    console.log('🔍 Debugging reference number extraction...');
    
    try {
        // Connect to existing browser
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        console.log(`📄 Current page: ${page.url()}`);
        
        // Test the reference generation logic
        function generateReferenceId(origin, destination, company, rate) {
            const normalizeValue = (value) => {
                if (!value || value === 'N/A' || value === 'undefined' || value === '') return '';
                return String(value).trim();
            };
            
            const loadDetails = `${normalizeValue(origin)}-${normalizeValue(destination)}-${normalizeValue(company)}-${normalizeValue(rate)}`;
            const referenceId = 'AUTO_' + Buffer.from(loadDetails).toString('base64').substring(0, 8).toUpperCase();
            
            console.log(`  📝 Load details: "${loadDetails}"`);
            console.log(`  🔑 Generated ID: ${referenceId}`);
            
            return referenceId;
        }
        
        // Test with sample data
        console.log('\n🧪 Testing reference generation:');
        console.log('Test 1:');
        generateReferenceId('Chico, CA', 'Aurora, CO', 'HUB Group Inc - Pittsburgh', '3140');
        
        console.log('\nTest 2:');
        generateReferenceId('Arvin, CA', 'Denver, CO', 'Lily Transportation Corp', '');
        
        console.log('\nTest 3:');
        generateReferenceId('Salinas, CA', 'N Platte, NE', 'RWB Trucking LLC', '4150');
        
        // Check if we can extract a load row and see what data we get
        console.log('\n🔍 Checking actual page data:');
        const loadRows = await page.$$('.row-container');
        console.log(`Found ${loadRows.length} load rows`);
        
        if (loadRows.length > 0) {
            console.log('\n📦 Examining first load row:');
            const firstRow = loadRows[0];
            
            const basicInfo = await firstRow.evaluate((row) => {
                const originCell = row.querySelector('[data-test="load-origin-cell"]');
                const destCell = row.querySelector('[data-test="load-destination-cell"]');
                const companyCell = row.querySelector('[data-test="load-company-cell"]');
                const rateCell = row.querySelector('[data-test="load-rate-cell"]');
                
                return {
                    origin: originCell ? originCell.textContent.trim() : null,
                    destination: destCell ? destCell.textContent.trim() : null,
                    company: companyCell ? companyCell.textContent.trim() : null,
                    rate: rateCell ? rateCell.textContent.trim() : null
                };
            });
            
            console.log('  📍 Origin:', basicInfo.origin);
            console.log('  📍 Destination:', basicInfo.destination);
            console.log('  🏢 Company:', basicInfo.company);
            console.log('  💰 Rate:', basicInfo.rate);
            
            if (basicInfo.origin && basicInfo.destination && basicInfo.company) {
                console.log('\n✅ Generating reference for real data:');
                generateReferenceId(basicInfo.origin, basicInfo.destination, basicInfo.company, basicInfo.rate);
            }
        }
        
        await browser.close();
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    }
}

debugReferenceExtraction();
