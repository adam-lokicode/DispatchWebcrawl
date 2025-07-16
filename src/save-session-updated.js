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
        console.log('🔗 Opening DAT ONE website...');
        
        // Try multiple URLs in case one fails
        const urlsToTry = [
            'https://www.dat.com/load-boards',
            'https://www.dat.com/login',
            'https://www.dat.com'
        ];
        
        let loadedSuccessfully = false;
        for (const url of urlsToTry) {
            try {
                console.log(`Trying: ${url}`);
                await page.goto(url, { 
                    waitUntil: 'load',  // Changed from networkidle to load
                    timeout: 30000      // Reduced timeout
                });
                console.log(`✅ Successfully loaded: ${url}`);
                loadedSuccessfully = true;
                break;
            } catch (error) {
                console.log(`❌ Failed to load ${url}: ${error.message}`);
                if (url === urlsToTry[urlsToTry.length - 1]) {
                    throw error;
                }
            }
        }
        
        if (!loadedSuccessfully) {
            throw new Error('Failed to load any DAT ONE page');
        }
        
        console.log('\n📝 Please follow these steps:');
        console.log('1. If not already there, navigate to login or click "Login" button');
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
            // Wait a bit for any dialogs to appear
            await page.waitForTimeout(2000);
            
            // Use Playwright's locator instead of page.$ with :has-text()
            const loginAnywayButton = await page.locator('button:has-text("LOGIN ANYWAY")').first();
            if (await loginAnywayButton.isVisible()) {
                console.log('🔄 Detected "LOGIN ANYWAY" dialog, clicking automatically...');
                await loginAnywayButton.click();
                await page.waitForLoadState('load');
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
            // Look for buttons with text content instead of :has-text()
            const buttons = Array.from(document.querySelectorAll('button, a'));
            const searchLoadsButton = buttons.find(btn => 
                btn.textContent && btn.textContent.includes('SEARCH LOADS')
            );
            const postTruckButton = buttons.find(btn => 
                btn.textContent && btn.textContent.includes('POST A TRUCK')
            );
            
            const bodyText = document.body.textContent.toLowerCase();
            
            return {
                hasSearchLoads: !!searchLoadsButton,
                hasPostTruck: !!postTruckButton,
                hasLoadBoard: bodyText.includes('load') && bodyText.includes('search'),
                currentTitle: document.title,
                bodyTextSample: bodyText.substring(0, 200)
            };
        });
        
        console.log('Interface check:', interfaceCheck);
        
        if (interfaceCheck.hasSearchLoads || interfaceCheck.hasPostTruck) {
            console.log('✅ Successfully reached DAT One interface!');
        } else if (interfaceCheck.hasLoadBoard) {
            console.log('✅ Appears to be on a DAT load board related page');
        } else {
            console.log('⚠️ Warning: May not be on the correct DAT One interface yet.');
            console.log('Try navigating to the load board if needed.');
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