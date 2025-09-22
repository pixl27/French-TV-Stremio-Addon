const express = require('express');
const axios = require('axi                // Refresh auth if it's older than 20 seconds or doesn't exist
                if (!authInfo || (n                // Refresh auth if it's older than 5 seconds or doesn't exist
                if (!authInfow - authInfo.time || (now - authInfo.timestamp) > 20000) {tamp) > 5000) {');
const { captureChannelAuth } = require('./capture-auth-ultra-fast');

class StreamProxy {
    constructor(port = 3001) {
        this.app = express();
        this.port = port;
        this.channelCache = new Map(); // Cache auth URLs and segments
        this.refreshIntervals = new Map(); // Track refresh timers
        this.setupRoutes();
    }

    // Start pre-emptive auth refresh for a channel
    startPreemptiveRefresh(channelId) {
        if (this.refreshIntervals.has(channelId)) {
            return; // Already running
        }
        
        console.log(`🔄 Starting pre-emptive refresh for channel ${channelId}`);
        const interval = setInterval(async () => {
            try {
                const authResult = await captureChannelAuth(channelId);
                if (authResult.success) {
                    this.channelCache.set(channelId, {
                        authUrl: authResult.authUrl,
                        segments: authResult.segments,
                        m3u8Content: authResult.m3u8Content,
                        timestamp: Date.now()
                    });
                    console.log(`✅ Pre-emptive refresh completed for channel ${channelId}`);
                }
            } catch (e) {
                console.log(`⚠️ Pre-emptive refresh failed for channel ${channelId}: ${e.message}`);
            }
        }, 12000); // Refresh every 12 seconds
        
        this.refreshIntervals.set(channelId, interval);
    }
    
    stopPreemptiveRefresh(channelId) {
        const interval = this.refreshIntervals.get(channelId);
        if (interval) {
            clearInterval(interval);
            this.refreshIntervals.delete(channelId);
            console.log(`🛑 Stopped pre-emptive refresh for channel ${channelId}`);
        }
    }

    setupRoutes() {
        // Serve custom M3U8 playlist for a channel
        this.app.get('/stream/:channelId/playlist.m3u8', async (req, res) => {
            try {
                const channelId = req.params.channelId;
                console.log(`📺 M3U8 playlist requested for channel ${channelId}`);
                
                // Start pre-emptive refresh for this channel
                this.startPreemptiveRefresh(channelId);
                
                // Get or update auth info for this channel
                let authInfo = this.channelCache.get(channelId);
                const now = Date.now();
                
                // Refresh auth if it's older than 15 seconds or doesn't exist
                if (!authInfo || (now - authInfo.timestamp) > 15000) {
                    console.log(`🔄 Refreshing auth for channel ${channelId}...`);
                    const authResult = await captureChannelAuth(channelId);
                    
                    if (!authResult.success) {
                        throw new Error(`Failed to capture auth: ${authResult.error}`);
                    }
                    
                    authInfo = {
                        authUrl: authResult.authUrl,
                        segments: authResult.segments,
                        m3u8Content: authResult.m3u8Content,
                        timestamp: now
                    };
                    
                    this.channelCache.set(channelId, authInfo);
                    console.log(`✅ Auth refreshed for channel ${channelId}`);
                }
                
                // Serve the original M3U8 content from the website (with /hls/ paths)
                let m3u8Content = authInfo.m3u8Content;
                if (!m3u8Content) {
                    // Fallback: create a playlist
                    m3u8Content = this.createM3U8Playlist(authInfo.segments);
                }
                
                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-cache');
                res.send(m3u8Content);
                
                console.log(`📤 Served M3U8 playlist for channel ${channelId} with ${authInfo.segments.length} segments`);
                
            } catch (error) {
                console.error(`❌ Error serving playlist for channel ${req.params.channelId}:`, error.message);
                res.status(500).send('Internal Server Error');
            }
        });

        // Direct proxy for /hls/ paths (like real website)
        this.app.get('/hls/:segmentName', async (req, res) => {
            const segmentName = req.params.segmentName;
            // Extract channel ID from segment name (e.g., 179_10.ts -> 179)
            const match = segmentName.match(/^(\d+)_/);
            const channelId = match ? match[1] : 'unknown';
            
            return this.handleSegmentRequest(channelId, segmentName, req, res);
        });
        
        // Proxy individual segment requests
        this.app.get('/segment/:channelId/:segmentName', async (req, res) => {
            const { channelId, segmentName } = req.params;
            return this.handleSegmentRequest(channelId, segmentName, req, res);
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'ok', 
                cachedChannels: Array.from(this.channelCache.keys()),
                timestamp: new Date().toISOString()
            });
        });
    }
    
    async handleSegmentRequest(channelId, segmentName, req, res) {
        try {
            console.log(`📹 Segment requested: ${segmentName} for channel ${channelId}`);
            
            // Get current auth info for this channel
            let authInfo = this.channelCache.get(channelId);
            const now = Date.now();
            
            // Refresh auth if it's older than 5 seconds or doesn't exist
            if (!authInfo || (now - authInfo.timestamp) > 5000) {
                console.log(`🔄 Refreshing auth for segment request: ${segmentName}`);
                const authResult = await captureChannelAuth(channelId);
                
                if (!authResult.success) {
                    throw new Error(`Failed to capture auth for segment: ${authResult.error}`);
                }
                
                authInfo = {
                    authUrl: authResult.authUrl,
                    segments: authResult.segments,
                    m3u8Content: authResult.m3u8Content,
                    timestamp: now
                };
                
                this.channelCache.set(channelId, authInfo);
                console.log(`✅ Auth refreshed for segment ${segmentName}`);
            }
            
            // Find the segment URL that matches the requested segment name
            let segmentUrl = authInfo.segments.find(seg => seg.includes(segmentName));
            
            // If segment not found, try to find a nearby segment or refresh auth
            if (!segmentUrl) {
                console.log(`⚠️ Segment ${segmentName} not found in cache`);
                
                // Extract segment number from requested segment name (e.g., 179_290 -> 290)
                const segmentMatch = segmentName.match(/(\d+)_(\d+)/);
                if (segmentMatch) {
                    const channelNum = segmentMatch[1];
                    const segmentNum = parseInt(segmentMatch[2]);
                    
                    // Try to find nearby segments (±2 range)
                    for (let offset = 0; offset <= 2; offset++) {
                        for (let direction of [1, -1]) {
                            if (offset === 0 && direction === -1) continue; // Skip -0
                            const nearbySegmentNum = segmentNum + (offset * direction);
                            const nearbySegmentName = `${channelNum}_${nearbySegmentNum}.ts`;
                            segmentUrl = authInfo.segments.find(seg => seg.includes(nearbySegmentName));
                            if (segmentUrl) {
                                console.log(`🔄 Found nearby segment ${nearbySegmentName} instead of ${segmentName}`);
                                break;
                            }
                        }
                        if (segmentUrl) break;
                    }
                }
                
                // If still no segment found, refresh auth and try again
                if (!segmentUrl) {
                    console.log(`🔄 No nearby segments found, refreshing auth for ${segmentName}`);
                    const authResult = await captureChannelAuth(channelId);
                    
                    if (authResult.success) {
                        authInfo = {
                            authUrl: authResult.authUrl,
                            segments: authResult.segments,
                            m3u8Content: authResult.m3u8Content,
                            timestamp: Date.now()
                        };
                        this.channelCache.set(channelId, authInfo);
                        
                        // Try to find the segment again in fresh data
                        segmentUrl = authInfo.segments.find(seg => seg.includes(segmentName));
                        
                        // If still not found, use the latest segment
                        if (!segmentUrl && authInfo.segments.length > 0) {
                            console.log(`🔄 Using latest segment after refresh`);
                            segmentUrl = authInfo.segments[authInfo.segments.length - 1];
                        }
                    }
                }
            }
            
            // If still no segment found, it means the auth failed or no segments available
            if (!segmentUrl) {
                console.log(`❌ No segments available for channel ${channelId}, segment ${segmentName}`);
                throw new Error(`No segments available for channel ${channelId}`);
            }
            
            console.log(`📡 Proxying segment: ${segmentUrl.substring(0, 100)}...`);
            
            // Proxy the segment request with optimized settings
            const response = await axios.get(segmentUrl, {
                responseType: 'stream',
                timeout: 3000, // Reduced timeout
                maxRedirects: 2,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': `https://fstv.fun/player/fsplayer.php?id=${channelId}`,
                    'Connection': 'keep-alive'
                }
            });
            
            // Forward headers
            res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            
            // Pipe the video data
            response.data.pipe(res);
            
            console.log(`✅ Successfully served segment ${segmentName} for channel ${channelId}`);
            
        } catch (error) {
            console.error(`❌ Error serving segment ${segmentName}:`, error.message);
            res.status(404).send('Segment not found');
        }
    }

    createM3U8Playlist(segments) {
        // Fallback: create a simple playlist if we don't have the original
        let playlist = '#EXTM3U\n';
        playlist += '#EXT-X-VERSION:3\n';
        playlist += '#EXT-X-TARGETDURATION:10\n';
        playlist += '#EXT-X-MEDIA-SEQUENCE:0\n';
        playlist += '#EXT-X-ALLOW-CACHE:YES\n';
        
        // Keep only the last 6 segments for better responsiveness
        const recentSegments = segments.slice(-6);
        recentSegments.forEach((segmentUrl, index) => {
            // Extract segment name from URL and convert to relative path like the real site
            const relativeSegmentPath = segmentUrl.replace('https://iptv2.french-live.lol', '');
            playlist += '#EXTINF:10.0,\n';
            playlist += `${relativeSegmentPath}\n`;
        });
        return playlist;
    }

    getChannelIdFromSegment(segmentUrl) {
        // Extract channel ID from segment URL pattern: /hls/237_xxx.ts
        const match = segmentUrl.match(/\/hls\/(\d+)_/);
        return match ? match[1] : 'unknown';
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🚀 Stream proxy server running on port ${this.port}`);
            console.log(`📺 Playlist URL format: http://localhost:${this.port}/stream/{channelId}/playlist.m3u8`);
        });
    }
    
    stop() {
        // Clean up all refresh intervals
        for (const [channelId, interval] of this.refreshIntervals) {
            clearInterval(interval);
        }
        this.refreshIntervals.clear();
        console.log('🛑 All refresh intervals stopped');
    }
}

// Export for use in other modules
module.exports = StreamProxy;

// Start server if run directly
if (require.main === module) {
    const proxy = new StreamProxy();
    proxy.start();
}