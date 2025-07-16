const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Simple script to extract data from page content
console.log('📋 DAT One Load Data Extractor');
console.log('===============================');
console.log();
console.log('INSTRUCTIONS:');
console.log('1. Go to your DAT One search results page');
console.log('2. Right-click on the page and select "View Page Source" or press Ctrl+U (Cmd+U on Mac)');
console.log('3. Copy ALL the page source code');
console.log('4. Save it to a file called "page-source.html" in this project directory');
console.log('5. Run this script again');
console.log();

const pageSourceFile = 'page-source.html';

if (!fs.existsSync(pageSourceFile)) {
    console.log('❌ page-source.html not found.');
    console.log('Please save the page source from your DAT One results page as "page-source.html"');
    process.exit(1);
}

console.log('✅ Found page-source.html, extracting load data...');

const pageContent = fs.readFileSync(pageSourceFile, 'utf8');
const loads = [];

// Extract load data using regex patterns based on the HTML structure
const loadPattern = /Marysville,CA|Sacramento,CA|Linda,CA|Windsor,CA|Healdsburg,CA|Ukiah,CA|Sparks,NV/g;

// Look for table rows with load data
const tableRowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/g;
const tableRows = pageContent.match(tableRowPattern) || [];

console.log(`🔍 Found ${tableRows.length} table rows to analyze`);

for (let i = 0; i < tableRows.length; i++) {
    const row = tableRows[i];
    
    // Check if this row contains load data
    if (row.includes('$') && (row.includes('lbs') || row.includes('ft')) && row.includes('Full')) {
        try {
            const loadData = extractLoadFromRow(row);
            if (loadData) {
                loads.push(loadData);
                console.log(`✅ Extracted: ${loadData.origin} → ${loadData.destination} | ${loadData.rate} | ${loadData.company}`);
            }
        } catch (error) {
            console.warn(`⚠️ Failed to extract from row ${i + 1}:`, error.message);
        }
    }
}

function extractLoadFromRow(rowHtml) {
    // Remove HTML tags and get plain text
    const text = rowHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    const loadData = {};
    
    // Extract origin and destination
    const cities = text.match(/([A-Za-z\s]+,\s*[A-Z]{2})/g);
    if (cities && cities.length >= 2) {
        loadData.origin = cities[0].trim();
        loadData.destination = cities[1].trim();
    }
    
    // Extract rate
    const rateMatch = text.match(/\$\s*(\d+)/);
    loadData.rate = rateMatch ? `$${rateMatch[1]}` : 'N/A';
    
    // Extract weight
    const weightMatch = text.match(/(\d+k?\s*lbs)/);
    loadData.weight = weightMatch ? weightMatch[1] : 'N/A';
    
    // Extract equipment type
    const equipmentMatch = text.match(/\b([VFR])\b/);
    loadData.equipmentType = equipmentMatch ? equipmentMatch[1] : 'N/A';
    
    // Extract length
    const lengthMatch = text.match(/(\d+\s*ft)/);
    loadData.tripDistance = lengthMatch ? lengthMatch[1] : 'N/A';
    
    // Extract load type
    const loadTypeMatch = text.match(/(Full|Partial)/);
    loadData.loadType = loadTypeMatch ? loadTypeMatch[1] : 'N/A';
    
    // Extract age
    const ageMatch = text.match(/(\d+[hm])/);
    loadData.agePosted = ageMatch ? ageMatch[1] : 'N/A';
    
    // Extract company name
    const companyMatch = text.match(/([A-Za-z\s]+LLC|[A-Za-z\s]+Inc|[A-Za-z\s]+Corp)/);
    loadData.company = companyMatch ? companyMatch[1].trim() : 'N/A';
    
    // Set default values
    loadData.contactInfo = 'N/A';
    loadData.loadRequirements = 'N/A';
    loadData.pickupDate = 'N/A';
    loadData.deliveryDate = 'N/A';
    loadData.extractedAt = new Date().toISOString();
    
    // Only return if we have meaningful data
    if (loadData.origin && loadData.destination && loadData.rate !== 'N/A') {
        return loadData;
    }
    
    return null;
}

// Save to CSV
if (loads.length > 0) {
    console.log(`\n💾 Saving ${loads.length} loads to CSV...`);
    
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const csvWriter = createCsvWriter({
        path: path.join(outputDir, 'dat_one_freight_data.csv'),
        header: [
            { id: 'origin', title: 'Origin' },
            { id: 'destination', title: 'Destination' },
            { id: 'equipmentType', title: 'Equipment Type' },
            { id: 'weight', title: 'Weight' },
            { id: 'rate', title: 'Rate' },
            { id: 'tripDistance', title: 'Trip Distance' },
            { id: 'company', title: 'Company' },
            { id: 'contactInfo', title: 'Contact Info' },
            { id: 'loadRequirements', title: 'Load Requirements' },
            { id: 'pickupDate', title: 'Pickup Date' },
            { id: 'deliveryDate', title: 'Delivery Date' },
            { id: 'loadType', title: 'Load Type' },
            { id: 'agePosted', title: 'Age Posted' },
            { id: 'extractedAt', title: 'Extracted At' }
        ]
    });
    
    csvWriter.writeRecords(loads).then(() => {
        console.log('✅ Data saved to output/dat_one_freight_data.csv');
        
        console.log('\n📊 EXTRACTION SUMMARY:');
        console.log('='.repeat(50));
        console.log(`Total loads extracted: ${loads.length}`);
        
        loads.forEach((load, index) => {
            console.log(`${index + 1}. ${load.origin} → ${load.destination}`);
            console.log(`   Rate: ${load.rate} | Company: ${load.company}`);
            console.log(`   Equipment: ${load.equipmentType} | Weight: ${load.weight} | Type: ${load.loadType}`);
            console.log(`   Age: ${load.agePosted}`);
            console.log('');
        });
        
        console.log('='.repeat(50));
    });
} else {
    console.log('❌ No load data found in the page source.');
    console.log('Please make sure you saved the page source from the DAT One search results page.');
} 