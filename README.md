# DAT ONE Freight Crawler

A web crawler built with Playwright to extract freight load data from the DAT ONE platform. This tool handles authentication and provides a flexible framework for crawling freight load information.

## Features

- 🚚 **Freight Load Data**: Extracts load information from DAT ONE freight platform
- 🔗 **Origin/Destination**: Captures route information and distances
- 💰 **Rate Information**: Extracts pricing and rate data
- 📞 **Contact Details**: Captures company and contact information
- 🏢 **Company Information**: Extracts broker/shipper details
- 📋 **Load Requirements**: Captures equipment types and specifications
- 🔐 **Authentication Support**: Handles login to DAT ONE platform
- 💾 **CSV Export**: Saves extracted data to CSV format
- ⚙️ **Configurable**: Customizable timeouts, delays, and output settings
- 🖥️ **Headless Mode**: Can run with or without browser UI

## Prerequisites

- Node.js (v14 or higher)
- Valid DAT ONE account credentials
- npm or yarn package manager

## Installation

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd dat-one-freight-crawler
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Install Playwright browsers:**

   ```bash
   npm run install-browsers
   ```

4. **Set up environment variables:**

   ```bash
   cp env.example .env
   ```

5. **Edit the `.env` file with your credentials:**

   ```env
   # DAT ONE Freight Credentials
   DAT_ONE_USERNAME=your_dat_one_username
   DAT_ONE_PASSWORD=your_dat_one_password
   ```

## Configuration

The crawler can be configured through environment variables in the `.env` file:

| Variable           | Description                         | Default                    |
| ------------------ | ----------------------------------- | -------------------------- |
| `DAT_ONE_USERNAME` | Your DAT ONE username/email         | Required                   |
| `DAT_ONE_PASSWORD` | Your DAT ONE password               | Required                   |
| `HEADLESS`         | Run browser in headless mode        | `false`                    |
| `SLOW_MO`          | Slow down operations (milliseconds) | `1000`                     |
| `TIMEOUT`          | Page load timeout (milliseconds)    | `30000`                    |
| `MAX_RETRIES`      | Maximum retry attempts              | `3`                        |
| `OUTPUT_DIR`       | Directory for output files          | `./output`                 |
| `CSV_FILENAME`     | Name of the CSV output file         | `dat_one_freight_data.csv` |

## Usage

### Session Setup

First, you need to save your DAT ONE login session:

```bash
# Save your DAT ONE login session
npm run save-session

# This will open a browser window where you can manually log in
# After successful login, press Enter to save the session
```

### Basic Freight Crawling

```bash
# Run the freight crawler with default settings
npm run crawl

# Or use the CLI directly
node src/index.js
```

### Session Management

The freight crawler uses session-based authentication to avoid having to log in every time:

- Session files are saved as `session.json`
- Sessions are automatically used if the file exists
- Re-run `npm run save-session` if your session expires

## Output

The freight crawler saves extracted data to a CSV file in the `output` directory. The CSV includes the following columns:

- **Origin**: Load pickup location
- **Destination**: Load delivery location
- **Equipment Type**: Type of equipment required (e.g., Van, Flatbed, Reefer)
- **Weight**: Load weight information
- **Rate**: Rate/pricing information
- **Trip Distance**: Distance of the trip
- **Company**: Broker/shipper company name
- **Contact Info**: Contact information for the load
- **Load Requirements**: Special requirements for the load
- **Pickup Date**: Scheduled pickup date
- **Delivery Date**: Scheduled delivery date
- **Load Type**: Full or partial load
- **Age Posted**: How long ago the load was posted
- **Extracted At**: Timestamp of data extraction

## File Structure

```
dat-one-freight-crawler/
├── src/
│   ├── crawler.js        # Main DAT ONE freight crawler logic
│   ├── index.js          # Main entry point
│   └── save-session.js   # Session saver for authentication
├── output/               # Generated CSV files
├── package.json          # Dependencies and scripts
├── env.example           # Environment variables template
└── README.md            # This file
```

## Customization

### Modifying Search Criteria

You can customize the search criteria in `src/index.js`:

```javascript
const searchCriteria = {
  origin: "Los Angeles, CA",
  destination: "Chicago, IL",
  equipmentType: "Flatbed",
  loadType: "Full",
  dateRange: "8/1/2025 - 8/1/2025",
};
```

### Updating Data Extraction

The freight crawler uses CSS selectors to extract load data. You may need to update the selectors in `src/crawler.js` based on the actual structure of the DAT ONE platform:

```javascript
// In extractLoadFromElement method
const rate = await element.evaluate((el) => {
  const rateElement = el.querySelector(
    '.rate, .price, .amount, [data-testid*="rate"]'
  );
  return rateElement ? rateElement.textContent.trim() : "N/A";
});
```

## Troubleshooting

### Common Issues

1. **Session Expired**:

   - Run `npm run save-session` to create a new session
   - Delete the `session.json` file and recreate it
   - Make sure you complete the full login process during session creation

2. **No Freight Data Extracted**:

   - The DAT ONE website structure may have changed
   - Update the CSS selectors in `extractLoadFromElement` method
   - Check if your search criteria returned any results
   - Verify your DAT ONE account has access to load data

3. **Load Search Failed**:

   - Verify your search criteria (origin, destination, equipment type)
   - Check if there are available loads for your search parameters
   - Try different search criteria to test the crawler

4. **Browser Issues**:
   - Reinstall Playwright browsers: `npm run install-browsers`
   - Try running in headless mode: `HEADLESS=true`

### Debug Mode

To debug issues, run the crawler with visible browser:

```bash
# Set in .env file
HEADLESS=false
SLOW_MO=2000
```

This will show you exactly what the crawler is doing and help identify issues.

## Legal and Ethical Considerations

- **Terms of Service**: Ensure you comply with DAT ONE's terms of service
- **Rate Limiting**: The crawler includes delays to avoid overwhelming the server
- **Data Usage**: Only use extracted data for legitimate purposes
- **Privacy**: Respect privacy and data protection regulations
- **Commercial Use**: Be aware of any restrictions on commercial use of the data
- **Account Responsibility**: You are responsible for maintaining your account credentials securely

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is for educational and research purposes. Users are responsible for complying with all applicable laws, terms of service, and ethical guidelines when using this crawler.
