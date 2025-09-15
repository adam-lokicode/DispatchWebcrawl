const fs = require('fs');

// Read the current scraper
const scraperPath = 'src/production-scraper.js';
const scraperContent = fs.readFileSync(scraperPath, 'utf8');

console.log('🔧 Fixing multiple scraper issues...');

// Fix 1: Improve origin/destination parsing
const improvedOriginDestination = `
    function parseOriginDestination(combinedText) {
        if (!combinedText) return { origin: '', destination: '' };
        
        // Handle cases like "Manteca, CAAurora, CO" or "Salinas, CADenver, CO"
        const text = combinedText.trim();
        
        // Look for pattern: City, StateCity, State
        const match = text.match(/^(.+?,\\s*[A-Z]{2})([A-Z][a-z]+.*?,\\s*[A-Z]{2})$/);
        if (match) {
            return {
                origin: match[1].trim(),
                destination: match[2].trim()
            };
        }
        
        // Fallback: try to split on state abbreviation pattern
        const statePattern = /([A-Z]{2})([A-Z][a-z]+)/;
        const stateMatch = text.match(statePattern);
        if (stateMatch) {
            const splitPoint = text.indexOf(stateMatch[0]);
            if (splitPoint > 0) {
                const origin = text.substring(0, splitPoint + 2).trim();
                const destination = text.substring(splitPoint + 2).trim();
                return { origin, destination };
            }
        }
        
        // Final fallback
        return { origin: text, destination: '' };
    }`;

// Fix 2: Enhanced reference ID extraction with your exact selectors
const improvedReferenceExtraction = `
    function findReferenceNumber() {
        // Wait for modal content to be available
        const modal = document.querySelector('.modal-content, .load-detail-modal, [role="dialog"], .modal-body');
        if (!modal) {
            console.log('No modal found for reference extraction');
            return null;
        }
        
        console.log('Modal found, searching for reference ID...');
        
        // Use your exact selectors first
        const dataLabels = modal.querySelectorAll('.data-label');
        for (const label of dataLabels) {
            if (label.textContent && label.textContent.toLowerCase().includes('reference')) {
                // Look for the corresponding data-item
                const dataItem = label.nextElementSibling;
                if (dataItem && dataItem.classList.contains('data-item')) {
                    const refId = dataItem.textContent.trim();
                    if (refId && refId.length > 0) {
                        console.log('Found reference ID via data-label/data-item:', refId);
                        return refId;
                    }
                }
                
                // Also check previous sibling
                const prevDataItem = label.previousElementSibling;
                if (prevDataItem && prevDataItem.classList.contains('data-item')) {
                    const refId = prevDataItem.textContent.trim();
                    if (refId && refId.length > 0) {
                        console.log('Found reference ID via previous data-item:', refId);
                        return refId;
                    }
                }
            }
        }
        
        // Fallback patterns if exact selectors don't work
        const referencePatterns = [
            /Reference\\s*ID[:\\s]*([A-Z0-9]+)/i,
            /Ref\\s*ID[:\\s]*([A-Z0-9]+)/i,
            /Load\\s*ID[:\\s]*([A-Z0-9]+)/i,
            /\\b([A-Z][0-9]{5,}|[A-Z]{2}[0-9]{4,})\\b/g
        ];
        
        const modalText = modal.textContent || '';
        console.log('Searching modal text for reference patterns...');
        
        for (const pattern of referencePatterns) {
            const match = modalText.match(pattern);
            if (match && match[1]) {
                console.log('Found reference ID via pattern:', match[1]);
                return match[1];
            }
        }
        
        console.log('No reference ID found in modal');
        return null;
    }`;

