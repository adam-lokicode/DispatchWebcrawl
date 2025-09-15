#!/usr/bin/env node

const { chromium } = require('playwright');

async function testSingleExtraction() {
    console.log('🧪 Testing single load extraction...');
    
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        console.log(`📄 Current URL: ${page.url()}`);
        
        // Get load rows
        const loadRows = await page.$$('.row-container');
        console.log(`📦 Found ${loadRows.length} total load containers`);
        
        // Filter to valid load rows
        const validRows = [];
        for (const row of loadRows) {
            const hasLoadData = await row.$('[data-test="load-origin-cell"]');
            if (hasLoadData) {
                validRows.push(row);
            }
        }
        
        console.log(`✅ Valid load rows: ${validRows.length}`);
        
        if (validRows.length === 0) {
            console.log('❌ No valid load rows found!');
            await browser.close();
            return;
        }
        
        // Test extracting data from first row
        console.log('\n🔍 Testing extraction from first load row...');
        const firstRow = validRows[0];
        
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
        
        console.log('📋 Basic extraction results:');
        console.log(`   Origin: ${basicInfo.origin}`);
        console.log(`   Destination: ${basicInfo.destination}`);
        console.log(`   Company: ${basicInfo.company}`);
        console.log(`   Rate: ${basicInfo.rate}`);
        
        if (basicInfo.origin && basicInfo.destination && basicInfo.company) {
            console.log('\n✅ Basic extraction successful!');
            
            // Test reference number generation
            const generateReferenceId = (origin, destination, company, rate) => {
                const normalizeValue = (value) => {
                    if (!value || value === 'N/A' || value === 'undefined' || value === '') return '';
                    return String(value).trim();
                };
                
                const loadDetails = `${normalizeValue(origin)}-${normalizeValue(destination)}-${normalizeValue(company)}-${normalizeValue(rate)}`;
                const referenceId = 'AUTO_' + Buffer.from(loadDetails).toString('base64').substring(0, 8).toUpperCase();
                
                return referenceId;
            };
            
            const refId = generateReferenceId(basicInfo.origin, basicInfo.destination, basicInfo.company, basicInfo.rate);
            console.log(`🔑 Generated reference ID: ${refId}`);
            
            // Test contact extraction
            console.log('\n📞 Testing contact extraction...');
            const contactInfo = await firstRow.evaluate((row) => {
                const companyCell = row.querySelector('[data-test="load-company-cell"]');
                if (!companyCell) return null;
                
                const contactElement = companyCell.querySelector('.contact-state');
                if (contactElement) {
                    const contactText = contactElement.textContent.trim();
                    if (contactText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)) {
                        return contactText;
                    } else if (contactText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
                        return contactText;
                    } else if (contactText && contactText.length > 0 && contactText !== 'N/A') {
                        return contactText;
                    }
                }
                return null;
            });
            
            console.log(`📞 Contact: ${contactInfo || 'Not found'}`);
            
            console.log('\n🎉 EXTRACTION TEST COMPLETE');
            console.log('   ✅ Load data found');
            console.log('   ✅ Reference ID generated');
            console.log('   ✅ Contact extraction tested');
            
        } else {
            console.log('\n❌ Basic extraction failed - missing required fields');
        }
        
        await browser.close();
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testSingleExtraction();
