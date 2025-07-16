const { chromium } = require('playwright');
const fs = require('fs');

async function debugDATOnePage() {
    console.log('🔍 Debug: Finding correct DAT ONE load board...');
    
    const browser = await chromium.launch({
        headless: false,
        slowMo: 1000
    });
    
    // Load saved session
    let context;
    if (fs.existsSync('session.json')) {
        context = await browser.newContext({ storageState: 'session.json' });
        console.log('✅ Loaded session from session.json');
    } else {
        context = await browser.newContext();
        console.log('❌ No session found, using fresh context');
    }
    
    const page = await context.newPage();
    
    try {
        // Try different potential URLs for DAT ONE load board
        const urlsToTry = [
            'https://www.dat.com',
            'https://www.dat.com/loadboard',
            'https://www.dat.com/load-board',
            'https://www.dat.com/search',
            'https://www.dat.com/dashboard',
            'https://www.dat.com/loads',
            'https://power.dat.com',
            'https://power.dat.com/search',
            'https://power.dat.com/loadboard'
        ];
        
        for (const url of urlsToTry) {
            try {
                console.log(`🔗 Trying URL: ${url}`);
                await page.goto(url, {
                    waitUntil: 'networkidle',
                    timeout: 15000
                });
                
                const finalUrl = page.url();
                console.log(`📍 Final URL: ${finalUrl}`);
                
                // Check if this looks like a load board interface
                const hasSearchElements = await page.evaluate(() => {
                    // Look for typical load board elements
                    const indicators = [
                        'origin',
                        'destination', 
                        'equipment',
                        'load board',
                        'freight',
                        'search loads',
                        'pickup',
                        'delivery'
                    ];
                    
                    const pageText = document.body.textContent.toLowerCase();
                    const foundIndicators = indicators.filter(indicator => 
                        pageText.includes(indicator)
                    );
                    
                    return {
                        indicatorCount: foundIndicators.length,
                        foundIndicators: foundIndicators,
                        hasInputs: document.querySelectorAll('input').length > 2,
                        hasSelects: document.querySelectorAll('select').length > 0
                    };
                });
                
                console.log(`📊 Load board indicators:`, hasSearchElements);
                
                if (hasSearchElements.indicatorCount > 3) {
                    console.log(`🎯 This looks promising! Taking screenshot...`);
                    await page.screenshot({ 
                        path: `./output/potential-loadboard-${url.replace(/[^a-z0-9]/gi, '-')}.png`, 
                        fullPage: true 
                    });
                    
                    // Look for input fields on this promising page
                    const inputs = await page.$$eval('input', inputs => 
                        inputs.map(input => ({
                            type: input.type,
                            name: input.name,
                            id: input.id,
                            placeholder: input.placeholder,
                            className: input.className
                        }))
                    );
                    
                    console.log('📋 Input fields found:', JSON.stringify(inputs, null, 2));
                }
                
                await page.waitForTimeout(2000); // Brief pause between tries
                
            } catch (error) {
                console.log(`❌ Failed to load ${url}: ${error.message}`);
            }
        }
        
        console.log('\n🎯 Manual inspection time!');
        console.log('Check the browser - navigate manually to the load board if needed.');
        console.log('Press Enter when you find the correct load search page...');
        
        // Wait for user input
        await new Promise(resolve => {
            process.stdin.once('data', () => {
                console.log(`📍 Current URL: ${page.url()}`);
                resolve();
            });
        });
        
    } catch (error) {
        console.error('❌ Error during debugging:', error.message);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    debugDATOnePage();
}

module.exports = { debugDATOnePage }; 