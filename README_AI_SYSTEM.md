# AI-Powered Screenshot Analysis System

This system replaces fragile CSS selectors with robust AI vision analysis for extracting freight load data from DAT ONE.

## 🎯 Why AI Screenshot Analysis?

**Problems with CSS Selectors:**

- Break when DAT ONE updates their UI
- Complex nested selectors are hard to maintain
- Dynamic class names and IDs change frequently
- Require constant reverse-engineering of DOM structure

**Benefits of AI Analysis:**

- **Resilient to UI changes** - AI adapts to visual changes
- **Human-like understanding** - Identifies data in any layout
- **Context awareness** - Understands relationships between data
- **Natural language queries** - No complex selector debugging

## 🏗️ System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Scraper   │───▶│  Screenshot DB   │───▶│   AI Analyzer   │
│  (Playwright)   │    │    (SQLite)      │    │  (OpenAI GPT-4V)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Screenshots   │    │   Metadata       │    │ Extracted Data  │
│   (PNG files)   │    │   (URLs, times)  │    │   (JSON/CSV)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📦 Components

### 1. AIScreenshotAnalyzer (`src/ai-screenshot-analyzer.js`)

- **Database Management**: SQLite database for screenshots and extracted data
- **Screenshot Storage**: Organized file storage with metadata
- **AI Integration**: OpenAI GPT-4V API calls for analysis
- **Data Validation**: Quality checks and confidence scoring
- **Export Functions**: CSV export and statistics

### 2. AIEnhancedDATScraper (`src/ai-enhanced-scraper.js`)

- **Browser Automation**: Playwright-based navigation and screenshot capture
- **Session Management**: Uses existing DAT ONE login sessions
- **Intelligent Refresh**: Multiple strategies to get fresh load data
- **Batch Processing**: Handles multiple screenshots efficiently

### 3. OpenAIVisionClient (`src/openai-vision-client.js`)

- **API Communication**: Handles OpenAI GPT-4V API calls
- **Retry Logic**: Exponential backoff for failed requests
- **Error Handling**: Proper handling of rate limits and API errors
- **Connection Testing**: API health checks

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

```bash
# Add to your .env file
OPENAI_API_KEY=your_openai_api_key_here
HEADLESS=false
```

### 3. Save DAT ONE Session (if not already done)

```bash
npm run save-session
```

### 4. Run AI-Powered Scraping

```bash
npm run ai-scrape
```

## 📊 Database Schema

### Screenshots Table

```sql
CREATE TABLE screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT UNIQUE NOT NULL,
    url TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    page_type TEXT,
    analysis_status TEXT DEFAULT 'pending',
    metadata TEXT
);
```

### Extracted Loads Table

```sql
CREATE TABLE extracted_loads (
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
);
```

## 🤖 AI Prompt Engineering

The system uses a carefully crafted prompt to extract structured data:

```
You are analyzing a screenshot of a DAT ONE freight load board.
Extract all visible load information into a structured JSON format.

For each load visible in the screenshot, extract these fields:
- reference_number: Load reference/ID number
- origin: Pickup location (city, state)
- destination: Delivery location (city, state)
- rate_total_usd: Total rate in USD (number only)
- rate_per_mile: Rate per mile in USD (number only)
- company: Broker/shipper company name
- contact: Contact information (phone, email, or contact name)
- age_posted: How long ago posted (e.g., "5m", "2h", "1d")
- equipment_type: Equipment needed (Van, Flatbed, Reefer, etc.)
- weight: Load weight information
- pickup_date: Scheduled pickup date
- delivery_date: Scheduled delivery date
- load_type: Full or Partial load

Return ONLY a JSON array of objects, no additional text.
```

## 🔧 Configuration Options

### AIEnhancedDATScraper Options

```javascript
const scraper = new AIEnhancedDATScraper({
  openaiApiKey: "your-api-key",
  screenshotInterval: 30000, // 30 seconds between screenshots
  maxScreenshotsPerSession: 50, // Maximum screenshots per run
});
```

### Scraping Parameters

```javascript
await scraper.startAIScraping({
  duration: 600000, // 10 minutes total
  screenshotInterval: 30000, // 30 seconds between screenshots
  maxScreenshots: 20, // Maximum 20 screenshots
});
```

## 💰 Cost Estimation

**OpenAI GPT-4V Pricing:**

- Input: $5.00 per 1M tokens
- Output: $15.00 per 1M tokens
- Images: ~1,000-2,000 tokens each (depending on size/detail)

**Estimated costs per screenshot:**

- Image analysis: ~$0.01-0.03 per screenshot
- For 100 screenshots/day: ~$1-3/day

## 📈 Quality & Validation

### Confidence Scoring

Each extracted load gets a confidence score based on:

- Data completeness (how many fields were extracted)
- Data format validation (proper phone numbers, dates, etc.)
- Cross-field consistency checks

### Data Validation

- **Required fields**: Origin and destination must be present
- **Numeric validation**: Rates must be valid numbers
- **Format checking**: Dates, phone numbers, emails
- **Duplicate detection**: Prevents duplicate load entries

## 🔍 Monitoring & Statistics

### Available Statistics

```javascript
const stats = await scraper.getStats();
// Returns:
// {
//   total_screenshots: 45,
//   analyzed: 42,
//   pending: 2,
//   failed: 1,
//   total_loads: 156,
//   avg_confidence: 0.85,
//   min_confidence: 0.60,
//   max_confidence: 1.00
// }
```

### Export Options

```javascript
// Export to CSV
await scraper.exportData("./output/ai-loads.csv");

// Get raw database access
const analyzer = scraper.aiAnalyzer;
const loads = await analyzer.db.all(
  "SELECT * FROM extracted_loads WHERE confidence_score > 0.8"
);
```

## 🧹 Maintenance

### Database Cleanup

```javascript
// Clean up screenshots older than 30 days
await analyzer.cleanup(30);
```

### Storage Management

- Screenshots are stored in `./output/screenshots/`
- Database file: `./output/screenshots.db`
- Automatic cleanup available for old data

## 🚨 Error Handling

### Common Issues

1. **API Rate Limits**: Automatic retry with exponential backoff
2. **Invalid API Key**: Clear error message and graceful fallback
3. **Network Issues**: Retry logic for transient failures
4. **Malformed Screenshots**: Validation and error logging

### Fallback Behavior

- Without API key: Uses mock data for testing
- API failures: Logs errors but continues processing other screenshots
- Database issues: Graceful degradation with file-based backups

## 🔮 Future Enhancements

1. **Multi-Model Support**: Add support for other vision APIs (Claude, Gemini)
2. **Real-time Processing**: Stream processing for live load updates
3. **Advanced Filtering**: AI-powered load matching and filtering
4. **Performance Optimization**: Batch processing and caching
5. **Quality Feedback Loop**: Learn from manual corrections

## 📞 Support

For questions or issues:

1. Check the error logs in the console output
2. Verify your OpenAI API key is valid and has sufficient credits
3. Ensure DAT ONE session is still valid (`npm run save-session`)
4. Check the database file permissions in `./output/`

---

**Note**: This system is designed to be much more robust than CSS selector-based scraping, but initial setup requires an OpenAI API key and some configuration. The investment pays off with dramatically reduced maintenance and higher reliability.
