const express = require('express');
const axios = require('axios');
const { captureChannelAuth } = require('./capture-auth-ultra-fast');

class StreamProxy {
    constructor(port = 3001) {
        this.app = express();
        this.port = port;
        this.channelCache = new Map(); // Cache auth URLs and segments
        this.activeChannels = new Set(); // Track which channels are being used
        this.setupRoutes();
        
        // Pre-warm popular channels
        this.preWarmChannels();
        
        // Start background refresh for all active channels
        this.startBackgroundRefresh();
    }

    // Background refresh for all active channels every 8 seconds
    startBackgroundRefresh() {
        setInterval(async () => {
            const now = Date.now();
            const channelsToRefresh = [];
            
            // Find channels that need refresh (older than 8 seconds or active)
            for (const [channelId, authInfo] of this.channelCache.entries()) {
                if (this.activeChannels.has(channelId) || (now - authInfo.timestamp) > 8000) {
                    channelsToRefresh.push(channelId);
                }
            }
            
            // Refresh channels in parallel (max 3 at once)
            const refreshPromises = channelsToRefresh.slice(0, 3).map(async (channelId) => {
                try {
                    const authResult = await captureChannelAuth(channelId);
                    if (authResult.success) {
                        this.channelCache.set(channelId, {
                            authUrl: authResult.authUrl,
                            segments: authResult.segments,
                            m3u8Content: authResult.m3u8Content,
                            timestamp: Date.now()
                        });
                        console.log(`🔄 [BG] Refreshed active channel ${channelId}`);
                    }
                } catch (e) {
                    console.log(`⚠️ [BG] Failed to refresh channel ${channelId}: ${e.message}`);
                }
            });
            
            await Promise.all(refreshPromises);
            
        }, 8000); // Every 8 seconds
    }

    // Pre-warm popular channels for instant access
    async preWarmChannels() {
        const popularChannels = ['179', '87', '102', '106', '44']; // Canal J, TF1, M6, Canal+, Bein Sport 1
        
        setTimeout(async () => {
            console.log('🔥 Pre-warming popular channels...');
            for (const channelId of popularChannels) {
                try {
                    const authResult = await captureChannelAuth(channelId);
                    if (authResult.success) {
                        this.channelCache.set(channelId, {
                            authUrl: authResult.authUrl,
                            segments: authResult.segments,
                            timestamp: Date.now()
                        });
                        console.log(`🔥 Pre-warmed channel ${channelId}`);
                    }
                } catch (e) {
                    console.log(`⚠️ Failed to pre-warm channel ${channelId}`);
                }
                await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay between pre-warms
            }
        }, 2000); // Start pre-warming after 2 seconds
    }

