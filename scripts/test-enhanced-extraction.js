#!/usr/bin/env node

const { chromium } = require('playwright');

async function testEnhancedExtraction() {
    console.log('🧪 Testing enhanced load extraction...');
    
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        console.log(`📄 Current URL: ${page.url()}`);
        
        // Get the first load row
        const loadRows = await page.$$('.row-container');
        console.log(`📦 Found ${loadRows.length} load containers`);
        
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
        
        // Test enhanced extraction on first load
        console.log('\n🔍 Testing enhanced extraction on first load...');
        const firstRow = validRows[0];
        
        // Get basic info first
        console.log('📋 Step 1: Getting basic info from table row...');
        const basicInfo = await firstRow.evaluate((el) => {
            const originElement = el.querySelector('[data-test="load-origin-cell"]');
            const destElement = el.querySelector('[data-test="load-destination-cell"]');
            const companyElement = el.querySelector('[data-test="load-company-cell"]');
            const rateElement = el.querySelector('[data-test="load-rate-cell"]');
            
            return {
                origin: originElement ? originElement.textContent.trim() : 'N/A',
                destination: destElement ? destElement.textContent.trim() : 'N/A',
                company: companyElement ? companyElement.textContent.trim() : 'N/A',
                rate: rateElement ? rateElement.textContent.trim() : 'N/A'
            };
        });
        
        console.log(`   Origin: ${basicInfo.origin}`);
        console.log(`   Destination: ${basicInfo.destination}`);
        console.log(`   Company: ${basicInfo.company}`);
        console.log(`   Rate: ${basicInfo.rate}`);
        
        // Click to get detailed info
        console.log('\n🖱️  Step 2: Clicking to get detailed view...');
        await firstRow.click();
        await page.waitForTimeout(2000);
        
        // Test enhanced extraction
        console.log('🔍 Step 3: Extracting detailed information...');
        const detailedInfo = await page.evaluate(() => {
            const allText = document.body.textContent || document.body.innerText || '';
            
            // Test reference number extraction
            const findReferenceNumber = () => {
                const patterns = [
                    /Reference\s*ID\s*:?\s*([A-Z0-9]{4,})/i,
                    /Ref\s*ID\s*:?\s*([A-Z0-9]{4,})/i,
                    /Reference\s*:?\s*([A-Z0-9]{4,})/i,
                    /([0-9]{6,})/g,
                    /([A-Z]{2}[0-9]{4,})/g,
                    /([0-9]{2}[A-Z][0-9]{4})/g
                ];
                
                for (const pattern of patterns) {
                    const match = allText.match(pattern);
                    if (match && match[1] && match[1].length >= 4) {
                        return match[1];
                    }
                }
                return null;
            };
            
            // Test contact extraction
            const findAllContacts = () => {
                const contacts = [];
                
                const phonePatterns = [
                    /\(\d{3}\)\s*\d{3}[-\s]?\d{4}/g,
                    /\d{3}[-\.]\d{3}[-\.]\d{4}/g,
                    /\d{3}\s\d{3}\s\d{4}/g
                ];
                
                const emailPatterns = [
                    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
                ];
                
                // Extract phones
                phonePatterns.forEach(pattern => {
                    const matches = allText.match(pattern);
                    if (matches) {
                        matches.forEach(match => {
                            const clean = match.trim();
                            if (contacts.indexOf(clean) === -1 && clean.length >= 10) {
                                contacts.push(clean);
                            }
                        });
                    }
                });
                
                // Extract emails
                emailPatterns.forEach(pattern => {
                    const matches = allText.match(pattern);
                    if (matches) {
                        matches.forEach(match => {
                            const clean = match.trim().toLowerCase();
                            if (contacts.indexOf(clean) === -1 && clean.includes('@')) {
                                contacts.push(clean);
                            }
                        });
                    }
                });
                
                return contacts;
            };
            
            const referenceNumber = findReferenceNumber();
            const allContacts = findAllContacts();
            
            return {
                referenceNumber: referenceNumber,
                contactInfo: allContacts.join('; '),
                contactCount: allContacts.length,
                pageText: allText.substring(0, 500) + '...' // First 500 chars for debugging
            };
        });
        
        console.log('\n✅ ENHANCED EXTRACTION RESULTS:');
        console.log(`📋 Reference Number: ${detailedInfo.referenceNumber || 'NOT FOUND'}`);
        console.log(`📞 Contact Info: ${detailedInfo.contactInfo || 'NOT FOUND'}`);
        console.log(`📊 Contact Count: ${detailedInfo.contactCount}`);
        
        if (detailedInfo.referenceNumber && detailedInfo.referenceNumber !== 'N/A') {
            console.log('🎉 SUCCESS: Found real reference number!');
        } else {
            console.log('⚠️  No reference number found - will use AUTO_ ID');
        }
        
        if (detailedInfo.contactCount > 0) {
            console.log('🎉 SUCCESS: Found contact information!');
        } else {
            console.log('⚠️  No contact information found');
        }
        
        console.log('\n📄 Page content preview:');
        console.log(detailedInfo.pageText);
        
        await browser.close();
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testEnhancedExtraction();
