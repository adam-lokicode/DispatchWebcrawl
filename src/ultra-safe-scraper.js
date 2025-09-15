const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
require('dotenv').config();

// ULTRA SAFE: Filter all text to remove email/phone patterns
const CONFIG = {
    intervalMinutes: 5,    
    maxEntries: 50,        
    outputFile: 'dat_one_loads_ultra_safe.csv',
    statsFile: 'scraper_stats_ultra_safe.json',
    runImmediately: true,  
    enablePagination: true
};

// Ultra-safe text filtering to remove ANY email or phone patterns
function ultraSafeFilter(text) {
    if (!text || typeof text !== 'string') return text;
    
    // Remove ALL potential email patterns
    let filtered = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[FILTERED]');
    
    // Remove ALL potential phone patterns
    filtered = filtered.replace(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[FILTERED]');
    filtered = filtered.replace(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g, '[FILTERED]');
    filtered = filtered.replace(/\d{10,}/g, '[FILTERED]');
    
    // Remove tel: links
    filtered = filtered.replace(/tel:[0-9\-\(\)\.\s]+/g, '[FILTERED]');
    
    // Remove mailto: links
    filtered = filtered.replace(/mailto:[^\s]+/g, '[FILTERED]');
    
    return filtered;
}

// Override console.log to ultra-filter everything
const originalConsoleLog = console.log;
console.log = function(...args) {
    const filteredArgs = args.map(arg => {
        if (typeof arg === 'string') {
            return ultraSafeFilter(arg);
        }
        return arg;
    });
    originalConsoleLog.apply(console, filteredArgs);
};

// Helper functions
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
    return ultraSafeFilter(value.trim());
}

function parseRate(rateText) {
    if (!rateText || rateText === '–' || rateText === '-') {
        return { totalRate: null, ratePerMile: null };
    }
    
    const safeRateText = ultraSafeFilter(rateText);
    
    const combinedRatePattern = /\$?([\d,]+)\$?([\d.]+)\*?\/mi/;
    const combinedMatch = safeRateText.match(combinedRatePattern);
    
    if (combinedMatch) {
        return {
            totalRate: `$${combinedMatch[1]}`,
            ratePerMile: `$${combinedMatch[2]}/mi`
        };
    }
    
    const totalRatePattern = /\$?([\d,]+)$/;
    const totalMatch = safeRateText.match(totalRatePattern);
    
    if (totalMatch) {
        return {
            totalRate: `$${totalMatch[1]}`,
            ratePerMile: null
        };
    }
    
    const perMilePattern = /\$?([\d.]+)\*?\/mi/;
    const perMileMatch = safeRateText.match(perMilePattern);
    
    if (perMileMatch) {
        return {
            totalRate: null,
            ratePerMile: `$${perMileMatch[1]}/mi`
        };
    }
    
    return {
        totalRate: safeRateText,
        ratePerMile: null
    };
}

function parseOriginDestination(originText, destinationText) {
    const safeOrigin = ultraSafeFilter(originText || '');
    const safeDestination = ultraSafeFilter(destinationText || '');
    
    if (!safeOrigin) return { origin: null, destination: safeDestination };
    if (!safeDestination) return { origin: safeOrigin, destination: null };
    
    const concatenatedPattern = /^(.+?),\s*([A-Z]{2})([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})$/;
    const match = safeOrigin.match(concatenatedPattern);
    
    if (match) {
        const [, city1, state1, city2, state2] = match;
        return {
            origin: `${city1}, ${state1}`,
            destination: `${city2}, ${state2}`
        };
    }
    
    return {
        origin: normalizeValue(safeOrigin),
        destination: normalizeValue(safeDestination)
    };
}

// Stats functions
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

