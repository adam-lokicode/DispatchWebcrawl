const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');

async function test5Entries() {
    console.log('🧪 Testing scraper with 5 entries max...');
    
    let browser, page;
    try {
        // Connect to existing browser
        browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        const context = contexts[0];
        const pages = context.pages();
        page = pages[0];

        console.log('✅ Connected to browser');
        console.log('📍 Current URL:', await page.url());

        // Clear the CSV file
        const csvWriter = createCsvWriter({
            path: 'output/dat_one_loads_production.csv',
            header: [
                {id: 'reference_number', title: 'reference_number'},
                {id: 'origin', title: 'origin'},
                {id: 'destination', title: 'destination'},
                {id: 'rate_total_usd', title: 'rate_total_usd'},
                {id: 'rate_per_mile', title: 'rate_per_mile'},
                {id: 'company', title: 'company'},
                {id: 'contact', title: 'contact'},
                {id: 'age_posted', title: 'age_posted'},
                {id: 'extracted_at', title: 'extracted_at'}
            ]
        });
        await csvWriter.writeRecords([]); // Write header only

        console.log('🗑️ Cleared CSV file');

        // Extract data from current page
        const extractedData = await page.evaluate(() => {
            console.log('=== Starting 5-entry extraction ===');
            
            // Parse origin/destination from DAT One format
            const parseOriginDestination = (text) => {
                if (!text) return { origin: '', destination: '' };
                
                console.log('🔍 Parsing origin/destination:', text);
                
                // Handle cases like "Manteca, CAAurora, CO" or "Salinas, CADenver, CO"
                const cleanText = text.trim();
                
                // Look for pattern: City, StateCity, State
                const match = cleanText.match(/^(.+?,\s*[A-Z]{2})([A-Z][a-z]+.*?,\s*[A-Z]{2})$/);
                if (match) {
                    const result = {
                        origin: match[1].trim(),
                        destination: match[2].trim()
                    };
                    console.log('✅ Regex match:', result);
                    return result;
                }
                
                // Fallback: try to split on state abbreviation pattern
                const statePattern = /([A-Z]{2})([A-Z][a-z]+)/;
                const stateMatch = cleanText.match(statePattern);
                if (stateMatch) {
                    const splitPoint = cleanText.indexOf(stateMatch[0]);
                    if (splitPoint > 0) {
                        const origin = cleanText.substring(0, splitPoint + 2).trim();
                        const destination = cleanText.substring(splitPoint + 2).trim();
                        const result = { origin, destination };
                        console.log('✅ Fallback split:', result);
                        return result;
                    }
                }
                
                console.log('⚠️ Using fallback');
                return { origin: cleanText, destination: '' };
            };

            // Find load rows
            const loadRows = document.querySelectorAll('[data-test="load-row"], .row-container');
            console.log(`Found ${loadRows.length} load rows`);
            
            const results = [];
            const maxEntries = 5;
            
            for (let i = 0; i < Math.min(loadRows.length, maxEntries); i++) {
                const row = loadRows[i];
                console.log(`\n--- Processing row ${i + 1} ---`);
                
                try {
                    // Extract basic info
                    const ageElement = row.querySelector('[data-test="load-age-cell"]');
                    const rateElement = row.querySelector('[data-test="load-rate-cell"]');
                    const originElement = row.querySelector('[data-test="load-origin-cell"]');
                    const destinationElement = row.querySelector('[data-test="load-destination-cell"]');
                    const companyElement = row.querySelector('[data-test="load-company-cell"]');
                    
                    const age = ageElement ? ageElement.textContent.trim() : '';
                    const rateText = rateElement ? rateElement.textContent.trim() : '';
                    const originText = originElement ? originElement.textContent.trim() : '';
                    const destinationText = destinationElement ? destinationElement.textContent.trim() : '';
                    const company = companyElement ? companyElement.textContent.trim() : '';
                    
                    console.log('Raw data:', { age, rateText, originText, destinationText, company });
                    
                    // Parse origin/destination
                    const { origin, destination } = parseOriginDestination(originText);
                    
                    // Parse rate
                    let totalRate = '';
                    let ratePerMile = '';
                    if (rateText) {
                        const rateMatch = rateText.match(/\$?([\d,]+)/);
                        if (rateMatch) {
                            totalRate = rateMatch[1].replace(',', '');
                        }
                        const perMileMatch = rateText.match(/\$?([\d.]+)\/mi/);
                        if (perMileMatch) {
                            ratePerMile = perMileMatch[1];
                        }
                    }
                    
                    // Extract contact from company element
                    let contact = '';
                    if (companyElement) {
                        const contactSelectors = ['.contact-state', '.contact-info', '.phone', '.email'];
                        for (const selector of contactSelectors) {
                            const contactEl = companyElement.querySelector(selector);
                            if (contactEl) {
                                contact = contactEl.textContent.trim();
                                break;
                            }
                        }
                        
                        // Fallback: look for phone in company text
                        if (!contact) {
                            const phoneMatch = companyElement.textContent.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
                            if (phoneMatch) {
                                contact = phoneMatch[0];
                            }
                        }
                    }
                    
                    const entry = {
                        reference_number: `TEST_${i + 1}`,
                        origin,
                        destination,
                        rate_total_usd: totalRate,
                        rate_per_mile: ratePerMile,
                        company,
                        contact,
                        age_posted: age,
                        extracted_at: new Date().toISOString()
                    };
                    
                    console.log('Processed entry:', entry);
                    results.push(entry);
                    
                } catch (error) {
                    console.error(`Error processing row ${i + 1}:`, error);
                }
            }
            
            console.log(`\n=== Extracted ${results.length} entries ===`);
            return results;
        });

        console.log(`\n📊 Extracted ${extractedData.length} entries`);
        
        // Save to CSV
        if (extractedData.length > 0) {
            await csvWriter.writeRecords(extractedData);
            console.log('💾 Saved to CSV');
            
            // Display results
            console.log('\n📋 Results:');
            extractedData.forEach((entry, i) => {
                console.log(`\n${i + 1}. ${entry.company}`);
                console.log(`   📍 ${entry.origin} → ${entry.destination}`);
                console.log(`   💰 $${entry.rate_total_usd} (${entry.rate_per_mile}/mi)`);
                console.log(`   📞 ${entry.contact}`);
                console.log(`   ⏰ ${entry.age_posted}`);
                console.log(`   🆔 ${entry.reference_number}`);
            });
        } else {
            console.log('❌ No data extracted');
        }

    } catch (error) {
        console.error('❌ Test error:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

test5Entries().catch(console.error);
