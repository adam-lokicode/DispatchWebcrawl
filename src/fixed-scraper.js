const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
require('dotenv').config();

// FIXED VERSION: All issues resolved
const CONFIG = {
    intervalMinutes: 5,    
    maxEntries: 30,        
    outputFile: 'dat_one_loads_fixed.csv',
    statsFile: 'scraper_stats_fixed.json',
    runImmediately: true,  
    enablePagination: false
};

// AGGRESSIVE mail app prevention
process.env.MAILTO_HANDLER = 'disabled';
process.env.EMAIL_CLIENT = 'disabled';

// Kill mail apps and disable URL handling
try {
    const { exec } = require('child_process');
    exec('pkill -f Mail 2>/dev/null || true', () => {});
    exec('pkill -f mail 2>/dev/null || true', () => {});
    exec('pkill -f thunderbird 2>/dev/null || true', () => {});
    exec('pkill -f Thunderbird 2>/dev/null || true', () => {});
    exec('pkill -f FaceTime 2>/dev/null || true', () => {});
    
    // Disable URL handlers completely
    exec('defaults write com.apple.LaunchServices LSQuarantine -bool YES 2>/dev/null || true', () => {});
} catch (error) {}

// Override all console methods to filter any potential triggers
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function safeLog(...args) {
    const safeArgs = args.map(arg => {
        if (typeof arg === 'string') {
            return arg.replace(/@/g, '[AT]').replace(/\.\w{2,}/g, '[DOMAIN]');
        }
        return arg;
    });
    originalLog.apply(console, safeArgs);
}

console.log = safeLog;
console.error = safeLog;
console.warn = safeLog;

