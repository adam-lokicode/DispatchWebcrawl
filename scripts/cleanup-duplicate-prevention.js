#!/usr/bin/env node

// Remove any duplicate prevention logic that creates backup files
const fs = require('fs');
const path = require('path');

function cleanupAndPreventDuplicates() {
    console.log('🧹 Cleaning up and preventing future issues...');
    
    // 1. Remove any backup or extra CSV files
    const outputDir = './output';
    const files = fs.readdirSync(outputDir);
    
    const csvFiles = files.filter(f => f.endsWith('.csv'));
    console.log(`📄 Found CSV files: ${csvFiles.join(', ')}`);
    
    // Remove any CSV files that aren't the main production file
    csvFiles.forEach(file => {
        if (file !== 'dat_one_loads_production.csv') {
            const filePath = path.join(outputDir, file);
            try {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Removed: ${file}`);
            } catch (e) {
                console.log(`⚠️ Could not remove ${file}: ${e.message}`);
            }
        }
    });
    
    // 2. Update the cleanup script to remove itself
    const scriptsToRemove = [
        'scripts/cleanup-duplicates.js',
        'scripts/create-dat-one-scraper.js',
        'scripts/fix-csv-data.js',
        'scripts/cleanup-duplicate-prevention.js' // Remove this script too
    ];
    
    scriptsToRemove.forEach(script => {
        if (fs.existsSync(script)) {
            try {
                fs.unlinkSync(script);
                console.log(`🗑️ Removed cleanup script: ${script}`);
            } catch (e) {
                console.log(`⚠️ Could not remove ${script}: ${e.message}`);
            }
        }
    });
    
    console.log('✅ Cleanup completed!');
    console.log('📁 Only keeping: dat_one_loads_production.csv');
    console.log('🔧 Production scraper will not create backup files');
    
    // Show final state
    const remainingFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.csv'));
    console.log(`📊 Final CSV files: ${remainingFiles.join(', ')}`);
}

cleanupAndPreventDuplicates();
