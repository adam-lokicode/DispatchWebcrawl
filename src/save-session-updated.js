const { chromium } = require('playwright');
const fs = require('fs');
const readline = require('readline');

async function saveUpdatedDATOneSession() {
    console.log('🚀 Updated DAT ONE Session Saver');
    console.log('This will handle the "LOGIN ANYWAY" dialog automatically.\n');
    
    const browser = await chromium.launch({ 
        headless: false,
        slowMo: 500 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('🔗 Opening DAT ONE load boards page...');
        await page.goto('https://www.dat.com/load-boards', { 
            waitUntil: 'networkidle',
            timeout: 60000
        });
        
        console.log('\n📝 Please follow these steps:');
        console.log('1. Click the "Login" button');
        console.log('2. Enter your DAT ONE credentials');
        console.log('3. Complete MFA if required');
        console.log('4. If you see "LOGIN ANYWAY" dialog, it will be handled automatically');
        console.log('5. Wait until you see the DAT One interface with SEARCH LOADS button');
        console.log('6. Press Enter here when you reach the main interface...\n');
        
        // Wait for user input
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        await new Promise(resolve => {
            rl.question('Press Enter when you have successfully logged in: ', () => {
                rl.close();
                resolve();
            });
        });
        
        // Check for and handle "LOGIN ANYWAY" dialog automatically
        try {
            const loginAnywayButton = await page.$('button:has-text("LOGIN ANYWAY")');
            if (loginAnywayButton) {
                console.log('🔄 Detected "LOGIN ANYWAY" dialog, clicking automatically...');
                await loginAnywayButton.click();
                await page.waitForLoadState('networkidle');
                console.log('✅ Successfully handled session conflict');
            }
        } catch (error) {
            console.log('📝 No session conflict dialog detected');
        }
        
        // Verify we're logged in by looking for DAT One interface elements
        console.log('🔍 Checking login status...');
        
        const currentUrl = page.url();
        console.log(`Current URL: ${currentUrl}`);
        
        // Look for DAT One interface indicators
        const interfaceCheck = await page.evaluate(() => {
            const searchLoadsButton = document.querySelector('button:has-text("SEARCH LOADS"), a:has-text("SEARCH LOADS")');
            const postTruckButton = document.querySelector('button:has-text("POST A TRUCK"), a:has-text("POST A TRUCK")');
            const bodyText = document.body.textContent.toLowerCase();
            
            return {
                hasSearchLoads: !!searchLoadsButton,
                hasPostTruck: !!postTruckButton,
                hasLoadBoard: bodyText.includes('load') && bodyText.includes('search'),
                currentTitle: document.title
            };
        });
        
        console.log('Interface check:', interfaceCheck);
        
        if (interfaceCheck.hasSearchLoads || interfaceCheck.hasPostTruck) {
            console.log('✅ Successfully reached DAT One interface!');
        } else {
            console.log('⚠️ Warning: May not be on the correct DAT One interface yet.');
        }
        
        // Save the session
        console.log('💾 Saving session...');
        const sessionData = await context.storageState();
        fs.writeFileSync('session.json', JSON.stringify(sessionData, null, 2));
        
        console.log('✅ Session saved successfully to session.json');
        console.log('\n🎉 You can now use the automated DAT ONE crawler!');
        console.log('💡 Run: npm run crawl');
        
    } catch (error) {
        console.error('❌ Error saving session:', error.message);
    } finally {
        await browser.close();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down...');
    process.exit(0);
});

if (require.main === module) {
    saveUpdatedDATOneSession();
}

module.exports = { saveUpdatedDATOneSession }; 