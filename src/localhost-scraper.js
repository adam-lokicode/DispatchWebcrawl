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
    headless: false, // Always visible for localhost
    timeout: 30000, // Faster timeout
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
                await this.page.waitForTimeout(1000);
                
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
                        await this.page.waitForTimeout(1000); // Faster wait
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
                            await this.page.waitForTimeout(1000);
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

        // Try Gmail API first (official, secure method)
        try {
            this.log('info', '🔑 Attempting Gmail API verification...');
            const gmailAPI = new GmailAPI();
            const authenticated = await gmailAPI.authenticate();
            
            if (authenticated) {
                this.log('info', '✅ Gmail API authenticated, searching for verification code...');
                const code = await gmailAPI.waitForVerificationCode(3, 5); // Wait 3 min, check every 5 sec
                
                if (code) {
                    this.log('info', `✅ Found verification code via Gmail API: ${code}`);
                    await this.enterVerificationCode(code);
                    return;
                } else {
                    this.log('warn', '⚠️ Gmail API timeout, falling back to manual entry');
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
                await this.page.waitForTimeout(500);
                
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

    async scrapeLoads() {
        try {
            this.log('info', '🔍 Starting load extraction');
            
            // Try multiple selectors to find load rows
            const rowSelectors = [
                '.row-container',
                '[class*="load-row"]',
                '[data-test*="load-row"]',
                '[class*="load"][class*="row"]',
                'tr[class*="load"]',
                'div[class*="load"]:not([class*="board"]):not([class*="search"])',
                '[role="row"]',
                'tbody tr',
                '.table-row'
            ];
            
            let loadRows = [];
            let usedSelector = null;
            
            for (const selector of rowSelectors) {
                try {
                    this.log('debug', `Testing row selector: ${selector}`);
                    const rows = await this.page.$$(selector);
                    if (rows && rows.length > 0) {
                        loadRows = rows;
                        usedSelector = selector;
                        this.log('info', `✅ Found ${rows.length} load rows with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            const targetRows = loadRows.slice(0, CONFIG.maxEntries);
            
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
                
                throw new Error(`No load rows found with any selector. Used selectors: ${rowSelectors.join(', ')}`);
            }

            const extractedData = [];
            
            for (let i = 0; i < targetRows.length; i++) {
                try {
                    const row = targetRows[i];
                    this.log('debug', `Processing load ${i + 1}/${targetRows.length}`);
                    
                    // Extract basic data from row
                    const loadData = await row.evaluate(el => {
                        const getTextContent = (selector) => {
                            const element = el.querySelector(selector);
                            return element ? element.textContent.trim() : '';
                        };

                        return {
                            origin: getTextContent('[data-test="load-origin-cell"]'),
                            destination: getTextContent('[data-test="load-destination-cell"]'),
                            rate: getTextContent('[data-test="load-rate-cell"]'),
                            company: getTextContent('[data-test="load-company-cell"]'),
                            age: getTextContent('[data-test="load-age-cell"]')
                        };
                    });

                    // Parse rate information
                    const rateMatch = loadData.rate.match(/\$([0-9,]+)/);
                    const perMileMatch = loadData.rate.match(/\$([0-9.]+).*?\/mi/);

                    const processedLoad = {
                        reference_number: `LOCALHOST_${Date.now()}_${i}`,
                        origin: loadData.origin || '',
                        destination: loadData.destination || '',
                        rate_total_usd: rateMatch ? parseInt(rateMatch[1].replace(/,/g, '')) : null,
                        rate_per_mile: perMileMatch ? parseFloat(perMileMatch[1]) : null,
                        company: loadData.company || '',
                        contact: 'N/A', // Would need to click for details
                        age_posted: loadData.age || '',
                        extracted_at: new Date().toISOString()
                    };

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
            if (data.length === 0) {
                this.log('warn', 'No data to save');
                return;
            }

            const outputDir = './output';
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const csvPath = path.join(outputDir, CONFIG.outputFile);
            const writeHeader = !fs.existsSync(csvPath);

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
                ],
                append: !writeHeader
            });

            await csvWriter.writeRecords(data);
            this.log('info', `💾 Saved ${data.length} records to ${csvPath}`);

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
