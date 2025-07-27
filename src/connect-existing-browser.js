const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const axios = require('axios');
require('dotenv').config();

// Helper function to generate random delays like a human
function getRandomDelay(min = 500, max = 2000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper function to simulate human-like mouse movement
async function humanLikeMouseMove(page) {
    const viewport = await page.viewportSize();
    if (!viewport) {
        // Fallback if viewport is not available
        await page.mouse.move(400, 300, { 
            steps: Math.floor(Math.random() * 10) + 5 
        });
        return;
    }
    
    const x = Math.floor(Math.random() * viewport.width);
    const y = Math.floor(Math.random() * viewport.height);
    
    await page.mouse.move(x, y, { 
        steps: Math.floor(Math.random() * 10) + 5 // Random number of steps
    });
}

// Helper function to occasionally scroll like a human
async function occasionalScroll(page) {
    if (Math.random() < 0.3) { // 30% chance to scroll
        const scrollDistance = Math.floor(Math.random() * 300) + 100;
        const direction = Math.random() < 0.5 ? 1 : -1;
        
        await page.mouse.wheel(0, scrollDistance * direction);
        await page.waitForTimeout(getRandomDelay(200, 800));
    }
}

// Helper function to simulate reading time
function getReadingDelay(textLength = 100) {
    // Simulate reading at ~200 words per minute
    const wordsPerMinute = 200;
    const averageWordLength = 5;
    const words = textLength / averageWordLength;
    const readingTimeMs = (words / wordsPerMinute) * 60 * 1000;
    
    // Add some randomness and minimum time
    return Math.max(getRandomDelay(800, 1500), readingTimeMs * (0.5 + Math.random()));
}

// Google Maps API integration
async function calculateDistanceAndETA(origin, destination) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
        console.log('⚠️ Google Maps API key not found, skipping distance calculation');
        return { distance: null, eta: null, error: 'API key missing' };
    }
    
    if (!origin || !destination) {
        return { distance: null, eta: null, error: 'Missing origin or destination' };
    }
    
    try {
        console.log(`🗺️ Calculating distance: ${origin} → ${destination}`);
        
        const url = 'https://maps.googleapis.com/maps/api/distancematrix/json';
        const params = {
            origins: origin,
            destinations: destination,
            units: 'imperial', // Use miles
            mode: 'driving',
            avoid: 'tolls', // Trucking typically avoids tolls when possible
            key: apiKey
        };
        
        const response = await axios.get(url, { params });
        
        if (response.data.status === 'OK' && response.data.rows[0].elements[0].status === 'OK') {
            const element = response.data.rows[0].elements[0];
            const distanceText = element.distance.text;
            const durationText = element.duration.text;
            const distanceMiles = Math.round(element.distance.value * 0.000621371); // Convert meters to miles
            
            // For trucking, add extra time for loading/unloading and breaks
            const baseDurationHours = element.duration.value / 3600; // Convert seconds to hours
            const truckingDurationHours = baseDurationHours * 1.2 + 2; // 20% longer + 2 hours for stops
            
            const eta = formatDuration(truckingDurationHours);
            
            console.log(`   📏 Distance: ${distanceMiles} miles`);
            console.log(`   ⏰ Estimated trucking time: ${eta}`);
            
            return {
                distance: `${distanceMiles} miles`,
                eta: eta,
                distanceMiles: distanceMiles,
                error: null
            };
        } else {
            const error = response.data.rows[0]?.elements[0]?.status || response.data.status;
            console.log(`   ❌ Distance calculation failed: ${error}`);
            return { distance: null, eta: null, error: error };
        }
    } catch (error) {
        console.log(`   ❌ Distance API error: ${error.message}`);
        return { distance: null, eta: null, error: error.message };
    }
}

