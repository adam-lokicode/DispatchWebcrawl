const { chromium } = require('playwright');
const fs = require('fs');
const AIScreenshotAnalyzer = require('./ai-screenshot-analyzer');
const GmailAPI = require('./gmail-api');
require('dotenv').config();

/**
 * AI Scraper that uses existing session (no login required)
 * Just loads the session and starts clicking + analyzing
 */
class AISessionScraper {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.aiAnalyzer = new AIScreenshotAnalyzer({
            openaiApiKey: process.env.OPENAI_API_KEY
        });
        
        this.config = {
            headless: false, // Run with visible browser for Cloudflare verification
            timeout: 5000,
            maxLoadsToProcess: 5,
            clickDelay: 1000,
            sessionFile: 'session.json'
        };
    }

    log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data);
    }

    async initialize() {
        try {
            this.log('info', '🚀 Starting AI Session Scraper (using existing session)');
            
            // Initialize AI analyzer
            await this.aiAnalyzer.initializeDatabase();
            
            // Launch browser
            this.browser = await chromium.launch({
                headless: this.config.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            });

            // Use existing session
            if (fs.existsSync(this.config.sessionFile)) {
                this.context = await this.browser.newContext({ 
                    storageState: this.config.sessionFile 
                });
                this.log('info', '✅ Loaded existing session');
            } else {
                throw new Error('No session file found. Run save-session first.');
            }

            this.page = await this.context.newPage();
            await this.page.setViewportSize({ width: 1920, height: 1080 });
            
            this.log('info', '✅ Browser initialized with session');
            return true;

        } catch (error) {
            this.log('error', 'Initialization failed', { error: error.message });
            throw error;
        }
    }

    async navigateToLoadBoard() {
        try {
            this.log('info', '🚛 Navigating to load board (using working localhost navigation)');
            
            // Use the exact same navigation as your working localhost scraper
            await this.page.goto('https://one.dat.com/search-loads-ow', { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000  // Increased timeout to 60 seconds
            });
            
            // Wait a bit for any dynamic content to load
            await this.page.waitForTimeout(5000);
            
            this.log('info', '✅ Navigated to search-loads-ow page');
            
            // Check if we're on a login page (session expired)
            const isLoginPage = await this.checkForLoginPage();
            if (isLoginPage) {
                this.log('warn', '🔐 Session expired - on login page');
                
                // Try to log in automatically if credentials are available
                const loginSuccess = await this.handleLogin();
                if (!loginSuccess) {
                    throw new Error('Login required but failed. Please run save-session to create a new session.');
                }
                
                // Navigate to load board again after login
                await this.page.goto('https://one.dat.com/search-loads-ow', { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 60000 
                });
                await this.page.waitForTimeout(3000);
            }
            
            // Check for Cloudflare security check
            await this.handleCloudflareCheck();
            
            // Fill the search form with basic criteria (like localhost scraper does)
            await this.fillSearchForm();
            
            // Check if we have loads after search
            const hasLoads = await this.checkForLoads();
            if (hasLoads) {
                this.log('info', '✅ Found loads after search');
                return true;
            }
            
            this.log('warn', 'No loads found after search, but proceeding...');
            return true;

        } catch (error) {
            this.log('error', 'Navigation failed', { error: error.message });
            throw error;
        }
    }

    async checkForLoads() {
        // Look for the actual load rows visible in the screenshot
        const loadSelectors = [
            'tr:has-text("VR")', // Van/Reefer rows
            'tr:has-text("R ")', // Reefer rows  
            'tr:has-text("$")',  // Rows with dollar amounts
            '[data-testid*="load"]',
            '.load-row',
            'tbody tr',
            'tr:has(td)', // Any table row with cells
            '.similar-results tr', // Similar results section
            '[class*="result"] tr'
        ];

        for (const selector of loadSelectors) {
            try {
                const elements = await this.page.$$(selector);
                if (elements.length > 0) {
                    this.log('info', `Found ${elements.length} load elements with selector: ${selector}`);
                    
                    // Additional check: make sure these have load-like content
                    for (let i = 0; i < Math.min(elements.length, 3); i++) {
                        try {
                            const text = await elements[i].textContent();
                            if (text && (text.includes('$') || text.includes('VR') || text.includes('R ') || text.includes('lbs'))) {
                                this.log('info', `✅ Confirmed load data in row ${i + 1}: ${text.substring(0, 100)}...`);
                                return true;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        // Check for the "16 Similar Results" text as backup
        try {
            const resultsText = await this.page.textContent('body');
            if (resultsText && (resultsText.includes('Similar Results') || resultsText.includes('Results'))) {
                this.log('info', '✅ Found results text on page');
                return true;
            }
        } catch (e) {
            // Continue
        }
        
        this.log('warn', 'No load elements found');
        return false;
    }

    async checkForLoginPage() {
        const loginIndicators = [
            'text=Log In',
            'text=Email address',
            'text=To continue to your DAT account',
            'input[type="email"]',
            'button:has-text("CONTINUE")',
            'text=Sign up'
        ];

        for (const indicator of loginIndicators) {
            try {
                const element = await this.page.$(indicator);
                if (element) {
                    this.log('info', `🔍 Login page detected: ${indicator}`);
                    return true;
                }
            } catch (e) {
                continue;
            }
        }

        return false;
    }

    async handleLogin() {
        try {
            this.log('info', '🔐 Attempting automatic login...');
            
            const username = process.env.DAT_ONE_USERNAME;
            const password = process.env.DAT_ONE_PASSWORD;

            if (!username || !password) {
                this.log('error', '❌ No DAT credentials found in environment variables');
                this.log('info', '💡 Please set DAT_ONE_USERNAME and DAT_ONE_PASSWORD in .env file');
                this.log('info', '💡 Or run: npm run save-session to create a new session');
                return false;
            }

            // Take screenshot of login page
            await this.page.screenshot({ path: './output/ai-login-attempt.png', fullPage: true });
            this.log('info', '📸 Login page screenshot saved');

            // Fill email field
            const emailSelectors = [
                'input[type="email"]',
                'input[name="username"]',
                'input[placeholder*="Email"]',
                'input[placeholder*="email"]'
            ];

            let emailField = null;
            for (const selector of emailSelectors) {
                try {
                    emailField = await this.page.$(selector);
                    if (emailField) {
                        this.log('info', `✅ Found email field: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (emailField) {
                await emailField.fill(username);
                this.log('info', '✅ Email filled');
            } else {
                this.log('error', '❌ Could not find email field');
                return false;
            }

            // Click continue button
            const continueSelectors = [
                'button:has-text("CONTINUE")',
                'button:has-text("Continue")',
                'button[type="submit"]',
                'input[type="submit"]'
            ];

            let continueButton = null;
            for (const selector of continueSelectors) {
                try {
                    continueButton = await this.page.$(selector);
                    if (continueButton) {
                        this.log('info', `✅ Found continue button: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (continueButton) {
                await continueButton.click();
                this.log('info', '✅ Clicked continue button');
                await this.page.waitForTimeout(3000);
            }

            // Look for password field (might appear after clicking continue)
            const passwordSelectors = [
                'input[type="password"]',
                'input[name="password"]',
                'input[placeholder*="Password"]',
                'input[placeholder*="password"]'
            ];

            let passwordField = null;
            for (const selector of passwordSelectors) {
                try {
                    passwordField = await this.page.waitForSelector(selector, { timeout: 5000 });
                    if (passwordField) {
                        this.log('info', `✅ Found password field: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (passwordField) {
                await passwordField.fill(password);
                this.log('info', '✅ Password filled');

                // Click login/submit button
                const loginSelectors = [
                    'button:has-text("Sign In")',
                    'button:has-text("Log In")',
                    'button:has-text("LOGIN")',
                    'button[type="submit"]',
                    'input[type="submit"]'
                ];

                for (const selector of loginSelectors) {
                    try {
                        const button = await this.page.$(selector);
                        if (button) {
                            await button.click();
                            this.log('info', `✅ Clicked login button: ${selector}`);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }

            // Wait for login to complete
            await this.page.waitForTimeout(5000);

            // Check for MFA/Security prompt
            const mfaHandled = await this.handleMFAPrompt();
            if (mfaHandled) {
                // Wait a bit more after handling MFA
                await this.page.waitForTimeout(3000);
            }

            // Try to select email verification method first
            await this.selectEmailVerification();
            
            // Check for email verification
            const needsVerification = await this.checkForEmailVerification();
            if (needsVerification) {
                const gmailUser = process.env.GMAIL_USERNAME;
                const gmailPass = process.env.GMAIL_PASSWORD;
                await this.handleEmailVerification(gmailUser, gmailPass);
            }

            // Check if login was successful
            const stillOnLogin = await this.checkForLoginPage();
            if (!stillOnLogin) {
                this.log('info', '✅ Login appears successful');
                return true;
            } else {
                this.log('warn', '⚠️ Still on login page after login attempt');
                return false;
            }

        } catch (error) {
            this.log('error', 'Login attempt failed', { error: error.message });
            return false;
        }
    }

    async handleMFAPrompt() {
        try {
            this.log('info', '🔍 Checking for MFA/Security prompts...');

            // Check for MFA security prompt
            const mfaIndicators = [
                'text=Enable Stronger Security',
                'text=Make My Account Safer',
                'text=Remind Me Later',
                'text=Email-based authentication is vulnerable',
                'text=stronger MFA method'
            ];

            let hasMFAPrompt = false;
            for (const indicator of mfaIndicators) {
                try {
                    const element = await this.page.$(indicator);
                    if (element) {
                        this.log('info', `🔒 MFA security prompt detected: ${indicator}`);
                        hasMFAPrompt = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!hasMFAPrompt) {
                this.log('info', '✅ No MFA prompt detected');
                return false;
            }

            // Take screenshot of MFA prompt
            await this.page.screenshot({ path: './output/mfa-security-prompt.png', fullPage: true });
            this.log('info', '📸 MFA prompt screenshot saved');

            // Click "Remind Me Later" to skip MFA setup for now
            const remindLaterSelectors = [
                'button:has-text("Remind Me Later")',
                'text=Remind Me Later',
                '[role="button"]:has-text("Remind Me Later")'
            ];

            let remindButton = null;
            for (const selector of remindLaterSelectors) {
                try {
                    remindButton = await this.page.$(selector);
                    if (remindButton) {
                        this.log('info', `✅ Found "Remind Me Later" button: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (remindButton) {
                await remindButton.click();
                this.log('info', '✅ Clicked "Remind Me Later" - skipping MFA setup');
                await this.page.waitForTimeout(3000);
                
                // Take screenshot after clicking
                await this.page.screenshot({ path: './output/after-mfa-skip.png', fullPage: true });
                this.log('info', '📸 Post-MFA screenshot saved');
                
                return true;
            } else {
                this.log('warn', '⚠️ Could not find "Remind Me Later" button');
                
                // Try alternative approach - look for close/skip buttons
                const skipSelectors = [
                    'button[aria-label="Close"]',
                    'button:has-text("Skip")',
                    'button:has-text("Not Now")',
                    '.close-button',
                    '[data-testid="close"]'
                ];

                for (const selector of skipSelectors) {
                    try {
                        const button = await this.page.$(selector);
                        if (button) {
                            await button.click();
                            this.log('info', `✅ Clicked skip button: ${selector}`);
                            return true;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                this.log('warn', '⚠️ Could not skip MFA prompt automatically');
                this.log('info', '💡 MANUAL ACTION REQUIRED:');
                this.log('info', '🔒 Please manually click "Remind Me Later" in the browser window');
                this.log('info', '⏳ Waiting 15 seconds for manual action...');
                
                await this.page.waitForTimeout(15000);
                return true;
            }

        } catch (error) {
            this.log('warn', 'MFA prompt handling failed', { error: error.message });
            return false;
        }
    }

    async selectEmailVerification() {
        try {
            this.log('info', '🔄 Attempting to select email verification method...');
            
            // Wait a moment for page to load
            await this.page.waitForTimeout(2000);
            
            // Take screenshot to see current state
            await this.page.screenshot({ path: './output/ai-verification-method-selection.png', fullPage: true });
            this.log('info', '📸 Verification method selection screenshot saved');
            
            // Look for "Try Another Method" button
            const tryAnotherSelectors = [
                'button:has-text("Try Another Method")',
                'button:has-text("TRY ANOTHER METHOD")',
                'a:has-text("Try Another Method")',
                'a:has-text("TRY ANOTHER METHOD")',
                '[role="button"]:has-text("Try Another Method")'
            ];
            
            let tryAnotherButton = null;
            for (const selector of tryAnotherSelectors) {
                try {
                    tryAnotherButton = await this.page.$(selector);
                    if (tryAnotherButton) {
                        this.log('info', `✅ Found "Try Another Method" button: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (tryAnotherButton) {
                await tryAnotherButton.click();
                this.log('info', '✅ Clicked "Try Another Method"');
                await this.page.waitForTimeout(2000);
                
                // Now look for email option
                const emailSelectors = [
                    'button:has-text("Email")',
                    'a:has-text("Email")',
                    '[role="button"]:has-text("Email")',
                    'text="Email"',
                    'span:has-text("Email")',
                    'div:has-text("Email")'
                ];
                
                for (const selector of emailSelectors) {
                    try {
                        const emailOption = await this.page.waitForSelector(selector, { timeout: 2000 });
                        if (emailOption) {
                            this.log('info', `📧 Found email option, clicking: ${selector}`);
                            await emailOption.click();
                            await this.page.waitForTimeout(1000);
                            this.log('info', '✅ Successfully selected email verification method');
                            
                            // Take screenshot after selection
                            await this.page.screenshot({ path: './output/ai-after-email-selection.png', fullPage: true });
                            this.log('info', '📸 After email selection screenshot saved');
                            
                            return true;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                this.log('warn', 'Found "Try Another Method" but could not find email option');
            } else {
                this.log('info', 'No "Try Another Method" button found - might already be on email verification');
            }
            
            return false;
        } catch (error) {
            this.log('warn', 'Error in email verification selection:', error.message);
            return false;
        }
    }

    async checkForEmailVerification() {
        try {
            this.log('info', '🔍 Checking for email verification prompt...');
            
            // Wait a moment for the page to load after form submission
            await this.page.waitForTimeout(2000);
            
            // Take a screenshot to see what's on the page
            await this.page.screenshot({ path: './output/ai-verification-check.png', fullPage: true });
            this.log('info', '📸 Verification check screenshot saved');
            
            // Look for common email verification indicators
            const verificationSelectors = [
                'input[placeholder*="code" i]',
                'input[placeholder*="verification" i]',
                'input[name*="code" i]',
                'input[id*="code" i]',
                'input[type="text"][maxlength="6"]',
                'input[type="text"][maxlength="4"]',
                'text="Enter the code"',
                'text="Check your email"',
                'text="verification code"',
                'text="Enter verification code"',
                'text="We sent you a code"'
            ];

            let foundVerification = false;
            for (const selector of verificationSelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        this.log('info', `📧 Email verification detected: ${selector}`);
                        foundVerification = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Also check URL
            const currentUrl = this.page.url();
            if (!foundVerification && (currentUrl.includes('verify') || currentUrl.includes('challenge'))) {
                this.log('info', '📧 Email verification likely required based on URL');
                foundVerification = true;
            }

            return foundVerification;
        } catch (error) {
            this.log('error', 'Error checking for email verification', { error: error.message });
            return false;
        }
    }

    async handleEmailVerification(gmailUser, gmailPass) {
        try {
            this.log('info', '📧 Handling email verification with Gmail API');

            if (!gmailUser || !gmailPass) {
                this.log('error', '❌ Gmail credentials not found');
                this.log('info', '💡 Please set GMAIL_USERNAME and GMAIL_PASSWORD in .env file');
                return false;
            }

            // Try to click resend to get a fresh code
            try {
                this.log('info', '🔄 Clicking resend for fresh verification code...');
                const resendButton = await this.page.waitForSelector('button:has-text("Resend"), a:has-text("Resend")', { timeout: 3000 });
                if (resendButton) {
                    await resendButton.click();
                    this.log('info', '✅ Clicked Resend - fresh code should arrive');
                    await this.page.waitForTimeout(2000);
                }
            } catch (e) {
                this.log('info', 'No resend button found, proceeding...');
            }

            // Use Gmail API to get verification code
            this.log('info', '🔑 Using Gmail API to fetch verification code...');
            const gmailAPI = new GmailAPI();
            const authenticated = await gmailAPI.authenticate();
            
            if (authenticated) {
                this.log('info', '✅ Gmail API authenticated, searching for verification code...');
                const code = await gmailAPI.waitForVerificationCode(60, 2); // Wait 1 min, check every 2 sec
                
                if (code) {
                    this.log('info', `✅ Found verification code: ${code}`);
                    await this.enterVerificationCode(code);
                    return true;
                } else {
                    this.log('error', '❌ No verification code found in Gmail');
                    return false;
                }
            } else {
                this.log('error', '❌ Gmail API authentication failed');
                return false;
            }

        } catch (error) {
            this.log('error', 'Email verification failed', { error: error.message });
            return false;
        }
    }

    async enterVerificationCode(code) {
        try {
            this.log('info', `🔑 Entering verification code: ${code}`);

            // Look for verification code input field
            const codeSelectors = [
                'input[placeholder*="code" i]',
                'input[placeholder*="verification" i]',
                'input[name*="code" i]',
                'input[id*="code" i]',
                'input[type="text"][maxlength="6"]',
                'input[type="text"][maxlength="4"]'
            ];

            let codeField = null;
            for (const selector of codeSelectors) {
                try {
                    codeField = await this.page.$(selector);
                    if (codeField) {
                        this.log('info', `✅ Found code field: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (codeField) {
                await codeField.fill(code);
                this.log('info', '✅ Verification code entered');

                // Look for submit button
                const submitSelectors = [
                    'button[type="submit"]',
                    'button:has-text("Verify")',
                    'button:has-text("Submit")',
                    'button:has-text("Continue")',
                    'input[type="submit"]'
                ];

                for (const selector of submitSelectors) {
                    try {
                        const button = await this.page.$(selector);
                        if (button) {
                            await button.click();
                            this.log('info', `✅ Clicked submit button: ${selector}`);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }

                // Wait for verification to process
                await this.page.waitForTimeout(3000);
                return true;
            } else {
                this.log('error', '❌ Could not find verification code input field');
                return false;
            }

        } catch (error) {
            this.log('error', 'Error entering verification code', { error: error.message });
            return false;
        }
    }

    async handleCloudflareCheck() {
        try {
            this.log('info', '🔍 Checking for Cloudflare security verification...');
            
            // Check if we're on a Cloudflare challenge page
            const cloudflareIndicators = [
                'text=Verify you are human',
                'text=login.dat.com needs to review the security',
                'input[type="checkbox"]',
                '.cf-challenge',
                '[data-ray]'
            ];
            
            let isCloudflareChallenge = false;
            for (const indicator of cloudflareIndicators) {
                try {
                    const element = await this.page.$(indicator);
                    if (element) {
                        this.log('info', `🔒 Cloudflare challenge detected: ${indicator}`);
                        isCloudflareChallenge = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!isCloudflareChallenge) {
                this.log('info', '✅ No Cloudflare challenge detected');
                return;
            }
            
            // Take screenshot of the challenge
            await this.page.screenshot({ path: './output/cloudflare-challenge.png', fullPage: true });
            this.log('info', '📸 Cloudflare challenge screenshot saved');
            
            // Look for the verification checkbox
            this.log('info', '🔍 Looking for verification checkbox...');
            const checkboxSelectors = [
                'input[type="checkbox"]',
                'label input[type="checkbox"]',
                '.cf-turnstile input',
                '[role="checkbox"]'
            ];
            
            let checkbox = null;
            for (const selector of checkboxSelectors) {
                try {
                    checkbox = await this.page.$(selector);
                    if (checkbox) {
                        this.log('info', `✅ Found checkbox: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Manual verification approach
            this.log('info', '👤 MANUAL ACTION REQUIRED:');
            this.log('info', '🔒 Please manually click the Cloudflare verification checkbox in the browser window');
            this.log('info', '⏳ Waiting 30 seconds for you to complete the verification...');
            this.log('info', '💡 The AI scraper will automatically continue once verification is complete');
            
            // Wait for manual verification
            await this.page.waitForTimeout(30000); // Wait 30 seconds for manual verification
            
            // Take screenshot after verification
            await this.page.screenshot({ path: './output/after-cloudflare-verification.png', fullPage: true });
            this.log('info', '📸 Post-verification screenshot saved');
            
            // Check if we've moved past the challenge
            const stillOnChallenge = await this.page.$('text=Verify you are human');
            if (stillOnChallenge) {
                this.log('warn', '⚠️ Still on Cloudflare challenge page. Waiting additional 15 seconds...');
                await this.page.waitForTimeout(15000);
            }
            
            this.log('info', '✅ Proceeding with assumption that Cloudflare verification is completed');
            
        } catch (error) {
            this.log('warn', 'Cloudflare check failed', { error: error.message });
            // Continue anyway - might not be needed
        }
    }

    async fillSearchForm() {
        try {
            this.log('info', '📝 Filling search form (using proven working localhost logic)');
            
            // Take screenshot for debugging
            await this.page.screenshot({ path: './output/ai-search-form-debug.png', fullPage: true });
            
            // Fill Origin field using the exact data-test attribute (WORKING CODE FROM LOCALHOST)
            this.log('info', '🔍 Looking for Origin field with data-test="origin-input"...');
            const originField = await this.page.waitForSelector('input[data-test="origin-input"]', { timeout: 10000 });
            
            if (originField) {
                this.log('info', '✅ Found origin field with data-test="origin-input"');
                await originField.click();
                await originField.fill(''); // Clear first
                await originField.fill('Denver, CO');
                await this.page.waitForTimeout(300);
                this.log('info', '✅ Filled origin: Denver, CO');
            } else {
                throw new Error('Origin field not found with data-test="origin-input"');
            }
            
            // Fill Destination field using the exact data-test attribute (WORKING CODE FROM LOCALHOST)
            this.log('info', '🔍 Looking for Destination field with data-test="destination-input"...');
            const destinationField = await this.page.waitForSelector('input[data-test="destination-input"]', { timeout: 10000 });
            
            if (destinationField) {
                this.log('info', '✅ Found destination field with data-test="destination-input"');
                await destinationField.click();
                await destinationField.fill(''); // Clear first
                await destinationField.fill('San Francisco, CA');
                await this.page.waitForTimeout(300);
                this.log('info', '✅ Filled destination: San Francisco, CA');
            } else {
                throw new Error('Destination field not found with data-test="destination-input"');
            }
            
            // Set date range to today (14th) as requested
            this.log('info', '📅 Setting date range to 14th...');
            try {
                const dateField = await this.page.$('input[placeholder*="date"], .mat-datepicker-input');
                if (dateField) {
                    await dateField.click();
                    await dateField.fill('9/14/2025');
                    await this.page.waitForTimeout(300);
                    this.log('info', '✅ Set date to 9/14/2025');
                }
            } catch (e) {
                this.log('info', 'Date field not found, using default dates');
            }
            
            // Fill Equipment Type - REQUIRED for search to work (WORKING CODE FROM LOCALHOST)
            this.log('info', '🔍 Looking for Equipment Type field (REQUIRED for search)...');
            try {
                // Target the specific equipment input we saw in debug output
                let equipmentField = null;
                const equipmentSelectors = [
                    'input[id^="mat-chip-list-input"]',  // Any mat-chip-list-input ID
                    'label:has-text("Equipment Type*") + * input',  // Input after Equipment Type label
                    'mat-form-field:has(mat-label:text("Equipment Type*")) input',  // Input within Equipment Type form field
                    '#mat-chip-list-input-3',  // The specific ID from your HTML
                    'input[placeholder="Equipment"]',  // Fallback placeholder
                    'input[id*="chip-list-input"]'  // General chip list input
                ];
                
                for (const selector of equipmentSelectors) {
                    try {
                        equipmentField = await this.page.$(selector);
                        if (equipmentField) {
                            this.log('info', `✅ Found equipment field with selector: ${selector}`);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                if (equipmentField) {
                    // Try JavaScript-based interaction for invisible Angular Material elements
                    this.log('debug', 'Using JavaScript to interact with equipment field...');
                    
                    // Use JavaScript to focus and fill the field directly
                    const jsResult = await this.page.evaluate(() => {
                        // Try multiple selectors in JavaScript
                        const selectors = [
                            'input[id^="mat-chip-list-input"]',
                            '#mat-chip-list-input-3',
                            'input[placeholder="Equipment"]',
                            'input[id*="chip-list-input"]'
                        ];
                        
                        for (const selector of selectors) {
                            const field = document.querySelector(selector);
                            if (field) {
                                // Make sure it's visible and focusable
                                field.style.visibility = 'visible';
                                field.style.display = 'block';
                                field.style.opacity = '1';
                                
                                // Focus and trigger events
                                field.focus();
                                field.click();
                                
                                // Trigger input events
                                field.dispatchEvent(new Event('focus', { bubbles: true }));
                                field.dispatchEvent(new Event('click', { bubbles: true }));
                                
                                return { success: true, selector: selector };
                            }
                        }
                        return { success: false };
                    });
                    
                    this.log('info', '✅ JavaScript interaction completed');
                    await this.page.waitForTimeout(500);
                    
                    // Type "Reefer" using JavaScript to trigger autocomplete
                    await this.page.evaluate(() => {
                        // Find the equipment field dynamically
                        const selectors = [
                            'input[id^="mat-chip-list-input"]',
                            '#mat-chip-list-input-3',
                            'input[placeholder="Equipment"]'
                        ];
                        
                        for (const selector of selectors) {
                            const field = document.querySelector(selector);
                            if (field) {
                                field.value = 'Reefer';
                                field.dispatchEvent(new Event('input', { bubbles: true }));
                                field.dispatchEvent(new Event('change', { bubbles: true }));
                                field.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
                                field.dispatchEvent(new KeyboardEvent('keyup', { key: 'r', bubbles: true }));
                                return true;
                            }
                        }
                        return false;
                    });
                    
                    this.log('info', '✅ Typed "Reefer" using JavaScript');
                    await this.page.waitForTimeout(200); // Quick wait for dropdown
                    
                    // Look for autocomplete options
                    try {
                        // Try multiple variations of Reefer options
                        const reeferOptions = [
                            'mat-option:has-text("Reefer")',
                            'mat-option:has-text("Reefers")', 
                            'mat-option:contains("Reefer")',
                            '[role="option"]:has-text("Reefer")'
                        ];
                        
                        let optionSelected = false;
                        for (const optionSelector of reeferOptions) {
                            try {
                                const option = await this.page.waitForSelector(optionSelector, { timeout: 1000 });
                                if (option) {
                                    await option.click();
                                    this.log('info', `✅ Selected Reefer option with selector: ${optionSelector}`);
                                    optionSelected = true;
                                    break;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        
                        if (!optionSelected) {
                            // If no dropdown option found, try pressing Enter
                            await this.page.keyboard.press('Enter');
                            this.log('info', '✅ Pressed Enter for Reefer selection');
                        }
                        
                    } catch (e) {
                        // Fallback: press Tab to confirm selection
                        await this.page.keyboard.press('Tab');
                        this.log('info', '✅ Pressed Tab to confirm Reefer selection');
                    }
                    
                    // Wait a moment for the selection to register
                    await this.page.waitForTimeout(500);
                    
                } else {
                    throw new Error('Equipment field not found with any selector - search will fail!');
                }
            } catch (e) {
                this.log('error', `❌ Equipment field handling failed: ${e.message}`);
                this.log('warn', '⚠️ Continuing anyway to test search button...');
                // Don't throw - let's see if search works without equipment
            }
            
            // Click the SEARCH button (WORKING CODE FROM LOCALHOST)
            const searchSelectors = [
                'button:has-text("SEARCH")',
                'button:text("SEARCH")',
                'button[type="submit"]',
                'input[type="submit"]',
                'button[aria-label*="search"]',
                '.search-button',
                '#search-button'
            ];
            
            let searchButton = null;
            for (const selector of searchSelectors) {
                try {
                    searchButton = await this.page.$(selector);
                    if (searchButton) {
                        this.log('info', `✅ Found search button with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (searchButton) {
                this.log('info', '🔍 Attempting to click SEARCH button...');
                
                // Try multiple click strategies
                try {
                    // Strategy 1: Normal click
                    await searchButton.click({ timeout: 3000 });
                    this.log('info', '✅ Clicked SEARCH button normally');
                } catch (e1) {
                    try {
                        // Strategy 2: Force click
                        await searchButton.click({ force: true, timeout: 3000 });
                        this.log('info', '✅ Force-clicked SEARCH button');
                    } catch (e2) {
                        try {
                            // Strategy 3: JavaScript click
                            await searchButton.evaluate(el => el.click());
                            this.log('info', '✅ JavaScript-clicked SEARCH button');
                        } catch (e3) {
                            // Strategy 4: Try pressing Enter on the form
                            await this.page.keyboard.press('Enter');
                            this.log('info', '✅ Pressed Enter to submit search');
                        }
                    }
                }
                
                // Wait for search results to load
                this.log('info', '⏳ Waiting for search results to load...');
                await this.page.waitForTimeout(8000); // Longer wait for results
                
                // Take screenshot after search
                await this.page.screenshot({ 
                    path: './output/after-search-results.png', 
                    fullPage: true 
                });
                this.log('info', '📸 Screenshot taken after search');
                
            } else {
                this.log('error', '❌ No search button found - search cannot proceed');
                throw new Error('Search button not found with any selector');
            }
            
            this.log('info', '✅ Search form completed successfully');
            
        } catch (error) {
            this.log('error', 'Search form filling failed', { error: error.message });
            throw error; // Re-throw to handle upstream
        }
    }

    async startAIClickingExtraction() {
        try {
            this.log('info', '🤖 Starting AI clicking extraction');

            // Take full-page screenshot to capture ALL loads
            this.log('info', '📸 Capturing full page with all visible loads');
            const screenshotResult = await this.aiAnalyzer.captureAndStoreScreenshot(this.page, {
                url: this.page.url(),
                pageType: 'full-loadboard',
                state: 'all-loads-visible'
            });
            
            if (screenshotResult.success) {
                this.log('info', '🤖 Analyzing full page to extract ALL visible loads');
                
                // Try to extract ALL loads from the full page first
                const fullPageAnalysis = await this.aiAnalyzer.analyzeScreenshot(screenshotResult.id, {
                    extractionMode: 'full-page',
                    instruction: 'Extract ALL visible freight loads from this page, including both main results and similar results. Look for all loads with rates, origins, destinations, and company information. There should be multiple loads visible.'
                });
                
                if (fullPageAnalysis.success && fullPageAnalysis.extractedLoads > 1) {
                    this.log('info', `🎉 Successfully extracted ${fullPageAnalysis.extractedLoads} loads from full page!`);
                    this.log('info', `Sample: ${fullPageAnalysis.sampleLoad || 'N/A'}`);
                    return { processedLoads: 1, extractedLoads: fullPageAnalysis.extractedLoads };
                } else {
                    this.log('warn', '⚠️ Full page analysis only found 1 or fewer loads, trying individual row method...');
                }
            }

            // Find clickable load rows (updated to match actual page structure)
            const rowSelectors = [
                'tr:has-text("$")', // Rows with dollar amounts (most specific)
                'tbody tr', // Table rows in tbody
                'tr:has(td)', // Any table row with cells
                'tr:has-text("RM")', // Rate per mile rows
                'tr:has-text("R ")', // Reefer rows
                'tr:has-text("VR")', // Van/Reefer rows
                '[data-testid*="load"]',
                '.load-row',
                '.row-cells',
                '[class*="row-cells"]',
                // Additional selectors for similar results
                '[class*="similar"] tr',
                '.similar-results tr',
                'tr[class*="result"]'
            ];

            let loadRows = [];
            let usedSelector = null;

            for (const selector of rowSelectors) {
                try {
                    const rows = await this.page.$$(selector);
                    if (rows.length > 0) {
                        // Filter rows to only include those with load data
                        const validRows = [];
                        for (const row of rows) {
                            try {
                                const text = await row.textContent();
                                // More comprehensive filtering for load rows
                                if (text && (
                                    text.includes('$') || 
                                    text.includes('RM') || // Rate per mile
                                    text.includes('R ') || // Reefer
                                    text.includes('VR') || // Van/Reefer
                                    text.includes('lbs') || 
                                    text.includes('mi') ||
                                    (text.includes('Logistics') && text.includes('CO')) || // Company names with locations
                                    (text.includes(',') && text.includes('CA')) // Location patterns
                                )) {
                                    // Additional check to avoid header rows
                                    if (!text.includes('Age') && !text.includes('Rate') && !text.includes('Trip') && !text.includes('Sort by')) {
                                        validRows.push(row);
                                        this.log('debug', `Valid load row found: ${text.substring(0, 80)}...`);
                                    }
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        
                        if (validRows.length > 0) {
                            loadRows = validRows;
                            usedSelector = selector;
                            this.log('info', `Found ${validRows.length} clickable load rows with: ${selector}`);
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            if (loadRows.length === 0) {
                this.log('error', 'No clickable load rows found');
                
                // Take debug screenshot
                await this.page.screenshot({ 
                    path: './output/ai-debug-no-clickable-rows.png', 
                    fullPage: true 
                });
                this.log('info', '📸 Debug screenshot saved');
                
                return { processedLoads: 0, extractedLoads: 0 };
            }

            const loadsToProcess = Math.min(loadRows.length, this.config.maxLoadsToProcess);
            let processedLoads = 0;
            let totalExtractedLoads = 0;

            this.log('info', `Processing ${loadsToProcess} loads...`);

            for (let i = 0; i < loadsToProcess; i++) {
                this.log('info', `📋 Processing load ${i + 1}/${loadsToProcess}`);

                try {
                    // Re-find rows (DOM might change)
                    const currentRows = await this.page.$$(usedSelector);
                    if (i >= currentRows.length) {
                        this.log('warn', 'Row no longer exists, skipping');
                        continue;
                    }

                    const row = currentRows[i];

                    // Scroll into view
                    await row.scrollIntoViewIfNeeded();
                    await this.page.waitForTimeout(500);

                    // Click to expand
                    this.log('info', '👆 Clicking to expand load details');
                    await row.click();
                    await this.page.waitForTimeout(this.config.clickDelay);

                    // Take screenshot of expanded state
                    this.log('info', '📸 Taking screenshot of expanded load');
                    const screenshot = await this.aiAnalyzer.captureAndStoreScreenshot(this.page, {
                        url: this.page.url(),
                        pageType: 'expanded-load',
                        loadIndex: i,
                        state: 'after-click'
                    });

                    // Analyze with AI
                    this.log('info', '🤖 Analyzing with AI');
                    const extractedLoads = await this.aiAnalyzer.analyzeScreenshot(screenshot.id);

                    if (extractedLoads.length > 0) {
                        totalExtractedLoads += extractedLoads.length;
                        this.log('info', `✅ Extracted ${extractedLoads.length} loads`);
                        
                        // Log first load for verification
                        if (extractedLoads[0]) {
                            this.log('info', `Sample: ${extractedLoads[0].company || 'N/A'} - ${extractedLoads[0].origin || 'N/A'} to ${extractedLoads[0].destination || 'N/A'}`);
                        }
                    } else {
                        this.log('warn', 'No loads extracted');
                    }

                    // Click elsewhere to collapse (optional)
                    try {
                        await this.page.click('body');
                        await this.page.waitForTimeout(300);
                    } catch (e) {
                        // Ignore collapse errors
                    }

                    processedLoads++;

                } catch (error) {
                    this.log('error', `Error processing load ${i + 1}: ${error.message}`);
                    continue;
                }
            }

            this.log('info', '🎉 AI clicking extraction completed!');
            this.log('info', `📊 Processed: ${processedLoads} loads`);
            this.log('info', `🚚 Extracted: ${totalExtractedLoads} loads`);

            return { processedLoads, extractedLoads: totalExtractedLoads };

        } catch (error) {
            this.log('error', 'AI extraction failed', { error: error.message });
            throw error;
        }
    }

    async exportData() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputPath = `./output/ai-session-loads-${timestamp}.csv`;
            
            await this.aiAnalyzer.exportToCSV(outputPath);
            this.log('info', `📊 Data exported to ${outputPath}`);
            
            return outputPath;
        } catch (error) {
            this.log('error', 'Export failed', { error: error.message });
            return null;
        }
    }

    async getStats() {
        return await this.aiAnalyzer.getStats();
    }

    async close() {
        try {
            if (this.browser) {
                await this.browser.close();
            }
            await this.aiAnalyzer.close();
            this.log('info', '✅ AI Session scraper closed');
        } catch (error) {
            this.log('error', 'Cleanup error', { error: error.message });
        }
    }
}

// Main execution
async function main() {
    const scraper = new AISessionScraper();
    
    try {
        await scraper.initialize();
        await scraper.navigateToLoadBoard();
        
        const results = await scraper.startAIClickingExtraction();
        
        if (results.extractedLoads > 0) {
            await scraper.exportData();
        }
        
        const stats = await scraper.getStats();
        console.log('\n📈 Final Statistics:', JSON.stringify(stats, null, 2));
        
    } catch (error) {
        console.error('❌ Scraper failed:', error.message);
    } finally {
        await scraper.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = AISessionScraper;
