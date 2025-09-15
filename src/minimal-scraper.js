const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
require('dotenv').config();

// MINIMAL: Only basic load info, no contacts
const CONFIG = {
    intervalMinutes: 5,    
    maxEntries: 30,        
    outputFile: 'dat_one_loads_minimal.csv',
    statsFile: 'scraper_stats_minimal.json',
    runImmediately: true,  
    enablePagination: false // Disabled for faster testing
};

// Kill mail apps before starting
try {
    const { exec } = require('child_process');
    exec('pkill -f Mail 2>/dev/null || true', () => {});
    exec('pkill -f mail 2>/dev/null || true', () => {});
    exec('pkill -f thunderbird 2>/dev/null || true', () => {});
    exec('pkill -f FaceTime 2>/dev/null || true', () => {});
} catch (error) {}

// Helper functions
function getRandomDelay(min = 500, max = 2000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanLikeMouseMove(page) {
    const viewport = await page.viewportSize();
    if (!viewport) {
        await page.mouse.move(400, 300, { steps: 5 });
        return;
    }
    
    const x = Math.floor(Math.random() * viewport.width);
    const y = Math.floor(Math.random() * viewport.height);
    await page.mouse.move(x, y, { steps: 5 });
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
    
    return { totalRate: rateText, ratePerMile: null };
}

async function runMinimalScraping() {
    const timestamp = new Date().toISOString();
    console.log(`\n🚀 Starting MINIMAL scraping run at ${timestamp}`);
    console.log(`📊 Target: ${CONFIG.maxEntries} entries (BASIC INFO ONLY)`);
    console.log('🔧 MINIMAL MODE: Origin, Destination, Rate, Company only - NO CONTACTS');
    
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
        console.log(`📋 Processing ${loadRows.length} loads (MINIMAL mode - no contacts)`);
        
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
                
                // Extract ONLY basic info from the row (no contacts)
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
                        // NO contact info extracted at all
                    };
                });
                
                const cleanedRate = parseRate(basicInfo.rate);
                
                console.log(`📍 ${basicInfo.origin} → ${basicInfo.destination}`);
                console.log(`🏢 ${basicInfo.company}`);
                console.log(`💰 ${cleanedRate.totalRate || 'N/A'}`);
                
                // Click to get reference number for THIS specific load
                await row.click();
                await page.waitForTimeout(getRandomDelay(1500, 3000));
                
                // Get reference number from the OPENED modal for this specific load
                const detailedInfo = await page.evaluate(() => {
                    let referenceNumber = 'N/A';
                    
                    // Look for Reference ID in the currently visible modal/dialog
                    const modals = document.querySelectorAll('[role="dialog"], .modal, .dialog, [class*="modal"], [class*="dialog"]');
                    
                    for (const modal of modals) {
                        const style = window.getComputedStyle(modal);
                        if (style.display !== 'none' && style.visibility !== 'hidden') {
                            const modalText = modal.textContent || '';
                            
                            // Look for "Reference ID" followed by the pattern
                            const refMatch = modalText.match(/Reference\s*ID\s*([0-9]{2}[A-Z][0-9]{4})/i);
                            if (refMatch) {
                                referenceNumber = refMatch[1];
                                break;
                            }
                            
                            // Fallback: any DAT pattern in visible modal
                            const patternMatch = modalText.match(/\b([0-9]{2}[A-Z][0-9]{4})\b/);
                            if (patternMatch) {
                                referenceNumber = patternMatch[1];
                                break;
                            }
                        }
                    }
                    
                    // If no modal found, look in the entire visible page
                    if (referenceNumber === 'N/A') {
                        const allText = document.body.textContent || '';
                        const visibleElements = Array.from(document.querySelectorAll('*')).filter(el => {
                            const style = window.getComputedStyle(el);
                            return style.display !== 'none' && style.visibility !== 'hidden' && 
                                   el.offsetWidth > 0 && el.offsetHeight > 0;
                        });
                        
                        for (const element of visibleElements) {
                            const text = element.textContent || '';
                            if (text.includes('Reference') && text.match(/\b([0-9]{2}[A-Z][0-9]{4})\b/)) {
                                const match = text.match(/\b([0-9]{2}[A-Z][0-9]{4})\b/);
                                if (match) {
                                    referenceNumber = match[1];
                                    break;
                                }
                            }
                        }
                    }
                    
                    return { 
                        referenceNumber,
                        modalCount: modals.length,
                        visibleModals: Array.from(modals).filter(m => {
                            const style = window.getComputedStyle(m);
                            return style.display !== 'none' && style.visibility !== 'hidden';
                        }).length
                    };
                });
                
                console.log(`🔢 Reference: ${detailedInfo.referenceNumber} (${detailedInfo.visibleModals}/${detailedInfo.modalCount} modals)`);
                
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
                    origin: normalizeValue(basicInfo.origin),
                    destination: normalizeValue(basicInfo.destination),
                    rate_total_usd: rateTotal,
                    rate_per_mile: ratePerMileNumeric,
                    company: normalizeValue(basicInfo.company),
                    contact: null, // ALWAYS NULL - never extract contacts
                    age_posted: normalizeValue(basicInfo.age),
                    extracted_at: new Date().toISOString()
                };
                
                if (loadData.origin && loadData.destination) {
                    extractedData.push(loadData);
                }
                
                // Close modal
                await page.keyboard.press('Escape');
                await page.waitForTimeout(getRandomDelay(400, 1200));
                
            } catch (error) {
                console.error(`❌ Error processing load ${idx + 1}: ${error.message}`);
                await page.keyboard.press('Escape');
                await page.waitForTimeout(getRandomDelay(1000, 2000));
            }
        }
        
        console.log(`\n✅ Extracted ${extractedData.length} loads in MINIMAL mode`);
        
        // Show unique reference numbers found
        const uniqueRefs = [...new Set(extractedData.map(load => load.reference_number).filter(ref => ref && ref !== 'N/A'))];
        console.log(`🔢 Unique reference numbers found: ${uniqueRefs.length}`);
        if (uniqueRefs.length > 0) {
            console.log(`   Examples: ${uniqueRefs.slice(0, 5).join(', ')}`);
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
        }
        
        console.log(`✅ MINIMAL scraping completed at ${new Date().toISOString()}`);
        
    } catch (error) {
        console.error('❌ Minimal scraping error:', error.message);
    }
}

// Start the minimal scraper
if (require.main === module) {
    console.log(`🔧 Starting MINIMAL DAT ONE scraper:`);
    console.log(`   📊 Max entries: ${CONFIG.maxEntries}`);
    console.log(`   📁 Output: output/${CONFIG.outputFile}`);
    console.log(`   🔧 MINIMAL MODE: Basic info only, NO contact extraction`);
    console.log(`   🛡️ Mail apps killed proactively`);
    
    runMinimalScraping();
}

module.exports = { runMinimalScraping, CONFIG }; 