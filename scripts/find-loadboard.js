#!/usr/bin/env node

const { chromium } = require('playwright');

async function findLoadboard() {
    console.log('🔍 Finding the correct DAT ONE loadboard...');
    
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        console.log(`📄 Starting at: ${page.url()}`);
        
        // Try different DAT ONE URLs
        const urlsToTry = [
            'https://www.dat.com/loadboard',
            'https://www.dat.com/load-board', 
            'https://www.dat.com/one/loadboard',
            'https://www.dat.com/dashboard'
        ];
        
        for (const url of urlsToTry) {
            console.log(`\n🎯 Trying: ${url}`);
            try {
                await page.goto(url, { 
                    waitUntil: 'networkidle',
                    timeout: 15000 
                });
                
                await page.waitForTimeout(2000);
                
                console.log(`   📍 Landed at: ${page.url()}`);
                console.log(`   📝 Title: ${await page.title()}`);
                
                // Check for load elements
                const loadRows = await page.$$('.row-container');
                const loadCells = await page.$$('[data-test="load-origin-cell"]');
                
                console.log(`   📦 Found ${loadRows.length} load containers`);
                console.log(`   🎯 Found ${loadCells.length} load cells`);
                
                if (loadRows.length > 0 || loadCells.length > 0) {
                    console.log('   ✅ FOUND LOADS! This is the right page!');
                    
                    if (loadCells.length > 0) {
                        const sampleLoad = await loadCells[0].evaluate(cell => cell.textContent.trim());
                        console.log(`   📋 Sample origin: ${sampleLoad}`);
                    }
                    
                    console.log(`\n🎉 SUCCESS! Use this URL: ${page.url()}`);
                    await browser.close();
                    return;
                }
                
            } catch (e) {
                console.log(`   ❌ Failed: ${e.message}`);
            }
        }
        
        console.log('\n🤔 None of the standard URLs worked. Let me check what navigation options are available...');
        
        // Look for navigation links
        const navLinks = await page.$$eval('a[href*="load"], a[href*="search"], button', links => 
            links.map(link => ({
                text: link.textContent.trim(),
                href: link.href || 'button',
                visible: !link.hidden && link.offsetParent !== null
            })).filter(link => 
                link.text && 
                link.visible &&
                (link.text.toLowerCase().includes('load') || 
                 link.text.toLowerCase().includes('search') ||
                 link.text.toLowerCase().includes('board'))
            )
        );
        
        console.log('🔗 Available navigation options:');
        navLinks.forEach((link, i) => {
            console.log(`   ${i + 1}. "${link.text}" -> ${link.href}`);
        });
        
        await browser.close();
        
    } catch (error) {
        console.error('❌ Search failed:', error.message);
    }
}

findLoadboard();