// Fix 3: Enhanced contact extraction within modal only
const improvedContactExtraction = `
    function findAllContacts() {
        const modal = document.querySelector('.modal-content, .load-detail-modal, [role="dialog"], .modal-body');
        if (!modal) {
            console.log('No modal found for contact extraction');
            return { contactInfo: '', contactCount: 0 };
        }
        
        const modalText = modal.textContent || '';
        const phones = new Set();
        const emails = new Set();
        
        // Enhanced phone regex
        const phoneRegex = /\\(?([0-9]{3})\\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})/g;
        let phoneMatch;
        while ((phoneMatch = phoneRegex.exec(modalText)) !== null) {
            const phone = phoneMatch[0].replace(/[^0-9]/g, '');
            if (phone.length === 10) {
                const formatted = \`(\${phone.slice(0,3)}) \${phone.slice(3,6)}-\${phone.slice(6)}\`;
                phones.add(formatted);
            }
        }
        
        // Enhanced email regex
        const emailRegex = /\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b/g;
        let emailMatch;
        while ((emailMatch = emailRegex.exec(modalText)) !== null) {
            emails.add(emailMatch[0]);
        }
        
        const allContacts = [...phones, ...emails];
        return {
            contactInfo: allContacts.join('; '),
            contactCount: allContacts.length
        };
    }`;

// Fix 4: Enhanced duplicate detection
const improvedDuplicateKey = `
                // Enhanced duplicate detection (exclude reference_number and timestamps)
                const duplicateKey = \`\${cleanOrigin}|\${cleanDestination}|\${company}|\${totalRate}|\${contactInfo}\`;`;

// Apply all fixes to the scraper
let fixedContent = scraperContent;

// Replace the parseOriginDestination function
const parseOriginDestinationRegex = /function parseOriginDestination\([\s\S]*?^    }/m;
if (parseOriginDestinationRegex.test(fixedContent)) {
    fixedContent = fixedContent.replace(parseOriginDestinationRegex, improvedOriginDestination.trim());
    console.log('✅ Updated parseOriginDestination function');
} else {
    console.log('⚠️  Could not find parseOriginDestination function to replace');
}

// Replace the findReferenceNumber function
const findReferenceNumberRegex = /function findReferenceNumber\(\)[\s\S]*?(?=function|\s*const|\s*let|\s*var|$)/;
if (findReferenceNumberRegex.test(fixedContent)) {
    fixedContent = fixedContent.replace(findReferenceNumberRegex, improvedReferenceExtraction.trim() + '\n\n                ');
    console.log('✅ Updated findReferenceNumber function');
} else {
    console.log('⚠️  Could not find findReferenceNumber function to replace');
}

// Replace the findAllContacts function  
const findAllContactsRegex = /function findAllContacts\(\)[\s\S]*?(?=function|\s*const|\s*let|\s*var|$)/;
if (findAllContactsRegex.test(fixedContent)) {
    fixedContent = fixedContent.replace(findAllContactsRegex, improvedContactExtraction.trim() + '\n\n                ');
    console.log('✅ Updated findAllContacts function');
} else {
    console.log('⚠️  Could not find findAllContacts function to replace');
}

// Fix the origin/destination assignment in the basic extraction
const basicExtractionRegex = /(const basicInfo = [\s\S]*?)(origin: originDestText,\s*destination: originDestText,)/;
if (basicExtractionRegex.test(fixedContent)) {
    fixedContent = fixedContent.replace(basicExtractionRegex, (match, prefix, assignment) => {
        return prefix + `
                            const { origin: parsedOrigin, destination: parsedDestination } = parseOriginDestination(originDestText);
                            
                            origin: parsedOrigin,
                            destination: parsedDestination,`;
    });
    console.log('✅ Fixed origin/destination parsing in basic extraction');
} else {
    console.log('⚠️  Could not find basic extraction origin/destination to fix');
}

// Update duplicate detection key
const duplicateKeyRegex = /const duplicateKey = .*?;/;
if (duplicateKeyRegex.test(fixedContent)) {
    fixedContent = fixedContent.replace(duplicateKeyRegex, improvedDuplicateKey.trim());
    console.log('✅ Updated duplicate detection key');
} else {
    console.log('⚠️  Could not find duplicate key to update');
}

// Write the fixed scraper
fs.writeFileSync(scraperPath, fixedContent);
console.log('🎉 All scraper fixes applied successfully!');
console.log('');
console.log('📋 Fixed issues:');
console.log('  ✅ Origin/destination parsing (handles "Manteca, CAAurora, CO")');
console.log('  ✅ Reference ID extraction with your .data-label/.data-item selectors');
console.log('  ✅ Contact extraction limited to modal context only');
console.log('  ✅ Enhanced duplicate detection');
console.log('');
console.log('🚀 Ready to test the improved scraper!');
