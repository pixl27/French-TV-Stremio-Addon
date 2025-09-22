const puppeteer = require('puppeteer');

async function testAuthCapture() {
    console.log('🚀 Testing Puppeteer auth capture for fstv.fun with ID 64');
    
    const browser = await puppeteer.launch({
        headless: false, // Set to false to see what's happening
        devtools: true,  // Open devtools to monitor network
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ]
    });

    const page = await browser.newPage();
    
    // Enable request interception
    await page.setRequestInterception(true);
    
    let authUrls = [];
    let allRequests = [];
    
    // Monitor all requests
    page.on('request', (request) => {
        const url = request.url();
        const method = request.method();
        
        allRequests.push({ type: 'request', method, url });
        
        // Look for auth/token/m3u8 requests
        if (url.includes('auth') || url.includes('token') || url.includes('m3u8') || url.includes('stream')) {
            console.log(`🔍 INTERESTING REQUEST: ${method} ${url}`);
            
            // Capture auth URLs
            if (url.includes('/auth/') && url.includes('.m3u8') && url.includes('token=')) {
                console.log(`🎯 AUTH URL CAPTURED: ${url}`);
                authUrls.push(url);
            }
        }
        
        // Continue the request
        request.continue();
    });
    
    // Monitor responses
    page.on('response', async (response) => {
        const url = response.url();
        const status = response.status();
        
        allRequests.push({ type: 'response', status, url });
        
        if (url.includes('auth') || url.includes('token') || url.includes('m3u8') || url.includes('stream')) {
            console.log(`📥 INTERESTING RESPONSE: ${status} ${url}`);
            
            try {
                // Check if response contains auth URLs
                const contentType = response.headers()['content-type'] || '';
                if (contentType.includes('text') || contentType.includes('json') || contentType.includes('javascript')) {
                    const text = await response.text();
                    
                    // Look for auth URLs in response body
                    const authMatches = text.match(/https:\/\/[^"\s\n\r]+\/auth\/\d+\.m3u8\?token=[^"\s\n\r&]+/g);
                    if (authMatches) {
                        console.log(`🎯 AUTH URL IN RESPONSE: ${authMatches[0]}`);
                        authUrls.push(...authMatches);
                    }
                }
            } catch (e) {
                // Ignore errors when trying to read response text
            }
        }
    });
    
    try {
        // Step 1: Go to main page
        console.log('📄 Step 1: Loading main page...');
        await page.goto('https://fstv.fun/index.php?newsid=64', { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        // Extract channel info
        const channelInfo = await page.evaluate(() => {
            const iframe = document.querySelector('iframe[src*="?id="]');
            const idMatch = iframe ? iframe.src.match(/\?id=(\d+)/) : null;
            const logoImg = document.querySelector('#posterImage');
            
            return {
                playerId: idMatch ? idMatch[1] : null,
                name: logoImg ? logoImg.alt : 'RTL9',
                logo: logoImg ? logoImg.src : null
            };
        });
        
        console.log(`🆔 Player ID: ${channelInfo.playerId}`);
        console.log(`📺 Channel: ${channelInfo.name}`);
        
        if (!channelInfo.playerId) {
            throw new Error('Could not find player ID');
        }
        
        // Step 2: Navigate to player page
        const playerUrl = `https://fstv.fun/player/fsplayer.php?id=${channelInfo.playerId}`;
        console.log(`🎮 Step 2: Loading player page: ${playerUrl}`);
        
        await page.goto(playerUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        // Step 3: Extract any static URLs first
        const staticUrls = await page.evaluate(() => {
            const urls = [];
            const scripts = document.querySelectorAll('script');
            
            for (let script of scripts) {
                if (script.textContent) {
                    // Look for streamUrl variable
                    const streamMatch = script.textContent.match(/var\s+streamUrl\s*=\s*["']([^"']+)["']/);
                    if (streamMatch) {
                        urls.push({ type: 'static_stream', url: streamMatch[1] });
                    }
                    
                    // Look for any auth URLs in scripts
                    const authMatches = script.textContent.match(/https:\/\/[^"'\s]+\/auth\/\d+\.m3u8\?token=[^"'\s&]+/g);
                    if (authMatches) {
                        authMatches.forEach(url => urls.push({ type: 'static_auth', url }));
                    }
                }
            }
            
            return urls;
        });
        
        console.log('📋 Static URLs found:', staticUrls);
        
        // Step 4: Wait for dynamic requests (auth system)
        console.log('⏳ Step 3: Waiting for dynamic auth requests...');
        await page.waitForTimeout(15000); // Wait 15 seconds
        
        // Step 5: Try to trigger player interactions
        console.log('🖱️ Step 4: Triggering player interactions...');
        
        await page.evaluate(() => {
            // Click on player
            const player = document.querySelector('#player');
            if (player) {
                player.click();
                console.log('Clicked player');
            }
            
            // Try to trigger Playerjs
            if (window.Playerjs) {
                console.log('Playerjs detected');
                try {
                    // Try to create a new player instance to trigger auth
                    new window.Playerjs({ id: 'player', file: '' });
                } catch (e) {
                    console.log('Playerjs error:', e.message);
                }
            }
            
            // Trigger various events
            ['click', 'play', 'loadstart', 'canplay'].forEach(eventType => {
                document.dispatchEvent(new Event(eventType));
            });
        });
        
        // Wait more for auth requests after interactions
        await page.waitForTimeout(10000);
        
        // Step 6: Check for any new requests in browser console
        const consoleMessages = [];
        page.on('console', msg => {
            consoleMessages.push(msg.text());
            if (msg.text().includes('auth') || msg.text().includes('token') || msg.text().includes('m3u8')) {
                console.log(`🗨️ Console: ${msg.text()}`);
            }
        });
        
        // Final wait
        await page.waitForTimeout(5000);
        
    } catch (error) {
        console.error('❌ Error during test:', error.message);
    }
    
    // Results
    console.log('\n📊 RESULTS:');
    console.log(`Total requests monitored: ${allRequests.length}`);
    console.log(`Auth URLs captured: ${authUrls.length}`);
    
    if (authUrls.length > 0) {
        console.log('\n🎯 CAPTURED AUTH URLs:');
        authUrls.forEach((url, index) => {
            console.log(`${index + 1}. ${url}`);
        });
    }
    
    // Filter interesting requests
    const streamRequests = allRequests.filter(req => 
        req.url && (req.url.includes('m3u8') || req.url.includes('auth') || req.url.includes('token') || req.url.includes('stream'))
    );
    
    if (streamRequests.length > 0) {
        console.log('\n🔍 ALL STREAM-RELATED REQUESTS:');
        streamRequests.forEach((req, index) => {
            console.log(`${index + 1}. [${req.type}] ${req.method || req.status} ${req.url}`);
        });
    }
    
    // Keep browser open for manual inspection
    console.log('\n🔍 Browser left open for manual inspection. Press Ctrl+C to close.');
    
    // Don't close browser automatically - let user inspect
    // await browser.close();
    
    return {
        authUrls,
        streamRequests,
        totalRequests: allRequests.length
    };
}

// Run the test
if (require.main === module) {
    testAuthCapture().catch(console.error);
}

module.exports = testAuthCapture;