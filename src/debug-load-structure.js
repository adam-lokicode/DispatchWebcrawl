const { chromium } = require('playwright');

async function debugLoadStructure() {
    console.log('🔗 Connecting to existing Chrome browser to debug load structure...');
    
    try {
        // Connect to existing browser
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const contexts = browser.contexts();
        
        if (contexts.length === 0) {
            throw new Error('No browser contexts found');
        }
        
        const context = contexts[0];
        const pages = context.pages();
        
        if (pages.length === 0) {
            throw new Error('No pages found');
        }
        
        // Use the first page or find the DAT One page
        let page = pages[0];
        for (const p of pages) {
            const url = p.url();
            if (url.includes('dat.com') || url.includes('one.dat.com')) {
                page = p;
                break;
            }
        }
        
        console.log(`📄 Using page: ${page.url()}`);
        
        // Wait for load origin cells to appear
        console.log('⏳ Waiting for load origin cells...');
        await page.waitForSelector('[data-test="load-origin-cell"]', { timeout: 30000 });
        
        // Get all load origin cells
        const originCells = await page.$$('[data-test="load-origin-cell"]');
        console.log(`📋 Found ${originCells.length} load origin cells`);
        
        // Examine the structure around the first few origin cells
        const maxCells = Math.min(3, originCells.length);
        
        for (let i = 0; i < maxCells; i++) {
            console.log(`\n🔍 EXAMINING LOAD ${i + 1}/${maxCells}...`);
            
            const cell = originCells[i];
            
            // Get detailed information about this cell and its parents
            const cellInfo = await cell.evaluate(el => {
                const info = {
                    cellContent: el.textContent.trim(),
                    cellClass: el.className,
                    cellTag: el.tagName,
                    parents: []
                };
                
                // Walk up the DOM tree to find parent elements
                let currentElement = el;
                let level = 0;
                while (currentElement && level < 10) {
                    const parent = currentElement.parentElement;
                    if (parent) {
                        info.parents.push({
                            level: level,
                            tag: parent.tagName,
                            className: parent.className,
                            id: parent.id || 'N/A',
                            innerHTML: parent.innerHTML.substring(0, 100) + '...'
                        });
                        currentElement = parent;
                        level++;
                    } else {
                        break;
                    }
                }
                
                return info;
            });
            
            console.log(`📦 Cell ${i + 1} Info:`);
            console.log(`   Content: ${cellInfo.cellContent}`);
            console.log(`   Class: ${cellInfo.cellClass}`);
            console.log(`   Tag: ${cellInfo.cellTag}`);
            console.log(`   Parents:`);
            
            cellInfo.parents.forEach(parent => {
                console.log(`     Level ${parent.level}: <${parent.tag}> class="${parent.className}" id="${parent.id}"`);
            });
            
            // Look for siblings (other load-related cells in the same row/container)
            const siblings = await cell.evaluate(el => {
                const parent = el.parentElement;
                if (!parent) return [];
                
                const siblings = [];
                const children = parent.children;
                
                for (let child of children) {
                    if (child.getAttribute('data-test') && child.getAttribute('data-test').includes('load')) {
                        siblings.push({
                            dataTest: child.getAttribute('data-test'),
                            content: child.textContent.trim(),
                            className: child.className
                        });
                    }
                }
                
                return siblings;
            });
            
            console.log(`   Siblings with load data-test:`);
            siblings.forEach(sibling => {
                console.log(`     ${sibling.dataTest}: ${sibling.content} (${sibling.className})`);
            });
            
            // Try to find the clickable parent element
            const clickableParent = await cell.evaluate(el => {
                let currentElement = el;
                let level = 0;
                
                while (currentElement && level < 10) {
                    const parent = currentElement.parentElement;
                    if (parent) {
                        // Check if this parent looks like a clickable row
                        const hasClickableAttributes = parent.onclick || 
                                                     parent.style.cursor === 'pointer' ||
                                                     parent.getAttribute('role') === 'button' ||
                                                     parent.getAttribute('role') === 'row' ||
                                                     parent.tagName === 'TR' ||
                                                     parent.className.includes('row') ||
                                                     parent.className.includes('clickable');
                        
                        if (hasClickableAttributes) {
                            return {
                                level: level,
                                tag: parent.tagName,
                                className: parent.className,
                                id: parent.id || 'N/A',
                                hasOnClick: !!parent.onclick,
                                cursor: parent.style.cursor,
                                role: parent.getAttribute('role')
                            };
                        }
                        
                        currentElement = parent;
                        level++;
                    } else {
                        break;
                    }
                }
                
                return null;
            });
            
            if (clickableParent) {
                console.log(`   🖱️ Found potential clickable parent at level ${clickableParent.level}:`);
                console.log(`     Tag: ${clickableParent.tag}`);
                console.log(`     Class: ${clickableParent.className}`);
                console.log(`     ID: ${clickableParent.id}`);
                console.log(`     Has onClick: ${clickableParent.hasOnClick}`);
                console.log(`     Cursor: ${clickableParent.cursor}`);
                console.log(`     Role: ${clickableParent.role}`);
            } else {
                console.log(`   ⚠️ No obvious clickable parent found`);
            }
            
            console.log('\n' + '='.repeat(80));
        }
        
        // Now let's try to find all potential clickable containers
        console.log('\n🔍 LOOKING FOR ALL POTENTIAL CLICKABLE CONTAINERS...');
        
        const potentialContainers = await page.evaluate(() => {
            const containers = [];
            
            // Get all elements that contain load origin cells
            const originCells = document.querySelectorAll('[data-test="load-origin-cell"]');
            
            originCells.forEach((cell, index) => {
                let parent = cell.parentElement;
                let level = 0;
                
                while (parent && level < 5) {
                    // Check if this parent contains multiple load data-test attributes
                    const loadDataTests = parent.querySelectorAll('[data-test*="load"]');
                    
                    if (loadDataTests.length >= 3) { // If it has at least 3 load-related elements
                        containers.push({
                            index: index,
                            level: level,
                            tag: parent.tagName,
                            className: parent.className,
                            id: parent.id || 'N/A',
                            loadDataCount: loadDataTests.length,
                            selector: parent.tagName.toLowerCase() + (parent.className ? '.' + parent.className.split(' ')[0] : '')
                        });
                        break;
                    }
                    
                    parent = parent.parentElement;
                    level++;
                }
            });
            
            return containers;
        });
        
        console.log(`📋 Found ${potentialContainers.length} potential clickable containers:`);
        potentialContainers.forEach((container, idx) => {
            console.log(`   ${idx + 1}. Load ${container.index + 1} - Level ${container.level}: <${container.tag}> class="${container.className}"`);
            console.log(`      ID: ${container.id}, Load Data Count: ${container.loadDataCount}`);
            console.log(`      Selector: ${container.selector}`);
        });
        
        console.log('\n✅ Load structure debug completed!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the debug
debugLoadStructure(); 