    setupRoutes() {
        // Serve custom M3U8 playlist for a channel
        this.app.get('/stream/:channelId/playlist.m3u8', async (req, res) => {
            try {
                const channelId = req.params.channelId;
                console.log(`📺 M3U8 playlist requested for channel ${channelId}`);
                
                // Mark channel as active
                this.activeChannels.add(channelId);
                
                // Get or update auth info for this channel
                let authInfo = this.channelCache.get(channelId);
                const now = Date.now();
                
                // Refresh auth if it's older than 12 seconds or doesn't exist
                if (!authInfo || (now - authInfo.timestamp) > 12000) {
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
                
                // Serve the M3U8 content directly from the auth response
                const m3u8Content = authInfo.m3u8Content || this.createM3U8Playlist(authInfo.segments);
                
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

        // Proxy /hls/ segment requests directly
        this.app.get('/hls/:segmentFile', async (req, res) => {
            try {
                const segmentFile = req.params.segmentFile;
                const channelMatch = segmentFile.match(/(\d+)_/);
                const channelId = channelMatch ? channelMatch[1] : null;
                
                if (!channelId) {
                    throw new Error('Could not extract channel ID from segment');
                }
                
                console.log(`📹 HLS segment requested: ${segmentFile} for channel ${channelId}`);
                
                // Mark channel as active
                this.activeChannels.add(channelId);
                
                // Get current auth info for this channel
                let authInfo = this.channelCache.get(channelId);
                const now = Date.now();
                
                // Refresh auth if it's older than 5 seconds or doesn't exist (very aggressive for segments)
                if (!authInfo || (now - authInfo.timestamp) > 5000) {
                    console.log(`🔄 Refreshing auth for segment request: ${segmentFile}`);
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
                    console.log(`✅ Auth refreshed for segment ${segmentFile}`);
                }
                
                // Find the segment URL that matches the requested segment
                let segmentUrl = authInfo.segments.find(seg => seg.includes(segmentFile));
                
                // If segment not found, try to find a nearby segment or use latest
                if (!segmentUrl) {
                    console.log(`⚠️ Segment ${segmentFile} not found, trying nearby segments`);
                    
                    // Extract segment number and try nearby ones
                    const segmentMatch = segmentFile.match(/(\d+)_(\d+)/);
                    if (segmentMatch) {
                        const channelNum = segmentMatch[1];
                        const segmentNum = parseInt(segmentMatch[2]);
                        
                        // Try ±2 range
                        for (let offset = 0; offset <= 2; offset++) {
                            for (let direction of [1, -1]) {
                                if (offset === 0 && direction === -1) continue;
                                const nearbySegmentNum = segmentNum + (offset * direction);
                                const nearbySegmentName = `${channelNum}_${nearbySegmentNum}.ts`;
                                segmentUrl = authInfo.segments.find(seg => seg.includes(nearbySegmentName));
                                if (segmentUrl) {
                                    console.log(`🔄 Found nearby segment ${nearbySegmentName}`);
                                    break;
                                }
                            }
                            if (segmentUrl) break;
                        }
                    }
                    
                    // If still not found, use latest segment
                    if (!segmentUrl && authInfo.segments.length > 0) {
                        segmentUrl = authInfo.segments[authInfo.segments.length - 1];
                        console.log(`🔄 Using latest segment as fallback`);
                    }
                }
                
                if (!segmentUrl) {
                    throw new Error(`No segments available for channel ${channelId}`);
                }
                
                console.log(`📡 Proxying segment: ${segmentUrl.substring(0, 100)}...`);
                
                // Proxy the segment request
                const response = await axios.get(segmentUrl, {
                    responseType: 'stream',
                    timeout: 3000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': `https://fstv.fun/player/fsplayer.php?id=${channelId}`
                    }
                });
                
                // Forward headers
                res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-cache');
                
                // Pipe the video data
                response.data.pipe(res);
                
                console.log(`✅ Successfully served segment ${segmentFile} for channel ${channelId}`);
                
            } catch (error) {
                console.error(`❌ Error serving segment ${req.params.segmentFile}:`, error.message);
                res.status(404).send('Segment not found');
            }
        });

        // Legacy segment proxy (for backwards compatibility)
        this.app.get('/segment/:channelId/:segmentName', async (req, res) => {
            // Redirect to new /hls/ endpoint
            res.redirect(`/hls/${req.params.segmentName}`);
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'ok', 
                cachedChannels: Array.from(this.channelCache.keys()),
                activeChannels: Array.from(this.activeChannels),
                timestamp: new Date().toISOString()
            });
        });

        // Cleanup inactive channels periodically
        setInterval(() => {
            const now = Date.now();
            const inactiveChannels = [];
            
            // Find channels inactive for more than 5 minutes
            for (const [channelId, authInfo] of this.channelCache.entries()) {
                if (!this.activeChannels.has(channelId) && (now - authInfo.timestamp) > 300000) {
                    inactiveChannels.push(channelId);
                }
            }
            
            // Remove inactive channels
            inactiveChannels.forEach(channelId => {
                this.channelCache.delete(channelId);
                console.log(`🧹 Cleaned up inactive channel ${channelId}`);
            });
            
            // Clean up active channels set if they haven't been requested recently
            const channelsToRemove = [];
            for (const channelId of this.activeChannels) {
                const authInfo = this.channelCache.get(channelId);
                if (!authInfo || (now - authInfo.timestamp) > 60000) { // 1 minute
                    channelsToRemove.push(channelId);
                }
            }
            
            channelsToRemove.forEach(channelId => {
                this.activeChannels.delete(channelId);
                console.log(`🧹 Removed from active channels: ${channelId}`);
            });
            
        }, 60000); // Every minute
    }

    createM3U8Playlist(segments) {
        let playlist = '#EXTM3U\n';
        playlist += '#EXT-X-VERSION:3\n';
        playlist += '#EXT-X-TARGETDURATION:10\n';
        playlist += '#EXT-X-MEDIA-SEQUENCE:0\n';
        
        // Keep the last 4 segments for faster startup
        const recentSegments = segments.slice(-4);
        recentSegments.forEach((segmentUrl) => {
            // Extract segment name from URL
            const segmentName = segmentUrl.split('/').pop().split('?')[0];
            playlist += '#EXTINF:10.0,\n';
            playlist += `/hls/${segmentName}\n`;
        });
        return playlist;
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🚀 Ultra-fast stream proxy server running on port ${this.port}`);
            console.log(`📺 Playlist URL format: http://localhost:${this.port}/stream/{channelId}/playlist.m3u8`);
        });
    }
}

// Export for use in other modules
module.exports = StreamProxy;

// Start server if run directly
if (require.main === module) {
    const proxy = new StreamProxy();
    proxy.start();
}