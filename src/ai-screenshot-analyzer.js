const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

/**
 * AI-Powered Screenshot Analysis System for DAT ONE Load Extraction
 * 
 * This system replaces fragile CSS selectors with AI vision analysis:
 * 1. Takes screenshots of load board pages
 * 2. Stores screenshots in local SQLite database
 * 3. Uses AI (OpenAI GPT-4V or similar) to extract structured data
 * 4. Validates and stores extracted data
 */
class AIScreenshotAnalyzer {
    constructor(options = {}) {
        this.dbPath = options.dbPath || './output/screenshots.db';
        this.screenshotDir = options.screenshotDir || './output/screenshots';
        this.apiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
        this.db = null;
        
        // Ensure screenshot directory exists
        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
    }

    /**
     * Initialize the local SQLite database for screenshot storage
     */
    async initializeDatabase() {
        this.db = await open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });

        // Create screenshots table
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS screenshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT UNIQUE NOT NULL,
                url TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                page_type TEXT,
                analysis_status TEXT DEFAULT 'pending',
                metadata TEXT
            )
        `);

        // Create extracted_loads table with migration support
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS extracted_loads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                screenshot_id INTEGER,
                reference_number TEXT,
                origin TEXT,
                destination TEXT,
                rate_total_usd DECIMAL(10,2),
                rate_per_mile DECIMAL(6,2),
                company TEXT,
                contact TEXT,
                age_posted TEXT,
                equipment_type TEXT,
                weight TEXT,
                pickup_date TEXT,
                delivery_date TEXT,
                load_type TEXT,
                extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                confidence_score DECIMAL(3,2),
                ai_raw_response TEXT,
                FOREIGN KEY (screenshot_id) REFERENCES screenshots (id)
            )
        `);

        // Add new contact columns if they don't exist (migration)
        try {
            await this.db.exec(`ALTER TABLE extracted_loads ADD COLUMN contact_email TEXT`);
            console.log('✅ Added contact_email column');
        } catch (e) {
            // Column already exists, ignore
        }
        
        try {
            await this.db.exec(`ALTER TABLE extracted_loads ADD COLUMN contact_phone TEXT`);
            console.log('✅ Added contact_phone column');
        } catch (e) {
            // Column already exists, ignore
        }
        
        try {
            await this.db.exec(`ALTER TABLE extracted_loads ADD COLUMN contact_name TEXT`);
            console.log('✅ Added contact_name column');
        } catch (e) {
            // Column already exists, ignore
        }

        console.log('✅ Database initialized successfully');
    }

    /**
     * Capture and store a screenshot with metadata
     */
    async captureAndStoreScreenshot(page, metadata = {}) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `loadboard-${timestamp}.png`;
        const filepath = path.join(this.screenshotDir, filename);

        // Take screenshot
        await page.screenshot({ 
            path: filepath, 
            fullPage: true,
            type: 'png'
        });

        // Store in database
        const result = await this.db.run(`
            INSERT INTO screenshots (filename, url, page_type, metadata)
            VALUES (?, ?, ?, ?)
        `, [
            filename,
            metadata.url || page.url(),
            metadata.pageType || 'loadboard',
            JSON.stringify(metadata)
        ]);

        console.log(`📸 Screenshot captured: ${filename}`);
        return {
            id: result.lastID,
            filename,
            filepath
        };
    }

    /**
     * Analyze screenshot using AI vision API
     */
    async analyzeScreenshot(screenshotId) {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not provided');
        }

        // Get screenshot info from database
        const screenshot = await this.db.get(`
            SELECT * FROM screenshots WHERE id = ?
        `, [screenshotId]);

        if (!screenshot) {
            throw new Error(`Screenshot with ID ${screenshotId} not found`);
        }

        const imagePath = path.join(this.screenshotDir, screenshot.filename);
        
        // Read image as base64
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');

        // Prepare AI prompt for load extraction
        const prompt = this.buildExtractionPrompt();

        try {
            // Call OpenAI API (you'll need to install openai package)
            const response = await this.callOpenAIVision(base64Image, prompt);
            
            // Parse AI response
            const extractedLoads = this.parseAIResponse(response);
            
            // Store extracted data
            await this.storeExtractedLoads(screenshotId, extractedLoads, response);
            
            // Update screenshot status
            await this.db.run(`
                UPDATE screenshots SET analysis_status = 'completed' WHERE id = ?
            `, [screenshotId]);

            console.log(`🤖 AI analysis completed for screenshot ${screenshotId}`);
            console.log(`📊 Extracted ${extractedLoads.length} loads`);

            return extractedLoads;

        } catch (error) {
            // Update screenshot status to failed
            await this.db.run(`
                UPDATE screenshots SET analysis_status = 'failed' WHERE id = ?
            `, [screenshotId]);

            console.error(`❌ AI analysis failed for screenshot ${screenshotId}:`, error.message);
            throw error;
        }
    }

    /**
     * Build the extraction prompt for the AI
     */
    buildExtractionPrompt() {
        return `
You are analyzing a screenshot of a DAT ONE freight load board. Extract all visible load information into a structured JSON format.

For each load visible in the screenshot, extract these fields:
- reference_number: Load reference/ID number
- origin: Pickup location (city, state)
- destination: Delivery location (city, state)
- rate_total_usd: Total rate in USD (number only, no currency symbols)
- rate_per_mile: Rate per mile in USD (number only)
- company: Broker/shipper company name
- contact_email: Contact email address (e.g., "loads@company.com")
- contact_phone: Contact phone number (e.g., "555-123-4567")
- contact_name: Contact person name (e.g., "John Smith")
- age_posted: How long ago the load was posted (e.g., "5m", "2h", "1d")
- equipment_type: Type of equipment needed (Van, Flatbed, Reefer, etc.)
- weight: Load weight information
- pickup_date: Scheduled pickup date
- delivery_date: Scheduled delivery date
- load_type: Full or Partial load

Return ONLY a JSON array of objects, no additional text or explanation. If a field is not visible or available, use null.

Example format:
[
  {
    "reference_number": "CA1242",
    "origin": "Ft Morgan, CO",
    "destination": "Lathrop, CA",
    "rate_total_usd": 1050,
    "rate_per_mile": 1.85,
    "company": "California Freight Sales",
    "contact_email": "loads@calfreight.com",
    "contact_phone": "555-123-4567",
    "contact_name": "John Smith",
    "age_posted": "5m",
    "equipment_type": "Van",
    "weight": "45000 lbs",
    "pickup_date": "7/8/2025",
    "delivery_date": "7/9/2025",
    "load_type": "Full"
  }
]
`;
    }

    /**
     * Call OpenAI Vision API using the vision client
     */
    async callOpenAIVision(base64Image, prompt) {
        if (!this.apiKey) {
            // Return mock response for testing without API key
            console.log('🤖 No API key provided, using mock response...');
            return `[
                {
                    "reference_number": "CA1242",
                    "origin": "Ft Morgan, CO",
                    "destination": "Lathrop, CA",
                    "rate_total_usd": 1050,
                    "rate_per_mile": 1.85,
                    "company": "California Freight Sales",
                    "contact": "loads@calfreight.com",
                    "age_posted": "5m",
                    "equipment_type": "Van",
                    "weight": null,
                    "pickup_date": null,
                    "delivery_date": null,
                    "load_type": "Full"
                }
            ]`;
        }

        // Use the OpenAI Vision client
        const OpenAIVisionClient = require('./openai-vision-client');
        const visionClient = new OpenAIVisionClient(this.apiKey);
        
        return await visionClient.analyzeScreenshotWithRetry(base64Image, prompt);
    }

    /**
     * Parse AI response and validate data
     */
    parseAIResponse(response) {
        try {
            // Clean up the response - remove markdown code blocks and extra text
            let cleanedResponse = response.trim();
            
            // Remove markdown code blocks if present
            if (cleanedResponse.includes('```json')) {
                const jsonMatch = cleanedResponse.match(/```json\s*(.*?)\s*```/s);
                if (jsonMatch) {
                    cleanedResponse = jsonMatch[1].trim();
                }
            } else if (cleanedResponse.includes('```')) {
                const jsonMatch = cleanedResponse.match(/```\s*(.*?)\s*```/s);
                if (jsonMatch) {
                    cleanedResponse = jsonMatch[1].trim();
                }
            }
            
            // If response starts with explanation text, try to find JSON array
            if (!cleanedResponse.startsWith('[') && !cleanedResponse.startsWith('{')) {
                const jsonMatch = cleanedResponse.match(/(\[.*\])/s);
                if (jsonMatch) {
                    cleanedResponse = jsonMatch[1];
                } else {
                    // If no JSON found, return empty array
                    console.log('⚠️ No load data found in AI response');
                    return [];
                }
            }
            
            const loads = JSON.parse(cleanedResponse);
            
            // Ensure it's an array
            const loadsArray = Array.isArray(loads) ? loads : [loads];
            
            // Validate each load
            return loadsArray.map(load => this.validateLoadData(load)).filter(Boolean);
        } catch (error) {
            console.error('❌ Failed to parse AI response:', error.message);
            console.log('🔍 Raw response:', response.substring(0, 200) + '...');
            return [];
        }
    }

    /**
     * Validate and clean extracted load data
     */
    validateLoadData(load) {
        const cleaned = { ...load };
        
        // Validate required fields
        if (!cleaned.origin || !cleaned.destination) {
            console.warn('⚠️ Skipping load without origin/destination');
            return null;
        }

        // Clean and validate numeric fields
        if (cleaned.rate_total_usd) {
            cleaned.rate_total_usd = parseFloat(cleaned.rate_total_usd) || null;
        }
        if (cleaned.rate_per_mile) {
            cleaned.rate_per_mile = parseFloat(cleaned.rate_per_mile) || null;
        }

        // Assign confidence score based on completeness
        let completeness = 0;
        const fields = Object.values(cleaned);
        const nonNullFields = fields.filter(field => field !== null && field !== '');
        completeness = nonNullFields.length / fields.length;
        
        cleaned.confidence_score = Math.round(completeness * 100) / 100;

        return cleaned;
    }

    /**
     * Store extracted loads in database
     */
    async storeExtractedLoads(screenshotId, loads, rawResponse) {
        for (const load of loads) {
            await this.db.run(`
                INSERT INTO extracted_loads (
                    screenshot_id, reference_number, origin, destination, 
                    rate_total_usd, rate_per_mile, company, contact_email, 
                    contact_phone, contact_name, age_posted, equipment_type, 
                    weight, pickup_date, delivery_date, load_type, 
                    confidence_score, ai_raw_response
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                screenshotId,
                load.reference_number,
                load.origin,
                load.destination,
                load.rate_total_usd,
                load.rate_per_mile,
                load.company,
                load.contact_email,
                load.contact_phone,
                load.contact_name,
                load.age_posted,
                load.equipment_type,
                load.weight,
                load.pickup_date,
                load.delivery_date,
                load.load_type,
                load.confidence_score,
                rawResponse
            ]);
        }
    }

    /**
     * Export extracted data to CSV
     */
    async exportToCSV(outputPath) {
        const loads = await this.db.all(`
            SELECT 
                el.*,
                s.filename,
                s.timestamp as screenshot_timestamp
            FROM extracted_loads el
            JOIN screenshots s ON el.screenshot_id = s.id
            ORDER BY el.extracted_at DESC
        `);

        if (loads.length === 0) {
            console.log('📭 No extracted loads found to export');
            return;
        }

        // Convert to CSV format
        const createCsvWriter = require('csv-writer').createObjectCsvWriter;
        const csvWriter = createCsvWriter({
            path: outputPath,
            header: [
                { id: 'reference_number', title: 'reference_number' },
                { id: 'origin', title: 'origin' },
                { id: 'destination', title: 'destination' },
                { id: 'rate_total_usd', title: 'rate_total_usd' },
                { id: 'rate_per_mile', title: 'rate_per_mile' },
                { id: 'company', title: 'company' },
                { id: 'contact_email', title: 'contact_email' },
                { id: 'contact_phone', title: 'contact_phone' },
                { id: 'contact_name', title: 'contact_name' },
                { id: 'age_posted', title: 'age_posted' },
                { id: 'equipment_type', title: 'equipment_type' },
                { id: 'weight', title: 'weight' },
                { id: 'pickup_date', title: 'pickup_date' },
                { id: 'delivery_date', title: 'delivery_date' },
                { id: 'load_type', title: 'load_type' },
                { id: 'confidence_score', title: 'confidence_score' },
                { id: 'extracted_at', title: 'extracted_at' },
                { id: 'screenshot_timestamp', title: 'screenshot_timestamp' }
            ]
        });

        await csvWriter.writeRecords(loads);
        console.log(`📊 Exported ${loads.length} loads to ${outputPath}`);
    }

    /**
     * Get analysis statistics
     */
    async getStats() {
        const stats = await this.db.get(`
            SELECT 
                COUNT(*) as total_screenshots,
                COUNT(CASE WHEN analysis_status = 'completed' THEN 1 END) as analyzed,
                COUNT(CASE WHEN analysis_status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN analysis_status = 'failed' THEN 1 END) as failed
            FROM screenshots
        `);

        const loadStats = await this.db.get(`
            SELECT 
                COUNT(*) as total_loads,
                AVG(confidence_score) as avg_confidence,
                MIN(confidence_score) as min_confidence,
                MAX(confidence_score) as max_confidence
            FROM extracted_loads
        `);

        return { ...stats, ...loadStats };
    }

    /**
     * Clean up old screenshots and data
     */
    async cleanup(daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        // Get old screenshots
        const oldScreenshots = await this.db.all(`
            SELECT filename FROM screenshots 
            WHERE timestamp < ? 
        `, [cutoffDate.toISOString()]);

        // Delete old screenshot files
        for (const screenshot of oldScreenshots) {
            const filepath = path.join(this.screenshotDir, screenshot.filename);
            try {
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
            } catch (error) {
                console.warn(`⚠️ Could not delete ${filepath}: ${error.message}`);
            }
        }

        // Delete old database records
        await this.db.run(`DELETE FROM extracted_loads WHERE screenshot_id IN (
            SELECT id FROM screenshots WHERE timestamp < ?
        )`, [cutoffDate.toISOString()]);

        await this.db.run(`DELETE FROM screenshots WHERE timestamp < ?`, [cutoffDate.toISOString()]);

        console.log(`🧹 Cleaned up ${oldScreenshots.length} old screenshots`);
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.db) {
            await this.db.close();
        }
    }
}

module.exports = AIScreenshotAnalyzer;
