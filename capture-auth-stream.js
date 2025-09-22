const puppeteer = require('puppeteer');
const axios = require('axios');

/**
 * Captures the auth URL for a channel and extra        // Wait for auth requests to complete
        console.log('⏳ Waiting for auth requests...');
        await new Promise(resolve => setTimeout(resolve, 5000));
 * @param {number} playerId - The channel ID to capture auth for
 * @returns {Promise<{authUrl: string, streamUrl: string, segments: string[]}>} - The auth URL and parsed stream info
 */
async function captureChannelAuth(playerId) {
    console.log(`🚀 Capturing auth for channel ID ${playerId}`);
    
    let browser = null;
    const capturedAuthUrls = [];
    const allRequests = [];
    
    try {
        // Launch browser
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-images',
                '--disable-javascript',
                '--disable-plugins'
            ]
        });
        
        const page = await browser.newPage();
        
        // Set up request/response interception
        await page.setRequestInterception(true);
        
        page.on('request', (request) => {
            const url = request.url();
            
            // Log all streaming-related requests
            if (url.includes('iptv2.french-live.lol') && 
                (url.includes('.m3u8') || url.includes('.ts'))) {
                console.log(`🔍 REQUEST: ${request.method()} ${url}`);
                allRequests.push({
                    type: 'request',
                    method: request.method(),
                    url: url
                });
            }
            
            request.continue();
        });
        
        page.on('response', async (response) => {
            const url = response.url();
            
            // Capture auth URLs (M3U8 playlists)
            if (url.includes('iptv2.french-live.lol/auth/') && url.includes('.m3u8')) {
                console.log(`🎯 AUTH URL CAPTURED: ${url}`);
                capturedAuthUrls.push(url);
                
                // Try to get the M3U8 content to find segments
                try {
                    const m3u8Content = await response.text();
                    if (m3u8Content && m3u8Content.includes('#EXTM3U')) {
                        console.log(`📋 M3U8 playlist content found!`);
                        console.log(`📋 First 500 chars: ${m3u8Content.substring(0, 500)}`);
                        
                        // Extract segment URLs
                        const lines = m3u8Content.split('\n');
                        const segments = [];
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('.ts')) {
                                segments.push(trimmed);
                            }
                        }
                        console.log(`📺 Found ${segments.length} segments in M3U8`);
                        if (segments.length > 0) {
                            console.log(`📹 Sample segments:`);
                            segments.slice(0, 3).forEach((seg, i) => {
                                console.log(`  ${i + 1}. ${seg}`);
                            });
                        }
                    }
                } catch (e) {
                    console.log(`⚠️ Could not read M3U8 content: ${e.message}`);
                }
                
                allRequests.push({
                    type: 'response',
                    status: response.status(),
                    url: url,
                    contentType: response.headers()['content-type']
                });
            }
            
            // Capture segment URLs (.ts files)
            if (url.includes('iptv2.french-live.lol/hls/') && url.includes('.ts')) {
                console.log(`🎬 SEGMENT URL: ${url}`);
                allRequests.push({
                    type: 'segment',
                    status: response.status(),
                    url: url,
                    contentType: response.headers()['content-type']
                });
            }
            
            // Log other streaming responses
            if (url.includes('iptv2.french-live.lol') && 
                (url.includes('.m3u8') || url.includes('.ts')) && 
                !url.includes('/auth/') && !url.includes('/hls/')) {
                console.log(`📥 RESPONSE: ${response.status()} ${url}`);
                allRequests.push({
                    type: 'response',
                    status: response.status(),
                    url: url
                });
            }
        });
        
        // Step 1: Load the player page to trigger auth
        const playerUrl = `https://fstv.fun/player/fsplayer.php?id=${playerId}`;
        console.log(`📺 Loading player page: ${playerUrl}`);
        
        await page.goto(playerUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        // Wait for auth requests to complete
        console.log('⏳ Waiting for auth requests...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        if (capturedAuthUrls.length === 0) {
            throw new Error('No auth URLs captured');
        }
        
        // Use the latest auth URL (most recent token)
        const authUrl = capturedAuthUrls[capturedAuthUrls.length - 1];
        console.log(`🎯 Using auth URL: ${authUrl}`);
        
        // Step 2: Fetch the M3U8 playlist from the auth URL
        console.log(`📡 Fetching M3U8 playlist with proper headers...`);
        const response = await axios.get(authUrl, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/vnd.apple.mpegurl,text/plain,*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': `https://fstv.fun/player/fsplayer.php?id=${playerId}`
            },
            responseType: 'text'
        });
        
        if (response.status !== 200) {
            throw new Error(`Failed to fetch M3U8: ${response.status}`);
        }
        
        console.log(`📋 Response headers:`, response.headers);
        console.log(`📋 Content-Type:`, response.headers['content-type']);
        
        const m3u8Content = response.data;
        console.log(`📋 Response type:`, typeof m3u8Content);
        console.log(`📋 Response length:`, m3u8Content.length || 'undefined');
        
        // Check if it's actually an M3U8 text playlist or binary data
        if (typeof m3u8Content === 'string') {
            console.log(`📋 M3U8 Content (first 500 chars):\n${m3u8Content.substring(0, 500)}`);
        } else {
            console.log(`📋 Binary content detected, not a text M3U8 playlist`);
            console.log(`📋 First 100 bytes as string: ${m3u8Content.toString().substring(0, 100)}`);
        }
        
        // Step 3: Parse the response and extract full segment URLs
        if (typeof m3u8Content === 'string' && m3u8Content.includes('#EXTM3U')) {
            // This is a proper M3U8 playlist!
            console.log(`🎯 M3U8 playlist detected!`);
            const segments = [];
            const lines = m3u8Content.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('.ts')) {
                    // Convert relative paths to full URLs
                    const fullSegmentUrl = trimmed.startsWith('/') 
                        ? `https://iptv2.french-live.lol${trimmed}`
                        : trimmed;
                    segments.push(fullSegmentUrl);
                }
            }
            
            console.log(`🎬 Found ${segments.length} segments in playlist`);
            if (segments.length > 0) {
                console.log(`📹 First segment: ${segments[0]}`);
                console.log(`📹 Last segment: ${segments[segments.length - 1]}`);
                
                // For now, return the first segment URL as the stream URL
                // Note: This will only play ~10 seconds, but it avoids the ad protection
                const firstSegmentUrl = segments[0];
                console.log(`🎯 Using first segment as stream URL: ${firstSegmentUrl.substring(0, 100)}...`);
                
                return {
                    success: true,
                    authUrl: authUrl,
                    streamUrl: firstSegmentUrl, // Use segment URL instead of M3U8
                    segments: segments,
                    m3u8Content: m3u8Content,
                    isDirectStream: false,
                    isM3U8Playlist: true,
                    segmentBased: true,
                    totalRequests: allRequests.length,
                    capturedAuthCount: capturedAuthUrls.length
                };
            } else {
                throw new Error('No segments found in M3U8 playlist');
            }
        } else if (typeof m3u8Content !== 'string' || !m3u8Content.includes('#EXTM3U')) {
            // This is not a text M3U8 playlist, it's the actual stream URL
            console.log(`🎯 Direct stream URL detected (not a playlist)`);
            return {
                success: true,
                authUrl: authUrl,
                streamUrl: authUrl, // The auth URL IS the stream URL
                segments: [], // No segments, it's a direct stream
                m3u8Content: null,
                isDirectStream: true,
                isM3U8Playlist: false,
                segmentBased: false,
                totalRequests: allRequests.length,
                capturedAuthCount: capturedAuthUrls.length
            };
        }
        
        return {
            success: true,
            authUrl: authUrl,
            streamUrl: authUrl, // The M3U8 URL itself is the stream URL
            segments: segments,
            m3u8Content: m3u8Content,
            isDirectStream: false,
            isM3U8Playlist: true,
            totalRequests: allRequests.length,
            capturedAuthCount: capturedAuthUrls.length
        };
        
    } catch (error) {
        console.error(`❌ Error capturing auth for channel ${playerId}:`, error.message);
        return {
            success: false,
            error: error.message,
            authUrl: null,
            streamUrl: null,
            segments: [],
            capturedAuthCount: capturedAuthUrls.length
        };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Batch capture auth URLs for multiple channels
 * @param {number[]} channelIds - Array of channel IDs to process
 * @returns {Promise<Object>} - Results for all channels
 */
async function captureMultipleChannels(channelIds) {
    console.log(`🚀 Starting batch capture for ${channelIds.length} channels`);
    
    const results = {};
    const startTime = Date.now();
    
    for (let i = 0; i < channelIds.length; i++) {
        const channelId = channelIds[i];
        console.log(`\n📺 Processing channel ${i + 1}/${channelIds.length}: ID ${channelId}`);
        
        const result = await captureChannelAuth(channelId);
        results[channelId] = result;
        
        if (result.success) {
            console.log(`✅ Channel ${channelId}: Success - ${result.segments.length} segments`);
        } else {
            console.log(`❌ Channel ${channelId}: Failed - ${result.error}`);
        }
        
        // Small delay between channels to be respectful
        if (i < channelIds.length - 1) {
            console.log('⏳ Waiting 2 seconds before next channel...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    const successful = Object.values(results).filter(r => r.success).length;
    const failed = channelIds.length - successful;
    
    console.log(`\n📊 BATCH RESULTS:`);
    console.log(`Total channels: ${channelIds.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
    
    return results;
}

// Test if run directly
if (require.main === module) {
    async function test() {
        console.log('🧪 Testing auth capture with channel 237 (RTL9)');
        
        const result = await captureChannelAuth(237);
        
        if (result.success) {
            console.log('\n✅ SUCCESS!');
            console.log(`Auth URL: ${result.authUrl}`);
            console.log(`Segments found: ${result.segments.length}`);
        } else {
            console.log('\n❌ FAILED!');
            console.log(`Error: ${result.error}`);
        }
    }
    
    test().catch(console.error);
}

module.exports = {
    captureChannelAuth,
    captureMultipleChannels
};