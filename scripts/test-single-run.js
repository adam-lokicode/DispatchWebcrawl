#!/usr/bin/env node

// Test a single scraping run without the scheduler
const { runProductionScraping, logger } = require('../src/production-scraper');

async function testSingleRun() {
    logger.info('🧪 Testing single scraping run...');
    
    try {
        await runProductionScraping();
        logger.info('✅ Single run completed successfully!');
    } catch (error) {
        logger.error('❌ Single run failed', { error: error.message });
        console.error(error.stack);
    }
}

if (require.main === module) {
    testSingleRun();
}

module.exports = { testSingleRun };
