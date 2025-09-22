const puppeteer = require('puppeteer');
const axios = require('axios');

/**
 * Fast auth capture with minimal overhead
 */
async function captureChannelAuth(playerId) {
    console.log(`🚀 Fast auth capture for channel ID ${playerId}`);
    
    let browser = null;
    let authUrl = null;
    let segments = [];
    
    try {
        // Launch browser with minimal features for speed
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-images',
                '--disable-javascript',
                '--disable-plugins',
                '--disable-extensions',
                '--no-first-run'
            ]
        });
        
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        
        // Only capture auth URLs, ignore everything else
        page.on('request', (request) => {
            const url = request.url();
            
            if (url.includes('iptv2.french-live.lol/auth/') && url.includes('.m3u8')) {
                console.log(`🎯 AUTH URL: ${url}`);
                authUrl = url;
            }
            
            request.continue();
        });
        
        // Load page with short timeout
        const playerUrl = `https://fstv.fun/player/fsplayer.php?id=${playerId}`;
        console.log(`📺 Loading: ${playerUrl}`);
        
        await page.goto(playerUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 15000 
        });
        
        // Wait just 3 seconds for auth
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if (!authUrl) {
            throw new Error('No auth URL captured');
        }
        
        // Fast M3U8 fetch
        console.log(`📡 Fetching M3U8...`);
        const response = await axios.get(authUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': playerUrl
            }
        });
        
        const m3u8Content = response.data;
        console.log(`📋 M3U8 length: ${m3u8Content?.length || 0} chars`);
        
        if (m3u8Content && m3u8Content.includes('#EXTM3U')) {
            console.log(`📋 M3U8 preview: ${m3u8Content.substring(0, 200)}...`);
            // Extract segments
            const lines = m3u8Content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('.ts')) {
                    const fullUrl = trimmed.startsWith('/') 
                        ? `https://iptv2.french-live.lol${trimmed}`
                        : trimmed;
                    segments.push(fullUrl);
                }
            }
            console.log(`📹 Found ${segments.length} segments`);
        } else {
            console.log(`⚠️ Invalid M3U8 content`);
        }
        
        console.log(`✅ Captured ${segments.length} segments`);
        
        return {
            success: true,
            authUrl: authUrl,
            segments: segments,
            m3u8Content: m3u8Content
        };
        
    } catch (error) {
        console.error(`❌ Fast auth capture failed:`, error.message);
        return {
            success: false,
            error: error.message,
            authUrl: null,
            segments: []
        };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = {
    captureChannelAuth
};