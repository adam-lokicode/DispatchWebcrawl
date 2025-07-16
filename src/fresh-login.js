const { chromium } = require('playwright');

async function freshLogin() {
    console.log('🔍 Fresh DAT ONE Login - Finding the correct load board');
    console.log('This will open a fresh browser for you to manually log in and find the load board.\n');
    
    const browser = await chromium.launch({
        headless: false,
        slowMo: 500
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('🔗 Opening DAT ONE homepage...');
        await page.goto('https://www.dat.com', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        console.log('\n📝 Manual Steps:');
        console.log('1. Look for "Sign In", "Login", or "DAT Power" button');
        console.log('2. Click it and complete your login (including MFA)');
        console.log('3. After logging in, look for:');
        console.log('   - Load Board');
        console.log('   - Search Loads');
        console.log('   - DAT Power');
        console.log('   - Freight Search');
        console.log('4. Navigate to the page where you can search for freight loads');
        console.log('5. Look for origin/destination input fields');
        console.log('6. When you find the correct load search page, press Enter here');
        console.log('\nTake your time to complete the login and find the load board...\n');
        
        // Wait for user input
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
        
        const currentUrl = page.url();
        console.log(`\n🎯 Current URL: ${currentUrl}`);
        
        // Analyze the page
        console.log('🔍 Analyzing the current page...');
        
        const pageAnalysis = await page.evaluate(() => {
            // Look for freight search inputs
            const inputs = Array.from(document.querySelectorAll('input')).map(input => ({
                type: input.type,
                name: input.name || '',
                id: input.id || '',
                placeholder: input.placeholder || '',
                className: input.className || ''
            }));
            
            // Look for selects (equipment dropdowns)
            const selects = Array.from(document.querySelectorAll('select')).map(select => ({
                name: select.name || '',
                id: select.id || '',
                className: select.className || '',
                optionCount: select.options.length,
                firstFewOptions: Array.from(select.options).slice(0, 3).map(opt => opt.text)
            }));
            
            // Look for buttons
            const buttons = Array.from(document.querySelectorAll('button')).map(button => ({
                type: button.type || '',
                textContent: button.textContent?.trim() || '',
                className: button.className || ''
            }));
            
            return {
                title: document.title,
                inputs: inputs,
                selects: selects,
                buttons: buttons.slice(0, 10), // First 10 buttons
                bodyTextSample: document.body.textContent.substring(0, 500)
            };
        });
        
        console.log('\n📊 Page Analysis:');
        console.log(`📄 Title: ${pageAnalysis.title}`);
        console.log(`📝 Inputs found: ${pageAnalysis.inputs.length}`);
        console.log(`📋 Selects found: ${pageAnalysis.selects.length}`);
        console.log(`🔘 Buttons found: ${pageAnalysis.buttons.length}`);
        
        // Show relevant inputs
        const relevantInputs = pageAnalysis.inputs.filter(input => {
            const text = (input.placeholder + input.name + input.id).toLowerCase();
            return text.includes('origin') || text.includes('destination') || 
                   text.includes('pickup') || text.includes('delivery') ||
                   text.includes('from') || text.includes('to');
        });
        
        if (relevantInputs.length > 0) {
            console.log('\n🎯 Found relevant search inputs:');
            console.log(JSON.stringify(relevantInputs, null, 2));
        }
        
        // Show equipment selects
        const equipmentSelects = pageAnalysis.selects.filter(select => {
            const text = (select.name + select.id + select.className).toLowerCase();
            return text.includes('equipment') || text.includes('trailer') || text.includes('type');
        });
        
        if (equipmentSelects.length > 0) {
            console.log('\n🚛 Found equipment selectors:');
            console.log(JSON.stringify(equipmentSelects, null, 2));
        }
        
        // Save screenshot
        await page.screenshot({ path: './output/correct-loadboard.png', fullPage: true });
        console.log('\n📸 Screenshot saved to ./output/correct-loadboard.png');
        
        console.log('\n💡 If this is the correct load board, we can update the crawler with:');
        console.log(`   - URL: ${currentUrl}`);
        console.log('   - The selectors we found above');
        
        console.log('\nPress Enter to close the browser...');
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
    freshLogin();
}

module.exports = { freshLogin }; 