// Helper function to format duration in human-readable format
function formatDuration(hours) {
    if (hours < 1) {
        return `${Math.round(hours * 60)} minutes`;
    } else if (hours < 24) {
        const wholeHours = Math.floor(hours);
        const minutes = Math.round((hours - wholeHours) * 60);
        return minutes > 0 ? `${wholeHours}h ${minutes}m` : `${wholeHours}h`;
    } else {
        const days = Math.floor(hours / 24);
        const remainingHours = Math.round(hours % 24);
        return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
}

// Rate limiting for API calls
let lastApiCall = 0;
const API_RATE_LIMIT = 100; // Minimum ms between API calls

async function rateLimitedDistanceCalculation(origin, destination) {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;
    
    if (timeSinceLastCall < API_RATE_LIMIT) {
        await new Promise(resolve => setTimeout(resolve, API_RATE_LIMIT - timeSinceLastCall));
    }
    
    lastApiCall = Date.now();
    return await calculateDistanceAndETA(origin, destination);
}

// Data cleaning and normalization functions
function normalizeValue(value) {
    // Convert various empty/null representations to null
    if (!value || value === '–' || value === '-' || value === '' || value.trim() === '' || value === 'N/A') {
        return null;
    }
    return value.trim();
}

function parseRate(rateText) {
    if (!rateText || rateText === '–' || rateText === '-') {
        return { totalRate: null, ratePerMile: null };
    }
    
    // Handle combined rates like "$2,700$2.17*/mi"
    const combinedRatePattern = /\$?([\d,]+)\$?([\d.]+)\*?\/mi/;
    const combinedMatch = rateText.match(combinedRatePattern);
    
    if (combinedMatch) {
        return {
            totalRate: `$${combinedMatch[1]}`,
            ratePerMile: `$${combinedMatch[2]}/mi`
        };
    }
    
    // Handle total rate only like "$2,700"
    const totalRatePattern = /\$?([\d,]+)$/;
    const totalMatch = rateText.match(totalRatePattern);
    
    if (totalMatch) {
        return {
            totalRate: `$${totalMatch[1]}`,
            ratePerMile: null
        };
    }
    
    // Handle per mile rate only like "$2.17/mi"
    const perMilePattern = /\$?([\d.]+)\*?\/mi/;
    const perMileMatch = rateText.match(perMilePattern);
    
    if (perMileMatch) {
        return {
            totalRate: null,
            ratePerMile: `$${perMileMatch[1]}/mi`
        };
    }
    
    // If no pattern matches, return as is
    return {
        totalRate: rateText,
        ratePerMile: null
    };
}

function parseOriginDestination(originText, destinationText) {
    // Handle concatenated origins like "San Leandro, CALoveland, CO"
    // This happens when origin and destination get merged
    
    if (!originText) return { origin: null, destination: destinationText };
    if (!destinationText) return { origin: originText, destination: null };
    
    // Check if origin contains concatenated destination
    const concatenatedPattern = /^(.+?),\s*([A-Z]{2})([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})$/;
    const match = originText.match(concatenatedPattern);
    
    if (match) {
        // Split the concatenated string
        const [, city1, state1, city2, state2] = match;
        return {
            origin: `${city1}, ${state1}`,
            destination: `${city2}, ${state2}`
        };
    }
    
    // Check for other common concatenation patterns
    const simplePattern = /^(.+?),\s*([A-Z]{2})(.+?),\s*([A-Z]{2})$/;
    const simpleMatch = originText.match(simplePattern);
    
    if (simpleMatch && destinationText && destinationText.includes(',')) {
        const [, city1, state1, city2, state2] = simpleMatch;
        return {
            origin: `${city1}, ${state1}`,
            destination: `${city2}, ${state2}`
        };
    }
    
    // If no concatenation detected, return as is but normalized
    return {
        origin: normalizeValue(originText),
        destination: normalizeValue(destinationText)
    };
}

function parsePhoneNumber(phoneText) {
    if (!phoneText) return null;
    
    // Extract phone number and extension if present
    const phonePattern = /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})(?:\s*x?(\d+))?/;
    const match = phoneText.match(phonePattern);
    
    if (match) {
        const [, phone, extension] = match;
        return extension ? `${phone} x${extension}` : phone;
    }
    
    return phoneText;
}

