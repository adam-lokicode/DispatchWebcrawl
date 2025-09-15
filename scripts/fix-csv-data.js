#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

async function fixCSVData() {
    console.log('🔧 Fixing CSV data issues...');
    
    const csvPath = path.join('./output', 'dat_one_loads_production.csv');
    
    if (!fs.existsSync(csvPath)) {
        console.log('❌ Production CSV file not found');
        return;
    }
    
    // Read all records
    const allRecords = await new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(csvPath)
            .pipe(csv())
            .on('data', (data) => {
                results.push(data);
            })
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
    
    console.log(`📊 Processing ${allRecords.length} records...`);
    
    const fixedRecords = allRecords.map((record, index) => {
        const normalizeValue = (value) => {
            if (!value || value === 'N/A' || value === 'undefined' || value === '') return '';
            return String(value).trim();
        };
        
        // Fix origin/destination parsing
        let origin = normalizeValue(record.origin);
        let destination = normalizeValue(record.destination);
        
        // Check if origin contains combined cities (e.g., "Ripon, CAAurora, CO")
        if (origin && origin.includes('CA') && origin.includes(', CO')) {
            // Split on CA to separate origin and destination
            const parts = origin.split(/CA([A-Z][a-z])/);
            if (parts.length >= 3) {
                origin = (parts[0] + 'CA').trim();
                destination = (parts[1] + parts[2]).trim();
                console.log(`  🔧 Fixed line ${index + 2}: "${record.origin}" → Origin: "${origin}", Dest: "${destination}"`);
            }
        } else if (origin && origin.includes('CADenver')) {
            // Handle "Sacramento, CADenver, CO" format
            origin = origin.replace(/CADenver.*/, 'CA').trim();
            destination = 'Denver, CO';
            console.log(`  🔧 Fixed line ${index + 2}: "${record.origin}" → Origin: "${origin}", Dest: "${destination}"`);
        } else if (origin && origin.includes('CAHenderson')) {
            // Handle "Santa Rosa, CAHenderson, CO" format
            origin = origin.replace(/CAHenderson.*/, 'CA').trim();
            destination = 'Henderson, CO';
            console.log(`  🔧 Fixed line ${index + 2}: "${record.origin}" → Origin: "${origin}", Dest: "${destination}"`);
        } else if (origin && origin.includes('CABroom')) {
            // Handle "Bakersfield, CABroom..." format
            origin = origin.replace(/CABroom.*/, 'CA').trim();
            destination = 'Broomfield, CO';
            console.log(`  🔧 Fixed line ${index + 2}: "${record.origin}" → Origin: "${origin}", Dest: "${destination}"`);
        }
        
        // Generate missing reference numbers
        let referenceNumber = normalizeValue(record.reference_number);
        if (!referenceNumber) {
            const company = normalizeValue(record.company);
            const rate = normalizeValue(record.rate_total_usd);
            const loadDetails = `${origin}-${destination}-${company}-${rate}`;
            referenceNumber = 'AUTO_' + Buffer.from(loadDetails).toString('base64').substring(0, 8).toUpperCase();
            console.log(`  🔑 Generated reference for line ${index + 2}: ${referenceNumber}`);
        }
        
        return {
            reference_number: referenceNumber,
            origin: origin,
            destination: destination,
            rate_total_usd: normalizeValue(record.rate_total_usd),
            rate_per_mile: normalizeValue(record.rate_per_mile),
            company: normalizeValue(record.company),
            contact: normalizeValue(record.contact),
            age_posted: normalizeValue(record.age_posted),
            extracted_at: normalizeValue(record.extracted_at)
        };
    });
    
    // Write fixed data back
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
        ]
    });
    
    await csvWriter.writeRecords(fixedRecords);
    
    console.log('✅ CSV data fixed!');
    console.log(`📁 Updated ${fixedRecords.length} records`);
    console.log('🔧 Fixed issues:');
    console.log('   ✅ Added missing reference numbers');
    console.log('   ✅ Fixed origin/destination parsing');
    console.log('   ✅ Normalized all data fields');
}

if (require.main === module) {
    fixCSVData().catch(console.error);
}

module.exports = { fixCSVData };
