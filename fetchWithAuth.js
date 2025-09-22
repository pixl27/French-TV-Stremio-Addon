const puppeteer = require('puppeteer');

async function fetchWithPuppeteerAuth() {
    console.log('🚀 Production Puppeteer auth capture for fstv.fun');
    
    // Test with a few channel IDs first
    const newsIds = ['64', '67', '96']; // Start with 3 channels
    
    const browser = await puppeteer.launch({
        headless: true, // Run headless in production
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security'
        ]
    });

    let allChannels = [];

    for (const newsId of newsIds) {
        console.log(`\n📺 Processing channel ${newsId}...`);
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        let capturedAuthUrl = null;
        let capturedOldUrl = null;
        
        try {
            // Enable request interception
            await page.setRequestInterception(true);
            
            page.on('request', (request) => {
                const url = request.url();
                
                // Capture the first auth URL we see
                if (url.includes('/auth/') && url.includes('.m3u8') && url.includes('token=') && !capturedAuthUrl) {
                    console.log(`🎯 Captured auth URL for ${newsId}`);
                    capturedAuthUrl = url;
                }
                
                request.continue();
            });
            
            // Step 1: Get main page for channel info
            await page.goto(`https://fstv.fun/index.php?newsid=${newsId}`, { 
                waitUntil: 'domcontentloaded',
                timeout: 15000 
            });
            
            const channelInfo = await page.evaluate(() => {
                const iframe = document.querySelector('iframe[src*="?id="]');
                const idMatch = iframe ? iframe.src.match(/\?id=(\d+)/) : null;
                const logoImg = document.querySelector('#posterImage');
                
                return {
                    playerId: idMatch ? idMatch[1] : null,
                    name: logoImg ? logoImg.alt : null,
                    logo: logoImg ? logoImg.src : null
                };
            });
            
            if (!channelInfo.playerId) {
                console.error(`❌ No player ID found for ${newsId}`);
                continue;
            }
            
            console.log(`🆔 ${channelInfo.name} (ID: ${channelInfo.playerId})`);
            
            // Step 2: Navigate to player page and wait for auth requests
            await page.goto(`https://fstv.fun/player/fsplayer.php?id=${channelInfo.playerId}`, { 
                waitUntil: 'networkidle0',
                timeout: 20000 
            });
            
            // Step 3: Extract old URL as fallback
            capturedOldUrl = await page.evaluate(() => {
                const scripts = document.querySelectorAll('script');
                for (let script of scripts) {
                    if (script.textContent && script.textContent.includes('streamUrl')) {
                        const match = script.textContent.match(/var\s+streamUrl\s*=\s*["']([^"']+)["']/);
                        if (match) return match[1];
                    }
                }
                return null;
            });
            
            // Step 4: Wait for auth requests to be triggered
            await new Promise(resolve => setTimeout(resolve, 8000));
            
            await page.close();
            
            // Process results
            const fullLogo = channelInfo.logo && channelInfo.logo.startsWith('/') ? 
                `https://fstv.fun${channelInfo.logo}` : channelInfo.logo;
            
            if (capturedAuthUrl) {
                console.log(`✅ SUCCESS: Auth URL captured`);
                allChannels.push({
                    id: newsId,
                    name: channelInfo.name,
                    url: capturedAuthUrl,
                    logo: fullLogo,
                    method: 'auth_dynamic'
                });
            } else if (capturedOldUrl) {
                console.log(`⚠️ FALLBACK: Using old URL`);
                allChannels.push({
                    id: newsId,
                    name: channelInfo.name,
                    url: capturedOldUrl,
                    logo: fullLogo,
                    method: 'static_fallback'
                });
            } else {
                console.error(`❌ FAILED: No URL found`);
            }
            
        } catch (error) {
            console.error(`❌ Error processing ${newsId}:`, error.message);
            await page.close();
        }
        
        // Small delay between channels
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    await browser.close();
    
    console.log(`\n🏁 Completed! Found ${allChannels.length} channels:`);
    allChannels.forEach((channel, index) => {
        console.log(`${index + 1}. ${channel.name} (${channel.method})`);
        console.log(`   URL: ${channel.url.substring(0, 100)}...`);
    });
    
    return allChannels;
}

module.exports = fetchWithPuppeteerAuth;

// Test run
if (require.main === module) {
    fetchWithPuppeteerAuth().catch(console.error);
}