function parseWeight(weightText) {
    if (!weightText) return null;
    
    // Extract numeric weight and unit
    const weightPattern = /(\d+(?:,\d+)?)\s*(k|lbs|pounds?)?/i;
    const match = weightText.match(weightPattern);
    
    if (match) {
        const [, number, unit] = match;
        const cleanNumber = number.replace(',', '');
        
        if (unit && unit.toLowerCase().startsWith('k')) {
            return `${cleanNumber}k lbs`;
        } else {
            return `${cleanNumber} lbs`;
        }
    }
    
    return weightText;
}

function parseEquipmentLength(lengthText) {
    if (!lengthText) return null;
    
    // Extract numeric length
    const lengthPattern = /(\d+)\s*ft/i;
    const match = lengthText.match(lengthPattern);
    
    if (match) {
        return `${match[1]} ft`;
    }
    
    return lengthText;
}

async function connectToExistingBrowser() {
    console.log('🔗 Connecting to existing Chrome browser...');
console.log('💡 Note: Email addresses in logs use [at] to prevent triggering email clients');
    
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
                
                // Human-like pause after navigation
                await page.waitForTimeout(getRandomDelay(2000, 4000));
            } catch (error) {
                console.log('⚠️ Navigation failed, but continuing with current page...');
            }
        }
        
        // Wait for load results to appear
        console.log('⏳ Waiting for load results...');
        await page.waitForSelector('[data-test="load-origin-cell"]', { timeout: 30000 });
        
        // Human-like scanning behavior - move mouse around a bit
        for (let i = 0; i < 3; i++) {
            await humanLikeMouseMove(page);
            await page.waitForTimeout(getRandomDelay(300, 800));
        }
        
        // Occasional scroll to "scan" the page
        await occasionalScroll(page);
        
        // Get all load rows using the correct selector from debug output
        const loadRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
        console.log(`📋 Found ${loadRows.length} load rows`);
        
        if (loadRows.length === 0) {
            // Fallback to a more generic selector
            const fallbackRows = await page.$$('.row-container');
            console.log(`📋 Using fallback selector, found ${fallbackRows.length} rows`);
            
            if (fallbackRows.length === 0) {
                throw new Error('No load rows found with any selector');
            }
            
            // Use fallback rows
            loadRows.push(...fallbackRows);
        }
        
        const extractedData = [];
        
        // Add some randomness to processing order (sometimes skip around)
        const indices = Array.from({length: loadRows.length}, (_, i) => i);
        if (Math.random() < 0.3) { // 30% chance to shuffle order slightly
            for (let i = indices.length - 1; i > 0; i--) {
                if (Math.random() < 0.1) { // Only shuffle 10% of items
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }
            }
        }
        
        for (let idx = 0; idx < indices.length; idx++) {
            const i = indices[idx];
            
            try {
                console.log(`\n🔍 Processing load ${idx + 1}/${loadRows.length}...`);
                
                // Occasional human-like pauses (like reading other loads)
                if (Math.random() < 0.15) { // 15% chance
                    console.log('   ⏸️  Taking a moment to scan other loads...');
                    await humanLikeMouseMove(page);
                    await page.waitForTimeout(getRandomDelay(2000, 5000));
                }
                
                // Get fresh reference to the row (in case page has changed)
                let currentRows = await page.$$('.row-container.ng-tns-c510-8.ng-star-inserted');
                if (currentRows.length === 0) {
                    currentRows = await page.$$('.row-container');
                }
                
                if (i >= currentRows.length) {
                    console.log('⚠️ Row no longer exists, skipping...');
                    continue;
                }
                
                const row = currentRows[i];
                
                // Human-like hover before clicking
                await row.hover();
                await page.waitForTimeout(getRandomDelay(200, 600));
                
                // Extract basic info AND company info from the specific row
                const basicInfo = await row.evaluate(el => {
                    const ageElement = el.querySelector('[data-test="load-age-cell"]');
                    const rateElement = el.querySelector('[data-test="load-rate-cell"]');
                    const originElement = el.querySelector('[data-test="load-origin-cell"]');
                    const destinationElement = el.querySelector('[data-test="load-destination-cell"]');
                    
                    // Look for company information within this specific row
                    const companyCell = el.querySelector('.cell-company');
                    let companyName = 'N/A';
                    let contactInfo = 'N/A';
                    
                    if (companyCell) {
                        // Extract company name
                        const companyElement = companyCell.querySelector('.company-prefer-or-blocked');
                        if (companyElement) {
                            companyName = companyElement.textContent.trim();
                        }
                        
                        // Extract contact information (phone or email) from the same cell
                        const contactElement = companyCell.querySelector('.contact-state');
                        if (contactElement) {
                            const contactText = contactElement.textContent.trim();
                            
                            // First check if it's a phone number
                            if (contactText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)) {
                                contactInfo = contactText;
                            }
                            // If not a phone number, check if it's an email
                            else if (contactText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
                                contactInfo = contactText;
                            }
                            // If it's neither phone nor email but has content, still capture it
                            else if (contactText && contactText.length > 0 && contactText !== 'N/A') {
                                contactInfo = contactText;
                            }
                        }
                    }
                    
                    // Parse equipment info from info-container
                    const infoContainer = el.querySelector('.info-container');
                    let equipmentType = 'N/A', weight = 'N/A', length = 'N/A', loadType = 'N/A';
                    
                    if (infoContainer) {
                        const text = infoContainer.textContent;
                        const parts = text.split('|').map(p => p.trim());
                        
                        for (const part of parts) {
                            if (part.includes('lbs')) {
                                weight = part;
                            } else if (part.includes('ft')) {
                                length = part;
                            } else if (part === 'Full' || part === 'Partial') {
                                loadType = part;
                            } else if (part.match(/^[A-Z]+$/)) {
                                equipmentType = part;
                            }
                        }
                    }
                    
                    return {
                        age: ageElement ? ageElement.textContent.trim() : 'N/A',
                        rate: rateElement ? rateElement.textContent.trim() : 'N/A',
                        origin: originElement ? originElement.textContent.trim() : 'N/A',
                        destination: destinationElement ? destinationElement.textContent.trim() : 'N/A',
                        company: companyName,
                        contactInfo: contactInfo,
                        equipmentType,
                        weight,
                        length,
                        loadType
                    };
                });
                
                // Clean and normalize the extracted data
                const cleanedOriginDest = parseOriginDestination(basicInfo.origin, basicInfo.destination);
                const cleanedRate = parseRate(basicInfo.rate);
                const cleanedWeight = parseWeight(basicInfo.weight);
                const cleanedLength = parseEquipmentLength(basicInfo.length);
                const cleanedContact = normalizeValue(basicInfo.contactInfo);
                
                console.log(`📍 ${cleanedOriginDest.origin} → ${cleanedOriginDest.destination} (${normalizeValue(basicInfo.company)})`);
                // Log contact info safely (avoid triggering email clients)
                const safeContact = cleanedContact && cleanedContact.includes('@') 
                    ? cleanedContact.replace('@', ' [at] ') 
                    : cleanedContact;
                console.log(`📞 Contact: ${safeContact}`);
                if (cleanedRate.totalRate || cleanedRate.ratePerMile) {
                    console.log(`💰 Rate: ${cleanedRate.totalRate || 'N/A'} | Per Mile: ${cleanedRate.ratePerMile || 'N/A'}`);
                }
                
                // Simulate reading the load details
                const textLength = ((cleanedOriginDest.origin || '') + (cleanedOriginDest.destination || '') + (basicInfo.company || '')).length;
                await page.waitForTimeout(getReadingDelay(textLength));
                
                // Click on the row to get additional details if needed
                await row.click();
                
                // Human-like wait time for details to load
                await page.waitForTimeout(getRandomDelay(1500, 3000));
                
                // Extract additional detailed information from the opened modal/panel
                const detailedInfo = await page.evaluate(() => {
                    // Extract other detailed info from modal
                    const pickupDate = document.querySelector('[data-test*="pickup"], .pickup-date, .pickup')?.textContent?.trim() || 'N/A';
                    const deliveryDate = document.querySelector('[data-test*="delivery"], .delivery-date, .delivery')?.textContent?.trim() || 'N/A';
                    const loadRequirements = document.querySelector('.requirements, .load-requirements, [class*="requirement"]')?.textContent?.trim() || 'N/A';
                    const tripDistance = document.querySelector('[data-test*="distance"], .distance, .miles')?.textContent?.trim() || 'N/A';
                    
                    return {
                        pickupDate,
                        deliveryDate,
                        loadRequirements,
                        tripDistance
                    };
                });
                
                // Calculate distance and ETA if trip distance is missing
                let calculatedDistance = null;
                let estimatedETA = null;
                let finalTripDistance = normalizeValue(detailedInfo.tripDistance) || cleanedLength;
                
                if (!finalTripDistance && cleanedOriginDest.origin && cleanedOriginDest.destination) {
                    console.log('   🔄 Trip distance missing, calculating via Google Maps...');
                    const distanceResult = await rateLimitedDistanceCalculation(
                        cleanedOriginDest.origin, 
                        cleanedOriginDest.destination
                    );
                    
                    if (distanceResult.distance) {
                        calculatedDistance = distanceResult.distance;
                        estimatedETA = distanceResult.eta;
                        finalTripDistance = calculatedDistance;
                        console.log(`   ✅ Calculated: ${calculatedDistance}, ETA: ${estimatedETA}`);
                    }
                }
                
                // Convert rates to numeric values
                let rateTotal = null;
                let ratePerMileNumeric = null;
                
                if (cleanedRate.totalRate) {
                    // Extract numeric value from "$2,700" format
                    const totalMatch = cleanedRate.totalRate.match(/\$?([\d,]+)/);
                    if (totalMatch) {
                        rateTotal = parseInt(totalMatch[1].replace(/,/g, ''));
                    }
                }
                
                if (cleanedRate.ratePerMile) {
                    // Extract numeric value from "$2.17/mi" format
                    const perMileMatch = cleanedRate.ratePerMile.match(/\$?([\d.]+)/);
                    if (perMileMatch) {
                        ratePerMileNumeric = parseFloat(perMileMatch[1]);
                    }
                }
                
                // Create data in the specified format
                const loadData = {
                    origin: cleanedOriginDest.origin,
                    destination: cleanedOriginDest.destination,
                    rate_total_usd: rateTotal,
                    rate_per_mile: ratePerMileNumeric,
                    company: normalizeValue(basicInfo.company),
                    contact: cleanedContact,
                    age_posted: normalizeValue(basicInfo.age),
                    extracted_at: new Date().toISOString()
                };
                
                // Only add if we have meaningful data
                if (loadData.origin && loadData.destination) {
                    extractedData.push(loadData);
                }
                
                // Human-like closing behavior - sometimes use Escape, sometimes click close
                const closeMethod = Math.random();
                if (closeMethod < 0.7) {
                    // Use Escape key most of the time
                    await page.keyboard.press('Escape');
                } else {
                    // Sometimes try to find and click close button
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
                
                // Variable wait time after closing
                await page.waitForTimeout(getRandomDelay(400, 1200));
                
                // Occasional human behaviors
                if (Math.random() < 0.2) { // 20% chance
                    await humanLikeMouseMove(page);
                }
                
                if (Math.random() < 0.1) { // 10% chance to scroll
                    await occasionalScroll(page);
                }
                
                // Longer pause every few loads (like taking a break)
                if ((idx + 1) % 10 === 0 && Math.random() < 0.4) {
                    console.log('   ☕ Taking a short break...');
                    await page.waitForTimeout(getRandomDelay(3000, 8000));
                }
                
            } catch (error) {
                console.error(`❌ Error processing load ${idx + 1}:`, error.message);
                // Try to close any open modal and continue
                await page.keyboard.press('Escape');
                await page.waitForTimeout(getRandomDelay(1000, 2000));
            }
        }
        
        console.log(`\n✅ Extracted ${extractedData.length} loads with detailed information`);
        
        // Save to CSV
        if (extractedData.length > 0) {
            const outputDir = './output';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const csvFilename = `dat_one_loads_cleaned_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
            const csvPath = path.join(outputDir, csvFilename);
            
            const csvWriter = createCsvWriter({
                path: csvPath,
                header: [
                    { id: 'origin', title: 'origin' },
                    { id: 'destination', title: 'destination' },
                    { id: 'rate_total_usd', title: 'rate_total_usd' },
                    { id: 'rate_per_mile', title: 'rate_per_mile' },
                    { id: 'company', title: 'company' },
                    { id: 'contact', title: 'contact' },
                    { id: 'age_posted', title: 'age_posted' },
                    { id: 'extracted_at', title: 'extracted_at' }
                ]
            });
            
            await csvWriter.writeRecords(extractedData);
            console.log(`💾 Data saved to: ${csvPath}`);
            
            // Print summary
            const contactCount = extractedData.filter(load => load.contact).length;
            console.log(`📊 Summary: ${extractedData.length} loads extracted, ${contactCount} with contact information`);
            
            // Show unique contact information found
            const uniqueContacts = [...new Set(extractedData.map(load => load.contact).filter(contact => contact))];
            console.log(`📱 Unique contact information found: ${uniqueContacts.length}`);
            
            // Separate phone numbers and emails
            const phoneNumbers = uniqueContacts.filter(contact => contact.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/));
            const emails = uniqueContacts.filter(contact => contact.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/));
            const others = uniqueContacts.filter(contact => 
                !contact.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/) && 
                !contact.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
            );
            
            if (phoneNumbers.length > 0) {
                console.log(`📞 Phone numbers (${phoneNumbers.length}):`);
                phoneNumbers.forEach(phone => console.log(`   ${phone}`));
            }
            
            if (emails.length > 0) {
                console.log(`📧 Email addresses (${emails.length}):`);
                emails.forEach(email => console.log(`   ${email.replace('@', ' [at] ')}`));
            }
            
            if (others.length > 0) {
                console.log(`📋 Other contact info (${others.length}):`);
                others.forEach(other => console.log(`   ${other}`));
            }
            
            // Show unique companies found
            const uniqueCompanies = [...new Set(extractedData.map(load => load.company).filter(company => company))];
            console.log(`🏢 Unique companies found: ${uniqueCompanies.length}`);
            uniqueCompanies.forEach(company => console.log(`   ${company}`));
            
            // Show rate statistics
            const ratesWithTotal = extractedData.filter(load => load.rate_total_usd).length;
            const ratesWithPerMile = extractedData.filter(load => load.rate_per_mile).length;
            console.log(`💰 Rate information: ${ratesWithTotal} with total rates, ${ratesWithPerMile} with per-mile rates`);
            
            // Show rate value ranges
            if (ratesWithTotal > 0) {
                const totalRates = extractedData.filter(load => load.rate_total_usd).map(load => load.rate_total_usd);
                const minTotal = Math.min(...totalRates);
                const maxTotal = Math.max(...totalRates);
                const avgTotal = Math.round(totalRates.reduce((a, b) => a + b, 0) / totalRates.length);
                console.log(`   💵 Total rates: $${minTotal.toLocaleString()} - $${maxTotal.toLocaleString()} (avg: $${avgTotal.toLocaleString()})`);
            }
            
            if (ratesWithPerMile > 0) {
                const perMileRates = extractedData.filter(load => load.rate_per_mile).map(load => load.rate_per_mile);
                const minPerMile = Math.min(...perMileRates).toFixed(2);
                const maxPerMile = Math.max(...perMileRates).toFixed(2);
                const avgPerMile = (perMileRates.reduce((a, b) => a + b, 0) / perMileRates.length).toFixed(2);
                console.log(`   📏 Per-mile rates: $${minPerMile} - $${maxPerMile} (avg: $${avgPerMile})`);
            }
        }
        
        console.log('✅ Extraction completed!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the extraction
connectToExistingBrowser(); 