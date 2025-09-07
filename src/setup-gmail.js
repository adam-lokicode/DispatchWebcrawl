const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

async function setupGmail() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // Check if credentials file exists
        const credentialsPath = path.join(__dirname, '..', 'gmail-credentials.json');
        try {
            await fs.readFile(credentialsPath, 'utf8');
            console.log('✅ Found gmail-credentials.json');
            console.log('');
            console.log('📋 Starting Gmail OAuth Authorization...');
            
            // Start OAuth flow
            const credentialsFile = await fs.readFile(credentialsPath, 'utf8');
            const credentials = JSON.parse(credentialsFile);
            
            const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
            
            const authUrl = oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: ['https://www.googleapis.com/auth/gmail.readonly']
            });
            
            console.log('🔗 Please visit this URL to authorize Gmail access:');
            console.log('');
            console.log(authUrl);
            console.log('');
            console.log('After authorization, you\'ll get a code.');
            console.log('Then run: node src/setup-gmail.js YOUR_CODE_HERE');
            console.log('');
            return;
            
        } catch (error) {
            console.log('❌ gmail-credentials.json not found!');
            console.log('');
            console.log('📋 Gmail API Setup Steps:');
            console.log('1. Go to https://console.developers.google.com/');
            console.log('2. Create a new project or select existing project');
            console.log('3. Enable the Gmail API');
            console.log('4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"');
            console.log('5. Choose "Desktop application"');
            console.log('6. Download the credentials JSON file');
            console.log('7. Save it as "gmail-credentials.json" in the project root');
            console.log('8. Run: node src/setup-gmail.js');
            console.log('');
            return;
        }
    }

    const authCode = args[0];
    
    try {
        // Read credentials
        const credentialsPath = path.join(__dirname, '..', 'gmail-credentials.json');
        const credentialsFile = await fs.readFile(credentialsPath, 'utf8');
        const credentials = JSON.parse(credentialsFile);
        
        const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        
        // Exchange authorization code for tokens
        const { tokens } = await oAuth2Client.getToken(authCode);
        oAuth2Client.setCredentials(tokens);
        
        // Save tokens
        const tokenPath = path.join(__dirname, '..', 'gmail-token.json');
        await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
        
        console.log('✅ Gmail API setup completed successfully!');
        console.log('🔐 Access token saved to gmail-token.json');
        console.log('');
        console.log('Now your scraper can automatically:');
        console.log('• Read your Gmail for DAT verification emails');
        console.log('• Extract verification codes automatically');
        console.log('• Complete login without manual intervention');
        console.log('');
        console.log('Test it: npm run localhost');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        console.log('');
        console.log('Make sure:');
        console.log('1. gmail-credentials.json exists in project root');
        console.log('2. You copied the authorization code correctly');
        console.log('3. The code hasn\'t expired (get a fresh one)');
    }
}

setupGmail();