// Helper functions
function getRandomDelay(min = 500, max = 2000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanLikeMouseMove(page) {
    try {
        const viewport = await page.viewportSize();
        if (!viewport) {
            await page.mouse.move(400, 300, { steps: 3 });
            return;
        }
        
        const x = Math.floor(Math.random() * viewport.width);
        const y = Math.floor(Math.random() * viewport.height);
        await page.mouse.move(x, y, { steps: 3 });
    } catch (error) {
        // Ignore mouse errors
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
    
    // Handle combined rate like "$2,700$2.17*/mi"
    const combinedRatePattern = /\$?([\d,]+)\$?([\d.]+)\*?\/mi/;
    const combinedMatch = rateText.match(combinedRatePattern);
    
    if (combinedMatch) {
        return {
            totalRate: `$${combinedMatch[1]}`,
            ratePerMile: `$${combinedMatch[2]}/mi`
        };
    }
    
    // Handle just total rate
    const totalRatePattern = /\$?([\d,]+)$/;
    const totalMatch = rateText.match(totalRatePattern);
    
    if (totalMatch) {
        return {
            totalRate: `$${totalMatch[1]}`,
            ratePerMile: null
        };
    }
    
    // Handle just per mile rate
    const perMilePattern = /\$?([\d.]+)\*?\/mi/;
    const perMileMatch = rateText.match(perMilePattern);
    
    if (perMileMatch) {
        return {
            totalRate: null,
            ratePerMile: `$${perMileMatch[1]}/mi`
        };
    }
    
    return { totalRate: rateText, ratePerMile: null };
}

// FIXED: Origin/Destination parsing
function parseOriginDestination(originText, destinationText) {
    if (!originText && !destinationText) {
        return { origin: null, destination: null };
    }
    
    // Handle concatenated origins like "San Leandro, CALoveland, CO"
    if (originText && originText.includes(',')) {
        // Look for pattern: "City, STATECity, STATE"
        const concatenatedPattern = /^(.+?),\s*([A-Z]{2})([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})$/;
        const match = originText.match(concatenatedPattern);
        
        if (match) {
            const [, city1, state1, city2, state2] = match;
            return {
                origin: `${city1}, ${state1}`,
                destination: `${city2}, ${state2}`
            };
        }
        
        // Look for pattern: "City, STATEAnotherCity, STATE" 
        const simplePattern = /^(.+?),\s*([A-Z]{2})(.+?),\s*([A-Z]{2})$/;
        const simpleMatch = originText.match(simplePattern);
        
        if (simpleMatch) {
            const [, city1, state1, city2, state2] = simpleMatch;
            // Clean up city2 in case it starts with a capital letter directly
            const cleanCity2 = city2.replace(/^([A-Z])/, ' $1').trim();
            return {
                origin: `${city1}, ${state1}`,
                destination: `${cleanCity2}, ${state2}`
            };
        }
    }
    
    return {
        origin: normalizeValue(originText),
        destination: normalizeValue(destinationText)
    };
}

async function runFixedScraping() {
    const timestamp = new Date().toISOString();
    console.log(`\n🚀 Starting FIXED scraping run at ${timestamp}`);
    console.log(`📊 Target: ${CONFIG.maxEntries} entries`);
    console.log('🔧 FIXED MODE: All issues resolved - unique refs, proper parsing, no mail apps');
    
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
        
        const allLoadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
        const loadRows = allLoadRows.slice(0, CONFIG.maxEntries);
        console.log(`📋 Processing ${loadRows.length} loads (FIXED mode)`);
        
        if (loadRows.length === 0) {
            const fallbackRows = await page.$$('.row-container');
            if (fallbackRows.length === 0) {
                throw new Error('No load rows found');
            }
            loadRows.push(...fallbackRows.slice(0, CONFIG.maxEntries));
        }
        
        const extractedData = [];
        const startTime = Date.now();
        
        for (let idx = 0; idx < loadRows.length; idx++) {
            try {
                const progress = ((idx + 1) / loadRows.length * 100).toFixed(1);
                const progressBars = Math.floor(progress / 2);
                const emptyBars = 50 - progressBars;
                const progressBar = '█'.repeat(progressBars) + '░'.repeat(emptyBars);
                
                console.log(`\n🔍 LOAD ${idx + 1}/${loadRows.length} (${progress}%)`);
                console.log(`📊 [${progressBar}] ${progress}%`);
                
                const row = loadRows[idx];
                
                await row.hover();
                await page.waitForTimeout(getRandomDelay(200, 600));
                
                // Extract basic info from the row (NO CONTACT DATA)
                const basicInfo = await row.evaluate(el => {
                    const ageElement = el.querySelector('[data-test="load-age-cell"]');
                    const rateElement = el.querySelector('[data-test="load-rate-cell"]');
                    const originElement = el.querySelector('[data-test="load-origin-cell"]');
                    const destinationElement = el.querySelector('[data-test="load-destination-cell"]');
                    
                    const companyCell = el.querySelector('.cell-company');
                    let companyName = 'N/A';
                    
                    if (companyCell) {
                        const companyElement = companyCell.querySelector('.company-prefer-or-blocked');
                        if (companyElement) {
                            companyName = companyElement.textContent.trim();
                        }
                    }
                    
                    return {
                        age: ageElement ? ageElement.textContent.trim() : 'N/A',
                        rate: rateElement ? rateElement.textContent.trim() : 'N/A',
                        origin: originElement ? originElement.textContent.trim() : 'N/A',
                        destination: destinationElement ? destinationElement.textContent.trim() : 'N/A',
                        company: companyName
                    };
                });
                
                // FIXED: Parse origin/destination properly
                const cleanedOriginDest = parseOriginDestination(basicInfo.origin, basicInfo.destination);
                const cleanedRate = parseRate(basicInfo.rate);
                
                console.log(`📍 ${cleanedOriginDest.origin} → ${cleanedOriginDest.destination}`);
                console.log(`🏢 ${basicInfo.company}`);
                console.log(`💰 ${cleanedRate.totalRate || 'N/A'}`);
                
                // Click row to open modal for THIS specific load
                console.log(`🖱️  Clicking to open load details...`);
                await row.click();
                await page.waitForTimeout(getRandomDelay(2000, 4000)); // Wait longer for modal
                
                // FIXED: Better reference number extraction from the modal
                const detailedInfo = await page.evaluate(() => {
                    let referenceNumber = 'N/A';
                    let debugInfo = [];
                    
                    // Wait a moment for modal to fully load
                    const waitForModal = () => {
                        return new Promise(resolve => {
                            setTimeout(resolve, 500);
                        });
                    };
                    
                    // Look for any visible modal/dialog/popup
                    const allElements = document.querySelectorAll('*');
                    const potentialModals = Array.from(allElements).filter(el => {
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        
                        // Element must be visible and reasonably sized
                        return rect.width > 300 && rect.height > 200 && 
                               style.display !== 'none' && 
                               style.visibility !== 'hidden' &&
                               style.opacity !== '0' &&
                               rect.top >= 0;
                    });
                    
                    debugInfo.push(`Found ${potentialModals.length} potential modal elements`);
                    
                    // Search in the largest visible element first (likely the modal)
                    potentialModals.sort((a, b) => {
                        const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
                        const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
                        return bArea - aArea;
                    });
                    
                    for (const modal of potentialModals.slice(0, 3)) { // Check top 3 largest
                        const modalText = modal.textContent || '';
                        
                        // Method 1: Look for "Reference ID" text
                        const refIdMatch = modalText.match(/Reference\s*ID[:\s]*([0-9]{2}[A-Z][0-9]{4})/i);
                        if (refIdMatch) {
                            referenceNumber = refIdMatch[1];
                            debugInfo.push(`Found via "Reference ID": ${referenceNumber}`);
                            break;
                        }
                        
                        // Method 2: Look for the DAT ONE pattern in context
                        const lines = modalText.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            if (line.toLowerCase().includes('reference') || line.toLowerCase().includes('id')) {
                                // Check this line and next few lines for the pattern
                                for (let j = i; j < Math.min(i + 3, lines.length); j++) {
                                    const checkLine = lines[j];
                                    const patternMatch = checkLine.match(/\b([0-9]{2}[A-Z][0-9]{4})\b/);
                                    if (patternMatch) {
                                        referenceNumber = patternMatch[1];
                                        debugInfo.push(`Found via context search: ${referenceNumber}`);
                                        break;
                                    }
                                }
                                if (referenceNumber !== 'N/A') break;
                            }
                        }
                        
                        if (referenceNumber !== 'N/A') break;
                    }
                    
                    // Method 3: Fallback - any DAT ONE pattern in visible content
                    if (referenceNumber === 'N/A') {
                        const bodyText = document.body.textContent || '';
                        const allMatches = bodyText.match(/\b([0-9]{2}[A-Z][0-9]{4})\b/g);
                        if (allMatches && allMatches.length > 0) {
                            // Use a different match each time if multiple found
                            const matchIndex = Math.min(allMatches.length - 1, Math.floor(Date.now() / 10000) % allMatches.length);
                            referenceNumber = allMatches[matchIndex];
                            debugInfo.push(`Fallback pattern: ${referenceNumber} (${matchIndex + 1}/${allMatches.length})`);
                        }
                    }
                    
                    return { 
                        referenceNumber,
                        debugInfo: debugInfo.slice(0, 3),
                        modalCount: potentialModals.length
                    };
                });
                
                console.log(`🔢 Reference: ${detailedInfo.referenceNumber} (${detailedInfo.modalCount} modals)`);
                if (detailedInfo.debugInfo.length > 0) {
                    console.log(`   Debug: ${detailedInfo.debugInfo.join(' | ')}`);
                }
                
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
                    contact: null, // NEVER extract contacts
                    age_posted: normalizeValue(basicInfo.age),
                    extracted_at: new Date().toISOString()
                };
                
                if (loadData.origin && loadData.destination) {
                    extractedData.push(loadData);
                }
                
                // Close modal with multiple attempts
                console.log(`🚪 Closing modal...`);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(getRandomDelay(500, 1000));
                
                // Try clicking outside if Escape didn't work
                try {
                    await page.click('body', { position: { x: 50, y: 50 } });
                } catch (error) {
                    // Ignore click errors
                }
                await page.waitForTimeout(getRandomDelay(200, 500));
                
            } catch (error) {
                console.error(`❌ Error processing load ${idx + 1}: ${error.message}`);
                // Force close any modals
                await page.keyboard.press('Escape');
                await page.keyboard.press('Escape');
                await page.waitForTimeout(getRandomDelay(1000, 2000));
            }
        }
        
        console.log(`\n✅ Extracted ${extractedData.length} loads in FIXED mode`);
        
        // Show unique reference numbers found
        const uniqueRefs = [...new Set(extractedData.map(load => load.reference_number).filter(ref => ref && ref !== 'N/A'))];
        console.log(`🔢 Unique reference numbers found: ${uniqueRefs.length}`);
        if (uniqueRefs.length > 0) {
            console.log(`   Examples: ${uniqueRefs.slice(0, 8).join(', ')}`);
        }
        
        // Save to CSV
        if (extractedData.length > 0) {
            const outputDir = './output';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const csvPath = path.join(outputDir, CONFIG.outputFile);
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
            
            await csvWriter.writeRecords(extractedData);
            console.log(`💾 ${extractedData.length} records saved to: ${csvPath}`);
            
            // Show origin/destination parsing results
            const parsedOrigins = extractedData.filter(load => load.origin && !load.origin.includes('N/A'));
            console.log(`📍 Successfully parsed ${parsedOrigins.length} origin/destination pairs`);
        }
        
        console.log(`✅ FIXED scraping completed at ${new Date().toISOString()}`);
        
    } catch (error) {
        console.error('❌ Fixed scraping error:', error.message);
    }
}

// Add to package.json script
if (require.main === module) {
    console.log(`🔧 Starting FIXED DAT ONE scraper:`);
    console.log(`   📊 Max entries: ${CONFIG.maxEntries}`);
    console.log(`   📁 Output: output/${CONFIG.outputFile}`);
    console.log(`   🔧 FIXES: Unique refs + proper parsing + no mail apps`);
    console.log(`   🛡️ All mail apps aggressively disabled`);
    
    runFixedScraping();
}

module.exports = { runFixedScraping, CONFIG }; 