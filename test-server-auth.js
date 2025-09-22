const axios = require('axios');

async function testServerAndAuth() {
    console.log('🧪 Testing server and auth interception...');
    console.log('📡 Requesting playlist for channel 237 (RTL9)...');
    
    try {
        // Request the M3U8 playlist - this should trigger auth capture
        const response = await axios.get('http://localhost:3001/stream/237/playlist.m3u8', {
            timeout: 120000, // 2 minutes timeout for auth capture
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/vnd.apple.mpegurl,*/*'
            }
        });
        
        console.log('\n✅ SUCCESS! Got response from proxy server:');
        console.log(`- Status: ${response.status}`);
        console.log(`- Content-Type: ${response.headers['content-type']}`);
        console.log(`- Content Length: ${response.data.length} characters`);
        
        if (response.data.includes('#EXTM3U')) {
            console.log('\n🎯 Valid M3U8 playlist received!');
            console.log('\n📋 Playlist content:');
            console.log(response.data);
            
            // Count proxy segments
            const lines = response.data.split('\n');
            const segments = lines.filter(line => 
                line.trim() && !line.startsWith('#') && line.includes('/segment/')
            );
            
            console.log(`\n📺 Found ${segments.length} proxy segment URLs`);
            
            if (segments.length > 0) {
                console.log('\n🔗 Sample proxy segment URLs:');
                segments.slice(0, 3).forEach((segment, i) => {
                    console.log(`  ${i + 1}. ${segment}`);
                });
                
                console.log('\n🎉 LOCALHOST STREAMING TEST SUCCESSFUL!');
                console.log('✅ Server is running');
                console.log('✅ Auth interception worked');
                console.log('✅ M3U8 playlist generated with proxy URLs');
                console.log('✅ Ready for Stremio integration');
                
            } else {
                console.log('⚠️ No proxy segments found in playlist');
            }
            
        } else {
            console.log('\n❌ Invalid response - not an M3U8 playlist');
            console.log('Response:', response.data.substring(0, 500));
        }
        
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('💡 Server connection refused - server may not be running');
        } else if (error.code === 'ETIMEDOUT') {
            console.log('💡 Request timed out - auth capture may have failed');
        } else if (error.response) {
            console.log(`💡 Server responded with error: ${error.response.status}`);
            console.log('Response:', error.response.data);
        }
    }
}

testServerAndAuth();