const { chromium } = require('playwright');
const fs = require('fs');

async function findSelectors() {
    console.log('🎯 DAT One Selector Finder');
    console.log('Navigate to the correct load board page, then press Enter to extract selectors.\n');
    
    const browser = await chromium.launch({
        headless: false,
        slowMo: 500
    });
    
    const context = await browser.newContext({ storageState: 'session.json' });
    const page = await context.newPage();
    
    try {
        // Start at DAT homepage
        await page.goto('https://www.dat.com', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        console.log('📝 Instructions:');
        console.log('1. Navigate to the DAT One load board interface');
        console.log('2. Find the freight search page with origin/destination fields');
        console.log('3. Make sure you can see the search form');
        console.log('4. Press Enter here when you\'re on the correct page...\n');
        
        // Wait for user to navigate to the correct page
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
        
        const currentUrl = page.url();
        console.log(`\n🎯 Current URL: ${currentUrl}`);
        
        // Extract all form elements and their selectors
        const formAnalysis = await page.evaluate(() => {
            const result = {
                url: window.location.href,
                title: document.title,
                inputs: [],
                selects: [],
                buttons: [],
                loadElements: []
            };
            
            // Get all input fields
            const inputs = Array.from(document.querySelectorAll('input'));
            inputs.forEach(input => {
                const info = {
                    type: input.type,
                    name: input.name || '',
                    id: input.id || '',
                    placeholder: input.placeholder || '',
                    className: input.className || '',
                    value: input.value || ''
                };
                
                // Generate possible selectors
                const selectors = [];
                if (info.id) selectors.push(`#${info.id}`);
                if (info.name) selectors.push(`input[name="${info.name}"]`);
                if (info.placeholder) selectors.push(`input[placeholder="${info.placeholder}"]`);
                if (info.className) selectors.push(`input.${info.className.split(' ')[0]}`);
                
                info.selectors = selectors;
                result.inputs.push(info);
            });
            
            // Get all select elements
            const selects = Array.from(document.querySelectorAll('select'));
            selects.forEach(select => {
                const info = {
                    name: select.name || '',
                    id: select.id || '',
                    className: select.className || '',
                    options: Array.from(select.options).map(opt => opt.text).slice(0, 10)
                };
                
                // Generate possible selectors
                const selectors = [];
                if (info.id) selectors.push(`#${info.id}`);
                if (info.name) selectors.push(`select[name="${info.name}"]`);
                if (info.className) selectors.push(`select.${info.className.split(' ')[0]}`);
                
                info.selectors = selectors;
                result.selects.push(info);
            });
            
            // Get all buttons
            const buttons = Array.from(document.querySelectorAll('button'));
            buttons.forEach(button => {
                const info = {
                    type: button.type || '',
                    text: button.textContent?.trim() || '',
                    className: button.className || '',
                    id: button.id || ''
                };
                
                // Generate possible selectors
                const selectors = [];
                if (info.id) selectors.push(`#${info.id}`);
                if (info.text) selectors.push(`button:has-text("${info.text}")`);
                if (info.className) selectors.push(`button.${info.className.split(' ')[0]}`);
                if (info.type) selectors.push(`button[type="${info.type}"]`);
                
                info.selectors = selectors;
                result.buttons.push(info);
            });
            
            // Look for potential load result elements
            const loadSelectors = [
                '[class*="load"]',
                '[id*="load"]',
                '[data-testid*="load"]',
                '.freight-item',
                '.load-card',
                '.load-result'
            ];
            
            loadSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    result.loadElements.push({
                        selector: selector,
                        count: elements.length
                    });
                }
            });
            
            return result;
        });
        
        console.log('\n📊 Form Analysis Results:');
        console.log(`📄 Title: ${formAnalysis.title}`);
        console.log(`📝 Found ${formAnalysis.inputs.length} inputs`);
        console.log(`📋 Found ${formAnalysis.selects.length} selects`);
        console.log(`🔘 Found ${formAnalysis.buttons.length} buttons`);
        console.log(`📦 Found ${formAnalysis.loadElements.length} load element types`);
        
        // Find origin field
        const originField = formAnalysis.inputs.find(input => {
            const text = (input.placeholder + input.name + input.id).toLowerCase();
            return text.includes('origin') || text.includes('pickup') || text.includes('from');
        });
        
        // Find destination field
        const destinationField = formAnalysis.inputs.find(input => {
            const text = (input.placeholder + input.name + input.id).toLowerCase();
            return text.includes('destination') || text.includes('delivery') || text.includes('to');
        });
        
        // Find equipment selector
        const equipmentSelect = formAnalysis.selects.find(select => {
            const text = (select.name + select.id + select.className).toLowerCase();
            return text.includes('equipment') || text.includes('trailer') || text.includes('type') ||
                   select.options.some(opt => opt.toLowerCase().includes('van') || opt.toLowerCase().includes('flatbed'));
        });
        
        // Find search button
        const searchButton = formAnalysis.buttons.find(button => {
            const text = button.text.toLowerCase();
            return text.includes('search') || text.includes('find') || text.includes('apply') || button.type === 'submit';
        });
        
        console.log('\n🎯 Identified Form Elements:');
        
        if (originField) {
            console.log(`📍 Origin field: "${originField.placeholder}" (selectors: ${originField.selectors.join(', ')})`);
        } else {
            console.log('❌ Origin field not found');
        }
        
        if (destinationField) {
            console.log(`📍 Destination field: "${destinationField.placeholder}" (selectors: ${destinationField.selectors.join(', ')})`);
        } else {
            console.log('❌ Destination field not found');
        }
        
        if (equipmentSelect) {
            console.log(`🚛 Equipment selector: options include ${equipmentSelect.options.slice(0, 3).join(', ')}... (selectors: ${equipmentSelect.selectors.join(', ')})`);
        } else {
            console.log('❌ Equipment selector not found');
        }
        
        if (searchButton) {
            console.log(`🔍 Search button: "${searchButton.text}" (selectors: ${searchButton.selectors.join(', ')})`);
        } else {
            console.log('❌ Search button not found');
        }
        
        console.log('\n📦 Load elements found:');
        formAnalysis.loadElements.forEach(element => {
            console.log(`   ${element.selector}: ${element.count} elements`);
        });
        
        // Generate updated crawler configuration
        const config = {
            url: formAnalysis.url,
            selectors: {
                origin: originField ? originField.selectors[0] : 'input[placeholder*="origin" i]',
                destination: destinationField ? destinationField.selectors[0] : 'input[placeholder*="destination" i]',
                equipment: equipmentSelect ? equipmentSelect.selectors[0] : 'select[name*="equipment" i]',
                searchButton: searchButton ? searchButton.selectors[0] : 'button[type="submit"]',
                loadElements: formAnalysis.loadElements.length > 0 ? formAnalysis.loadElements[0].selector : '.load-result'
            }
        };
        
        console.log('\n🔧 Generated Configuration:');
        console.log(JSON.stringify(config, null, 2));
        
        // Save configuration
        fs.writeFileSync('./output/crawler-config.json', JSON.stringify(config, null, 2));
        console.log('\n💾 Configuration saved to ./output/crawler-config.json');
        
        // Take screenshot
        await page.screenshot({ path: './output/load-board-interface.png', fullPage: true });
        console.log('📸 Screenshot saved to ./output/load-board-interface.png');
        
        console.log('\n✅ Selector extraction complete!');
        console.log('💡 You can now update the crawler with these selectors.');
        
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
    findSelectors();
}

module.exports = { findSelectors }; 