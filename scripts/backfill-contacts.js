#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

async function backfillContacts() {
    console.log('📞 Backfilling missing contact information...');
    
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
    
    let contactsFound = 0;
    let originalWithContact = 0;
    
    const enhancedRecords = allRecords.map((record, index) => {
        const originalContact = record.contact ? record.contact.trim() : '';
        if (originalContact && originalContact !== 'N/A') {
            originalWithContact++;
            return record; // Already has contact info
        }
        
        // Enhanced contact extraction patterns
        const phonePatterns = [
            /\(\d{3}\)\s*\d{3}[-\s]?\d{4}/g,  // (123) 123-1234
            /\d{3}[-\.]\d{3}[-\.]\d{4}/g,       // 123-123-1234 or 123.123.1234
            /\d{3}\s\d{3}\s\d{4}/g,           // 123 123 1234
            /\(\d{3}\)\d{3}-\d{4}/g,          // (123)123-1234
            /\d{10}/g,                        // 1234567890
            /\+1[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}/g // +1-123-123-1234
        ];
        
        const emailPatterns = [
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\.[a-zA-Z]{2,}/g,
            /[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}/g
        ];
        
        // Check company name for embedded contact info
        const companyName = record.company || '';
        let foundContact = '';
        
        // Look for phone numbers in company name
        for (const pattern of phonePatterns) {
            const phoneMatch = companyName.match(pattern);
            if (phoneMatch) {
                foundContact = phoneMatch[0];
                break;
            }
        }
        
        // If no phone found, look for email in company name
        if (!foundContact) {
            for (const pattern of emailPatterns) {
                const emailMatch = companyName.match(pattern);
                if (emailMatch) {
                    foundContact = emailMatch[0];
                    break;
                }
            }
        }
        
        // Also check other fields for contact info
        if (!foundContact) {
            const allText = `${record.origin} ${record.destination} ${record.company} ${record.age_posted}`;
            
            // Look for phone numbers in all text
            for (const pattern of phonePatterns) {
                const phoneMatch = allText.match(pattern);
                if (phoneMatch) {
                    foundContact = phoneMatch[0];
                    break;
                }
            }
            
            // Look for emails in all text
            if (!foundContact) {
                for (const pattern of emailPatterns) {
                    const emailMatch = allText.match(pattern);
                    if (emailMatch) {
                        foundContact = emailMatch[0];
                        break;
                    }
                }
            }
        }
        
        if (foundContact) {
            contactsFound++;
            console.log(`  📞 Found contact for line ${index + 2}: ${foundContact} (${record.company})`);
            return {
                ...record,
                contact: foundContact
            };
        }
        
        return record;
    });
    
    // Write enhanced data back
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
    
    await csvWriter.writeRecords(enhancedRecords);
    
    const finalWithContact = originalWithContact + contactsFound;
    const coverage = Math.round((finalWithContact / allRecords.length) * 100);
    
    console.log('\n✅ Contact backfill completed!');
    console.log(`📊 Original records with contact: ${originalWithContact}`);
    console.log(`🔍 Additional contacts found: ${contactsFound}`);
    console.log(`📈 Total records with contact: ${finalWithContact}`);
    console.log(`📊 New coverage: ${coverage}%`);
    
    // Clean up script
    fs.unlinkSync(__filename);
    console.log('🗑️ Removed backfill script');
}

if (require.main === module) {
    backfillContacts().catch(console.error);
}
