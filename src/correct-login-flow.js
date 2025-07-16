const { chromium } = require('playwright');

async function correctLoginFlow() {
    console.log('🎯 DAT One Load Board - Correct Login Flow');
    console.log('Following the proper path from load-boards page to the actual application\n');
    
    const browser = await chromium.launch({
        headless: false,
        slowMo: 500
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('🔗 Going to DAT load boards page...');
        await page.goto('https://www.dat.com/load-boards', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        console.log('\n📝 Steps to follow:');
        console.log('1. Look for "Login" or "Already a customer? Log-in" button');
        console.log('2. Click it to go to the actual DAT One login page');
        console.log('3. Complete your login (username, password, MFA)');
        console.log('4. Once logged in, look for the load board/search interface');
        console.log('5. Navigate to the freight search page');
        console.log('6. When you see origin/destination fields, press Enter here\n');
        
        // Look for login buttons
        const loginButtons = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('a, button'));
            return buttons.map(btn => ({
                text: btn.textContent?.trim() || '',
                href: btn.href || '',
                className: btn.className || ''
            })).filter(btn => 
                btn.text.toLowerCase().includes('login') || 
                btn.text.toLowerCase().includes('log-in') ||
                btn.text.toLowerCase().includes('sign in')
            );
        });
        
        console.log('🔍 Found login options:');
        loginButtons.forEach((btn, i) => {
            console.log(`   ${i + 1}. "${btn.text}" ${btn.href ? `-> ${btn.href}` : ''}`);
        });
        
        console.log('\nClick on the appropriate login button in the browser...\n');
        
        // Wait for user to complete login process
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
        
        const currentUrl = page.url();
        console.log(`\n🎯 Current URL: ${currentUrl}`);
        
        // Analyze the current page to see if we're in the load board application
        console.log('🔍 Analyzing the load board interface...');
        
        const loadBoardAnalysis = await page.evaluate(() => {
            // Look for freight search elements
            const inputs = Array.from(document.querySelectorAll('input')).map(input => ({
                type: input.type,
                name: input.name || '',
                id: input.id || '',
                placeholder: input.placeholder || '',
                className: input.className || '',
                value: input.value || ''
            }));
            
            // Look for selects (equipment types, etc.)
            const selects = Array.from(document.querySelectorAll('select')).map(select => ({
                name: select.name || '',
                id: select.id || '',
                className: select.className || '',
                optionCount: select.options.length,
                sampleOptions: Array.from(select.options).slice(0, 5).map(opt => opt.text)
            }));
            
            // Look for search/filter buttons
            const buttons = Array.from(document.querySelectorAll('button')).map(button => ({
                type: button.type || '',
                text: button.textContent?.trim() || '',
                className: button.className || ''
            })).filter(btn => 
                btn.text.toLowerCase().includes('search') ||
                btn.text.toLowerCase().includes('filter') ||
                btn.text.toLowerCase().includes('find')
            );
            
            // Look for load listings/results
            const loadElements = document.querySelectorAll('[class*="load"], [id*="load"], [data-testid*="load"]');
            
            return {
                title: document.title,
                url: window.location.href,
                inputs: inputs,
                selects: selects,
                searchButtons: buttons,
                loadElementsCount: loadElements.length,
                bodyText: document.body.textContent.substring(0, 1000)
            };
        });
        
        console.log('\n📊 Load Board Analysis:');
        console.log(`📄 Title: ${loadBoardAnalysis.title}`);
        console.log(`🔗 URL: ${loadBoardAnalysis.url}`);
        console.log(`📝 Input fields: ${loadBoardAnalysis.inputs.length}`);
        console.log(`📋 Select dropdowns: ${loadBoardAnalysis.selects.length}`);
        console.log(`🔘 Search buttons: ${loadBoardAnalysis.searchButtons.length}`);
        console.log(`📦 Load elements: ${loadBoardAnalysis.loadElementsCount}`);
        
        // Show origin/destination inputs
        const searchInputs = loadBoardAnalysis.inputs.filter(input => {
            const searchText = (input.placeholder + input.name + input.id + input.className).toLowerCase();
            return searchText.includes('origin') || searchText.includes('destination') || 
                   searchText.includes('pickup') || searchText.includes('delivery') ||
                   searchText.includes('from') || searchText.includes('to');
        });
        
        if (searchInputs.length > 0) {
            console.log('\n🎯 Found freight search inputs:');
            console.log(JSON.stringify(searchInputs, null, 2));
        } else {
            console.log('\n⚠️ No obvious freight search inputs found yet');
        }
        
        // Show equipment selectors
        const equipmentSelects = loadBoardAnalysis.selects.filter(select => {
            const searchText = (select.name + select.id + select.className).toLowerCase();
            return searchText.includes('equipment') || searchText.includes('trailer') || 
                   searchText.includes('type') || select.sampleOptions.some(opt => 
                       opt.toLowerCase().includes('van') || opt.toLowerCase().includes('reefer') || 
                       opt.toLowerCase().includes('flatbed')
                   );
        });
        
        if (equipmentSelects.length > 0) {
            console.log('\n🚛 Found equipment selectors:');
            console.log(JSON.stringify(equipmentSelects, null, 2));
        }
        
        // Show search buttons
        if (loadBoardAnalysis.searchButtons.length > 0) {
            console.log('\n🔍 Found search buttons:');
            console.log(JSON.stringify(loadBoardAnalysis.searchButtons, null, 2));
        }
        
        // Take screenshot
        await page.screenshot({ path: './output/dat-one-loadboard.png', fullPage: true });
        console.log('\n📸 Screenshot saved to ./output/dat-one-loadboard.png');
        
        if (searchInputs.length > 0 || equipmentSelects.length > 0) {
            console.log('\n✅ Great! This looks like the DAT One load board interface.');
            console.log('We can now update the crawler with:');
            console.log(`   - URL: ${loadBoardAnalysis.url}`);
            console.log('   - The input selectors found above');
        } else {
            console.log('\n🤔 This might not be the load search interface yet.');
            console.log('Try navigating to "Search Loads" or "Load Board" within the application.');
        }
        
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
    correctLoginFlow();
}

module.exports = { correctLoginFlow }; 