const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

async function removeDuplicates() {
    const inputFile = 'output/dat_one_loads_production.csv';
    const outputFile = 'output/dat_one_loads_production_clean.csv';
    
    console.log('🧹 Cleaning duplicates from production CSV...');
    
    const seenEntries = new Set();
    const uniqueEntries = [];
    let totalCount = 0;
    let duplicateCount = 0;
    
    return new Promise((resolve, reject) => {
        fs.createReadStream(inputFile)
            .pipe(csv())
            .on('data', (row) => {
                totalCount++;
                
                // Create unique key (excluding reference_number and extracted_at)
                const uniqueKey = `${row.origin}|${row.destination}|${row.company}|${row.rate_total_usd}|${row.contact}`;
                
                if (!seenEntries.has(uniqueKey)) {
                    seenEntries.add(uniqueKey);
                    uniqueEntries.push(row);
                } else {
                    duplicateCount++;
                    console.log(`🗑️  Removing duplicate: ${row.company} - ${row.origin} to ${row.destination}`);
                }
            })
            .on('end', async () => {
                console.log(`📊 Total entries processed: ${totalCount}`);
                console.log(`❌ Duplicates removed: ${duplicateCount}`);
                console.log(`✅ Unique entries kept: ${uniqueEntries.length}`);
                
                // Write clean data back
                const csvWriter = createCsvWriter({
                    path: outputFile,
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
                
                await csvWriter.writeRecords(uniqueEntries);
                
                // Replace original with clean version
                fs.renameSync(outputFile, inputFile);
                console.log('✅ Duplicates removed successfully!');
                resolve();
            })
            .on('error', reject);
    });
}

removeDuplicates().catch(console.error);
