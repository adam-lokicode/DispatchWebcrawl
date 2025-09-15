const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const GmailAPI = require('./gmail-api');
require('dotenv').config();

// Localhost-specific configuration
const CONFIG = {
    intervalSeconds: 30,
    maxEntries: 25,
    outputFile: 'dat_one_loads_localhost.csv',
    headless: true, // Run headless for efficiency
    timeout: 10000, // Very fast timeout for testing
    maxRetries: 3,
    healthCheckPort: 8080,
    
    // Email verification settings
    emailCheckInterval: 2000, // Check email every 2 seconds (faster)
    emailMaxWait: 120000, // Wait max 2 minutes for email (faster)
};

class LocalhostScraper {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.isLoggedIn = false;
    }

    log(level, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, level: level.toUpperCase(), message, ...data };
        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data);
    }

    async initialize() {
        try {
            this.log('info', '🏠 LOCALHOST: Starting browser for automated login with email verification');
            
            this.browser = await chromium.launch({
                headless: CONFIG.headless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            });

            this.context = await this.browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            this.page = await this.context.newPage();
            this.log('info', '✅ Browser initialized successfully');
            return true;

        } catch (error) {
            this.log('error', 'Browser initialization failed', { error: error.message });
            throw error;
        }
    }

    async loginToDAT() {
        try {
            this.log('info', '🔐 Starting automated DAT.com login process');

            // Check for required credentials
            const username = process.env.DAT_ONE_USERNAME;
            const password = process.env.DAT_ONE_PASSWORD;
            const gmailUser = process.env.GMAIL_USERNAME;
            const gmailPass = process.env.GMAIL_PASSWORD;

            if (!username || !password) {
                throw new Error('Missing DAT credentials. Set DAT_ONE_USERNAME and DAT_ONE_PASSWORD in .env');
            }

            if (!gmailUser || !gmailPass) {
                this.log('warn', 'Gmail credentials not found. You will need to manually enter verification codes.');
            }

            // Navigate directly to DAT One login (simplified approach)
            this.log('info', '🌐 Navigating directly to DAT One login page');
            
            try {
                // Go straight to the DAT One login page to avoid dual tabs
                await this.page.goto('https://one.dat.com/login', { 
                    waitUntil: 'load', 
                    timeout: 30000 
                });
                this.log('info', '✅ Loaded DAT One login page directly');
                
                // Wait for page to fully render (faster)
                await this.page.waitForTimeout(300);
                
                // Take initial screenshot
                await this.page.screenshot({ path: './output/initial-login-page.png', fullPage: true });
                this.log('info', '📸 Initial page screenshot saved');
                
                // Check if we have the username field
                const hasUsernameField = await this.page.$('input[name="username"], #username');
                if (hasUsernameField) {
                    this.log('info', '✅ Username field found on direct navigation!');
                    
                    // Look for modal, overlay, or iframe that might contain the login form
                    const modalSelectors = [
                        '[role="dialog"]',
                        '.modal',
                        '.overlay',
                        '.popup',
                        'iframe',
                        '[class*="modal"]',
                        '[class*="dialog"]',
                        '[class*="overlay"]',
                        '[id*="modal"]',
                        '[id*="dialog"]'
                    ];
                    
                    let foundModal = false;
                    for (const selector of modalSelectors) {
                        try {
                            const modal = await this.page.$(selector);
                            if (modal) {
                                this.log('info', `✅ Found modal/overlay with selector: ${selector}`);
                                foundModal = true;
                                
                                // If it's an iframe, we need to switch context
                                if (selector === 'iframe') {
                                    this.log('info', '🖼️ Switching to iframe context');
                                    const frame = await modal.contentFrame();
                                    if (frame) {
                                        this.page = frame; // Switch context to iframe
                                        await this.page.waitForTimeout(2000);
                                    }
                                }
                                break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                    
                    if (!foundModal) {
                        this.log('info', '🔍 No modal found, checking if login form appeared on current page');
                    }
                    
                    // Take a screenshot after clicking to see what happened
                    await this.page.screenshot({ path: './output/after-click-debug.png', fullPage: true });
                    this.log('info', '📸 Screenshot after click saved to output/after-click-debug.png');
                    
                    const currentUrl = this.page.url();
                    this.log('info', `Current URL after click: ${currentUrl}`);
                } else {
                    this.log('warn', '⚠️ Username field not found on direct navigation');
                    throw new Error('Could not find username field on DAT One login page');
                }
                
            } catch (error) {
                this.log('error', `Navigation failed: ${error.message}`);
                throw error;
            }

            // Debug: Let's see what's on the page now
            this.log('info', '🔍 Analyzing login form structure');
            const currentUrl = this.page.url();
            this.log('info', `Current URL: ${currentUrl}`);
            
            // Take a screenshot for debugging
            await this.page.screenshot({ path: './output/login-form-debug.png', fullPage: true });
            this.log('info', '📸 Screenshot saved to output/login-form-debug.png');
            
            // Check what input fields are available now - look both on page and in modal
            const inputFields = await this.page.$$eval('input', inputs => 
                inputs.map(input => ({
                    type: input.type,
                    name: input.name,
                    id: input.id,
                    placeholder: input.placeholder,
                    className: input.className
                }))
            );
            this.log('info', '🔍 Found input fields on main page:', { inputFields });
            
            // Enhanced modal debugging - check all possible modal containers
            const modalSelectors = ['[role="dialog"]', '.modal', '[class*="modal"]', '[id*="modal"]', 'dialog'];
            
            for (const modalSelector of modalSelectors) {
                try {
                    const modalExists = await this.page.$(modalSelector);
                    if (modalExists) {
                        this.log('info', `🔍 Found modal with selector: ${modalSelector}`);
                        
                        // Get detailed info about this modal
                        const modalInfo = await this.page.$eval(modalSelector, (modal) => ({
                            tagName: modal.tagName,
                            className: modal.className,
                            id: modal.id,
                            innerHTML: modal.innerHTML.substring(0, 500) + '...', // First 500 chars
                            childElementCount: modal.childElementCount,
                            isVisible: modal.offsetParent !== null
                        }));
                        this.log('info', `📋 Modal details for ${modalSelector}:`, modalInfo);
                        
                        // Check for input fields within this specific modal
                        const modalInputs = await this.page.$$eval(`${modalSelector} input`, inputs => 
                            inputs.map(input => ({
                                type: input.type,
                                name: input.name,
                                id: input.id,
                                placeholder: input.placeholder,
                                className: input.className,
                                inputMode: input.inputMode,
                                autocomplete: input.autocomplete,
                                value: input.value,
                                required: input.required,
                                autofocus: input.autofocus,
                                ariaLabelledBy: input.getAttribute('aria-labelledby'),
                                isVisible: input.offsetParent !== null,
                                outerHTML: input.outerHTML
                            }))
                        );
                        
                        if (modalInputs.length > 0) {
                            this.log('info', `🔍 Found ${modalInputs.length} input fields in ${modalSelector}:`, { modalInputs });
                        } else {
                            this.log('info', `❌ No input fields found in ${modalSelector}`);
                        }
                    }
                } catch (e) {
                    this.log('info', `No modal found with selector ${modalSelector}`);
                }
            }
            
            // Also check for ANY input fields with the specific attributes we're looking for
            try {
                const targetInputs = await this.page.$$eval('input[inputmode="email"], input[name="username"], input[autocomplete="email"]', inputs => 
                    inputs.map(input => ({
                        type: input.type,
                        name: input.name,
                        id: input.id,
                        placeholder: input.placeholder,
                        className: input.className,
                        inputMode: input.inputMode,
                        autocomplete: input.autocomplete,
                        parentElement: input.parentElement.tagName + '.' + input.parentElement.className,
                        isVisible: input.offsetParent !== null,
                        boundingBox: input.getBoundingClientRect(),
                        outerHTML: input.outerHTML
                    }))
                );
                
                if (targetInputs.length > 0) {
                    this.log('info', '🎯 Found target input fields anywhere on page:', { targetInputs });
                } else {
                    this.log('info', '❌ No target input fields found anywhere on page');
                }
            } catch (e) {
                this.log('info', 'Error checking for target input fields:', e.message);
            }

            // Wait for and fill username with more flexible selectors
            this.log('info', '📝 Entering username');
            
            // Try multiple selectors for email field - using the actual DAT login form selectors
            const emailSelectors = [
                // Most specific selectors first (based on the actual DAT form)
                'input[inputmode="email"][name="username"]',
                'input[inputmode="email"]',
                'input[name="username"][id="username"]',
                'input[name="username"]',
                '#username',
                'input[id="username"]',
                'input[autocomplete="email"][type="text"]',
                'input[autocomplete="email"]',
                'input.input.c08ead8e1.c33ea3e79',
                // Within modal/dialog context
                '[role="dialog"] input[inputmode="email"]',
                '[role="dialog"] input[name="username"]',
                '[role="dialog"] #username',
                '[role="dialog"] input[autocomplete="email"]',
                '.modal input[inputmode="email"]',
                '.modal input[name="username"]',
                '.modal #username',
                // Additional specific selectors
                'input[aria-labelledby="username-label"]',
                'input[type="text"][inputmode="email"]',
                'input[required][autocomplete="email"]',
                'input[autofocus][name="username"]',
                // Fallback selectors
                'input[type="email"]',
                'input[name="email"]',
                'input[placeholder*="email" i]',
                // Generic fallbacks
                'form input[type="text"]:first-of-type',
                'form input:first-of-type'
            ];
            
            let emailField = null;
            let workingSelector = null;
            
            this.log('info', '🔍 Testing each email selector...');
            for (const selector of emailSelectors) {
                try {
                    this.log('info', `Testing selector: ${selector}`);
                    emailField = await this.page.waitForSelector(selector, { timeout: 2000 });
                    if (emailField) {
                        this.log('info', `✅ Found email field with selector: ${selector}`);
                        this.log('info', '🎯 TEXT FIELD IDENTIFIED SUCCESSFULLY! 🎉');
                        workingSelector = selector;
                        
                        // Get details about the found field
                        const fieldInfo = await this.page.$eval(selector, (input) => ({
                            type: input.type,
                            name: input.name,
                            id: input.id,
                            className: input.className,
                            inputMode: input.inputMode,
                            autocomplete: input.autocomplete,
                            isVisible: input.offsetParent !== null,
                            boundingBox: input.getBoundingClientRect(),
                            outerHTML: input.outerHTML
                        }));
                        this.log('info', '📋 Found field details:', fieldInfo);
                        
                        // Log success message for text field identification
                        this.log('info', '🎯 SUCCESS: Text field successfully identified and ready for input!');
                        break;
                    }
                } catch (e) {
                    this.log('info', `❌ Selector failed: ${selector} - ${e.message}`);
                    continue;
                }
            }
            
            if (!emailField) {
                throw new Error('Could not find email/username input field');
            }
            
            // Fill the email field with the working selector
            if (workingSelector) {
                this.log('info', `📝 Filling field with selector: ${workingSelector}`);
                try {
                    await this.page.fill(workingSelector, username);
                    this.log('info', `✅ Entered username: ${username}`);
                    
                    // Verify the value was entered
                    const enteredValue = await this.page.$eval(workingSelector, input => input.value);
                    this.log('info', `🔍 Verified entered value: "${enteredValue}"`);
                } catch (fillError) {
                    this.log('error', `❌ Failed to fill field: ${fillError.message}`);
                    throw fillError;
                }
            } else {
                throw new Error('No working selector found for email field');
            }
            
            // Click CONTINUE button (based on the screenshot) - prioritize modal selectors
            this.log('info', '🖱️ Clicking CONTINUE button');
            const continueSelectors = [
                // First try within modal/dialog
                '[role="dialog"] button:has-text("CONTINUE")',
                '[role="dialog"] button:has-text("Continue")',
                '[role="dialog"] button[type="submit"]',
                '[role="dialog"] input[type="submit"]',
                '.modal button:has-text("CONTINUE")',
                '.modal button:has-text("Continue")',
                '.modal button[type="submit"]',
                // Then try general page selectors
                'button:has-text("CONTINUE")',
                'button:has-text("Continue")',
                'button[type="submit"]',
                'input[type="submit"]',
                '.continue-button',
                '#continue-button'
            ];
            
            let continueButton = null;
            for (const selector of continueSelectors) {
                try {
                    continueButton = await this.page.waitForSelector(selector, { timeout: 1000 }); // Faster timeout
                    if (continueButton) {
                        this.log('info', `✅ Found continue button with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (continueButton) {
                await continueButton.click();
                this.log('info', '✅ Clicked CONTINUE button');
                
                // Wait for next step (password field or verification) - faster
                await this.page.waitForTimeout(1500);
            }

            // Wait for and fill password
            this.log('info', '🔑 Entering password');
            await this.page.waitForSelector('input[type="password"], input[name="password"], #password', { timeout: 10000 });
            await this.page.fill('input[type="password"], input[name="password"], #password', password);

            // Submit login form
            const submitButton = await this.page.$('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
            if (submitButton) {
                this.log('info', '🚀 Submitting login form');
                await submitButton.click();
            }

            // Wait for potential 2FA/email verification
            await this.page.waitForTimeout(3000);

            // Check for MFA security prompt first
            await this.handleMFAPrompt();
            
            // Try to select email verification method if verification screen appears
            this.log('info', '🔄 Attempting to select email verification method...');
            await this.selectEmailVerification();
            
            // Check if we need email verification
            const needsVerification = await this.checkForEmailVerification();
            if (needsVerification) {
                await this.handleEmailVerification(gmailUser, gmailPass);
            }

            // Check if login was successful
            await this.verifyLoginSuccess();
            
            // Handle multiple device login modal if present
            await this.handleMultipleDeviceModal();
            
            this.isLoggedIn = true;
            this.log('info', '✅ Successfully logged into DAT.com');

        } catch (error) {
            this.log('error', 'DAT login failed', { error: error.message });
            throw error;
        }
    }

    async handleMFAPrompt() {
        try {
            this.log('info', '🔐 Checking for MFA security prompt...');
            
            // Look for "Enable Stronger Security" or "Remind Me Later" buttons
            const mfaPromptSelectors = [
                'text="Remind Me Later"',
                'button:has-text("Remind Me Later")',
                'text="Enable Stronger Security"',
                'text="Make My Account Safer"',
                'button:has-text("Skip")',
                'button:has-text("Not now")',
                '[data-testid*="skip"]',
                '[data-testid*="later"]'
            ];
            
            for (const selector of mfaPromptSelectors) {
                try {
                    const element = await this.page.waitForSelector(selector, { timeout: 3000 });
                    if (element) {
                        this.log('info', `🔐 Found MFA prompt, clicking "Remind Me Later" with selector: ${selector}`);
                        await element.click();
                        await this.page.waitForTimeout(300); // Faster wait
                        this.log('info', '✅ Successfully dismissed MFA prompt');
                        return;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Check for verification method selection (email vs phone)
            await this.selectEmailVerification();
            
            this.log('info', '✅ No MFA prompt found, continuing...');
        } catch (error) {
            this.log('warn', 'Error handling MFA prompt:', error.message);
        }
    }

    async selectEmailVerification() {
        try {
            this.log('info', '📧 Looking for "TRY ANOTHER METHOD" button...');
            
            // First, look specifically for "TRY ANOTHER METHOD" button
            const tryAnotherMethodSelectors = [
                'text="TRY ANOTHER METHOD"',
                'button:has-text("TRY ANOTHER METHOD")',
                'a:has-text("TRY ANOTHER METHOD")',
                '[data-testid*="try-another"]',
                'text="Try another method"',
                'button:has-text("Try another method")'
            ];
            
            let foundTryAnother = false;
            for (const selector of tryAnotherMethodSelectors) {
                try {
                    const element = await this.page.waitForSelector(selector, { timeout: 3000 });
                    if (element) {
                        this.log('info', `🔄 Found "TRY ANOTHER METHOD", clicking: ${selector}`);
                        await element.click();
                        await this.page.waitForTimeout(2000); // Wait for options to appear
                        foundTryAnother = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (foundTryAnother) {
                this.log('info', '📧 Now looking for email option...');
                
                // After clicking "TRY ANOTHER METHOD", look for email options
                const emailSelectors = [
                    'text="email"',
                    'button:has-text("email")',
                    'a:has-text("email")',
                    'text="Email"',
                    'button:has-text("Email")',
                    'text="Send code to email"',
                    'text="get a call"', // Sometimes this leads to email option
                    '[data-testid*="email"]',
                    'text="Use email instead"'
                ];
                
                for (const selector of emailSelectors) {
                    try {
                        const element = await this.page.waitForSelector(selector, { timeout: 2000 });
                        if (element) {
                            this.log('info', `📧 Found email option, clicking: ${selector}`);
                            await element.click();
                            await this.page.waitForTimeout(300);
                            this.log('info', '✅ Successfully selected email verification method');
                            return true;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                this.log('warn', 'Found "TRY ANOTHER METHOD" but could not find email option');
            } else {
                this.log('info', 'No "TRY ANOTHER METHOD" button found');
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
            
            // Wait a moment for the page to load after form submission (faster)
            await this.page.waitForTimeout(1500);
            
            // Take a screenshot to see what's on the page
            await this.page.screenshot({ path: './output/verification-check.png', fullPage: true });
            this.log('info', '📸 Screenshot saved to output/verification-check.png');
            
            // Get current URL to see where we are
            const currentUrl = this.page.url();
            this.log('info', `🔍 Current URL during verification check: ${currentUrl}`);
            
            // Look for common email verification indicators with more comprehensive selectors
            const verificationSelectors = [
                // Input fields for verification codes
                'input[placeholder*="code" i]',
                'input[placeholder*="verification" i]',
                'input[name*="code" i]',
                'input[id*="code" i]',
                'input[type="text"][maxlength="6"]', // Common for 6-digit codes
                'input[type="text"][maxlength="4"]', // Common for 4-digit codes
                'input[inputmode="numeric"]',
                // Text indicators
                'text="Enter the code"',
                'text="Check your email"',
                'text="verification code"',
                'text="Enter verification code"',
                'text="We sent you a code"',
                'text="Enter the 6-digit code"',
                // Common class/id names
                '.verification-code',
                '#verification-code',
                '.code-input',
                '#code-input',
                '[data-testid*="verification"]',
                '[data-testid*="code"]'
            ];

            let foundVerification = false;
            for (const selector of verificationSelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        this.log('info', `📧 Email verification required - found with selector: ${selector}`);
                        foundVerification = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Also check if we're still on a login-related URL
            if (!foundVerification && (currentUrl.includes('login') || currentUrl.includes('verify') || currentUrl.includes('challenge'))) {
                this.log('info', '📧 Likely email verification required based on URL');
                foundVerification = true;
            }
            
            // Check all input fields on the page to see what we have
            try {
                const allInputs = await this.page.$$eval('input', inputs => 
                    inputs.map(input => ({
                        type: input.type,
                        name: input.name,
                        id: input.id,
                        placeholder: input.placeholder,
                        className: input.className,
                        maxLength: input.maxLength,
                        inputMode: input.inputMode,
                        outerHTML: input.outerHTML.substring(0, 200)
                    }))
                );
                this.log('info', '🔍 All input fields on verification page:', { allInputs });
            } catch (e) {
                this.log('info', 'Could not analyze input fields');
            }

            return foundVerification;
        } catch (error) {
            this.log('error', 'Error checking for email verification', { error: error.message });
            return false;
        }
    }

    async handleEmailVerification(gmailUser, gmailPass) {
        this.log('info', '📧 Handling email verification');

        // Force a fresh code by clicking resend FIRST
        try {
            this.log('info', '🔄 Forcing fresh verification code by clicking Resend first...');
            const resendButton = await this.page.waitForSelector('button:has-text("Resend"), a:has-text("Resend")', { timeout: 3000 });
            if (resendButton) {
                await resendButton.click();
                this.log('info', '✅ Clicked Resend - fresh code should arrive shortly');
                await this.page.waitForTimeout(2000); // Brief wait for email to send
            }
        } catch (resendError) {
            this.log('debug', `Resend button not found, proceeding with existing flow: ${resendError.message}`);
        }

        // Now try Gmail API for the fresh code
        try {
            this.log('info', '🔑 Attempting Gmail API verification...');
            const gmailAPI = new GmailAPI();
            const authenticated = await gmailAPI.authenticate();
            
            if (authenticated) {
                this.log('info', '✅ Gmail API authenticated, searching for FRESH verification code...');
                const code = await gmailAPI.waitForVerificationCode(1, 2); // Wait 1 min, check every 2 sec (very fresh)
                
                if (code) {
                    this.log('info', `✅ Found verification code via Gmail API: ${code}`);
                    await this.enterVerificationCode(code);
                    return;
                } else {
                    this.log('warn', '⚠️ Gmail API timeout - trying to get fresh code...');
                    
                    // Try clicking resend to get a fresh code
                    try {
                        this.log('info', '🔄 Clicking Resend to get fresh verification code...');
                        const resendButton = await this.page.waitForSelector('button:has-text("Resend"), a:has-text("Resend")', { timeout: 3000 });
                        if (resendButton) {
                            await resendButton.click();
                            this.log('info', '✅ Clicked Resend button, waiting for fresh code...');
                            await this.page.waitForTimeout(3000); // Wait for fresh email
                            
                            // Try Gmail API again with fresh code
                            const freshCode = await gmailAPI.waitForVerificationCode(1, 2); // 1 min, check every 2 sec
                            if (freshCode) {
                                this.log('info', `✅ Found fresh verification code: ${freshCode}`);
                                await this.enterVerificationCode(freshCode);
                                return;
                            }
                        }
                    } catch (resendError) {
                        this.log('debug', `Resend not available: ${resendError.message}`);
                    }
                    
                    this.log('warn', '⚠️ Gmail API could not find fresh code, falling back to manual entry');
                }
            } else {
                this.log('info', '📋 Gmail API not configured, using manual verification');
                this.log('info', '   Run: node src/setup-gmail.js (for automated email checking)');
            }
        } catch (error) {
            this.log('warn', `Gmail API error: ${error.message}`);
        }
        
        // Manual code entry fallback
        this.log('info', '📬 Please manually enter the verification code from your email');
        await this.promptForManualCode();
    }

    async getVerificationCodeFromGmail(gmailUser, gmailPass) {
        try {
            this.log('info', '📬 Checking Gmail for verification code');
            
            // Open new tab for Gmail
            const gmailPage = await this.context.newPage();
            
            // Navigate to Gmail
            await gmailPage.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle' });
            
            // Login to Gmail
            await gmailPage.fill('input[type="email"]', gmailUser);
            await gmailPage.click('#identifierNext');
            await gmailPage.waitForTimeout(2000);
            
            await gmailPage.fill('input[type="password"]', gmailPass);
            await gmailPage.click('#passwordNext');
            await gmailPage.waitForTimeout(3000);
            
            // Navigate to Gmail inbox
            await gmailPage.goto('https://mail.google.com/mail/u/0/#inbox', { waitUntil: 'networkidle' });
            
            // Look for DAT verification email with improved detection
            this.log('info', '🔍 Searching for DAT verification email...');
            const startTime = Date.now();
            
            while (Date.now() - startTime < CONFIG.emailMaxWait) {
                try {
                    // Refresh inbox to get latest emails
                    await gmailPage.reload();
                    await gmailPage.waitForTimeout(2000);
                    
                    // Multiple selectors for finding DAT emails
                    const emailSelectors = [
                        'tr:has-text("DAT")',
                        'tr:has-text("verification")',
                        'tr:has-text("Verify Your Identity")',
                        'div[data-thread-id]:has-text("DAT")',
                        'span:has-text("DAT")',
                        'span:has-text("verification")',
                        'span:has-text("code")',
                        // Try most recent email if no DAT email found
                        'tr[jsaction]:first-child',
                        'div[data-thread-id]:first-child'
                    ];
                    
                    let emailFound = false;
                    for (const selector of emailSelectors) {
                        try {
                            const email = await gmailPage.$(selector);
                            if (email) {
                                this.log('info', `📧 Found email with selector: ${selector}`);
                                await email.click();
                                await gmailPage.waitForTimeout(3000);
                                emailFound = true;
                                break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                    
                    if (emailFound) {
                        // Extract verification code with multiple patterns
                        const emailBody = await gmailPage.textContent('body');
                        this.log('info', '🔍 Searching email content for verification code...');
                        
                        // Multiple code patterns to try
                        const codePatterns = [
                            /verification code[:\s]*(\d{4,8})/i,
                            /your code[:\s]*(\d{4,8})/i,
                            /enter[:\s]*(\d{4,8})/i,
                            /code[:\s]*(\d{4,8})/i,
                            /\b(\d{6})\b/,  // 6-digit codes
                            /\b(\d{4})\b/   // 4-digit codes
                        ];
                        
                        for (const pattern of codePatterns) {
                            const codeMatch = emailBody.match(pattern);
                            if (codeMatch) {
                                const code = codeMatch[1] || codeMatch[0].replace(/\D/g, '');
                                if (code && code.length >= 4 && code.length <= 8) {
                                    this.log('info', `✅ Found verification code: ${code}`);
                                    await gmailPage.close();
                                    return code;
                                }
                            }
                        }
                        
                        this.log('info', '⚠️ Email found but no verification code detected');
                    }
                    
                } catch (e) {
                    this.log('info', 'Continuing email search...');
                }
                
                this.log('info', `⏳ Waiting ${CONFIG.emailCheckInterval/1000}s before next check...`);
                await gmailPage.waitForTimeout(CONFIG.emailCheckInterval);
            }
            
            await gmailPage.close();
            this.log('warn', '⏰ Timeout waiting for verification email');
            return null;

        } catch (error) {
            this.log('error', 'Gmail code retrieval failed', { error: error.message });
            return null;
        }
    }

    async promptForManualCode() {
        this.log('info', '👤 Please manually enter the verification code in the browser window');
        this.log('info', '📧 Check your email for the DAT verification code and enter it in the browser');
        
        // Wait for user to manually enter code and proceed
        // We'll wait for the page to navigate away from verification
        let attempts = 0;
        while (attempts < 60) { // Wait up to 5 minutes
            const stillOnVerification = await this.checkForEmailVerification();
            if (!stillOnVerification) {
                this.log('info', '✅ Verification completed manually');
                return;
            }
            
            await this.page.waitForTimeout(5000);
            attempts++;
        }
        
        throw new Error('Manual verification timeout - please complete verification faster');
    }

    async enterVerificationCode(code) {
        try {
            this.log('info', '🔢 Entering verification code automatically');
            
            // Better selectors based on the actual field structure
            const codeSelectors = [
                'input[name="code"]',           // Primary: name attribute
                '#code',                        // Secondary: id attribute  
                'input[id="code"]',            // Specific id selector
                'input[type="text"][name="code"]', // Specific type + name
                'input[placeholder*="code"]',   // Fallback: placeholder
                'input[placeholder*="verification"]', // Fallback: verification text
                '.verification-code input',     // Fallback: class context
                'input[aria-labelledby*="code"]' // Fallback: aria label
            ];
            
            let codeInput = null;
            for (const selector of codeSelectors) {
                try {
                    this.log('debug', `Testing verification code selector: ${selector}`);
                    codeInput = await this.page.waitForSelector(selector, { timeout: 2000 });
                    if (codeInput) {
                        this.log('info', `✅ Found verification code field with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (codeInput) {
                // Clear any existing value first
                await codeInput.click();
                await codeInput.fill('');
                await this.page.waitForTimeout(200);
                
                // Enter the code with typing simulation for better reliability
                await codeInput.type(code, { delay: 100 });
                
                this.log('info', `✅ Successfully entered verification code: ${code}`);
                
                // Verify the value was entered
                const enteredValue = await codeInput.inputValue();
                this.log('info', `🔍 Verified entered code: "${enteredValue}"`);
                
                // Submit the code
                const submitSelectors = [
                    'button[type="submit"]',
                    'button:has-text("Verify")',
                    'button:has-text("Continue")',
                    'button:has-text("CONTINUE")',
                    'input[type="submit"]',
                    '[data-action-button-primary="true"]'
                ];
                
                let submitButton = null;
                for (const selector of submitSelectors) {
                    try {
                        submitButton = await this.page.waitForSelector(selector, { timeout: 1000 });
                        if (submitButton) {
                            this.log('info', `✅ Found submit button with selector: ${selector}`);
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                if (submitButton) {
                    await submitButton.click();
                    this.log('info', '✅ Clicked submit button for verification code');
                    await this.page.waitForTimeout(3000);
                    
                    // Check if there's an "invalid code" error
                    const invalidCodeError = await this.page.$('text="The code you entered is invalid"');
                    if (invalidCodeError) {
                        this.log('warn', '⚠️ Invalid code error detected, clicking Resend to get fresh code');
                        
                        // Click Resend button
                        const resendButton = await this.page.$('text="Resend", button:has-text("Resend")');
                        if (resendButton) {
                            await resendButton.click();
                            this.log('info', '✅ Clicked Resend button');
                            await this.page.waitForTimeout(2000);
                            
                            // Wait for new verification code via Gmail API
                            this.log('info', '⏳ Waiting for fresh verification code...');
                            const GmailAPI = require('./gmail-api');
                            const gmailAPI = new GmailAPI();
                            await gmailAPI.authenticate();
                            const freshCode = await gmailAPI.waitForVerificationCode(2, 5); // Wait 2 min, check every 5 sec
                            
                            if (freshCode) {
                                this.log('info', `✅ Found fresh verification code: ${freshCode}`);
                                
                                // Clear and enter the fresh code
                                await codeInput.click();
                                await codeInput.fill('');
                                await this.page.waitForTimeout(200);
                                await codeInput.type(freshCode, { delay: 100 });
                                
                                // Submit again
                                await submitButton.click();
                                this.log('info', '✅ Submitted fresh verification code');
                                await this.page.waitForTimeout(3000);
                            } else {
                                this.log('error', '❌ Could not get fresh verification code');
                            }
                        }
                    }
                } else {
                    this.log('warn', '⚠️ No submit button found, trying Enter key');
                    await codeInput.press('Enter');
                    await this.page.waitForTimeout(3000);
                }
            } else {
                throw new Error('Could not find verification code input field');
            }
        } catch (error) {
            this.log('error', 'Failed to enter verification code', { error: error.message });
            throw error;
        }
    }

    async verifyLoginSuccess() {
        try {
            // Wait for successful login indicators
            const successSelectors = [
                'a:has-text("Search Loads")',
                'button[aria-label="User menu"]',
                '.dashboard',
                'nav[role="navigation"]',
                '.user-menu'
            ];

            for (const selector of successSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 10000 });
                    this.log('info', '✅ Login success confirmed', { indicator: selector });
                    return true;
                } catch (e) {
                    continue;
                }
            }

            // Check URL for success
            const currentUrl = this.page.url();
            if (!currentUrl.includes('/login') && !currentUrl.includes('/signin')) {
                this.log('info', '✅ Login success confirmed by URL change', { url: currentUrl });
                return true;
            }

            throw new Error('Could not confirm successful login');

        } catch (error) {
            this.log('error', 'Login verification failed', { error: error.message });
            throw error;
        }
    }

    async handleMultipleDeviceModal() {
        try {
            this.log('info', '🔍 Checking for multiple device login modal...');
            
            // Look for the "LOGIN ANYWAY" modal
            const modalSelectors = [
                'button:has-text("LOGIN ANYWAY")',
                'button:has-text("Login Anyway")',
                '[data-testid*="login-anyway"]',
                'button[class*="login-anyway"]'
            ];
            
            for (const selector of modalSelectors) {
                try {
                    const loginAnywayButton = await this.page.waitForSelector(selector, { timeout: 3000 });
                    if (loginAnywayButton) {
                        this.log('info', `🔄 Found "LOGIN ANYWAY" button with selector: ${selector}`);
                        await loginAnywayButton.click();
                        this.log('info', '✅ Clicked "LOGIN ANYWAY" - dismissed multiple device modal');
                        await this.page.waitForTimeout(2000);
                        return true;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Also check for the modal text and click accordingly
            try {
                const modalText = await this.page.waitForSelector('text="You or someone else is logged in on another device"', { timeout: 3000 });
                if (modalText) {
                    this.log('info', '🔍 Found multiple device modal text, looking for LOGIN ANYWAY button...');
                    
                    // Try to find and click the button within the modal context
                    const anyButton = await this.page.$('button:has-text("LOGIN ANYWAY"), button:has-text("Login Anyway")');
                    if (anyButton) {
                        await anyButton.click();
                        this.log('info', '✅ Successfully dismissed multiple device modal');
                        await this.page.waitForTimeout(2000);
                        return true;
                    }
                }
            } catch (e) {
                // Modal not found, which is fine
            }
            
            this.log('info', '✅ No multiple device modal found - proceeding');
            return false;
            
        } catch (error) {
            this.log('warn', 'Error checking for multiple device modal', { error: error.message });
            return false;
        }
    }

    async navigateToLoadBoard() {
        try {
            this.log('info', '🚛 Navigating to load board');
            
            // Use more relaxed wait condition since networkidle might be too strict
            await this.page.goto('https://one.dat.com/search-loads-ow', { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000  // Increased timeout to 60 seconds
            });
            
            // Wait a bit for any dynamic content to load
            await this.page.waitForTimeout(3000);
            
            this.log('info', '📸 Taking screenshot of load board page for debugging');
            await this.page.screenshot({ path: 'output/load-board-debug.png', fullPage: true });
            
            // Check current URL and page content
            const currentUrl = this.page.url();
            this.log('info', `🔍 Current URL after navigation: ${currentUrl}`);
            
            // Try to find any load-related elements with more flexible selectors
            const loadSelectors = [
                '[data-test="load-origin-cell"]',
                '.row-container',
                '[data-testid*="load"]',
                '[class*="load"]',
                '[class*="row"]',
                'table tbody tr',
                '.load-board',
                '[data-cy*="load"]'
            ];
            
            let foundSelector = null;
            for (const selector of loadSelectors) {
                try {
                    this.log('debug', `Testing load selector: ${selector}`);
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    foundSelector = selector;
                    this.log('info', `✅ Found loads with selector: ${selector}`);
                    break;
                } catch (e) {
                    continue;
                }
            }
            
            if (!foundSelector) {
                // If no specific selectors work, just wait for any content and proceed
                this.log('warn', '⚠️ Could not find specific load selectors, checking for general content');
                await this.page.waitForTimeout(5000); // Give it more time
                
                // Try to find any table or list structure
                const generalSelectors = ['table', 'tbody', '[role="table"]', '[role="grid"]', '.table'];
                for (const selector of generalSelectors) {
                    try {
                        const element = await this.page.$(selector);
                        if (element) {
                            this.log('info', `✅ Found general content structure: ${selector}`);
                            foundSelector = selector;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            
            this.log('info', '✅ Successfully navigated to load board');
        } catch (error) {
            this.log('error', 'Failed to navigate to load board', { error: error.message });
            throw error;
        }
    }

    async fillSearchForm() {
        try {
            this.log('info', '📝 Filling out search form for load search');
            
            // Wait for the search form to be ready - first let's analyze what's on the page
        this.log('info', '🔍 Analyzing search page structure...');
        await this.page.waitForTimeout(500);
            
            // Take a screenshot for debugging
            await this.page.screenshot({ path: 'output/search-form-debug.png', fullPage: true });
            
            // Check what input fields are available
            const allInputs = await this.page.$$('input');
            this.log('info', `Found ${allInputs.length} input elements on search page`);
            
            for (let i = 0; i < Math.min(10, allInputs.length); i++) {
                const input = allInputs[i];
                const placeholder = await input.getAttribute('placeholder');
                const type = await input.getAttribute('type');
                const name = await input.getAttribute('name');
                const id = await input.getAttribute('id');
                const className = await input.getAttribute('class');
                
                this.log('debug', `Input ${i + 1}: type="${type}" placeholder="${placeholder}" name="${name}" id="${id}" class="${className}"`);
            }
            
            // Try to wait for the Origin field with more flexible selector
            try {
                await this.page.waitForSelector('input[placeholder="Origin"], input[placeholder*="Origin"], [aria-label*="Origin"], input', { timeout: 15000 });
            } catch (error) {
                this.log('error', '❌ Could not find Origin field, taking screenshot and analyzing page');
                await this.page.screenshot({ path: 'output/origin-field-not-found.png', fullPage: true });
                
                // Get page content for analysis
                const pageContent = await this.page.content();
                this.log('debug', `Page content length: ${pageContent.length}`);
                
                // Look for Origin-related text
                const hasOriginText = pageContent.includes('Origin') || pageContent.includes('origin');
                this.log('info', `Page contains origin text: ${hasOriginText}`);
                
                throw error;
            }
            
            // Fill Origin field using the exact data-test attribute
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
            
            // Fill Destination field using the exact data-test attribute
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
            
            // Fill Equipment Type - REQUIRED for search to work
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
            
            // Set date range to next week using the specific date range inputs
            this.log('info', '🔍 Looking for Date Range fields...');
            const startDateField = await this.page.$('input[placeholder="Start date"]');
            const endDateField = await this.page.$('.mat-end-date');
            
            let dateField = startDateField || endDateField;
            
            if (startDateField && endDateField) {
                // Calculate next full week's date range (Monday to Sunday)
                const today = new Date();
                
                // Find next Monday
                const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
                const daysUntilNextMonday = currentDayOfWeek === 0 ? 1 : (8 - currentDayOfWeek); // Days until next Monday
                
                const nextMonday = new Date(today);
                nextMonday.setDate(today.getDate() + daysUntilNextMonday);
                
                // Next Sunday (6 days after Monday)
                const nextSunday = new Date(nextMonday);
                nextSunday.setDate(nextMonday.getDate() + 6);
                
                const formatDate = (date) => {
                    return `${(date.getMonth() + 1)}/${date.getDate()}/${date.getFullYear()}`;
                };
                
                const startDate = formatDate(nextMonday);
                const endDate = formatDate(nextSunday);
                
                this.log('info', `📅 Calculating full week: Monday ${startDate} to Sunday ${endDate}`);
                
                // Fill start date
                this.log('info', '📅 Filling start date field...');
                await startDateField.click();
                await startDateField.fill(''); // Clear first
                await startDateField.fill(startDate);
                await this.page.waitForTimeout(200);
                
                // Fill end date
                this.log('info', '📅 Filling end date field...');
                await endDateField.click();
                await endDateField.fill(''); // Clear first
                await endDateField.fill(endDate);
                await this.page.waitForTimeout(200);
                
                this.log('info', `✅ Filled date range: ${startDate} to ${endDate}`);
            } else if (dateField) {
                // Fallback to single date field
                this.log('info', '📅 Using single date field as fallback...');
                const today = new Date();
                const currentDayOfWeek = today.getDay();
                const daysUntilNextMonday = currentDayOfWeek === 0 ? 1 : (8 - currentDayOfWeek);
                
                const nextMonday = new Date(today);
                nextMonday.setDate(today.getDate() + daysUntilNextMonday);
                
                const nextSunday = new Date(nextMonday);
                nextSunday.setDate(nextMonday.getDate() + 6);
                
                const formatDate = (date) => {
                    return `${(date.getMonth() + 1)}/${date.getDate()}/${date.getFullYear()}`;
                };
                
                const dateRange = `${formatDate(nextMonday)} - ${formatDate(nextSunday)}`;
                
                await dateField.click();
                await dateField.fill(''); // Clear first
                await dateField.fill(dateRange);
                await this.page.waitForTimeout(300);
                this.log('info', `✅ Filled date range: ${dateRange}`);
            } else {
                this.log('warn', '⚠️ No date fields found, skipping date range...');
            }
            
            // Click the SEARCH button
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
                await this.page.waitForTimeout(2000);
                this.log('info', '⏳ Waiting for search results to load...');
            } else {
                this.log('error', '❌ Search button not found, trying Enter key...');
                await this.page.keyboard.press('Enter');
            }
            
        } catch (error) {
            this.log('error', 'Failed to fill search form', { error: error.message });
            throw error;
        }
    }

    async scrapeLoads() {
        try {
            this.log('info', '🔍 Starting load extraction');
            
            // Wait for actual load data to appear (not just loading spinners)
            this.log('info', '⏳ Waiting for load data to load completely...');
            await this.page.waitForTimeout(3000); // Wait for loads to load
        
        // Take a screenshot to see what's actually on the page
        await this.page.screenshot({ path: 'output/search-results-debug.png', fullPage: true });
        this.log('info', '📸 Screenshot saved to output/search-results-debug.png for debugging');
            
            // Try multiple selectors to find load rows, excluding headers and loading elements
            const rowSelectors = [
                'tbody tr', // Table rows in results table
                'tr:has(input[type="checkbox"])', // Rows with checkboxes (load selection)
                'tr:not(:first-child)', // All rows except header
                '.row-container:not(.header):not(.loading)',
                '[class*="load-row"]:not([class*="header"])',
                '[data-test*="load-row"]',
                '[class*="load"][class*="row"]:not([class*="header"])',
                'tr[class*="load"]:not([class*="header"])',
                'div[class*="load"]:not([class*="board"]):not([class*="search"]):not([class*="header"]):not([class*="loading"])',
                '[role="row"]:not([class*="header"])',
                '.table-row:not(.header)'
            ];
            
            let loadRows = [];
            let usedSelector = null;
            
            for (const selector of rowSelectors) {
                try {
                    this.log('debug', `Testing row selector: ${selector}`);
                    const rows = await this.page.$$(selector);
                    
                    if (rows && rows.length > 0) {
                        // Filter out header rows and loading elements by checking content
                        const filteredRows = [];
                        for (const row of rows) {
                            const text = await row.textContent();
                            const isHeaderRow = text.includes('Origin') && text.includes('Destination') && text.includes('Rate');
                            const isLoadingRow = text.includes('Loading') || text.includes('loading');
                            const isEmpty = text.trim().length < 10;
                            
                            if (!isHeaderRow && !isLoadingRow && !isEmpty) {
                                filteredRows.push(row);
                            }
                        }
                        
                        if (filteredRows.length > 0) {
                            loadRows = filteredRows;
                            usedSelector = selector;
                            this.log('info', `✅ Found ${filteredRows.length} actual load rows with selector: ${selector} (filtered from ${rows.length} total)`);
                            break;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // For testing modal issues, limit to just 2 loads to avoid confusion
            const targetRows = loadRows.slice(0, Math.min(2, CONFIG.maxEntries));
            
            this.log('info', `📊 Found ${loadRows.length} loads, processing ${targetRows.length}`);
            
            if (targetRows.length === 0) {
                // If no rows found, let's take a screenshot and analyze the page structure
                this.log('warn', '⚠️ No load rows found, analyzing page structure...');
                await this.page.screenshot({ path: 'output/no-loads-debug.png', fullPage: true });
                
                // Try to find any elements that might contain load data
                const pageContent = await this.page.content();
                this.log('debug', `Page content length: ${pageContent.length}`);
                
                // Look for common load-related text patterns
                const hasLoadText = pageContent.includes('load') || pageContent.includes('Load') || 
                                  pageContent.includes('freight') || pageContent.includes('Freight');
                this.log('info', `Page contains load-related text: ${hasLoadText}`);
                
                // Let's analyze all table-like elements
                const tableElements = await this.page.$$('table, tbody, tr, [role="table"], [role="row"], div[class*="table"], div[class*="row"]');
                this.log('info', `Found ${tableElements.length} table-like elements`);
                
                // Sample the first few elements to see their structure
                for (let i = 0; i < Math.min(5, tableElements.length); i++) {
                    const element = tableElements[i];
                    const text = await element.textContent();
                    const tagName = await element.evaluate(el => el.tagName);
                    const className = await element.evaluate(el => el.className);
                    
                    this.log('debug', `Element ${i + 1}: ${tagName}.${className} - "${text.substring(0, 100)}..."`);
                }
                
                throw new Error(`No load rows found with any selector. Used selectors: ${rowSelectors.join(', ')}`);
            }

            const extractedData = [];
            
            for (let i = 0; i < targetRows.length; i++) {
                try {
                    const row = targetRows[i];
                    this.log('debug', `Processing load ${i + 1}/${targetRows.length}`);
                    
                    // Extract basic data from row with flexible selectors
                    const basicLoadData = await row.evaluate(el => {
                        const getTextContent = (selectors) => {
                            // Try multiple selectors until one works
                            for (const selector of selectors) {
                                const element = el.querySelector(selector);
                                if (element && element.textContent.trim()) {
                                    return element.textContent.trim();
                                }
                            }
                            return '';
                        };

                        // Get all text content for analysis
                        const allText = el.textContent.trim();
                        
                        // Try to find data using multiple selector strategies
                        const originSelectors = [
                            '[data-test="load-origin-cell"]',
                            '[data-testid*="origin"]',
                            '[class*="origin"]',
                            '[aria-label*="origin"]',
                            'td:first-child',
                            'div:first-child',
                            '.cell:first-child'
                        ];
                        
                        const destinationSelectors = [
                            '[data-test="load-destination-cell"]',
                            '[data-testid*="destination"]',
                            '[class*="destination"]',
                            '[aria-label*="destination"]',
                            'td:nth-child(2)',
                            'div:nth-child(2)',
                            '.cell:nth-child(2)'
                        ];
                        
                        const rateSelectors = [
                            '[data-test="load-rate-cell"]',
                            '[data-testid*="rate"]',
                            '[class*="rate"]',
                            '[class*="price"]',
                            '[class*="amount"]',
                            '[aria-label*="rate"]',
                            'td:nth-child(3)',
                            'div:nth-child(3)',
                            '.cell:nth-child(3)'
                        ];
                        
                        const companySelectors = [
                            '[data-test="load-company-cell"]',
                            '[data-testid*="company"]',
                            '[class*="company"]',
                            '[class*="shipper"]',
                            '[aria-label*="company"]',
                            'td:nth-child(4)',
                            'div:nth-child(4)',
                            '.cell:nth-child(4)'
                        ];
                        
                        const ageSelectors = [
                            '[data-test="load-age-cell"]',
                            '[data-testid*="age"]',
                            '[class*="age"]',
                            '[class*="time"]',
                            '[class*="posted"]',
                            '[aria-label*="age"]',
                            'td:last-child',
                            'div:last-child',
                            '.cell:last-child'
                        ];

                        // Extract data using pattern matching as fallback
                        const extractFromText = (text) => {
                            // Common patterns for freight load data
                            const cityStatePattern = /([A-Z]{2,}\s*,\s*[A-Z]{2})/g;
                            const ratePattern = /\$[\d,]+(?:\.\d{2})?/g;
                            const milesPattern = /(\d+)\s*mi/i;
                            
                            const cities = text.match(cityStatePattern) || [];
                            const rates = text.match(ratePattern) || [];
                            const miles = text.match(milesPattern) || [];
                            
                            return {
                                cities: cities,
                                rates: rates,
                                miles: miles
                            };
                        };
                        
                        const patterns = extractFromText(allText);

                        // Extract phone number from contact link
                        const phoneSelectors = [
                            'a.contacts__phone',
                            'a[href^="tel:"]',
                            '.contacts__phone',
                            '[class*="phone"]'
                        ];
                        
                        let phoneNumber = '';
                        for (const selector of phoneSelectors) {
                            const phoneEl = el.querySelector(selector);
                            if (phoneEl) {
                                // Extract from href (tel:2095995418) or text content
                                const href = phoneEl.getAttribute('href');
                                if (href && href.startsWith('tel:')) {
                                    const rawPhone = href.replace('tel:', '');
                                    // Format phone number (2095995418 -> (209) 599-5418)
                                    if (rawPhone.length === 10) {
                                        phoneNumber = `(${rawPhone.slice(0,3)}) ${rawPhone.slice(3,6)}-${rawPhone.slice(6)}`;
                                    } else {
                                        phoneNumber = rawPhone;
                                    }
                                } else {
                                    phoneNumber = phoneEl.textContent.trim();
                                }
                                break;
                            }
                        }

                        // Extract reference number from data-item div
                        const referenceSelectors = [
                            '.data-item',
                            'div.data-item',
                            '[class*="data-item"]'
                        ];
                        
                        let referenceNumber = '';
                        for (const selector of referenceSelectors) {
                            const refEl = el.querySelector(selector);
                            if (refEl) {
                                const refText = refEl.textContent.trim();
                                // Look for reference number pattern (letters + numbers like B212555)
                                if (refText.match(/^[A-Z]+\d+$/)) {
                                    referenceNumber = refText;
                                    break;
                                }
                            }
                        }

                        return {
                            origin: getTextContent(originSelectors) || (patterns.cities[0] || ''),
                            destination: getTextContent(destinationSelectors) || (patterns.cities[1] || ''),
                            rate: getTextContent(rateSelectors) || (patterns.rates[0] || ''),
                            company: getTextContent(companySelectors),
                            age: getTextContent(ageSelectors),
                            phone: phoneNumber || '',
                            reference: referenceNumber || '',
                            rawText: allText, // Include raw text for debugging
                            elementHTML: el.outerHTML.substring(0, 500) // Include HTML structure for debugging
                        };
                    });

                    // Now click into the load detail to get phone and reference number
                    let detailedData = { phone: '', reference: '' };
                    try {
                        // Ensure no modals are open before clicking the next load
                        if (i > 0) {
                            this.log('info', `🔄 Ensuring previous modals are closed before load ${i + 1}...`);
                            await this.page.keyboard.press('Escape'); // Close any open modals
                            await this.page.waitForTimeout(500);
                        }
                        
                        this.log('info', `🖱️ DOUBLE-CLICKING into load ${i + 1} for detailed contact info...`);
                        
                        // Take a screenshot before clicking
                        await this.page.screenshot({ path: `output/before-click-load-${i + 1}.png`, fullPage: false });
                        this.log('info', `📸 Screenshot saved: before-click-load-${i + 1}.png`);
                        
                        // Click on the load row to open details
                        await row.click();
                        this.log('info', `✅ First click on load ${i + 1} row (opens basic view)`);
                        
                        await this.page.waitForTimeout(1000); // Wait for basic view to load
                        
                        // Take a screenshot after first click
                        await this.page.screenshot({ path: `output/after-first-click-load-${i + 1}.png`, fullPage: false });
                        this.log('info', `📸 Screenshot after first click: after-first-click-load-${i + 1}.png`);
                        
                        // SECOND CLICK to expand/roll down the detailed view with contact info
                        this.log('info', `🖱️ Second click on load ${i + 1} to expand detailed view...`);
                        await row.click();
                        this.log('info', `✅ Second click on load ${i + 1} row (expands detailed view)`);
                        
                        await this.page.waitForTimeout(1500); // Wait for detailed view to expand
                        
                        // Take a screenshot after second click to see the expanded details
                        await this.page.screenshot({ path: `output/after-second-click-load-${i + 1}.png`, fullPage: false });
                        this.log('info', `📸 Screenshot after second click: after-second-click-load-${i + 1}.png`);
                        
                        this.log('info', `🔍 Analyzing expanded modal content for load ${i + 1}...`);
                        
                        // Look for and click contact-related tabs or buttons within the modal
                        try {
                            const contactTabSelectors = [
                                'button:has-text("Contact")',
                                'tab:has-text("Contact")',
                                '[role="tab"]:has-text("Contact")',
                                'button:has-text("Details")',
                                'button:has-text("Info")',
                                '.tab:has-text("Contact")',
                                'a:has-text("Contact")',
                                'button[aria-label*="contact"]',
                                'button[aria-label*="Contact"]'
                            ];
                            
                            let contactTabFound = false;
                            for (const selector of contactTabSelectors) {
                                const tabElement = await this.page.$(selector);
                                if (tabElement) {
                                    this.log('info', `📞 Found contact tab with selector: ${selector}`);
                                    await tabElement.click();
                                    await this.page.waitForTimeout(1000); // Wait for tab content to load
                                    contactTabFound = true;
                                    break;
                                }
                            }
                            
                            if (!contactTabFound) {
                                this.log('info', `ℹ️ No contact tab found, looking for expandable sections...`);
                                
                                // Look for expandable sections, "More Info" buttons, etc.
                                const expandableSelectors = [
                                    'button:has-text("More")',
                                    'button:has-text("Show")',
                                    'button:has-text("View")',
                                    'button:has-text("Expand")',
                                    '[class*="expand"]',
                                    '[class*="more"]',
                                    '[class*="toggle"]',
                                    'button[aria-expanded="false"]',
                                    '.accordion-button',
                                    '.collapsible-button'
                                ];
                                
                                for (const selector of expandableSelectors) {
                                    const expandElement = await this.page.$(selector);
                                    if (expandElement) {
                                        this.log('info', `🔽 Found expandable element: ${selector}`);
                                        await expandElement.click();
                                        this.log('info', `✅ Clicked expandable element, waiting for content to load...`);
                                        await this.page.waitForTimeout(1500); // Wait longer for expansion
                                        
                                        // Take a screenshot after expansion
                                        await this.page.screenshot({ path: `output/after-expand-load-${i + 1}.png`, fullPage: false });
                                        this.log('info', `📸 Screenshot after expansion: after-expand-load-${i + 1}.png`);
                                        
                                        // Wait specifically for CONTACT INFORMATION section to appear
                                        try {
                                            await this.page.waitForSelector('a.contacts__phone, a[href^="tel:"], a[href^="mailto:"]', { timeout: 3000 });
                                            this.log('info', `✅ Contact information section loaded`);
                                        } catch (contactWaitError) {
                                            this.log('info', `⏳ Contact information section not found, continuing anyway...`);
                                        }
                                        
                                        break;
                                    }
                                }
                            }
                            
                        } catch (tabError) {
                            this.log('debug', `Tab search error: ${tabError.message}`);
                        }
                        
                        // Extract detailed information from the modal/detail view
                        detailedData = await this.page.evaluate(() => {
                            // Look for phone number in detail view - focus on modal/dialog content
                            let phone = '';
                            
                            // First, try to find the modal/dialog container - prioritize the most recently opened/visible one
                            const modalSelectors = [
                                '[role="dialog"]:not([style*="display: none"])',  // Visible dialogs only
                                '.modal-content:not([style*="display: none"])',
                                '.dialog-content:not([style*="display: none"])',
                                '[class*="modal"]:not([style*="display: none"])',
                                '[class*="dialog"]:not([style*="display: none"])',
                                '[class*="popup"]:not([style*="display: none"])',
                                '[class*="detail"]:not([style*="display: none"])'
                            ];
                            
                            let modalContainer = null;
                            for (const modalSelector of modalSelectors) {
                                const modals = document.querySelectorAll(modalSelector);
                                // Get the last (most recent) visible modal
                                for (let j = modals.length - 1; j >= 0; j--) {
                                    const modal = modals[j];
                                    if (modal && modal.offsetParent !== null) { // Check if visible
                                        modalContainer = modal;
                                        break;
                                    }
                                }
                                if (modalContainer) break;
                            }
                            
                            // If no modal found, search the whole document but be more specific
                            const searchContainer = modalContainer || document;
                            
                            // Look for both phone numbers and emails - using exact selectors from user's HTML
                            const contactSelectors = [
                                'a.contacts__phone.ng-star-inserted[href^="tel:"]',  // Exact phone selector
                                'a[href^="tel:"]',           // Phone links
                                'a[href^="mailto:"]',        // Email links  
                                'a.contacts__phone',
                                '.contacts__phone',
                                '[class*="phone"]',
                                '[class*="contact"]',
                                '[class*="email"]'
                            ];
                            
                            let email = '';
                            
                            // Look for contact info within the container
                            for (const selector of contactSelectors) {
                                const contactElements = searchContainer.querySelectorAll(selector);
                                
                                for (const contactEl of contactElements) {
                                    // Skip if element is not visible
                                    if (contactEl.offsetParent === null) continue;
                                    
                                    const href = contactEl.getAttribute('href');
                                    if (href && href.startsWith('tel:')) {
                                        const rawPhone = href.replace('tel:', '');
                                        if (rawPhone.length === 10) {
                                            phone = `(${rawPhone.slice(0,3)}) ${rawPhone.slice(3,6)}-${rawPhone.slice(6)}`;
                                        } else {
                                            phone = rawPhone;
                                        }
                                    } else if (href && href.startsWith('mailto:')) {
                                        email = href.replace('mailto:', '').trim();
                                    } else {
                                        const contactText = contactEl.textContent.trim();
                                        // Check if it's a phone number
                                        if (contactText.match(/\(\d{3}\)\s*\d{3}-\d{4}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/)) {
                                            phone = contactText;
                                        }
                                        // Check if it's an email
                                        else if (contactText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
                                            email = contactText;
                                        }
                                    }
                                }
                            }
                            
                            // Look for reference number in detail view within the same container
                            let reference = '';
                            const refSelectors = [
                                '.data-item',
                                'div.data-item', 
                                '[class*="data-item"]',
                                '[class*="reference"]',
                                '[class*="load-id"]'
                            ];
                            
                            for (const selector of refSelectors) {
                                const refElements = searchContainer.querySelectorAll(selector);
                                
                                for (const refEl of refElements) {
                                    // Skip if element is not visible
                                    if (refEl.offsetParent === null) continue;
                                    
                                    const refText = refEl.textContent.trim();
                                    if (refText.match(/^[A-Z]+\d+$/)) {
                                        reference = refText;
                                        break;
                                    }
                                }
                                if (reference) break;
                            }
                            
                            // If still no contact info found, do a more comprehensive search
                            if (!phone && !email && !reference) {
                                // Search the entire page for any contact information
                                const allText = document.body.textContent;
                                
                                // Look for phone patterns in all text
                                const phonePattern = /\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/g;
                                const phoneMatches = allText.match(phonePattern);
                                if (phoneMatches && phoneMatches.length > 0) {
                                    phone = phoneMatches[0]; // Take the first phone number found
                                }
                                
                                // Look for email patterns in all text
                                const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                                const emailMatches = allText.match(emailPattern);
                                if (emailMatches && emailMatches.length > 0) {
                                    email = emailMatches[0]; // Take the first email found
                                }
                                
                                // Look for reference patterns in all text
                                const refPattern = /\b[A-Z]{1,3}\d{4,8}\b/g;
                                const refMatches = allText.match(refPattern);
                                if (refMatches && refMatches.length > 0) {
                                    reference = refMatches[0]; // Take the first reference found
                                }
                            }
                            
                            // Debug: Find all contact-related elements for logging
                            const debugContactElements = searchContainer.querySelectorAll('a[href^="tel:"], a[href^="mailto:"], .contacts__phone');
                            const debugInfo = [];
                            debugContactElements.forEach((el, idx) => {
                                debugInfo.push({
                                    index: idx,
                                    tagName: el.tagName,
                                    className: el.className,
                                    href: el.href,
                                    textContent: el.textContent.trim()
                                });
                            });
                            
                            return { 
                                phone, 
                                email,
                                reference,
                                modalFound: modalContainer ? modalContainer.className || modalContainer.tagName : 'none',
                                contactElementsFound: searchContainer.querySelectorAll('a[href^="tel:"], a[href^="mailto:"], [class*="phone"], [class*="contact"], [class*="email"]').length,
                                allLinksFound: searchContainer.querySelectorAll('a').length,
                                modalText: modalContainer ? modalContainer.textContent.substring(0, 500) : 'no modal',
                                pageTextSample: document.body.textContent.substring(0, 500), // Sample of page text for debugging
                                debugContactElements: debugInfo,
                                hasContactSection: !!searchContainer.querySelector('a.contacts__phone, a[href^="tel:"], a[href^="mailto:"]')
                            };
                        });
                        
                        // Close the detail view (try multiple methods)
                        try {
                            this.log('info', `🚪 Closing load ${i + 1} detail view...`);
                            const closeSelectors = [
                                'button[aria-label="Close"]',
                                '.close-button',
                                '[class*="close"]',
                                'button:has-text("Close")',
                                '[role="button"]:has-text("×")'
                            ];
                            
                            let closed = false;
                            for (const selector of closeSelectors) {
                                const closeBtn = await this.page.$(selector);
                                if (closeBtn) {
                                    this.log('info', `✅ Found close button with selector: ${selector}`);
                                    await closeBtn.click();
                                    closed = true;
                                    break;
                                }
                            }
                            
                            if (!closed) {
                                this.log('info', `🔑 No close button found, trying Escape key...`);
                                // Try pressing Escape key
                                await this.page.keyboard.press('Escape');
                            }
                            
                            await this.page.waitForTimeout(1000); // Wait longer for modal to close
                            
                            // Verify the modal is actually closed by checking if it's still visible
                            const modalStillOpen = await this.page.$('.load-details');
                            if (modalStillOpen) {
                                this.log('warn', `⚠️ Modal still open, trying additional close methods...`);
                                // Try clicking outside the modal
                                await this.page.click('body', { position: { x: 50, y: 50 } });
                                await this.page.waitForTimeout(500);
                            }
                            
                            this.log('info', `✅ Load ${i + 1} detail view closed`);
                            
                        } catch (closeError) {
                            this.log('warn', `Could not close detail view: ${closeError.message}`);
                        }
                        
                        this.log('info', `📊 LOAD ${i + 1} EXTRACTION RESULTS:`, {
                            phone: detailedData.phone || '❌ NOT FOUND',
                            email: detailedData.email || '❌ NOT FOUND', 
                            reference: detailedData.reference || '❌ NOT FOUND',
                            modalFound: detailedData.modalFound,
                            contactElementsFound: detailedData.contactElementsFound,
                            allLinksFound: detailedData.allLinksFound,
                            modalText: detailedData.modalText
                        });
                        
                    } catch (detailError) {
                        this.log('warn', `Failed to get details for load ${i + 1}: ${detailError.message}`);
                    }
                    
                    // Merge basic and detailed data
                    const loadData = {
                        ...basicLoadData,
                        phone: detailedData.phone || basicLoadData.phone,
                        email: detailedData.email || '',
                        reference: detailedData.reference || basicLoadData.reference
                    };

                    // Log the extracted data for debugging
                    this.log('debug', `Load ${i + 1} raw data:`, {
                        origin: loadData.origin,
                        destination: loadData.destination,
                        rate: loadData.rate,
                        company: loadData.company,
                        age: loadData.age,
                        phone: loadData.phone,
                        email: loadData.email,
                        reference: loadData.reference,
                        rawText: loadData.rawText.substring(0, 200) + '...',
                        elementHTML: loadData.elementHTML.substring(0, 200) + '...'
                    });

                    // Parse rate information
                    const rateMatch = loadData.rate.match(/\$([0-9,]+)/);
                    const perMileMatch = loadData.rate.match(/\$([0-9.]+).*?\/mi/);

                    const processedLoad = {
                        reference_number: loadData.reference || `LOCALHOST_${Date.now()}_${i}`,
                        origin: loadData.origin || '',
                        destination: loadData.destination || '',
                        rate_total_usd: rateMatch ? parseInt(rateMatch[1].replace(/,/g, '')) : null,
                        rate_per_mile: perMileMatch ? parseFloat(perMileMatch[1]) : null,
                        company: loadData.company || '',
                        contact: loadData.email || loadData.phone || 'N/A',
                        age_posted: loadData.age || '',
                        extracted_at: new Date().toISOString()
                    };

                    this.log('info', `✅ Processed load ${i + 1}:`, {
                        origin: processedLoad.origin,
                        destination: processedLoad.destination,
                        rate_total_usd: processedLoad.rate_total_usd,
                        company: processedLoad.company
                    });

                    extractedData.push(processedLoad);

                } catch (error) {
                    this.log('warn', `Failed to process load ${i + 1}`, { error: error.message });
                }
            }

            this.log('info', `✅ Extracted ${extractedData.length} loads successfully`);
            return extractedData;

        } catch (error) {
            this.log('error', 'Load scraping failed', { error: error.message });
            throw error;
        }
    }

    async saveData(data) {
        try {
            const outputDir = './output';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const csvPath = path.join(outputDir, CONFIG.outputFile);
            
            // Always start fresh - wipe the file each run
            this.log('info', '🗑️ Starting fresh - wiping previous data file');
            if (fs.existsSync(csvPath)) {
                fs.unlinkSync(csvPath);
            }

            const csvWriter = createCsvWriter({
                path: csvPath,
                header: [
                    { id: 'reference_number', title: 'reference_number' },
                    { id: 'origin', title: 'origin' },
                    { id: 'destination', title: 'destination' },
                    { id: 'rate_total_usd', title: 'rate_total_usd' },
                    { id: 'rate_per_mile', title: 'rate_per_mile' },
                    { id: 'company', title: 'company' },
                    { id: 'contact', title: 'contact' },
                    { id: 'age_posted', title: 'age_posted' },
                    { id: 'extracted_at', title: 'extracted_at' }
                ]
                // No append mode - always create fresh
            });

            if (!data || data.length === 0) {
                // Write empty file with just headers
                await csvWriter.writeRecords([]);
                this.log('warn', 'No data to save - created fresh empty file with headers');
                return;
            }

            await csvWriter.writeRecords(data);
            this.log('info', `💾 Saved ${data.length} records to fresh ${csvPath}`);

        } catch (error) {
            this.log('error', 'Failed to save data', { error: error.message });
            throw error;
        }
    }

    async runSingleScrape() {
        try {
            if (!this.isLoggedIn) {
                await this.loginToDAT();
            }

            await this.navigateToLoadBoard();
            
            // Fill the search form with the specified criteria
            await this.fillSearchForm();
            
            // Now scrape the actual load data from the search results
            this.log('info', '🚛 Scraping load data from search results...');
            const data = await this.scrapeLoads();
            await this.saveData(data);

            this.log('info', '🎉 Scraping cycle completed successfully');
            return data;

        } catch (error) {
            this.log('error', 'Scraping cycle failed', { error: error.message });
            throw error;
        }
    }

    async close() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.log('info', '👋 Browser closed');
            }
        } catch (error) {
            this.log('error', 'Error closing browser', { error: error.message });
        }
    }
}

// Main execution
async function main() {
    const scraper = new LocalhostScraper();
    
    try {
        console.log('🏠 LOCALHOST SCRAPER - Automated Login with Email Verification');
        console.log('================================================================');
        console.log('');
        console.log('This will:');
        console.log('✅ Open visible Chrome browser');
        console.log('🔐 Automatically log into DAT.com');
        console.log('📧 Handle email verification (manual or automated)');
        console.log('🚛 Scrape load data');
        console.log('💾 Save to localhost CSV file');
        console.log('');

        await scraper.initialize();
        const data = await scraper.runSingleScrape();
        
        console.log('');
        console.log(`🎉 SUCCESS! Scraped ${data.length} loads`);
        console.log(`📁 Data saved to: output/${CONFIG.outputFile}`);
        console.log('');

    } catch (error) {
        console.error('❌ SCRAPER FAILED:', error.message);
        
        // Take error screenshot for debugging in headless mode
        try {
            if (scraper.page) {
                await scraper.page.screenshot({ 
                    path: 'output/error-screenshot.png', 
                    fullPage: true 
                });
                console.log('📸 Error screenshot saved to output/error-screenshot.png');
            }
        } catch (screenshotError) {
            console.log('⚠️ Could not take error screenshot');
        }
        
        process.exit(1);
    } finally {
        await scraper.close();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = LocalhostScraper;
