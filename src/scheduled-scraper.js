const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const axios = require('axios');
require('dotenv').config();

// Completely avoid logging contact info to prevent app triggers

// Configuration - easily customizable
const CONFIG = {
    intervalMinutes: 5,    // Run every 5 minutes
    maxEntries: 30,        // Extract 30 entries per run
    outputFile: 'dat_one_loads_latest.csv',
    statsFile: 'scraper_stats.json',
    runImmediately: true   // Run once immediately on start
};

// Import all the helper functions from connect-existing-browser.js
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

function getReadingDelay(textLength = 100) {
    const wordsPerMinute = 200;
    const averageWordLength = 5;
    const words = textLength / averageWordLength;
    const readingTimeMs = (words / wordsPerMinute) * 60 * 1000;
    
    return Math.max(getRandomDelay(800, 1500), readingTimeMs * (0.5 + Math.random()));
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
    
    // Default stats structure
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
    
    // Update cumulative stats
    stats.totalRuns++;
    stats.totalEntriesCrawled += runData.entriesCrawled;
    stats.totalNewEntriesAdded += runData.newEntriesAdded;
    stats.totalDuplicatesSkipped += runData.duplicatesSkipped;
    
    if (!stats.firstRun) {
        stats.firstRun = runData.timestamp;
    }
    stats.lastRun = runData.timestamp;
    
    // Calculate averages
    stats.averageEntriesPerRun = Math.round(stats.totalEntriesCrawled / stats.totalRuns * 100) / 100;
    stats.averageNewEntriesPerRun = Math.round(stats.totalNewEntriesAdded / stats.totalRuns * 100) / 100;
    
    // Add this run to history (keep last 50 runs)
    stats.runs.unshift(runData);
    if (stats.runs.length > 50) {
        stats.runs = stats.runs.slice(0, 50);
    }
    
    saveStats(stats);
    return stats;
}

function printStatsHeader() {
    const stats = loadStats();
    if (stats.totalRuns > 0) {
        console.log(`\n📈 SCRAPER STATISTICS:`);
        console.log(`   🔄 Total runs: ${stats.totalRuns}`);
        console.log(`   📊 Total entries crawled: ${stats.totalEntriesCrawled}`);
        console.log(`   ✅ Total new entries added: ${stats.totalNewEntriesAdded}`);
        console.log(`   🔍 Total duplicates skipped: ${stats.totalDuplicatesSkipped}`);
        console.log(`   📊 Average entries per run: ${stats.averageEntriesPerRun}`);
        console.log(`   ✅ Average new entries per run: ${stats.averageNewEntriesPerRun}`);
        console.log(`   🕐 First run: ${stats.firstRun}`);
        console.log(`   🕐 Last run: ${stats.lastRun}`);
    }
}

