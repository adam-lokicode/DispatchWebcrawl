const { chromium } = require('playwright');
const fs = require('fs');

async function stepByStepGuide() {
    console.log('🎯 Step-by-Step Guide to DAT One Freight Search');
    console.log('This will guide you through finding the correct freight search page.\n');
    
    const browser = await chromium.launch({
        headless: false,
        slowMo: 1000
    });
    
    const context = await browser.newContext({ storageState: 'session.json' });
    const page = await context.newPage();
    
    try {
        // Step 1: Go to DAT homepage
        console.log('🔗 Step 1: Loading DAT homepage...');
        await page.goto('https://www.dat.com', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        console.log('📍 Current URL:', page.url());
        
        // Step 2: Handle login if needed
        if (page.url().includes('login')) {
            console.log('\n🔐 Step 2: You need to login first');
            console.log('1. Enter your DAT ONE credentials');
            console.log('2. Complete MFA if required');
            console.log('3. If "LOGIN ANYWAY" dialog appears, click it');
            console.log('4. Press Enter when you see the main DAT interface...\n');
            
            await new Promise(resolve => {
                process.stdin.once('data', () => resolve());
            });
            
            // Handle LOGIN ANYWAY dialog
            try {
                const loginAnywayButton = await page.locator('button:has-text("LOGIN ANYWAY")').first();
                if (await loginAnywayButton.isVisible()) {
                    console.log('🔄 Clicking LOGIN ANYWAY automatically...');
                    await loginAnywayButton.click();
                    await page.waitForLoadState('networkidle');
                }
            } catch (error) {
                console.log('📝 No LOGIN ANYWAY dialog found');
            }
        }
        
        console.log('\n🎯 Step 3: Now look for the freight search interface');
        console.log('Look for buttons/links like:');
        console.log('- "SEARCH LOADS"');
        console.log('- "Load Board"');
        console.log('- "DAT One"');
        console.log('- "Get Started" under Carriers');
        console.log('\nClick on the appropriate link to reach the freight search page...');
        
        // Look for common navigation elements
        const navigationAnalysis = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a'));
            const relevantButtons = buttons.filter(btn => {
                const text = btn.textContent?.toLowerCase() || '';
                return text.includes('search loads') || 
                       text.includes('load board') || 
                       text.includes('dat one') ||
                       text.includes('get started');
            }).map(btn => ({
                text: btn.textContent?.trim(),
                href: btn.href || '',
                tagName: btn.tagName
            }));
            
            return {
                url: window.location.href,
                title: document.title,
                relevantButtons: relevantButtons
            };
        });
        
        console.log('\n📊 Navigation Options Found:');
        navigationAnalysis.relevantButtons.forEach((btn, i) => {
            console.log(`   ${i + 1}. ${btn.tagName}: "${btn.text}" ${btn.href ? `-> ${btn.href}` : ''}`);
        });
        
        console.log('\n📝 Step 4: Navigate to the freight search page');
        console.log('Look for a page with:');
        console.log('- Origin/Pickup location input field');
        console.log('- Destination/Delivery location input field');
        console.log('- Equipment type dropdown (Van, Flatbed, etc.)');
        console.log('- Search button');
        console.log('\nPress Enter when you can see these search fields...\n');
        
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
        
        // Final analysis
        const finalUrl = page.url();
        console.log(`\n🎯 Final URL: ${finalUrl}`);
        
        // Check if this looks like a freight search page
        const searchPageCheck = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const selects = Array.from(document.querySelectorAll('select'));
            
            const originField = inputs.find(input => {
                const text = (input.placeholder + input.name + input.id).toLowerCase();
                return text.includes('origin') || text.includes('pickup') || text.includes('from');
            });
            
            const destinationField = inputs.find(input => {
                const text = (input.placeholder + input.name + input.id).toLowerCase();
                return text.includes('destination') || text.includes('delivery') || text.includes('to');
            });
            
            const equipmentSelect = selects.find(select => {
                const text = (select.name + select.id + select.className).toLowerCase();
                return text.includes('equipment') || text.includes('trailer') || text.includes('type');
            });
            
            return {
                hasOrigin: !!originField,
                hasDestination: !!destinationField,
                hasEquipment: !!equipmentSelect,
                inputCount: inputs.length,
                selectCount: selects.length,
                originInfo: originField ? {
                    placeholder: originField.placeholder,
                    name: originField.name,
                    id: originField.id
                } : null,
                destinationInfo: destinationField ? {
                    placeholder: destinationField.placeholder,
                    name: destinationField.name,
                    id: destinationField.id
                } : null,
                equipmentInfo: equipmentSelect ? {
                    name: equipmentSelect.name,
                    id: equipmentSelect.id,
                    options: Array.from(equipmentSelect.options).map(opt => opt.text).slice(0, 5)
                } : null
            };
        });
        
        console.log('\n📊 Freight Search Page Analysis:');
        console.log(`✅ Origin field: ${searchPageCheck.hasOrigin ? 'Found' : 'Not found'}`);
        console.log(`✅ Destination field: ${searchPageCheck.hasDestination ? 'Found' : 'Not found'}`);
        console.log(`✅ Equipment selector: ${searchPageCheck.hasEquipment ? 'Found' : 'Not found'}`);
        
        if (searchPageCheck.hasOrigin && searchPageCheck.hasDestination) {
            console.log('\n🎉 Great! This looks like the correct freight search page!');
            console.log('Now you can run: npm run find-selectors');
            console.log('And press Enter when you\'re on this same page.');
            
            // Generate selector suggestions
            const selectors = {
                url: finalUrl,
                origin: searchPageCheck.originInfo,
                destination: searchPageCheck.destinationInfo,
                equipment: searchPageCheck.equipmentInfo
            };
            
            fs.writeFileSync('./output/page-analysis.json', JSON.stringify(selectors, null, 2));
            console.log('\n💾 Page analysis saved to ./output/page-analysis.json');
        } else {
            console.log('\n⚠️ This doesn\'t look like the freight search page yet.');
            console.log('Please navigate to the page with origin/destination fields.');
        }
        
        // Take screenshot
        await page.screenshot({ path: './output/current-page.png', fullPage: true });
        console.log('📸 Screenshot saved to ./output/current-page.png');
        
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
    stepByStepGuide();
}

module.exports = { stepByStepGuide }; 