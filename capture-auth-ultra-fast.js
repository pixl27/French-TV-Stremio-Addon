const axios = require('axios');
const puppeteer = require('puppeteer');

/**
 * Ultra-fast auth capture with API-first approach
 */
class UltraFastAuthCapture {
    constructor() {
        this.browser = null;
        this.page = null;
        this.authCache = new Map(); // Cache auth URLs for 30 seconds
    }

    async init() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-images',
                    '--disable-javascript',
                    '--disable-plugins',
                    '--disable-extensions',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--no-first-run',
                    '--no-default-browser-check'
                ]
            });
            
            this.page = await this.browser.newPage();
            await this.page.setRequestInterception(true);
            
            // Setup request interception once
            this.page.on('request', (request) => {
                const url = request.url();
                
                if (url.includes('iptv2.french-live.lol/auth/') && url.includes('.m3u8')) {
                    const channelId = this.extractChannelId(url);
                    if (channelId) {
                        this.authCache.set(channelId, {
                            url: url,
                            timestamp: Date.now()
                        });
                        console.log(`⚡ Cached auth for channel ${channelId}`);
                    }
                }
                
                request.continue();
            });
        }
    }

    extractChannelId(url) {
        const match = url.match(/auth\/(\d+)\.m3u8/);
        return match ? match[1] : null;
    }

    async captureAuthUltraFast(playerId) {
        console.log(`⚡ Ultra-fast auth for channel ${playerId}`);
        const startTime = Date.now();
        
        try {
            // Check cache first (30 second validity)
            const cached = this.authCache.get(playerId);
            if (cached && (Date.now() - cached.timestamp) < 30000) {
                console.log(`🚀 Using cached auth (${Date.now() - startTime}ms)`);
                return await this.fetchSegmentsFromAuth(cached.url);
            }

            // Try direct API approach first (fastest)
            try {
                const directAuth = await this.tryDirectAPI(playerId);
                if (directAuth.success) {
                    console.log(`🚀 Direct API success (${Date.now() - startTime}ms)`);
                    return directAuth;
                }
            } catch (e) {
                console.log(`⚠️ Direct API failed, using browser`);
            }

            // Fallback to browser approach with shared page
            await this.init();
            
            const playerUrl = `https://fstv.fun/player/fsplayer.php?id=${playerId}`;
            
            // Race condition: navigate and wait for auth or timeout
            const authPromise = new Promise((resolve) => {
                const checkAuth = () => {
                    const cached = this.authCache.get(playerId);
                    if (cached && (Date.now() - cached.timestamp) < 5000) {
                        resolve(cached.url);
                    } else {
                        setTimeout(checkAuth, 100);
                    }
                };
                setTimeout(checkAuth, 100);
            });

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 3000)
            );

            // Navigate and race for auth
            this.page.goto(playerUrl, { 
                waitUntil: 'domcontentloaded', 
                timeout: 3000 
            }).catch(() => {}); // Ignore navigation errors

            const authUrl = await Promise.race([authPromise, timeoutPromise]);
            
            console.log(`🚀 Browser auth success (${Date.now() - startTime}ms)`);
            return await this.fetchSegmentsFromAuth(authUrl);

        } catch (error) {
            console.log(`❌ Ultra-fast auth failed (${Date.now() - startTime}ms):`, error.message);
            return { success: false, error: error.message };
        }
    }

    async tryDirectAPI(playerId) {
        // Try to get auth URL directly from known patterns
        const directUrl = `https://iptv2.french-live.lol/live/70013B23F3440093B75C4C8CF5C5C84D/${playerId}.m3u8`;
        
        const response = await axios.get(directUrl, {
            timeout: 2000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': `https://fstv.fun/player/fsplayer.php?id=${playerId}`
            }
        });

        // If we get a redirect or auth URL, use it
        if (response.request.res.responseUrl && response.request.res.responseUrl.includes('auth')) {
            return await this.fetchSegmentsFromAuth(response.request.res.responseUrl);
        }

        throw new Error('No direct auth found');
    }

    async fetchSegmentsFromAuth(authUrl) {
        try {
            const response = await axios.get(authUrl, {
                timeout: 2000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://fstv.fun/'
                }
            });

            const m3u8Content = response.data;
            if (!m3u8Content.includes('#EXTM3U')) {
                throw new Error('Invalid M3U8 content');
            }

            // Extract segments quickly
            const segments = [];
            const lines = m3u8Content.split('\n');
            const baseUrl = 'https://iptv2.french-live.lol';
            
            for (const line of lines) {
                if (line.startsWith('/hls/') && line.includes('.ts')) {
                    segments.push(baseUrl + line);
                }
            }

            console.log(`📺 Found ${segments.length} segments`);
            
            return {
                success: true,
                authUrl: authUrl,
                segments: segments,
                m3u8Content: m3u8Content
            };

        } catch (error) {
            throw new Error(`Failed to fetch segments: ${error.message}`);
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

// Singleton instance
const ultraFastCapture = new UltraFastAuthCapture();

async function captureChannelAuth(playerId) {
    return await ultraFastCapture.captureAuthUltraFast(playerId);
}

module.exports = { captureChannelAuth, ultraFastCapture };