async function runScheduledScraping() {
    const timestamp = new Date().toISOString();
    console.log(`\n🚀 Starting scheduled scraping run at ${timestamp}`);
    console.log(`📊 Target: ${CONFIG.maxEntries} entries`);
    console.log('💡 Note: Contact info in logs is obfuscated to prevent triggering apps (emails/FaceTime)');
    console.log('📄 Original contact data is preserved in the CSV file');
    
    // Initialize run tracking
    const runStartTime = Date.now();
    
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
        
        let page = pages[0];
        for (const p of pages) {
            const url = p.url();
            if (url.includes('dat.com') || url.includes('one.dat.com')) {
                page = p;
                break;
            }
        }
        
        console.log(`📄 Using page: ${page.url()}`);
        
        // Add some initial human-like behavior
        await humanLikeMouseMove(page);
        await page.waitForTimeout(getRandomDelay(1000, 2000));
        
        // Check if we already have load results on the current page
        console.log('🔍 Checking for load results on current page...');
        let hasLoadResults = false;
        
        try {
            await page.waitForSelector('[data-test="load-origin-cell"]', { timeout: 5000 });
            hasLoadResults = true;
            console.log('✅ Found load results on current page');
        } catch (error) {
            console.log('⚠️ No load results found on current page');
        }
        
        // Only navigate if we don't have load results
        if (!hasLoadResults) {
            console.log('🔍 Navigating to search loads page...');
            try {
                await page.goto('https://one.dat.com/search-loads-ow', { 
                    waitUntil: 'networkidle',
                    timeout: 15000 
                });
                console.log('✅ Successfully navigated to search loads page');
                await page.waitForTimeout(getRandomDelay(2000, 4000));
            } catch (error) {
                console.log('⚠️ Navigation failed, but continuing with current page...');
            }
        }
        
        // Wait for load results to appear
        console.log('⏳ Waiting for load results...');
        await page.waitForSelector('[data-test="load-origin-cell"]', { timeout: 30000 });
        
        // Human-like scanning behavior
        for (let i = 0; i < 3; i++) {
            await humanLikeMouseMove(page);
            await page.waitForTimeout(getRandomDelay(300, 800));
        }
        await occasionalScroll(page);
        
        // Get load rows (limited to maxEntries)
        const allLoadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
        const loadRows = allLoadRows.slice(0, CONFIG.maxEntries);
        console.log(`📋 Found ${allLoadRows.length} total loads, processing ${loadRows.length} loads`);
        
        if (loadRows.length === 0) {
            console.log('⚠️ No load rows found, trying fallback selector');
            const fallbackRows = await page.$$('.row-container');
            if (fallbackRows.length === 0) {
                throw new Error('No load rows found with any selector');
            }
            loadRows.push(...fallbackRows.slice(0, CONFIG.maxEntries));
        }
        
        const extractedData = [];
        const startTime = Date.now();
        
        // Process limited number of loads
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
                
                console.log(`\n🔍 PROCESSING LOAD ${idx + 1} OF ${loadRows.length} (${progress}%)`);
                console.log(`📊 PROGRESS: [${progressBar}] ${progress}%`);
                console.log(`⏱️  ETA: ${etaString} remaining | Average: ${avgTimePerLoad.toFixed(1)}s per load`);
                
                const row = loadRows[idx];
                
                // Occasional human-like pauses
                if (Math.random() < 0.15) {
                    console.log('   ⏸️  Taking a moment to scan other loads...');
                    await humanLikeMouseMove(page);
                    await page.waitForTimeout(getRandomDelay(2000, 5000));
                }
                
                // Human-like hover before clicking
                console.log('>>> 🖱️  HOVERING OVER LOAD...');
                await row.hover();
                await page.waitForTimeout(getRandomDelay(200, 600));
                
                // Extract basic info from the row
                const basicInfo = await row.evaluate(el => {
                    const ageElement = el.querySelector('[data-test="load-age-cell"]');
                    const rateElement = el.querySelector('[data-test="load-rate-cell"]');
                    const originElement = el.querySelector('[data-test="load-origin-cell"]');
                    const destinationElement = el.querySelector('[data-test="load-destination-cell"]');
                    
                    // Look for company information
                    const companyCell = el.querySelector('.cell-company');
                    let companyName = 'N/A';
                    let contactInfo = 'N/A';
                    
                    if (companyCell) {
                        const companyElement = companyCell.querySelector('.company-prefer-or-blocked');
                        if (companyElement) {
                            companyName = companyElement.textContent.trim();
                        }
                        
                        const contactElement = companyCell.querySelector('.contact-state');
                        if (contactElement) {
                            const contactText = contactElement.textContent.trim();
                            
                            if (contactText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)) {
                                contactInfo = contactText;
                            } else if (contactText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
                                contactInfo = contactText;
                            } else if (contactText && contactText.length > 0 && contactText !== 'N/A') {
                                contactInfo = contactText;
                            }
                        }
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
                
                // Clean and normalize data
                const cleanedOriginDest = parseOriginDestination(basicInfo.origin, basicInfo.destination);
                const cleanedRate = parseRate(basicInfo.rate);
                const cleanedContact = normalizeValue(basicInfo.contactInfo);
                
                // Log contact info safely (prevent Thunderbird/FaceTime)
                let safeContact = cleanedContact;
                if (safeContact) {
                    // Replace @ symbols to prevent email clients
                    safeContact = safeContact.replace(/@/g, ' [at] ');
                    // Replace phone numbers to prevent FaceTime
                    safeContact = safeContact.replace(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g, (match) => {
                        return match.replace(/[()-.\s]/g, 'X');
                    });
                    // Additional protection - replace any remaining @ symbols
                    safeContact = safeContact.replace(/@/g, ' [AT] ');
                }
                
                console.log(`📍 ${cleanedOriginDest.origin} → ${cleanedOriginDest.destination} (${normalizeValue(basicInfo.company)})`);
                // COMPLETELY SKIP contact logging to prevent Thunderbird/FaceTime triggers
                console.log(`📞 Contact: [SAVED_TO_CSV_ONLY]`);
                if (cleanedRate.totalRate || cleanedRate.ratePerMile) {
                    console.log(`💰 Rate: ${cleanedRate.totalRate || 'N/A'} | Per Mile: ${cleanedRate.ratePerMile || 'N/A'}`);
                }
                
                // Click to get detailed information including reference number
                console.log('>>> 👆 CLICKING TO REVEAL DETAILS...');
                await row.click();
                
                console.log('>>> ⏳ WAITING FOR DETAILS TO LOAD...');
                await page.waitForTimeout(getRandomDelay(1500, 3000));
                
                console.log('>>> 📋 EXTRACTING DETAILED INFORMATION...');
                const detailedInfo = await page.evaluate(() => {
                    // Extract reference number
                    let referenceNumber = 'N/A';
                    
                    const refElements = document.querySelectorAll('*');
                    for (const element of refElements) {
                        const text = element.textContent;
                        if (text && text.includes('Reference ID')) {
                            const parentText = element.parentElement ? element.parentElement.textContent : text;
                            const idMatch = parentText.match(/Reference\s*ID\s*([0-9]{2}[A-Z][0-9]{4})/i);
                            if (idMatch) {
                                referenceNumber = idMatch[1];
                                break;
                            }
                        }
                    }
                    
                    if (referenceNumber === 'N/A') {
                        const allText = document.body.textContent;
                        const precisePattern = /Reference\s*ID\s*([0-9]{2}[A-Z][0-9]{4})/i;
                        const match = allText.match(precisePattern);
                        if (match) {
                            referenceNumber = match[1];
                        } else {
                            const lines = allText.split('\n');
                            for (const line of lines) {
                                if (line.includes('Reference') && line.match(/[0-9]{2}[A-Z][0-9]{4}/)) {
                                    const idMatch = line.match(/([0-9]{2}[A-Z][0-9]{4})/);
                                    if (idMatch) {
                                        referenceNumber = idMatch[1];
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    return { referenceNumber };
                });
                
                // Convert rates to numeric values
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
                
                // Create data in the specified format
                const loadData = {
                    reference_number: normalizeValue(detailedInfo.referenceNumber),
                    origin: cleanedOriginDest.origin,
                    destination: cleanedOriginDest.destination,
                    rate_total_usd: rateTotal,
                    rate_per_mile: ratePerMileNumeric,
                    company: normalizeValue(basicInfo.company),
                    contact: cleanedContact,
                    age_posted: normalizeValue(basicInfo.age),
                    extracted_at: new Date().toISOString()
                };
                
                if (loadData.origin && loadData.destination) {
                    extractedData.push(loadData);
                }
                
                // Close modal
                if (Math.random() < 0.7) {
                    await page.keyboard.press('Escape');
                } else {
                    try {
                        const closeButton = await page.$('button[aria-label="Close"], .close-button, [class*="close"], .modal-close');
                        if (closeButton) {
                            await closeButton.click();
                        } else {
                            await page.keyboard.press('Escape');
                        }
                    } catch (e) {
                        await page.keyboard.press('Escape');
                    }
                }
                
                await page.waitForTimeout(getRandomDelay(400, 1200));
                
                // Occasional human behaviors
                if (Math.random() < 0.2) {
                    await humanLikeMouseMove(page);
                }
                if (Math.random() < 0.1) {
                    await occasionalScroll(page);
                }
                
            } catch (error) {
                console.error(`❌ Error processing load ${idx + 1}:`, error.message);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(getRandomDelay(1000, 2000));
            }
        }
        
        console.log(`\n✅ Extracted ${extractedData.length} loads in this run`);
        
        // Save to CSV with duplicate checking
        if (extractedData.length > 0) {
            const outputDir = './output';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const csvPath = path.join(outputDir, CONFIG.outputFile);
            
            // Read existing data to check for duplicates
            let existingData = [];
            if (fs.existsSync(csvPath)) {
                try {
                    existingData = await new Promise((resolve, reject) => {
                        const results = [];
                        fs.createReadStream(csvPath)
                            .pipe(csv())
                            .on('data', (data) => {
                                // Convert string values to appropriate types
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
                            .on('end', () => {
                                resolve(results);
                            })
                            .on('error', (error) => {
                                reject(error);
                            });
                    });
                    console.log(`📖 Found ${existingData.length} existing records in CSV`);
                } catch (error) {
                    console.log(`⚠️ Error reading existing CSV: ${error.message}`);
                    existingData = [];
                }
            }
            
            // Check for duplicates based on reference_number, origin, destination, and company
            const newRecords = [];
            let duplicateCount = 0;
            
            for (const newRecord of extractedData) {
                const isDuplicate = existingData.some(existing => {
                    // Check if it's the same load based on key identifiers
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
            
            console.log(`🔍 Duplicate check: ${duplicateCount} duplicates found, ${newRecords.length} new records to add`);
            
            if (newRecords.length > 0) {
                // Determine if we need to write header (new file)
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
                    append: !writeHeader // Append if file exists, write new if it doesn't
                });
                
                await csvWriter.writeRecords(newRecords);
                                 console.log(`💾 ${newRecords.length} new records appended to: ${csvPath}`);
                
                // Print summary
                const contactCount = newRecords.filter(load => load.contact).length;
                const refCount = newRecords.filter(load => load.reference_number).length;
                const totalRecords = existingData.length + newRecords.length;
                console.log(`📊 Summary: ${newRecords.length} new loads added (${totalRecords} total), ${contactCount} with contacts, ${refCount} with reference numbers`);
            } else {
                console.log(`📊 No new records to add. Total records in file: ${existingData.length}`);
            }
            
            // Update and save stats
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
            
            console.log(`\n📈 RUN STATISTICS:`);
            console.log(`   ⏱️  Duration: ${runDuration}s`);
            console.log(`   📊 Entries crawled: ${extractedData.length}`);
            console.log(`   ✅ New entries added: ${newRecords.length}`);
            console.log(`   🔍 Duplicates skipped: ${duplicateCount}`);
            console.log(`   📁 Total records in file: ${existingData.length + newRecords.length}`);
            console.log(`   📞 Contacts found: ${newRecords.filter(load => load.contact).length}`);
            console.log(`   🔢 Reference numbers found: ${newRecords.filter(load => load.reference_number).length}`);
            
            console.log(`\n📊 CUMULATIVE STATISTICS:`);
            console.log(`   🔄 Total runs: ${updatedStats.totalRuns}`);
            console.log(`   📊 Total entries crawled: ${updatedStats.totalEntriesCrawled}`);
            console.log(`   ✅ Total new entries added: ${updatedStats.totalNewEntriesAdded}`);
            console.log(`   🔍 Total duplicates skipped: ${updatedStats.totalDuplicatesSkipped}`);
            console.log(`   📊 Average entries per run: ${updatedStats.averageEntriesPerRun}`);
            console.log(`   ✅ Average new entries per run: ${updatedStats.averageNewEntriesPerRun}`);
        }
        
        console.log(`✅ Scheduled run completed at ${new Date().toISOString()}`);
        
    } catch (error) {
        console.error('❌ Scheduled run error:', error.message);
    }
}

// Schedule runner
let intervalId = null;

function startScheduledScraping() {
    console.log(`🔄 Starting scheduled scraper:`);
    console.log(`   📅 Interval: Every ${CONFIG.intervalMinutes} minutes`);
    console.log(`   📊 Max entries per run: ${CONFIG.maxEntries}`);
    console.log(`   📁 Output file: output/${CONFIG.outputFile}`);
    console.log(`   📈 Stats file: output/${CONFIG.statsFile}`);
    console.log(`   🚀 Run immediately: ${CONFIG.runImmediately}`);
    
    // Show existing stats if available
    printStatsHeader();
    
    // Run immediately if configured
    if (CONFIG.runImmediately) {
        console.log('\n🚀 Running initial scrape...');
        runScheduledScraping();
    }
    
    // Set up recurring schedule
    const intervalMs = CONFIG.intervalMinutes * 60 * 1000;
    intervalId = setInterval(() => {
        runScheduledScraping();
    }, intervalMs);
    
    console.log(`\n⏰ Scheduler started. Next run in ${CONFIG.intervalMinutes} minutes.`);
    console.log('Press Ctrl+C to stop the scheduler.');
}

function stopScheduledScraping() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('\n🛑 Scheduled scraping stopped.');
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, stopping scheduler...');
    stopScheduledScraping();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, stopping scheduler...');
    stopScheduledScraping();
    process.exit(0);
});

// Start the scheduler
if (require.main === module) {
    startScheduledScraping();
}

module.exports = {
    startScheduledScraping,
    stopScheduledScraping,
    CONFIG
}; 