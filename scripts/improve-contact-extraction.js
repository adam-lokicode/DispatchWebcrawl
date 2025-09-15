#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function improveContactExtraction() {
    console.log('🔧 Improving contact extraction in production scraper...');
    
    const scraperPath = path.join('./src', 'production-scraper.js');
    let scraperContent = fs.readFileSync(scraperPath, 'utf8');
    
    // Find the contact extraction section and replace it with more aggressive logic
    const contactExtractionStart = scraperContent.indexOf('// Look for contact information in company cell');
    const contactExtractionEnd = scraperContent.indexOf('// If no specific contact element, look for patterns in company text', contactExtractionStart);
    
    if (contactExtractionStart === -1 || contactExtractionEnd === -1) {
        console.log('❌ Could not find contact extraction section');
        return;
    }
    
    // Enhanced contact extraction logic
    const improvedContactExtraction = `// Look for contact information in company cell
                        const contactSelectors = [
                            '.contact-state',
                            '.contact-info', 
                            '.phone',
                            '.email',
                            '[class*="contact"]',
                            '[class*="phone"]',
                            '[class*="email"]',
                            '[data-test*="contact"]',
                            '[data-test*="phone"]',
                            '.company-contact',
                            '.load-contact'
                        ];
                        
                        for (const selector of contactSelectors) {
                            const contactEl = companyElement.querySelector(selector);
                            if (contactEl) {
                                const contactText = contactEl.textContent.trim();
                                if (contactText && contactText !== 'N/A' && contactText.length > 0) {
                                    contactInfo = contactText;
                                    break;
                                }
                            }
                        }
                        
                        `;
    
    // Enhanced pattern matching section
    const improvedPatternMatching = `// If no specific contact element, look for patterns in company text
                        if (contactInfo === 'N/A') {
                            const companyText = companyElement.textContent;
                            
                            // More comprehensive phone number patterns
                            const phonePatterns = [
                                /\\(\\d{3}\\)\\s*\\d{3}[-\\s]?\\d{4}/g,  // (123) 123-1234
                                /\\d{3}[-\\.]\\d{3}[-\\.]\\d{4}/g,       // 123-123-1234 or 123.123.1234
                                /\\d{3}\\s\\d{3}\\s\\d{4}/g,           // 123 123 1234
                                /\\(\\d{3}\\)\\d{3}-\\d{4}/g,          // (123)123-1234
                                /\\d{10}/g,                           // 1234567890
                                /\\+1[-\\s]?\\d{3}[-\\s]?\\d{3}[-\\s]?\\d{4}/g // +1-123-123-1234
                            ];
                            
                            for (const pattern of phonePatterns) {
                                const phoneMatch = companyText.match(pattern);
                                if (phoneMatch) {
                                    contactInfo = phoneMatch[0];
                                    break;
                                }
                            }
                            
                            // If no phone found, look for email with more patterns
                            if (contactInfo === 'N/A') {
                                const emailPatterns = [
                                    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g,
                                    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}\\.[a-zA-Z]{2,}/g,
                                    /[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}/g
                                ];
                                
                                for (const pattern of emailPatterns) {
                                    const emailMatch = companyText.match(pattern);
                                    if (emailMatch) {
                                        contactInfo = emailMatch[0];
                                        break;
                                    }
                                }
                            }
                            
                            // Last resort: look in the entire row for contact info
                            if (contactInfo === 'N/A') {
                                const rowText = el.textContent;
                                
                                // Try to find any phone number in the entire row
                                for (const pattern of phonePatterns) {
                                    const phoneMatch = rowText.match(pattern);
                                    if (phoneMatch) {
                                        contactInfo = phoneMatch[0];
                                        break;
                                    }
                                }
                                
                                // Try to find any email in the entire row
                                if (contactInfo === 'N/A') {
                                    for (const pattern of emailPatterns) {
                                        const emailMatch = rowText.match(pattern);
                                        if (emailMatch) {
                                            contactInfo = emailMatch[0];
                                            break;
                                        }
                                    }
                                }
                            }
                        `;
    
    // Replace the contact extraction section
    const beforeContact = scraperContent.substring(0, contactExtractionStart);
    const afterContact = scraperContent.substring(scraperContent.indexOf('}', contactExtractionEnd) + 1);
    
    const updatedContent = beforeContact + improvedContactExtraction + improvedPatternMatching + '\n                        }' + afterContact;
    
    // Write the updated scraper
    fs.writeFileSync(scraperPath, updatedContent);
    
    console.log('✅ Enhanced contact extraction with:');
    console.log('   📞 Multiple phone number patterns');
    console.log('   📧 Enhanced email detection');
    console.log('   🔍 Broader selector coverage');
    console.log('   🌐 Full row text scanning as fallback');
    console.log('   📊 Should improve contact coverage significantly');
}

improveContactExtraction();
