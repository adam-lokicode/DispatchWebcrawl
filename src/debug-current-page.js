const { chromium } = require('playwright');
const fs = require('fs');

async function debugCurrentPage() {
    console.log('🔍 Debugging current DAT page with saved session...');
    
    const browser = await chromium.launch({
        headless: false,
        slowMo: 1000
    });
    
    // Load saved session
    const context = await browser.newContext({ storageState: 'session.json' });
    const page = await context.newPage();
    
    try {
        // Navigate to DAT homepage
        await page.goto('https://www.dat.com', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        console.log(`📍 Current URL: ${page.url()}`);
        
        // Analyze the page for navigation options
        const pageAnalysis = await page.evaluate(() => {
            // Look for all links and buttons that might lead to the load board
            const links = Array.from(document.querySelectorAll('a')).map(link => ({
                text: link.textContent?.trim() || '',
                href: link.href || '',
                className: link.className || ''
            })).filter(link => 
                link.text.toLowerCase().includes('load') ||
                link.text.toLowerCase().includes('search') ||
                link.text.toLowerCase().includes('power') ||
                link.text.toLowerCase().includes('board') ||
                link.text.toLowerCase().includes('one') ||
                link.href.includes('load') ||
                link.href.includes('search') ||
                link.href.includes('power')
            );
            
            const buttons = Array.from(document.querySelectorAll('button')).map(btn => ({
                text: btn.textContent?.trim() || '',
                className: btn.className || ''
            })).filter(btn => 
                btn.text.toLowerCase().includes('load') ||
                btn.text.toLowerCase().includes('search') ||
                btn.text.toLowerCase().includes('power') ||
                btn.text.toLowerCase().includes('board')
            );
            
            return {
                title: document.title,
                url: window.location.href,
                relevantLinks: links,
                relevantButtons: buttons,
                bodyTextSample: document.body.textContent.substring(0, 500)
            };
        });
        
        console.log('\n📊 Page Analysis:');
        console.log(`📄 Title: ${pageAnalysis.title}`);
        console.log(`🔗 URL: ${pageAnalysis.url}`);
        console.log(`🔗 Relevant Links (${pageAnalysis.relevantLinks.length}):`);
        pageAnalysis.relevantLinks.slice(0, 10).forEach((link, i) => {
            console.log(`   ${i + 1}. "${link.text}" -> ${link.href}`);
        });
        
        console.log(`🔘 Relevant Buttons (${pageAnalysis.relevantButtons.length}):`);
        pageAnalysis.relevantButtons.slice(0, 10).forEach((btn, i) => {
            console.log(`   ${i + 1}. "${btn.text}"`);
        });
        
        // Try to find and click a promising link
        const potentialUrls = [
            'https://www.dat.com/login',
            'https://power.dat.com',
            'https://one.dat.com',
            'https://www.dat.com/load-board',
            'https://www.dat.com/search'
        ];
        
        console.log('\n🔍 Trying to find the load board interface...');
        
        // Look for "Get Started" or "Login" buttons for carriers
        try {
            const carrierGetStarted = await page.locator('text=Carriers').locator('..').locator('text=Get Started').first();
            if (await carrierGetStarted.isVisible()) {
                console.log('🎯 Found Carrier "Get Started" button, clicking...');
                await carrierGetStarted.click();
                await page.waitForLoadState('networkidle');
                
                const newUrl = page.url();
                console.log(`📍 New URL after clicking: ${newUrl}`);
                
                // Check if this looks like a load board
                const isLoadBoard = await page.evaluate(() => {
                    const text = document.body.textContent.toLowerCase();
                    return text.includes('origin') && text.includes('destination') && text.includes('equipment');
                });
                
                if (isLoadBoard) {
                    console.log('✅ This looks like a load board interface!');
                }
            }
        } catch (error) {
            console.log('⚠️ Could not find Carrier Get Started button');
        }
        
        // Take a screenshot
        await page.screenshot({ path: './output/current-page-debug.png', fullPage: true });
        console.log('\n📸 Screenshot saved to ./output/current-page-debug.png');
        
        console.log('\n🎯 Manual Navigation:');
        console.log('Use the browser to navigate to the load board interface');
        console.log('Look for login, carrier sections, or direct load board links');
        console.log('Press Enter when you find the correct interface...');
        
        // Wait for user input
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });
        
        const finalUrl = page.url();
        console.log(`\n📍 Final URL: ${finalUrl}`);
        
        // Analyze the final page
        const finalAnalysis = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input')).map(input => ({
                type: input.type,
                name: input.name || '',
                placeholder: input.placeholder || '',
                id: input.id || ''
            }));
            
            return {
                title: document.title,
                inputCount: inputs.length,
                inputs: inputs.slice(0, 20) // First 20 inputs
            };
        });
        
        console.log('\n📊 Final Page Analysis:');
        console.log(`📄 Title: ${finalAnalysis.title}`);
        console.log(`📝 Found ${finalAnalysis.inputCount} inputs`);
        console.log('🔍 Input fields:');
        finalAnalysis.inputs.forEach((input, i) => {
            console.log(`   ${i + 1}. ${input.type} - "${input.placeholder}" (name: ${input.name}, id: ${input.id})`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    debugCurrentPage();
}

module.exports = { debugCurrentPage }; 