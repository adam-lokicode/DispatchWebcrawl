const { chromium } = require('playwright');
const fs = require('fs');

async function manualNavigation() {
    console.log('🔍 Manual Navigation Helper for DAT ONE Load Board');
    console.log('This will open a browser with your saved session so you can find the correct load board URL.\n');
    
    const browser = await chromium.launch({
        headless: false,
        slowMo: 500
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
        console.log('🔗 Starting at DAT ONE homepage...');
        await page.goto('https://www.dat.com', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        console.log('\n📝 Instructions:');
        console.log('1. Look for a "Sign In" or "Login" button and click it');
        console.log('2. Or look for "Load Board", "Search Loads", "DAT Power", etc.');
        console.log('3. Navigate to the actual freight search interface');
        console.log('4. Look for origin/destination input fields');
        console.log('5. When you find the correct page, note the URL');
        console.log('6. Press Enter here to get the current URL and page analysis\n');
        
        // Wait for user input
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
        
        const currentUrl = page.url();
        console.log(`\n📍 Current URL: ${currentUrl}`);
        
        // Analyze the current page
        console.log('🔍 Analyzing current page...');
        
        // Look for origin/destination inputs
        const searchInputs = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            return inputs.map(input => ({
                type: input.type,
                name: input.name,
                id: input.id,
                placeholder: input.placeholder,
                value: input.value,
                className: input.className
            })).filter(input => 
                input.placeholder?.toLowerCase().includes('origin') ||
                input.placeholder?.toLowerCase().includes('destination') ||
                input.placeholder?.toLowerCase().includes('pickup') ||
                input.placeholder?.toLowerCase().includes('delivery') ||
                input.placeholder?.toLowerCase().includes('from') ||
                input.placeholder?.toLowerCase().includes('to') ||
                input.name?.toLowerCase().includes('origin') ||
                input.name?.toLowerCase().includes('destination')
            );
        });
        
        console.log('🎯 Found potential search inputs:', JSON.stringify(searchInputs, null, 2));
        
        // Look for equipment/trailer type selects
        const equipmentSelects = await page.evaluate(() => {
            const selects = Array.from(document.querySelectorAll('select'));
            return selects.map(select => ({
                name: select.name,
                id: select.id,
                className: select.className,
                options: Array.from(select.options).map(opt => opt.text).slice(0, 5) // First 5 options
            })).filter(select => 
                select.name?.toLowerCase().includes('equipment') ||
                select.name?.toLowerCase().includes('trailer') ||
                select.className?.toLowerCase().includes('equipment')
            );
        });
        
        console.log('🚛 Found equipment selectors:', JSON.stringify(equipmentSelects, null, 2));
        
        // Save screenshot
        await page.screenshot({ path: './output/manual-navigation-result.png', fullPage: true });
        console.log('📸 Screenshot saved to ./output/manual-navigation-result.png');
        
        console.log('\n💡 If this looks like the correct load board interface, we can update the crawler!');
        console.log('Press Enter to close the browser...');
        
        // Wait for final input
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
        
    } catch (error) {
        console.error('❌ Error during manual navigation:', error.message);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    manualNavigation();
}

module.exports = { manualNavigation }; 