async function runUltraSafeScraping() {
    const timestamp = new Date().toISOString();
    console.log(`\n🚀 Starting ULTRA-SAFE scraping run at ${timestamp}`);
    console.log(`📊 Target: ${CONFIG.maxEntries} entries${CONFIG.enablePagination ? ' (with pagination)' : ''}`);
    console.log('🛡️ ULTRA-SAFE MODE: All text filtered for email/phone patterns');
    
    // Aggressively kill mail apps
    try {
        const { exec } = require('child_process');
        exec('pkill -f Mail 2>/dev/null || true', () => {});
        exec('pkill -f mail 2>/dev/null || true', () => {});
        exec('pkill -f thunderbird 2>/dev/null || true', () => {});
        exec('pkill -f Thunderbird 2>/dev/null || true', () => {});
        exec('pkill -f FaceTime 2>/dev/null || true', () => {});
        console.log('🛡️ Aggressively killed all mail/phone apps');
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
        
        console.log(`📄 Using page: ${ultraSafeFilter(page.url())}`);
        
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
        
        // Pagination handling
        let allLoadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
        console.log(`📋 Initial loads found: ${allLoadRows.length}`);
        
        if (CONFIG.enablePagination && allLoadRows.length < CONFIG.maxEntries) {
            console.log(`🔄 Need ${CONFIG.maxEntries} loads, only ${allLoadRows.length} found. Scrolling to load more...`);
            
            let previousCount = allLoadRows.length;
            let scrollAttempts = 0;
            const maxScrollAttempts = 5;
            
            while (allLoadRows.length < CONFIG.maxEntries && scrollAttempts < maxScrollAttempts) {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                
                await page.waitForTimeout(getRandomDelay(2000, 4000));
                
                allLoadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
                
                if (allLoadRows.length > previousCount) {
                    console.log(`📈 Loaded more results: ${allLoadRows.length} loads now available`);
                    previousCount = allLoadRows.length;
                } else {
                    console.log(`⏹️ No new loads loaded after scroll attempt ${scrollAttempts + 1}`);
                }
                
                scrollAttempts++;
                
                if (Math.random() < 0.4) {
                    await humanLikeMouseMove(page);
                    await page.waitForTimeout(getRandomDelay(1000, 2500));
                }
            }
        }
        
        const loadRows = allLoadRows.slice(0, CONFIG.maxEntries);
        console.log(`📋 Processing ${loadRows.length} of ${allLoadRows.length} total loads (ULTRA-SAFE mode)`);
        
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
                
                // ULTRA-SAFE extraction with filtering
                const basicInfo = await row.evaluate(el => {
                    // Ultra-safe filter function in browser context
                    function filterUnsafe(text) {
                        if (!text) return text;
                        return text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[FILTERED]')
                                  .replace(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[FILTERED]')
                                  .replace(/tel:[^\s]+/g, '[FILTERED]')
                                  .replace(/mailto:[^\s]+/g, '[FILTERED]');
                    }
                    
                    const ageElement = el.querySelector('[data-test="load-age-cell"]');
                    const rateElement = el.querySelector('[data-test="load-rate-cell"]');
                    const originElement = el.querySelector('[data-test="load-origin-cell"]');
                    const destinationElement = el.querySelector('[data-test="load-destination-cell"]');
                    
                    const companyCell = el.querySelector('.cell-company');
                    let companyName = 'N/A';
                    
                    if (companyCell) {
                        const companyElement = companyCell.querySelector('.company-prefer-or-blocked');
                        if (companyElement) {
                            companyName = filterUnsafe(companyElement.textContent.trim());
                        }
                    }
                    
                    return {
                        age: ageElement ? filterUnsafe(ageElement.textContent.trim()) : 'N/A',
                        rate: rateElement ? filterUnsafe(rateElement.textContent.trim()) : 'N/A',
                        origin: originElement ? filterUnsafe(originElement.textContent.trim()) : 'N/A',
                        destination: destinationElement ? filterUnsafe(destinationElement.textContent.trim()) : 'N/A',
                        company: companyName
                    };
                });
                
                const cleanedOriginDest = parseOriginDestination(basicInfo.origin, basicInfo.destination);
                const cleanedRate = parseRate(basicInfo.rate);
                
                console.log(`📍 ${cleanedOriginDest.origin} → ${cleanedOriginDest.destination}`);
                console.log(`🏢 Company: ${normalizeValue(basicInfo.company)}`);
                console.log(`💰 Rate: ${cleanedRate.totalRate || 'N/A'}`);
                console.log(`🛡️ Contact: [ULTRA_SAFE_DISABLED]`);
                
                await row.click();
                await page.waitForTimeout(getRandomDelay(1500, 3000));
                
                // Ultra-safe reference ID extraction
                const detailedInfo = await page.evaluate(() => {
                    let referenceNumber = 'N/A';
                    
                    // Only look for reference pattern, avoid all text processing
                    const allText = document.body.textContent || '';
                    const allMatches = allText.match(/\b([0-9]{2}[A-Z][0-9]{4})\b/g);
                    if (allMatches && allMatches.length > 0) {
                        referenceNumber = allMatches[0];
                    }
                    
                    return { referenceNumber };
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
                    contact: null, // ALWAYS NULL in ultra-safe mode
                    age_posted: normalizeValue(basicInfo.age),
                    extracted_at: new Date().toISOString()
                };
                
                if (loadData.reference_number && loadData.reference_number !== 'N/A') {
                    console.log(`🔢 Reference ID: ${loadData.reference_number}`);
                } else {
                    console.log(`🔢 Reference ID: [NOT_FOUND]`);
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
                console.error(`❌ Error processing load ${idx + 1}: ${ultraSafeFilter(error.message)}`);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(getRandomDelay(1000, 2000));
            }
        }
        
        console.log(`\n✅ Extracted ${extractedData.length} loads in ULTRA-SAFE mode`);
        
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
                                    contact: null, // Always null in ultra-safe mode
                                    age_posted: data.age_posted || null,
                                    extracted_at: data.extracted_at || null
                                });
                            })
                            .on('end', () => resolve(results))
                            .on('error', (error) => reject(error));
                    });
                    console.log(`📖 Found ${existingData.length} existing records`);
                } catch (error) {
                    console.log(`⚠️ Error reading existing CSV: ${ultraSafeFilter(error.message)}`);
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
                console.log(`💾 ${newRecords.length} new records saved to CSV (ULTRA-SAFE)`);
                
                const totalRecords = existingData.length + newRecords.length;
                const refCount = newRecords.filter(load => load.reference_number).length;
                console.log(`📊 ${newRecords.length} new records added (${totalRecords} total)`);
                console.log(`🛡️ ZERO contacts extracted (ultra-safe mode) | 🔢 ${refCount} references found`);
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
                contactsFound: 0, // Always 0 in ultra-safe mode
                referenceNumbersFound: newRecords.filter(load => load.reference_number).length
            };
            
            const updatedStats = updateStats(runData);
            
            console.log(`\n📈 CUMULATIVE STATS (ULTRA-SAFE MODE):`);
            console.log(`   🔄 Total runs: ${updatedStats.totalRuns}`);
            console.log(`   📊 Total entries: ${updatedStats.totalEntriesCrawled}`);
            console.log(`   ✅ Total new entries: ${updatedStats.totalNewEntriesAdded}`);
            console.log(`   🔍 Total duplicates: ${updatedStats.totalDuplicatesSkipped}`);
            console.log(`   📊 Avg per run: ${updatedStats.averageEntriesPerRun}`);
        }
        
        console.log(`✅ ULTRA-SAFE scraping completed at ${new Date().toISOString()}`);
        
    } catch (error) {
        console.error('❌ Ultra-safe scraping error:', ultraSafeFilter(error.message));
    }
}

