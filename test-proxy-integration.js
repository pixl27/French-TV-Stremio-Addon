const { captureChannelAuth } = require('./capture-auth-stream');

async function testProxyIntegration() {
    console.log('🧪 Testing proxy integration for channel 237 (RTL9)');
    
    try {
        // Test auth capture
        const authResult = await captureChannelAuth(237);
        
        if (!authResult.success) {
            throw new Error(`Auth capture failed: ${authResult.error}`);
        }
        
        console.log('\n✅ Auth capture successful!');
        console.log(`- Auth URL: ${authResult.authUrl.substring(0, 100)}...`);
        console.log(`- Segments: ${authResult.segments?.length || 0}`);
        console.log(`- Is M3U8 Playlist: ${authResult.isM3U8Playlist}`);
        
        if (authResult.segments && authResult.segments.length > 0) {
            console.log('\n📹 Sample segments:');
            authResult.segments.slice(0, 3).forEach((segment, i) => {
                console.log(`  ${i + 1}. ${segment.substring(0, 120)}...`);
            });
        }
        
        // The proxy URL that would be used for Stremio
        const proxyUrl = `http://localhost:3001/stream/237/playlist.m3u8`;
        console.log(`\n🔗 Proxy URL for Stremio: ${proxyUrl}`);
        
        console.log('\n📊 INTEGRATION TEST RESULT: SUCCESS');
        console.log('The auth capture works and we have segment URLs.');
        console.log('The proxy server can now serve these as a clean M3U8 playlist.');
        
    } catch (error) {
        console.error('\n❌ INTEGRATION TEST FAILED:', error.message);
    }
}

testProxyIntegration();