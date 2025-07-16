const { chromium } = require('playwright');
const fs = require('fs');
const readline = require('readline');

async function saveDATOneSession() {
    console.log('🚀 DAT ONE Session Saver');
    console.log('This tool will help you save your DAT ONE login session for automated crawling.\n');
    
    const browser = await chromium.launch({ 
        headless: false,  // Always show browser for manual login
        slowMo: 500 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('🔗 Opening DAT ONE login page...');
        await page.goto('https://www.dat.com/login', { 
            waitUntil: 'load',  // Changed from networkidle to load
            timeout: 60000  // 60 seconds should be enough for basic load
        });
        
        console.log('\n📝 Please manually log in to DAT ONE in the browser window.');
        console.log('👆 Complete the login process, including any 2FA if required.');
        console.log('🔍 Navigate to the main dashboard or load search page.');
        console.log('✅ Once you see the main DAT ONE interface, press Enter here...\n');
        
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
        
        // Check if we're logged in by looking for common post-login elements
        console.log('🔍 Checking login status...');
        
        const currentUrl = page.url();
        console.log(`Current URL: ${currentUrl}`);
        
        // Check if we're still on login page
        if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
            console.log('⚠️ Warning: Still appears to be on login page. Please make sure you are logged in.');
        }
        
        // Try to find elements that would indicate successful login
        const possibleLoggedInElements = [
            'button[aria-label="User menu"]',
            'nav[role="navigation"]',
            '.dashboard',
            '[data-testid="user-menu"]',
            'button:has-text("Profile")',
            'button:has-text("Account")',
            'a:has-text("Search Loads")',
            'a:has-text("My Loads")'
        ];
        
        let loggedIn = false;
        for (const selector of possibleLoggedInElements) {
            try {
                const element = await page.$(selector);
                if (element) {
                    console.log(`✅ Found logged-in indicator: ${selector}`);
                    loggedIn = true;
                    break;
                }
            } catch (e) {
                // Continue checking other selectors
            }
        }
        
        if (!loggedIn) {
            console.log('⚠️ Could not confirm login status. Proceeding anyway...');
        }
        
        // Save the session
        console.log('💾 Saving session...');
        const sessionData = await context.storageState();
        fs.writeFileSync('session.json', JSON.stringify(sessionData, null, 2));
        
        console.log('✅ Session saved successfully to session.json');
        console.log('\n🎉 You can now use the automated DAT ONE crawler!');
        console.log('💡 Run: node src/index.js');
        
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
    saveDATOneSession();
}

module.exports = { saveDATOneSession }; 