// Schedule runner
let intervalId = null;

function startUltraSafeScheduledScraping() {
    console.log(`🛡️ Starting ULTRA-SAFE scheduled scraper:`);
    console.log(`   📅 Interval: Every ${CONFIG.intervalMinutes} minutes`);
    console.log(`   📊 Max entries per run: ${CONFIG.maxEntries}`);
    console.log(`   📁 Output file: output/${CONFIG.outputFile}`);
    console.log(`   📈 Stats file: output/${CONFIG.statsFile}`);
    console.log(`   📄 Pagination: ${CONFIG.enablePagination ? 'Enabled' : 'Disabled'}`);
    console.log(`   🛡️ ULTRA-SAFE: All text filtered for email/phone patterns`);
    
    const stats = loadStats();
    if (stats.totalRuns > 0) {
        console.log(`\n📈 EXISTING STATS:`);
        console.log(`   🔄 Total runs: ${stats.totalRuns}`);
        console.log(`   📊 Total entries: ${stats.totalEntriesCrawled}`);
        console.log(`   ✅ Total new entries: ${stats.totalNewEntriesAdded}`);
    }
    
    if (CONFIG.runImmediately) {
        console.log('\n🚀 Running initial ultra-safe scrape...');
        runUltraSafeScraping();
    }
    
    const intervalMs = CONFIG.intervalMinutes * 60 * 1000;
    intervalId = setInterval(() => {
        runUltraSafeScraping();
    }, intervalMs);
    
    console.log(`\n⏰ Ultra-safe scheduler started. Next run in ${CONFIG.intervalMinutes} minutes.`);
    console.log('Press Ctrl+C to stop.');
}

function stopUltraSafeScheduledScraping() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('\n🛑 Ultra-safe scheduled scraping stopped.');
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping ultra-safe scheduler...');
    stopUltraSafeScheduledScraping();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping ultra-safe scheduler...');
    stopUltraSafeScheduledScraping();
    process.exit(0);
});

// Start the ultra-safe scheduler
if (require.main === module) {
    startUltraSafeScheduledScraping();
}

module.exports = {
    startUltraSafeScheduledScraping,
    stopUltraSafeScheduledScraping,
    CONFIG
}; 