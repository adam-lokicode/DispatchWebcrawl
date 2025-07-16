const DATOneFreightCrawler = require('./crawler');

async function main() {
    const crawler = new DATOneFreightCrawler();
    
    try {
        console.log('🚀 Starting DAT ONE Freight Crawler...');
        
        // Initialize the crawler
        await crawler.initialize();
        
        // Login to DAT ONE
        await crawler.login();
        
        // Define search criteria - you can modify these
        const searchCriteria = {
            origin: 'San Francisco, CA',
            destination: 'Denver, CO',
            equipmentType: 'Vans (Standard)',
            loadType: 'Full & Partial',
            dateRange: '7/8/2025 - 7/8/2025'
        };
        
        console.log('🔍 Search criteria:', searchCriteria);
        
        // Crawl freight loads
        await crawler.crawlFreightLoads(searchCriteria);
        
        console.log('✅ Freight crawling completed successfully!');
        
    } catch (error) {
        console.error('❌ Error during freight crawling:', error.message);
        process.exit(1);
    } finally {
        await crawler.close();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, gracefully shutting down...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, gracefully shutting down...');
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = { main }; 