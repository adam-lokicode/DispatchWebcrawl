const { chromium } = require('playwright');

async function debugPhoneDetails() {
    console.log('🔗 Connecting to existing Chrome browser to debug phone details...');
    
    try {
        // Connect to existing browser
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        
        if (contexts.length === 0) {
            throw new Error('No browser contexts found');
        }
        
        const context = contexts[0];
        const pages = context.pages();
        
        if (pages.length === 0) {
            throw new Error('No pages found');
        }
        
        // Use the first page or find the DAT One page
        let page = pages[0];
        for (const p of pages) {
            const url = p.url();
            if (url.includes('dat.com') || url.includes('one.dat.com')) {
                page = p;
                break;
            }
        }
        
        console.log(`📄 Using page: ${page.url()}`);
        
        // Wait for load results to appear
        console.log('⏳ Waiting for load results...');
        await page.waitForSelector('[data-test="load-origin-cell"]', { timeout: 30000 });
        
        // Get all load rows
        const loadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
        console.log(`📋 Found ${loadRows.length} load rows`);
        
        if (loadRows.length === 0) {
            throw new Error('No load rows found');
        }
        
        // Debug first load only
        const row = loadRows[0];
        
        console.log('\n🔍 DEBUGGING FIRST LOAD...');
        
        // Extract basic info BEFORE clicking
        const basicInfo = await row.evaluate(el => {
            const originElement = el.querySelector('[data-test="load-origin-cell"]');
            const destinationElement = el.querySelector('[data-test="load-destination-cell"]');
            const companyElement = el.querySelector('.company.truncate');
            const ageElement = el.querySelector('[data-test="load-age-cell"]');
            const rateElement = el.querySelector('[data-test="load-rate-cell"]');
            
            return {
                origin: originElement ? originElement.textContent.trim() : 'N/A',
                destination: destinationElement ? destinationElement.textContent.trim() : 'N/A',
                company: companyElement ? companyElement.textContent.trim() : 'N/A',
                age: ageElement ? ageElement.textContent.trim() : 'N/A',
                rate: rateElement ? rateElement.textContent.trim() : 'N/A'
            };
        });
        
        console.log('📦 BASIC INFO BEFORE CLICKING:');
        console.log(`   Origin: ${basicInfo.origin}`);
        console.log(`   Destination: ${basicInfo.destination}`);
        console.log(`   Company: ${basicInfo.company}`);
        console.log(`   Age: ${basicInfo.age}`);
        console.log(`   Rate: ${basicInfo.rate}`);
        
        // Check for phone numbers BEFORE clicking
        console.log('\n📱 PHONE NUMBERS BEFORE CLICKING:');
        const phonesBefore = await page.evaluate(() => {
            const telLinks = document.querySelectorAll('a[href^="tel:"]');
            const phones = [];
            telLinks.forEach(link => {
                phones.push({
                    text: link.textContent.trim(),
                    href: link.getAttribute('href'),
                    visible: link.offsetParent !== null,
                    parentClass: link.parentElement?.className || 'N/A'
                });
            });
            return phones;
        });
        
        console.log(`Found ${phonesBefore.length} phone links before clicking:`);
        phonesBefore.forEach((phone, idx) => {
            console.log(`   ${idx + 1}. ${phone.text} (${phone.href}) - Visible: ${phone.visible} - Parent: ${phone.parentClass}`);
        });
        
        // Highlight the row we're about to click
        await row.evaluate(el => {
            el.style.backgroundColor = 'yellow';
            el.style.border = '3px solid red';
        });
        
        console.log('\n🖱️ CLICKING ON ROW...');
        await row.click();
        
        // Wait for details to load
        await page.waitForTimeout(3000);
        
        // Check what changed after clicking
        console.log('\n📱 PHONE NUMBERS AFTER CLICKING:');
        const phonesAfter = await page.evaluate(() => {
            const telLinks = document.querySelectorAll('a[href^="tel:"]');
            const phones = [];
            telLinks.forEach(link => {
                phones.push({
                    text: link.textContent.trim(),
                    href: link.getAttribute('href'),
                    visible: link.offsetParent !== null,
                    parentClass: link.parentElement?.className || 'N/A'
                });
            });
            return phones;
        });
        
        console.log(`Found ${phonesAfter.length} phone links after clicking:`);
        phonesAfter.forEach((phone, idx) => {
            console.log(`   ${idx + 1}. ${phone.text} (${phone.href}) - Visible: ${phone.visible} - Parent: ${phone.parentClass}`);
        });
        
        // Look for expanded detail content
        console.log('\n📋 EXPANDED DETAIL CONTENT:');
        const expandedContent = await page.evaluate(() => {
            const expandedElements = document.querySelectorAll('.expanded-detail-row, .table-row-detail, [class*="expanded"], [class*="detail"]');
            const content = [];
            
            expandedElements.forEach(el => {
                if (el.offsetParent !== null) { // Only visible elements
                    const text = el.textContent.trim();
                    if (text.length > 0) {
                        content.push({
                            className: el.className,
                            text: text.substring(0, 300) + (text.length > 300 ? '...' : ''),
                            hasPhone: /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text)
                        });
                    }
                }
            });
            
            return content;
        });
        
        console.log(`Found ${expandedContent.length} expanded detail elements:`);
        expandedContent.forEach((content, idx) => {
            console.log(`   ${idx + 1}. Class: ${content.className}`);
            console.log(`      Has Phone: ${content.hasPhone}`);
            console.log(`      Text: ${content.text}`);
            console.log('');
        });
        
        // Look for company information in expanded content
        console.log('\n🏢 COMPANY INFORMATION IN EXPANDED CONTENT:');
        const companyInfo = await page.evaluate(() => {
            const companyElements = document.querySelectorAll('.company, [class*="company"], .company-details, [class*="company-details"]');
            const companies = [];
            
            companyElements.forEach(el => {
                if (el.offsetParent !== null) { // Only visible elements
                    companies.push({
                        className: el.className,
                        text: el.textContent.trim()
                    });
                }
            });
            
            return companies;
        });
        
        console.log(`Found ${companyInfo.length} company elements:`);
        companyInfo.forEach((company, idx) => {
            console.log(`   ${idx + 1}. Class: ${company.className}`);
            console.log(`      Text: ${company.text}`);
        });
        
        // Look for contact information sections
        console.log('\n📞 CONTACT INFORMATION SECTIONS:');
        const contactSections = await page.evaluate(() => {
            const contactElements = document.querySelectorAll('.contact, [class*="contact"], .phone, [class*="phone"]');
            const contacts = [];
            
            contactElements.forEach(el => {
                if (el.offsetParent !== null) { // Only visible elements
                    contacts.push({
                        className: el.className,
                        text: el.textContent.trim(),
                        hasPhone: /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(el.textContent)
                    });
                }
            });
            
            return contacts;
        });
        
        console.log(`Found ${contactSections.length} contact elements:`);
        contactSections.forEach((contact, idx) => {
            console.log(`   ${idx + 1}. Class: ${contact.className}`);
            console.log(`      Has Phone: ${contact.hasPhone}`);
            console.log(`      Text: ${contact.text}`);
        });
        
        // Remove highlighting
        await row.evaluate(el => {
            el.style.backgroundColor = '';
            el.style.border = '';
        });
        
        // Close the modal
        console.log('\n🚪 CLOSING MODAL...');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        
        console.log('\n✅ Phone details debug completed!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the debug
debugPhoneDetails(); 