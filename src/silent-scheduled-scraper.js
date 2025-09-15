const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
require('dotenv').config();

// Completely avoid logging contact info to prevent app triggers
// Configuration - easily customizable
const CONFIG = {
    intervalMinutes: 5,    // Run every 5 minutes
    maxEntries: 50,        // Extract up to 50 entries per run (with pagination)
    outputFile: 'dat_one_loads_latest.csv',
    statsFile: 'scraper_stats.json',
    runImmediately: true,  // Run once immediately on start
    enablePagination: true // Enable scrolling/pagination to load more results
};

// Helper functions (no contact logging)
function getRandomDelay(min = 500, max = 2000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanLikeMouseMove(page) {
    const viewport = await page.viewportSize();
    if (!viewport) {
        await page.mouse.move(400, 300, { 
            steps: Math.floor(Math.random() * 10) + 5 
        });
        return;
    }
    
    const x = Math.floor(Math.random() * viewport.width);
    const y = Math.floor(Math.random() * viewport.height);
    
    await page.mouse.move(x, y, { 
        steps: Math.floor(Math.random() * 10) + 5
    });
}

async function occasionalScroll(page) {
    if (Math.random() < 0.3) {
        const scrollDistance = Math.floor(Math.random() * 300) + 100;
        const direction = Math.random() < 0.5 ? 1 : -1;
        
        await page.mouse.wheel(0, scrollDistance * direction);
        await page.waitForTimeout(getRandomDelay(200, 800));
    }
}

function normalizeValue(value) {
    if (!value || value === '–' || value === '-' || value === '' || value.trim() === '' || value === 'N/A') {
        return null;
    }
    return value.trim();
}

function parseRate(rateText) {
    if (!rateText || rateText === '–' || rateText === '-') {
        return { totalRate: null, ratePerMile: null };
    }
    
    const combinedRatePattern = /\$?([\d,]+)\$?([\d.]+)\*?\/mi/;
    const combinedMatch = rateText.match(combinedRatePattern);
    
    if (combinedMatch) {
        return {
            totalRate: `$${combinedMatch[1]}`,
            ratePerMile: `$${combinedMatch[2]}/mi`
        };
    }
    
    const totalRatePattern = /\$?([\d,]+)$/;
    const totalMatch = rateText.match(totalRatePattern);
    
    if (totalMatch) {
        return {
            totalRate: `$${totalMatch[1]}`,
            ratePerMile: null
        };
    }
    
    const perMilePattern = /\$?([\d.]+)\*?\/mi/;
    const perMileMatch = rateText.match(perMilePattern);
    
    if (perMileMatch) {
        return {
            totalRate: null,
            ratePerMile: `$${perMileMatch[1]}/mi`
        };
    }
    
    return {
        totalRate: rateText,
        ratePerMile: null
    };
}

function parseOriginDestination(originText, destinationText) {
    if (!originText) return { origin: null, destination: destinationText };
    if (!destinationText) return { origin: originText, destination: null };
    
    const concatenatedPattern = /^(.+?),\s*([A-Z]{2})([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})$/;
    const match = originText.match(concatenatedPattern);
    
    if (match) {
        const [, city1, state1, city2, state2] = match;
        return {
            origin: `${city1}, ${state1}`,
            destination: `${city2}, ${state2}`
        };
    }
    
    const simplePattern = /^(.+?),\s*([A-Z]{2})(.+?),\s*([A-Z]{2})$/;
    const simpleMatch = originText.match(simplePattern);
    
    if (simpleMatch && destinationText && destinationText.includes(',')) {
        const [, city1, state1, city2, state2] = simpleMatch;
        return {
            origin: `${city1}, ${state1}`,
            destination: `${city2}, ${state2}`
        };
    }
    
    return {
        origin: normalizeValue(originText),
        destination: normalizeValue(destinationText)
    };
}

// Stats tracking functions
function loadStats() {
    const statsPath = path.join('./output', CONFIG.statsFile);
    if (fs.existsSync(statsPath)) {
        try {
            const statsData = fs.readFileSync(statsPath, 'utf8');
            return JSON.parse(statsData);
        } catch (error) {
            console.log(`⚠️ Error loading stats: ${error.message}`);
        }
    }
    
    return {
        totalRuns: 0,
        totalEntriesCrawled: 0,
        totalNewEntriesAdded: 0,
        totalDuplicatesSkipped: 0,
        firstRun: null,
        lastRun: null,
        averageEntriesPerRun: 0,
        averageNewEntriesPerRun: 0,
        runs: []
    };
}

function saveStats(stats) {
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const statsPath = path.join(outputDir, CONFIG.statsFile);
    try {
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.log(`⚠️ Error saving stats: ${error.message}`);
    }
}

function updateStats(runData) {
    const stats = loadStats();
    
    stats.totalRuns++;
    stats.totalEntriesCrawled += runData.entriesCrawled;
    stats.totalNewEntriesAdded += runData.newEntriesAdded;
    stats.totalDuplicatesSkipped += runData.duplicatesSkipped;
    
    if (!stats.firstRun) {
        stats.firstRun = runData.timestamp;
    }
    stats.lastRun = runData.timestamp;
    
    stats.averageEntriesPerRun = Math.round(stats.totalEntriesCrawled / stats.totalRuns * 100) / 100;
    stats.averageNewEntriesPerRun = Math.round(stats.totalNewEntriesAdded / stats.totalRuns * 100) / 100;
    
    stats.runs.unshift(runData);
    if (stats.runs.length > 50) {
        stats.runs = stats.runs.slice(0, 50);
    }
    
    saveStats(stats);
    return stats;
}

async function runSilentScraping() {
    const timestamp = new Date().toISOString();
    console.log(`\n🚀 Starting SILENT scraping run at ${timestamp}`);
    console.log(`📊 Target: ${CONFIG.maxEntries} entries${CONFIG.enablePagination ? ' (with pagination)' : ''}`);
    console.log('🤫 SILENT MODE: No contact info will be displayed to prevent app triggers');
    
    // Proactively kill Thunderbird and FaceTime to prevent auto-opening
    try {
        const { exec } = require('child_process');
        exec('pkill -f thunderbird 2>/dev/null || true', () => {});
        exec('pkill -f FaceTime 2>/dev/null || true', () => {});
        console.log('🛡️  Proactively disabled Thunderbird/FaceTime auto-launch');
    } catch (error) {
        // Ignore errors
    }
    
    const runStartTime = Date.now();
    
    try {
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
        
        let page = pages[0];
        for (const p of pages) {
            const url = p.url();
            if (url.includes('dat.com') || url.includes('one.dat.com')) {
                page = p;
                break;
            }
        }
        
        console.log(`📄 Using page: ${page.url()}`);
        
        await humanLikeMouseMove(page);
        await page.waitForTimeout(getRandomDelay(1000, 2000));
        
        console.log('🔍 Checking for load results...');
        let hasLoadResults = false;
        
        try {
            await page.waitForSelector('[data-test="load-origin-cell"]', { timeout: 5000 });
            hasLoadResults = true;
            console.log('✅ Found load results on current page');
        } catch (error) {
            console.log('⚠️ No load results found, navigating...');
        }
        
        if (!hasLoadResults) {
            await page.goto('https://one.dat.com/search-loads-ow', { 
                waitUntil: 'networkidle',
                timeout: 15000 
            });
            await page.waitForTimeout(getRandomDelay(2000, 4000));
        }
        
        await page.waitForSelector('[data-test="load-origin-cell"]', { timeout: 30000 });
        
        for (let i = 0; i < 3; i++) {
            await humanLikeMouseMove(page);
            await page.waitForTimeout(getRandomDelay(300, 800));
        }
        await occasionalScroll(page);
        
        // Check for pagination and scroll to load more results if needed
        let allLoadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
        console.log(`📋 Initial loads found: ${allLoadRows.length}`);
        
        // If we need more loads than available and pagination is enabled, try scrolling to load more
        if (CONFIG.enablePagination && allLoadRows.length < CONFIG.maxEntries) {
            console.log(`🔄 Need ${CONFIG.maxEntries} loads, only ${allLoadRows.length} found. Scrolling to load more...`);
            
            let previousCount = allLoadRows.length;
            let scrollAttempts = 0;
            const maxScrollAttempts = 5;
            
            while (allLoadRows.length < CONFIG.maxEntries && scrollAttempts < maxScrollAttempts) {
                // Scroll to bottom to trigger loading more results
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                
                await page.waitForTimeout(getRandomDelay(2000, 4000));
                
                // Check if more loads appeared
                allLoadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
                
                if (allLoadRows.length > previousCount) {
                    console.log(`📈 Loaded more results: ${allLoadRows.length} loads now available`);
                    previousCount = allLoadRows.length;
                } else {
                    console.log(`⏹️  No new loads loaded after scroll attempt ${scrollAttempts + 1}`);
                }
                
                scrollAttempts++;
                
                // Add human-like behavior during scrolling
                if (Math.random() < 0.4) {
                    await humanLikeMouseMove(page);
                    await page.waitForTimeout(getRandomDelay(1000, 2500));
                }
            }
            
            // Try looking for "Load More" or "Next Page" buttons
            const loadMoreSelectors = [
                'button[contains(text(), "Load More")]',
                'button[contains(text(), "Show More")]',
                '[data-test*="load-more"]',
                '[data-test*="next-page"]',
                'button:has-text("Load More")',
                'button:has-text("Show More")',
                'button:has-text("Next")',
                '.pagination-next',
                '.load-more-button'
            ];
            
            for (const selector of loadMoreSelectors) {
                try {
                    const loadMoreButton = await page.$(selector);
                    if (loadMoreButton && await loadMoreButton.isVisible()) {
                        console.log(`🔘 Found "Load More" button with selector: ${selector}`);
                        await loadMoreButton.click();
                        await page.waitForTimeout(getRandomDelay(2000, 4000));
                        
                        allLoadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
                        console.log(`📈 After clicking Load More: ${allLoadRows.length} loads available`);
                        break;
                    }
                } catch (error) {
                    // Continue to next selector
                }
            }
        }
        
        const loadRows = allLoadRows.slice(0, CONFIG.maxEntries);
        console.log(`📋 Processing ${loadRows.length} of ${allLoadRows.length} total loads (silent mode)`);
        
        if (loadRows.length === 0) {
            const fallbackRows = await page.$$('.row-container');
            if (fallbackRows.length === 0) {
                throw new Error('No load rows found');
            }
            loadRows.push(...fallbackRows.slice(0, CONFIG.maxEntries));
            console.log(`📋 Using fallback selector: ${loadRows.length} loads found`);
        }
        
        const extractedData = [];
        const startTime = Date.now();
        
        for (let idx = 0; idx < loadRows.length; idx++) {
            try {
                const progress = ((idx + 1) / loadRows.length * 100).toFixed(1);
                const progressBars = Math.floor(progress / 2);
                const emptyBars = 50 - progressBars;
                const progressBar = '█'.repeat(progressBars) + '░'.repeat(emptyBars);
                
                const elapsed = (Date.now() - startTime) / 1000;
                const avgTimePerLoad = elapsed / (idx + 1);
                const remainingLoads = loadRows.length - (idx + 1);
                const estimatedTimeRemaining = Math.round(avgTimePerLoad * remainingLoads);
                const etaMinutes = Math.floor(estimatedTimeRemaining / 60);
                const etaSeconds = estimatedTimeRemaining % 60;
                const etaString = etaMinutes > 0 ? `${etaMinutes}m ${etaSeconds}s` : `${etaSeconds}s`;
                
                console.log(`\n🔍 PROCESSING LOAD ${idx + 1}/${loadRows.length} (${progress}%)`);
                console.log(`📊 [${progressBar}] ${progress}% | ETA: ${etaString}`);
                
                const row = loadRows[idx];
                
                if (Math.random() < 0.15) {
                    await humanLikeMouseMove(page);
                    await page.waitForTimeout(getRandomDelay(2000, 5000));
                }
                
                await row.hover();
                await page.waitForTimeout(getRandomDelay(200, 600));
                
                // SILENT extraction - no contact logging
                const basicInfo = await row.evaluate(el => {
                    const ageElement = el.querySelector('[data-test="load-age-cell"]');
                    const rateElement = el.querySelector('[data-test="load-rate-cell"]');
                    const originElement = el.querySelector('[data-test="load-origin-cell"]');
                    const destinationElement = el.querySelector('[data-test="load-destination-cell"]');
                    
                    const companyCell = el.querySelector('.cell-company');
                    let companyName = 'N/A';
                    let contactInfo = 'N/A';
                    
                    if (companyCell) {
                        const companyElement = companyCell.querySelector('.company-prefer-or-blocked');
                        if (companyElement) {
                            companyName = companyElement.textContent.trim();
                        }
                        
                        // COMPLETELY SKIP contact extraction to prevent Thunderbird/FaceTime
                        // const contactElement = companyCell.querySelector('.contact-state');
                        // if (contactElement) {
                        //     contactInfo = contactElement.textContent.trim();
                        // }
                        contactInfo = 'CONTACT_SKIPPED'; // Placeholder to prevent apps from opening
                    }
                    
                    return {
                        age: ageElement ? ageElement.textContent.trim() : 'N/A',
                        rate: rateElement ? rateElement.textContent.trim() : 'N/A',
                        origin: originElement ? originElement.textContent.trim() : 'N/A',
                        destination: destinationElement ? destinationElement.textContent.trim() : 'N/A',
                        company: companyName,
                        contactInfo: contactInfo
                    };
                });
                
                const cleanedOriginDest = parseOriginDestination(basicInfo.origin, basicInfo.destination);
                const cleanedRate = parseRate(basicInfo.rate);
                // COMPLETELY SKIP contact processing to prevent app triggers
                const cleanedContact = null; // Always null to prevent any contact data processing
                
                // SILENT logging - no contact display
                console.log(`📍 ${cleanedOriginDest.origin} → ${cleanedOriginDest.destination}`);
                console.log(`🏢 Company: ${normalizeValue(basicInfo.company)}`);
                console.log(`💰 Rate: ${cleanedRate.totalRate || 'N/A'}`);
                
                await row.click();
                await page.waitForTimeout(getRandomDelay(1500, 3000));
                
                const detailedInfo = await page.evaluate(() => {
                    let referenceNumber = 'N/A';
                    let debugInfo = [];
                    
                    // Method 1: Look for "Reference ID" text in the specific equipment section
                    const refIdElements = Array.from(document.querySelectorAll('*')).filter(el => 
                        el.textContent && el.textContent.includes('Reference ID')
                    );
                    
                    for (const element of refIdElements) {
                        debugInfo.push(`Found "Reference ID" element`);
                        
                        // Look for the ID in the same element or nearby elements
                        const nextSibling = element.nextElementSibling;
                        const parent = element.parentElement;
                        
                        // Check the element itself and nearby elements
                        const textsToCheck = [
                            element.textContent,
                            nextSibling ? nextSibling.textContent : '',
                            parent ? parent.textContent : ''
                        ];
                        
                        for (const text of textsToCheck) {
                            if (text) {
                                const idMatch = text.match(/([0-9]{2}[A-Z][0-9]{4})/);
                                if (idMatch) {
                                    referenceNumber = idMatch[1];
                                    debugInfo.push(`Found via Reference ID context: ${referenceNumber}`);
                                    break;
                                }
                            }
                        }
                        
                        if (referenceNumber !== 'N/A') break;
                    }
                    
                    // Method 2: Look in equipment/load details sections specifically
                    if (referenceNumber === 'N/A') {
                        const equipmentSections = document.querySelectorAll('[class*="equipment"], [class*="load"], [class*="details"]');
                        for (const section of equipmentSections) {
                            const sectionText = section.textContent;
                            if (sectionText && sectionText.includes('Reference')) {
                                const idMatch = sectionText.match(/([0-9]{2}[A-Z][0-9]{4})/);
                                if (idMatch) {
                                    referenceNumber = idMatch[1];
                                    debugInfo.push(`Found in equipment section: ${referenceNumber}`);
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Method 3: Look for elements containing the DAT ONE pattern near "Reference" text
                    if (referenceNumber === 'N/A') {
                        const allElements = document.querySelectorAll('*');
                        for (const element of allElements) {
                            const text = element.textContent;
                            if (text && text.match(/([0-9]{2}[A-Z][0-9]{4})/)) {
                                // Check if this element or nearby elements contain "Reference"
                                const nearbyText = [
                                    element.previousElementSibling?.textContent || '',
                                    element.nextElementSibling?.textContent || '',
                                    element.parentElement?.textContent || ''
                                ].join(' ');
                                
                                if (nearbyText.toLowerCase().includes('reference')) {
                                    const idMatch = text.match(/([0-9]{2}[A-Z][0-9]{4})/);
                                    if (idMatch) {
                                        referenceNumber = idMatch[1];
                                        debugInfo.push(`Found via nearby Reference text: ${referenceNumber}`);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    // Method 4: Fallback - look for any DAT ONE pattern in visible modal/dialog
                    if (referenceNumber === 'N/A') {
                        const visibleModals = Array.from(document.querySelectorAll('*')).filter(el => {
                            const style = window.getComputedStyle(el);
                            return style.display !== 'none' && 
                                   style.visibility !== 'hidden' && 
                                   (el.getAttribute('role') === 'dialog' || 
                                    el.className.includes('modal') || 
                                    el.className.includes('dialog') ||
                                    el.className.includes('popup'));
                        });
                        
                        for (const modal of visibleModals) {
                            const modalText = modal.textContent;
                            const idMatch = modalText.match(/([0-9]{2}[A-Z][0-9]{4})/);
                            if (idMatch) {
                                referenceNumber = idMatch[1];
                                debugInfo.push(`Found in visible modal: ${referenceNumber}`);
                                break;
                            }
                        }
                    }
                    
                    // Method 5: Last resort - any DAT ONE pattern on page
                    if (referenceNumber === 'N/A') {
                        const allText = document.body.textContent;
                        const allMatches = allText.match(/\b([0-9]{2}[A-Z][0-9]{4})\b/g);
                        if (allMatches && allMatches.length > 0) {
                            referenceNumber = allMatches[0]; // Take first match
                            debugInfo.push(`Fallback - first DAT pattern: ${referenceNumber}`);
                        }
                    }
                    
                    return { 
                        referenceNumber,
                        debugInfo: debugInfo.slice(0, 5) // Show more debug info
                    };
                });
                
                let rateTotal = null;
                let ratePerMileNumeric = null;
                
                if (cleanedRate.totalRate) {
                    const totalMatch = cleanedRate.totalRate.match(/\$?([\d,]+)/);
                    if (totalMatch) {
                        rateTotal = parseInt(totalMatch[1].replace(/,/g, ''));
                    }
                }
                
                if (cleanedRate.ratePerMile) {
                    const perMileMatch = cleanedRate.ratePerMile.match(/\$?([\d.]+)/);
                    if (perMileMatch) {
                        ratePerMileNumeric = parseFloat(perMileMatch[1]);
                    }
                }
                
                const loadData = {
                    reference_number: normalizeValue(detailedInfo.referenceNumber),
                    origin: cleanedOriginDest.origin,
                    destination: cleanedOriginDest.destination,
                    rate_total_usd: rateTotal,
                    rate_per_mile: ratePerMileNumeric,
                    company: normalizeValue(basicInfo.company),
                    contact: cleanedContact,  // Only saved to CSV, never logged
                    age_posted: normalizeValue(basicInfo.age),
                    extracted_at: new Date().toISOString()
                };
                
                // Show reference ID status and debug info (but not contact info)
                if (loadData.reference_number && loadData.reference_number !== 'N/A') {
                    console.log(`🔢 Reference ID: ${loadData.reference_number}`);
                } else {
                    console.log(`🔢 Reference ID: [NOT_FOUND]`);
                    if (detailedInfo.debugInfo && detailedInfo.debugInfo.length > 0) {
                        console.log(`🔍 Debug: ${detailedInfo.debugInfo.join(' | ')}`);
                    }
                }
                
                if (loadData.origin && loadData.destination) {
                    extractedData.push(loadData);
                }
                
                await page.keyboard.press('Escape');
                await page.waitForTimeout(getRandomDelay(400, 1200));
                
                if (Math.random() < 0.2) {
                    await humanLikeMouseMove(page);
                }
                
            } catch (error) {
                console.error(`❌ Error processing load ${idx + 1}: ${error.message}`);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(getRandomDelay(1000, 2000));
            }
        }
        
        console.log(`\n✅ Extracted ${extractedData.length} loads in silent mode`);
        
        // Save with duplicate checking
        if (extractedData.length > 0) {
            const outputDir = './output';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const csvPath = path.join(outputDir, CONFIG.outputFile);
            
            let existingData = [];
            if (fs.existsSync(csvPath)) {
                try {
                    existingData = await new Promise((resolve, reject) => {
                        const results = [];
                        fs.createReadStream(csvPath)
                            .pipe(csv())
                            .on('data', (data) => {
                                results.push({
                                    reference_number: data.reference_number || null,
                                    origin: data.origin || null,
                                    destination: data.destination || null,
                                    rate_total_usd: data.rate_total_usd ? parseInt(data.rate_total_usd) : null,
                                    rate_per_mile: data.rate_per_mile ? parseFloat(data.rate_per_mile) : null,
                                    company: data.company || null,
                                    contact: data.contact || null,
                                    age_posted: data.age_posted || null,
                                    extracted_at: data.extracted_at || null
                                });
                            })
                            .on('end', () => resolve(results))
                            .on('error', (error) => reject(error));
                    });
                    console.log(`📖 Found ${existingData.length} existing records`);
                } catch (error) {
                    console.log(`⚠️ Error reading existing CSV: ${error.message}`);
                    existingData = [];
                }
            }
            
            const newRecords = [];
            let duplicateCount = 0;
            
            for (const newRecord of extractedData) {
                const isDuplicate = existingData.some(existing => {
                    return (
                        (newRecord.reference_number && existing.reference_number && newRecord.reference_number === existing.reference_number) ||
                        (newRecord.origin === existing.origin && 
                         newRecord.destination === existing.destination && 
                         newRecord.company === existing.company &&
                         newRecord.rate_total_usd === existing.rate_total_usd)
                    );
                });
                
                if (!isDuplicate) {
                    newRecords.push(newRecord);
                } else {
                    duplicateCount++;
                }
            }
            
            console.log(`🔍 Duplicate check: ${duplicateCount} duplicates, ${newRecords.length} new records`);
            
            if (newRecords.length > 0) {
                const writeHeader = !fs.existsSync(csvPath);
                
                const csvWriter = createCsvWriter({
                    path: csvPath,
                    header: [
                        { id: 'reference_number', title: 'reference_number' },
                        { id: 'origin', title: 'origin' },
                        { id: 'destination', title: 'destination' },
                        { id: 'rate_total_usd', title: 'rate_total_usd' },
                        { id: 'rate_per_mile', title: 'rate_per_mile' },
                        { id: 'company', title: 'company' },
                        { id: 'contact', title: 'contact' },
                        { id: 'age_posted', title: 'age_posted' },
                        { id: 'extracted_at', title: 'extracted_at' }
                    ],
                    append: !writeHeader
                });
                
                await csvWriter.writeRecords(newRecords);
                console.log(`💾 ${newRecords.length} new records saved to CSV`);
                
                const totalRecords = existingData.length + newRecords.length;
                const contactCount = newRecords.filter(load => load.contact).length;
                const refCount = newRecords.filter(load => load.reference_number).length;
                console.log(`📊 ${newRecords.length} new records added (${totalRecords} total)`);
                console.log(`📞 ${contactCount} contacts found | 🔢 ${refCount} references found`);
            } else {
                console.log(`📊 No new records to add. Total: ${existingData.length}`);
            }
            
            // Update stats
            const runEndTime = Date.now();
            const runDuration = Math.round((runEndTime - runStartTime) / 1000);
            
            const runData = {
                timestamp: timestamp,
                duration: runDuration,
                entriesCrawled: extractedData.length,
                newEntriesAdded: newRecords.length,
                duplicatesSkipped: duplicateCount,
                totalRecordsInFile: existingData.length + newRecords.length,
                contactsFound: newRecords.filter(load => load.contact).length,
                referenceNumbersFound: newRecords.filter(load => load.reference_number).length
            };
            
            const updatedStats = updateStats(runData);
            
            console.log(`\n📈 CUMULATIVE STATS:`);
            console.log(`   🔄 Total runs: ${updatedStats.totalRuns}`);
            console.log(`   📊 Total entries: ${updatedStats.totalEntriesCrawled}`);
            console.log(`   ✅ Total new entries: ${updatedStats.totalNewEntriesAdded}`);
            console.log(`   🔍 Total duplicates: ${updatedStats.totalDuplicatesSkipped}`);
            console.log(`   📊 Avg per run: ${updatedStats.averageEntriesPerRun}`);
        }
        
        console.log(`✅ Silent scraping completed at ${new Date().toISOString()}`);
        
    } catch (error) {
        console.error('❌ Silent scraping error:', error.message);
    }
}

// Schedule runner
let intervalId = null;

function startSilentScheduledScraping() {
    console.log(`🤫 Starting SILENT scheduled scraper:`);
    console.log(`   📅 Interval: Every ${CONFIG.intervalMinutes} minutes`);
    console.log(`   📊 Max entries per run: ${CONFIG.maxEntries}${CONFIG.enablePagination ? ' (with pagination)' : ''}`);
    console.log(`   📁 Output file: output/${CONFIG.outputFile}`);
    console.log(`   📈 Stats file: output/${CONFIG.statsFile}`);
    console.log(`   📄 Pagination: ${CONFIG.enablePagination ? 'Enabled' : 'Disabled'}`);
    console.log(`   🤫 SILENT MODE: No contact info displayed`);
    
    const stats = loadStats();
    if (stats.totalRuns > 0) {
        console.log(`\n📈 EXISTING STATS:`);
        console.log(`   🔄 Total runs: ${stats.totalRuns}`);
        console.log(`   📊 Total entries: ${stats.totalEntriesCrawled}`);
        console.log(`   ✅ Total new entries: ${stats.totalNewEntriesAdded}`);
    }
    
    if (CONFIG.runImmediately) {
        console.log('\n🚀 Running initial silent scrape...');
        runSilentScraping();
    }
    
    const intervalMs = CONFIG.intervalMinutes * 60 * 1000;
    intervalId = setInterval(() => {
        runSilentScraping();
    }, intervalMs);
    
    console.log(`\n⏰ Silent scheduler started. Next run in ${CONFIG.intervalMinutes} minutes.`);
    console.log('Press Ctrl+C to stop.');
}

function stopSilentScheduledScraping() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('\n🛑 Silent scheduled scraping stopped.');
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping silent scheduler...');
    stopSilentScheduledScraping();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping silent scheduler...');
    stopSilentScheduledScraping();
    process.exit(0);
});

// Start the silent scheduler
if (require.main === module) {
    startSilentScheduledScraping();
}

module.exports = {
    startSilentScheduledScraping,
    stopSilentScheduledScraping,
    CONFIG
}; 