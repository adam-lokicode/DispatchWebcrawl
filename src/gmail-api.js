const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GmailAPI {
    constructor() {
        this.gmail = null;
        this.auth = null;
    }

    async authenticate() {
        try {
            // Check if we have saved credentials
            const credentialsPath = path.join(__dirname, '..', 'gmail-credentials.json');
            const tokenPath = path.join(__dirname, '..', 'gmail-token.json');
            
            let credentials;
            try {
                const credentialsFile = await fs.readFile(credentialsPath, 'utf8');
                credentials = JSON.parse(credentialsFile);
            } catch (error) {
                console.log('📋 Gmail credentials not found. Please set up Gmail API credentials.');
                console.log('   1. Go to https://console.developers.google.com/');
                console.log('   2. Create a new project or select existing');
                console.log('   3. Enable Gmail API');
                console.log('   4. Create OAuth 2.0 credentials');
                console.log('   5. Download credentials.json and save as gmail-credentials.json');
                return false;
            }

            const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

            // Check if we have a saved token
            try {
                const tokenFile = await fs.readFile(tokenPath, 'utf8');
                const token = JSON.parse(tokenFile);
                oAuth2Client.setCredentials(token);
                
                // Test if token is still valid
                await oAuth2Client.getAccessToken();
                this.auth = oAuth2Client;
                this.gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
                console.log('✅ Gmail API authenticated successfully');
                return true;
                
            } catch (error) {
                // Token doesn't exist or is invalid, need to get new one
                console.log('🔐 Gmail token expired or missing. Getting new authorization...');
                
                const authUrl = oAuth2Client.generateAuthUrl({
                    access_type: 'offline',
                    scope: ['https://www.googleapis.com/auth/gmail.readonly']
                });
                
                console.log('📋 Please visit this URL to authorize Gmail access:');
                console.log(authUrl);
                console.log('');
                console.log('After authorization, you\'ll get a code. Run:');
                console.log('node src/setup-gmail.js YOUR_CODE_HERE');
                
                return false;
            }
            
        } catch (error) {
            console.error('❌ Gmail authentication error:', error.message);
            return false;
        }
    }

    async searchForVerificationCode(searchTerms = ['DAT', 'verification', 'code'], maxAge = 10) {
        if (!this.gmail) {
            console.log('❌ Gmail not authenticated');
            return null;
        }

        try {
            console.log('🔍 Searching Gmail for verification code...');
            
            // Search for VERY recent emails (last 2 minutes only) with verification keywords  
            const query = `from:DAT OR subject:(verification code) OR body:(verification code) newer_than:2m`;
            
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: 10
            });

            if (!response.data.messages || response.data.messages.length === 0) {
                console.log('📭 No recent verification emails found');
                return null;
            }

            console.log(`📧 Found ${response.data.messages.length} potential emails`);

            // Check each message for verification code
            for (const message of response.data.messages) {
                try {
                    const msg = await this.gmail.users.messages.get({
                        userId: 'me',
                        id: message.id,
                        format: 'full'
                    });

                    // Extract email content
                    let emailContent = '';
                    let subject = '';
                    
                    // Get headers
                    if (msg.data.payload.headers) {
                        const subjectHeader = msg.data.payload.headers.find(h => h.name === 'Subject');
                        subject = subjectHeader ? subjectHeader.value : '';
                    }

                    // Get email body
                    if (msg.data.payload.body && msg.data.payload.body.data) {
                        emailContent = Buffer.from(msg.data.payload.body.data, 'base64').toString();
                    } else if (msg.data.payload.parts) {
                        for (const part of msg.data.payload.parts) {
                            if (part.mimeType === 'text/plain' && part.body.data) {
                                emailContent += Buffer.from(part.body.data, 'base64').toString();
                            } else if (part.mimeType === 'text/html' && part.body.data) {
                                const htmlContent = Buffer.from(part.body.data, 'base64').toString();
                                // Strip HTML tags for code extraction
                                emailContent += htmlContent.replace(/<[^>]*>/g, ' ');
                            }
                        }
                    }

                    console.log(`📧 Checking email: ${subject}`);

                    // Look for verification codes in the email
                    const codePatterns = [
                        /verification code[:\s]*(\d{4,8})/i,
                        /your code[:\s]*(\d{4,8})/i,
                        /enter[:\s]*(\d{4,8})/i,
                        /code[:\s]*(\d{4,8})/i,
                        /\b(\d{6})\b/g,  // 6-digit codes
                        /\b(\d{4})\b/g   // 4-digit codes
                    ];

                    for (const pattern of codePatterns) {
                        const matches = emailContent.match(pattern);
                        if (matches) {
                            const code = matches[1] || matches[0].replace(/\D/g, '');
                            if (code && code.length >= 4 && code.length <= 8) {
                                console.log(`✅ Found verification code: ${code}`);
                                return code;
                            }
                        }
                    }

                } catch (msgError) {
                    console.log('⚠️ Error reading message:', msgError.message);
                    continue;
                }
            }

            console.log('❌ No verification code found in recent emails');
            return null;

        } catch (error) {
            console.error('❌ Gmail search error:', error.message);
            return null;
        }
    }

    async waitForVerificationCode(maxWaitMinutes = 5, checkIntervalSeconds = 10) {
        console.log(`⏳ Waiting up to ${maxWaitMinutes} minutes for verification email...`);
        
        const startTime = Date.now();
        const maxWaitMs = maxWaitMinutes * 60 * 1000;
        const checkIntervalMs = checkIntervalSeconds * 1000;

        while (Date.now() - startTime < maxWaitMs) {
            const code = await this.searchForVerificationCode();
            if (code) {
                return code;
            }

            console.log(`⏳ No code yet, checking again in ${checkIntervalSeconds} seconds...`);
            await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
        }

        console.log('⏰ Timeout waiting for verification email');
        return null;
    }
}

module.exports = GmailAPI;
