const { chromium } = require('playwright');
const fs = require('fs');

async function findCorrectDATUrl() {
    console.log('🎯 Finding the correct DAT ONE Load Board application...');
    
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
        // Try the most likely DAT Power URLs
        const datPowerUrls = [
            'https://power.dat.com',
            'https://power.dat.com/search',
            'https://power.dat.com/loads',
            'https://power.dat.com/loadboard',
            'https://one.dat.com',
            'https://app.dat.com',
            'https://loadboard.dat.com'
        ];
        
        for (const url of datPowerUrls) {
            try {
                console.log(`\n🔗 Trying: ${url}`);
                await page.goto(url, {
                    waitUntil: 'networkidle',
                    timeout: 15000
                });
                
                const finalUrl = page.url();
                console.log(`📍 Final URL: ${finalUrl}`);
                
                // Check if this looks like a load board application
                const pageAnalysis = await page.evaluate(() => {
                    const bodyText = document.body.textContent.toLowerCase();
                    
                    // Look for load board application indicators
                    const appIndicators = [
                        'origin',
                        'destination',
                        'equipment type',
                        'trailer type',
                        'search loads',
                        'load board',
                        'pickup date',
                        'delivery date',
                        'freight',
                        'rate per mile'
                    ];
                    
                    const foundIndicators = appIndicators.filter(indicator => 
                        bodyText.includes(indicator)
                    );
                    
                    // Count input fields and selects
                    const inputCount = document.querySelectorAll('input').length;
                    const selectCount = document.querySelectorAll('select').length;
                    
                    // Look for specific freight search inputs
                    const searchInputs = Array.from(document.querySelectorAll('input')).filter(input => {
                        const placeholder = input.placeholder?.toLowerCase() || '';
                        const name = input.name?.toLowerCase() || '';
                        const id = input.id?.toLowerCase() || '';
                        
                        return placeholder.includes('origin') || 
                               placeholder.includes('destination') ||
                               placeholder.includes('pickup') ||
                               placeholder.includes('delivery') ||
                               name.includes('origin') || 
                               name.includes('destination') ||
                               id.includes('origin') || 
                               id.includes('destination');
                    });
                    
                    return {
                        foundIndicators: foundIndicators,
                        indicatorCount: foundIndicators.length,
                        inputCount: inputCount,
                        selectCount: selectCount,
                        hasSearchInputs: searchInputs.length > 0,
                        searchInputsCount: searchInputs.length,
                        title: document.title,
                        hasLoadListings: bodyText.includes('load') && bodyText.includes('rate'),
                        isLoginPage: bodyText.includes('sign in') || bodyText.includes('login') || bodyText.includes('username') || bodyText.includes('password')
                    };
                });
                
                console.log(`📊 Analysis:`, pageAnalysis);
                
                // Score this page
                let score = pageAnalysis.indicatorCount * 2;
                if (pageAnalysis.hasSearchInputs) score += 10;
                if (pageAnalysis.selectCount > 2) score += 5;
                if (pageAnalysis.hasLoadListings) score += 5;
                if (pageAnalysis.isLoginPage) score -= 10;
                
                console.log(`🎯 Score: ${score}/30`);
                
                if (score > 10) {
                    console.log(`🎉 This looks promising! Taking screenshot...`);
                    await page.screenshot({ 
                        path: `./output/dat-power-${url.replace(/[^a-z0-9]/gi, '-')}.png`, 
                        fullPage: true 
                    });
                    
                    // Get detailed input analysis
                    const detailedInputs = await page.$$eval('input', inputs => 
                        inputs.map(input => ({
                            type: input.type,
                            name: input.name,
                            id: input.id,
                            placeholder: input.placeholder,
                            className: input.className
                        }))
                    );
                    
                    console.log('📋 All inputs:', JSON.stringify(detailedInputs, null, 2));
                }
                
                await page.waitForTimeout(2000);
                
            } catch (error) {
                console.log(`❌ Failed to load ${url}: ${error.message}`);
            }
        }
        
        console.log('\n🎯 If none of the above worked, try manually navigating:');
        console.log('1. Go to dat.com');
        console.log('2. Click "Sign In" or "Login"');
        console.log('3. Look for "DAT Power" or "Load Board" after logging in');
        console.log('4. Note the URL once you reach the freight search interface');
        console.log('\nPress Enter to close...');
        
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    findCorrectDATUrl();
}

module.exports = { findCorrectDATUrl }; 